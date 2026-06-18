import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { llmCheckLimiter } from "../middleware/rate-limit";
import { llmCheckConcurrencyGuard } from "../middleware/concurrency-guard";

const llmCheckRouter = Router();

function createOpenAIClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new OpenAI({ baseURL, apiKey });
}

function createAnthropicClient(): Anthropic | null {
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new Anthropic({ baseURL, apiKey });
}

export interface ProbeResult {
  question: string;
  model: string;
  response: string;
  mentioned: boolean;
  mentionContext: string | null;
  competitors: string[];
}

const RUNS_PER_QUESTION = 3;

const LEGAL_SUFFIXES = new Set([
  "ltd", "limited", "inc", "incorporated", "llc", "plc", "llp", "co", "company",
  "corp", "corporation", "group", "holdings", "gmbh", "sa", "ag", "pty", "io", "sas", "bv", "srl",
]);

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Brand identity bundle used to disambiguate short / acronym names (e.g. "SMG")
// from unrelated namesakes. The website domain and full legal name are the most
// reliable signals, so detection and the identity probe are anchored to them.
export interface BrandIdentity {
  name: string;
  legalName?: string;
  website?: string;
  descriptor?: string;
  sectors?: string[];
  // The entity the user explicitly confirmed is theirs from the entity-clarity
  // step (e.g. picked the right "SMG" from the namesakes). When set, it is the
  // authoritative answer to "which company is this", overriding the heuristic
  // match. Absent when the user has made no choice, so the deterministic
  // fallback behaviour is unchanged.
  confirmedEntity?: { name: string; description?: string } | null;
}

function asIdentity(brand: BrandIdentity | string): BrandIdentity {
  return typeof brand === "string" ? { name: brand } : brand;
}

export function brandAliases(companyName: string): string[] {
  const full = normalizeText(companyName);
  if (!full) return [];
  const tokens = full.split(" ").filter(Boolean);
  const core = tokens.filter((t) => !LEGAL_SUFFIXES.has(t));
  const aliases = new Set<string>();
  aliases.add(full);
  if (core.length) aliases.add(core.join(" "));
  if (core[0] && core[0].length >= 4) aliases.add(core[0]);
  return [...aliases].filter(Boolean);
}

function aliasRegex(alias: string): RegExp {
  const tokens = alias.split(" ").filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = tokens.join("[^a-z0-9]+");
  return new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`, "i");
}

// A "weak" alias is a single short token (<= 4 chars, e.g. an acronym like
// "SMG" or "BT"). On its own it is too ambiguous to credit, because unrelated
// companies share it, so it must be corroborated by a brand-specific signal.
function isWeakAlias(alias: string): boolean {
  const tokens = alias.split(" ").filter(Boolean);
  return tokens.length === 1 && tokens[0].length <= 4;
}

// Whether a brand name is an acronym or very short, and therefore prone to
// being confused with namesakes. Drives the extra anchoring on the identity
// probe and the corroboration requirement in detection.
export function isAmbiguousName(name: string): boolean {
  const trimmed = name.trim();
  if (/^[A-Za-z0-9]{2,6}$/.test(trimmed) && trimmed === trimmed.toUpperCase()) return true;
  const core = brandAliases(name)[0] || "";
  const tokens = core.split(" ").filter(Boolean);
  return tokens.length === 1 && tokens[0].length <= 5;
}

// The distinctive label of a website's domain, e.g.
// "https://www.shoppermediagroup.com/about" -> "shoppermediagroup". Used as a
// brand-specific corroboration signal that generic answers will not contain.
export function domainLabel(website?: string): string {
  if (!website) return "";
  let s = website.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#]/)[0];
  const parts = s.split(".").filter(Boolean);
  return parts[0] || "";
}

// Brand-specific phrases that, if present in a response, confirm a weak/acronym
// match really is the brand: the domain label and the multi-word legal name.
function corroborationSignals(identity: BrandIdentity): string[] {
  const sigs: string[] = [];
  const dl = domainLabel(identity.website);
  if (dl && dl.length >= 4) sigs.push(dl);
  if (identity.legalName) {
    // Use the FULL legal name only (including any "Group"/"Holdings"-style
    // suffix token). Stripping legal suffixes can collapse a name like
    // "Sports Media Group" to "sports media", which is just the sector and
    // would falsely corroborate any generic sector answer.
    const full = normalizeText(identity.legalName);
    if (full.includes(" ")) sigs.push(full);
  }
  return [...new Set(sigs)].filter(Boolean);
}

function isCorroborated(text: string, identity: BrandIdentity): boolean {
  const compact = normalizeText(text).replace(/\s+/g, "");
  for (const sig of corroborationSignals(identity)) {
    if (sig.includes(" ")) {
      if (aliasRegex(sig).test(text)) return true;
    } else if (aliasRegex(sig).test(text) || compact.includes(sig)) {
      return true;
    }
  }
  return false;
}

// All aliases used for detection: the probe name plus the FULL multi-word legal
// name. The legal name is used whole (not suffix-stripped), because stripping a
// "Group"/"Holdings"-style suffix can collapse it to a generic sector phrase
// (e.g. "Sports Media Group" -> "sports media") that matches unrelated answers.
function detectionAliases(identity: BrandIdentity): string[] {
  const nameAliases = brandAliases(identity.name);
  const legalAliases: string[] = [];
  if (identity.legalName) {
    const full = normalizeText(identity.legalName);
    if (full.includes(" ")) legalAliases.push(full);
  }
  return [...new Set([...nameAliases, ...legalAliases])];
}

export function isMentioned(text: string, brand: BrandIdentity | string): boolean {
  if (!text) return false;
  const identity = asIdentity(brand);
  const hasContext = corroborationSignals(identity).length > 0;
  for (const alias of detectionAliases(identity)) {
    if (!aliasRegex(alias).test(text)) continue;
    // A strong (multi-word or distinctive) alias is a confident match.
    if (!isWeakAlias(alias)) return true;
    // A weak acronym match only counts when we have no disambiguation context
    // (legacy behaviour) or when a brand-specific signal corroborates it, so an
    // unrelated namesake sharing the acronym is not credited as the brand.
    if (!hasContext || isCorroborated(text, identity)) return true;
  }
  return false;
}

export function normalizeCompetitor(name: string): string {
  const norm = normalizeText(name);
  if (!norm) return "";
  return norm.split(" ").filter((t) => t && !LEGAL_SUFFIXES.has(t)).join(" ");
}

// The direct/identity probe is the one query that names the brand. For acronym
// or very short names it is anchored to the brand's website, full legal name,
// descriptor and sector so the engine resolves the correct company instead of a
// generic namesake. Plain names get the original, unanchored question.
export function buildIdentityProbe(identity: BrandIdentity): string {
  const { name } = identity;
  const hasLegal = !!(identity.legalName && normalizeText(identity.legalName) !== normalizeText(name));
  const ambiguous = isAmbiguousName(name);
  const sector = (identity.sectors || []).map((s) => s.trim()).filter(Boolean)[0];
  const confirmedName = identity.confirmedEntity?.name?.trim();
  // A user-confirmed identity is a strong reason to anchor even when the name
  // looks plain, so the probe targets the exact company the user picked.
  const hasConfirmed = !!(confirmedName && normalizeText(confirmedName) !== normalizeText(name));

  if (!hasLegal && !identity.website && !ambiguous && !hasConfirmed) {
    return `What do you know about ${name}?`;
  }

  let q = `What do you know about ${name}`;
  if (hasLegal) q += ` (${identity.legalName})`;
  q += `?`;

  const anchor: string[] = [];
  if (hasConfirmed) {
    const desc = identity.confirmedEntity?.description?.split(/[.\n]/)[0].trim().slice(0, 160);
    anchor.push(`This refers specifically to ${confirmedName}${desc ? `, ${desc}` : ""}.`);
  }
  if (identity.website) anchor.push(`Its website is ${identity.website}.`);
  if (ambiguous && sector) anchor.push(`It operates in ${sector}.`);
  if (ambiguous && identity.descriptor) {
    const oneLine = identity.descriptor.split(/[.\n]/)[0].trim().slice(0, 160);
    if (oneLine) anchor.push(`${oneLine}.`);
  }
  if (anchor.length > 0) {
    q += ` ${anchor.join(" ")} Please answer specifically about this company, not other organisations with a similar name.`;
  }
  return q;
}

export function generateProbeQuestions(
  companyName: string,
  sectors: string[],
  keywords: string[],
  icp: string,
  location: string,
  persona: string,
  identity?: BrandIdentity,
): string[] {
  const questions: string[] = [];

  const uniqueSectors = [...new Set(sectors.map((s) => s.trim()).filter(Boolean))].slice(0, 3);
  const list = uniqueSectors.length > 0 ? uniqueSectors : ["the industry"];

  const hasIcp = icp.trim().length > 0;
  const hasLocation = location.trim().length > 0;
  const hasPersona = persona.trim().length > 0;
  // ICP-aware clauses steer the AI toward specialist/boutique providers that
  // serve a specific size and type of customer, rather than surfacing the big
  // household-name firms a generic "leading companies" question always returns.
  const forIcp = hasIcp ? ` for ${icp}` : "";
  const servingIcp = hasIcp ? ` serving ${icp}` : "";
  // Location is added as a clean qualifier because AI answers are heavily
  // localised; "the UK" is the neutral fallback used by the original probes.
  const inLocation = hasLocation ? ` in ${location}` : "";
  const place = hasLocation ? location : "the UK";

  questions.push(identity ? buildIdentityProbe({ ...identity, name: companyName }) : `What do you know about ${companyName}?`);

  const single = list.length === 1;
  for (const sector of list) {
    if (hasIcp) {
      questions.push(`Which companies provide ${sector} services${forIcp}?`);
      questions.push(`If ${icp} needed ${sector} support${inLocation}, which specialist or boutique firms would you recommend, and why?`);
      if (single) {
        questions.push(`Who are the top specialist ${sector} firms${servingIcp} in ${place}?`);
        questions.push(`Compare the best boutique ${sector} providers${forIcp}, rather than the large global firms.`);
      }
    } else {
      questions.push(`What are the leading companies in the ${sector} space${inLocation}?`);
      questions.push(`If a business needed ${sector} services${inLocation}, which companies would you recommend and why?`);
      if (single) {
        questions.push(`Who are the top ${sector} companies in ${place}?`);
        questions.push(`Compare the best ${sector} agencies or providers available today.`);
      }
    }
  }

  // Persona is folded in lightly: a single extra probe using the primary
  // sector, so the buyer's role nuances the results without over-narrowing
  // every question.
  if (hasPersona) {
    questions.push(`Which specialist ${list[0]} firms would you recommend to ${persona}${inLocation}?`);
  }

  if (keywords.length > 0) {
    questions.push(`Which companies are known for ${keywords.slice(0, 3).join(", ")}${forIcp}?`);
  }

  return questions;
}

function findMentionContext(text: string, brand: BrandIdentity | string): string | null {
  if (!text) return null;
  let idx = -1;
  let matchLen = 0;
  for (const alias of detectionAliases(asIdentity(brand))) {
    const m = aliasRegex(alias).exec(text);
    if (m && (idx === -1 || m.index < idx)) {
      idx = m.index;
      matchLen = m[0].length;
    }
  }
  if (idx === -1) return null;

  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + matchLen + 120);
  let context = text.substring(start, end).trim();
  if (start > 0) context = "..." + context;
  if (end < text.length) context = context + "...";
  return context;
}

export function extractCompetitors(text: string, brand: BrandIdentity | string): string[] {
  const identity = asIdentity(brand);
  const exclude = new Set(
    [identity.name, identity.legalName]
      .filter((x): x is string => !!x)
      .map((x) => x.toLowerCase().trim()),
  );
  const patterns = [
    /(?:companies|firms|agencies|providers|organizations|organisations)(?:\s+(?:like|such as|including|are))\s+([^.]+)/gi,
    /(?:\d+\.\s+\*{0,2})([A-Z][A-Za-z0-9\s&.']+?)(?:\*{0,2}\s*[-–—:])/g,
    /\*{2}([A-Z][A-Za-z0-9\s&.']+?)\*{2}/g,
  ];

  const names = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const found = match[1]?.trim();
      if (found && found.length > 2 && found.length < 60 && !exclude.has(found.toLowerCase())) {
        const cleaned = found.replace(/^\d+\.\s*/, "").replace(/\*+/g, "").trim();
        if (cleaned.length > 2) names.add(cleaned);
      }
    }
  }

  return [...names].slice(0, 10);
}

export interface ProbeSummary {
  question: string;
  model: string;
  mentioned: boolean;
  mentionRuns: number;
  runCount: number;
  mentionContext: string | null;
  responsePreview: string;
  competitors: string[];
}

export interface VisibilityMetrics {
  chatgptProbes: number;
  claudeProbes: number;
  chatgptMentions: number;
  claudeMentions: number;
  totalProbes: number;
  totalMentions: number;
  visibilityScore: number;
  presence: number;
  shareOfVoice: number;
}

// Count how often each competitor is named across all probe runs. A competitor
// is counted at most once per run (deduped by normalized name), must appear in
// at least two runs to make the list, and the result is the top 8 by mentions.
export function aggregateTopCompetitors(results: ProbeResult[]): { name: string; mentions: number }[] {
  const competitorHits = new Map<string, { display: string; count: number }>();
  for (const r of results) {
    const seen = new Set<string>();
    for (const c of r.competitors) {
      const key = normalizeCompetitor(c);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = competitorHits.get(key);
      if (entry) entry.count += 1;
      else competitorHits.set(key, { display: c.trim(), count: 1 });
    }
  }
  return [...competitorHits.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((e) => ({ name: e.display, mentions: e.count }));
}

// Collapse the repeated runs of each (model, question) pair into one summary
// row. The brand counts as "mentioned" for a question only when it appeared in
// at least half the runs (majority vote), guarding against a single fluke run.
export function groupProbesByQuery(results: ProbeResult[]): ProbeSummary[] {
  const grouped = new Map<string, ProbeResult[]>();
  for (const r of results) {
    const key = `${r.model}||${r.question}`;
    const arr = grouped.get(key);
    if (arr) arr.push(r);
    else grouped.set(key, [r]);
  }
  return [...grouped.values()].map((runs) => {
    const runCount = runs.length;
    const mentionRuns = runs.filter((r) => r.mentioned).length;
    const mentioned = mentionRuns * 2 >= runCount;
    const repr = runs.find((r) => r.mentioned) || runs[0];
    const competitorMap = new Map<string, string>();
    for (const r of runs) {
      for (const c of r.competitors) {
        const key = c.toLowerCase();
        if (!competitorMap.has(key)) competitorMap.set(key, c);
      }
    }
    return {
      question: repr.question,
      model: repr.model,
      mentioned,
      mentionRuns,
      runCount,
      mentionContext: repr.mentionContext,
      responsePreview: repr.response.substring(0, 300) + (repr.response.length > 300 ? "..." : ""),
      competitors: [...competitorMap.values()].slice(0, 12),
    };
  });
}

// Compute the headline visibility figures from the raw probe results.
// Presence and visibility score are both mentions / probes as a percentage;
// share of voice weighs the brand's mentions against every competitor mention.
export function computeVisibilityMetrics(results: ProbeResult[]): VisibilityMetrics {
  const chatgptResults = results.filter((r) => r.model.includes("GPT"));
  const claudeResults = results.filter((r) => r.model.includes("Claude"));
  const chatgptMentions = chatgptResults.filter((r) => r.mentioned).length;
  const claudeMentions = claudeResults.filter((r) => r.mentioned).length;
  const totalProbes = results.length;
  const totalMentions = results.filter((r) => r.mentioned).length;
  const visibilityScore = totalProbes > 0 ? Math.round((totalMentions / totalProbes) * 100) : 0;
  const competitorMentionTotal = results.reduce((s, r) => s + r.competitors.length, 0);
  const sovDenom = totalMentions + competitorMentionTotal;
  const shareOfVoice = sovDenom > 0 ? Math.round((totalMentions / sovDenom) * 100) : 0;
  const presence = totalProbes > 0 ? Math.round((totalMentions / totalProbes) * 100) : 0;
  return {
    chatgptProbes: chatgptResults.length,
    claudeProbes: claudeResults.length,
    chatgptMentions,
    claudeMentions,
    totalProbes,
    totalMentions,
    visibilityScore,
    presence,
    shareOfVoice,
  };
}

async function probeOpenAI(question: string, identity: BrandIdentity): Promise<ProbeResult | null> {
  const client = createOpenAIClient();
  if (!client) return null;

  try {
    // GPT-5 is a reasoning model, so max_completion_tokens covers BOTH the
    // hidden reasoning tokens and the visible answer. A small budget (e.g.
    // 1500) is frequently exhausted by reasoning alone, leaving the answer
    // empty or truncated and silently dropping brand mentions / competitors.
    // Give it a generous budget so thorough answers fit.
    const response = await client.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 8000,
      messages: [
        {
          role: "system",
          content: "You are a knowledgeable business advisor. Answer questions directly and thoroughly, naming specific companies where relevant. Be factual and comprehensive.",
        },
        { role: "user", content: question },
      ],
    });

    const text = response.choices[0]?.message?.content || "";
    if (response.choices[0]?.finish_reason === "length") {
      logger.warn(
        { question, model: "gpt-5", textLength: text.length },
        "OpenAI probe hit the output token limit; answer may be truncated",
      );
    }
    const mentioned = isMentioned(text, identity);

    return {
      question,
      model: "GPT-5 (ChatGPT)",
      response: text,
      mentioned,
      mentionContext: findMentionContext(text, identity),
      competitors: extractCompetitors(text, identity),
    };
  } catch (err: any) {
    logger.error({ err, question }, "OpenAI probe failed");
    return null;
  }
}

async function probeClaude(question: string, identity: BrandIdentity): Promise<ProbeResult | null> {
  const client = createAnthropicClient();
  if (!client) return null;

  try {
    // Give thorough, comprehensive answers (which can list many competitors)
    // room to finish so the brand mention or competitor list isn't cut off.
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: "You are a knowledgeable business advisor. Answer questions directly and thoroughly, naming specific companies where relevant. Be factual and comprehensive.",
      messages: [{ role: "user", content: question }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    if (response.stop_reason === "max_tokens") {
      logger.warn(
        { question, model: "claude-sonnet-4-5", textLength: text.length },
        "Claude probe hit the output token limit; answer may be truncated",
      );
    }
    const mentioned = isMentioned(text, identity);

    return {
      question,
      model: "Claude (Anthropic)",
      response: text,
      mentioned,
      mentionContext: findMentionContext(text, identity),
      competitors: extractCompetitors(text, identity),
    };
  } catch (err: any) {
    logger.error({ err, question }, "Claude probe failed");
    return null;
  }
}

interface ProjectAuthorityData {
  descriptor?: string;
  legalName?: string;
  website?: string;
  boilerplate?: string;
  competitors?: string[];
  evidenceUrls?: string[];
  buyerQuestions?: string[];
  expertiseTopics?: string[];
  spokespeople?: { name?: string; title?: string; expertise?: string[]; linkedin?: string }[];
  confirmedEntity?: { name: string; description?: string } | null;
}

interface AssessmentDimension {
  name: string;
  score: number;
  justification: string;
  confidence: "high" | "medium" | "low";
}

interface AuthorityAssessment {
  index: number;
  grade: string;
  summary: string;
  dimensions: AssessmentDimension[];
  topGaps: string[];
  priorityActions: { action: string; rationale: string; priority: string }[];
  queryTable: { query: string; appeared: boolean; notes: string }[];
}

// Whether the brand's name cleanly identifies it, or is shared with other
// well-known organisations (namesakes) that AI engines surface for the bare
// name. Used by the report's entity-clarity section to separate "not present"
// from "present but confused with another entity".
export interface EntityClarity {
  brandName: string;
  isAmbiguous: boolean;
  brandRecognised: boolean;
  brandIsDominant: boolean;
  competingEntities: { name: string; description: string }[];
  note: string;
}

const DIMENSION_NAMES = [
  "Presence",
  "Prominence",
  "Share of voice",
  "Message fidelity",
  "Factual accuracy",
  "Source quality",
  "Entity clarity",
  "Spokesperson authority",
];

function sanitizeProjectData(raw: unknown): ProjectAuthorityData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strArr = (v: unknown, cap: number, len: number): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((s) => s.trim().slice(0, len)).filter(Boolean).slice(0, cap)
      : [];
  const str = (v: unknown, len: number): string => (typeof v === "string" ? v.trim().slice(0, len) : "");
  return {
    descriptor: str(d.descriptor, 2000),
    legalName: str(d.legalName, 200),
    website: str(d.website, 300),
    boilerplate: str(d.boilerplate, 600),
    competitors: strArr(d.competitors, 20, 120),
    evidenceUrls: strArr(d.evidenceUrls, 30, 300),
    buyerQuestions: strArr(d.buyerQuestions, 15, 300),
    expertiseTopics: strArr(d.expertiseTopics, 15, 200),
    spokespeople: Array.isArray(d.spokespeople)
      ? (d.spokespeople as unknown[])
          .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
          .slice(0, 10)
          .map((s) => ({
            name: typeof s.name === "string" ? s.name.trim().slice(0, 120) : "",
            title: typeof s.title === "string" ? s.title.trim().slice(0, 200) : "",
            expertise: Array.isArray(s.expertise)
              ? (s.expertise as unknown[]).filter((e): e is string => typeof e === "string").map((e) => e.trim().slice(0, 120)).filter(Boolean).slice(0, 10)
              : [],
            linkedin: typeof s.linkedin === "string" ? s.linkedin.trim().slice(0, 300) : "",
          }))
          .filter((s) => s.name)
      : [],
    confirmedEntity: (() => {
      const ce = d.confirmedEntity;
      if (!ce || typeof ce !== "object") return null;
      const name = typeof (ce as Record<string, unknown>).name === "string" ? ((ce as Record<string, unknown>).name as string).trim().slice(0, 200) : "";
      if (!name) return null;
      const description = typeof (ce as Record<string, unknown>).description === "string" ? ((ce as Record<string, unknown>).description as string).trim().slice(0, 300) : "";
      return { name, description };
    })(),
  };
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function gradeFor(idx: number): string {
  return idx >= 80 ? "A" : idx >= 60 ? "B" : idx >= 40 ? "C" : idx >= 20 ? "D" : "F";
}

// Pull the first balanced JSON object out of a model response, tolerating
// stray prose or markdown code fences around it.
export function extractJson(text: string): string | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAssessment(text: string): AuthorityAssessment | null {
  const json = extractJson(text);
  if (!json) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const conf = (v: unknown): "high" | "medium" | "low" =>
    v === "high" || v === "medium" || v === "low" ? v : "low";

  const rawDims = Array.isArray(parsed.dimensions) ? parsed.dimensions : [];
  const dimByName = new Map<string, any>();
  for (const d of rawDims) {
    if (d && typeof d === "object" && typeof d.name === "string") {
      dimByName.set(d.name.trim().toLowerCase(), d);
    }
  }
  const dimensions: AssessmentDimension[] = DIMENSION_NAMES.map((name) => {
    const d = dimByName.get(name.toLowerCase());
    return {
      name,
      score: clampScore(d?.score),
      justification: typeof d?.justification === "string" && d.justification.trim() ? d.justification.trim().slice(0, 500) : "No evidence in this run.",
      confidence: conf(d?.confidence),
    };
  });

  const index = clampScore(parsed.index);

  const topGaps = Array.isArray(parsed.topGaps)
    ? parsed.topGaps.filter((g: unknown): g is string => typeof g === "string").map((g: string) => g.trim().slice(0, 300)).filter(Boolean).slice(0, 6)
    : [];

  const priorityActions = Array.isArray(parsed.priorityActions)
    ? parsed.priorityActions
        .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a: Record<string, unknown>) => ({
          action: typeof a.action === "string" ? a.action.trim().slice(0, 300) : "",
          rationale: typeof a.rationale === "string" ? a.rationale.trim().slice(0, 400) : "",
          priority: a.priority === "high" || a.priority === "medium" || a.priority === "low" ? (a.priority as string) : "medium",
        }))
        .filter((a: { action: string }) => a.action)
        .slice(0, 8)
    : [];

  const queryTable = Array.isArray(parsed.queryTable)
    ? parsed.queryTable
        .filter((q: unknown): q is Record<string, unknown> => !!q && typeof q === "object")
        .map((q: Record<string, unknown>) => ({
          query: typeof q.query === "string" ? q.query.trim().slice(0, 300) : "",
          appeared: q.appeared === true,
          notes: typeof q.notes === "string" ? q.notes.trim().slice(0, 400) : "",
        }))
        .filter((q: { query: string }) => q.query)
        .slice(0, 40)
    : [];

  return {
    index,
    grade: typeof parsed.grade === "string" && /^[A-F]$/i.test(parsed.grade.trim()) ? parsed.grade.trim().toUpperCase() : gradeFor(index),
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 1200) : "",
    dimensions,
    topGaps,
    priorityActions,
    queryTable,
  };
}

export async function scoreAuthority(
  companyName: string,
  projectData: ProjectAuthorityData,
  evidence: { question: string; appeared: boolean; competitors: string[]; chatgpt: string; claude: string }[],
  metrics: { presence: number; shareOfVoice: number; visibilityScore: number; topCompetitors: { name: string; mentions: number }[] },
  entityClarity?: EntityClarity | null,
): Promise<AuthorityAssessment | null> {
  const client = createAnthropicClient();
  if (!client) return null;

  const sp = (projectData.spokespeople || []).map((s) => ({
    name: s.name,
    title: s.title,
    expertise: s.expertise,
  }));

  const prompt = `You are scoring the AI authority of a brand for a PR team, using ONLY the evidence and project data below.

HOW THE EVIDENCE WAS GATHERED:
The brand's real buyer questions and category questions were put to ChatGPT and Claude as blind probes - the brand was NOT named in the prompt. The answers were captured. "appeared: true" means the engine named the brand unprompted in that answer.

YOUR TASK:
Score the brand across these 8 dimensions, each 0-100, with a one-sentence justification and a confidence flag (high, medium or low):
- Presence: how often the brand appears unprompted across the probes.
- Prominence: when it appears, how centrally or favourably it is positioned versus being a passing mention.
- Share of voice: the brand's mentions relative to the competitors the engines name.
- Message fidelity: where the brand appears, does what the engines say about it match the brand's own messaging and boilerplate.
- Factual accuracy: where the brand appears, is what the engines say factually correct against the project data.
- Source quality: strength of the evidence URLs and third-party citations the brand supplied.
- Entity clarity: how clearly the engines and the project data establish the brand as a distinct, well-defined entity.
- Spokesperson authority: strength and relevance of the named spokespeople the brand supplied.

CRITICAL RULES:
- Use British spelling. No em dashes, use hyphens. No emojis. Plain, non-hyped language.
- Do NOT invent facts, citations, outlets, quotes, competitors or spokespeople. Use only what is provided.
- If the evidence does not support a dimension, score it low and write "No evidence in this run." as the justification with confidence "low". This is expected for message fidelity, factual accuracy, source quality and spokesperson authority when the brand rarely appeared or supplied no URLs or spokespeople.
- Ground every justification in the actual evidence. Presence, prominence and share of voice come from the probe results. Source quality and spokesperson authority come from the supplied URLs and spokespeople only.
- If ENTITY CLARITY below shows the brand name is shared with other well-known organisations, reflect that in the Entity clarity dimension, and in the summary explain that a low presence partly reflects identity confusion (the engines surface the namesakes for the bare name) rather than the brand being absent. Do not name namesakes that are not listed there.

Return STRICT JSON only - no prose before or after, no markdown fences. Exactly this shape:
{
  "index": <overall AI Authority Index 0-100>,
  "grade": "<A|B|C|D|F>",
  "summary": "<2 to 3 sentence executive summary in plain British English>",
  "dimensions": [{ "name": "Presence", "score": <0-100>, "justification": "<one sentence>", "confidence": "high|medium|low" }, ... all 8 dimensions in the order listed],
  "topGaps": ["<the most important visibility gap>", ... up to 5],
  "priorityActions": [{ "action": "<what to do>", "rationale": "<why, grounded in the evidence>", "priority": "high|medium|low" }, ... up to 5],
  "queryTable": [{ "query": "<the probed question>", "appeared": <true|false>, "notes": "<what the engines said, or which rivals they recommended instead>" }, ... one row per query in the evidence]
}

BRAND: ${companyName}

PROJECT DATA:
${JSON.stringify(
    {
      legalName: projectData.legalName || "",
      descriptor: projectData.descriptor || "",
      boilerplate: projectData.boilerplate || "",
      competitors: projectData.competitors || [],
      expertiseTopics: projectData.expertiseTopics || [],
      evidenceUrls: projectData.evidenceUrls || [],
      spokespeople: sp,
    },
    null,
    1,
  )}

PRECOMPUTED METRICS (from the probes, for reference - you may refine the index):
${JSON.stringify(metrics, null, 1)}

ENTITY CLARITY (how clearly the brand name resolves to this company for AI engines):
${entityClarity
    ? JSON.stringify(
        {
          isAmbiguous: entityClarity.isAmbiguous,
          brandIsDominant: entityClarity.brandIsDominant,
          brandRecognised: entityClarity.brandRecognised,
          competingEntities: entityClarity.competingEntities.map((e) => e.name),
        },
        null,
        1,
      )
    : "not assessed"}

PROBE EVIDENCE (one entry per query):
${JSON.stringify(evidence, null, 1)}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system:
        "You are a precise AI visibility analyst. You never fabricate evidence. You return strict JSON only, with British spelling, no em dashes and no emojis.",
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    return parseAssessment(text);
  } catch (err: any) {
    logger.error({ err, companyName }, "Authority scoring (stage 2) failed");
    return null;
  }
}

// Parse a model's "Name - description" list of namesake organisations into
// structured entries, tolerating bullets, numbering and markdown emphasis.
export function parseEntityList(text: string): { name: string; description: string }[] {
  const out: { name: string; description: string }[] = [];
  for (const rawLine of (text || "").split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^[-*\u2022\d.)\s]+/, "").trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*[-\u2013\u2014:]\s*(.+)$/);
    const name = (m ? m[1] : line).replace(/\*+/g, "").trim().slice(0, 120);
    const description = (m ? m[2] : "").replace(/\*+/g, "").trim().slice(0, 240);
    if (name.length >= 2) out.push({ name, description });
    if (out.length >= 8) break;
  }
  return out;
}

// Whether a listed entity's name is the one the user explicitly confirmed is
// theirs. Compares on the suffix-stripped, normalized form so "Sports Media
// Group" and "Sports Media" resolve to the same brand.
function matchesConfirmedEntity(entityName: string, confirmedName: string): boolean {
  const a = normalizeCompetitor(entityName);
  const b = normalizeCompetitor(confirmedName);
  if (!a || !b) return false;
  if (a === b) return true;
  return aliasRegex(b).test(a) || aliasRegex(a).test(b);
}

function entityMatchesBrand(entity: { name: string; description: string }, identity: BrandIdentity): boolean {
  // The user's confirmation is authoritative: when they have picked which
  // namesake is their company, only that entity counts as the brand, so the
  // verdict reflects their choice rather than the website/sector heuristic.
  const confirmed = identity.confirmedEntity?.name?.trim();
  if (confirmed) {
    return matchesConfirmedEntity(entity.name, confirmed);
  }
  const text = `${entity.name} ${entity.description}`;
  if (isCorroborated(text, identity)) return true;
  for (const s of identity.sectors || []) {
    const norm = normalizeText(s);
    if (norm && aliasRegex(norm).test(text)) return true;
  }
  return false;
}

// Turn the listed namesakes into the entity-clarity verdict: which one (if any)
// is the brand, whether the brand is the dominant holder of the name, and the
// remaining competing entities, plus a plain-English note on the score impact.
export function deriveEntityClarity(
  name: string,
  identity: BrandIdentity,
  entities: { name: string; description: string }[],
): EntityClarity {
  const matched = entities.map((e) => ({ e, isBrand: entityMatchesBrand(e, identity) }));
  const brandRecognised = matched.some((m) => m.isBrand);
  const brandIsDominant = matched.length > 0 && matched[0].isBrand;
  const competingEntities = matched.filter((m) => !m.isBrand).map((m) => m.e).slice(0, 6);
  const isAmbiguous = competingEntities.length > 0;

  let note: string;
  if (!isAmbiguous) {
    note = `The name "${name}" resolves cleanly to the brand, so identity confusion is unlikely to suppress the score.`;
  } else if (!brandRecognised) {
    note = `The bare name "${name}" is dominated by other well-known organisations and the brand did not surface for it unprompted, so a low presence score reflects identity confusion rather than absence of coverage. The identity probe was anchored to the brand's website to measure the correct company.`;
  } else if (!brandIsDominant) {
    note = `The name "${name}" is shared with other well-known organisations that the engines surface first, so the brand competes for its own name and a depressed score partly reflects this identity confusion. The identity probe was anchored to the brand's website to measure the correct company.`;
  } else {
    note = `The brand is the most prominent holder of the name "${name}", but other organisations share it and may dilute non-branded results.`;
  }
  return { brandName: name, isAmbiguous, brandRecognised, brandIsDominant, competingEntities, note };
}

// Stage: resolve how clearly the brand name identifies the company. One blind
// LLM call lists the well-known organisations known by the bare name; the brand
// is then matched against that list by website/legal-name/sector. Fail-soft:
// returns null if no client or the model returns nothing usable.
//
// Live web grounding decision (task: fix audit brand-name confusion):
// We deliberately do NOT enable live web_search tools here or in the probes.
// Reasons: (1) the shared Anthropic integration proxy does not expose a reliable
// web_search tool, so we cannot depend on it; (2) live retrieval makes results
// non-deterministic and slower, which undermines the audit's repeatability (see
// the diagnostic-determinism note); (3) the root cause of acronym confusion is
// fixed deterministically by anchoring identity to the project website/legal
// name and corroborating mentions, which needs no live browsing. If a dependable
// web-search tool becomes available, revisit this as an optional enrichment.
export async function assessEntityClarity(identity: BrandIdentity): Promise<EntityClarity | null> {
  const client = createAnthropicClient();
  if (!client) return null;

  const prompt = `A PR team needs to know how clearly the name "${identity.name}" identifies a single company to AI answer engines.

List the well-known companies or organisations commonly referred to as "${identity.name}", most well-known first.${identity.website ? ` Include the company at ${identity.website} if you know it.` : ""} For each, output one line exactly as:
Full name - one short description

Rules: plain text only, one organisation per line, no preamble, no numbering, British spelling, no em dashes, no emojis. If only one organisation is well known by this name, list just that one. Do not invent organisations.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: "You are a precise entity-resolution assistant. You list only real organisations and never invent names.",
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const entities = parseEntityList(text);
    if (entities.length === 0) return null;
    return deriveEntityClarity(identity.name, identity, entities);
  } catch (err: any) {
    logger.error({ err, name: identity.name }, "Entity clarity assessment failed");
    return null;
  }
}

llmCheckRouter.post("/llm-check", llmCheckLimiter, llmCheckConcurrencyGuard, async (req: Request, res: Response) => {
  const { companyName, sector, sectors, keywords, icp, location, persona, projectData } = req.body;

  if (!companyName || typeof companyName !== "string") {
    res.status(400).json({ error: "companyName is required" });
    return;
  }

  const rawSectors = [
    ...(Array.isArray(sectors) ? sectors : []),
    ...(typeof sector === "string" ? [sector] : []),
  ];
  const sectorList = [
    ...new Set(
      rawSectors
        .filter((s: any) => typeof s === "string")
        .map((s: string) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 3);

  if (sectorList.length === 0) {
    res.status(400).json({ error: "sector is required" });
    return;
  }

  const kw = Array.isArray(keywords) ? keywords.filter((k: any) => typeof k === "string") : [];
  const icpProfile = typeof icp === "string" ? icp.trim().slice(0, 300) : "";
  const locationProfile = typeof location === "string" ? location.trim().replace(/^in\s+/i, "").slice(0, 120) : "";
  const personaProfile = typeof persona === "string" ? persona.trim().slice(0, 150) : "";
  const authorityData = sanitizeProjectData(projectData);

  logger.info(
    { companyName, sectors: sectorList, hasIcp: icpProfile.length > 0, hasLocation: locationProfile.length > 0, hasPersona: personaProfile.length > 0, buyerQuestions: (authorityData.buyerQuestions || []).length },
    "Starting LLM visibility check",
  );

  // Identity bundle used to (a) anchor the direct probe to the right company and
  // (b) harden mention detection against unrelated namesakes (e.g. "SMG").
  const identity: BrandIdentity = {
    name: companyName,
    legalName: authorityData.legalName,
    website: authorityData.website,
    descriptor: authorityData.descriptor,
    sectors: sectorList,
    confirmedEntity: authorityData.confirmedEntity,
  };

  try {
    // Resolve how clearly the brand name identifies the company. Runs concurrently
    // with the probes; independent of their results and fail-soft.
    const entityClarityPromise = assessEntityClarity(identity);

    const generated = generateProbeQuestions(companyName, sectorList, kw, icpProfile, locationProfile, personaProfile, identity);
    // Seed the probe set with the buyer's verbatim questions so the measurement
    // uses real queries, not only generated ones. De-duplicate while preserving
    // the buyer questions first, and cap the total so the run stays bounded.
    const buyerQuestions = (authorityData.buyerQuestions || []).slice(0, 12);
    const questions = [...new Set([...buyerQuestions, ...generated])].slice(0, 18);

    const probePromises: Promise<ProbeResult | null>[] = [];
    for (const q of questions) {
      for (let run = 0; run < RUNS_PER_QUESTION; run++) {
        probePromises.push(probeOpenAI(q, identity));
        probePromises.push(probeClaude(q, identity));
      }
    }

    const results = await Promise.all(probePromises);
    const validResults = results.filter((r): r is ProbeResult => r !== null);

    const {
      chatgptProbes,
      claudeProbes,
      chatgptMentions,
      claudeMentions,
      totalProbes,
      totalMentions,
      visibilityScore,
      presence,
      shareOfVoice,
    } = computeVisibilityMetrics(validResults);

    const topCompetitors = aggregateTopCompetitors(validResults);

    const probes = groupProbesByQuery(validResults);

    // Stage two: build one evidence row per unique query (both engines' first
    // representative answer) and ask Claude to score authority against the
    // project data. Responses are truncated to keep the scoring call bounded.
    const evidenceByQuery = new Map<string, { question: string; appeared: boolean; competitors: Set<string>; chatgpt: string; claude: string }>();
    for (const r of validResults) {
      let e = evidenceByQuery.get(r.question);
      if (!e) {
        e = { question: r.question, appeared: false, competitors: new Set(), chatgpt: "", claude: "" };
        evidenceByQuery.set(r.question, e);
      }
      if (r.mentioned) e.appeared = true;
      r.competitors.forEach((c) => e!.competitors.add(c));
      const trimmed = r.response.slice(0, 700);
      if (r.model.includes("GPT")) {
        if (!e.chatgpt || (r.mentioned && trimmed.length > e.chatgpt.length)) e.chatgpt = trimmed;
      } else if (!e.claude || (r.mentioned && trimmed.length > e.claude.length)) {
        e.claude = trimmed;
      }
    }
    const evidence = [...evidenceByQuery.values()].slice(0, 18).map((e) => ({
      question: e.question,
      appeared: e.appeared,
      competitors: [...e.competitors].slice(0, 12),
      chatgpt: e.chatgpt,
      claude: e.claude,
    }));

    const entityClarity = await entityClarityPromise;

    const assessment = await scoreAuthority(
      companyName,
      authorityData,
      evidence,
      {
        presence,
        shareOfVoice,
        visibilityScore,
        topCompetitors,
      },
      entityClarity,
    );

    const summary = {
      companyName,
      sector: sectorList[0],
      sectors: sectorList,
      icp: icpProfile,
      checkedAt: new Date().toISOString(),
      visibilityScore,
      totalProbes,
      totalMentions,
      byModel: {
        chatgpt: { probes: chatgptProbes, mentions: chatgptMentions, rate: chatgptProbes > 0 ? Math.round((chatgptMentions / chatgptProbes) * 100) : 0 },
        claude: { probes: claudeProbes, mentions: claudeMentions, rate: claudeProbes > 0 ? Math.round((claudeMentions / claudeProbes) * 100) : 0 },
      },
      topCompetitors,
      probes,
      assessment,
      entityClarity,
    };

    res.json(summary);
  } catch (err: any) {
    logger.error({ err, companyName }, "LLM visibility check failed");
    res.status(500).json({ error: "LLM visibility check failed. Please try again." });
  }
});

export default llmCheckRouter;

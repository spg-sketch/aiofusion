import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, sql } from "drizzle-orm";
import { db, auditLocksTable, savedAuditsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  completeAssessmentOutcome,
  completeAssessmentStatus,
  fallbackAssessmentOutcome,
  fallbackAssessmentStatus,
  type AssessmentOutcome,
  type AssessmentReasonCategory,
  type AssessmentStatus,
} from "../lib/assessment-outcome";
import { stableExactTargetPhraseId } from "../lib/exact-target-phrases";
import {
  AUTHORITY_DIMENSION_NAMES,
  AUTHORITY_GRADE_BANDS,
  authorityGradeFor,
  getAuthorityAssessmentValidationIssue,
} from "../lib/authority-assessment-validation";

export { isCompleteAuthorityAssessmentPayload } from "../lib/authority-assessment-validation";
import { llmCheckLimiter } from "../middleware/rate-limit";
import { deepStripEmDashes } from "../lib/text-sanitise";
import { llmCheckConcurrencyGuard } from "../middleware/concurrency-guard";
import { logAdminEvent } from "../lib/admin-events";
import { logTokenUsage } from "../lib/token-usage";
import { checkMonthlySpendLimit } from "../lib/fair-usage";
import {
  AUDIT_WORKER_ID,
  claimAuditRun,
  expireStaleAuditRuns,
  retryAuditRunAfterFailure,
  type RecoverableAuditRun,
  updateAuditRunProgress,
} from "../lib/audit-run-claims";
import { randomUUID } from "node:crypto";

const llmCheckRouter = Router();

function initSse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const flushHeaders = (res as unknown as { flushHeaders?: () => void }).flushHeaders;
  if (typeof flushHeaders === "function") flushHeaders.call(res);
}

function sseSend(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  let payload = event === "result" ? deepStripEmDashes(data) : data;
  // Phrase identity is canonical and must remain byte-for-byte aligned with the
  // submitted ID. Restore those user-owned fields after prose sanitation.
  if (event === "result" && data && typeof data === "object" && payload && typeof payload === "object") {
    const sourceResult = data as {
      phraseMeasurements?: PhraseProbeMeasurement[];
      probes?: Array<{ question: string }>;
      assessment?: {
        queryTable?: Array<{ query: string }>;
        categoryFraming?: Array<{ query: string }>;
      };
    };
    const targetResult = payload as typeof sourceResult;
    if (Array.isArray(sourceResult.phraseMeasurements) && Array.isArray(targetResult.phraseMeasurements)) {
      targetResult.phraseMeasurements.forEach((measurement, index) => {
        const original = sourceResult.phraseMeasurements![index];
        if (!original) return;
        measurement.phrase = { ...original.phrase };
        measurement.effectiveQuery = original.effectiveQuery;
      });
    }
    if (Array.isArray(sourceResult.probes) && Array.isArray(targetResult.probes)) {
      targetResult.probes.forEach((probe, index) => {
        const original = sourceResult.probes![index];
        if (original) probe.question = original.question;
      });
    }
    for (const key of ["queryTable", "categoryFraming"] as const) {
      const sourceRows = sourceResult.assessment?.[key];
      const targetRows = targetResult.assessment?.[key];
      if (Array.isArray(sourceRows) && Array.isArray(targetRows)) {
        targetRows.forEach((row, index) => {
          const original = sourceRows[index];
          if (original) row.query = original.query;
        });
      }
    }
  }
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

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
  anchored?: boolean;
  intentTier?: "buyer" | "sector" | "identity";
  /** Canonical phrases represented by this scheduled effective query. */
  phraseIds?: string[];
}

type ExactTargetPhrase = {
  id: string;
  text: string;
  intentGroup: "discovery" | "shortlist" | "comparison";
};

export type PhraseProbeMeasurement = {
  phrase: ExactTargetPhrase;
  provider: "chatgpt" | "claude";
  model: string;
  methodologyVersion: number;
  effectiveQuery: string;
  status: "complete" | "partial" | "failed";
  expectedRuns: number;
  completedRuns: number;
  mentionRuns: number;
  mentioned: boolean | null;
  answerPosition: number | null;
  citations: string[];
  citedDomains: string[];
  shareOfVoice: number | null;
  competitors: { name: string; mentions: number }[];
  failureLabel: string | null;
};

const RUNS_PER_QUESTION = 2;
const LEGACY_MAX_QUESTIONS = 8;
const MAX_TARGET_PHRASES = 24;
const PHRASE_METHODOLOGY_VERSION = 1;
const AUDIT_LOCK_DAYS = 21;
const CHATGPT_MODEL = "gpt-5";
const CLAUDE_MODEL = "claude-sonnet-4-5";

function normaliseExactPhrases(value: unknown): ExactTargetPhrase[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw): ExactTargetPhrase[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text.trim().replace(/\s+/g, " ").slice(0, 500) : "";
    const intentGroup = item.intentGroup;
    if (!text || !["discovery", "shortlist", "comparison"].includes(String(intentGroup))) return [];
    const id = stableExactTargetPhraseId(intentGroup as ExactTargetPhrase["intentGroup"], text);
    if (item.id !== id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, text, intentGroup: intentGroup as ExactTargetPhrase["intentGroup"] }];
  });
}

function urlsFromAnswer(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>()\]}",]+/gi) ?? [];
  return [...new Set(matches.map((raw) => raw.replace(/[.,;:!?]+$/, "")))].slice(0, 20);
}

function citedDomains(urls: string[]): string[] {
  return [...new Set(urls.flatMap((value) => {
    try { return [new URL(value).hostname.toLowerCase().replace(/^www\./, "")]; } catch { return []; }
  }))];
}

function firstAnswerPosition(response: string, identity: BrandIdentity, competitors: string[]): number | null {
  const hits: Array<{ index: number; brand: boolean }> = [];
  for (const alias of detectionAliases(identity)) {
    const match = aliasRegex(alias).exec(response);
    if (match) hits.push({ index: match.index, brand: true });
  }
  for (const competitor of competitors) {
    const normal = normalizeText(competitor);
    if (!normal) continue;
    const match = aliasRegex(normal).exec(response);
    if (match) hits.push({ index: match.index, brand: false });
  }
  hits.sort((a, b) => a.index - b.index);
  const brandIndex = hits.findIndex((hit) => hit.brand);
  return brandIndex === -1 ? null : brandIndex + 1;
}

export function buildPhraseMeasurements(
  phrases: ExactTargetPhrase[],
  results: ProbeResult[],
  identity: BrandIdentity,
  effectiveQuestions: Map<string, string> = new Map(),
): PhraseProbeMeasurement[] {
  return phrases.flatMap((phrase) => ([
    { provider: "chatgpt" as const, model: CHATGPT_MODEL, matches: results.filter((r) => (r.phraseIds ? r.phraseIds.includes(phrase.id) : r.question === (effectiveQuestions.get(phrase.id) ?? phrase.text)) && r.model.includes("GPT")) },
    { provider: "claude" as const, model: CLAUDE_MODEL, matches: results.filter((r) => (r.phraseIds ? r.phraseIds.includes(phrase.id) : r.question === (effectiveQuestions.get(phrase.id) ?? phrase.text)) && r.model.includes("Claude")) },
  ]).map(({ provider, model, matches }) => {
    const completedRuns = matches.length;
    const mentionRuns = matches.filter((r) => r.mentioned).length;
    const mentioned = completedRuns === 0 ? null : mentionRuns * 2 > completedRuns;
    const competitorCounts = new Map<string, { name: string; mentions: number }>();
    for (const run of matches) {
      for (const name of new Set(run.competitors)) {
        const key = normalizeCompetitor(name);
        if (!key) continue;
        const prior = competitorCounts.get(key);
        competitorCounts.set(key, { name: prior?.name ?? name, mentions: (prior?.mentions ?? 0) + 1 });
      }
    }
    const competitors = [...competitorCounts.values()].sort((a, b) => b.mentions - a.mentions);
    const brandMentions = mentionRuns;
    const competitorMentions = competitors.reduce((sum, item) => sum + item.mentions, 0);
    const denominator = brandMentions + competitorMentions;
    const positions = matches.filter((run) => run.mentioned).flatMap((run) => {
      const position = firstAnswerPosition(run.response, identity, run.competitors);
      return position === null ? [] : [position];
    });
    const citations = [...new Set(matches.flatMap((run) => urlsFromAnswer(run.response)))];
    return {
      phrase,
      provider,
      model,
      methodologyVersion: PHRASE_METHODOLOGY_VERSION,
      effectiveQuery: effectiveQuestions.get(phrase.id) ?? phrase.text,
      status: completedRuns === 0 ? "failed" as const : completedRuns < RUNS_PER_QUESTION ? "partial" as const : "complete" as const,
      expectedRuns: RUNS_PER_QUESTION,
      completedRuns,
      mentionRuns,
      mentioned,
      answerPosition: positions.length ? Math.round(positions.reduce((sum, n) => sum + n, 0) / positions.length) : null,
      citations,
      citedDomains: citedDomains(citations),
      shareOfVoice: completedRuns === 0 || denominator === 0 ? null : Math.round((brandMentions / denominator) * 100),
      competitors,
      failureLabel: completedRuns === 0 ? "Provider check failed" : completedRuns < RUNS_PER_QUESTION ? `${RUNS_PER_QUESTION - completedRuns} of ${RUNS_PER_QUESTION} runs failed` : null,
    };
  }));
}

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
  // Organisations the client explicitly says share their name but are NOT them
  // (e.g. "BlueHalo LLC (US defence contractor)"). Optional - only needed when
  // the client knows of a specific namesake causing engine confusion. Used to
  // anchor the identity probe and pre-seed entity clarity.
  knownNamesakes?: string[];
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

// Full cleaned hostname (e.g. "smg.com") for use in disambiguation anchors.
function fullHostname(website?: string): string {
  if (!website) return "";
  let s = website.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  return s.split(/[/?#]/)[0] || "";
}

// A name is "confusable" when it is short or uses words common enough that
// AI engines might answer about an unrelated namesake. Covers:
//   - acronyms and very short names caught by isAmbiguousName (e.g. "SMG")
//   - short multi-word names where each word is a common term (e.g. "Blu Halo")
function isConfusableName(name: string): boolean {
  if (isAmbiguousName(name)) return true;
  const tokens = name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  // Two or three short tokens whose combined character count is ≤ 10 (no spaces)
  // are likely to collide with other organisations.
  return tokens.length >= 2 && tokens.length <= 3 && tokens.join("").length <= 10;
}

// Rewrite buyer questions so any bare occurrence of an ambiguous/confusable
// company name is anchored to the company's website domain.
// E.g. "Is SMG trustworthy?" → "Is SMG (smg.com) trustworthy?"
// This runs only at probe time; stored data is never mutated.
function disambiguateBuyerQuestions(questions: string[], identity: BrandIdentity): string[] {
  if (!isConfusableName(identity.name) || !identity.website) return questions;
  const host = fullHostname(identity.website);
  if (!host) return questions;
  const anchored = `${identity.name} (${host})`;
  const escaped = identity.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "gi");
  return questions.map((q) => q.replace(re, anchored));
}

// Brand-specific phrases that, if present in a response, confirm a weak/acronym
// match really is the brand: the domain label and the multi-word legal name.
function corroborationSignals(identity: BrandIdentity): string[] {
  const sigs: string[] = [];
  const dl = domainLabel(identity.website);
  if (dl && dl.length >= 4) sigs.push(dl);
  // For short domain labels (e.g. "smg" = 3 chars) that are excluded by the
  // length guard above, use the full hostname ("smg.com") instead. The dot-TLD
  // suffix makes it specific enough to match without false positives, and
  // assessEntityClarity now asks Claude to include the domain in descriptions.
  const host = fullHostname(identity.website);
  if (host && (!dl || dl.length < 4)) sigs.push(host);
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

export function isMentioned(text: string, brand: BrandIdentity | string, probeWasAnchored = false): boolean {
  if (!text) return false;
  const identity = asIdentity(brand);
  const hasContext = corroborationSignals(identity).length > 0;
  for (const alias of detectionAliases(identity)) {
    if (!aliasRegex(alias).test(text)) continue;
    // A strong (multi-word or distinctive) alias is a confident match.
    if (!isWeakAlias(alias)) return true;
    // When the probe question was already anchored (e.g. "Is SMG (smg.com)
    // trustworthy?"), the AI engine has been told which company is meant, so
    // any alias match in its answer refers to the right company. Skip the
    // corroboration check - requiring the domain to appear in the *answer*
    // would silently discard genuine mentions and collapse scores to near-zero.
    if (probeWasAnchored) return true;
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
  const namesakes = (identity.knownNamesakes || []).filter(Boolean);
  if (namesakes.length > 0) {
    anchor.push(`Please note: this is NOT ${namesakes.join(", NOT ")}.`);
  }
  if (anchor.length > 0) {
    q += ` ${anchor.join(" ")} Please answer specifically about this company, not other organisations with a similar name.`;
  }
  return q;
}

export type BusinessType = "" | "service" | "product" | "consumer";

// Vocabulary set that shapes probe questions to match the business model being
// audited. Professional services (default) uses firm/agency language; product
// companies use platform/vendor language; consumer brands use brand language.
// This ensures the questions the AI sees are realistic for the category, so
// the competitor set it surfaces is actually comparable.
function buildProbeVocab(type: BusinessType) {
  if (type === "product") {
    return {
      offeringSuffix: "solutions",
      entityPlural: "platforms or vendors",
      boutiqueAdj: "independent",
      comparatorEntity: "platforms",
      largeRivals: "large enterprise vendors",
      keywordEntity: "platforms or tools",
      supportNoun: "solutions",
      buyerWord: "business",
    };
  }
  if (type === "consumer") {
    return {
      offeringSuffix: "",
      entityPlural: "brands",
      boutiqueAdj: "independent",
      comparatorEntity: "brands",
      largeRivals: "large global brands",
      keywordEntity: "brands",
      supportNoun: "options",
      buyerWord: "consumer",
    };
  }
  // default: professional services / agency
  return {
    offeringSuffix: "services",
    entityPlural: "agencies or providers",
    boutiqueAdj: "boutique",
    comparatorEntity: "agencies or providers",
    largeRivals: "large global firms",
    keywordEntity: "companies",
    supportNoun: "support",
    buyerWord: "business",
  };
}

export function generateProbeQuestions(
  companyName: string,
  sectors: string[],
  keywords: string[],
  icp: string,
  location: string,
  persona: string,
  identity?: BrandIdentity,
  businessType: BusinessType = "",
): string[] {
  const questions: string[] = [];
  const v = buildProbeVocab(businessType);
  // Sector suffix ("services", "solutions", etc.) appended where the sector
  // name alone is not a complete phrase. Consumer type omits it since sector
  // names like "fitness" or "fashion" stand on their own.
  const sectorSuffix = v.offeringSuffix ? ` ${v.offeringSuffix}` : "";

  const uniqueSectors = [...new Set(sectors.map((s) => s.trim()).filter(Boolean))].slice(0, 3);
  const list = uniqueSectors.length > 0 ? uniqueSectors : ["the industry"];

  const hasIcp = icp.trim().length > 0;
  const hasLocation = location.trim().length > 0;
  const hasPersona = persona.trim().length > 0;

  // Truncate ICP, location, and persona so probe questions stay concise.
  // Long ICPs (multi-sentence paragraphs) and many locations cause 400+ char
  // questions that exhaust GPT context and produce empty responses.
  const shortIcp = hasIcp
    ? icp.split(/[.\n]/)[0].trim().slice(0, 80)
    : "";
  const shortLocation = hasLocation
    ? location.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(", ")
    : "";
  const shortPersona = hasPersona
    ? persona.split(/[.\n]/)[0].trim().slice(0, 80)
    : "";

  // ICP-aware clauses steer the AI toward specialist/niche providers that
  // serve a specific size and type of customer, rather than surfacing the big
  // household-name firms a generic "leading companies" question always returns.
  const forIcp = shortIcp ? ` for ${shortIcp}` : "";
  const servingIcp = shortIcp ? ` serving ${shortIcp}` : "";
  // Location is added as a clean qualifier because AI answers are heavily
  // localised; "the UK" is the neutral fallback used by the original probes.
  const inLocation = shortLocation ? ` in ${shortLocation}` : "";
  const place = shortLocation || "the UK";

  questions.push(identity ? buildIdentityProbe({ ...identity, name: companyName }) : `What do you know about ${companyName}?`);

  const single = list.length === 1;
  for (const sector of list) {
    if (hasIcp) {
      questions.push(`Which companies provide ${sector}${sectorSuffix}${forIcp}?`);
      questions.push(`If ${shortIcp} needed ${sector} ${v.supportNoun}${inLocation}, which specialist or ${v.boutiqueAdj} ${v.entityPlural} would you recommend, and why?`);
      if (single) {
        questions.push(`Who are the top specialist ${sector} ${v.entityPlural}${servingIcp} in ${place}?`);
        questions.push(`Compare the best ${v.boutiqueAdj} ${sector} ${v.comparatorEntity}${forIcp}, rather than the ${v.largeRivals}.`);
      }
    } else {
      questions.push(`What are the leading companies in the ${sector} space${inLocation}?`);
      questions.push(`If a ${v.buyerWord} needed ${sector} ${v.supportNoun}${inLocation}, which companies would you recommend and why?`);
      if (single) {
        questions.push(`Who are the top ${sector} companies in ${place}?`);
        questions.push(`Compare the best ${sector} ${v.comparatorEntity} available today.`);
      }
    }
  }

  // Persona is folded in lightly: a single extra probe using the primary
  // sector, so the buyer's role nuances the results without over-narrowing
  // every question.
  if (hasPersona) {
    questions.push(`Which specialist ${list[0]}${sectorSuffix} ${v.entityPlural} would you recommend to ${shortPersona}${inLocation}?`);
  }

  if (keywords.length > 0) {
    questions.push(`Which ${v.keywordEntity} are known for ${keywords.slice(0, 3).join(", ")}${forIcp}?`);
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

// Words that commonly appear at the end of conceptual headings rather than
// brand names. If the last word of an extracted string is in this set, it
// is almost certainly a topic category, not a company name.
const GENERIC_CONCEPT_ENDINGS = new Set([
  "excellence", "capability", "capabilities", "culture", "coverage",
  "mentions", "mention", "trust", "credibility", "research", "strategy",
  "strategies", "innovation", "performance", "awareness", "engagement",
  "relationships", "relationship", "influence", "leadership", "authority",
  "expertise", "quality", "impact", "value", "growth", "success",
  "intelligence", "media", "content", "social", "presence", "visibility",
  "recognition", "reputation", "positioning", "reach", "narrative",
  "approach", "framework", "methodology", "solutions", "solution",
  "insights", "insight", "analytics", "experience", "talent", "services",
  "service", "results", "outcomes", "thinking", "marketing", "advertising",
  "communications", "communication", "information", "knowledge",
  "campaigns", "campaign", "storytelling", "measurement", "monitoring",
  "branding", "planning", "execution", "production", "distribution",
  // domain-specific topic headings that frequently appear in AI-formatted lists
  "network", "model", "models", "infrastructure", "integration", "commerce",
  "platform", "data", "technology", "privacy", "compliance",
  "activation", "monetisation", "monetization", "organisation", "organization",
  "structure", "tier", "inventory", "operations", "revenue", "analytics",
  "loyalty", "consortium", "initiative", "programme", "program",
]);

// Returns true only when the extracted name looks like an actual organisation
// rather than a conceptual heading or topic phrase.
function isLikelyBrandName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  // Brands rarely exceed four words
  if (words.length > 4) return false;
  // Reject if the final word is a generic concept noun
  const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, "");
  if (GENERIC_CONCEPT_ENDINGS.has(lastWord)) return false;
  // Reject if the name contains a preposition mid-phrase (e.g. "Participate in Real",
  // "Press Coverage of Brands"). Ampersand (&) is fine - it appears in real brand names.
  if (words.length > 1 && /\b(in|of|for|is|the|a|an|at|to|with|by|from|about|on|via)\b/i.test(name)) return false;
  return true;
}

export function extractCompetitors(text: string, brand: BrandIdentity | string): string[] {
  const identity = asIdentity(brand);
  const exclude = new Set(
    [identity.name, identity.legalName]
      .filter((x): x is string => !!x)
      .map((x) => x.toLowerCase().trim()),
  );
  const patterns: Array<{ re: RegExp; minWords?: number }> = [
    { re: /(?:companies|firms|agencies|providers|organizations|organisations)(?:\s+(?:like|such as|including|are))\s+([^.]+)/gi },
    // Numbered-list pattern: require at least 2 words to exclude bare single-word
    // topic fragments ("Non", "Closed", "Off", "Build") that appear as list headers.
    { re: /(?:\d+\.\s+\*{0,2})([A-Z][A-Za-z0-9\s&.']+?)(?:\*{0,2}\s*[-–\u2014:])/g, minWords: 2 },
    { re: /\*{2}([A-Z][A-Za-z0-9\s&.']+?)\*{2}/g },
  ];

  const names = new Set<string>();
  for (const { re: pattern, minWords } of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const found = match[1]?.trim();
      if (found && found.length > 2 && found.length < 60 && !exclude.has(found.toLowerCase())) {
        const cleaned = found.replace(/^\d+\.\s*/, "").replace(/\*+/g, "").trim();
        if (cleaned.length > 2 && isLikelyBrandName(cleaned)) {
          if (minWords && cleaned.split(/\s+/).length < minWords) continue;
          names.add(cleaned);
        }
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
  anchored?: boolean;
  intentTier?: "buyer" | "sector" | "identity";
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
    // Strict majority: brand must be mentioned in MORE than half the runs.
    // With RUNS_PER_QUESTION=2, this means 2/2 required (not 1/2).
    const mentioned = mentionRuns * 2 > runCount;
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
      anchored: runs.some((r) => r.anchored),
      intentTier: repr.intentTier,
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

async function probeOpenAI(question: string, identity: BrandIdentity, probeWasAnchored = false, signal?: AbortSignal, accountId?: string, projectId?: string, tokenAccum?: { input: number; output: number }): Promise<ProbeResult | null> {
  const client = createOpenAIClient();
  if (!client) return null;

  try {
    // GPT-5 is a reasoning model, so max_completion_tokens covers BOTH the
    // hidden reasoning tokens and the visible answer. A small budget (e.g.
    // 1500) is frequently exhausted by reasoning alone, leaving the answer
    // empty or truncated and silently dropping brand mentions / competitors.
    // Give it a generous budget so thorough answers fit.
    const response = await client.chat.completions.create({
      model: CHATGPT_MODEL,
      max_completion_tokens: 8000,
      messages: [
        {
          role: "system",
          content: "You are a knowledgeable business advisor. Answer questions directly and thoroughly, naming specific companies where relevant. Be factual and comprehensive.",
        },
        { role: "user", content: question },
      ],
    }, { signal });

    const text = response.choices[0]?.message?.content || "";
    if (!text.trim()) {
      logger.warn({ question, model: CHATGPT_MODEL }, "OpenAI probe returned an empty answer");
      return null;
    }
    const _inputTokens  = response.usage?.prompt_tokens     ?? 0;
    const _outputTokens = response.usage?.completion_tokens ?? 0;
    if (accountId) {
      void logTokenUsage(accountId, "llm-check-probe", "gpt-5", _inputTokens, _outputTokens, projectId);
    }
    if (tokenAccum) { tokenAccum.input += _inputTokens; tokenAccum.output += _outputTokens; }
    if ((response.choices[0] as { finish_reason?: string })?.finish_reason === "length") {
      logger.warn(
        { question, model: "gpt-5", textLength: text.length },
        "OpenAI probe hit the output token limit; answer may be truncated",
      );
    }
    const mentioned = isMentioned(text, identity, probeWasAnchored);

    return {
      question,
      model: "GPT-5 (ChatGPT)",
      response: text,
      mentioned,
      mentionContext: findMentionContext(text, identity),
      competitors: extractCompetitors(text, identity),
      anchored: probeWasAnchored,
    };
  } catch (err: any) {
    logger.error({ err, question }, "OpenAI probe failed");
    return null;
  }
}

async function probeClaude(question: string, identity: BrandIdentity, probeWasAnchored = false, signal?: AbortSignal, accountId?: string, projectId?: string, tokenAccum?: { input: number; output: number }): Promise<ProbeResult | null> {
  const client = createAnthropicClient();
  if (!client) return null;

  try {
    // Give thorough, comprehensive answers (which can list many competitors)
    // room to finish so the brand mention or competitor list isn't cut off.
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: "You are a knowledgeable business advisor. Answer questions directly and thoroughly, naming specific companies where relevant. Be factual and comprehensive.",
      messages: [{ role: "user", content: question }],
    }, { signal });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    if (!text.trim()) {
      logger.warn({ question, model: CLAUDE_MODEL }, "Claude probe returned an empty answer");
      return null;
    }
    const _inputTokens  = response.usage?.input_tokens  ?? 0;
    const _outputTokens = response.usage?.output_tokens ?? 0;
    if (accountId) {
      void logTokenUsage(accountId, "llm-check-probe", "claude-sonnet-4-5", _inputTokens, _outputTokens, projectId);
    }
    if (tokenAccum) { tokenAccum.input += _inputTokens; tokenAccum.output += _outputTokens; }
    if (response.stop_reason === "max_tokens") {
      logger.warn(
        { question, model: "claude-sonnet-4-5", textLength: text.length },
        "Claude probe hit the output token limit; answer may be truncated",
      );
    }
    const mentioned = isMentioned(text, identity, probeWasAnchored);

    return {
      question,
      model: "Claude (Anthropic)",
      response: text,
      mentioned,
      mentionContext: findMentionContext(text, identity),
      competitors: extractCompetitors(text, identity),
      anchored: probeWasAnchored,
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
  knownNamesakes?: string[];
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
  priorityActions: { action: string; rationale: string; priority: string; failedProbes?: string[] }[];
  queryTable: { query: string; appeared: boolean; notes: string }[];
  competitorInsights?: { name: string; description: string }[];
  categoryFraming?: { query: string; themes: string }[];
  narrativeSignals?: { gpt: string[]; claude: string[]; divergence: string | null };
}

export interface AuthorityAssessmentResult {
  assessment: AuthorityAssessment | null;
  assessmentStatus: AssessmentStatus;
  assessmentOutcome: AssessmentOutcome;
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

const DIMENSION_NAMES = AUTHORITY_DIMENSION_NAMES;

export function sanitizeProjectData(raw: unknown): ProjectAuthorityData {
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
    evidenceUrls: strArr(d.evidenceUrls, 30, 300).map((u) =>
      u.includes("://") ? u : `https://${u}`
    ),
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
    knownNamesakes: strArr(d.knownNamesakes, 10, 200),
  };
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
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
          failedProbes: Array.isArray(a.failedProbes)
            ? a.failedProbes.filter((q: unknown): q is string => typeof q === "string").map((q: string) => q.trim().slice(0, 300)).filter(Boolean).slice(0, 5)
            : undefined,
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

  const GENERIC_TERMS = new Set(["agency", "agencies", "united kingdom", "uk", "united states", "us", "usa", "consultancy", "consultancies", "firm", "firms"]);
  const competitorInsights = Array.isArray(parsed.competitorInsights)
    ? parsed.competitorInsights
        .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c: Record<string, unknown>) => ({
          name: typeof c.name === "string" ? c.name.trim().slice(0, 120) : "",
          description: typeof c.description === "string" ? c.description.trim().slice(0, 400) : "",
        }))
        .filter((c: { name: string; description: string }) => c.name && c.description && !GENERIC_TERMS.has(c.name.toLowerCase()))
        .slice(0, 8)
    : undefined;

  const categoryFraming = Array.isArray(parsed.categoryFraming)
    ? parsed.categoryFraming
        .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === "object")
        .map((c: Record<string, unknown>) => ({
          query: typeof c.query === "string" ? c.query.trim().slice(0, 300) : "",
          themes: typeof c.themes === "string" ? c.themes.trim().slice(0, 400) : "",
        }))
        .filter((c: { query: string; themes: string }) => c.query && c.themes)
        .slice(0, 40)
    : undefined;

  const rawNs = parsed.narrativeSignals;
  let narrativeSignals: { gpt: string[]; claude: string[]; divergence: string | null } | undefined;
  if (rawNs && typeof rawNs === "object") {
    const gptArr = Array.isArray(rawNs.gpt)
      ? rawNs.gpt.filter((x: unknown): x is string => typeof x === "string").map((s: string) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 10)
      : [];
    const claudeArr = Array.isArray(rawNs.claude)
      ? rawNs.claude.filter((x: unknown): x is string => typeof x === "string").map((s: string) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 10)
      : [];
    const divergence = typeof rawNs.divergence === "string" && rawNs.divergence.trim()
      ? rawNs.divergence.trim().slice(0, 400)
      : null;
    narrativeSignals = { gpt: gptArr, claude: claudeArr, divergence };
  }

  return {
    index,
    grade: typeof parsed.grade === "string" && /^(A\*|[A-E])$/i.test(parsed.grade.trim()) ? parsed.grade.trim().toUpperCase() : authorityGradeFor(index),
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 1200) : "",
    dimensions,
    topGaps,
    priorityActions,
    queryTable,
    ...(competitorInsights && competitorInsights.length > 0 ? { competitorInsights } : {}),
    ...(categoryFraming && categoryFraming.length > 0 ? { categoryFraming } : {}),
    ...(narrativeSignals ? { narrativeSignals } : {}),
  };
}

export function isCompleteAuthorityAssessment(
  assessment: AuthorityAssessment | null,
): assessment is AuthorityAssessment {
  if (!assessment || !assessment.summary.trim()) return false;
  if (assessment.dimensions.length !== DIMENSION_NAMES.length) return false;
  const names = new Set(assessment.dimensions.map((d) => d.name));
  if (!DIMENSION_NAMES.every((name) => names.has(name))) return false;
  if (assessment.dimensions.some((d) => !d.justification.trim())) return false;
  if (assessment.queryTable.length === 0) return false;
  if (!assessment.categoryFraming || assessment.categoryFraming.length === 0) return false;
  const signals = assessment.narrativeSignals;
  if (!signals || !Array.isArray(signals.gpt) || !Array.isArray(signals.claude)) return false;
  return true;
}

function fallbackAuthorityResult(
  reasonCategory: AssessmentReasonCategory,
): AuthorityAssessmentResult {
  return {
    assessment: null,
    assessmentStatus: fallbackAssessmentStatus(),
    assessmentOutcome: fallbackAssessmentOutcome(reasonCategory),
  };
}

export async function scoreAuthorityWithOutcome(
  companyName: string,
  projectData: ProjectAuthorityData,
  evidence: { question: string; appeared: boolean; competitors: string[]; chatgpt: string; claude: string }[],
  metrics: { presence: number; shareOfVoice: number; visibilityScore: number; weightedVisibilityScore?: number; topCompetitors: { name: string; mentions: number }[] },
  entityClarity?: EntityClarity | null,
  narrativeContext?: { gptContexts: string[]; claudeContexts: string[]; failedQuestions: string[] },
  accountId?: string,
  projectId?: string,
  tokenAccum?: { input: number; output: number },
): Promise<AuthorityAssessmentResult> {
  const client = createAnthropicClient();
  if (!client) return fallbackAuthorityResult("scoring_unavailable");

  const sp = (projectData.spokespeople || []).map((s) => ({
    name: s.name,
    title: s.title,
    expertise: s.expertise,
  }));

  const weightedScoreLine = metrics.weightedVisibilityScore !== undefined && metrics.weightedVisibilityScore !== metrics.visibilityScore
    ? `\nINTENT-WEIGHTED SCORE: ${metrics.weightedVisibilityScore} (buyer-intent probes weighted 1.5x, sector probes 1.0x, identity probe 0.5x - give this more weight than the raw presence % when setting the Authority Index, because buyer-intent mentions are more commercially significant)`
    : "";

  const narrativeContextBlock = narrativeContext && (narrativeContext.gptContexts.length > 0 || narrativeContext.claudeContexts.length > 0)
    ? `

NARRATIVE CONTEXT (sentences from probe responses where the brand appeared - use these ONLY to extract adjectives and framings; do not invent or embellish):
ChatGPT mention contexts:
${narrativeContext.gptContexts.slice(0, 6).map((c, i) => `${i + 1}. ${c}`).join("\n") || "(brand did not appear in ChatGPT probes)"}

Claude mention contexts:
${narrativeContext.claudeContexts.slice(0, 6).map((c, i) => `${i + 1}. ${c}`).join("\n") || "(brand did not appear in Claude probes)"}`
    : "";

  const failedQuestionsBlock = narrativeContext && narrativeContext.failedQuestions.length > 0
    ? `

QUERIES WHERE THE BRAND WAS ABSENT (exact question strings - use these to populate failedProbes on each priorityAction):
${narrativeContext.failedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";

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
- The overall index and all dimension scores must be integers from 0 to 100.
- Calculate the grade strictly from the overall index using these inclusive boundaries: ${AUTHORITY_GRADE_BANDS.map(({ grade, min, max }) => `${grade}: ${min}-${max}`).join("; ")}. Do not choose a grade independently of the index.
- Include all 8 dimensions exactly once, with names exactly as listed above, a non-empty justification and confidence "high", "medium" or "low". The summary must also be non-empty.
- Include 1-5 evidence-grounded priorityActions, each with a non-empty action and rationale and priority "high", "medium" or "low". An empty priorityActions array is not valid. If no corrective action is supported, recommend maintaining or verifying an evidenced strength instead of inventing a gap.
- Use British spelling. No em dashes, use hyphens. No emojis. Plain, non-hyped language.
- Do NOT invent facts, citations, outlets, quotes, competitors or spokespeople. Use only what is provided.
- If the evidence does not support a dimension, score it low and write "No evidence in this run." as the justification with confidence "low". This is expected for message fidelity, factual accuracy, source quality and spokesperson authority when the brand rarely appeared or supplied no URLs or spokespeople.
- Ground every justification in the actual evidence. Presence, prominence and share of voice come from the probe results. Source quality and spokesperson authority come from the supplied URLs and spokespeople only.
- If ENTITY CLARITY below shows the brand name is shared with other well-known organisations, reflect that in the Entity clarity dimension, and in the summary explain that a low presence partly reflects identity confusion (the engines surface the namesakes for the bare name) rather than the brand being absent. Do not name namesakes that are not listed there.

Return STRICT JSON only - no prose before or after, no markdown fences. Exactly this shape:
{
  "index": <overall AI Authority Index integer 0-100>,
  "grade": "<A*|A|B|C|D|E>",
  "summary": "<2 to 3 concise sentences, maximum 60 words total, in plain British English>",
  "dimensions": [{ "name": "Presence", "score": <integer 0-100>, "justification": "<one sentence, maximum 25 words>", "confidence": "high|medium|low" }, ... all 8 dimensions in the order listed],
  "topGaps": ["<the most important visibility gap, maximum 15 words>", ... up to 5],
  "priorityActions": [{ "action": "<what to do, maximum 20 words>", "rationale": "<why, grounded in the evidence, maximum 25 words>", "priority": "high|medium|low", "failedProbes": ["<exact question string where brand was absent and this action would help>", ... up to 3, or omit if not applicable] }, ... 1-5 actions, never an empty array],
  "queryTable": [{ "query": "<the probed question>", "appeared": <true|false>, "notes": "<what the engines said, or which rivals they recommended instead, maximum 30 words>" }, ... exactly one row per query in the evidence],
  "competitorInsights": [{ "name": "<competitor name exactly as it appears in the probe evidence>", "description": "<what this organisation does and why engines recommend it, maximum 35 words, based only on the probe evidence>" }, ... one entry per competitor from the probe evidence that does NOT appear in the client's own competitors list above. Omit tracked competitors. Omit generic terms like 'Agency' or 'United Kingdom'. Maximum 8 entries.],
  "categoryFraming": [{ "query": "<the probed question>", "themes": "<how AI engines frame this topic, maximum 40 words, based only on the probe evidence for this query>" }, ... exactly one entry per probe query. Focus on what the engines DO say - frameworks, dominant terminology, competitor context - not on what the brand failed to do.],
  "narrativeSignals": {
    "gpt": ["<adjective or framing of no more than 6 words used by ChatGPT to describe the brand>", ... 2-6 items, or [] if brand was absent in GPT probes],
    "claude": ["<adjective or framing of no more than 6 words used by Claude to describe the brand>", ... 2-6 items, or [] if brand was absent in Claude probes],
    "divergence": "<one plain sentence describing a material difference in how GPT and Claude frame the brand, or null if the signals are broadly similar or both engines have no data>"
  }
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
      spokespeople: sp,
    },
    null,
    1,
  )}

BRAND WEBSITE AND EVIDENCE URLS (these are web addresses belonging to or citing the brand - treat each entry as a URL, not a label or description):
${JSON.stringify(projectData.evidenceUrls || [], null, 1)}

PRECOMPUTED METRICS (from the probes, for reference - you may refine the index):
${JSON.stringify(metrics, null, 1)}${weightedScoreLine}

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
${narrativeContextBlock}${failedQuestionsBlock}

PROBE EVIDENCE (one entry per query):
${JSON.stringify(evidence, null, 1)}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8000,
      system:
        "You are a precise AI visibility analyst. You never fabricate evidence. You return strict JSON only, with British spelling, no em dashes and no emojis.",
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const _inputTokens  = response.usage?.input_tokens  ?? 0;
    const _outputTokens = response.usage?.output_tokens ?? 0;
    if (accountId) {
      void logTokenUsage(accountId, "llm-check-scoring", "claude-sonnet-4-5", _inputTokens, _outputTokens, projectId);
    }
    if (tokenAccum) { tokenAccum.input += _inputTokens; tokenAccum.output += _outputTokens; }
    const rawAssessmentText = extractJson(text);
    if (!rawAssessmentText) {
      logger.warn(
        {
          companyName,
          stopReason: response.stop_reason,
          outputTokens: _outputTokens,
          responseChars: text.length,
        },
        "Authority scoring returned no complete JSON object",
      );
      return fallbackAuthorityResult(response.stop_reason === "max_tokens" ? "incomplete_response" : "invalid_response");
    }
    let rawAssessment: unknown;
    try {
      rawAssessment = JSON.parse(rawAssessmentText);
    } catch {
      logger.warn(
        {
          companyName,
          stopReason: response.stop_reason,
          outputTokens: _outputTokens,
          responseChars: text.length,
        },
        "Authority scoring returned malformed JSON",
      );
      return fallbackAuthorityResult("invalid_response");
    }
    const assessment = parseAssessment(text);
    if (!assessment) {
      logger.warn(
        {
          companyName,
          stopReason: response.stop_reason,
          outputTokens: _outputTokens,
          responseChars: text.length,
        },
        "Authority scoring JSON could not be normalised",
      );
      return fallbackAuthorityResult("invalid_response");
    }
    const rawValidationIssue = getAuthorityAssessmentValidationIssue(rawAssessment);
    if (rawValidationIssue || !isCompleteAuthorityAssessment(assessment)) {
      logger.warn(
        {
          projectId,
          stopReason: response.stop_reason,
          outputTokens: _outputTokens,
          responseChars: text.length,
          validationStage: rawValidationIssue ? "raw" : "normalised",
          validationIssue: rawValidationIssue ??
            getAuthorityAssessmentValidationIssue(assessment) ??
            { field: "assessment", code: "invalid_value" },
        },
        "Authority scoring failed completeness validation",
      );
      return fallbackAuthorityResult("incomplete_response");
    }
    return {
      assessment,
      assessmentStatus: completeAssessmentStatus(),
      assessmentOutcome: completeAssessmentOutcome(),
    };
  } catch (err: any) {
    logger.error({ err, companyName }, "Authority scoring (stage 2) failed");
    return fallbackAuthorityResult("scoring_error");
  }
}

export async function scoreAuthority(
  companyName: string,
  projectData: ProjectAuthorityData,
  evidence: { question: string; appeared: boolean; competitors: string[]; chatgpt: string; claude: string }[],
  metrics: { presence: number; shareOfVoice: number; visibilityScore: number; weightedVisibilityScore?: number; topCompetitors: { name: string; mentions: number }[] },
  entityClarity?: EntityClarity | null,
  narrativeContext?: { gptContexts: string[]; claudeContexts: string[]; failedQuestions: string[] },
  accountId?: string,
  projectId?: string,
  tokenAccum?: { input: number; output: number },
): Promise<AuthorityAssessment | null> {
  const result = await scoreAuthorityWithOutcome(
    companyName,
    projectData,
    evidence,
    metrics,
    entityClarity,
    narrativeContext,
    accountId,
    projectId,
    tokenAccum,
  );
  return result.assessment;
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
export async function assessEntityClarity(identity: BrandIdentity, accountId?: string, projectId?: string, tokenAccum?: { input: number; output: number }): Promise<EntityClarity | null> {
  const client = createAnthropicClient();
  if (!client) return null;

  const prompt = `A PR team needs to know how clearly the name "${identity.name}" identifies a single company to AI answer engines.

List the well-known companies or organisations commonly referred to as "${identity.name}", most well-known first.${identity.website ? ` The company at ${identity.website} must be included - it is the brand being assessed.` : ""} For each, output one line exactly as:
Full name - one short description including the organisation's website domain where you know it

Example format: Acme Corp - a UK logistics firm (acme.co.uk)

Rules: plain text only, one organisation per line, no preamble, no numbering, British spelling, no em dashes, no emojis. Always include the website domain in parentheses in the description if you know it. If only one organisation is well known by this name, list just that one. Do not invent organisations.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: "You are a precise entity-resolution assistant. You list only real organisations and never invent names.",
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const _inputTokens  = response.usage?.input_tokens  ?? 0;
    const _outputTokens = response.usage?.output_tokens ?? 0;
    if (accountId) {
      void logTokenUsage(accountId, "llm-check-entity", "claude-sonnet-4-5", _inputTokens, _outputTokens, projectId);
    }
    if (tokenAccum) { tokenAccum.input += _inputTokens; tokenAccum.output += _outputTokens; }
    const entities = parseEntityList(text);
    // Pre-seed any namesakes the client explicitly named so they are always
    // treated as competing entities even if Claude didn't list them.
    const knownNamesakes = (identity.knownNamesakes || []).filter(Boolean);
    const seededEntities = [...entities];
    for (const ns of knownNamesakes) {
      const nsNorm = ns.toLowerCase();
      const alreadyListed = seededEntities.some((e) => e.name.toLowerCase().includes(nsNorm.slice(0, 20)));
      if (!alreadyListed) {
        seededEntities.push({ name: ns, description: `${ns} (client-confirmed namesake)` });
      }
    }
    if (seededEntities.length === 0) return null;
    return deriveEntityClarity(identity.name, identity, seededEntities);
  } catch (err: any) {
    logger.error({ err, name: identity.name }, "Entity clarity assessment failed");
    return null;
  }
}

// GET /api/audit-lock - returns the current lock status for a project+auditType pair.
// Called by the frontend on page load so it can show the last-run date and block
// the run button before the user even tries to fire the audit.
llmCheckRouter.get("/audit-lock", async (req: Request, res: Response) => {
  if (!req.account) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
  const auditType = typeof req.query.auditType === "string" ? req.query.auditType.trim() : "visibility";

  if (!projectId) {
    res.json({ locked: false });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(auditLocksTable)
      .where(and(eq(auditLocksTable.projectId, projectId), eq(auditLocksTable.auditType, auditType)))
      .limit(1);

    if (existing.length === 0) {
      res.json({ locked: false });
      return;
    }

    const lastRunAt = existing[0].lastRunAt;
    const msPerDay = 86_400_000;
    const nextAvailableAt = new Date(lastRunAt.getTime() + AUDIT_LOCK_DAYS * msPerDay);
    const now = new Date();
    const locked = nextAvailableAt > now;
    const daysRemaining = locked ? Math.ceil((nextAvailableAt.getTime() - now.getTime()) / msPerDay) : 0;

    res.json({
      locked,
      lastRunAt: lastRunAt.toISOString(),
      nextAvailableAt: nextAvailableAt.toISOString(),
      daysRemaining,
    });
  } catch (err: any) {
    logger.error({ err }, "Audit lock status check failed");
    res.json({ locked: false });
  }
});

llmCheckRouter.get("/llm-check/runs/:runId", async (req: Request, res: Response) => {
  if (!req.account) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
  await expireStaleAuditRuns({ runId, auditType: "visibility", owner: req.account.username });
  const rows = await db.execute(sql`
    SELECT r.run_id, r.project_id, r.status, r.started_at, r.completed_at,
           r.progress_done, r.progress_total, r.error_message, r.saved_id,
           s.result
    FROM audit_runs r
    LEFT JOIN saved_audits s ON s.id = r.saved_id AND s.deleted_at IS NULL
    WHERE r.run_id = ${runId}
      AND r.audit_type = 'visibility'
      AND r.owner = ${req.account.username}
    LIMIT 1
  `);
  const run = rows.rows[0] as any;
  if (!run) {
    res.status(404).json({ error: "Audit run not found" });
    return;
  }
  res.json({
    runId: run.run_id,
    projectId: run.project_id,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    progress: { done: run.progress_done ?? 0, total: run.progress_total ?? 0 },
    error: run.error_message || undefined,
    result: run.status === "succeeded" ? run.result : undefined,
  });
});

llmCheckRouter.get("/llm-check/runs", async (req: Request, res: Response) => {
  if (!req.account) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId.trim() : "";
  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }
  await expireStaleAuditRuns({ projectId, auditType: "visibility", owner: req.account.username });
  const rows = await db.execute(sql`
    SELECT run_id, status, started_at, completed_at, progress_done, progress_total
    FROM audit_runs
    WHERE project_id = ${projectId}
      AND audit_type = 'visibility'
      AND owner = ${req.account.username}
      AND status = 'running'
    ORDER BY started_at DESC
    LIMIT 1
  `);
  const run = rows.rows[0] as any;
  res.json(run ? {
    runId: run.run_id,
    projectId,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    progress: { done: run.progress_done ?? 0, total: run.progress_total ?? 0 },
  } : null);
});

async function handleLlmCheck(req: Request, res: Response, recoveredRun?: RecoverableAuditRun): Promise<void> {
  if (!req.account) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // 1. Monthly GBP spending cap - checked first.
  if (!recoveredRun) {
    const { allowed: spendAllowed, spentGbp, limitGbp } = await checkMonthlySpendLimit(req.account.username);
    if (!spendAllowed) {
      const now = new Date();
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
      const secondsToMonthEnd = Math.max(1, Math.ceil((monthEnd.getTime() - now.getTime()) / 1000));
      res.setHeader("Retry-After", secondsToMonthEnd);
      res.status(429).json({
        error: "Monthly spending limit reached - contact us to discuss your plan.",
        spentGbp: parseFloat(spentGbp.toFixed(4)),
        limitGbp,
      });
      return;
    }
  }

  const { companyName, sector, sectors, keywords, icp, location, persona, projectData, targetPhrases: rawTargetPhrases, businessType: rawBusinessType, projectId: rawProjectId, force: rawForce } = req.body;
  const businessType: BusinessType = (rawBusinessType === "service" || rawBusinessType === "product" || rawBusinessType === "consumer") ? rawBusinessType : "";
  const projectId = typeof rawProjectId === "string" ? rawProjectId.trim() : "";
  const force = rawForce === true;
  const targetPhrases = normaliseExactPhrases(rawTargetPhrases);
  let auditRunId: string | null | undefined = recoveredRun?.runId;

  if (!companyName || typeof companyName !== "string") {
    res.status(400).json({ error: "companyName is required" });
    return;
  }
  if (rawTargetPhrases !== undefined && (
    !Array.isArray(rawTargetPhrases)
    || rawTargetPhrases.length > MAX_TARGET_PHRASES
    || targetPhrases.length !== rawTargetPhrases.length
  )) {
    res.status(400).json({ error: `targetPhrases must contain at most ${MAX_TARGET_PHRASES} unique phrases with canonical IDs.` });
    return;
  }

  // 21-day audit lock: block repeat runs to control LLM costs.
  // Admins can bypass with force=true for legitimate re-runs (e.g. post-relaunch).
  if (projectId && !recoveredRun) {
    try {
      const existing = await db
        .select()
        .from(auditLocksTable)
        .where(and(eq(auditLocksTable.projectId, projectId), eq(auditLocksTable.auditType, "visibility")))
        .limit(1);

      if (existing.length > 0) {
        const lastRunAt = existing[0].lastRunAt;
        const msPerDay = 86_400_000;
        const nextAvailableAt = new Date(lastRunAt.getTime() + AUDIT_LOCK_DAYS * msPerDay);
        if (nextAvailableAt > new Date()) {
          const isAdmin = req.account?.role === "admin";
          if (!force || !isAdmin) {
            const retryAfterSecs = Math.max(1, Math.ceil((nextAvailableAt.getTime() - Date.now()) / 1000));
            res.setHeader("Retry-After", retryAfterSecs);
            res.status(429).json({
              error: `This audit was last run on ${lastRunAt.toLocaleDateString("en-GB")}. The next run is available on ${nextAvailableAt.toLocaleDateString("en-GB")}.`,
              locked: true,
              lastRunAt: lastRunAt.toISOString(),
              nextAvailableAt: nextAvailableAt.toISOString(),
            });
            return;
          }
          // Admin forced the audit past the 21-day lock - log for accountability.
          void logAdminEvent(
            { username: req.account!.username, id: req.account!.userId },
            "forced_llm_audit",
            projectId,
            "project",
            { companyName, lastRunAt: lastRunAt.toISOString() },
          );
        }
      }
    } catch (err: any) {
      logger.warn({ err, projectId }, "Audit lock check failed; proceeding without lock enforcement");
    }
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
    knownNamesakes: authorityData.knownNamesakes,
  };
  if (projectId && !recoveredRun) {
    if (typeof (db as any).execute === "function") {
      auditRunId = await claimAuditRun(projectId, "visibility", req.account.username, req.body);
    }
    if (auditRunId === null) {
      res.status(409).json({ error: "A visibility audit is already running for this project.", running: true });
      return;
    }
  }

  let releaseConcurrency: (() => void) | undefined;
  let leaseHeartbeat: NodeJS.Timeout | undefined;
  try {
    const legacyTestStream = auditRunId === undefined;
    releaseConcurrency = (req as any).holdConcurrencyGuard?.() as (() => void) | undefined;
    if (legacyTestStream) initSse(res);
    else if (!auditRunId) {
      res.status(500).json({ error: "A durable audit run could not be created." });
      return;
    } else {
      res.status(202).json({ runId: auditRunId, status: "running" });
    }

    // Token accumulator: shared mutable reference passed into all LLM functions
    // so the total token spend for this run is known when building the summary.
    // Must be declared before entityClarityPromise so the async entity call can
    // accumulate into it immediately on completion.
    const tokenAccum = { input: 0, output: 0 };

    // Resolve how clearly the brand name identifies the company. Runs concurrently
    // with the probes; independent of their results and fail-soft.
    const entityClarityPromise = assessEntityClarity(identity, req.account?.username, projectId, tokenAccum);

    const generated = generateProbeQuestions(companyName, sectorList, kw, icpProfile, locationProfile, personaProfile, identity, businessType);
    // Omission preserves the legacy buyer-question/generated probe behaviour.
    // An explicit [] is intentional and runs only the separate identity probe.
    // Submitted phrases are grouped by effective query for provider scheduling,
    // while retaining every canonical phrase ID for measurement attribution.
    // Disambiguate confusable names (e.g. "SMG", "Blue Halo") by appending the
    // company's website domain so the AI engines answer about the right company.
    // Apply the same anchoring to generated questions so detection is consistent
    // across all probe types for confusable names.
    const hasTargetPhraseField = rawTargetPhrases !== undefined;
    const rawBuyerQuestions = hasTargetPhraseField
      ? targetPhrases.map((phrase) => phrase.text)
      : (authorityData.buyerQuestions || []).slice(0, LEGACY_MAX_QUESTIONS);
    const buyerQuestions = disambiguateBuyerQuestions(rawBuyerQuestions, identity);
    const effectivePhraseQuestions = new Map(targetPhrases.map((phrase, index) => [phrase.id, buyerQuestions[index] ?? phrase.text]));
    const anchoredGenerated = disambiguateBuyerQuestions(generated, identity);
    const identityProbe = anchoredGenerated[0];
    type ScheduledQuestion = {
      question: string;
      intentTier: "buyer" | "sector" | "identity";
      phraseIds: string[];
    };
    const scheduledQuestions: ScheduledQuestion[] = [{
      question: identityProbe,
      intentTier: "identity",
      phraseIds: [],
    }];
    if (hasTargetPhraseField) {
      const phrasesByQuery = new Map<string, ScheduledQuestion>();
      targetPhrases.forEach((phrase, index) => {
        const question = buyerQuestions[index] ?? phrase.text;
        const existing = phrasesByQuery.get(question);
        if (existing) existing.phraseIds.push(phrase.id);
        else phrasesByQuery.set(question, { question, intentTier: "buyer", phraseIds: [phrase.id] });
      });
      scheduledQuestions.push(...phrasesByQuery.values());
    } else {
      const buyerQuestionSet = new Set(buyerQuestions);
      const legacyQuestions = [...new Set([
        ...buyerQuestions,
        ...anchoredGenerated.slice(1),
      ])].slice(0, LEGACY_MAX_QUESTIONS - 1);
      scheduledQuestions.push(...legacyQuestions.map((question) => ({
        question,
        intentTier: buyerQuestionSet.has(question) ? "buyer" as const : "sector" as const,
        phraseIds: [],
      })));
    }

    // Track which questions were rewritten by disambiguation so probeOpenAI /
    // probeClaude can relax the corroboration check for anchored probes. A
    // question is "anchored" when disambiguation changed it (i.e. it now
    // contains the domain hint). When the AI was told which company is meant,
    // requiring the domain to also appear in the *answer* is unnecessary and
    // silently discards genuine mentions, collapsing scores to near-zero.
    const anchoredQuestions = new Set<string>();
    for (let i = 0; i < rawBuyerQuestions.length; i++) {
      if (buyerQuestions[i] !== rawBuyerQuestions[i]) anchoredQuestions.add(buyerQuestions[i]);
    }
    for (let i = 0; i < generated.length; i++) {
      if (anchoredGenerated[i] !== generated[i]) anchoredQuestions.add(anchoredGenerated[i]);
    }

    const probeAbort = new AbortController();

    // Total individual LLM calls: one per (question × run × model).
    const totalProbeCount = scheduledQuestions.length * RUNS_PER_QUESTION * 2;
    let completedProbes = 0;
    if (auditRunId) {
      leaseHeartbeat = setInterval(() => {
        void updateAuditRunProgress(auditRunId!, completedProbes, totalProbeCount).catch((err) => {
          logger.warn({ err, auditRunId }, "Could not renew visibility audit lease");
        });
      }, 30_000);
      leaseHeartbeat.unref();
    }

    // Wrap each probe so a progress event fires as soon as it settles.
    async function persistProgress(): Promise<void> {
      if (legacyTestStream) {
        sseSend(res, "progress", { done: completedProbes, total: totalProbeCount });
        return;
      }
      await updateAuditRunProgress(auditRunId!, completedProbes, totalProbeCount).catch((err) => {
        logger.warn({ err, auditRunId }, "Could not persist visibility audit progress");
      });
    }

    function trackProbe(p: Promise<ProbeResult | null>): Promise<ProbeResult | null> {
      return p.then(
        async (r) => {
          completedProbes++;
          await persistProgress();
          return r;
        },
        async () => {
          completedProbes++;
          await persistProgress();
          return null;
        },
      );
    }

    const probePromises: Promise<ProbeResult | null>[] = [];
    for (const scheduled of scheduledQuestions) {
      const { question: q, intentTier, phraseIds } = scheduled;
      const anchored = anchoredQuestions.has(q);
      for (let run = 0; run < RUNS_PER_QUESTION; run++) {
        probePromises.push(trackProbe(probeOpenAI(q, identity, anchored, probeAbort.signal, req.account?.username, projectId, tokenAccum)
          .then((result) => result ? { ...result, intentTier, phraseIds } : null)));
        probePromises.push(trackProbe(probeClaude(q, identity, anchored, probeAbort.signal, req.account?.username, projectId, tokenAccum)
          .then((result) => result ? { ...result, intentTier, phraseIds } : null)));
      }
    }

    const results = await Promise.all(probePromises);
    const validResults = results
      .filter((r): r is ProbeResult => r !== null);

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

    // Compute a weighted visibility score that reflects probe intent:
    // buyer-intent questions count 1.5x, sector 1.0x, identity 0.5x.
    const TIER_WEIGHTS: Record<string, number> = { buyer: 1.5, sector: 1.0, identity: 0.5 };
    let wNumerator = 0;
    let wDenominator = 0;
    for (const r of validResults) {
      const w = TIER_WEIGHTS[r.intentTier ?? "sector"] ?? 1.0;
      wDenominator += w;
      if (r.mentioned) wNumerator += w;
    }
    const weightedVisibilityScore = wDenominator > 0 ? Math.round((wNumerator / wDenominator) * 100) : visibilityScore;

    const topCompetitors = aggregateTopCompetitors(validResults);

    const probes = groupProbesByQuery(validResults);
    const phraseMeasurements = buildPhraseMeasurements(targetPhrases, validResults, identity, effectivePhraseQuestions);

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
    const evidence = [...evidenceByQuery.values()].slice(0, MAX_TARGET_PHRASES + 1).map((e) => ({
      question: e.question,
      appeared: e.appeared,
      competitors: [...e.competitors].slice(0, 12),
      chatgpt: e.chatgpt,
      claude: e.claude,
    }));

    // Build narrative context: mention contexts grouped by model (for narrative
    // signals extraction), and the list of questions where the brand was absent
    // (for probe-linked recommendations).
    const gptContexts = validResults
      .filter((r) => r.model.includes("GPT") && r.mentioned && r.mentionContext)
      .map((r) => r.mentionContext!)
      .filter((c, i, arr) => arr.indexOf(c) === i);
    const claudeContexts = validResults
      .filter((r) => r.model.includes("Claude") && r.mentioned && r.mentionContext)
      .map((r) => r.mentionContext!)
      .filter((c, i, arr) => arr.indexOf(c) === i);
    // Failed questions: unique question strings where the brand never appeared
    const failedQuestionSet = new Set<string>();
    for (const r of validResults) {
      if (!r.mentioned) failedQuestionSet.add(r.question);
    }
    const appearedQuestionSet = new Set(validResults.filter((r) => r.mentioned).map((r) => r.question));
    const failedQuestions = [...failedQuestionSet].filter((q) => !appearedQuestionSet.has(q));

    const entityClarity = await entityClarityPromise;

    const authorityResult = await scoreAuthorityWithOutcome(
      companyName,
      authorityData,
      evidence,
      {
        presence,
        shareOfVoice,
        visibilityScore,
        weightedVisibilityScore,
        topCompetitors,
      },
      entityClarity,
      { gptContexts, claudeContexts, failedQuestions },
      req.account?.username,
      projectId,
      tokenAccum,
    );

    const summary = {
      companyName,
      sector: sectorList[0],
      sectors: sectorList,
      icp: icpProfile,
      businessType,
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
      phraseMeasurements,
      measurementSettings: {
        version: 1,
        runsPerPhrase: RUNS_PER_QUESTION,
        providers: [
          { provider: "chatgpt", model: CHATGPT_MODEL },
          { provider: "claude", model: CLAUDE_MODEL },
        ],
      },
      assessment: authorityResult.assessment,
      assessmentStatus: authorityResult.assessmentStatus,
      assessmentOutcome: authorityResult.assessmentOutcome,
      entityClarity,
      detectionVersion: 2,
      _tokenUsage: { inputTokens: tokenAccum.input, outputTokens: tokenAccum.output },
    };

    const savedAt = new Date().toISOString();
    const savedId = auditRunId ?? randomUUID();
    const savedResult = { ...summary, serverSavedId: savedId, serverSavedAt: savedAt };
    if (projectId && "projectId" in savedAuditsTable) {
      const owner = req.account.username;
      const persist = async (tx: any) => {
        if (auditRunId) {
          const claimed = await tx.execute(sql`
            UPDATE audit_runs
            SET status = 'succeeded', completed_at = now(), saved_id = ${savedId}
            WHERE run_id = ${auditRunId}
              AND status = 'running'
              AND worker_id = ${AUDIT_WORKER_ID}
            RETURNING run_id
          `);
          if (claimed.rows.length === 0) {
            throw new Error("Visibility audit lease was lost before completion");
          }
        }
        await tx.insert(savedAuditsTable).values({ id: savedId, projectId, owner, savedAt, result: savedResult, deletedAt: null });
        await tx.insert(auditLocksTable).values({ projectId, auditType: "visibility", owner, lastRunAt: new Date(savedAt) })
          .onConflictDoUpdate({ target: [auditLocksTable.projectId, auditLocksTable.auditType], set: { lastRunAt: new Date(savedAt), owner } });
      };
      if (typeof (db as any).transaction === "function") await db.transaction(persist);
      else await persist(db);
    }
    if (legacyTestStream) {
      sseSend(res, "result", savedResult);
      res.end();
    }
  } catch (err: any) {
    if (auditRunId) {
      await retryAuditRunAfterFailure(auditRunId, "The audit attempt stopped and will be retried automatically.").catch(() => undefined);
    }
    logger.error({ err, companyName }, "LLM visibility check failed");
    if (auditRunId === undefined && !res.writableEnded) {
      sseSend(res, "error", { error: "LLM visibility check failed. Please try again." });
      res.end();
    }
  } finally {
    if (leaseHeartbeat) clearInterval(leaseHeartbeat);
    releaseConcurrency?.();
  }
}

llmCheckRouter.post("/llm-check", llmCheckLimiter, llmCheckConcurrencyGuard, (req, res) => {
  void handleLlmCheck(req, res);
});

export async function resumeVisibilityAuditRun(run: RecoverableAuditRun): Promise<void> {
  if (run.auditType !== "visibility") return;
  const response: any = {
    writableEnded: false,
    status() { return response; },
    json() { response.writableEnded = true; return response; },
    setHeader() { return response; },
    write() { return true; },
    end() { response.writableEnded = true; return response; },
  };
  const request = {
    account: { username: run.owner, role: "client" },
    body: run.payload,
  } as unknown as Request;
  logger.info(
    { runId: run.runId, projectId: run.projectId, attempt: run.attemptCount },
    "Resuming visibility audit after worker restart",
  );
  await handleLlmCheck(request, response, run);
}

export default llmCheckRouter;

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

interface ProbeResult {
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

function brandAliases(companyName: string): string[] {
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

function isMentioned(text: string, companyName: string): boolean {
  if (!text) return false;
  return brandAliases(companyName).some((alias) => aliasRegex(alias).test(text));
}

function normalizeCompetitor(name: string): string {
  const norm = normalizeText(name);
  if (!norm) return "";
  return norm.split(" ").filter((t) => t && !LEGAL_SUFFIXES.has(t)).join(" ");
}

function generateProbeQuestions(
  companyName: string,
  sectors: string[],
  keywords: string[],
  icp: string,
  location: string,
  persona: string,
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

  questions.push(`What do you know about ${companyName}?`);

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

function findMentionContext(text: string, companyName: string): string | null {
  if (!text) return null;
  let idx = -1;
  let matchLen = 0;
  for (const alias of brandAliases(companyName)) {
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

function extractCompetitors(text: string, companyName: string): string[] {
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
      if (found && found.length > 2 && found.length < 60 && found.toLowerCase() !== companyName.toLowerCase()) {
        const cleaned = found.replace(/^\d+\.\s*/, "").replace(/\*+/g, "").trim();
        if (cleaned.length > 2) names.add(cleaned);
      }
    }
  }

  return [...names].slice(0, 10);
}

async function probeOpenAI(question: string, companyName: string): Promise<ProbeResult | null> {
  const client = createOpenAIClient();
  if (!client) return null;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 1500,
      messages: [
        {
          role: "system",
          content: "You are a knowledgeable business advisor. Answer questions directly and thoroughly, naming specific companies where relevant. Be factual and comprehensive.",
        },
        { role: "user", content: question },
      ],
    });

    const text = response.choices[0]?.message?.content || "";
    const mentioned = isMentioned(text, companyName);

    return {
      question,
      model: "GPT-4o (ChatGPT)",
      response: text,
      mentioned,
      mentionContext: findMentionContext(text, companyName),
      competitors: extractCompetitors(text, companyName),
    };
  } catch (err: any) {
    logger.error({ err, question }, "OpenAI probe failed");
    return null;
  }
}

async function probeClaude(question: string, companyName: string): Promise<ProbeResult | null> {
  const client = createAnthropicClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: "You are a knowledgeable business advisor. Answer questions directly and thoroughly, naming specific companies where relevant. Be factual and comprehensive.",
      messages: [{ role: "user", content: question }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const mentioned = isMentioned(text, companyName);

    return {
      question,
      model: "Claude (Anthropic)",
      response: text,
      mentioned,
      mentionContext: findMentionContext(text, companyName),
      competitors: extractCompetitors(text, companyName),
    };
  } catch (err: any) {
    logger.error({ err, question }, "Claude probe failed");
    return null;
  }
}

interface ProjectAuthorityData {
  descriptor?: string;
  legalName?: string;
  boilerplate?: string;
  competitors?: string[];
  evidenceUrls?: string[];
  buyerQuestions?: string[];
  expertiseTopics?: string[];
  spokespeople?: { name?: string; title?: string; expertise?: string[]; linkedin?: string }[];
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
function extractJson(text: string): string | null {
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

function parseAssessment(text: string): AuthorityAssessment | null {
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

async function scoreAuthority(
  companyName: string,
  projectData: ProjectAuthorityData,
  evidence: { question: string; appeared: boolean; competitors: string[]; chatgpt: string; claude: string }[],
  metrics: { presence: number; shareOfVoice: number; visibilityScore: number; topCompetitors: { name: string; mentions: number }[] },
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

  try {
    const generated = generateProbeQuestions(companyName, sectorList, kw, icpProfile, locationProfile, personaProfile);
    // Seed the probe set with the buyer's verbatim questions so the measurement
    // uses real queries, not only generated ones. De-duplicate while preserving
    // the buyer questions first, and cap the total so the run stays bounded.
    const buyerQuestions = (authorityData.buyerQuestions || []).slice(0, 8);
    const questions = [...new Set([...buyerQuestions, ...generated])].slice(0, 18);

    const probePromises: Promise<ProbeResult | null>[] = [];
    for (const q of questions) {
      for (let run = 0; run < RUNS_PER_QUESTION; run++) {
        probePromises.push(probeOpenAI(q, companyName));
        probePromises.push(probeClaude(q, companyName));
      }
    }

    const results = await Promise.all(probePromises);
    const validResults = results.filter((r): r is ProbeResult => r !== null);

    const chatgptResults = validResults.filter((r) => r.model.includes("GPT"));
    const claudeResults = validResults.filter((r) => r.model.includes("Claude"));

    const chatgptMentions = chatgptResults.filter((r) => r.mentioned).length;
    const claudeMentions = claudeResults.filter((r) => r.mentioned).length;
    const totalProbes = validResults.length;
    const totalMentions = validResults.filter((r) => r.mentioned).length;

    const competitorHits = new Map<string, { display: string; count: number }>();
    for (const r of validResults) {
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
    const topCompetitors = [...competitorHits.values()]
      .filter((e) => e.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((e) => ({ name: e.display, mentions: e.count }));

    const visibilityScore = totalProbes > 0 ? Math.round((totalMentions / totalProbes) * 100) : 0;

    const grouped = new Map<string, ProbeResult[]>();
    for (const r of validResults) {
      const key = `${r.model}||${r.question}`;
      const arr = grouped.get(key);
      if (arr) arr.push(r);
      else grouped.set(key, [r]);
    }
    const probes = [...grouped.values()].map((runs) => {
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

    const competitorMentionTotal = validResults.reduce((s, r) => s + r.competitors.length, 0);
    const sovDenom = totalMentions + competitorMentionTotal;
    const shareOfVoice = sovDenom > 0 ? Math.round((totalMentions / sovDenom) * 100) : 0;
    const presence = totalProbes > 0 ? Math.round((totalMentions / totalProbes) * 100) : 0;

    const assessment = await scoreAuthority(companyName, authorityData, evidence, {
      presence,
      shareOfVoice,
      visibilityScore,
      topCompetitors,
    });

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
        chatgpt: { probes: chatgptResults.length, mentions: chatgptMentions, rate: chatgptResults.length > 0 ? Math.round((chatgptMentions / chatgptResults.length) * 100) : 0 },
        claude: { probes: claudeResults.length, mentions: claudeMentions, rate: claudeResults.length > 0 ? Math.round((claudeMentions / claudeResults.length) * 100) : 0 },
      },
      topCompetitors,
      probes,
      assessment,
    };

    res.json(summary);
  } catch (err: any) {
    logger.error({ err, companyName }, "LLM visibility check failed");
    res.status(500).json({ error: "LLM visibility check failed. Please try again." });
  }
});

export default llmCheckRouter;

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

llmCheckRouter.post("/llm-check", llmCheckLimiter, llmCheckConcurrencyGuard, async (req: Request, res: Response) => {
  const { companyName, sector, sectors, keywords, icp, location, persona } = req.body;

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

  logger.info(
    { companyName, sectors: sectorList, hasIcp: icpProfile.length > 0, hasLocation: locationProfile.length > 0, hasPersona: personaProfile.length > 0 },
    "Starting LLM visibility check",
  );

  try {
    const questions = generateProbeQuestions(companyName, sectorList, kw, icpProfile, locationProfile, personaProfile);

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
    };

    res.json(summary);
  } catch (err: any) {
    logger.error({ err, companyName }, "LLM visibility check failed");
    res.status(500).json({ error: "LLM visibility check failed. Please try again." });
  }
});

export default llmCheckRouter;

import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { logger } from "../lib/logger";
import { fetchGeoAuditContext, type GeoAuditFacts } from "../lib/safe-fetch";
import { diagnosticLimiter } from "../middleware/rate-limit";
import { diagnosticConcurrencyGuard } from "../middleware/concurrency-guard";

const diagnosticRouter = Router();

const MAX_CONTENT_CHARS = 50000;

const CATEGORY_NAMES = [
  "Schema & Structured Data",
  "Content Architecture",
  "Source Authority",
  "Earned Media Signals",
  "LLM Visibility",
  "Technical Accessibility",
];

const CATEGORY_MAXES: Record<string, number> = {
  "Schema & Structured Data": 15,
  "Content Architecture": 15,
  "Source Authority": 15,
  "Earned Media Signals": 20,
  "LLM Visibility": 20,
  "Technical Accessibility": 15,
};

const GEO_SYSTEM_PROMPT = `You are an expert in Generative Engine Optimisation (GEO) and AI Engine Optimisation (AEO). You analyse web page content for its readiness to be cited, referenced, and recommended by AI-powered search and answer engines (ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews).

Score each of the following 6 categories from 0 to the maximum shown. Be rigorous — most pages score poorly. Provide specific, actionable recommendations for each category.

Categories (score / max):
1. Schema & Structured Data (0-15): Does the content have Organization schema, FAQ schema, Article schema, author markup? Look for JSON-LD, microdata, or RDFa signals.
2. Content Architecture (0-15): Is content written in answer-first format? Are there clear headings, key takeaway boxes, semantic phrases, entity-rich descriptions? Is it structured for extraction?
3. Source Authority (0-15): Are there author credentials, expert profiles, trust signals, citations to primary sources, NAP consistency indicators?
4. Earned Media Signals (0-20): Evidence of press coverage, backlinks, spokesperson mentions, third-party endorsements, industry reports?
5. LLM Visibility (0-20): Is the content written in a way LLMs can easily cite? Are there clear, quotable statements of fact? Does it answer common questions directly?
6. Technical Accessibility (0-15): Are there indicators of page speed, clean HTML structure, proper heading hierarchy, mobile-friendliness, AI crawler access?

Grounding rules (important):
- A MEASURED FACTS block may be supplied. Those figures were counted directly from the page by a deterministic parser. Treat them as ground truth: quote them exactly (for example image counts, alt-text coverage, schema types found) and never contradict or re-estimate them.
- Do NOT invent or guess statistics, revenue figures, client numbers, dates, or named entities. Only state numbers that appear in the supplied content or the measured facts. If a figure is not present, do not produce one.

Return your analysis as valid JSON only (no markdown, no code fences) in exactly this format:
{
  "overallScore": <number 0-100>,
  "categories": [
    {
      "name": "Schema & Structured Data",
      "score": <number>,
      "max": 15,
      "status": "pass" | "warn" | "fail",
      "findings": ["finding 1", "finding 2"],
      "recommendations": ["recommendation 1", "recommendation 2"]
    }
  ],
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "warnings": ["warning 1", "warning 2", "warning 3"],
  "criticalGaps": ["gap 1", "gap 2", "gap 3"],
  "priorityActions": [
    {
      "priority": "Critical" | "High" | "Medium" | "Low",
      "action": "action description",
      "timeframe": "This week" | "This month" | "This quarter",
      "impact": "High" | "Medium" | "Low",
      "category": "Technical" | "Content" | "Authority"
    }
  ],
  "summary": "2-3 sentence executive summary of the analysis"
}`;

function createAnthropicClient(): Anthropic | null {
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new Anthropic({ baseURL, apiKey });
}

function createOpenAIClient(): OpenAI | null {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new OpenAI({ baseURL, apiKey });
}

export function normaliseResult(raw: any): any {
  const cats = Array.isArray(raw.categories) ? raw.categories : [];
  const catMap = new Map(cats.map((c: any) => [c.name, c]));

  const categories = CATEGORY_NAMES.map((name) => {
    const cat: any = catMap.get(name) || {};
    const max = CATEGORY_MAXES[name];
    const score = typeof cat.score === "number" ? Math.min(Math.max(0, Math.round(cat.score)), max) : 0;
    return {
      name,
      score,
      max,
      status: score / max >= 0.7 ? "pass" : score / max >= 0.4 ? "warn" : "fail",
      findings: Array.isArray(cat.findings) ? cat.findings.filter((f: any) => typeof f === "string").slice(0, 5) : [],
      recommendations: Array.isArray(cat.recommendations) ? cat.recommendations.filter((r: any) => typeof r === "string").slice(0, 5) : [],
    };
  });

  const overallScore = typeof raw.overallScore === "number"
    ? Math.min(100, Math.max(0, Math.round(raw.overallScore)))
    : categories.reduce((s, c) => s + c.score, 0);

  return {
    overallScore,
    categories,
    strengths: Array.isArray(raw.strengths) ? raw.strengths.filter((s: any) => typeof s === "string").slice(0, 5) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w: any) => typeof w === "string").slice(0, 5) : [],
    criticalGaps: Array.isArray(raw.criticalGaps) ? raw.criticalGaps.filter((g: any) => typeof g === "string").slice(0, 5) : [],
    priorityActions: Array.isArray(raw.priorityActions) ? raw.priorityActions.filter((a: any) => a && typeof a.action === "string").slice(0, 12) : [],
    summary: typeof raw.summary === "string" ? raw.summary : "",
  };
}

export function extractJSON(text: string): any {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return JSON.parse(cleaned);
}

// Fixed seed so deterministic-capable engines return repeatable output for the
// same input.
const DETERMINISTIC_SEED = 7;

function formatFacts(facts?: GeoAuditFacts | null): string {
  if (!facts) return "";
  const altPct = facts.imagesTotal > 0 ? Math.round((facts.imagesWithAlt / facts.imagesTotal) * 100) : 0;
  const lines = [
    "MEASURED FACTS (counted directly from the page - treat as ground truth, quote exactly, do not re-estimate):",
    `- Page title present: ${facts.metaTitle ? "yes" : "no"}`,
    `- Meta description present: ${facts.hasMetaDescription ? "yes" : "no"}`,
    `- Canonical URL present: ${facts.hasCanonical ? "yes" : "no"}`,
    `- Open Graph tags present: ${facts.openGraphTagCount}`,
    `- JSON-LD structured data blocks: ${facts.jsonLdBlockCount}${facts.jsonLdTypes.length ? ` (types: ${facts.jsonLdTypes.join(", ")})` : ""}`,
    `- Microdata (itemscope) elements: ${facts.microdataCount}`,
    `- Headings: ${facts.h1Count} H1, ${facts.h2Count} H2, ${facts.h3Count} H3`,
    `- Images: ${facts.imagesTotal} total, ${facts.imagesWithAlt} with alt text, ${facts.imagesWithoutAlt} missing alt text (${altPct}% coverage)`,
    `- Structured lists: ${facts.listCount}, data tables: ${facts.tableCount}`,
    `- robots.txt found: ${facts.hasRobotsTxt ? "yes" : "no"}`,
    `- Sitemap URLs listed: ${facts.sitemapUrlCount === null ? "no sitemap found" : facts.sitemapUrlCount}`,
  ];
  return lines.join("\n");
}

function buildUserMessage(content: string, facts?: GeoAuditFacts | null): string {
  const factsBlock = formatFacts(facts);
  return `Analyse the following web page content for GEO readiness. Return only valid JSON.${factsBlock ? `\n\n${factsBlock}` : ""}\n\n<content>\n${content}\n</content>`;
}

async function analyseWithClaude(content: string, facts?: GeoAuditFacts | null): Promise<any> {
  const client = createAnthropicClient();
  if (!client) throw new Error("Anthropic integration not configured");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    temperature: 0,
    system: GEO_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(content, facts),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  return normaliseResult(extractJSON(textBlock.text));
}

async function analyseWithOpenAI(content: string, facts?: GeoAuditFacts | null): Promise<any> {
  const client = createOpenAIClient();
  if (!client) throw new Error("OpenAI integration not configured");

  const response = await client.chat.completions.create({
    model: "gpt-5",
    max_completion_tokens: 8192,
    // gpt-5 only supports the default temperature (1); seed is still honoured
    // for best-effort determinism on this silent fallback path.
    seed: DETERMINISTIC_SEED,
    messages: [
      {
        role: "system",
        content: GEO_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildUserMessage(content, facts),
      },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("No response from OpenAI");

  return normaliseResult(extractJSON(text));
}

diagnosticRouter.post("/diagnostic", diagnosticLimiter, diagnosticConcurrencyGuard, async (req: Request, res: Response) => {
  const { content, url } = req.body;

  if (!content && !url) {
    res.status(400).json({ error: "Either content or url is required" });
    return;
  }

  if (typeof content === "string" && content.length > MAX_CONTENT_CHARS) {
    res.status(400).json({ error: `Content exceeds maximum length of ${MAX_CONTENT_CHARS} characters.` });
    return;
  }

  let textToAnalyse = "";
  let fetchedUrl: string | undefined;
  let pagesFetched: string[] = [];
  let pageFacts: GeoAuditFacts | undefined;

  if (typeof url === "string" && url.trim()) {
    try {
      const ctx = await fetchGeoAuditContext(url.trim());
      fetchedUrl = ctx.url;
      pagesFetched = ctx.pagesFetched;
      pageFacts = ctx.facts;
      textToAnalyse += ctx.text;
    } catch (err: any) {
      logger.warn({ err: err?.message, url: url.trim() }, "Diagnostic URL fetch failed");
      if (!(typeof content === "string" && content.trim())) {
        res.status(400).json({ error: "Could not fetch that URL. Check the address is correct and publicly reachable, or paste the page content instead." });
        return;
      }
    }
  }

  if (typeof content === "string" && content.trim()) {
    const pasted = content.trim();
    textToAnalyse += (textToAnalyse ? "\n\nADDITIONAL CONTENT SUPPLIED BY USER:\n" : "") + pasted;
  }

  textToAnalyse = textToAnalyse.slice(0, MAX_CONTENT_CHARS);

  if (!textToAnalyse.trim()) {
    res.status(400).json({ error: "Nothing to analyse. Enter a homepage URL or paste page content." });
    return;
  }

  try {
    // Single deterministic engine (Claude) for repeatable results. OpenAI is a
    // silent fallback only if Claude is unavailable, so a normal run is always
    // one engine, temperature 0.
    let result: any;
    try {
      const claudeValue = await analyseWithClaude(textToAnalyse, pageFacts);
      result = {
        ...claudeValue,
        provider: "claude",
        sources: { claude: { score: claudeValue.overallScore, summary: claudeValue.summary } },
      };
    } catch (claudeErr: any) {
      logger.warn({ err: claudeErr?.message }, "Claude failed, falling back to OpenAI");
      try {
        const openaiValue = await analyseWithOpenAI(textToAnalyse, pageFacts);
        result = {
          ...openaiValue,
          provider: "openai",
          sources: { openai: { score: openaiValue.overallScore, summary: openaiValue.summary } },
        };
      } catch (openaiErr: any) {
        logger.error({ claudeErr: claudeErr?.message, openaiErr: openaiErr?.message }, "Both AI providers failed");
        res.status(500).json({ error: "The analysis engine is unavailable right now. Please try again." });
        return;
      }
    }

    if (fetchedUrl) result.fetchedUrl = fetchedUrl;
    if (pagesFetched.length) result.pagesFetched = pagesFetched;
    if (pageFacts) result.pageFacts = pageFacts;

    res.json(result);
  } catch (err: any) {
    logger.error({ err: err.message }, "Diagnostic analysis failed");
    res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

export default diagnosticRouter;

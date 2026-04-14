import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { logger } from "../lib/logger";

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

function normaliseResult(raw: any): any {
  const cats = Array.isArray(raw.categories) ? raw.categories : [];
  const catMap = new Map(cats.map((c: any) => [c.name, c]));

  const categories = CATEGORY_NAMES.map((name) => {
    const cat = catMap.get(name) || {};
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

function extractJSON(text: string): any {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return JSON.parse(cleaned);
}

async function analyseWithClaude(content: string): Promise<any> {
  const client = createAnthropicClient();
  if (!client) throw new Error("Anthropic integration not configured");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    system: GEO_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyse the following web page content for GEO readiness. Return only valid JSON.\n\n<content>\n${content}\n</content>`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  return normaliseResult(extractJSON(textBlock.text));
}

async function analyseWithOpenAI(content: string): Promise<any> {
  const client = createOpenAIClient();
  if (!client) throw new Error("OpenAI integration not configured");

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: GEO_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Analyse the following web page content for GEO readiness. Return only valid JSON.\n\n<content>\n${content}\n</content>`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("No response from OpenAI");

  return normaliseResult(extractJSON(text));
}

function mergeResults(claudeResult: any, openaiResult: any): any {
  const categories = CATEGORY_NAMES.map((name) => {
    const cc = claudeResult.categories.find((c: any) => c.name === name);
    const oc = openaiResult.categories.find((c: any) => c.name === name);
    const max = CATEGORY_MAXES[name];
    const scores = [cc?.score, oc?.score].filter((s) => typeof s === "number") as number[];
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const allFindings = [...new Set([...(cc?.findings || []), ...(oc?.findings || [])])];
    const allRecs = [...new Set([...(cc?.recommendations || []), ...(oc?.recommendations || [])])];
    return {
      name,
      score: avgScore,
      max,
      status: avgScore / max >= 0.7 ? "pass" : avgScore / max >= 0.4 ? "warn" : "fail",
      findings: allFindings.slice(0, 4),
      recommendations: allRecs.slice(0, 4),
    };
  });

  const overallScore = Math.round(categories.reduce((s, c) => s + c.score, 0));

  return {
    overallScore,
    categories,
    strengths: [...new Set([...claudeResult.strengths, ...openaiResult.strengths])].slice(0, 5),
    warnings: [...new Set([...claudeResult.warnings, ...openaiResult.warnings])].slice(0, 5),
    criticalGaps: [...new Set([...claudeResult.criticalGaps, ...openaiResult.criticalGaps])].slice(0, 5),
    priorityActions: [...claudeResult.priorityActions, ...openaiResult.priorityActions]
      .filter((a: any, i: number, arr: any[]) => arr.findIndex((b: any) => b.action === a.action) === i)
      .slice(0, 12),
    summary: claudeResult.summary || openaiResult.summary,
    sources: {
      claude: { score: claudeResult.overallScore, summary: claudeResult.summary },
      openai: { score: openaiResult.overallScore, summary: openaiResult.summary },
    },
  };
}

diagnosticRouter.post("/diagnostic", async (req: Request, res: Response) => {
  const { content, url } = req.body;

  if (!content && !url) {
    res.status(400).json({ error: "Either content or url is required" });
    return;
  }

  if (typeof content === "string" && content.length > MAX_CONTENT_CHARS) {
    res.status(400).json({ error: `Content exceeds maximum length of ${MAX_CONTENT_CHARS} characters.` });
    return;
  }

  const textToAnalyse = typeof content === "string" && content.trim()
    ? content.trim().slice(0, MAX_CONTENT_CHARS)
    : `URL to analyse: ${String(url).slice(0, 2000)}\n(Note: I cannot fetch URLs, so this analysis is based on the URL structure alone. For accurate results, paste the page content directly.)`;

  try {
    const [claudeResult, openaiResult] = await Promise.allSettled([
      analyseWithClaude(textToAnalyse),
      analyseWithOpenAI(textToAnalyse),
    ]);

    if (claudeResult.status === "rejected" && openaiResult.status === "rejected") {
      logger.error({ claudeErr: claudeResult.reason?.message, openaiErr: openaiResult.reason?.message }, "Both AI providers failed");
      res.status(500).json({ error: "Both AI providers failed. Please try again." });
      return;
    }

    let result;
    if (claudeResult.status === "fulfilled" && openaiResult.status === "fulfilled") {
      result = mergeResults(claudeResult.value, openaiResult.value);
      result.provider = "merged";
    } else if (claudeResult.status === "fulfilled") {
      result = { ...claudeResult.value, provider: "claude", sources: { claude: { score: claudeResult.value.overallScore, summary: claudeResult.value.summary } } };
      logger.warn({ err: (openaiResult as PromiseRejectedResult).reason?.message }, "OpenAI failed, using Claude only");
    } else {
      const openaiVal = (openaiResult as PromiseFulfilledResult<any>).value;
      result = { ...openaiVal, provider: "openai", sources: { openai: { score: openaiVal.overallScore, summary: openaiVal.summary } } };
      logger.warn({ err: (claudeResult as PromiseRejectedResult).reason?.message }, "Claude failed, using OpenAI only");
    }

    res.json(result);
  } catch (err: any) {
    logger.error({ err: err.message }, "Diagnostic analysis failed");
    res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

export default diagnosticRouter;

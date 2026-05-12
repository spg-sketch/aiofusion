import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { llmCheckLimiter } from "../middleware/rate-limit";
import { requireAuth } from "../middleware/require-auth";
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

function generateProbeQuestions(companyName: string, sector: string, keywords: string[]): string[] {
  const questions: string[] = [];

  questions.push(`What are the leading companies in the ${sector} space?`);
  questions.push(`If a business needed ${sector} services, which companies would you recommend and why?`);
  questions.push(`Who are the top ${sector} companies in the UK?`);
  questions.push(`What do you know about ${companyName}?`);
  questions.push(`Compare the best ${sector} agencies or providers available today.`);

  if (keywords.length > 0) {
    questions.push(`Which companies are known for ${keywords.slice(0, 3).join(", ")}?`);
  }

  return questions;
}

function findMentionContext(text: string, companyName: string): string | null {
  const lowerText = text.toLowerCase();
  const lowerName = companyName.toLowerCase();
  const idx = lowerText.indexOf(lowerName);
  if (idx === -1) return null;

  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + companyName.length + 120);
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
    const mentioned = text.toLowerCase().includes(companyName.toLowerCase());

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
    const mentioned = text.toLowerCase().includes(companyName.toLowerCase());

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

llmCheckRouter.post("/llm-check", llmCheckLimiter, requireAuth, llmCheckConcurrencyGuard, async (req: Request, res: Response) => {
  const { companyName, sector, keywords } = req.body;

  if (!companyName || typeof companyName !== "string") {
    res.status(400).json({ error: "companyName is required" });
    return;
  }

  if (!sector || typeof sector !== "string") {
    res.status(400).json({ error: "sector is required" });
    return;
  }

  const kw = Array.isArray(keywords) ? keywords.filter((k: any) => typeof k === "string") : [];

  logger.info({ companyName, sector }, "Starting LLM visibility check");

  try {
    const questions = generateProbeQuestions(companyName, sector, kw);

    const probePromises: Promise<ProbeResult | null>[] = [];
    for (const q of questions) {
      probePromises.push(probeOpenAI(q, companyName));
      probePromises.push(probeClaude(q, companyName));
    }

    const results = await Promise.all(probePromises);
    const validResults = results.filter((r): r is ProbeResult => r !== null);

    const chatgptResults = validResults.filter((r) => r.model.includes("GPT"));
    const claudeResults = validResults.filter((r) => r.model.includes("Claude"));

    const chatgptMentions = chatgptResults.filter((r) => r.mentioned).length;
    const claudeMentions = claudeResults.filter((r) => r.mentioned).length;
    const totalProbes = validResults.length;
    const totalMentions = validResults.filter((r) => r.mentioned).length;

    const allCompetitors = new Map<string, number>();
    for (const r of validResults) {
      for (const c of r.competitors) {
        allCompetitors.set(c, (allCompetitors.get(c) || 0) + 1);
      }
    }
    const topCompetitors = [...allCompetitors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, mentions: count }));

    const visibilityScore = totalProbes > 0 ? Math.round((totalMentions / totalProbes) * 100) : 0;

    const summary = {
      companyName,
      sector,
      checkedAt: new Date().toISOString(),
      visibilityScore,
      totalProbes,
      totalMentions,
      byModel: {
        chatgpt: { probes: chatgptResults.length, mentions: chatgptMentions, rate: chatgptResults.length > 0 ? Math.round((chatgptMentions / chatgptResults.length) * 100) : 0 },
        claude: { probes: claudeResults.length, mentions: claudeMentions, rate: claudeResults.length > 0 ? Math.round((claudeMentions / claudeResults.length) * 100) : 0 },
      },
      topCompetitors,
      probes: validResults.map((r) => ({
        question: r.question,
        model: r.model,
        mentioned: r.mentioned,
        mentionContext: r.mentionContext,
        competitors: r.competitors.slice(0, 5),
        responsePreview: r.response.substring(0, 300) + (r.response.length > 300 ? "..." : ""),
      })),
    };

    res.json(summary);
  } catch (err: any) {
    logger.error({ err, companyName }, "LLM visibility check failed");
    res.status(500).json({ error: "LLM visibility check failed. Please try again." });
  }
});

export default llmCheckRouter;

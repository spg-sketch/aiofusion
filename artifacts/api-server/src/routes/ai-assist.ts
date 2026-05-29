import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";
import { aiAssistLimiter } from "../middleware/rate-limit";
import { fetchSiteContent } from "../lib/safe-fetch";

const aiAssistRouter = Router();

function createAnthropicClient(): Anthropic | null {
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new Anthropic({ baseURL, apiKey });
}

const SUPPORTED_FIELDS = ["1.1", "1.2"] as const;
type SupportedField = (typeof SUPPORTED_FIELDS)[number];

const FIELD_INSTRUCTIONS: Record<SupportedField, string> = {
  "1.1":
    'Write a concise, factual 100-word company descriptor suitable for press and PR use. ' +
    'Plain prose, no marketing hype, no bullet points. Aim for roughly 100 words and do not exceed 110. ' +
    'Return JSON in this exact shape: {"descriptor": "the text"}. ' +
    'If the website does not contain enough information to write this confidently, ' +
    'return {"descriptor": "", "notFound": true} instead of inventing details.',
  "1.2":
    'Write a Primary Message for this company in two forms: ' +
    '(a) "short": a punchy summary of six words or fewer, and ' +
    '(b) "long": a fuller version of 25 words or fewer that adds proof or context. ' +
    'Base it strictly on what the website actually says about the business. ' +
    'Return JSON in this exact shape: {"short": "...", "long": "..."}. ' +
    'If there is not enough on the site to do this confidently, ' +
    'return {"short": "", "long": "", "notFound": true} instead of inventing a positioning.',
};

function extractJson(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

aiAssistRouter.post(
  "/ai-assist/draft-field",
  aiAssistLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { url, fieldId } = (req.body ?? {}) as { url?: string; fieldId?: string };

    if (!url || typeof url !== "string" || !url.trim()) {
      res.status(400).json({ error: "A company website URL is required." });
      return;
    }
    if (!fieldId || !SUPPORTED_FIELDS.includes(fieldId as SupportedField)) {
      res.status(400).json({ error: "This field is not supported for AI drafting yet." });
      return;
    }

    const client = createAnthropicClient();
    if (!client) {
      res.status(503).json({ error: "AI drafting is not configured. Please try again later." });
      return;
    }

    let site;
    try {
      site = await fetchSiteContent(url.trim());
    } catch (err) {
      logger.warn({ err, url }, "ai-assist: failed to fetch site");
      res.status(422).json({ error: "Could not read that website. Please check the address and try again." });
      return;
    }

    if (!site.text || site.text.length < 80) {
      res.json({ fieldId, notFound: true, source: site.url });
      return;
    }

    const instruction = FIELD_INSTRUCTIONS[fieldId as SupportedField];
    const prompt =
      `You are helping a PR team fill out a client intake form using only information found on the client's website.\n\n` +
      `Website: ${site.url}\n` +
      `Page title: ${site.title || "(none)"}\n` +
      `Meta description: ${site.description || "(none)"}\n\n` +
      `Website content (may be truncated):\n"""\n${site.text}\n"""\n\n` +
      `Task: ${instruction}\n\n` +
      `Respond with JSON only, no commentary.`;

    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
      const block = message.content[0];
      const raw = block && block.type === "text" ? block.text : "";
      const parsed = extractJson(raw);

      if (!parsed) {
        res.status(502).json({ error: "The AI response could not be read. Please try again." });
        return;
      }

      if (parsed.notFound) {
        res.json({ fieldId, notFound: true, source: site.url });
        return;
      }

      if (fieldId === "1.1") {
        const descriptor = typeof parsed.descriptor === "string" ? parsed.descriptor.trim() : "";
        if (!descriptor) {
          res.json({ fieldId, notFound: true, source: site.url });
          return;
        }
        res.json({ fieldId, draft: descriptor, source: site.url });
        return;
      }

      // fieldId === "1.2"
      const short = typeof parsed.short === "string" ? parsed.short.trim() : "";
      const long = typeof parsed.long === "string" ? parsed.long.trim() : "";
      if (!short && !long) {
        res.json({ fieldId, notFound: true, source: site.url });
        return;
      }
      res.json({ fieldId, draft: { short, long }, source: site.url });
    } catch (err) {
      logger.error({ err, fieldId }, "ai-assist: Anthropic call failed");
      res.status(502).json({ error: "The AI draft could not be generated right now. Please try again." });
    }
  },
);

export default aiAssistRouter;

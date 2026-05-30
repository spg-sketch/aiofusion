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

    // Many marketing sites are JavaScript-rendered, so the visible body text can
    // be nearly empty while the title and meta description carry the real summary.
    // Gate on everything we extracted, not just the body text.
    const combinedContent = `${site.title} ${site.description} ${site.text}`.replace(/\s+/g, " ").trim();
    if (combinedContent.length < 80) {
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

// ── Per-question Optimise: improve the user's OWN answer ──────────────────
// Unlike draft-field (which writes from the website), this takes the text the
// user has already written and rewrites it to be stronger and easier for AI
// models to cite, while preserving their facts and meaning.
// Questions that expose the Optimise control. Must stay in sync with the
// frontend rule in artifacts/aio-fusion/src/IntakeForm.tsx: every free-text
// answer (textarea, dual and dual-list) except the structured pickers 1.8, 1.9
// and 1.10. Short factual `text` fields, checkboxes and headings are excluded.
const OPTIMISE_FIELDS = new Set([
  "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.11", "1.12",
  "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7",
  "3.1", "3.2", "3.3", "3.4",
  "4.2", "4.3", "4.5", "4.7", "4.8",
  "5.1b", "5.2", "5.5", "5.6", "5.7",
  "6.1", "6.2", "6.3", "6.4b", "6.5b", "6.6", "6.7",
  "7.2", "7.3", "7.4", "7.5",
]);

// Tailored instructions for specific questions. Any other field falls back to
// GENERIC_OPTIMISE_INSTRUCTION below.
const OPTIMISE_INSTRUCTIONS: Record<string, string> = {
  "1.1":
    'This is a company descriptor of roughly 100 words for press and PR use. Rewrite it to be clearer, more authoritative and easier for AI search and answer engines to cite. Keep it factual prose with no bullet points, aim for about 100 words and do not exceed 110. ' +
    'Return JSON: {"optimised": "the rewritten descriptor"}.',
  "1.6":
    'This is a list of preferred terms and phrases (a semantic phrase guide). Tighten and improve it, removing duplicates and keeping the user\'s own terms. You may add only close variants that clearly mean the same thing. ' +
    'Return JSON: {"optimised": "the rewritten phrases, kept in the same comma- or line-separated style as the input"}.',
  "2.4":
    'These are industry or category questions the business can answer with authority. Rewrite them to be sharper and to read like the real questions buyers ask AI assistants, keeping the same topics and roughly the same number of questions. ' +
    'Return JSON: {"optimised": "the rewritten questions, in the same layout as the input"}.',
  "1.2":
    'This is a Primary Message in two forms. Rewrite both to be punchier and clearer. "short" must be six words or fewer. "long" must be 25 words or fewer and add proof or context. ' +
    'Return JSON: {"short": "...", "long": "..."}.',
  "1.3":
    'These are additional supporting messages, each with a short and a long form. Rewrite each to be punchier and clearer: every "short" six words or fewer, every "long" 25 words or fewer. Keep the same number of items and the same underlying points. ' +
    'Return JSON: {"items": [{"short": "...", "long": "..."}]}.',
};

const GENERIC_OPTIMISE_INSTRUCTION =
  "Rewrite this answer to be clearer, stronger and easier for AI search and answer engines to cite, while keeping the user's facts, names, numbers and meaning. Keep the same format (prose, list or separate lines) and roughly the same length as the input. " +
  "If the answer is mostly factual data such as names, addresses, URLs, phone numbers, dates or contact details, return it unchanged or only lightly tidied and never alter the actual data. " +
  'Return JSON: {"optimised": "the rewritten answer, in the same layout as the input"}.';

function hasOptimiseContent(fieldId: string, value: unknown): boolean {
  if (fieldId === "1.2") {
    const v = value as { short?: string; long?: string } | null;
    return !!v && typeof v === "object" && (!!(v.short || "").trim() || !!(v.long || "").trim());
  }
  if (fieldId === "1.3") {
    return (
      Array.isArray(value) &&
      value.some((it) => !!((it?.short as string) || "").trim() || !!((it?.long as string) || "").trim())
    );
  }
  return typeof value === "string" && value.trim().length > 0;
}

aiAssistRouter.post(
  "/ai-assist/optimise-field",
  aiAssistLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { fieldId, value, companyName } = (req.body ?? {}) as {
      fieldId?: string;
      value?: unknown;
      companyName?: string;
    };

    if (!fieldId || !OPTIMISE_FIELDS.has(fieldId)) {
      res.status(400).json({ error: "This field cannot be optimised." });
      return;
    }
    if (!hasOptimiseContent(fieldId, value)) {
      res.status(400).json({ error: "Write your own answer first, then Optimise will improve it." });
      return;
    }

    const client = createAnthropicClient();
    if (!client) {
      res.status(503).json({ error: "AI optimisation is not configured. Please try again later." });
      return;
    }

    const instruction = OPTIMISE_INSTRUCTIONS[fieldId] ?? GENERIC_OPTIMISE_INSTRUCTION;
    const prompt =
      `You are an expert PR and GEO (generative engine optimisation) editor improving one answer a client wrote on an intake form.\n\n` +
      (companyName && companyName.trim() ? `Company: ${companyName.trim()}\n\n` : "") +
      `Improve the user's OWN answer below. Strict rules:\n` +
      `- Preserve every fact, name, number, product and claim the user provided. Do not invent new facts or details.\n` +
      `- Do not replace their answer with generic marketing boilerplate, and never use placeholders like [Company Name], [audience] or [year].\n` +
      `- Keep the user's meaning and voice. Just make it clearer, stronger and easier for AI models to cite.\n` +
      `- Use British English. Respond with JSON only, no commentary.\n\n` +
      `Field task: ${instruction}\n\n` +
      `The user's current answer (JSON):\n"""\n${JSON.stringify(value)}\n"""`;

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

      if (fieldId === "1.2") {
        const short = typeof parsed.short === "string" ? parsed.short.trim() : "";
        const long = typeof parsed.long === "string" ? parsed.long.trim() : "";
        if (!short && !long) {
          res.status(502).json({ error: "The AI did not return a usable result. Please try again." });
          return;
        }
        res.json({ fieldId, short, long });
        return;
      }

      if (fieldId === "1.3") {
        const items = Array.isArray(parsed.items)
          ? parsed.items
              .map((it: { short?: unknown; long?: unknown }) => ({
                short: typeof it?.short === "string" ? it.short.trim() : "",
                long: typeof it?.long === "string" ? it.long.trim() : "",
              }))
              .filter((it: { short: string; long: string }) => it.short || it.long)
          : [];
        if (items.length === 0) {
          res.status(502).json({ error: "The AI did not return a usable result. Please try again." });
          return;
        }
        res.json({ fieldId, items });
        return;
      }

      // string fields: 1.1, 1.6, 2.4
      const optimised = typeof parsed.optimised === "string" ? parsed.optimised.trim() : "";
      if (!optimised) {
        res.status(502).json({ error: "The AI did not return a usable result. Please try again." });
        return;
      }
      res.json({ fieldId, optimised });
    } catch (err) {
      logger.error({ err, fieldId }, "ai-assist: optimise-field call failed");
      res.status(502).json({ error: "The AI optimisation could not be generated right now. Please try again." });
    }
  },
);

export default aiAssistRouter;

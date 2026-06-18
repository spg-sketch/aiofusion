import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, projectsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { normUsername } from "../lib/platform-auth";
import { fetchSiteContentWithSubpages } from "../lib/safe-fetch";
import { deepStripEmDashes } from "../lib/text-sanitise";

const adminRouter = Router();

const MODEL = "claude-sonnet-4-6";
const BRITISH_RULE =
  "Use British English spelling throughout (optimise, organisation, programme, colour, etc.). " +
  "Do not use em dashes; use hyphens or rewrite the sentence. Do not use emojis.";

function createAnthropicClient(): Anthropic | null {
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) return null;
  return new Anthropic({ baseURL, apiKey });
}

function initSse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const flush = (res as unknown as { flushHeaders?: () => void }).flushHeaders;
  if (typeof flush === "function") flush.call(res);
}

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Try stripping literal newlines inside strings
    try {
      return JSON.parse(slice.replace(/(?<=[":,\[{]\s*)(\n)/g, "\\n"));
    } catch {
      return null;
    }
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function requireAdmin(
  req: Request,
  res: Response,
  next: () => void,
): void {
  if (!req.account || req.account.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}

adminRouter.post(
  "/admin/generate-from-url",
  requirePlatformAuth,
  requireAdmin as unknown as Parameters<typeof adminRouter.post>[1],
  async (req: Request, res: Response): Promise<void> => {
    const rawUrl =
      typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const companyHint =
      typeof req.body?.companyName === "string"
        ? req.body.companyName.trim()
        : "";

    if (!rawUrl) {
      res.status(400).json({ error: "URL is required." });
      return;
    }

    initSse(res);

    try {
      // ── Step 1: Scrape site ───────────────────────────────────────────
      sse(res, "progress", {
        step: "scraping",
        message: "Scraping website content...",
      });

      const normalised = /^https?:\/\//i.test(rawUrl)
        ? rawUrl
        : `https://${rawUrl}`;

      let siteContent = "";
      let homepageTitle = "";
      try {
        const { homepage, subpages } = await fetchSiteContentWithSubpages(
          normalised,
          5000,
          2500,
          4,
        );
        const parts: string[] = [];
        if (homepage.title) {
          homepageTitle = homepage.title;
          parts.push(`Page title: ${homepage.title}`);
        }
        if (homepage.description)
          parts.push(`Meta description: ${homepage.description}`);
        if (homepage.text)
          parts.push(`Homepage content:\n${homepage.text}`);
        for (const sp of subpages) {
          if (sp.text)
            parts.push(`\n--- ${sp.label} ---\n${sp.text}`);
        }
        siteContent = parts.join("\n").slice(0, 12000);
      } catch (err) {
        logger.warn({ err, url: normalised }, "admin generate: scrape failed");
        siteContent = `Website URL: ${normalised}`;
      }

      // ── Step 2: Generate intake with Claude ───────────────────────────
      sse(res, "progress", {
        step: "generating",
        message: "Generating full project profile with AI (this takes ~30 seconds)...",
      });

      const client = createAnthropicClient();
      if (!client) {
        sse(res, "error", { error: "AI service is not configured." });
        res.end();
        return;
      }

      const prompt = `You are an expert marketing and PR intelligence analyst. Given the website content below, generate a comprehensive intake profile for this company. This profile will be used to configure an AI Authority and GEO (Generative Engine Optimisation) platform.

${BRITISH_RULE}

WEBSITE URL: ${normalised}
${companyHint ? `COMPANY NAME (hint): ${companyHint}` : ""}

WEBSITE CONTENT:
${siteContent}

Instructions:
- Be specific and factual. Only use information visible in or clearly implied by the website content.
- Where information is not visible, make reasonable inferences based on the company type, sector, and tone.
- Do NOT invent specific client names, award names, or claims not supported by the content.
- Generate all fields thoroughly - this is the foundation for AI visibility work.

Return ONLY a valid JSON object (no markdown, no code fences, no commentary) in exactly this structure:

{
  "companyName": "Short brand name used in common usage",
  "sector": "Primary sector / industry, e.g. 'Global PR and Communications Agency'",
  "formData": {
    "1.1": "Company descriptor for press and AI use: 200-250 words covering who they are, what they do, the audiences they serve, and their key differentiators. Write in third person. End with founding year or HQ location if known.",
    "1.4": "Evidence URLs: list website pages, case study URLs, news, awards pages. One URL per line. Include the homepage and 3-5 key internal pages.",
    "1.5": "Topics and associations to avoid in media or AI. If none obvious from content, write: None identified.",
    "1.7": "8-12 topics and themes the brand has genuine expertise in. Comma-separated. Should match their sector, services, and content.",
    "1.9": "5-8 media and publication categories where this company earns or seeks coverage. Comma-separated.",
    "1.10": "5-8 media categories where their target customers spend time. Comma-separated.",
    "2.1": "Top 8 pre-purchase questions with answers. Format each as: Q: [question]\\nA: [2-3 sentence answer]\\n\\n",
    "2.2": "3-4 post-purchase or onboarding questions with answers. Same format.",
    "2.3": "3 common misconceptions or objections. Format each as: Misconception: [text]\\nReality: [text]\\n\\n",
    "2.4": "4-6 industry questions this company is expert enough to answer authoritatively. One per line.",
    "2.5": "Homepage positioning summary in 40-50 words. Clear, AI-readable, no jargon.",
    "2.6": "Core services/products. One per line: [Service name]: [one-sentence description] - [who it is for]",
    "2.7": "Search phrases per service area. Format: [Service]: [phrase 1, phrase 2, phrase 3, phrase 4]",
    "4.1": "Full legal or formal trading name",
    "4.2": "Sub-brands, product lines, or trading names. If none, repeat main brand name.",
    "4.3": "LLM boilerplate sentence: We help [audience] [achieve outcome] by [method].",
    "4.4": "Primary sector and any relevant sub-sectors",
    "4.5": "Geographies of operation: countries, regions, or cities visible from the site",
    "4.6": "Founding year if visible, otherwise empty string",
    "4.7": "Trust signal URLs: awards pages, accreditations, press coverage, case studies. One per line.",
    "5.5": "Brief assessment: is this company likely to appear in AI-generated answers? Consider their scale, reputation, and digital footprint.",
    "5.6": "8-10 questions a prospective client asks before hiring. One per line.",
    "5.7": "6-10 industry trend topics where this company has specialist expertise. Comma-separated.",
    "6.2": "Website URL and any visible contact details",
    "6.3": "Social media profile URLs visible on site. One per line. Leave empty if none visible.",
    "6.7": "Key website pages and likely H1 headings. Format: [Page name]: [H1 or likely heading]",
    "7.3": "Third-party profile URLs: LinkedIn company page, Wikipedia, Crunchbase, industry directories. One per line."
  },
  "duals": {
    "1.2": {
      "short": "Primary positioning message in 8-10 words",
      "long": "Extended version in 20-25 words adding proof point or context"
    }
  },
  "dualLists": {
    "1.3": [
      { "short": "6 words or fewer", "long": "Supporting message in 20-25 words" },
      { "short": "6 words or fewer", "long": "Supporting message in 20-25 words" },
      { "short": "6 words or fewer", "long": "Supporting message in 20-25 words" }
    ],
    "3.1": [
      { "short": "Primary buyer persona job title", "long": "Description of their role, seniority, priorities, and what they need from a provider like this" },
      { "short": "Secondary buyer persona job title", "long": "Description of their role and priorities" }
    ],
    "3.2": [
      { "short": "", "long": "Ideal client: organisation type, size, sector, and key characteristics" },
      { "short": "", "long": "Second ideal client type if the company serves multiple segments" }
    ],
    "3.5": [
      { "short": "", "long": "First pain point or challenge this company solves for clients" },
      { "short": "", "long": "Second pain point" },
      { "short": "", "long": "Third pain point" }
    ],
    "3.6": [
      { "short": "", "long": "Primary outcome clients achieve, with example or metric if visible on site" },
      { "short": "", "long": "Second valued outcome" }
    ]
  },
  "spokespeople": [],
  "products": [
    { "id": "prod-1", "name": "Service or product name", "description": "One-sentence description", "audience": "Who this is for" }
  ],
  "productQueries": [
    { "area": "Service area", "phrases": "search phrase 1, search phrase 2, search phrase 3, search phrase 4" }
  ],
  "stringLists": {
    "3.3": ["City or country 1", "City or country 2"],
    "4.8": ["Direct competitor 1", "Direct competitor 2", "Direct competitor 3", "Direct competitor 4", "Direct competitor 5"]
  },
  "businessCategories": ["Business category 1", "Business category 2", "Business category 3"],
  "audienceCategories": ["Audience segment 1", "Audience segment 2", "Audience segment 3"],
  "llmQueries": {
    "v": 1,
    "discovery": [
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)"
    ],
    "shortlist": [
      "Best [service type] for [audience or use case]",
      "Who provides [specific service] for [industry]",
      "Top [service type] agencies in [geography]",
      "Which [service type] firm is best for [outcome]",
      "Best [service type] companies [year]",
      "Leading [service] providers for [sector]"
    ],
    "comparison": [
      "[Company name] vs [competitor] - which is better for [use case]",
      "[Company name] review - is it worth it for [audience]",
      "What do clients say about [company name]",
      "[Company name] alternatives for [service type]",
      "How does [company name] compare to [competitor]",
      "Should I choose [company name] or [competitor] for [service]"
    ]
  }
}

LLM query rules:
- discovery: researching the problem space. NO company name. Natural conversational questions.
- shortlist: actively looking for a provider. NO company name. "best X" or "who provides X" format.
- comparison: due diligence. MUST include the actual company name. May include competitor names.

Return ONLY the JSON object. Absolutely no other text before or after it.`;

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });

      const rawText = message.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      const generated = extractJson(rawText) as Record<string, unknown> | null;
      if (!generated) {
        logger.error({ rawText: rawText.slice(0, 500) }, "admin generate: JSON parse failed");
        sse(res, "error", {
          error: "Could not parse AI response. Please try again.",
        });
        res.end();
        return;
      }

      // ── Step 3: Build intake and save to DB ───────────────────────────
      sse(res, "progress", { step: "saving", message: "Saving project..." });

      const now = new Date();
      const companyName =
        (typeof generated.companyName === "string" && generated.companyName.trim())
          ? generated.companyName.trim()
          : companyHint || homepageTitle || "Generated project";
      const sector =
        (typeof generated.sector === "string" && generated.sector.trim())
          ? generated.sector.trim()
          : "Awaiting set-up";

      const slug = slugify(companyName) || "project";
      const rand = Math.random().toString(36).slice(2, 6);
      const projectId = `gen-${slug}-${rand}`;

      const intake = deepStripEmDashes({
        formData: (generated.formData ?? {}) as Record<string, unknown>,
        duals: (generated.duals ?? {}) as Record<string, unknown>,
        dualLists: (generated.dualLists ?? {}) as Record<string, unknown>,
        spokespeople: Array.isArray(generated.spokespeople)
          ? generated.spokespeople
          : [],
        products: Array.isArray(generated.products) ? generated.products : [],
        productQueries: Array.isArray(generated.productQueries)
          ? generated.productQueries
          : [],
        stringLists: (generated.stringLists ?? {}) as Record<string, unknown>,
        businessCategories: Array.isArray(generated.businessCategories)
          ? generated.businessCategories
          : [],
        audienceCategories: Array.isArray(generated.audienceCategories)
          ? generated.audienceCategories
          : [],
        mediaCategories: [],
        llmQueries: (generated.llmQueries ?? {
          v: 1,
          discovery: [],
          shortlist: [],
          comparison: [],
        }) as Record<string, unknown>,
        intakeStatus: "Accepted",
        acceptedAt: now.toISOString(),
        preOptimiseSnapshot: null,
        optimisedFields: [],
        aiWebsite: normalised,
        confirmedEntity: null,
      });

      const owner = normUsername(req.account!.username);

      await db.insert(projectsTable).values({
        id: projectId,
        name: companyName,
        data: {
          sector,
          website: normalised,
          color: "#1f748f",
          generatedFromUrl: true,
        },
        intake,
        logo: null,
        owner,
        updatedAt: now,
        deletedAt: null,
      });

      logger.info(
        { projectId, companyName, url: normalised, owner },
        "admin generate: project created",
      );

      sse(res, "result", { projectId, companyName });
      res.end();
    } catch (err) {
      logger.error({ err }, "admin generate-from-url failed");
      sse(res, "error", {
        error: "Something went wrong generating the project. Please try again.",
      });
      res.end();
    }
  },
);

export default adminRouter;

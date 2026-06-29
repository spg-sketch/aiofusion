import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, auditLocksTable, projectsTable, tokenUsageTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { normUsername } from "../lib/platform-auth";
import { fetchSiteContentWithSubpages, fetchGeoAuditContext } from "../lib/safe-fetch";
import { deepStripEmDashes } from "../lib/text-sanitise";
import {
  analyseWithClaude,
} from "./diagnostic";

const adminRouter = Router();

const MODEL = "claude-sonnet-4-6";
const INTAKE_GEN_TIMEOUT_MS = 120_000;

const BRITISH_RULE =
  "Use British English spelling throughout (optimise, organisation, programme, colour, etc.). " +
  "Do not use em dashes; use hyphens or rewrite the sentence. Do not use emojis.";

const PROJECT_COLORS = [
  "#C8497A",
  "#1f748f",
  "#2896b9",
  "#165265",
  "#D4922A",
  "#3D9B6B",
];

function randomColor(): string {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "P";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function generateProjectId(companyName: string): string {
  const slug = slugify(companyName) || "project";
  const rand = Math.random().toString(36).slice(2, 6);
  return `gen-${slug}-${rand}`;
}

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

function sanitiseJsonControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += "\\u" + code.toString(16).padStart(4, "0"); continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
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
    try {
      return JSON.parse(sanitiseJsonControlChars(slice));
    } catch {
      // Last-resort: strip literal newlines inside strings
      try {
        return JSON.parse(slice.replace(/(?<=[":,\[{]\s*)(\n)/g, "\\n"));
      } catch {
        return null;
      }
    }
  }
}

async function saveProjectToDb(
  projectId: string,
  ownerUsername: string,
  projectData: Record<string, unknown>,
  intake: Record<string, unknown>,
  normalised: string,
): Promise<void> {
  const now = new Date();
  const name = typeof projectData.name === "string" ? projectData.name : "";
  await db
    .insert(projectsTable)
    .values({
      id: projectId,
      name,
      data: projectData as object,
      intake,
      logo: null,
      owner: ownerUsername,
      updatedAt: now,
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: projectsTable.id,
      set: {
        name,
        data: projectData as object,
        intake,
        owner: ownerUsername,
        updatedAt: now,
      },
    });
  logger.info({ projectId, name, url: normalised, owner: ownerUsername }, "admin generate: project created");
}

async function updateProjectData(
  projectId: string,
  dataUpdate: Record<string, unknown>,
): Promise<void> {
  await db
    .update(projectsTable)
    .set({ data: sql`${projectsTable.data} || ${JSON.stringify(dataUpdate)}::jsonb`, updatedAt: new Date() })
    .where(eq(projectsTable.id, projectId));
}

adminRouter.post(
  "/admin/generate-from-url",
  requirePlatformAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.account || req.account.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }

    const rawUrl =
      typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const companyHint =
      typeof req.body?.companyName === "string"
        ? req.body.companyName.trim().slice(0, 200)
        : "";

    if (!rawUrl) {
      res.status(400).json({ error: "URL is required." });
      return;
    }

    const client = createAnthropicClient();
    if (!client) {
      res.status(503).json({ error: "AI is not configured. Please try again later." });
      return;
    }

    initSse(res);

    try {
      // ── Step 1: Scrape site ───────────────────────────────────────────
      sse(res, "step", { label: "Scraping site" });

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
        siteContent = parts.join("\n").slice(0, 18000);
      } catch (err) {
        logger.warn({ err, url: normalised }, "admin generate: scrape failed, continuing with URL only");
        siteContent = `Website URL: ${normalised}`;
      }

      // ── Step 2: Generate intake with Claude ───────────────────────────
      sse(res, "step", { label: "Generating intake" });

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
    "1.8": "Spokespeople with name, title, area of expertise if detectable from site - or leave as empty string.",
    "1.9": "5-8 media and publication categories where this company earns or seeks coverage. Comma-separated.",
    "1.10": "5-8 media categories where their target customers spend time. Comma-separated.",
    "2.1": "Top 8 pre-purchase questions with answers. Format each as: Q: [question]\\nA: [2-3 sentence answer]\\n\\n",
    "2.2": "3-4 post-purchase or onboarding questions with answers. Same format.",
    "2.3": "3 common misconceptions or objections. Format each as: Misconception: [text]\\nReality: [text]\\n\\n",
    "2.4": "4-6 industry questions this company is expert enough to answer authoritatively. One per line.",
    "2.5": "Homepage positioning summary in 40-50 words. Clear, AI-readable, no jargon.",
    "2.6": "Core services/products. One per line: [Service name]: [one-sentence description] - [who it is for]",
    "2.7": "Search phrases per service area. Format: [Service]: [phrase 1, phrase 2, phrase 3, phrase 4]",
    "3.5b": "The key challenges and problems the company solves for clients.",
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
    "v": "1.6",
    "discovery": [
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)",
      "Natural language question about the problem space (no company name)"
    ],
    "shortlist": [
      "Best [service type] for [audience or use case]",
      "Who provides [specific service] for [industry]",
      "Top [service type] agencies in [geography]",
      "Which [service type] firm is best for [outcome]"
    ],
    "comparison": [
      "[Company name] vs [competitor] - which is better for [use case]",
      "[Company name] review - is it worth it for [audience]",
      "What do clients say about [company name]",
      "[Company name] alternatives for [service type]"
    ]
  }
}

LLM query rules:
- discovery: researching the problem space. NO company name. Natural conversational questions.
- shortlist: actively looking for a provider. NO company name. "best X" or "who provides X" format.
- comparison: due diligence. MUST include the actual company name. May include competitor names.

Return ONLY the JSON object. Absolutely no other text before or after it.`;

      let generated: Record<string, unknown> | null = null;

      try {
        const message = await Promise.race([
          client.messages.create({
            model: MODEL,
            max_tokens: 8192,
            messages: [{ role: "user", content: prompt }],
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), INTAKE_GEN_TIMEOUT_MS),
          ),
        ]);

        const rawText = (message as { content?: { type?: string; text?: string }[] })
          .content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("") ?? "";

        generated = extractJson(rawText) as Record<string, unknown> | null;
      } catch (err) {
        logger.error({ err }, "admin generate: intake generation failed");
        sse(res, "error", { error: "Intake generation timed out or failed. Please try again." });
        res.end();
        return;
      }

      if (!generated) {
        logger.error({}, "admin generate: JSON parse failed");
        sse(res, "error", { error: "Could not parse AI response. Please try again." });
        res.end();
        return;
      }

      // ── Step 2b: Fallback LLM query generation (403 / no content) ────
      // When the scraper is blocked (403) or returns no useful content,
      // Claude has nothing to base llmQueries on and leaves the arrays empty.
      // Run a short, targeted call using just company name, sector, and URL
      // so field 1.6 is always populated on the resulting project.
      const rawLlmQueries = generated.llmQueries as Record<string, unknown> | undefined;
      const llmQueriesEmpty =
        !rawLlmQueries ||
        (
          (!Array.isArray(rawLlmQueries.discovery) || (rawLlmQueries.discovery as unknown[]).length === 0) &&
          (!Array.isArray(rawLlmQueries.shortlist) || (rawLlmQueries.shortlist as unknown[]).length === 0) &&
          (!Array.isArray(rawLlmQueries.comparison) || (rawLlmQueries.comparison as unknown[]).length === 0)
        );

      if (llmQueriesEmpty) {
        const fallbackCompanyName =
          (companyHint) ||
          (typeof generated.companyName === "string" ? generated.companyName.trim() : "") ||
          "the company";
        const fallbackSector =
          (typeof generated.sector === "string" ? generated.sector.trim() : "") ||
          "their industry";

        const fallbackPrompt = `Generate GEO (Generative Engine Optimisation) search queries for the following company. Return ONLY a valid JSON object, no other text.

Company name: ${fallbackCompanyName}
Sector: ${fallbackSector}
Website: ${normalised}

Return this exact structure:
{
  "v": "1.6",
  "discovery": ["question 1", "question 2", "question 3", "question 4"],
  "shortlist": ["best X for Y 1", "best X for Y 2", "best X for Y 3", "best X for Y 4"],
  "comparison": ["${fallbackCompanyName} vs competitor 1", "${fallbackCompanyName} review 2", "what do clients say about ${fallbackCompanyName}", "${fallbackCompanyName} alternatives 4"]
}

Rules:
- discovery: natural conversational questions about the problem space. NO company name.
- shortlist: "best X" or "who provides X" format. NO company name.
- comparison: due diligence queries that MUST include ${fallbackCompanyName}.
- Use British spelling. No em dashes.`;

        try {
          const fallbackMsg = await Promise.race([
            client.messages.create({
              model: MODEL,
              max_tokens: 1024,
              messages: [{ role: "user", content: fallbackPrompt }],
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 30_000),
            ),
          ]);
          const fallbackText = (fallbackMsg as { content?: { type?: string; text?: string }[] })
            .content
            ?.filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join("") ?? "";
          const fallbackParsed = extractJson(fallbackText) as Record<string, unknown> | null;
          if (
            fallbackParsed &&
            (Array.isArray(fallbackParsed.discovery) || Array.isArray(fallbackParsed.shortlist))
          ) {
            generated.llmQueries = fallbackParsed;
          }
        } catch (err) {
          logger.warn({ err }, "admin generate: fallback llmQueries call failed (non-fatal)");
        }
      }

      // ── Step 3: Build intake and save to DB ───────────────────────────
      sse(res, "step", { label: "Saving project" });

      const now = new Date();
      const companyName =
        (companyHint) ||
        (typeof generated.companyName === "string" && generated.companyName.trim()
          ? generated.companyName.trim()
          : "") ||
        homepageTitle.split("|")[0].split("-")[0].trim() ||
        "Generated project";

      const sector =
        (typeof generated.sector === "string" && generated.sector.trim())
          ? generated.sector.trim()
          : "Awaiting set-up";

      const formData = (generated.formData && typeof generated.formData === "object")
        ? (generated.formData as Record<string, unknown>)
        : {};
      if (companyName && !formData["4.1"]) formData["4.1"] = companyName;

      const intake = deepStripEmDashes({
        formData,
        duals: (generated.duals ?? {}) as Record<string, unknown>,
        dualLists: (generated.dualLists ?? {}) as Record<string, unknown>,
        spokespeople: Array.isArray(generated.spokespeople) ? generated.spokespeople : [],
        products: Array.isArray(generated.products) ? generated.products : [],
        productQueries: Array.isArray(generated.productQueries) ? generated.productQueries : [],
        stringLists: (generated.stringLists ?? {}) as Record<string, unknown>,
        businessCategories: Array.isArray(generated.businessCategories) ? generated.businessCategories : [],
        audienceCategories: Array.isArray(generated.audienceCategories) ? generated.audienceCategories : [],
        mediaCategories: [],
        llmQueries: (generated.llmQueries ?? { v: "1.6", discovery: [], shortlist: [], comparison: [] }) as Record<string, unknown>,
        intakeStatus: "Accepted",
        acceptedAt: now.toISOString(),
        preOptimiseSnapshot: null,
        optimisedFields: [],
        aiWebsite: normalised,
        confirmedEntity: null,
      });

      const projectId = generateProjectId(companyName);
      const owner = normUsername(req.account!.username);
      const projectColor = randomColor();

      const projectData: Record<string, unknown> = {
        id: projectId,
        name: companyName,
        sector: (typeof formData["4.4"] === "string" ? (formData["4.4"] as string) : sector).slice(0, 80),
        initials: deriveInitials(companyName),
        color: projectColor,
        website: normalised,
        generatedFromUrl: true,
        contentCount: 0,
        avgScore: 0,
        scoreTrend: 0,
        activePlans: 0,
        lastActive: "Just now",
        recentActivity: "Generated from URL",
        owner,
      };

      try {
        await saveProjectToDb(projectId, owner, projectData, intake as Record<string, unknown>, normalised);
      } catch (err) {
        logger.error({ err, projectId }, "admin generate: DB save failed");
        sse(res, "error", { error: "Failed to save the project. Please try again." });
        res.end();
        return;
      }

      // ── Step 4: Run GEO score (non-fatal) ────────────────────────────
      sse(res, "step", { label: "Running GEO score" });

      let geoScore: number | null = null;
      try {
        const geoCtx = await fetchGeoAuditContext(normalised);
        const geoResult = await analyseWithClaude(geoCtx.text, geoCtx.facts, undefined, { accountId: req.account?.username ?? "admin" });
        geoScore = geoResult.overallScore ?? null;

        if (geoScore !== null) {
          const geoSnapshot = {
            score: geoScore,
            date: new Date().toISOString(),
            categories: Array.isArray(geoResult.categories)
              ? geoResult.categories.map((c: { name: string; score: number; max: number; status: string }) => ({
                  name: c.name,
                  score: c.score,
                  max: c.max,
                  status: c.status,
                }))
              : [],
          };
          await updateProjectData(projectId, { geoSnapshot });
          projectData.geoSnapshot = geoSnapshot;
        }
      } catch (err) {
        logger.warn({ err, projectId }, "admin generate: GEO scoring failed (non-fatal)");
      }

      sse(res, "result", {
        projectId,
        projectName: companyName,
        score: geoScore,
      });
      res.end();
    } catch (err) {
      logger.error({ err }, "admin generate-from-url: unexpected error");
      sse(res, "error", {
        error: "Something went wrong generating the project. Please try again.",
      });
      res.end();
    }
  },
);

adminRouter.get(
  "/admin/token-usage",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (req.account?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    try {
      const rows = await db
        .select({
          accountId: sql<string>`coalesce(${projectsTable.owner}, ${tokenUsageTable.accountId})`,
          month: sql<string>`to_char(date_trunc('month', ${tokenUsageTable.createdAt}), 'YYYY-MM')`,
          operation: tokenUsageTable.operation,
          model: tokenUsageTable.model,
          totalInput: sql<number>`sum(${tokenUsageTable.inputTokens})::int`,
          totalOutput: sql<number>`sum(${tokenUsageTable.outputTokens})::int`,
          totalCost: sql<string>`round(sum(${tokenUsageTable.costGbpEstimate}::numeric), 4)::text`,
          callCount: sql<number>`count(*)::int`,
        })
        .from(tokenUsageTable)
        .leftJoin(projectsTable, eq(tokenUsageTable.projectId, projectsTable.id))
        .groupBy(
          sql`coalesce(${projectsTable.owner}, ${tokenUsageTable.accountId})`,
          sql`date_trunc('month', ${tokenUsageTable.createdAt})`,
          tokenUsageTable.operation,
          tokenUsageTable.model,
        )
        .orderBy(
          sql`date_trunc('month', ${tokenUsageTable.createdAt}) desc`,
          sql`coalesce(${projectsTable.owner}, ${tokenUsageTable.accountId})`,
        )
        .limit(1000);
      res.json({ rows });
    } catch (err) {
      logger.error({ err }, "admin token-usage: query failed");
      res.status(500).json({ error: "Could not load token usage data." });
    }
  },
);

// List all audit locks (admin only).
adminRouter.get(
  "/admin/audit-locks",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (req.account?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    try {
      const rows = await db
        .select({
          projectId: auditLocksTable.projectId,
          auditType: auditLocksTable.auditType,
          owner: auditLocksTable.owner,
          lastRunAt: auditLocksTable.lastRunAt,
        })
        .from(auditLocksTable)
        .orderBy(auditLocksTable.lastRunAt);
      res.json({ rows });
    } catch (err) {
      logger.error({ err }, "admin audit-locks: query failed");
      res.status(500).json({ error: "Could not load audit locks." });
    }
  },
);

// Clear an audit lock so admin can force a re-run for a given project+type.
adminRouter.delete(
  "/admin/audit-lock",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (req.account?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const { projectId, auditType } = req.body as { projectId?: string; auditType?: string };
    if (!projectId || !auditType) {
      res.status(400).json({ error: "projectId and auditType are required" });
      return;
    }
    try {
      await db
        .delete(auditLocksTable)
        .where(and(eq(auditLocksTable.projectId, projectId), eq(auditLocksTable.auditType, auditType)));
      logger.info({ projectId, auditType, by: req.account.username }, "Audit lock cleared by admin");
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "admin clear-audit-lock: failed");
      res.status(500).json({ error: "Could not clear audit lock." });
    }
  },
);

export default adminRouter;

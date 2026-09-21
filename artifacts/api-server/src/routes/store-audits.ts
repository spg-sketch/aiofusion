import { Router, type IRouter, type Request, type Response } from "express";
import { db, savedAuditsTable, savedDiagnosticsTable, savedContentGeoTable, savedTechGeoTable, projectsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { getVisibleUsernames, normUsername } from "../lib/platform-auth";
import { memberProjectGate, inAssignedScope } from "../lib/member-guards";
import { normaliseSavedAssessmentResult } from "../lib/assessment-outcome";
import { sanitizeProjectData, scoreAuthorityWithOutcome } from "./llm-check";

const router: IRouter = Router();
const MAX_ASSESSMENT_RETRIES = 3;
const activeAssessmentRetries = new Set<string>();

// Membership role gate: billing members blocked, viewers read-only, and
// project-scoped members restricted to their assigned projects.
router.use("/store/projects/:id", memberProjectGate);
router.use("/store/projects/:id", (req, res, next) => {
  if (req.account && !inAssignedScope(req, String(req.params.id ?? ""))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  next();
});

async function visibleOwners(req: Request): Promise<string[] | null> {
  return getVisibleUsernames(req.account!);
}

function canSee(owner: string | null | undefined, visible: string[] | null): boolean {
  if (visible === null) return true;
  return visible.includes(normUsername(owner));
}

async function getProjectOwner(projectId: string): Promise<string | null | undefined> {
  const rows = await db
    .select({ owner: projectsTable.owner, deletedAt: projectsTable.deletedAt })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  return rows[0] && !rows[0].deletedAt ? rows[0].owner : undefined;
}

// ---------------------------------------------------------------------------
// Saved Earned Media Audits
//   GET    /store/projects/:id/audits
//   POST   /store/projects/:id/audits
//   DELETE /store/projects/:id/audits/:auditId
// ---------------------------------------------------------------------------

router.get(
  "/store/projects/:id/audits",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      if (!projectId) {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const rows = await db
        .select()
        .from(savedAuditsTable)
        .where(
          and(
            eq(savedAuditsTable.projectId, projectId),
            isNull(savedAuditsTable.deletedAt),
          ),
        );
      const audits = rows
        .map((r) => ({ id: r.id, savedAt: r.savedAt, result: r.result }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      res.json({ audits });
    } catch {
      res.status(500).json({ error: "Failed to load audits" });
    }
  },
);

router.post(
  "/store/projects/:id/audits",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      if (!projectId) {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      const { audit } = req.body ?? {};
      if (!audit || typeof audit !== "object" || !audit.id || !audit.savedAt || !audit.result) {
        res.status(400).json({ error: "Missing audit body" });
        return;
      }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const owner = normUsername(req.account!.username);
      const savedResult = normaliseSavedAssessmentResult(audit.result);
      await db
        .insert(savedAuditsTable)
        .values({
          id: String(audit.id),
          projectId,
          owner,
          savedAt: String(audit.savedAt),
          result: savedResult,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: savedAuditsTable.id,
          set: {
            savedAt: String(audit.savedAt),
            result: savedResult,
            deletedAt: null,
          },
          where: eq(savedAuditsTable.projectId, projectId),
        });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save audit" });
    }
  },
);

router.post(
  "/store/projects/:id/audits/:auditId/retry-assessment",
  requirePlatformAuth,
  async (req: Request, res: Response): Promise<void> => {
    const projectId = String(req.params.id || "").trim();
    const auditId = String(req.params.auditId || "").trim();
    if (!projectId || !auditId) {
      res.status(400).json({ error: "Missing project id or audit id" });
      return;
    }

    const retryKey = `${projectId}:${auditId}`;
    if (activeAssessmentRetries.has(retryKey)) {
      res.status(409).json({ error: "This Authority assessment retry is already running." });
      return;
    }

    try {
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined || !canSee(projectOwner, visible)) {
        res.status(404).json({ error: "Audit not found" });
        return;
      }

      const rows = await db
        .select()
        .from(savedAuditsTable)
        .where(
          and(
            eq(savedAuditsTable.id, auditId),
            eq(savedAuditsTable.projectId, projectId),
            isNull(savedAuditsTable.deletedAt),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "Audit not found" });
        return;
      }

      const result = normaliseSavedAssessmentResult(row.result) as Record<string, any>;
      if (result.assessmentOutcome?.status === "complete" || result.assessment) {
        res.status(409).json({ error: "This Authority assessment is already complete." });
        return;
      }

      const retryCount = Number.isInteger(result.assessmentRetryCount)
        ? Math.max(0, result.assessmentRetryCount)
        : 0;
      if (retryCount >= MAX_ASSESSMENT_RETRIES) {
        res.status(429).json({
          error: "The three Authority assessment retries have already been used.",
          retryCount,
          retryLimit: MAX_ASSESSMENT_RETRIES,
        });
        return;
      }

      const probes = Array.isArray(result.probes)
        ? result.probes.filter((probe: unknown): probe is Record<string, any> => !!probe && typeof probe === "object")
        : [];
      if (!result.companyName || probes.length === 0) {
        res.status(422).json({ error: "The saved audit does not contain enough evidence to retry the Authority assessment." });
        return;
      }

      const evidenceByQuery = new Map<string, {
        question: string;
        appeared: boolean;
        competitors: Set<string>;
        chatgpt: string;
        claude: string;
      }>();
      for (const probe of probes) {
        const question = typeof probe.question === "string" ? probe.question.trim() : "";
        if (!question) continue;
        const evidence = evidenceByQuery.get(question) ?? {
          question,
          appeared: false,
          competitors: new Set<string>(),
          chatgpt: "",
          claude: "",
        };
        evidence.appeared ||= probe.mentioned === true;
        if (Array.isArray(probe.competitors)) {
          probe.competitors
            .filter((competitor: unknown): competitor is string => typeof competitor === "string")
            .forEach((competitor: string) => evidence.competitors.add(competitor.slice(0, 120)));
        }
        const preview = typeof probe.responsePreview === "string" ? probe.responsePreview.slice(0, 700) : "";
        const model = typeof probe.model === "string" ? probe.model : "";
        if (model.includes("GPT")) evidence.chatgpt = preview;
        if (model.includes("Claude")) evidence.claude = preview;
        evidenceByQuery.set(question, evidence);
      }
      const evidence = [...evidenceByQuery.values()].map((item) => ({
        question: item.question,
        appeared: item.appeared,
        competitors: [...item.competitors].slice(0, 12),
        chatgpt: item.chatgpt,
        claude: item.claude,
      }));
      if (evidence.length === 0) {
        res.status(422).json({ error: "The saved audit does not contain enough evidence to retry the Authority assessment." });
        return;
      }

      const topCompetitors = Array.isArray(result.topCompetitors)
        ? result.topCompetitors
            .filter((item: unknown): item is Record<string, any> => !!item && typeof item === "object")
            .map((item: Record<string, any>) => ({
              name: typeof item.name === "string" ? item.name.slice(0, 120) : "",
              mentions: Number.isFinite(item.mentions) ? Math.max(0, Math.round(item.mentions)) : 0,
            }))
            .filter((item: { name: string }) => item.name)
        : [];
      const totalMentions = Number.isFinite(result.totalMentions) ? Math.max(0, result.totalMentions) : 0;
      const competitorMentions = topCompetitors.reduce(
        (sum: number, competitor: { mentions: number }) => sum + competitor.mentions,
        0,
      );
      const shareOfVoice = totalMentions + competitorMentions > 0
        ? Math.round((totalMentions / (totalMentions + competitorMentions)) * 100)
        : 0;
      const gptContexts = probes
        .filter((probe) => String(probe.model ?? "").includes("GPT") && probe.mentioned === true && typeof probe.mentionContext === "string")
        .map((probe) => String(probe.mentionContext));
      const claudeContexts = probes
        .filter((probe) => String(probe.model ?? "").includes("Claude") && probe.mentioned === true && typeof probe.mentionContext === "string")
        .map((probe) => String(probe.mentionContext));
      const failedQuestions = evidence.filter((item) => !item.appeared).map((item) => item.question);

      activeAssessmentRetries.add(retryKey);
      const authorityResult = await scoreAuthorityWithOutcome(
        String(result.companyName),
        sanitizeProjectData(req.body?.projectData),
        evidence,
        {
          presence: Number.isFinite(result.visibilityScore) ? result.visibilityScore : 0,
          shareOfVoice,
          visibilityScore: Number.isFinite(result.visibilityScore) ? result.visibilityScore : 0,
          topCompetitors,
        },
        result.entityClarity && typeof result.entityClarity === "object" ? result.entityClarity : null,
        { gptContexts, claudeContexts, failedQuestions },
        req.account!.username,
        projectId,
      );

      const updatedResult = normaliseSavedAssessmentResult({
        ...result,
        ...authorityResult,
        assessmentRetryCount: retryCount + 1,
        assessmentRetryLimit: MAX_ASSESSMENT_RETRIES,
      });
      await db
        .update(savedAuditsTable)
        .set({ result: updatedResult })
        .where(
          and(
            eq(savedAuditsTable.id, auditId),
            eq(savedAuditsTable.projectId, projectId),
            isNull(savedAuditsTable.deletedAt),
          ),
        );
      res.json({
        audit: { id: row.id, savedAt: row.savedAt, result: updatedResult },
        retryCount: retryCount + 1,
        retryLimit: MAX_ASSESSMENT_RETRIES,
      });
    } catch (err) {
      req.log.error({ err, projectId, auditId }, "Authority assessment retry failed");
      res.status(500).json({ error: "The Authority assessment could not be retried. Please try again." });
    } finally {
      activeAssessmentRetries.delete(retryKey);
    }
  },
);

router.delete(
  "/store/projects/:id/audits/:auditId",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      const auditId = String(req.params.auditId || "").trim();
      if (!projectId || !auditId) {
        res.status(400).json({ error: "Missing project id or audit id" });
        return;
      }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      await db
        .update(savedAuditsTable)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(savedAuditsTable.id, auditId),
            eq(savedAuditsTable.projectId, projectId),
          ),
        );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete audit" });
    }
  },
);

// ---------------------------------------------------------------------------
// Saved Website/GEO Diagnostics
//   GET    /store/projects/:id/diagnostics
//   POST   /store/projects/:id/diagnostics
//   DELETE /store/projects/:id/diagnostics/:diagId
// ---------------------------------------------------------------------------

router.get(
  "/store/projects/:id/diagnostics",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      if (!projectId) {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const rows = await db
        .select()
        .from(savedDiagnosticsTable)
        .where(
          and(
            eq(savedDiagnosticsTable.projectId, projectId),
            isNull(savedDiagnosticsTable.deletedAt),
          ),
        );
      const diagnostics = rows
        .map((r) => ({ id: r.id, savedAt: r.savedAt, result: r.result }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      res.json({ diagnostics });
    } catch {
      res.status(500).json({ error: "Failed to load diagnostics" });
    }
  },
);

router.post(
  "/store/projects/:id/diagnostics",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      if (!projectId) {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      const { diagnostic } = req.body ?? {};
      if (!diagnostic || typeof diagnostic !== "object" || !diagnostic.id || !diagnostic.savedAt || !diagnostic.result) {
        res.status(400).json({ error: "Missing diagnostic body" });
        return;
      }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const owner = normUsername(req.account!.username);
      await db
        .insert(savedDiagnosticsTable)
        .values({
          id: String(diagnostic.id),
          projectId,
          owner,
          savedAt: String(diagnostic.savedAt),
          result: diagnostic.result as object,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: savedDiagnosticsTable.id,
          set: {
            savedAt: String(diagnostic.savedAt),
            result: diagnostic.result as object,
            deletedAt: null,
          },
          where: eq(savedDiagnosticsTable.projectId, projectId),
        });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save diagnostic" });
    }
  },
);

router.delete(
  "/store/projects/:id/diagnostics/:diagId",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      const diagId = String(req.params.diagId || "").trim();
      if (!projectId || !diagId) {
        res.status(400).json({ error: "Missing project id or diagnostic id" });
        return;
      }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      await db
        .update(savedDiagnosticsTable)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(savedDiagnosticsTable.id, diagId),
            eq(savedDiagnosticsTable.projectId, projectId),
          ),
        );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete diagnostic" });
    }
  },
);

// ---------------------------------------------------------------------------
// Helpers shared by the two "scored" geo endpoints
// ---------------------------------------------------------------------------

function makeGeoRoutes(
  table: typeof savedContentGeoTable | typeof savedTechGeoTable,
  listKey: string,
  bodyKey: string,
  errLabel: string,
  idParam: string,
) {
  const getPath = `/store/projects/:id/${listKey}`;
  const postPath = `/store/projects/:id/${listKey}`;
  const deletePath = `/store/projects/:id/${listKey}/:${idParam}`;

  router.get(getPath, requirePlatformAuth, async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      if (!projectId) { res.status(400).json({ error: "Missing project id" }); return; }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) { res.status(404).json({ error: "Project not found" }); return; }
      if (!canSee(projectOwner, visible)) { res.status(404).json({ error: "Project not found" }); return; }
      const rows = await db
        .select()
        .from(table)
        .where(and(eq(table.projectId, projectId), isNull(table.deletedAt)));
      const items = rows.map((r) => ({ ...(r.result as object), id: r.id, savedAt: r.savedAt }));
      items.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")));
      res.json({ [listKey]: items });
    } catch { res.status(500).json({ error: `Failed to load ${errLabel}` }); }
  });

  router.post(postPath, requirePlatformAuth, async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      if (!projectId) { res.status(400).json({ error: "Missing project id" }); return; }
      const entry = (req.body ?? {})[bodyKey];
      if (!entry || typeof entry !== "object" || !entry.id || !entry.savedAt) {
        res.status(400).json({ error: `Missing ${errLabel} body` }); return;
      }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) { res.status(404).json({ error: "Project not found" }); return; }
      if (!canSee(projectOwner, visible)) { res.status(404).json({ error: "Project not found" }); return; }
      const owner = normUsername(req.account!.username);
      await db
        .insert(table)
        .values({ id: String(entry.id), projectId, owner, savedAt: String(entry.savedAt), result: entry as object, deletedAt: null })
        .onConflictDoUpdate({ target: table.id, set: { savedAt: String(entry.savedAt), result: entry as object, deletedAt: null }, where: eq(table.projectId, projectId) });
      res.json({ ok: true });
    } catch { res.status(500).json({ error: `Failed to save ${errLabel}` }); }
  });

  router.delete(deletePath, requirePlatformAuth, async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id || "").trim();
      const entryId = String(req.params[idParam] || "").trim();
      if (!projectId || !entryId) { res.status(400).json({ error: "Missing id" }); return; }
      const visible = await visibleOwners(req);
      const projectOwner = await getProjectOwner(projectId);
      if (projectOwner === undefined) { res.status(404).json({ error: "Project not found" }); return; }
      if (!canSee(projectOwner, visible)) { res.status(404).json({ error: "Project not found" }); return; }
      await db.update(table).set({ deletedAt: new Date() })
        .where(and(eq(table.id, entryId), eq(table.projectId, projectId)));
      res.json({ ok: true });
    } catch { res.status(500).json({ error: `Failed to delete ${errLabel}` }); }
  });
}

makeGeoRoutes(savedContentGeoTable, "content-geo", "entry", "content GEO", "geoId");
makeGeoRoutes(savedTechGeoTable,    "tech-geo",    "entry", "tech GEO",    "geoId");

export default router;

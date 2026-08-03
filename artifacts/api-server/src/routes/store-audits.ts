import { Router, type IRouter, type Request, type Response } from "express";
import { db, savedAuditsTable, savedDiagnosticsTable, savedContentGeoTable, savedTechGeoTable, projectsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { getVisibleUsernames, normUsername } from "../lib/platform-auth";
import { memberProjectGate, inAssignedScope } from "../lib/member-guards";

const router: IRouter = Router();

// Membership role gate: billing members blocked, viewers read-only, and
// project-scoped members restricted to their assigned projects.
router.use("/store/projects/:id", memberProjectGate);
router.use("/store/projects/:id", (req, res, next) => {
  if (req.account && !inAssignedScope(req, String(req.params.id ?? ""))) {
    res.status(403).json({ error: "Forbidden" });
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
    .select({ owner: projectsTable.owner })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  return rows[0]?.owner;
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
        res.json({ audits: [] });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(403).json({ error: "Forbidden" });
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
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const owner = normUsername(req.account!.username);
      await db
        .insert(savedAuditsTable)
        .values({
          id: String(audit.id),
          projectId,
          owner,
          savedAt: String(audit.savedAt),
          result: audit.result as object,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: savedAuditsTable.id,
          set: {
            savedAt: String(audit.savedAt),
            result: audit.result as object,
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
        res.json({ ok: true });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(403).json({ error: "Forbidden" });
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
        res.json({ diagnostics: [] });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(403).json({ error: "Forbidden" });
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
        res.status(403).json({ error: "Forbidden" });
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
        res.json({ ok: true });
        return;
      }
      if (!canSee(projectOwner, visible)) {
        res.status(403).json({ error: "Forbidden" });
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
      if (projectOwner === undefined) { res.json({ [listKey]: [] }); return; }
      if (!canSee(projectOwner, visible)) { res.status(403).json({ error: "Forbidden" }); return; }
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
      if (!canSee(projectOwner, visible)) { res.status(403).json({ error: "Forbidden" }); return; }
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
      if (projectOwner === undefined) { res.json({ ok: true }); return; }
      if (!canSee(projectOwner, visible)) { res.status(403).json({ error: "Forbidden" }); return; }
      await db.update(table).set({ deletedAt: new Date() })
        .where(and(eq(table.id, entryId), eq(table.projectId, projectId)));
      res.json({ ok: true });
    } catch { res.status(500).json({ error: `Failed to delete ${errLabel}` }); }
  });
}

makeGeoRoutes(savedContentGeoTable, "content-geo", "entry", "content GEO", "geoId");
makeGeoRoutes(savedTechGeoTable,    "tech-geo",    "entry", "tech GEO",    "geoId");

export default router;

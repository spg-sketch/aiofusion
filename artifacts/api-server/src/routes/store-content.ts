import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  archiveItemsTable,
  plannerItemsTable,
  scoringConfigsTable,
  projectsTable,
} from "@workspace/db";
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { getVisibleUsernames, normUsername } from "../lib/platform-auth";
import {
  memberProjectGate,
  inAssignedScope,
  restrictToAssigned,
} from "../lib/member-guards";

const router: IRouter = Router();

// Membership role gate for every content-store surface: billing members are
// blocked entirely, viewers may only issue reads.
router.use(
  ["/store/archive", "/store/planner", "/store/scoring-config"],
  memberProjectGate,
);

// Resolve the set of owner usernames the request may see.
// Returns null for an admin (sees all).
async function visibleOwners(req: Request): Promise<string[] | null> {
  return getVisibleUsernames(req.account!);
}

function canSeeOwner(owner: string, visible: string[] | null): boolean {
  if (visible === null) return true;
  return visible.includes(normUsername(owner));
}

// Resolve the set of project IDs the request may see, based on project
// ownership rather than item ownership. Returns null for an admin (sees all).
// Any account that can see a project in their sidebar can see all archive and
// planner items belonging to that project, regardless of which sub-account
// created them.
async function visibleProjectIds(req: Request): Promise<string[] | null> {
  const owners = await getVisibleUsernames(req.account!);
  if (owners === null) return null; // admin sees everything
  if (owners.length === 0) return [];
  const rows = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(
      and(
        isNull(projectsTable.deletedAt),
        inArray(projectsTable.owner, owners),
      ),
    );
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Content Archive  GET    /api/store/archive
//                  POST   /api/store/archive
//                  PUT    /api/store/archive/:id
//                  DELETE /api/store/archive/:id
// ---------------------------------------------------------------------------

router.get(
  "/store/archive",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectIds = restrictToAssigned(req, await visibleProjectIds(req));
      const projectId =
        typeof req.query.projectId === "string" && req.query.projectId
          ? req.query.projectId
          : null;
      if (projectId && !inAssignedScope(req, projectId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Build the WHERE clause: project-visibility filter + optional ?projectId
      // scoping + soft-delete guard.
      const visibilityClause =
        projectIds === null
          ? undefined // admin: no project filter
          : projectIds.length === 0
            ? isNull(null as never) // no visible projects → return nothing
            : inArray(archiveItemsTable.projectId, projectIds);

      const projectScopeClause = projectId
        ? eq(archiveItemsTable.projectId, projectId)
        : undefined;

      const whereClause = and(
        isNull(archiveItemsTable.deletedAt),
        visibilityClause,
        projectScopeClause,
      );

      const rows = await db
        .select()
        .from(archiveItemsTable)
        .where(whereClause)
        .orderBy(archiveItemsTable.createdAt);

      res.json({ items: rows });
    } catch {
      res.status(500).json({ error: "Failed to load archive" });
    }
  },
);

router.post(
  "/store/archive",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleOwners(req);
      const owner = normUsername(req.account!.username);

      const {
        id,
        projectId,
        title,
        contentType,
        spokesperson,
        status,
        tags,
        headline,
        standfirst,
        bodyCopy,
        body,
        selectedMessages,
        mediaCats,
        pubDate,
        releasedAt,
        releaseChannel,
        source,
        createdAt,
      } = req.body ?? {};

      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing id" });
        return;
      }
      if (!projectId || typeof projectId !== "string") {
        res.status(400).json({ error: "Missing projectId" });
        return;
      }
      if (!canSeeOwner(owner, visible) || !inAssignedScope(req, projectId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const [row] = await db
        .insert(archiveItemsTable)
        .values({
          id,
          projectId,
          owner,
          title: title ?? "",
          contentType: contentType ?? "",
          spokesperson: spokesperson ?? null,
          status: status ?? "Draft",
          tags: Array.isArray(tags) ? tags : [],
          headline: headline ?? null,
          standfirst: standfirst ?? null,
          bodyCopy: bodyCopy ?? null,
          body: body ?? null,
          selectedMessages: Array.isArray(selectedMessages)
            ? selectedMessages
            : null,
          mediaCats: Array.isArray(mediaCats) ? mediaCats : null,
          pubDate: pubDate ?? null,
          releasedAt: releasedAt ?? null,
          releaseChannel: releaseChannel ?? null,
          source: source ?? null,
          createdAt: createdAt ? new Date(createdAt) : new Date(),
        })
        .onConflictDoNothing()
        .returning();

      res.json({ ok: true, item: row ?? null });
    } catch {
      res.status(500).json({ error: "Failed to create archive item" });
    }
  },
);

router.put(
  "/store/archive/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleOwners(req);
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "Missing id" });
        return;
      }

      const existing = await db
        .select({ owner: archiveItemsTable.owner, projectId: archiveItemsTable.projectId })
        .from(archiveItemsTable)
        .where(eq(archiveItemsTable.id, id))
        .limit(1);

      if (!existing[0]) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        !canSeeOwner(existing[0].owner, visible) ||
        !inAssignedScope(req, existing[0].projectId)
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const {
        title,
        contentType,
        spokesperson,
        status,
        tags,
        headline,
        standfirst,
        bodyCopy,
        body,
        selectedMessages,
        mediaCats,
        pubDate,
        releasedAt,
        releaseChannel,
        source,
      } = req.body ?? {};

      const [updated] = await db
        .update(archiveItemsTable)
        .set({
          title: title ?? "",
          contentType: contentType ?? "",
          spokesperson: spokesperson ?? null,
          status: status ?? "Draft",
          tags: Array.isArray(tags) ? tags : [],
          headline: headline ?? null,
          standfirst: standfirst ?? null,
          bodyCopy: bodyCopy ?? null,
          body: body ?? null,
          selectedMessages: Array.isArray(selectedMessages)
            ? selectedMessages
            : null,
          mediaCats: Array.isArray(mediaCats) ? mediaCats : null,
          pubDate: pubDate ?? null,
          releasedAt: releasedAt ?? null,
          releaseChannel: releaseChannel ?? null,
          source: source ?? null,
        })
        .where(eq(archiveItemsTable.id, id))
        .returning();

      res.json({ ok: true, item: updated });
    } catch {
      res.status(500).json({ error: "Failed to update archive item" });
    }
  },
);

router.delete(
  "/store/archive/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleOwners(req);
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "Missing id" });
        return;
      }

      const existing = await db
        .select({ owner: archiveItemsTable.owner, projectId: archiveItemsTable.projectId })
        .from(archiveItemsTable)
        .where(eq(archiveItemsTable.id, id))
        .limit(1);

      if (!existing[0]) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        !canSeeOwner(existing[0].owner, visible) ||
        !inAssignedScope(req, existing[0].projectId)
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      await db
        .update(archiveItemsTable)
        .set({ deletedAt: new Date() })
        .where(eq(archiveItemsTable.id, id));

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete archive item" });
    }
  },
);

// ---------------------------------------------------------------------------
// Comms Planner    GET    /api/store/planner
//                  POST   /api/store/planner
//                  PUT    /api/store/planner/:id
//                  DELETE /api/store/planner/:id
// ---------------------------------------------------------------------------

router.get(
  "/store/planner",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const projectIds = restrictToAssigned(req, await visibleProjectIds(req));
      const projectId =
        typeof req.query.projectId === "string" && req.query.projectId
          ? req.query.projectId
          : null;
      if (projectId && !inAssignedScope(req, projectId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Build the WHERE clause: project-visibility filter + optional ?projectId
      // scoping + soft-delete guard.
      const visibilityClause =
        projectIds === null
          ? undefined // admin: no project filter
          : projectIds.length === 0
            ? isNull(null as never) // no visible projects → return nothing
            : inArray(plannerItemsTable.projectId, projectIds);

      const projectScopeClause = projectId
        ? eq(plannerItemsTable.projectId, projectId)
        : undefined;

      const whereClause = and(
        isNull(plannerItemsTable.deletedAt),
        visibilityClause,
        projectScopeClause,
      );

      const rows = await db
        .select()
        .from(plannerItemsTable)
        .where(whereClause)
        .orderBy(plannerItemsTable.week, plannerItemsTable.createdAt);

      res.json({ items: rows });
    } catch {
      res.status(500).json({ error: "Failed to load planner" });
    }
  },
);

router.post(
  "/store/planner",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleOwners(req);
      const owner = normUsername(req.account!.username);

      const {
        id,
        projectId,
        title,
        contentType,
        spokesperson,
        keyMessage,
        audience,
        channels,
        week,
        status,
        releaseDate,
        notes,
        headline,
        standfirst,
        bodyCopy,
        actionNotes,
      } = req.body ?? {};

      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing id" });
        return;
      }
      if (!projectId || typeof projectId !== "string") {
        res.status(400).json({ error: "Missing projectId" });
        return;
      }
      if (!canSeeOwner(owner, visible) || !inAssignedScope(req, projectId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const [row] = await db
        .insert(plannerItemsTable)
        .values({
          id,
          projectId,
          owner,
          title: title ?? "",
          contentType: contentType ?? "",
          spokesperson: spokesperson ?? "",
          keyMessage: keyMessage ?? "",
          audience: audience ?? "",
          channels: Array.isArray(channels) ? channels : [],
          week: typeof week === "number" ? week : 1,
          status: status ?? "Planned",
          releaseDate: releaseDate ?? "",
          notes: notes ?? "",
          headline: headline ?? null,
          standfirst: standfirst ?? null,
          bodyCopy: bodyCopy ?? null,
          actionNotes: actionNotes ?? null,
        })
        .onConflictDoNothing()
        .returning();

      res.json({ ok: true, item: row ?? null });
    } catch {
      res.status(500).json({ error: "Failed to create planner item" });
    }
  },
);

router.put(
  "/store/planner/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleOwners(req);
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "Missing id" });
        return;
      }

      const existing = await db
        .select({ owner: plannerItemsTable.owner, projectId: plannerItemsTable.projectId })
        .from(plannerItemsTable)
        .where(eq(plannerItemsTable.id, id))
        .limit(1);

      if (!existing[0]) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        !canSeeOwner(existing[0].owner, visible) ||
        !inAssignedScope(req, existing[0].projectId)
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const {
        title,
        contentType,
        spokesperson,
        keyMessage,
        audience,
        channels,
        week,
        status,
        releaseDate,
        notes,
        headline,
        standfirst,
        bodyCopy,
        actionNotes,
      } = req.body ?? {};

      const [updated] = await db
        .update(plannerItemsTable)
        .set({
          title: title ?? "",
          contentType: contentType ?? "",
          spokesperson: spokesperson ?? "",
          keyMessage: keyMessage ?? "",
          audience: audience ?? "",
          channels: Array.isArray(channels) ? channels : [],
          week: typeof week === "number" ? week : 1,
          status: status ?? "Planned",
          releaseDate: releaseDate ?? "",
          notes: notes ?? "",
          headline: headline ?? null,
          standfirst: standfirst ?? null,
          bodyCopy: bodyCopy ?? null,
          actionNotes: actionNotes ?? null,
        })
        .where(eq(plannerItemsTable.id, id))
        .returning();

      res.json({ ok: true, item: updated });
    } catch {
      res.status(500).json({ error: "Failed to update planner item" });
    }
  },
);

router.delete(
  "/store/planner/:id",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const visible = await visibleOwners(req);
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "Missing id" });
        return;
      }

      const existing = await db
        .select({ owner: plannerItemsTable.owner, projectId: plannerItemsTable.projectId })
        .from(plannerItemsTable)
        .where(eq(plannerItemsTable.id, id))
        .limit(1);

      if (!existing[0]) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (
        !canSeeOwner(existing[0].owner, visible) ||
        !inAssignedScope(req, existing[0].projectId)
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      await db
        .update(plannerItemsTable)
        .set({ deletedAt: new Date() })
        .where(eq(plannerItemsTable.id, id));

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete planner item" });
    }
  },
);

// ---------------------------------------------------------------------------
// Scoring Config   GET /api/store/scoring-config
//                  PUT /api/store/scoring-config
// ---------------------------------------------------------------------------

router.get(
  "/store/scoring-config",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const owner = normUsername(req.account!.username);
      const rows = await db
        .select()
        .from(scoringConfigsTable)
        .where(eq(scoringConfigsTable.owner, owner))
        .limit(1);

      res.json({ config: rows[0]?.config ?? null });
    } catch {
      res.status(500).json({ error: "Failed to load scoring config" });
    }
  },
);

router.put(
  "/store/scoring-config",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const owner = normUsername(req.account!.username);
      const { config } = req.body ?? {};

      if (!config || typeof config !== "object") {
        res.status(400).json({ error: "Missing config" });
        return;
      }

      await db
        .insert(scoringConfigsTable)
        .values({ owner, config })
        .onConflictDoUpdate({
          target: scoringConfigsTable.owner,
          set: { config, updatedAt: new Date() },
        });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save scoring config" });
    }
  },
);

export default router;

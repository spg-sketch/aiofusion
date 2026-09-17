import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  archiveItemsTable,
  plannerItemsTable,
  scoringConfigsTable,
  projectsTable,
} from "@workspace/db";
import { and, eq, isNull, or, inArray, sql } from "drizzle-orm";
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

const INVALID_SOURCE_ARCHIVE_ERROR =
  "sourceArchiveId must reference an active archive item in this project.";
const DUPLICATE_SOURCE_ARCHIVE_ERROR =
  "This library item is already linked to an active Comms Planner row.";

async function lockContentProject(
  executor: Pick<typeof db, "execute">,
  projectId: string,
): Promise<void> {
  // This transaction-scoped PostgreSQL lock serializes canonical archive
  // deletes with every planner create/update in the project. It avoids a
  // delete slipping between source validation and the planner write, and
  // makes the active source link check safe without a startup-time index DDL.
  // PGlite does not implement advisory locks, so route tests still exercise
  // the surrounding transaction without the production-only lock.
  if (process.env.NODE_ENV !== "test") {
    await executor.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`store-content-link:${projectId}`}))`,
    );
  }
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

async function canWriteProject(req: Request, projectId: string): Promise<boolean> {
  if (!inAssignedScope(req, projectId)) return false;
  const visibleIds = restrictToAssigned(req, await visibleProjectIds(req));
  if (visibleIds !== null && !visibleIds.includes(projectId)) return false;
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), isNull(projectsTable.deletedAt)))
    .limit(1);
  return Boolean(project);
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
            ? sql<boolean>`false` // no visible projects → return nothing
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
    } catch (error) {
      req.log.error({ error }, "Failed to load archive");
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
        actionNotes,
        body,
        selectedMessages,
        mediaCats,
        targetPhrases,
        targetPhraseIds,
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
      if (!canSeeOwner(owner, visible) || !(await canWriteProject(req, projectId))) {
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
          actionNotes: actionNotes ?? null,
          body: body ?? null,
          selectedMessages: Array.isArray(selectedMessages)
            ? selectedMessages
            : null,
          mediaCats: Array.isArray(mediaCats) ? mediaCats : null,
          targetPhrases: Array.isArray(targetPhrases) ? targetPhrases : null,
          targetPhraseIds: Array.isArray(targetPhraseIds) ? targetPhraseIds : null,
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
        !(await canWriteProject(req, existing[0].projectId))
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
        actionNotes,
        body,
        selectedMessages,
        mediaCats,
        targetPhrases,
        targetPhraseIds,
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
          actionNotes: actionNotes ?? null,
          body: body ?? null,
          selectedMessages: Array.isArray(selectedMessages)
            ? selectedMessages
            : null,
          mediaCats: Array.isArray(mediaCats) ? mediaCats : null,
          targetPhrases: Array.isArray(targetPhrases) ? targetPhrases : null,
          targetPhraseIds: Array.isArray(targetPhraseIds) ? targetPhraseIds : null,
          pubDate: pubDate ?? null,
          releasedAt: releasedAt ?? null,
          releaseChannel: releaseChannel ?? null,
          source: source ?? null,
        })
        // Atomic ownership-scoped write: re-assert the owner in the UPDATE
        // itself so a concurrent owner change can't land the write on a
        // record the caller is no longer entitled to modify (TOCTOU guard).
        .where(
          and(
            eq(archiveItemsTable.id, id),
            eq(archiveItemsTable.owner, existing[0].owner),
          ),
        )
        .returning();

      if (!updated) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

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
        !(await canWriteProject(req, existing[0].projectId))
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

       const result = await db.transaction(async (tx) => {
         await lockContentProject(tx, existing[0].projectId);

         // A linked planner row is an active workflow reference. Refuse the
         // archive deletion rather than leaving Media Research pointing at a
         // missing canonical article. This check and the soft delete share
         // the project lock with planner POST/PUT.
         const linkedPlanner = await tx
           .select({ id: plannerItemsTable.id })
           .from(plannerItemsTable)
           .where(and(
             eq(plannerItemsTable.projectId, existing[0].projectId),
             eq(plannerItemsTable.sourceArchiveId, id),
             isNull(plannerItemsTable.deletedAt),
           ))
           .limit(1);
         if (linkedPlanner[0]) return { linked: true as const };

         // Atomic ownership-scoped soft-delete (TOCTOU guard): the owner
         // filter rides in the same SQL statement as the write. deletedAt is
         // also asserted so a concurrent delete cannot report success twice.
         const deleted = await tx
           .update(archiveItemsTable)
           .set({ deletedAt: new Date() })
           .where(
             and(
               eq(archiveItemsTable.id, id),
               eq(archiveItemsTable.owner, existing[0].owner),
               isNull(archiveItemsTable.deletedAt),
             ),
           )
           .returning({ id: archiveItemsTable.id });
         return { linked: false as const, deleted: Boolean(deleted[0]) };
       });

       if (result.linked) {
        res.status(409).json({
          error: "This library item is still linked to a Comms Planner row. Delete that planner row first, then retry.",
          code: "archive_linked_to_planner",
        });
        return;
      }

       if (!result.deleted) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

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
            ? sql<boolean>`false` // no visible projects → return nothing
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
    } catch (error) {
      req.log.error({ error }, "Failed to load planner");
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
        sourceArchiveId,
        body,
        selectedMessages,
        mediaCats,
        pubDate,
        targetPhrases,
        targetPhraseIds,
      } = req.body ?? {};

      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing id" });
        return;
      }
      if (!projectId || typeof projectId !== "string") {
        res.status(400).json({ error: "Missing projectId" });
        return;
      }
      if (!canSeeOwner(owner, visible) || !(await canWriteProject(req, projectId))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

       const linkedArchiveId =
         typeof sourceArchiveId === "string" ? sourceArchiveId : null;
       const result = await db.transaction(async (tx) => {
         await lockContentProject(tx, projectId);

         if (linkedArchiveId !== null) {
           const [archive] = await tx
             .select({ id: archiveItemsTable.id })
             .from(archiveItemsTable)
             .where(and(
               eq(archiveItemsTable.id, linkedArchiveId),
               eq(archiveItemsTable.projectId, projectId),
               isNull(archiveItemsTable.deletedAt),
             ))
             .limit(1);
           if (!archive) return { error: "invalid_source" as const };

           const [existingLink] = await tx
             .select({ id: plannerItemsTable.id })
             .from(plannerItemsTable)
             .where(and(
               eq(plannerItemsTable.projectId, projectId),
               eq(plannerItemsTable.sourceArchiveId, linkedArchiveId),
               isNull(plannerItemsTable.deletedAt),
             ))
             .limit(1);
           if (existingLink) return { error: "duplicate_source" as const };
         }

         const [row] = await tx
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
             sourceArchiveId: linkedArchiveId,
             body: body ?? null,
             selectedMessages: Array.isArray(selectedMessages) ? selectedMessages : null,
             mediaCats: Array.isArray(mediaCats) ? mediaCats : null,
             pubDate: pubDate ?? null,
             targetPhrases: Array.isArray(targetPhrases) ? targetPhrases : null,
             targetPhraseIds: Array.isArray(targetPhraseIds) ? targetPhraseIds : null,
           })
           .onConflictDoNothing()
           .returning();
         return { row };
       });

       if ("error" in result) {
         if (result.error === "invalid_source") {
           res.status(400).json({ error: INVALID_SOURCE_ARCHIVE_ERROR });
           return;
         }
         res.status(409).json({ error: DUPLICATE_SOURCE_ARCHIVE_ERROR });
         return;
       }

       res.json({ ok: true, item: result.row ?? null });
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
        !(await canWriteProject(req, existing[0].projectId))
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
        sourceArchiveId,
        body,
        selectedMessages,
        mediaCats,
        pubDate,
        targetPhrases,
        targetPhraseIds,
      } = req.body ?? {};

       const linkedArchiveId =
         typeof sourceArchiveId === "string" ? sourceArchiveId : null;
       const result = await db.transaction(async (tx) => {
         await lockContentProject(tx, existing[0].projectId);

         if (linkedArchiveId !== null) {
           const [archive] = await tx
             .select({ id: archiveItemsTable.id })
             .from(archiveItemsTable)
             .where(and(
               eq(archiveItemsTable.id, linkedArchiveId),
               eq(archiveItemsTable.projectId, existing[0].projectId),
               isNull(archiveItemsTable.deletedAt),
             ))
             .limit(1);
           if (!archive) return { error: "invalid_source" as const };

           const [existingLink] = await tx
             .select({ id: plannerItemsTable.id })
             .from(plannerItemsTable)
             .where(and(
               eq(plannerItemsTable.projectId, existing[0].projectId),
               eq(plannerItemsTable.sourceArchiveId, linkedArchiveId),
               isNull(plannerItemsTable.deletedAt),
               sql`${plannerItemsTable.id} <> ${id}`,
             ))
             .limit(1);
           if (existingLink) return { error: "duplicate_source" as const };
         }

         const [updated] = await tx
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
             sourceArchiveId: linkedArchiveId,
             body: body ?? null,
             selectedMessages: Array.isArray(selectedMessages) ? selectedMessages : null,
             mediaCats: Array.isArray(mediaCats) ? mediaCats : null,
             pubDate: pubDate ?? null,
             targetPhrases: Array.isArray(targetPhrases) ? targetPhrases : null,
             targetPhraseIds: Array.isArray(targetPhraseIds) ? targetPhraseIds : null,
           })
           // Atomic ownership-scoped write (TOCTOU guard); see archive PUT.
           .where(
             and(
               eq(plannerItemsTable.id, id),
               eq(plannerItemsTable.owner, existing[0].owner),
             ),
           )
           .returning();
         return { updated };
       });

       if ("error" in result) {
         if (result.error === "invalid_source") {
           res.status(400).json({ error: INVALID_SOURCE_ARCHIVE_ERROR });
           return;
         }
         res.status(409).json({ error: DUPLICATE_SOURCE_ARCHIVE_ERROR });
         return;
       }

       if (!result.updated) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

       res.json({ ok: true, item: result.updated });
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
        !(await canWriteProject(req, existing[0].projectId))
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // Atomic ownership-scoped soft-delete (TOCTOU guard); see archive DELETE.
      const deleted = await db
        .update(plannerItemsTable)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(plannerItemsTable.id, id),
            eq(plannerItemsTable.owner, existing[0].owner),
          ),
        )
        .returning({ id: plannerItemsTable.id });

      if (!deleted[0]) {
        res.status(409).json({ error: "Conflict" });
        return;
      }

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

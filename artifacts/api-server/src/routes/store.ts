import { Router, type IRouter, type Request, type Response } from "express";
import { db, projectsTable, projectSnapshotsTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import {
  getVisibleUsernames,
  normUsername,
  getAccount,
} from "../lib/platform-auth";
import { intakeIsEmpty, dataIsEmpty } from "../lib/intake-guards";
import {
  guardProjectRead,
  guardProjectWrite,
  assignedProjectIds,
  inAssignedScope,
} from "../lib/member-guards";
import { shouldSnapshot, type ProjectContent } from "../lib/snapshot-guards";
import { logAdminEvent } from "../lib/admin-events";

const router: IRouter = Router();

// Build a jsonb SQL literal from an arbitrary value, used by the "blank never
// overwrites populated" guards below.
const asJsonb = (value: unknown): SQL => sql`${JSON.stringify(value ?? null)}::jsonb`;

// The columns that make up a project's restorable content + identity, selected
// when reading a row to back up or restore.
const projectRowColumns = {
  id: projectsTable.id,
  name: projectsTable.name,
  data: projectsTable.data,
  intake: projectsTable.intake,
  logo: projectsTable.logo,
  owner: projectsTable.owner,
} as const;

type ProjectRowSlim = {
  id: string;
  name: string;
  data: unknown;
  intake: unknown;
  logo: string | null;
  owner: string | null;
};

// Append a backup of a project's current state to the history, unless the latest
// snapshot already holds identical content. Append-only: nothing here is ever
// overwritten, so a project can always be rolled back to an earlier version.
//
// Returns true when the state is safely captured (either freshly inserted, or an
// identical copy already exists), and false when a backup could not be written.
// It never throws: additive saves treat a false as best-effort (the user's work
// is not blocked by a backup hiccup), while destructive operations (delete,
// restore) refuse to proceed unless this returns true.
async function snapshotProject(row: ProjectRowSlim, reason: string): Promise<boolean> {
  try {
    const latest = await db
      .select({
        name: projectSnapshotsTable.name,
        data: projectSnapshotsTable.data,
        intake: projectSnapshotsTable.intake,
        logo: projectSnapshotsTable.logo,
      })
      .from(projectSnapshotsTable)
      .where(eq(projectSnapshotsTable.projectId, row.id))
      .orderBy(desc(projectSnapshotsTable.createdAt), desc(projectSnapshotsTable.id))
      .limit(1);
    const current: ProjectContent = {
      name: row.name,
      data: row.data,
      intake: row.intake,
      logo: row.logo,
    };
    // Identical content already backed up: the state is safely captured.
    if (!shouldSnapshot(latest[0] ?? null, current)) return true;
    await db.insert(projectSnapshotsTable).values({
      projectId: row.id,
      name: row.name ?? "",
      data: (row.data ?? {}) as object,
      intake: row.intake ?? null,
      logo: row.logo ?? null,
      owner: row.owner ?? null,
      reason,
    });
    return true;
  } catch (err) {
    console.error("[store] snapshotProject failed", { id: row.id, reason, err });
    return false;
  }
}

// Shared project store, now gated per platform account. Every route requires a
// signed-in platform session and only ever touches projects that session is
// allowed to see: an admin sees all; a normal account sees its own projects
// plus those of its descendant sub-accounts (the agency -> client hierarchy).

// Resolve the set of owner usernames the request may see. Returns null for an
// admin, meaning "no filter / all projects".
async function visibleOwners(req: Request): Promise<string[] | null> {
  return getVisibleUsernames(req.account!);
}


function canSee(owner: string | null | undefined, visible: string[] | null): boolean {
  if (visible === null) return true; // admin
  return visible.includes(normUsername(owner));
}

// A SQL predicate restricting a write to rows this request may touch. Returns
// undefined for an admin (no restriction). Applied at write time so the
// authorization holds atomically even if ownership changes between the prior
// owner read and the write (closes the check-then-write race).
function ownerPredicate(visible: string[] | null): SQL | undefined {
  if (visible === null) return undefined; // admin: any row
  return inArray(projectsTable.owner, visible);
}

// Load a project's owner, or undefined if the project does not exist.
async function getOwner(id: string): Promise<string | null | undefined> {
  const rows = await db
    .select({ owner: projectsTable.owner })
    .from(projectsTable)
    .where(eq(projectsTable.id, id))
    .limit(1);
  return rows[0]?.owner;
}

// List the live projects this account may see, plus the ids of any deleted ones
// (so other devices drop their local copy). Only ever returns projects within
// the account's visibility set.
router.get(
  "/store/projects",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (!guardProjectRead(req, res)) return;
      const assigned = assignedProjectIds(req);
      const visible = await visibleOwners(req);
      const rows = await db
        .select({
          id: projectsTable.id,
          // Recover a display name even when the name column was saved empty:
          // fall back to the company-name answer (field 4.1) inside the intake
          // blob, as an intake-only row has before its hub record is pushed up.
          name: sql<string>`coalesce(nullif(${projectsTable.name}, ''), ${projectsTable.intake}->'formData'->>'4.1', '')`,
          data: projectsTable.data,
          logo: projectsTable.logo,
          owner: projectsTable.owner,
          updatedAt: projectsTable.updatedAt,
          deletedAt: projectsTable.deletedAt,
        })
        .from(projectsTable);

      const mine = rows.filter(
        (r) => canSee(r.owner, visible) && (assigned === null || assigned.includes(r.id)),
      );
      const projects = mine
        .filter((r) => !r.deletedAt)
        .map((r) => ({ id: r.id, name: r.name, data: r.data, logo: r.logo, updatedAt: r.updatedAt }));
      const deletedIds = mine.filter((r) => r.deletedAt).map((r) => r.id);

      res.json({ projects, deletedIds });
    } catch {
      res.status(500).json({ error: "Failed to load projects" });
    }
  },
);

// Fetch the full Set-Up / intake blob for a single project the account owns.
router.get(
  "/store/projects/:id/intake",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      if (!guardProjectRead(req, res)) return;
      if (!inAssignedScope(req, id)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const rows = await db
        .select({
          intake: projectsTable.intake,
          owner: projectsTable.owner,
          updatedAt: projectsTable.updatedAt,
        })
        .from(projectsTable)
        .where(eq(projectsTable.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        res.json({ intake: null, updatedAt: null });
        return;
      }
      const visible = await visibleOwners(req);
      if (!canSee(row.owner, visible)) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ intake: row.intake ?? null, updatedAt: row.updatedAt ?? null });
    } catch {
      res.status(500).json({ error: "Failed to load intake" });
    }
  },
);

// Upsert a project's hub record (name, data, logo). A new project is stamped
// with the signed-in account as owner; an existing one keeps its owner and must
// be visible to the caller. The intake blob is left untouched.
router.post(
  "/store/projects/upsert",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { id, name, data, logo } = req.body ?? {};
      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      if (!guardProjectWrite(req, res)) return;
      if (!inAssignedScope(req, id)) {
        res.status(403).json({ error: "You don't have access to this project." });
        return;
      }
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      if (existingOwner !== undefined && !canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot modify this project." });
        return;
      }
      // Enforce the 2-project limit for non-admin accounts on new projects only.
      // Admins are never restricted. "user" is the legacy alias for "agency".
      if (existingOwner === undefined && req.account!.role !== "admin") {
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(projectsTable)
          .where(
            and(
              isNull(projectsTable.deletedAt),
              visible !== null ? inArray(projectsTable.owner, visible) : undefined,
            ),
          );
        if ((countRow?.count ?? 0) >= 2) {
          res.status(403).json({
            error:
              "You've reached the 2-project limit for agency accounts. Contact info@aiofusion.ai to add more projects.",
            limitReached: true,
          });
          return;
        }
      }
      const now = new Date();
      const owner = normUsername(req.account!.username);
      const incomingName = typeof name === "string" ? name.trim() : "";
      const incomingDataEmpty = dataIsEmpty(data);
      const incomingLogo = typeof logo === "string" && logo ? logo : null;
      const saved = await db
        .insert(projectsTable)
        .values({
          id,
          name: typeof name === "string" ? name : "",
          data: data ?? {},
          logo: incomingLogo,
          owner,
          updatedAt: now,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: projectsTable.id,
          // deletedAt is never touched (a stale write must not revive a deleted
          // project). owner is never reassigned either, but a legacy NULL owner
          // (an unclaimed row from before ownership was enforced) is claimed by
          // the caller via coalesce. The setWhere guard below means only a caller
          // who can already see the row reaches this, so this never steals a
          // project from another account.
          //
          // A blank incoming value never overwrites a populated stored one: an
          // empty name keeps the existing name, an empty data record keeps the
          // existing data, and a missing logo keeps the existing logo. This
          // stops a stale/empty device from wiping a completed project.
          set: {
            name: incomingName ? incomingName : sql`${projectsTable.name}`,
            data: incomingDataEmpty
              ? sql`coalesce(${projectsTable.data}, ${asJsonb(data)})`
              : data,
            logo: incomingLogo ? incomingLogo : sql`${projectsTable.logo}`,
            owner: sql`coalesce(${projectsTable.owner}, ${owner})`,
            updatedAt: now,
          },
          // Atomic guard: only update rows the caller may touch, so the
          // authorization holds even if ownership changed after the check above.
          setWhere: ownerPredicate(visible),
        })
        .returning(projectRowColumns);
      // Back up the resulting state so this version can always be restored.
      if (saved[0]) await snapshotProject(saved[0] as ProjectRowSlim, "upsert");
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save project" });
    }
  },
);

// Upsert a project's intake blob only. Creates a minimal row (owned by the
// caller) if the project does not exist yet so intake is never lost.
router.post(
  "/store/projects/intake",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { id, intake, name, data } = req.body ?? {};
      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      if (!guardProjectWrite(req, res)) return;
      if (!inAssignedScope(req, id)) {
        res.status(403).json({ error: "You don't have access to this project." });
        return;
      }
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      if (existingOwner !== undefined && !canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot modify this project." });
        return;
      }
      // Enforce the 2-project limit for non-admin accounts on new projects only,
      // matching the same guard on /upsert. The intake route also inserts a new
      // row when the project does not exist yet, so it must be gated the same way.
      if (existingOwner === undefined && req.account!.role !== "admin") {
        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(projectsTable)
          .where(
            and(
              isNull(projectsTable.deletedAt),
              visible !== null ? inArray(projectsTable.owner, visible) : undefined,
            ),
          );
        if ((countRow?.count ?? 0) >= 2) {
          res.status(403).json({
            error:
              "You've reached the 2-project limit for agency accounts. Contact info@aiofusion.ai to add more projects.",
            limitReached: true,
          });
          return;
        }
      }
      const now = new Date();
      const owner = normUsername(req.account!.username);
      const incomingIntakeEmpty = intakeIsEmpty(intake);
      // The confirmed company identity (for an ambiguous brand name) rides inside
      // the intake blob, but it is not counted as a "real Set-Up answer" by
      // intakeIsEmpty. So an audit run from sparse Set-Up can produce a payload
      // that is "empty" yet carries a deliberate confirmation we must persist.
      const incomingConfirmedEntity =
        intake && typeof intake === "object"
          ? (intake as Record<string, unknown>).confirmedEntity
          : undefined;
      const hasIncomingConfirmedEntity =
        incomingConfirmedEntity != null && typeof incomingConfirmedEntity === "object";
      const saved = await db
        .insert(projectsTable)
        .values({
          id,
          name: typeof name === "string" ? name : "",
          data: data ?? {},
          intake: intake ?? null,
          owner,
          updatedAt: now,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: projectsTable.id,
          // deletedAt is never touched and a real owner is never reassigned, but a
          // legacy NULL owner is claimed by the caller (same reasoning as upsert).
          //
          // A blank/empty incoming Set-Up never overwrites a populated stored
          // one: when the payload carries no real answers we coalesce so the
          // existing intake is kept (and only adopted when there was nothing
          // there before). This is the core guard against a Draft from a stale
          // device wiping a completed Set-Up.
          set: {
            // A blank/empty incoming Set-Up never overwrites a populated stored
            // one. But when that "empty" payload carries a confirmed identity, we
            // merge just that one key onto the existing intake (jsonb `||` is a
            // shallow merge, right side wins) so the choice is saved cross-device
            // without a sparse payload wiping any populated answers underneath.
            intake: incomingIntakeEmpty
              ? hasIncomingConfirmedEntity
                ? sql`coalesce(${projectsTable.intake}, '{}'::jsonb) || ${asJsonb({ confirmedEntity: incomingConfirmedEntity })}`
                : sql`coalesce(${projectsTable.intake}, ${asJsonb(intake)})`
              : intake,
            owner: sql`coalesce(${projectsTable.owner}, ${owner})`,
            updatedAt: now,
          },
          // Atomic guard: only update rows the caller may touch.
          setWhere: ownerPredicate(visible),
        })
        .returning(projectRowColumns);
      // Back up the resulting Set-Up so this version can always be restored.
      if (saved[0]) await snapshotProject(saved[0] as ProjectRowSlim, "intake");
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save intake" });
    }
  },
);

// Reassign a project to a different account (e.g. the master handing a project
// to an agency, or an agency handing one to a client). This is the only path
// that changes ownership - the upsert route deliberately never does. The caller
// must be able to see both the current owner and the new owner: an admin can
// move any project to any account; a non-admin can only move projects within
// its own visibility subtree (its accounts plus descendants).
router.post(
  "/store/projects/owner",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { id, owner } = req.body ?? {};
      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      const target = normUsername(owner);
      if (!target) {
        res.status(400).json({ error: "Missing new owner" });
        return;
      }
      if (!guardProjectWrite(req, res)) return;
      if (!inAssignedScope(req, id)) {
        res.status(403).json({ error: "You don't have access to this project." });
        return;
      }
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      if (existingOwner === undefined) {
        res.status(404).json({ error: "Project not found." });
        return;
      }
      if (!canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot reassign this project." });
        return;
      }
      // The new owner must exist and be within the caller's visibility set
      // (admins may assign to anyone).
      if (visible !== null && !visible.includes(target)) {
        res.status(403).json({ error: "You cannot assign to that account." });
        return;
      }
      if (!(await getAccount(target))) {
        res.status(404).json({ error: "That account does not exist." });
        return;
      }
      // Atomic guard: scope the update to rows the caller may touch, so the
      // authorization holds even if ownership changed after the check above.
      // `returning` tells us whether a row actually matched: if ownership shifted
      // out of the caller's scope between the check and the write, no row is
      // updated and we report the conflict instead of a false success.
      const scope = ownerPredicate(visible);
      const updated = await db
        .update(projectsTable)
        .set({ owner: target, updatedAt: new Date() })
        .where(scope ? and(eq(projectsTable.id, id), scope) : eq(projectsTable.id, id))
        .returning({ id: projectsTable.id });
      if (updated.length === 0) {
        res.status(409).json({ error: "You cannot reassign this project." });
        return;
      }
      void logAdminEvent(
        { username: req.account!.username, id: req.account!.userId },
        "project_owner_reassign",
        id,
        "project",
        { previousOwner: existingOwner ?? null, newOwner: target },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to reassign project" });
    }
  },
);

// Soft-delete a project the account owns so the removal propagates to other
// devices.
router.post(
  "/store/projects/delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.body ?? {};
      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      if (!guardProjectWrite(req, res)) return;
      if (!inAssignedScope(req, id)) {
        res.status(403).json({ error: "You don't have access to this project." });
        return;
      }
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      if (existingOwner === undefined) {
        res.json({ ok: true });
        return;
      }
      if (!canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot delete this project." });
        return;
      }
      // Atomic guard: scope the soft-delete to rows the caller may touch, so
      // the authorization holds even if ownership changed after the check above.
      const scope = ownerPredicate(visible);
      // Back up the project's current state before it is removed, so a deletion
      // is recoverable from the history too. This is a destructive operation, so
      // if the backup cannot be written we refuse to delete rather than risk an
      // unrecoverable removal.
      const current = await db
        .select(projectRowColumns)
        .from(projectsTable)
        .where(eq(projectsTable.id, id))
        .limit(1);
      if (current[0]) {
        const backedUp = await snapshotProject(current[0] as ProjectRowSlim, "pre-delete");
        if (!backedUp) {
          res.status(503).json({ error: "Could not back up before deleting. Please try again." });
          return;
        }
      }
      await db
        .update(projectsTable)
        .set({ deletedAt: new Date() })
        .where(scope ? and(eq(projectsTable.id, id), scope) : eq(projectsTable.id, id));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete project" });
    }
  },
);

// List the backup history for a project the account may see. Returns lightweight
// metadata only (not the full blobs) so a human can pick which version to
// restore; the restore route reads the chosen snapshot's full content.
router.get(
  "/store/projects/:id/snapshots",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!id) {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      if (!guardProjectRead(req, res)) return;
      if (!inAssignedScope(req, id)) {
        res.status(404).json({ error: "Project not found." });
        return;
      }
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      // Allow listing history for an already-deleted project too (getOwner finds
      // soft-deleted rows), so a wiped/removed project can still be recovered.
      if (existingOwner === undefined) {
        // No project row backs this id. Snapshots have no foreign key and can
        // outlive their project, so without a row to check ownership against we
        // cannot prove a non-admin owns this history. Only an admin (visible ===
        // null) may view orphaned history; everyone else is told it is gone.
        if (visible !== null) {
          res.status(404).json({ error: "Project not found." });
          return;
        }
      } else if (!canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot view this project's history." });
        return;
      }
      const rows = await db
        .select({
          id: projectSnapshotsTable.id,
          reason: projectSnapshotsTable.reason,
          createdAt: projectSnapshotsTable.createdAt,
          // A human-friendly label: the saved name, falling back to the company
          // answer (Set-Up field 4.1) for intake-only rows.
          name: sql<string>`coalesce(nullif(${projectSnapshotsTable.name}, ''), ${projectSnapshotsTable.intake}->'formData'->>'4.1', '')`,
          hasIntake: sql<boolean>`(${projectSnapshotsTable.intake} is not null and ${projectSnapshotsTable.intake} <> 'null'::jsonb)`,
        })
        .from(projectSnapshotsTable)
        .where(eq(projectSnapshotsTable.projectId, id))
        .orderBy(desc(projectSnapshotsTable.createdAt), desc(projectSnapshotsTable.id));
      res.json({ snapshots: rows });
    } catch {
      res.status(500).json({ error: "Failed to load history" });
    }
  },
);

// Restore a project to an earlier backup. The current state is backed up first
// (so a restore is itself reversible), then the chosen snapshot's content is
// written back over the project. Ownership is never changed and the project is
// un-deleted, so this also recovers a removed project.
router.post(
  "/store/projects/restore",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const { id, snapshotId } = req.body ?? {};
      if (!id || typeof id !== "string") {
        res.status(400).json({ error: "Missing project id" });
        return;
      }
      const snapId = Number(snapshotId);
      if (!Number.isInteger(snapId) || snapId <= 0) {
        res.status(400).json({ error: "Missing snapshot id" });
        return;
      }
      if (!guardProjectWrite(req, res)) return;
      if (!inAssignedScope(req, id)) {
        res.status(403).json({ error: "You don't have access to this project." });
        return;
      }
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      if (existingOwner === undefined) {
        res.status(404).json({ error: "Project not found." });
        return;
      }
      if (!canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot restore this project." });
        return;
      }
      const snapRows = await db
        .select({
          projectId: projectSnapshotsTable.projectId,
          name: projectSnapshotsTable.name,
          data: projectSnapshotsTable.data,
          intake: projectSnapshotsTable.intake,
          logo: projectSnapshotsTable.logo,
        })
        .from(projectSnapshotsTable)
        .where(eq(projectSnapshotsTable.id, snapId))
        .limit(1);
      const snap = snapRows[0];
      if (!snap || snap.projectId !== id) {
        res.status(404).json({ error: "Backup not found for this project." });
        return;
      }
      // Back up the live state first so the restore can itself be undone. This
      // overwrites the live state, so if the backup cannot be written we refuse
      // to restore rather than lose the current version.
      const current = await db
        .select(projectRowColumns)
        .from(projectsTable)
        .where(eq(projectsTable.id, id))
        .limit(1);
      if (current[0]) {
        const backedUp = await snapshotProject(current[0] as ProjectRowSlim, "pre-restore");
        if (!backedUp) {
          res.status(503).json({ error: "Could not back up the current version. Please try again." });
          return;
        }
      }

      const scope = ownerPredicate(visible);
      const updated = await db
        .update(projectsTable)
        .set({
          name: snap.name ?? "",
          data: (snap.data ?? {}) as object,
          intake: snap.intake ?? null,
          logo: snap.logo ?? null,
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(scope ? and(eq(projectsTable.id, id), scope) : eq(projectsTable.id, id))
        .returning({ id: projectsTable.id });
      if (updated.length === 0) {
        res.status(409).json({ error: "You cannot restore this project." });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to restore project" });
    }
  },
);

export default router;

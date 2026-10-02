import { Router, type IRouter, type Request, type Response } from "express";
import { db, mediaDiscoveriesTable, projectsTable, projectSnapshotsTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import {
  getVisibleUsernames,
  normUsername,
  getAccount,
  isRestrictedMaster,
  MASTER_OWNER_REQUIRED_MESSAGE,
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
import { logger } from "../lib/logger";
import {
  checkProjectCapacityUnlocked,
  assignAddonToNewProjectUnlocked,
  withBillingLock,
  withBillingLocks,
  resolveBillingSlug,
  detachAddonForProjectTransferUnlocked,
  releaseAddonForDeletedProjectUnlocked,
  reconcileProjectAddonOwnershipUnlocked,
} from "../lib/billing";

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
function snapshotDatabaseFailure(error: unknown): { code: string | null; constraint: string | null } {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const failure = current as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    if (typeof failure.code === "string") {
      const constraint = failure.constraint ?? failure.constraint_name;
      return { code: failure.code, constraint: typeof constraint === "string" ? constraint : null };
    }
    current = failure.cause;
  }
  return { code: null, constraint: null };
}

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
    // A restored explicit ID can be ahead of the serial sequence. A failed
    // insert consumes that ID without overwriting the existing backup.
    // Retry only this exact collision, with a bound, and require a real insert.
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
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
      } catch (error) {
        const failure = snapshotDatabaseFailure(error);
        if (failure.code !== "23505" || failure.constraint !== "project_snapshots_pkey" || attempt === 7) throw error;
      }
    }
    return false;
  } catch (err) {
    // Drizzle error messages contain SQL parameters, including project content.
    // Log only safe failure metadata, never the full snapshot or intake.
    logger.error({ projectId: row.id, reason, ...snapshotDatabaseFailure(err) }, "[store] snapshotProject failed");
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

// Owner is accepted only for a new row. Existing sync writes cannot move a
// project; transfers use the dedicated, capacity-checked endpoint.
async function creationOwner(req: Request, res: Response, visible: string[] | null): Promise<string | null> {
  const owner = normUsername(req.body?.owner ?? req.account!.username);
  if (!owner || !canSee(owner, visible) || !(await getAccount(owner))) {
    res.status(403).json({ error: "You cannot create a project for that account." });
    return null;
  }
  return owner;
}

function sendCapacityError(res: Response, decision: Awaited<ReturnType<typeof checkProjectCapacityUnlocked>>) {
  res.status(403).json({
    error: `${decision.error ?? "Package capacity reached"} ${decision.capacity.kind === "agency" ? "Manage client packages in your agency's Billing settings." : "Manage additional projects in Billing settings."}`,
    limitReached: true,
    billingSlug: decision.capacity.billingSlug,
    packageCapacity: decision.capacity,
  });
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
        // owner is the authoritative ownership record (reassignment updates the
        // column, not the data blob) - clients must hydrate from it so a
        // handed-off project shows up for its new owner everywhere.
        .map((r) => ({ id: r.id, name: r.name, data: r.data, logo: r.logo, owner: r.owner ?? null, updatedAt: r.updatedAt }));
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
          deletedAt: projectsTable.deletedAt,
        })
        .from(projectsTable)
        .where(eq(projectsTable.id, id))
        .limit(1);
      const row = rows[0];
      if (!row || row.deletedAt) {
        res.status(404).json({ error: "Project not found." });
        return;
      }
      const visible = await visibleOwners(req);
      if (!canSee(row.owner, visible)) {
        res.status(404).json({ error: "Project not found." });
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
      const now = new Date();
      const owner = existingOwner === undefined
        ? await creationOwner(req, res, visible)
        : normUsername(existingOwner ?? req.account!.username);
      if (!owner) return;
      const incomingName = typeof name === "string" ? name.trim() : "";
      const incomingDataEmpty = dataIsEmpty(data);
      const incomingLogo = typeof logo === "string" && logo ? logo : null;
      // The allowance check, the insert and the add-on assignment run under
      // the BILLING account's lock (an agency and its managed children share
      // one allowance/add-on pool) so concurrent creates - including by
      // different child accounts - can neither exceed the allowance nor
      // consume the same purchased add-on slot twice.
      const outcome = await withBillingLock(owner, async (billingSlug) => {
        // Enforce the project allowance for non-admin accounts on new projects
        // only. Subscribed accounts get their plan's included projects plus any
        // purchased add-ons; unsubscribed accounts keep the legacy cap of 2.
        // The count spans the whole billing subtree, matching the allowance.
        // Admins are never restricted.
        const lockedOwner = await getOwner(id);
        if (lockedOwner !== undefined && (!canSee(lockedOwner, visible)
          || (existingOwner !== undefined && lockedOwner !== existingOwner))) {
          return { conflict: true as const };
        }
        const isNewProject = lockedOwner === undefined;
        if (isNewProject && req.account!.role !== "admin") {
          const decision = await checkProjectCapacityUnlocked(owner, id);
          if (!decision.allowed) return { limitReached: true as const, decision };
        }
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
        // A brand-new project consumes the oldest unassigned purchased add-on
        // (if any) so it immediately carries the paid-for tier. Runs inside
        // this critical section (unlocked variant - we already hold the lock).
        if (saved[0]) {
          await assignAddonToNewProjectUnlocked(billingSlug, id);
        }
        return { limitReached: false as const, saved };
      });
      if ("conflict" in outcome) {
        res.status(409).json({ error: "Project ownership changed. Refresh and try again." });
        return;
      }
      if (outcome.limitReached) {
        sendCapacityError(res, outcome.decision);
        return;
      }
      const saved = outcome.saved;
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
      const now = new Date();
      const owner = existingOwner === undefined
        ? await creationOwner(req, res, visible)
        : normUsername(existingOwner ?? req.account!.username);
      if (!owner) return;
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
      // Allowance check, insert and add-on assignment run as one critical
      // section under the billing account's lock, matching /upsert.
      const outcome = await withBillingLock(owner, async (billingSlug) => {
        const lockedOwner = await getOwner(id);
        if (lockedOwner !== undefined && (!canSee(lockedOwner, visible)
          || (existingOwner !== undefined && lockedOwner !== existingOwner))) {
          return { conflict: true as const };
        }
        const isNewProject = lockedOwner === undefined;
        if (isNewProject && req.account!.role !== "admin") {
          const decision = await checkProjectCapacityUnlocked(owner, id);
          if (!decision.allowed) return { limitReached: true as const, decision };
        }
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
        // Intake-created projects consume a purchased add-on slot the same
        // way upsert-created ones do (unlocked - we already hold the lock).
        if (saved[0]) {
          await assignAddonToNewProjectUnlocked(billingSlug, id);
        }
        return { limitReached: false as const, saved };
      });
      if ("conflict" in outcome) {
        res.status(409).json({ error: "Project ownership changed. Refresh and try again." });
        return;
      }
      if (outcome.limitReached) {
        sendCapacityError(res, outcome.decision);
        return;
      }
      const saved = outcome.saved;
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
      const outcome = await withBillingLocks([existingOwner ?? target, target], async () => {
        const [current] = await db.select({ owner: projectsTable.owner, deletedAt: projectsTable.deletedAt })
          .from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
        if (!current || current.owner !== existingOwner || !canSee(current.owner, visible)) {
          return { conflict: true as const };
        }
        if (current.owner === target) {
          // A previous request may have committed ownership but lost its
          // response or failed while assigning the purchased package.
          if (!current.deletedAt) await assignAddonToNewProjectUnlocked(await resolveBillingSlug(target), id);
          return { ok: true as const };
        }
        const destinationRoot = await resolveBillingSlug(target);
        const sourceRoot = current.owner ? await resolveBillingSlug(current.owner) : destinationRoot;
        if (!current.deletedAt && req.account!.role !== "admin") {
          const decision = await checkProjectCapacityUnlocked(target, id);
          if (!decision.allowed) return { decision };
        }
        if (current.owner) {
          await detachAddonForProjectTransferUnlocked(sourceRoot, id, destinationRoot);
        }
        // Match the exact owner read under the locks, not merely visibility.
        const updated = await db.update(projectsTable)
          .set({ owner: target, updatedAt: new Date() })
          .where(and(eq(projectsTable.id, id), current.owner === null
            ? isNull(projectsTable.owner) : eq(projectsTable.owner, current.owner)))
          .returning({ id: projectsTable.id });
        if (!updated.length) return { conflict: true as const };
        if (sourceRoot === destinationRoot && current.owner) {
          await reconcileProjectAddonOwnershipUnlocked(destinationRoot, id, current.owner, target);
        }
        if (!current.deletedAt) await assignAddonToNewProjectUnlocked(destinationRoot, id);
        return { ok: true as const };
      });
      if ("decision" in outcome && outcome.decision) {
        sendCapacityError(res, outcome.decision);
        return;
      }
      if ("conflict" in outcome) {
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
      if (isRestrictedMaster(req.account!)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }
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
      const outcome = await withBillingLock(existingOwner ?? req.account!.username, async (billingSlug) => {
        const [current] = await db.select(projectRowColumns).from(projectsTable)
          .where(eq(projectsTable.id, id)).limit(1);
        if (!current || current.owner !== existingOwner || !canSee(current.owner, visible)) return "conflict";
        if (!(await snapshotProject(current as ProjectRowSlim, "pre-delete"))) return "backup-failed";
        const scope = ownerPredicate(visible);
        const deleted = await db.update(projectsTable).set({ deletedAt: new Date(), tier: null })
          .where(and(eq(projectsTable.id, id), scope, current.owner === null
            ? isNull(projectsTable.owner) : eq(projectsTable.owner, current.owner)))
          .returning({ id: projectsTable.id });
        if (!deleted.length) return "conflict";
        await releaseAddonForDeletedProjectUnlocked(billingSlug, id);
        return "ok";
      });
      if (outcome === "backup-failed") {
        res.status(503).json({ error: "Could not back up before deleting. Please try again." });
        return;
      }
      if (outcome === "conflict") {
        res.status(409).json({ error: "You cannot delete this project." });
        return;
      }
      // Discovery candidates can contain contact PII. A project deletion must
      // remove its review queue even though the project row is soft-deleted.
      await db.delete(mediaDiscoveriesTable).where(eq(mediaDiscoveriesTable.projectId, id));
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
        .select({ ...projectRowColumns, deletedAt: projectsTable.deletedAt })
        .from(projectsTable)
        .where(eq(projectsTable.id, id))
        .limit(1);
      const scope = ownerPredicate(visible);
      const restore = async (
        currentRow: (typeof current)[number],
      ): Promise<"ok" | "backup-failed" | "not-found"> => {
        const backedUp = await snapshotProject(currentRow as ProjectRowSlim, "pre-restore");
        if (!backedUp) return "backup-failed";
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
        return updated.length > 0 ? "ok" : "not-found";
      };

      // Always lock on the project's billing owner, not the actor. This is
      // important for staff restoring a visible child project: the agency's
      // allowance is the one that must be serialized and checked.
      const lockOwner = normUsername(current[0]?.owner ?? req.account!.username);
      const outcome = await withBillingLock(lockOwner, async (billingSlug) => {
        // Re-read the tombstone after acquiring the billing lock. A project
        // can be deleted (or restored) between the authorization read above
        // and this critical section; using the stale row here could let a
        // resurrection bypass the allowance.
        const [lockedCurrent] = await db
          .select({ ...projectRowColumns, deletedAt: projectsTable.deletedAt })
          .from(projectsTable)
          .where(eq(projectsTable.id, id))
          .limit(1);
        if (!lockedCurrent) return "not-found" as const;
        if (lockedCurrent.owner !== current[0]?.owner || !canSee(lockedCurrent.owner, visible)) {
          return "not-found" as const;
        }

        // Restoring a version over an already-live project does not consume a
        // project slot. Recovering a deleted project does, so only the latter
        // needs the allowance check.
        if (lockedCurrent.deletedAt && req.account!.role !== "admin") {
          const decision = await checkProjectCapacityUnlocked(lockOwner, id);
          if (!decision.allowed) return { decision };
        }
        const result = await restore(lockedCurrent);
        if (result === "ok") await assignAddonToNewProjectUnlocked(billingSlug, id);
        return result;
      });
      if (typeof outcome === "object") {
        sendCapacityError(res, outcome.decision);
        return;
      }
      if (outcome === "backup-failed") {
        res.status(503).json({ error: "Could not back up the current version. Please try again." });
        return;
      }
      if (outcome === "not-found") {
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

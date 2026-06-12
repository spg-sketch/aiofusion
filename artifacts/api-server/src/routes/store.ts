import { Router, type IRouter, type Request, type Response } from "express";
import { db, projectsTable } from "@workspace/db";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { getVisibleUsernames, normUsername } from "../lib/platform-auth";

const router: IRouter = Router();

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

      const mine = rows.filter((r) => canSee(r.owner, visible));
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
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      if (existingOwner !== undefined && !canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot modify this project." });
        return;
      }
      const now = new Date();
      const owner = normUsername(req.account!.username);
      await db
        .insert(projectsTable)
        .values({
          id,
          name: typeof name === "string" ? name : "",
          data: data ?? {},
          logo: typeof logo === "string" ? logo : null,
          owner,
          updatedAt: now,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: projectsTable.id,
          // deletedAt and owner are intentionally NOT touched here. A stale write
          // must never revive a deleted project or reassign ownership.
          set: {
            name: typeof name === "string" ? name : "",
            data: data ?? {},
            logo: typeof logo === "string" ? logo : null,
            updatedAt: now,
          },
          // Atomic guard: only update rows the caller may touch, so the
          // authorization holds even if ownership changed after the check above.
          setWhere: ownerPredicate(visible),
        });
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
      const visible = await visibleOwners(req);
      const existingOwner = await getOwner(id);
      if (existingOwner !== undefined && !canSee(existingOwner, visible)) {
        res.status(403).json({ error: "You cannot modify this project." });
        return;
      }
      const now = new Date();
      const owner = normUsername(req.account!.username);
      await db
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
          // deletedAt and owner left untouched on purpose.
          set: { intake: intake ?? null, updatedAt: now },
          // Atomic guard: only update rows the caller may touch.
          setWhere: ownerPredicate(visible),
        });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to save intake" });
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

export default router;

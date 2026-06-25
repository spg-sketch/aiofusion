import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  platformAccountsTable,
  platformMetaTable,
  projectsTable,
} from "@workspace/db";
import { eq, sql, like } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  normUsername,
  USERNAME_RE,
  getAccount,
  getVisibleUsernames,
  canManage,
  normalizeRole,
  canCreateSubAccounts,
  ensureDefaultAdmin,
  createPlatformSession,
  deletePlatformSession,
  getPlatformSessionId,
  setPlatformCookie,
  clearPlatformCookie,
  type Role,
} from "../lib/platform-auth";
import { requirePlatformAuth } from "../middleware/platform-auth";

const router: IRouter = Router();

const MIGRATED_FLAG = "accounts_migrated";

function publicAccount(
  row: { username: string; role: string; parent: string | null },
  displayName?: string,
  archived?: boolean,
) {
  return {
    username: row.username,
    role: normalizeRole(row.role),
    parent: row.parent ?? undefined,
    ...(displayName ? { displayName } : {}),
    ...(archived ? { archived: true } : {}),
  };
}

// Friendly display names live in the generic platform_meta key/value table
// (one row per account, keyed `account:profile:<username>`) so no schema change
// is needed. The value is JSON, currently just { displayName }.
const PROFILE_PREFIX = "account:profile:";
const profileKey = (username: string) => `${PROFILE_PREFIX}${normUsername(username)}`;

// Archived accounts are soft-deactivated: they cannot log in and are shown
// in a separate section. The flag is stored as a platform_meta row.
const ARCHIVE_PREFIX = "account:archived:";
const archiveKey = (username: string) => `${ARCHIVE_PREFIX}${normUsername(username)}`;

async function getArchivedSet(): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${ARCHIVE_PREFIX}%`));
  return new Set(rows.map((r) => r.key.slice(ARCHIVE_PREFIX.length)));
}

async function setArchived(username: string, archived: boolean): Promise<void> {
  const key = archiveKey(username);
  if (archived) {
    await db
      .insert(platformMetaTable)
      .values({ key, value: "true" })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: "true" } });
  } else {
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, key));
  }
}

function parseDisplayName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const obj = JSON.parse(value) as { displayName?: unknown };
    const dn = typeof obj?.displayName === "string" ? obj.displayName.trim() : "";
    return dn || undefined;
  } catch {
    return undefined;
  }
}

// Map of lowercased username -> display name for every account that has one.
async function getDisplayNames(): Promise<Map<string, string>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${PROFILE_PREFIX}%`));
  const map = new Map<string, string>();
  for (const r of rows) {
    const dn = parseDisplayName(r.value);
    if (dn) map.set(r.key.slice(PROFILE_PREFIX.length), dn);
  }
  return map;
}

// Set (or, when blank, clear) an account's display name.
async function setDisplayName(username: string, displayName: string): Promise<void> {
  const key = profileKey(username);
  const dn = displayName.trim().slice(0, 64);
  if (!dn) {
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, key));
    return;
  }
  const value = JSON.stringify({ displayName: dn });
  await db
    .insert(platformMetaTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

async function deleteProfile(username: string): Promise<void> {
  await db
    .delete(platformMetaTable)
    .where(eq(platformMetaTable.key, profileKey(username)));
}

// --- Session lifecycle ------------------------------------------------------

// Who is signed in (or null). Drives the client's view of the current session.
router.get("/platform/me", (req: Request, res: Response) => {
  res.json({ account: req.account ?? null });
});

// Whether the one-time migration of browser-stored accounts has already run.
// The client uses this to decide whether to push its localStorage accounts up.
router.get("/platform/status", async (_req: Request, res: Response) => {
  try {
    const [row] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, MIGRATED_FLAG))
      .limit(1);
    res.json({ migrated: row?.value === "true" });
  } catch {
    res.status(500).json({ error: "Failed to read status" });
  }
});

router.post("/platform/login", async (req: Request, res: Response) => {
  try {
    const username = normUsername(req.body?.username);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      res.status(400).json({ error: "Enter a username and password." });
      return;
    }
    const account = await getAccount(username);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }
    const [archivedRow] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, archiveKey(username)))
      .limit(1);
    if (archivedRow?.value === "true") {
      res.status(403).json({ error: "This account has been archived. Contact your administrator." });
      return;
    }
    const sid = await createPlatformSession(account.username);
    setPlatformCookie(res, sid);
    res.json({ account: { username: account.username, role: account.role } });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/platform/logout", async (req: Request, res: Response) => {
  try {
    const sid = getPlatformSessionId(req);
    if (sid) await deletePlatformSession(sid);
    clearPlatformCookie(res);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Logout failed" });
  }
});

// --- Account management -----------------------------------------------------

// List accounts the caller may see: an admin sees all; a normal account sees
// itself plus its descendant sub-accounts. Powers the client's accounts page.
router.get(
  "/platform/accounts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const account = req.account!;
      const rows = await db
        .select({
          username: platformAccountsTable.username,
          role: platformAccountsTable.role,
          parent: platformAccountsTable.parent,
        })
        .from(platformAccountsTable);
      const visible = await getVisibleUsernames(account);
      const filtered =
        visible === null
          ? rows
          : rows.filter((r) => visible.includes(normUsername(r.username)));
      const [names, archivedSet] = await Promise.all([getDisplayNames(), getArchivedSet()]);
      res.json({
        accounts: filtered.map((r) =>
          publicAccount(r, names.get(normUsername(r.username)), archivedSet.has(normUsername(r.username))),
        ),
      });
    } catch {
      res.status(500).json({ error: "Failed to load accounts" });
    }
  },
);

// Create a sub-account. The new account's parent is the caller (so it joins the
// caller's visibility subtree). Only an admin may create another admin.
router.post(
  "/platform/accounts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const username = normUsername(req.body?.username);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const requestedRole = normalizeRole(req.body?.role);
      // The master (admin) may create an agency, a direct client, or another
      // admin. Everyone else can only ever create a leaf client account, so we
      // coerce the requested role rather than trusting it.
      const role: Role = actor.role === "admin" ? requestedRole : "client";
      const displayName =
        typeof req.body?.displayName === "string" ? req.body.displayName : "";

      if (!username) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!USERNAME_RE.test(username)) {
        res.status(400).json({
          error: "Username must be 2-32 characters: letters, numbers, _.-",
        });
        return;
      }
      if (!password || password.length < 4) {
        res.status(400).json({ error: "Password must be at least 4 characters." });
        return;
      }
      // A direct client is a leaf account and may not create sub-accounts.
      if (!canCreateSubAccounts(actor.role)) {
        res.status(403).json({ error: "Your account cannot create other accounts." });
        return;
      }
      const existing = await getAccount(username);
      if (existing) {
        res.status(409).json({ error: "That username already exists." });
        return;
      }
      await db.insert(platformAccountsTable).values({
        username,
        passwordHash: hashPassword(password),
        role,
        parent: normUsername(actor.username),
      });
      if (displayName.trim()) await setDisplayName(username, displayName);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to create account" });
    }
  },
);

// Change an account's password. Admins may change anyone's; a normal account may
// change its own descendants'. Changing your own password is always allowed.
router.post(
  "/platform/accounts/password",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      const newPassword =
        typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!newPassword || newPassword.length < 4) {
        res.status(400).json({ error: "Password must be at least 4 characters." });
        return;
      }
      const isSelf = target === normUsername(actor.username);
      if (!isSelf && !(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot change this account." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      await db
        .update(platformAccountsTable)
        .set({ passwordHash: hashPassword(newPassword) })
        .where(eq(platformAccountsTable.username, target));
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to change password" });
    }
  },
);

// Set (or clear) an account's friendly display name. The master may set any
// account's; an account may set its own or its descendants'. A blank name
// clears it (the account then shows by username).
router.post(
  "/platform/accounts/profile",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      const displayName =
        typeof req.body?.displayName === "string" ? req.body.displayName : "";
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const isSelf = target === normUsername(actor.username);
      if (!isSelf && !(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot change this account." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      await setDisplayName(target, displayName);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to update account" });
    }
  },
);

// Archive (or unarchive) an account. Archived accounts cannot log in and are
// shown separately in the parent's UI. Projects are NOT reassigned — the parent
// keeps visibility. Only the parent or an admin may archive a sub-account.
router.post(
  "/platform/accounts/archive",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      const archive = req.body?.archive !== false;
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (!(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot archive this account." });
        return;
      }
      await setArchived(target, archive);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to update account" });
    }
  },
);

// Delete an account. Admins may delete anyone (except the last admin); a normal
// account may delete its descendants. An account cannot delete itself here.
router.post(
  "/platform/accounts/delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (!(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot delete this account." });
        return;
      }
      if (existing.role === "admin") {
        const admins = await db
          .select({ username: platformAccountsTable.username })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.role, "admin"));
        if (admins.length <= 1) {
          res.status(400).json({ error: "Cannot delete the last admin." });
          return;
        }
      }
      // Reassign the deleted account's projects to the actor first, so they
      // remain visible (visibility is derived from current ownership). Without
      // this, a deleted owner would orphan its projects out of the parent's view.
      await db
        .update(projectsTable)
        .set({ owner: normUsername(actor.username) })
        .where(eq(projectsTable.owner, target));
      await db
        .delete(platformAccountsTable)
        .where(eq(platformAccountsTable.username, target));
      await deleteProfile(target);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete account" });
    }
  },
);

// --- One-time migration -----------------------------------------------------

// Carry browser-stored accounts and project ownership onto the server. Runs
// exactly once (guarded by a meta flag): the admin (whose browser holds the
// accounts) triggers it from the client after signing in. Existing server
// accounts are never overwritten, the default admin is always ensured, and
// project owners are backfilled from each project's existing data so nothing is
// lost.
//
// This is admin-only. It must never be open: an unauthenticated migrate could
// otherwise seed arbitrary (including admin) accounts on a fresh deploy before
// the real admin has run it.
router.post(
  "/platform/migrate",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Only an admin can run the migration." });
      return;
    }
    const [flag] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, MIGRATED_FLAG))
      .limit(1);
    if (flag?.value === "true") {
      res.json({ ok: true, alreadyMigrated: true });
      return;
    }

    const incoming = Array.isArray(req.body?.users) ? req.body.users : [];
    let inserted = 0;
    for (const u of incoming) {
      const username = normUsername(u?.username);
      const password = typeof u?.password === "string" ? u.password : "";
      if (!username || !USERNAME_RE.test(username) || password.length < 1) continue;
      const role: Role = u?.role === "admin" ? "admin" : "user";
      const parent = normUsername(u?.parent);
      const result = await db
        .insert(platformAccountsTable)
        .values({
          username,
          passwordHash: hashPassword(password),
          role,
          parent: parent || null,
        })
        // Never overwrite an account that already exists on the server.
        .onConflictDoNothing({ target: platformAccountsTable.username });
      if (result.rowCount) inserted += result.rowCount;
    }

    // Always guarantee an admin login survives the migration.
    await ensureDefaultAdmin();

    // Backfill project ownership from each project's own data blob (the browser
    // stored the owner username inside `data.owner`). Only fills rows that have
    // no owner yet, so existing ownership is never disturbed.
    await db.execute(sql`
      UPDATE ${projectsTable}
      SET owner = lower(${projectsTable.data}->>'owner')
      WHERE owner IS NULL
        AND nullif(${projectsTable.data}->>'owner', '') IS NOT NULL
    `);

    await db
      .insert(platformMetaTable)
      .values({ key: MIGRATED_FLAG, value: "true" })
      .onConflictDoUpdate({
        target: platformMetaTable.key,
        set: { value: "true" },
      });

    res.json({ ok: true, inserted });
  } catch {
    res.status(500).json({ error: "Migration failed" });
  }
});

export default router;

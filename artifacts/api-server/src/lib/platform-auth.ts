import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, platformAccountsTable, platformSessionsTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

// Platform auth: the AIO Fusion application logins (an agency and the client
// sub-accounts it creates). Passwords are hashed with scrypt and sessions are
// server-issued, kept entirely separate from the Replit Auth / OIDC system in
// `lib/auth.ts`. This is the real security boundary - the browser is only a
// cache.

export const PLATFORM_COOKIE = "aio_sid";
// Stashes the admin's own session id while they are "viewing as" another
// account for support purposes, so exiting impersonation can restore it
// without a fresh login. Short-lived: an admin should not leave this
// dangling indefinitely.
export const PLATFORM_IMPERSONATION_STASH_COOKIE = "aio_admin_sid";
export const PLATFORM_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
export const PLATFORM_IMPERSONATION_STASH_TTL = 4 * 60 * 60 * 1000; // 4 hours

export type Role = "admin" | "agency" | "client" | "user";

export interface PlatformAccount {
  username: string;
  role: Role;
}

// Normalise an arbitrary stored/incoming role string to a known Role. The
// legacy "user" value predates the agency/client split and is kept working: it
// behaves like an agency (a top-level account that can create sub-clients).
export function normalizeRole(role: unknown): Role {
  if (role === "admin") return "admin";
  if (role === "agency") return "agency";
  if (role === "client") return "client";
  return "user";
}

// Whether an account of this role may create sub-accounts. The master (admin)
// and agency resellers may; a direct client (a leaf account) may not.
export function canCreateSubAccounts(role: Role): boolean {
  return role !== "client";
}

// --- Password hashing (scrypt, no external dependency) ---------------------

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const [, salt, expectedHex] = parts;
    const expected = Buffer.from(expectedHex, "hex");
    const derived = crypto.scryptSync(password, salt, expected.length);
    return (
      expected.length === derived.length &&
      crypto.timingSafeEqual(expected, derived)
    );
  } catch {
    return false;
  }
}

// --- Username normalisation -------------------------------------------------

// Canonical (lowercased, trimmed) username used as the primary key and for all
// comparisons. The browser system also matched usernames case-insensitively.
export function normUsername(username: unknown): string {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{2,32}$/;

// --- IP hint ----------------------------------------------------------------

// Reduce a raw IP (v4 or v6) to a coarse hint so we never store a full
// address. For IPv4 we keep the first two octets (e.g. "192.168.x.x"). For
// IPv6 we keep the first group (e.g. "2001:xxxx"). Strips IPv6 brackets.
export function makeIpHint(rawIp: string | undefined): string | null {
  if (!rawIp) return null;
  const clean = rawIp.trim().replace(/^\[|\]$/g, "");
  if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}.x.x`;
  } else if (clean.includes(":")) {
    const parts = clean.split(":");
    if (parts.length >= 1 && parts[0]) return `${parts[0]}:xxxx`;
  }
  return null;
}

// --- Default admin seed -----------------------------------------------------

export const DEFAULT_ADMIN_USERNAME = "admin";
const DEV_FALLBACK_ADMIN_PASSWORD = "K9mt-4Rxq-7NzPv2";

export async function ensureDefaultAdmin(): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";
  const envPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  const password = isProd ? envPassword : envPassword || DEV_FALLBACK_ADMIN_PASSWORD;
  if (!password) {
    console.warn(
      "[platform-auth] PLATFORM_ADMIN_PASSWORD is not set; " +
        "skipping admin seed/sync. Set PLATFORM_ADMIN_PASSWORD to bootstrap the first admin.",
    );
    return;
  }

  // Insert the admin account if it does not exist yet.
  await db
    .insert(platformAccountsTable)
    .values({
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash: hashPassword(password),
      role: "admin",
    })
    .onConflictDoNothing({ target: platformAccountsTable.username });

  // Always sync the password hash to the current env var so that rotating
  // PLATFORM_ADMIN_PASSWORD takes effect on the next server restart without
  // needing a manual DB update.
  await db
    .update(platformAccountsTable)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(platformAccountsTable.username, DEFAULT_ADMIN_USERNAME));
}

// --- Accounts ---------------------------------------------------------------

export type AccountStatus = "active" | "pending_approval" | "suspended";

type AccountRow = {
  username: string;
  passwordHash: string;
  role: Role;
  parent: string | null;
  maxSeats: number | null;
  email: string | null;
  website: string | null;
  status: AccountStatus;
};

function rowToAccount(row: typeof platformAccountsTable.$inferSelect): AccountRow {
  const s = row.status as string;
  const status: AccountStatus =
    s === "pending_approval" ? "pending_approval" :
    s === "suspended" ? "suspended" : "active";
  return {
    username: row.username,
    passwordHash: row.passwordHash,
    role: normalizeRole(row.role),
    parent: row.parent ?? null,
    maxSeats: row.maxSeats ?? null,
    email: row.email ?? null,
    website: row.website ?? null,
    status,
  };
}

export async function getAccount(username: string): Promise<AccountRow | null> {
  const u = normUsername(username);
  if (!u) return null;
  const [row] = await db
    .select()
    .from(platformAccountsTable)
    .where(eq(platformAccountsTable.username, u))
    .limit(1);
  if (!row) return null;
  return rowToAccount(row);
}

// Looks up an account by username first, then falls back to email. Used by the
// login endpoint so that both legacy username logins and new email logins work.
export async function getAccountByIdentifier(identifier: string): Promise<AccountRow | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  // Try username first (exact lowercase match).
  const byUsername = await getAccount(trimmed);
  if (byUsername) return byUsername;
  // Fall back to email lookup (case-insensitive).
  const emailLower = trimmed.toLowerCase();
  const [row] = await db
    .select()
    .from(platformAccountsTable)
    .where(eq(platformAccountsTable.email, emailLower))
    .limit(1);
  if (!row) return null;
  return rowToAccount(row);
}

// Check whether an email is already registered (for sign-up uniqueness check).
export async function emailExists(email: string): Promise<boolean> {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) return false;
  const [row] = await db
    .select({ username: platformAccountsTable.username })
    .from(platformAccountsTable)
    .where(eq(platformAccountsTable.email, emailLower))
    .limit(1);
  return !!row;
}

// The set of usernames a given account may see, mirroring the browser rule:
// an admin sees everything (returns null = no filter); a normal account sees
// itself plus every descendant sub-account (recursively). Client accounts also
// see their direct parent so they can access shared/demo projects owned at the
// agency level without needing to log in as the agency.
export async function getVisibleUsernames(
  account: PlatformAccount,
): Promise<string[] | null> {
  if (account.role === "admin") return null;
  const rows = await db
    .select({
      username: platformAccountsTable.username,
      parent: platformAccountsTable.parent,
    })
    .from(platformAccountsTable);
  const childrenByParent = new Map<string, string[]>();
  let accountParent: string | null = null;
  for (const r of rows) {
    const parent = normUsername(r.parent);
    if (!parent) continue;
    const list = childrenByParent.get(parent) || [];
    list.push(normUsername(r.username));
    childrenByParent.set(parent, list);
    if (normUsername(r.username) === normUsername(account.username)) {
      accountParent = parent;
    }
  }
  const start = normUsername(account.username);
  const visible = new Set<string>([start]);
  // Include the direct parent so agency-level projects are visible to clients.
  // We do NOT add it to the queue, so we never expand sideways into the
  // parent's other sub-accounts.
  if (accountParent) visible.add(accountParent);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) || []) {
      if (!visible.has(child)) {
        visible.add(child);
        queue.push(child);
      }
    }
  }
  return [...visible];
}

// Whether `actor` is allowed to manage (change password / delete) `target`.
// Admins may manage anyone; a normal account may manage its own descendants
// but never itself via these admin paths. This intentionally does NOT include
// the parent account that getVisibleUsernames adds for project-visibility —
// management rights are downward-only in the hierarchy.
export async function canManage(
  actor: PlatformAccount,
  targetUsername: string,
): Promise<boolean> {
  const target = normUsername(targetUsername);
  if (!target) return false;
  if (actor.role === "admin") return true;
  const start = normUsername(actor.username);
  if (target === start) return false; // cannot manage yourself via admin paths
  // Build descendants-only set (no parent lookup).
  const rows = await db
    .select({
      username: platformAccountsTable.username,
      parent: platformAccountsTable.parent,
    })
    .from(platformAccountsTable);
  const childrenByParent = new Map<string, string[]>();
  for (const r of rows) {
    const parent = normUsername(r.parent);
    if (!parent) continue;
    const list = childrenByParent.get(parent) || [];
    list.push(normUsername(r.username));
    childrenByParent.set(parent, list);
  }
  const descendants = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) || []) {
      if (!descendants.has(child)) {
        descendants.add(child);
        queue.push(child);
      }
    }
  }
  return descendants.has(target);
}

// --- Sessions ---------------------------------------------------------------

// Session shape returned by the sessions list endpoints.
export type SessionInfo = {
  sid: string;
  createdAt: Date;
  expiresAt: Date;
  ipHint: string | null;
};

// Create a new session for the given username. Single-session enforcement:
// all existing sessions for the account are deleted first so only one device
// can hold an active session at a time.
export async function createPlatformSession(
  username: string,
  ipHint?: string | null,
): Promise<string> {
  const u = normUsername(username);
  // Kill every existing session for this account before issuing a new one.
  await db
    .delete(platformSessionsTable)
    .where(eq(platformSessionsTable.username, u));

  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(platformSessionsTable).values({
    sid,
    username: u,
    expiresAt: new Date(Date.now() + PLATFORM_SESSION_TTL),
    ipHint: ipHint ?? null,
  });
  return sid;
}

// Resolve a session id to its account, refreshing nothing (fixed TTL). Expired
// or unknown sessions return null and are cleaned up.
export async function getPlatformSessionAccount(
  sid: string,
): Promise<PlatformAccount | null> {
  if (!sid) return null;
  const [row] = await db
    .select()
    .from(platformSessionsTable)
    .where(eq(platformSessionsTable.sid, sid))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt < new Date()) {
    await deletePlatformSession(sid);
    return null;
  }
  const account = await getAccount(row.username);
  if (!account) {
    await deletePlatformSession(sid);
    return null;
  }
  return { username: account.username, role: account.role };
}

export async function deletePlatformSession(sid: string): Promise<void> {
  if (!sid) return;
  await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, sid));
}

// List active (non-expired) sessions for a given username. Returns them newest
// first. The sid is returned in full for revoke operations; callers that expose
// it to the browser should mask all but the last 8 chars.
export async function listPlatformSessions(username: string): Promise<SessionInfo[]> {
  const u = normUsername(username);
  const now = new Date();
  const rows = await db
    .select({
      sid: platformSessionsTable.sid,
      createdAt: platformSessionsTable.createdAt,
      expiresAt: platformSessionsTable.expiresAt,
      ipHint: platformSessionsTable.ipHint,
    })
    .from(platformSessionsTable)
    .where(eq(platformSessionsTable.username, u));
  return rows
    .filter((r) => r.expiresAt > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// Revoke all sessions for a username except the one the caller is currently
// using. Used when an admin resets a password or archives an account so other
// sessions are invalidated.
export async function revokeOtherSessions(
  username: string,
  keepSid: string,
): Promise<void> {
  const u = normUsername(username);
  await db
    .delete(platformSessionsTable)
    .where(
      and(
        eq(platformSessionsTable.username, u),
        ne(platformSessionsTable.sid, keepSid),
      ),
    );
}

export function getPlatformSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return req.cookies?.[PLATFORM_COOKIE];
}

export function setPlatformCookie(res: Response, sid: string): void {
  res.cookie(PLATFORM_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: PLATFORM_SESSION_TTL,
  });
}

export function clearPlatformCookie(res: Response): void {
  res.clearCookie(PLATFORM_COOKIE, { path: "/" });
}

// --- Impersonation ("view account" for support) -----------------------------

export function getImpersonationStashId(req: Request): string | undefined {
  return req.cookies?.[PLATFORM_IMPERSONATION_STASH_COOKIE];
}

export function setImpersonationStashCookie(res: Response, sid: string): void {
  res.cookie(PLATFORM_IMPERSONATION_STASH_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: PLATFORM_IMPERSONATION_STASH_TTL,
  });
}

export function clearImpersonationStashCookie(res: Response): void {
  res.clearCookie(PLATFORM_IMPERSONATION_STASH_COOKIE, { path: "/" });
}

import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, platformAccountsTable, platformSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Platform auth: the AIO Fusion application logins (an agency and the client
// sub-accounts it creates). Passwords are hashed with scrypt and sessions are
// server-issued, kept entirely separate from the Replit Auth / OIDC system in
// `lib/auth.ts`. This is the real security boundary - the browser is only a
// cache.

export const PLATFORM_COOKIE = "aio_sid";
export const PLATFORM_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export type Role = "admin" | "user";

export interface PlatformAccount {
  username: string;
  role: Role;
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

// --- Default admin seed -----------------------------------------------------

// Matches the credentials the browser system seeded so the agency can always
// sign in even before any migration has run.
export const DEFAULT_ADMIN_USERNAME = "admin";
// Production can set a strong bootstrap password via env. The fallback keeps the
// existing browser-system credential working so the agency's login carries over
// when no override is provided.
const DEFAULT_ADMIN_PASSWORD =
  process.env.PLATFORM_ADMIN_PASSWORD || "K9mt-4Rxq-7NzPv2";

// Ensure at least one admin exists so the platform is never locked out. Inserts
// the default admin only when no admin account is present. Never overwrites an
// existing account's password.
export async function ensureDefaultAdmin(): Promise<void> {
  const accounts = await db
    .select({ role: platformAccountsTable.role })
    .from(platformAccountsTable);
  if (accounts.some((a) => a.role === "admin")) return;
  await db
    .insert(platformAccountsTable)
    .values({
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      role: "admin",
    })
    .onConflictDoNothing({ target: platformAccountsTable.username });
}

// --- Accounts ---------------------------------------------------------------

export async function getAccount(username: string): Promise<
  | { username: string; passwordHash: string; role: Role; parent: string | null }
  | null
> {
  const u = normUsername(username);
  if (!u) return null;
  const [row] = await db
    .select()
    .from(platformAccountsTable)
    .where(eq(platformAccountsTable.username, u))
    .limit(1);
  if (!row) return null;
  return {
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role === "admin" ? "admin" : "user",
    parent: row.parent,
  };
}

// The set of usernames a given account may see, mirroring the browser rule:
// an admin sees everything (returns null = no filter); a normal account sees
// itself plus every descendant sub-account (recursively).
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
  for (const r of rows) {
    const parent = normUsername(r.parent);
    if (!parent) continue;
    const list = childrenByParent.get(parent) || [];
    list.push(normUsername(r.username));
    childrenByParent.set(parent, list);
  }
  const start = normUsername(account.username);
  const visible = new Set<string>([start]);
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
// but never itself via these admin paths.
export async function canManage(
  actor: PlatformAccount,
  targetUsername: string,
): Promise<boolean> {
  const target = normUsername(targetUsername);
  if (!target) return false;
  if (actor.role === "admin") return true;
  const visible = await getVisibleUsernames(actor);
  if (visible === null) return true;
  return visible.includes(target) && target !== normUsername(actor.username);
}

// --- Sessions ---------------------------------------------------------------

export async function createPlatformSession(username: string): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(platformSessionsTable).values({
    sid,
    username: normUsername(username),
    expiresAt: new Date(Date.now() + PLATFORM_SESSION_TTL),
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

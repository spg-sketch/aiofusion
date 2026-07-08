import crypto from "crypto";
import { type Request, type Response } from "express";
import {
  db,
  platformAccountsTable,
  platformCompaniesTable,
  platformSessionsTable,
  platformUsersTable,
  platformMembershipsTable,
  platformMetaTable,
} from "@workspace/db";
import { and, eq, ne, desc } from "drizzle-orm";

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
  /** UUID from platform_users — present on new sessions, undefined on legacy sessions. */
  userId?: string;
  /** UUID from platform_companies — present on new sessions, undefined on legacy sessions. */
  activeCompanyId?: string;
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

// --- Platform companies (workspace layer) -----------------------------------
//
// Each platform_accounts row has a corresponding platform_companies row that
// gives it a stable UUID identity decoupled from the slug-based primary key.

// Find a company by its slug (= old platform_accounts.username).
export async function getCompanyBySlug(
  slug: string,
): Promise<typeof platformCompaniesTable.$inferSelect | null> {
  const s = normUsername(slug);
  if (!s) return null;
  const [row] = await db
    .select()
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.slug, s))
    .limit(1);
  return row ?? null;
}

// Upsert a platform_companies row for the given account slug. Returns the
// company UUID. Idempotent — safe to call repeatedly.
export async function ensurePlatformCompany(opts: {
  slug: string;
  role?: string;
  parentSlug?: string | null;
  maxSeats?: number | null;
  email?: string | null;
  website?: string | null;
  status?: string;
}): Promise<string> {
  const slug = normUsername(opts.slug);
  const role = opts.role ?? "agency";
  const status = opts.status ?? "active";
  const [company] = await db
    .insert(platformCompaniesTable)
    .values({
      slug,
      role,
      parentSlug: opts.parentSlug ?? null,
      maxSeats: opts.maxSeats ?? null,
      email: opts.email ?? null,
      website: opts.website ?? null,
      status,
    })
    .onConflictDoUpdate({
      target: platformCompaniesTable.slug,
      // role + status always present so the set is never empty.
      // parentSlug + maxSeats are included when explicitly provided (even null)
      // so that backfill can correct hierarchy and seat-cap metadata on
      // pre-created company rows.
      set: {
        role,
        status,
        ...(opts.parentSlug !== undefined ? { parentSlug: opts.parentSlug } : {}),
        ...(opts.maxSeats !== undefined ? { maxSeats: opts.maxSeats } : {}),
        ...(opts.email != null ? { email: opts.email } : {}),
        ...(opts.website != null ? { website: opts.website } : {}),
      },
    })
    .returning({ id: platformCompaniesTable.id });
  return company!.id;
}

// --- Platform users (human identity layer) ----------------------------------
//
// Each human user has exactly one platform_users row. They may be members of
// one or more platform_companies. On sign-up and login we ensure a users row
// exists and is linked to the company via a membership.

// Find a user by email (case-insensitive).
export async function getUserByEmail(email: string): Promise<typeof platformUsersTable.$inferSelect | null> {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) return null;
  const [row] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.email, emailLower))
    .limit(1);
  return row ?? null;
}

// Find a user by Google sub id.
export async function getUserByGoogleId(googleId: string): Promise<typeof platformUsersTable.$inferSelect | null> {
  if (!googleId) return null;
  const [row] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.googleId, googleId))
    .limit(1);
  return row ?? null;
}

// Link a Google id to an existing user (e.g. when they first use Google Sign-In
// on an account that was originally created with a password).
export async function linkGoogleId(userId: string, googleId: string): Promise<void> {
  await db
    .update(platformUsersTable)
    .set({ googleId })
    .where(eq(platformUsersTable.id, userId));
}

// Create a platform_users row, ensure a platform_companies row, and link them
// via a membership. Returns the user id. Idempotent on email.
export async function ensurePlatformUser(opts: {
  email: string;
  name?: string | null;
  passwordHash?: string | null;
  googleId?: string | null;
  companyUsername: string;
  membershipRole?: string;
  companyRole?: string;
  companyParentSlug?: string | null;
  companyMaxSeats?: number | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyStatus?: string;
}): Promise<string> {
  const emailLower = opts.email.trim().toLowerCase();

  // 1. Upsert user row. The conflict-update set must always have at least one
  // field (drizzle throws "No values to set" on an empty set), so we always
  // include a name update — falling back to the un-changed email value as a
  // harmless no-op when all optional fields are absent.
  const [user] = await db
    .insert(platformUsersTable)
    .values({
      email: emailLower,
      name: opts.name ?? null,
      passwordHash: opts.passwordHash ?? null,
      googleId: opts.googleId ?? null,
    })
    .onConflictDoUpdate({
      target: platformUsersTable.email,
      set: {
        // Always update name (even to null) so the set is never empty.
        name: opts.name ?? null,
        ...(opts.googleId != null ? { googleId: opts.googleId } : {}),
        ...(opts.passwordHash != null ? { passwordHash: opts.passwordHash } : {}),
      },
    })
    .returning({ id: platformUsersTable.id });

  const userId = user!.id;

  // 2. Ensure company row exists and get its UUID.
  const companyId = await ensurePlatformCompany({
    slug: opts.companyUsername,
    role: opts.companyRole,
    parentSlug: opts.companyParentSlug,
    maxSeats: opts.companyMaxSeats,
    email: opts.companyEmail,
    website: opts.companyWebsite,
    status: opts.companyStatus,
  });

  // 3. Upsert membership linking user ↔ company UUID.
  await db
    .insert(platformMembershipsTable)
    .values({
      userId,
      companyId,
      companySlug: normUsername(opts.companyUsername),
      role: opts.membershipRole ?? "owner",
    })
    .onConflictDoNothing();

  return userId;
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

// Look up the owner user for a given company slug via platform_memberships.
// Used by the login route to authenticate via platform_users when the
// identifier is a username (not an email address).
export async function getUserByCompanySlug(
  slug: string,
): Promise<typeof platformUsersTable.$inferSelect | null> {
  const s = normUsername(slug);
  if (!s) return null;
  const [membership] = await db
    .select({ userId: platformMembershipsTable.userId })
    .from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.companySlug, s))
    .orderBy(desc(platformMembershipsTable.createdAt))
    .limit(1);
  if (!membership) return null;
  const [user] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.id, membership.userId))
    .limit(1);
  return user ?? null;
}

// --- User membership helpers ------------------------------------------------

// Find the most-recently-created membership for a user. Used by Google OAuth
// to route returning users to their workspace without re-querying by email.
export async function getPrimaryMembership(
  userId: string,
): Promise<typeof platformMembershipsTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.userId, userId))
    .orderBy(desc(platformMembershipsTable.createdAt))
    .limit(1);
  return row ?? null;
}

// --- Sessions ---------------------------------------------------------------

// Session shape returned by the sessions list endpoints.
export type SessionInfo = {
  sid: string;
  createdAt: Date;
  expiresAt: Date;
  ipHint: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
};

// Create a new session for the given username.
// Single-session enforcement: all existing sessions for this account are
// revoked before issuing the new one. This ensures a stolen session token is
// invalidated on the next login, and prevents token accumulation over time.
export async function createPlatformSession(
  username: string,
  ipHint?: string | null,
  userId?: string | null,
  activeCompanyId?: string | null,
): Promise<string> {
  const u = normUsername(username);
  // Revoke all existing sessions for this account before issuing a new one.
  await db
    .delete(platformSessionsTable)
    .where(eq(platformSessionsTable.username, u));

  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(platformSessionsTable).values({
    sid,
    username: u,
    userId: userId ?? null,
    activeCompanyId: activeCompanyId ?? null,
    expiresAt: new Date(Date.now() + PLATFORM_SESSION_TTL),
    ipHint: ipHint ?? null,
  });
  return sid;
}

// Resolve a session id to its account. Uses platform_users + platform_companies
// + platform_memberships as the primary source of truth when the session
// carries userId/activeCompanyId; falls back to platform_accounts for legacy
// sessions or when the new tables have no data for the account.
// Expired or unknown sessions return null and are cleaned up.
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

  // When the session was created by the new auth path, resolve company role
  // from platform_companies (the new source of truth). This propagates any
  // role/status changes made in the new tables without requiring a re-login.
  if (row.activeCompanyId) {
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.id, row.activeCompanyId))
      .limit(1);
    if (company) {
      return {
        username: company.slug,
        role: normalizeRole(company.role),
        userId: row.userId ?? undefined,
        activeCompanyId: company.id,
      };
    }
  }

  // Legacy fallback: resolve from platform_accounts (the original auth record).
  const account = await getAccount(row.username);
  if (!account) {
    await deletePlatformSession(sid);
    return null;
  }
  return {
    username: account.username,
    role: account.role,
    userId: row.userId ?? undefined,
    activeCompanyId: row.activeCompanyId ?? undefined,
  };
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
      userId: platformSessionsTable.userId,
      userEmail: platformUsersTable.email,
      userName: platformUsersTable.name,
    })
    .from(platformSessionsTable)
    .leftJoin(platformUsersTable, eq(platformSessionsTable.userId, platformUsersTable.id))
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

// --- One-time backfill: create platform_companies + platform_users rows -----
//
// For every existing platform_accounts row we need:
//  1. A platform_companies row (stable UUID workspace identity)
//  2. A platform_users row (the human behind the account)
//  3. A platform_memberships row linking user ↔ company
//
// This runs at startup, gated by a platform_meta flag. The flag is only set
// after every account is successfully processed — a partial run leaves the
// flag unset so the next restart retries the remaining rows.

const USER_BACKFILL_FLAG = "platform_users_v2_backfilled";

export async function backfillPlatformUsers(): Promise<void> {
  try {
    const [done] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, USER_BACKFILL_FLAG))
      .limit(1);
    if (done?.value === "true") return;

    const accounts = await db.select().from(platformAccountsTable);
    let allOk = true;

    for (const acc of accounts) {
      try {
        // 1. Ensure company row.
        await ensurePlatformCompany({
          slug: acc.username,
          role: acc.role,
          parentSlug: acc.parent ?? null,
          maxSeats: acc.maxSeats ?? null,
          email: acc.email ?? null,
          website: acc.website ?? null,
          status: acc.status,
        });

        // 2. Ensure user row + membership. Use the email if present; fall back
        // to a synthetic internal address so the unique constraint is satisfied.
        const email = acc.email?.trim().toLowerCase() || `${acc.username}@aio.internal`;
        await ensurePlatformUser({
          email,
          name: null,
          passwordHash: acc.passwordHash,
          googleId: null,
          companyUsername: acc.username,
          membershipRole: acc.role === "admin" ? "admin" : "owner",
          companyRole: acc.role,
          companyParentSlug: acc.parent ?? null,
          companyStatus: acc.status,
        });
      } catch (err) {
        console.warn("[platform-auth] backfillPlatformUsers: failed for", acc.username, err);
        allOk = false;
      }
    }

    // Only mark complete when every row succeeded. A partial run will be
    // retried on the next server restart.
    if (allOk) {
      await db
        .insert(platformMetaTable)
        .values({ key: USER_BACKFILL_FLAG, value: "true" })
        .onConflictDoUpdate({
          target: platformMetaTable.key,
          set: { value: "true" },
        });
    } else {
      console.warn("[platform-auth] backfillPlatformUsers: completed with errors; will retry on next restart");
    }
  } catch (err) {
    console.error("[platform-auth] backfillPlatformUsers failed (non-fatal)", err);
  }
}

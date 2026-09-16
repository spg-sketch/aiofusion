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
  platformEmailVerificationsTable,
} from "@workspace/db";
import { and, eq, ne, desc, sql, isNull, inArray } from "drizzle-orm";
import { logger } from "./logger";

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
  /** UUID from platform_users - present on new sessions, undefined on legacy sessions. */
  userId?: string;
  /** UUID from platform_companies - present on new sessions, undefined on legacy sessions. */
  activeCompanyId?: string;
  /** Email address, if stored on the account. May be undefined for legacy sessions. */
  email?: string | null;
  /**
   * The user's membership role within the active workspace:
   * owner | admin | billing | content | viewer. Undefined for legacy sessions
   * (treated as owner - full access, backward compatible).
   */
  membershipRole?: MembershipRole;
  /**
   * Project ids this member may see/work on. null/undefined = all projects.
   * Only ever set for content/viewer members.
   */
  projectAccess?: string[] | null;
}

// --- Membership roles (per-user, within a workspace) -------------------------

export type MembershipRole = "owner" | "admin" | "billing" | "content" | "viewer";

// Normalise a stored membership role. Legacy "member" behaves like "content";
// anything unknown falls back to "viewer" (least privilege).
export function normalizeMembershipRole(role: unknown): MembershipRole {
  if (role === "owner" || role === "admin" || role === "billing" || role === "content" || role === "viewer") {
    return role;
  }
  if (role === "member") return "content";
  return "viewer";
}

// Whether this member may manage the team (invite/remove members, change roles).
export function canManageTeam(account: PlatformAccount): boolean {
  const r = account.membershipRole;
  return r === undefined || r === "owner" || r === "admin";
}

// Whether this member may access project data at all (billing members may not).
export function canAccessProjects(account: PlatformAccount): boolean {
  return account.membershipRole !== "billing";
}

// Whether this member may write/modify project data (viewers and billing may not).
export function canWriteProjects(account: PlatformAccount): boolean {
  const r = account.membershipRole;
  return r !== "viewer" && r !== "billing";
}

// Parse the JSON project_access column. Returns null (= all projects) when the
// value is missing or malformed.
export function parseProjectAccess(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch { /* fall through */ }
  return null;
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

/**
 * Only the canonical AIO Fusion workspace may carry the platform-level admin
 * role. Older data and tooling could mark an ordinary customer workspace as
 * admin; treat those rows as agencies at the authentication boundary so a
 * data classification error can never grant Master access.
 */
export function normalizeWorkspaceRole(username: unknown, role: unknown): Role {
  const normalized = normalizeRole(role);
  if (normalized === "admin" && normUsername(username) !== DEFAULT_ADMIN_USERNAME) {
    return "agency";
  }
  return normalized;
}

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

  await ensureAutoApprovedAdmins();
}

// Google-verified users listed in PLATFORM_AUTO_APPROVE_ADMIN_EMAILS receive a
// restricted membership in the one canonical Master workspace. This legacy
// allowlist must never promote the user's own company to an admin workspace.
export async function ensureAutoApprovedAdmins(): Promise<void> {
  const raw = process.env.PLATFORM_AUTO_APPROVE_ADMIN_EMAILS;
  if (!raw) return;
  const masterCompany = await getCompanyBySlug(DEFAULT_ADMIN_USERNAME);
  if (!masterCompany) {
    console.warn("[platform-auth] canonical Master company is unavailable; skipping staff allowlist");
    return;
  }
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    // Require a Google-verified identity for this email.
    const [user] = await db
      .select({ id: platformUsersTable.id })
      .from(platformUsersTable)
      .where(sql`lower(${platformUsersTable.email}) = ${email} and ${platformUsersTable.googleId} is not null`)
      .limit(1);
    if (!user) continue;

    await db
      .insert(platformMembershipsTable)
      .values({
        userId: user.id,
        companyId: masterCompany.id,
        companySlug: DEFAULT_ADMIN_USERNAME,
        role: "viewer",
      })
      .onConflictDoNothing();
    console.log(`[platform-auth] ensured restricted Master membership for allowlisted staff: ${email}`);
  }
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
// company UUID. Idempotent - safe to call repeatedly.
export async function ensurePlatformCompany(opts: {
  slug: string;
  role?: string;
  parentSlug?: string | null;
  maxSeats?: number | null;
  email?: string | null;
  website?: string | null;
  status?: string;
  // Opt-in setup gate for fresh organic signups. Omitted preserves legacy NULL
  // semantics for backfills and existing-account logins.
  setupComplete?: boolean | null;
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
      ...(opts.setupComplete !== undefined ? { setupComplete: opts.setupComplete } : {}),
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
        ...(opts.setupComplete !== undefined ? { setupComplete: opts.setupComplete } : {}),
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
    .where(sql`lower(${platformUsersTable.email}) = ${emailLower}`)
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

// Find a user by Microsoft Entra ID oid.
export async function getUserByMicrosoftId(microsoftId: string): Promise<typeof platformUsersTable.$inferSelect | null> {
  if (!microsoftId) return null;
  const [row] = await db
    .select()
    .from(platformUsersTable)
    .where(eq(platformUsersTable.microsoftId, microsoftId))
    .limit(1);
  return row ?? null;
}

// Link a Microsoft id to an existing user.
export async function linkMicrosoftId(userId: string, microsoftId: string): Promise<void> {
  await db
    .update(platformUsersTable)
    .set({ microsoftId })
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
  // Omitted means preserve legacy NULL setup semantics.
  companySetupComplete?: boolean | null;
}): Promise<string> {
  const emailLower = opts.email.trim().toLowerCase();

  // 1. Upsert user row. The conflict-update set must always have at least one
  // field (drizzle throws "No values to set" on an empty set), so we always
  // include a name update - falling back to the un-changed email value as a
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
    setupComplete: opts.companySetupComplete,
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

// Email-verification target metadata is server-owned and keyed by a hash, so
// the raw token never becomes a queryable/persistent key. It lets verification
// target the exact company created by a fresh signup without changing the
// historical token table schema.
export const EMAIL_VERIFICATION_TARGET_PREFIX = "email-verification-target:";
export function emailVerificationTargetKey(token: string): string {
  return `${EMAIL_VERIFICATION_TARGET_PREFIX}${crypto.createHash("sha256").update(token).digest("hex")}`;
}

export class PlatformSignupConflictError extends Error {
  constructor(public readonly conflict: "email" | "username") {
    super(`Platform signup ${conflict} conflict`);
    this.name = "PlatformSignupConflictError";
  }
}

/**
 * Atomically create a brand-new organic password signup.
 *
 * This intentionally does not call ensurePlatformUser: that helper is an
 * idempotent migration/login primitive and its email upsert could reuse an
 * invited/SSO identity. Every row here is an INSERT in one transaction;
 * database uniqueness errors roll the entire signup back.
 */
export async function createFreshPlatformSignup(opts: {
  email: string;
  name: string;
  passwordHash: string;
  companyUsername: string;
  companyName: string;
  website: string;
  verificationToken: string;
}): Promise<{ userId: string; companyId: string }> {
  const email = opts.email.trim().toLowerCase();
  const username = normUsername(opts.companyUsername);

  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select({ id: platformUsersTable.id })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, email))
      .limit(1);
    if (existingUser) throw new PlatformSignupConflictError("email");

    const [existingAccount] = await tx
      .select({ username: platformAccountsTable.username })
      .from(platformAccountsTable)
      .where(sql`lower(${platformAccountsTable.email}) = ${email}`)
      .limit(1);
    if (existingAccount) throw new PlatformSignupConflictError("email");

    const [existingSlug] = await tx
      .select({ username: platformAccountsTable.username })
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, username))
      .limit(1);
    const [existingCompany] = await tx
      .select({ id: platformCompaniesTable.id })
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, username))
      .limit(1);
    if (existingSlug || existingCompany) {
      throw new PlatformSignupConflictError("username");
    }

    await tx.insert(platformAccountsTable).values({
      username,
      passwordHash: opts.passwordHash,
      role: "agency",
      email,
      website: opts.website || null,
      status: "active",
    });

    const [company] = await tx
      .insert(platformCompaniesTable)
      .values({
        slug: username,
        role: "agency",
        email,
        website: opts.website || null,
        displayName: opts.companyName,
        status: "active",
        setupComplete: false,
      })
      .returning({ id: platformCompaniesTable.id });
    if (!company) throw new Error("Fresh signup company was not created.");

    const [user] = await tx
      .insert(platformUsersTable)
      .values({
        email,
        name: opts.name,
        passwordHash: opts.passwordHash,
        emailVerified: false,
      })
      .returning({ id: platformUsersTable.id });
    if (!user) throw new Error("Fresh signup user was not created.");

    await tx.insert(platformMembershipsTable).values({
      userId: user.id,
      companyId: company.id,
      companySlug: username,
      role: "owner",
    });

    await tx.insert(platformEmailVerificationsTable).values({
      token: opts.verificationToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const profileKey = `account:profile:${username}`;
    await tx.insert(platformMetaTable).values({
      key: profileKey,
      value: JSON.stringify({ displayName: opts.companyName, ownerName: opts.name }),
    }).onConflictDoUpdate({
      target: platformMetaTable.key,
      set: { value: JSON.stringify({ displayName: opts.companyName, ownerName: opts.name }) },
    });
    await tx.insert(platformMetaTable).values({
      key: emailVerificationTargetKey(opts.verificationToken),
      value: JSON.stringify({
        userId: user.id,
        companyId: company.id,
        companySlug: username,
      }),
    });

    return { userId: user.id, companyId: company.id };
  });
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

// Agency/partner client workspaces are permanently managed by their parent
// agency.  This is deliberately derived from the hierarchy rather than the
// account:managed metadata flag: older rows (and rows created before the flag
// existed) must have the same no-login boundary.
export async function isAgencyPartnerClient(username: string): Promise<boolean> {
  const account = await getAccount(normUsername(username));
  // Before the agency/client split, migrated children were stored with the
  // generic "user" role. Keep those rows under an agency on the same managed
  // boundary as canonical client rows; do not classify nested agencies or
  // master/admin children as partner clients.
  const childRole = normalizeRole(account?.role);
  if (!account || (childRole !== "client" && childRole !== "user") || !account.parent) return false;
  const parent = await getAccount(normUsername(account.parent));
  return !!parent && normalizeRole(parent.role) === "agency";
}

// Check whether an email is already registered (for sign-up uniqueness check).
export async function emailExists(email: string): Promise<boolean> {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) return false;
  const [row] = await db
    .select({ username: platformAccountsTable.username })
    .from(platformAccountsTable)
    .where(sql`lower(${platformAccountsTable.email}) = ${emailLower}`)
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
// the parent account that getVisibleUsernames adds for project-visibility - 
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

// Increment the session_version counter for a user. Call this on any event
// that should immediately invalidate all of the user's existing sessions:
// password change, email change, access revocation, account suspension.
// The next request with an old session will be rejected by getPlatformSessionAccount.
export async function incrementSessionVersion(userId: string): Promise<number> {
  const [row] = await db
    .update(platformUsersTable)
    .set({ sessionVersion: sql`${platformUsersTable.sessionVersion} + 1` })
    .where(eq(platformUsersTable.id, userId))
    .returning({ sessionVersion: platformUsersTable.sessionVersion });
  return row?.sessionVersion ?? 0;
}

// Create a new session for the given username.
// Single-session enforcement: all existing sessions for this account are
// revoked before issuing the new one. This ensures a stolen session token is
// invalidated on the next login, and prevents token accumulation over time.
// The current session_version is stamped on the session so that any subsequent
// incrementSessionVersion call immediately invalidates it.
export async function createPlatformSession(
  username: string,
  ipHint?: string | null,
  userId?: string | null,
  activeCompanyId?: string | null,
): Promise<string> {
  const u = normUsername(username);
  // Revoke this user's existing sessions before issuing a new one. Multiple
  // team members share the same workspace username (slug), so revocation must
  // be scoped per human user - deleting by username alone would sign out every
  // other member of the team. Legacy sessions without a userId fall back to
  // the old per-account behaviour (restricted to other userless sessions).
  if (userId) {
    await db
      .delete(platformSessionsTable)
      .where(eq(platformSessionsTable.userId, userId));
  } else {
    await db
      .delete(platformSessionsTable)
      .where(
        and(
          eq(platformSessionsTable.username, u),
          isNull(platformSessionsTable.userId),
        ),
      );
  }

  // Stamp the user's current session_version so stale sessions can be detected.
  let sessionVersion: number | null = null;
  if (userId) {
    try {
      const [userRow] = await db
        .select({ sessionVersion: platformUsersTable.sessionVersion })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, userId))
        .limit(1);
      sessionVersion = userRow?.sessionVersion ?? null;
    } catch {
      // Non-fatal - version stamping fails gracefully; session behaves as legacy.
    }
  }

  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(platformSessionsTable).values({
    sid,
    username: u,
    userId: userId ?? null,
    activeCompanyId: activeCompanyId ?? null,
    sessionVersion,
    expiresAt: new Date(Date.now() + PLATFORM_SESSION_TTL),
    ipHint: ipHint ?? null,
  });
  return sid;
}

// Genuine authentication must be remembered independently of session rows:
// logout removes sessions, while impersonation and workspace switching create
// sessions that must never be reported as the client's own sign-in.
export const LAST_SIGN_IN_PREFIX = "account:last-sign-in:";
export const lastSignInKey = (username: string) =>
  `${LAST_SIGN_IN_PREFIX}${normUsername(username)}`;

const WORKSPACE_META_PREFIXES = [
  "account:last-sign-in:",
  "account:onboarding:v1:",
  "account:profile:",
  "account:archived:",
  "account:master-owner:",
  "account:managed:",
  "account:mfa:",
  "account:mfa-trusted:",
  "account:team-seats:",
  "account:image:logo:",
  "account:image:avatar:",
  "account-discount:",
  "projectAddons:",
  "checkout:pending:",
  "billing:last-payment:",
  "fairUsage:multiplier:",
  "spendLimit:monthly:gbp:",
  "suspended-via:",
] as const;

export async function deleteWorkspaceMetadata(username: string): Promise<void> {
  const slug = normUsername(username);
  if (!slug) return;
  await db
    .delete(platformMetaTable)
    .where(inArray(
      platformMetaTable.key,
      WORKSPACE_META_PREFIXES.map((prefix) => `${prefix}${slug}`),
    ));
}

export async function recordLastSignIn(username: string): Promise<void> {
  const value = new Date().toISOString();
  await db
    .insert(platformMetaTable)
    .values({ key: lastSignInKey(username), value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

export async function createSignedInSession(
  username: string,
  rawIp: string | undefined,
  userId?: string,
  activeCompanyId?: string,
): Promise<string> {
  const sid = await createPlatformSession(
    username,
    makeIpHint(rawIp),
    userId,
    activeCompanyId,
  );
  try {
    await recordLastSignIn(username);
  } catch (err) {
    // Authentication remains available if the non-critical activity record
    // cannot be written; the next genuine sign-in retries it.
    logger.warn({ err, username }, "platform sign-in timestamp was not recorded");
  }
  return sid;
}

// Resolve a session id to its account. Uses platform_users + platform_companies
// + platform_memberships as the primary source of truth when the session
// carries userId/activeCompanyId; falls back to platform_accounts for legacy
// sessions or when the new tables have no data for the account.
// Expired or unknown sessions return null and are cleaned up. Agency/partner
// client sessions are also invalidated here unless the request-aware
// impersonation middleware explicitly authorizes a view-as resolution.
export async function getPlatformSessionAccount(
  sid: string,
  options?: { allowAgencyPartnerClient?: boolean },
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

  // Fast-path revocation: if session_version is set on the session, verify it
  // matches the user's current version. A mismatch means something revoked
  // access (password change, removal, suspension) after this session was issued.
  // NULL session_version = legacy session (pre-revocation mechanism) - skip check.
  if (row.userId != null && row.sessionVersion != null) {
    try {
      const [userRow] = await db
        .select({ sessionVersion: platformUsersTable.sessionVersion })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, row.userId))
        .limit(1);
      if (userRow != null && userRow.sessionVersion !== row.sessionVersion) {
        await deletePlatformSession(row.sid);
        return null;
      }
    } catch {
      // Non-fatal - skip version check on error; other guards still apply.
    }
  }

  // Password signups remain unusable until their email verification link is
  // consumed. NULL is intentionally allowed here for legacy and SSO identities
  // (only false means "verification is explicitly pending").
  if (row.userId) {
    try {
      const [userRow] = await db
        .select({ emailVerified: platformUsersTable.emailVerified })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, row.userId))
        .limit(1);
      if (userRow?.emailVerified === false) {
        await deletePlatformSession(row.sid);
        return null;
      }
    } catch {
      // A user-bound session cannot be proven safe when its verification state
      // is unavailable. Fail closed rather than allowing an unverified session
      // to continue during a transient database failure.
      try {
        await deletePlatformSession(row.sid);
      } catch {
        // The request is still rejected even if cleanup is unavailable.
      }
      return null;
    }
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
      // Mirror the same status guard as the legacy path: suspended companies
      // must not be granted access. Invalidate the session so the user is
      // forced to re-authenticate. (Legacy "pending_approval" is treated as
      // active - the signup-approval flow was removed.)
      if (company.status === "suspended") {
        await deletePlatformSession(sid);
        return null;
      }
      // Also cross-check the legacy platform_accounts row - an admin may
      // have suspended the account there without going through the new tables.
      const legacyAccount = await getAccount(company.slug);
      if (legacyAccount && legacyAccount.status === "suspended") {
        await deletePlatformSession(sid);
        return null;
      }
      // Agency/partner clients are permanently managed even when the
      // account:managed flag is absent.  The only exception is a session
      // explicitly authorized by the request-aware impersonation middleware.
      if (
        !options?.allowAgencyPartnerClient
        && await isAgencyPartnerClient(company.slug)
      ) {
        await deletePlatformSession(sid);
        return null;
      }
      // Resolve the user's membership within this workspace so fine-grained
      // role rules (viewer read-only, content assigned-projects-only, billing
      // invoices-only) can be enforced downstream. Legacy sessions without a
      // userId keep membershipRole undefined = full access.
      let membershipRole: MembershipRole | undefined;
      let projectAccess: string[] | null | undefined;
      if (row.userId) {
        try {
          const [mem] = await db
            .select({
              role: platformMembershipsTable.role,
              projectAccess: platformMembershipsTable.projectAccess,
            })
            .from(platformMembershipsTable)
            .where(
              and(
                eq(platformMembershipsTable.userId, row.userId),
                eq(platformMembershipsTable.companyId, company.id),
              ),
            )
            .limit(1);
          if (mem) {
            membershipRole = normalizeMembershipRole(mem.role);
            projectAccess = parseProjectAccess(mem.projectAccess);
          }
        } catch { /* non-fatal - treated as legacy full-access session */ }
      }
      return {
        username: company.slug,
        role: normalizeWorkspaceRole(company.slug, company.role),
        userId: row.userId ?? undefined,
        activeCompanyId: company.id,
        membershipRole,
        projectAccess,
      };
    }
  }

  // Legacy fallback: resolve from platform_accounts (the original auth record).
  const account = await getAccount(row.username);
  if (!account || account.status === "suspended") {
    await deletePlatformSession(sid);
    return null;
  }
  if (
    !options?.allowAgencyPartnerClient
    && await isAgencyPartnerClient(account.username)
  ) {
    await deletePlatformSession(sid);
    return null;
  }
  return {
    username: account.username,
    role: normalizeWorkspaceRole(account.username, account.role),
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
// When `userId` is provided, results are restricted to sessions belonging to
// that specific human user (platform_sessions.user_id). This matters because
// multiple human members of the same workspace share the slug in the
// `username` column, so slug-only scoping would leak other members' sessions.
export async function listPlatformSessions(
  username: string,
  userId?: string,
): Promise<SessionInfo[]> {
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
    .where(
      userId
        ? and(
            eq(platformSessionsTable.username, u),
            eq(platformSessionsTable.userId, userId),
          )
        : eq(platformSessionsTable.username, u),
    );
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

// True when the current request is an impersonation ("view account") session:
// a stash cookie is present AND it still resolves to a live original session.
// A stale/expired stash does not count - the visitor is then just a normal
// signed-in user and must not be locked out of their own account controls.
export async function isImpersonatedRequest(req: Request): Promise<boolean> {
  const stashSid = getImpersonationStashId(req);
  if (!stashSid) return false;
  try {
    const original = await getPlatformSessionAccount(stashSid);
    return original !== null;
  } catch {
    // If we cannot verify, err on the side of blocking the sensitive action.
    return true;
  }
}

// --- Master account sub-roles ------------------------------------------------
//
// Members of the master (admin-role) workspace are tiered by their membership
// role rather than a separate table:
//   owner (or legacy session without membership)  -> "owner"    full control
//   admin membership                              -> "technical" dashboards,
//        impersonation (debug), audit data - no flags, no account blocking,
//        no deletions, no migration
//   any other membership (billing/content/viewer) -> "support"  view accounts,
//        impersonation (support), read-only dashboards
// Non-master accounts return null.
export type MasterSubrole = "owner" | "technical" | "support";

export function masterSubrole(account: { role: string; membershipRole?: MembershipRole }): MasterSubrole | null {
  if (normalizeRole(account.role) !== "admin") return null;
  const m = account.membershipRole;
  if (m === undefined || m === "owner") return "owner";
  if (m === "admin") return "technical";
  return "support";
}

/** True when the actor is the master workspace but lacks owner-level control. */
export function isRestrictedMaster(account: { role: string; membershipRole?: MembershipRole }): boolean {
  const sub = masterSubrole(account);
  return sub === "technical" || sub === "support";
}

export const MASTER_OWNER_REQUIRED_MESSAGE =
  "Only the master account owner can perform this action.";

export const IMPERSONATION_BLOCKED_MESSAGE =
  "This action is unavailable while viewing another account. Exit the account view first.";

// --- One-time backfill: create platform_companies + platform_users rows -----
//
// For every existing platform_accounts row we need:
//  1. A platform_companies row (stable UUID workspace identity)
//  2. A platform_users row (the human behind the account)
//  3. A platform_memberships row linking user ↔ company
//
// This runs at startup, gated by a platform_meta flag. The flag is only set
// after every account is successfully processed - a partial run leaves the
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

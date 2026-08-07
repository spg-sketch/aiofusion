import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import {
  db,
  platformAccountsTable,
  platformCompaniesTable,
  platformMembershipsTable,
  platformMetaTable,
  platformSessionsTable,
  platformUsersTable,
  projectsTable,
  projectSnapshotsTable,
  archiveItemsTable,
  plannerItemsTable,
  scoringConfigsTable,
  mediaOutletsTable,
  mediaContactsTable,
  mediaCategoriesTable,
  tokenUsageTable,
  auditLocksTable,
  adminEventsTable,
  platformEmailVerificationsTable,
  platformPasswordResetsTable,
  platformInvitationsTable,
} from "@workspace/db";
import { and, count, desc, eq, gt, gte, ilike, inArray, isNull, like, lte, ne, sql } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  normUsername,
  USERNAME_RE,
  getAccount,
  getAccountByIdentifier,
  emailExists,
  getVisibleUsernames,
  canManage,
  normalizeRole,
  canCreateSubAccounts,
  ensureDefaultAdmin,
  createPlatformSession,
  deletePlatformSession,
  listPlatformSessions,
  revokeOtherSessions,
  getPlatformSessionId,
  setPlatformCookie,
  clearPlatformCookie,
  getImpersonationStashId,
  setImpersonationStashCookie,
  clearImpersonationStashCookie,
  getPlatformSessionAccount,
  makeIpHint,
  ensurePlatformUser,
  getUserByEmail,
  getUserByGoogleId,
  getUserByCompanySlug,
  getPrimaryMembership,
  linkGoogleId,
  getUserByMicrosoftId,
  linkMicrosoftId,
  type Role,
  getCompanyBySlug,
  incrementSessionVersion,
  normalizeMembershipRole,
} from "../lib/platform-auth";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { cspHeaderWithScriptNonce } from "../middleware/csp";
import {
  getMfaState,
  getMfaEnabledSet,
  saveMfaState,
  clearMfaState,
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUrl,
  generateRecoveryCodes,
  hashRecoveryCode,
  consumeRecoveryCode,
  createMfaPendingToken,
  verifyMfaPendingToken,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_TTL_MS,
  isTrustedDevice,
  addTrustedDevice,
  listTrustedDevices,
  revokeTrustedDevice,
  clearTrustedDevices,
  verifyTrustedDeviceToken,
} from "../lib/mfa";
import { loginLimiter } from "../middleware/rate-limit";
import { logAdminEvent } from "../lib/admin-events";
import { sendNewSignupAlert, sendApprovalEmail, sendVerificationEmail, sendPasswordResetEmail, sendMfaAdminResetEmail, sendMfaChangedEmail, sendPasswordChangedEmail, sendEmailChangedEmail, sendNewTrustedDeviceEmail, getAppBaseUrl } from "../lib/notify-email";
import { getValidInvite, consumeInvite } from "../lib/team-invites";

const router: IRouter = Router();

const MIGRATED_FLAG = "accounts_migrated";

function publicAccount(
  row: { username: string; role: string; parent: string | null },
  displayName?: string,
  archived?: boolean,
  mfaEnabled?: boolean,
) {
  return {
    username: row.username,
    role: normalizeRole(row.role),
    parent: row.parent ?? undefined,
    ...(displayName ? { displayName } : {}),
    ...(archived ? { archived: true } : {}),
    ...(mfaEnabled ? { mfaEnabled: true } : {}),
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

// Master-owner accounts can "Switch to Master" from their own Client Accounts
// page without needing to log out and back in as admin. Flag stored as a
// platform_meta row (same pattern as archived). Only admins may grant this.
const MASTER_OWNER_PREFIX = "account:master-owner:";
const masterOwnerKey = (username: string) => `${MASTER_OWNER_PREFIX}${normUsername(username)}`;

async function getMasterOwnerSet(): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${MASTER_OWNER_PREFIX}%`));
  return new Set(rows.map((r) => r.key.slice(MASTER_OWNER_PREFIX.length)));
}

async function isMasterOwner(username: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, masterOwnerKey(username)));
  return rows.length > 0;
}

async function setMasterOwner(username: string, value: boolean): Promise<void> {
  const key = masterOwnerKey(username);
  if (value) {
    await db
      .insert(platformMetaTable)
      .values({ key, value: "true" })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: "true" } });
  } else {
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, key));
  }
}

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
router.get("/platform/me", async (req: Request, res: Response) => {
  let impersonating: { by: string; byRole: string } | null = null;
  const stashSid = getImpersonationStashId(req);
  if (req.account && stashSid) {
    const adminAccount = await getPlatformSessionAccount(stashSid);
    if (adminAccount) impersonating = { by: adminAccount.username, byRole: adminAccount.role };
  }
  let googleLinked = false;
  let microsoftLinked = false;
  let hasPassword = false;
  let masterOwner = false;
  let emailVerified: boolean | null = null;
  let setupComplete: boolean | null = null;
  // Profile fields for intake form prefill. Only populated for the account's
  // own direct session (not impersonation, not a team-member session).
  let accountDisplayName: string | null = null;
  let accountWebsite: string | null = null;
  if (req.account) {
    try {
      // Prefer the session's own userId so member sessions reflect the
      // individual user's credentials, not the workspace owner's.
      let u: typeof platformUsersTable.$inferSelect | null = null;
      if (req.account.userId) {
        const rows = await db
          .select()
          .from(platformUsersTable)
          .where(eq(platformUsersTable.id, req.account.userId))
          .limit(1);
        u = rows[0] ?? null;
      }
      // Load the account row unconditionally - website lives on platform_accounts
      // and must be available for both modern (userId) and legacy sessions.
      const acc = await getAccount(normUsername(req.account.username));
      // Legacy fallback: sessions created before userId was stored.
      if (!u) {
        if (acc?.email) u = await getUserByEmail(acc.email);
      }
      if (u) {
        googleLinked = !!(u.googleId);
        microsoftLinked = !!(u.microsoftId);
        hasPassword = !!(u.passwordHash);
        emailVerified = u.emailVerified ?? null;
      }
      accountWebsite = acc?.website ?? null;
    } catch { /* non-fatal */ }
    try {
      masterOwner = await isMasterOwner(req.account.username);
    } catch { /* non-fatal */ }
    try {
      const co = await getCompanyBySlug(normUsername(req.account.username));
      setupComplete = co?.setupComplete ?? null;
    } catch { /* non-fatal */ }
    // displayName lives in platform_meta
    try {
      const [profileRow] = await db
        .select()
        .from(platformMetaTable)
        .where(eq(platformMetaTable.key, profileKey(normUsername(req.account.username))))
        .limit(1);
      accountDisplayName = parseDisplayName(profileRow?.value) ?? null;
    } catch { /* non-fatal */ }
  }
  const accountWithGoogle = req.account
    ? {
        ...req.account,
        googleLinked,
        microsoftLinked,
        membershipRole: req.account.membershipRole ?? null,
        projectAccess: req.account.projectAccess ?? null,
      }
    : null;

  // All workspaces the signed-in human belongs to - drives the workspace
  // switcher on the client without a second round-trip.
  let workspaces: Array<{
    companyId: string;
    companySlug: string;
    companyName: string;
    companyRole: string;
    membershipRole: string;
    isActive: boolean;
  }> = [];
  if (req.account?.userId) {
    try {
      const mems = await db
        .select({
          companyId: platformMembershipsTable.companyId,
          companySlug: platformMembershipsTable.companySlug,
          membershipRole: platformMembershipsTable.role,
          companyRole: platformCompaniesTable.role,
          companyName: platformCompaniesTable.displayName,
        })
        .from(platformMembershipsTable)
        .innerJoin(
          platformCompaniesTable,
          eq(platformMembershipsTable.companyId, platformCompaniesTable.id),
        )
        .where(
          and(
            eq(platformMembershipsTable.userId, req.account.userId),
            eq(platformCompaniesTable.status, "active"),
          ),
        );
      workspaces = mems.map((m) => ({
        companyId: m.companyId,
        companySlug: m.companySlug,
        companyName: m.companyName || m.companySlug,
        companyRole: normalizeRole(m.companyRole),
        membershipRole: normalizeMembershipRole(m.membershipRole),
        isActive: m.companyId === req.account!.activeCompanyId,
      }));
    } catch { /* non-fatal - client falls back to single-workspace mode */ }
  }

  res.setHeader("Cache-Control", "no-store");
  res.json({
    account: accountWithGoogle,
    impersonating,
    masterOwner,
    emailVerified,
    setupComplete,
    hasPassword,
    // Returned for client-side intake prefill. The client performs its own
    // role + impersonation guard before using these values.
    accountProfile: { displayName: accountDisplayName, website: accountWebsite },
    workspaces,
  });
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

// --- MFA (TOTP) ---------------------------------------------------------------
//
// Master (admin) accounts MUST use two-factor login: enrolment is forced on
// their first login and a code is required on every subsequent login. Other
// accounts may opt in. After a correct password, when a challenge is needed the
// login endpoint returns a short-lived signed token instead of a session; the
// /platform/mfa/verify (or /enable, during enrolment) endpoint exchanges it for
// a real session once the code checks out.

interface LoginIdentity {
  username: string;
  role: string;
  userId?: string;
  activeCompanyId?: string;
  needsSetup: boolean;
}

// Decide whether to issue a session immediately or return an MFA challenge.
async function finishLoginOrChallenge(
  res: Response,
  identity: LoginIdentity,
  rawIp: string | undefined,
  trustedDeviceCookie?: string,
): Promise<void> {
  const isMaster = normalizeRole(identity.role) === "admin";
  let mfa: Awaited<ReturnType<typeof getMfaState>> = null;
  try {
    mfa = await getMfaState(identity.username);
  } catch { /* non-fatal: fall through to challenge rules below */ }

  if (mfa?.enabled) {
    // "Remember this device": a validly signed, unrevoked trusted-device cookie
    // lets this browser skip the code until it expires or is revoked.
    if (await isTrustedDevice(identity.username, trustedDeviceCookie)) {
      const sid = await createPlatformSession(
        identity.username,
        makeIpHint(rawIp),
        identity.userId,
        identity.activeCompanyId,
      );
      setPlatformCookie(res, sid);
      res.json({
        account: { username: identity.username, role: identity.role },
        ...(identity.needsSetup ? { needsSetup: true } : {}),
      });
      return;
    }
    const mfaToken = createMfaPendingToken({
      u: identity.username,
      uid: identity.userId,
      cid: identity.activeCompanyId,
      role: identity.role,
      needsSetup: identity.needsSetup || undefined,
      mode: "verify",
    });
    res.json({ mfaRequired: true, mfaToken });
    return;
  }

  if (isMaster) {
    // Mandatory enrolment: no session until a TOTP secret is confirmed.
    const mfaToken = createMfaPendingToken({
      u: identity.username,
      uid: identity.userId,
      cid: identity.activeCompanyId,
      role: identity.role,
      needsSetup: identity.needsSetup || undefined,
      mode: "enroll",
    });
    res.json({ mfaEnrollRequired: true, mfaToken });
    return;
  }

  const sid = await createPlatformSession(
    identity.username,
    makeIpHint(rawIp),
    identity.userId,
    identity.activeCompanyId,
  );
  setPlatformCookie(res, sid);
  res.json({
    account: { username: identity.username, role: identity.role },
    ...(identity.needsSetup ? { needsSetup: true } : {}),
  });
}

// Issue the real session after a successful MFA code check during login.
async function completeMfaLogin(
  res: Response,
  payload: { u: string; uid?: string; cid?: string; role: string; needsSetup?: boolean },
  rawIp: string | undefined,
  extra?: Record<string, unknown>,
): Promise<void> {
  const sid = await createPlatformSession(payload.u, makeIpHint(rawIp), payload.uid, payload.cid);
  setPlatformCookie(res, sid);
  res.json({
    account: { username: payload.u, role: payload.role },
    ...(payload.needsSetup ? { needsSetup: true } : {}),
    ...(extra ?? {}),
  });
}

// Cookie used to hand the short-lived MFA pending token to the frontend after
// an OAuth redirect. Deliberately NOT httpOnly: the frontend reads it once and
// clears it. This keeps the token out of the address bar, browser history, and
// proxy/access logs. The token alone grants nothing without a valid TOTP code.
export const OAUTH_MFA_TOKEN_COOKIE = "aio_oauth_mfa_token";

// Redirect-based variant of finishLoginOrChallenge for the OAuth callbacks.
// SSO logins are browser redirects (not JSON), so when an MFA challenge is
// required the short-lived pending token is handed to the frontend via a
// short-lived cookie (`oauth_status=mfa` signals the frontend to read it)
// instead of a JSON body. The token alone grants nothing - a valid TOTP
// (or recovery) code is still required to get a session.
async function finishOauthLoginOrChallenge(
  req: Request,
  res: Response,
  origin: string,
  identity: LoginIdentity,
): Promise<void> {
  const isMaster = normalizeRole(identity.role) === "admin";
  let mfa: Awaited<ReturnType<typeof getMfaState>> = null;
  try {
    mfa = await getMfaState(identity.username);
  } catch { /* non-fatal: fall through to challenge rules below */ }

  if (mfa?.enabled || isMaster) {
    const mode: "enroll" | "verify" = mfa?.enabled ? "verify" : "enroll";
    // Trusted device: skip the code for verify-mode challenges only (mandatory
    // enrolment can never be skipped).
    if (mode === "verify" && await isTrustedDevice(
      identity.username,
      (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE],
    )) {
      const sid = await createPlatformSession(
        identity.username,
        makeIpHint(req.ip),
        identity.userId,
        identity.activeCompanyId,
      );
      setPlatformCookie(res, sid);
      res.redirect(`${origin}/?oauth_status=ok${identity.needsSetup ? "&needs_setup=true" : ""}`);
      return;
    }
    const mfaToken = createMfaPendingToken({
      u: identity.username,
      uid: identity.userId,
      cid: identity.activeCompanyId,
      role: identity.role,
      needsSetup: identity.needsSetup || undefined,
      mode,
    });
    res.cookie(OAUTH_MFA_TOKEN_COOKIE, mfaToken, {
      httpOnly: false, // frontend must read it once, then clear it
      secure: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      path: "/",
    });
    res.redirect(`${origin}/?oauth_status=mfa&mfa_mode=${mode}`);
    return;
  }

  const sid = await createPlatformSession(
    identity.username,
    makeIpHint(req.ip),
    identity.userId,
    identity.activeCompanyId,
  );
  setPlatformCookie(res, sid);
  res.redirect(`${origin}/?oauth_status=ok${identity.needsSetup ? "&needs_setup=true" : ""}`);
}

function clientIp(req: Request): string | undefined {
  return (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? undefined;
}

router.post("/platform/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    // Accept either a username or an email in the `username` field so that
    // legacy username logins and new email logins both work without change.
    const identifier = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!identifier || !password) {
      res.status(400).json({ error: "Enter your username (or email) and password." });
      return;
    }
    // --- Primary credential lookup: platform_users (new source of truth) ----
    // If the identifier is an email address, look up by email in platform_users.
    // Otherwise treat the identifier as a company slug and resolve the user via
    // platform_memberships. This makes platform_users the primary credential
    // store, with platform_accounts as the fallback for unbackfilled accounts.
    const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress;
    const isEmail = identifier.includes("@");
    const newUser = isEmail
      ? await getUserByEmail(identifier)
      : await getUserByCompanySlug(identifier);
    if (newUser && newUser.passwordHash && verifyPassword(password, newUser.passwordHash)) {
      // Credential verified via platform_users. Resolve company for status check.
      const membership = await getPrimaryMembership(newUser.id);
      const companySlug = membership?.companySlug ?? normUsername(identifier);
      const acct = companySlug ? await getAccount(companySlug) : null;
      if (acct) {
        const [archivedNew] = await db
          .select()
          .from(platformMetaTable)
          .where(eq(platformMetaTable.key, archiveKey(acct.username)))
          .limit(1);
        if (archivedNew?.value === "true") {
          res.status(403).json({ error: "This account has been archived. Contact your administrator." });
          return;
        }
        if (acct.status === "suspended") { res.status(403).json({ error: "This account has been suspended. Contact your administrator." }); return; }
        let activeCompanyId: string | undefined;
        try {
          const company = await getCompanyBySlug(acct.username);
          activeCompanyId = company?.id;
        } catch { /* non-fatal */ }
        let loginNeedsSetup = false;
        try {
          const loginCo = await getCompanyBySlug(acct.username);
          if (loginCo?.setupComplete === false) loginNeedsSetup = true;
        } catch { /* non-fatal */ }
        await finishLoginOrChallenge(res, {
          username: acct.username,
          role: acct.role,
          userId: newUser.id,
          activeCompanyId,
          needsSetup: loginNeedsSetup,
        }, rawIp ?? undefined, (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE]);
        return;
      }
    }

    // --- Legacy fallback: platform_accounts ----------------------------------
    // Covers accounts not yet backfilled into platform_users (e.g. username-only
    // accounts without an email address set).
    const account = await getAccountByIdentifier(identifier);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }
    // Block archived accounts (soft-deactivated via platform_meta flag).
    const [archivedRow] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, archiveKey(account.username)))
      .limit(1);
    if (archivedRow?.value === "true") {
      res.status(403).json({ error: "This account has been archived. Contact your administrator." });
      return;
    }
    if (account.status === "suspended") {
      res.status(403).json({ error: "This account has been suspended. Contact your administrator." });
      return;
    }
    // Ensure a platform_users row exists and is linked to this account, then
    // store the userId in the session so downstream can identify the human user.
    let userId: string | undefined;
    let activeCompanyId: string | undefined;
    if (account.email) {
      try {
        userId = await ensurePlatformUser({
          email: account.email,
          passwordHash: account.passwordHash,
          companyUsername: account.username,
          membershipRole: account.role === "admin" ? "admin" : "owner",
          companyRole: account.role,
          companyStatus: account.status,
        });
        // Resolve the company UUID so the session carries the active workspace id.
        const company = await getCompanyBySlug(account.username);
        activeCompanyId = company?.id;
      } catch {
        // Non-fatal: session still works, userId/activeCompanyId just won't be set.
      }
    }
    let legacyNeedsSetup = false;
    try {
      const legacyCo = await getCompanyBySlug(account.username);
      if (legacyCo?.setupComplete === false) legacyNeedsSetup = true;
    } catch { /* non-fatal */ }
    await finishLoginOrChallenge(res, {
      username: account.username,
      role: account.role,
      userId,
      activeCompanyId,
      needsSetup: legacyNeedsSetup,
    }, rawIp ?? undefined, (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE]);
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// --- MFA endpoints ------------------------------------------------------------

// Begin (or restart) TOTP enrolment. Accepts EITHER a pending login token in
// `mfaToken` (mandatory enrolment for masters during login) OR an authenticated
// session (opt-in enrolment for everyone else). Generates a fresh secret stored
// unconfirmed; nothing changes for login until /platform/mfa/enable confirms it.
router.post("/platform/mfa/setup", loginLimiter, async (req: Request, res: Response) => {
  try {
    let username: string | null = null;
    const token = typeof req.body?.mfaToken === "string" ? req.body.mfaToken : "";
    if (token) {
      const payload = verifyMfaPendingToken(token);
      if (!payload || payload.mode !== "enroll") {
        res.status(401).json({ error: "Your sign-in session expired. Please sign in again." });
        return;
      }
      username = payload.u;
    } else if (req.account) {
      username = req.account.username;
    }
    if (!username) {
      res.status(401).json({ error: "Sign in first to set up two-factor authentication." });
      return;
    }
    const existing = await getMfaState(username);
    if (existing?.enabled) {
      res.status(409).json({ error: "Two-factor authentication is already enabled on this account." });
      return;
    }
    const secret = generateTotpSecret();
    await saveMfaState(username, { secret, enabled: false, recoveryHashes: [] });
    const acc = await getAccount(normUsername(username));
    const label = acc?.email || username;
    res.setHeader("Cache-Control", "no-store");
    res.json({ secret, otpauthUrl: buildOtpauthUrl(secret, label) });
  } catch {
    res.status(500).json({ error: "Could not start two-factor setup" });
  }
});

// Confirm enrolment with a first TOTP code. Enables MFA and returns the
// single-use recovery codes (shown exactly once). When called with a pending
// login token (mandatory master enrolment), also issues the session.
router.post("/platform/mfa/enable", loginLimiter, async (req: Request, res: Response) => {
  try {
    // Defense in depth: the OAuth MFA handoff cookie is single-use. The
    // frontend clears it after reading, but clear it server-side too so it
    // never lingers once the two-factor step completes (success or failure).
    res.clearCookie(OAUTH_MFA_TOKEN_COOKIE, { path: "/" });
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const token = typeof req.body?.mfaToken === "string" ? req.body.mfaToken : "";
    let username: string | null = null;
    let pending: ReturnType<typeof verifyMfaPendingToken> = null;
    if (token) {
      pending = verifyMfaPendingToken(token);
      if (!pending || pending.mode !== "enroll") {
        res.status(401).json({ error: "Your sign-in session expired. Please sign in again." });
        return;
      }
      username = pending.u;
    } else if (req.account) {
      username = req.account.username;
    }
    if (!username) {
      res.status(401).json({ error: "Sign in first to set up two-factor authentication." });
      return;
    }
    const state = await getMfaState(username);
    if (!state) {
      res.status(400).json({ error: "Two-factor setup has not been started. Scan the QR code first." });
      return;
    }
    if (state.enabled) {
      res.status(409).json({ error: "Two-factor authentication is already enabled." });
      return;
    }
    if (!verifyTotp(state.secret, code)) {
      res.status(401).json({ error: "That code is not valid. Check your authenticator app and try again." });
      return;
    }
    const recoveryCodes = generateRecoveryCodes();
    await saveMfaState(username, {
      secret: state.secret,
      enabled: true,
      recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    });
    await logAdminEvent({ username }, "mfa_enabled", username, "account");
    // Fire-and-forget security alert to the account holder (fail-soft).
    void (async () => {
      try {
        const [ownerRow] = await db
          .select({ email: platformUsersTable.email, name: platformUsersTable.name })
          .from(platformMembershipsTable)
          .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
          .where(and(
            eq(platformMembershipsTable.companySlug, normUsername(username)),
            eq(platformMembershipsTable.role, "owner"),
          ))
          .orderBy(platformMembershipsTable.createdAt)
          .limit(1);
        const accRow = ownerRow?.email ? null : await getAccount(normUsername(username));
        const toEmail = ownerRow?.email || accRow?.email;
        if (!toEmail) return;
        await sendMfaChangedEmail({ toEmail, toName: ownerRow?.name || username, enabled: true });
      } catch (err) {
        logger.warn({ err, username }, "mfa/enable: failed to send security alert (non-fatal)");
      }
    })();
    if (pending) {
      await completeMfaLogin(res, pending, clientIp(req), { recoveryCodes });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, recoveryCodes });
  } catch {
    res.status(500).json({ error: "Could not enable two-factor authentication" });
  }
});

// Second login step: verify a TOTP code (or a single-use recovery code) against
// the pending login token, then issue the real session.
router.post("/platform/mfa/verify", loginLimiter, async (req: Request, res: Response) => {
  try {
    // Defense in depth: clear the single-use OAuth MFA handoff cookie whether
    // or not verification succeeds (the frontend also clears it after reading).
    res.clearCookie(OAUTH_MFA_TOKEN_COOKIE, { path: "/" });
    const token = typeof req.body?.mfaToken === "string" ? req.body.mfaToken : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const pending = verifyMfaPendingToken(token);
    if (!pending || pending.mode !== "verify") {
      res.status(401).json({ error: "Your sign-in session expired. Please sign in again." });
      return;
    }
    if (!code) {
      res.status(400).json({ error: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    const state = await getMfaState(pending.u);
    if (!state?.enabled) {
      // MFA was disabled between password check and this call - let them in.
      await completeMfaLogin(res, pending, clientIp(req));
      return;
    }
    // "Trust this device for 30 days": on success, register the device and set
    // a signed, device-bound cookie so future logins here skip the code.
    const trustThisDevice = async () => {
      if (req.body?.trustDevice !== true) return;
      try {
        const label = (req.headers["user-agent"] as string | undefined)?.slice(0, 160) || "Unknown device";
        const { cookieValue, device } = await addTrustedDevice(pending.u, label);
        res.cookie(TRUSTED_DEVICE_COOKIE, cookieValue, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: TRUSTED_DEVICE_TTL_MS,
        });
        await logAdminEvent({ username: pending.u }, "mfa_device_trusted", pending.u, "account");
        // Security alert: fire-and-forget, never blocks login.
        // Recipient = earliest OWNER membership email, falling back to the
        // account's canonical email - same rule as reset-mfa alert.
        void (async () => {
          try {
            const [ownerRow] = await db
              .select({ email: platformUsersTable.email, name: platformUsersTable.name })
              .from(platformMembershipsTable)
              .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
              .where(and(
                eq(platformMembershipsTable.companySlug, pending.u),
                eq(platformMembershipsTable.role, "owner"),
              ))
              .orderBy(platformMembershipsTable.createdAt)
              .limit(1);
            const [accRow] = await db
              .select({ email: platformAccountsTable.email })
              .from(platformAccountsTable)
              .where(eq(platformAccountsTable.username, pending.u))
              .limit(1);
            const toEmail = ownerRow?.email || accRow?.email;
            if (!toEmail) return;
            const securitySettingsUrl = `${getAppBaseUrl()}/`;
            await sendNewTrustedDeviceEmail({
              toEmail,
              toName: ownerRow?.name || pending.u,
              deviceLabel: device.label,
              securitySettingsUrl,
            });
          } catch (err) {
            logger.warn({ err, username: pending.u }, "trusted-device: failed to send security alert (non-fatal)");
          }
        })();
      } catch { /* non-fatal: login still completes without the trusted cookie */ }
    };
    if (verifyTotp(state.secret, code)) {
      await trustThisDevice();
      await completeMfaLogin(res, pending, clientIp(req));
      return;
    }
    // Fall back to recovery codes (single-use).
    const remaining = consumeRecoveryCode(state, code);
    if (remaining !== null) {
      await saveMfaState(pending.u, { ...state, recoveryHashes: remaining });
      await logAdminEvent({ username: pending.u }, "mfa_recovery_code_used", pending.u, "account");
      await trustThisDevice();
      await completeMfaLogin(res, pending, clientIp(req), { recoveryCodesRemaining: remaining.length });
      return;
    }
    res.status(401).json({ error: "That code is not valid. Try again, or use a recovery code." });
  } catch {
    res.status(500).json({ error: "Could not verify the code" });
  }
});

// Current MFA status for the signed-in account.
router.get("/platform/mfa/status", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    const state = await getMfaState(account.username);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      enabled: state?.enabled === true,
      required: normalizeRole(account.role) === "admin",
      recoveryCodesRemaining: state?.enabled ? state.recoveryHashes.length : 0,
    });
  } catch {
    res.status(500).json({ error: "Could not load two-factor status" });
  }
});

// Turn MFA off. Requires a currently-valid TOTP code, and is refused for master
// (admin) accounts - MFA is mandatory for them.
router.post("/platform/mfa/disable", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    if (normalizeRole(account.role) === "admin") {
      res.status(403).json({ error: "Two-factor authentication is mandatory for master accounts and cannot be disabled." });
      return;
    }
    const state = await getMfaState(account.username);
    if (!state?.enabled) {
      res.status(400).json({ error: "Two-factor authentication is not enabled." });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!verifyTotp(state.secret, code) && consumeRecoveryCode(state, code) === null) {
      res.status(401).json({ error: "Enter a valid code from your authenticator app to turn this off." });
      return;
    }
    await clearMfaState(account.username);
    try { await clearTrustedDevices(account.username); } catch { /* non-fatal */ }
    res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: "/" });
    await logAdminEvent({ username: account.username }, "mfa_disabled", account.username, "account");
    // Fire-and-forget security alert to the account holder (fail-soft).
    void (async () => {
      try {
        const slug = normUsername(account.username);
        const [ownerRow] = await db
          .select({ email: platformUsersTable.email, name: platformUsersTable.name })
          .from(platformMembershipsTable)
          .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
          .where(and(
            eq(platformMembershipsTable.companySlug, slug),
            eq(platformMembershipsTable.role, "owner"),
          ))
          .orderBy(platformMembershipsTable.createdAt)
          .limit(1);
        const accRow = ownerRow?.email ? null : await getAccount(slug);
        const toEmail = ownerRow?.email || accRow?.email;
        if (!toEmail) return;
        await sendMfaChangedEmail({ toEmail, toName: ownerRow?.name || account.username, enabled: false });
      } catch (err) {
        logger.warn({ err, username: account.username }, "mfa/disable: failed to send security alert (non-fatal)");
      }
    })();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not disable two-factor authentication" });
  }
});

// Replace recovery codes with 10 fresh ones. Requires MFA to be enabled and a
// currently-valid TOTP code (recovery codes are NOT accepted here - a stolen
// recovery code must not be able to mint fresh ones). Returns the new codes
// exactly once; all previously-issued codes stop working immediately.
router.post("/platform/mfa/recovery-codes", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    const state = await getMfaState(account.username);
    if (!state?.enabled) {
      res.status(400).json({ error: "Two-factor authentication is not enabled." });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!verifyTotp(state.secret, code)) {
      res.status(401).json({ error: "Enter a valid code from your authenticator app to regenerate recovery codes." });
      return;
    }
    const recoveryCodes = generateRecoveryCodes();
    await saveMfaState(account.username, {
      ...state,
      recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    });
    await logAdminEvent({ username: account.username }, "mfa_recovery_codes_regenerated", account.username, "account");
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, recoveryCodes });
  } catch {
    res.status(500).json({ error: "Could not regenerate recovery codes" });
  }
});

// --- Trusted devices (skip the two-factor code on remembered browsers) --------

// List this account's trusted devices; flags the one matching the current
// browser's cookie so the UI can label it "this device".
router.get("/platform/mfa/trusted-devices", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    const devices = await listTrustedDevices(account.username);
    const cookie = (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE];
    const payload = cookie ? verifyTrustedDeviceToken(cookie) : null;
    const currentId = payload && payload.u === normUsername(account.username) ? payload.d : null;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      devices: devices.map((d) => ({
        id: d.id,
        label: d.label,
        createdAt: d.createdAt,
        expiresAt: d.expiresAt,
        current: d.id === currentId,
      })),
    });
  } catch {
    res.status(500).json({ error: "Could not load trusted devices" });
  }
});

// Revoke a trusted device. Subsequent logins from that browser will require a
// code again, even though its cookie has not expired.
router.delete("/platform/mfa/trusted-devices/:id", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const removed = await revokeTrustedDevice(account.username, id);
    if (!removed) {
      res.status(404).json({ error: "That device is no longer on your trusted list." });
      return;
    }
    // If the revoked device is this browser, drop its cookie too.
    const cookie = (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE];
    const payload = cookie ? verifyTrustedDeviceToken(cookie) : null;
    if (payload && payload.d === id) res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: "/" });
    await logAdminEvent({ username: account.username }, "mfa_device_revoked", account.username, "account");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not remove the trusted device" });
  }
});

// --- Self-serve sign-up (public, no auth required) --------------------------
//
// Creates a new active agency account and logs the user in immediately.
// A username is auto-derived from the company name; the admin receives an
// email notification of the new sign-up via sendNewSignupAlert.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/platform/signup", loginLimiter, async (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 64) : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const companyName = typeof req.body?.companyName === "string" ? req.body.companyName.trim().slice(0, 64) : "";
    const websiteRaw = typeof req.body?.website === "string" ? req.body.website.trim().slice(0, 128) : "";
    // Forgiving format: prepend https:// when the scheme was left off.
    const website = websiteRaw && !/^https?:\/\//i.test(websiteRaw) ? `https://${websiteRaw}` : websiteRaw;
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name) { res.status(400).json({ error: "Your name is required." }); return; }
    if (!email || !EMAIL_RE.test(email)) { res.status(400).json({ error: "A valid email address is required." }); return; }
    if (!companyName) { res.status(400).json({ error: "Company name is required." }); return; }
    if (!website) { res.status(400).json({ error: "Company website is required." }); return; }
    if (!password || password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters." }); return; }

    // Email must be unique.
    if (await emailExists(email)) {
      res.status(409).json({ error: "An account with that email already exists. Try signing in instead." });
      return;
    }

    // Derive a slug username from the company name: lowercase, spaces→hyphens,
    // strip non-alphanumeric. Append a counter if already taken.
    const baseSlug = companyName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 24)
      .replace(/^-+|-+$/g, "") || "account";

    let username = baseSlug;
    let attempt = 0;
    while (await getAccount(username)) {
      attempt++;
      username = `${baseSlug}-${attempt}`;
    }

    // Store display name in platform_meta so it shows up everywhere company
    // names are rendered without requiring a schema change.
    const displayNameKey = `account:profile:${username}`;
    const displayNameValue = JSON.stringify({ displayName: companyName, ownerName: name });

    const ph = hashPassword(password);
    await db.insert(platformAccountsTable).values({
      username,
      passwordHash: ph,
      role: "agency",
      email,
      website: website || null,
      status: "active",
    });

    await db
      .insert(platformMetaTable)
      .values({ key: displayNameKey, value: displayNameValue })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: displayNameValue } });

    // Create the human user record and link it to the new company account.
    let userId: string | undefined;
    let activeCompanyId: string | undefined;
    try {
      userId = await ensurePlatformUser({
        email,
        name,
        passwordHash: ph,
        companyUsername: username,
        membershipRole: "owner",
      });
      const company = await getCompanyBySlug(username);
      activeCompanyId = company?.id;
    } catch {
      // Non-fatal: the platform_accounts row already exists so login will work.
    }

    // New password signup: require email verification before creating a session.
    // The user gets a 24-hour link; clicking it creates their session and routes
    // them to the account-type selection screen.
    const verifyToken = crypto.randomBytes(32).toString("hex");
    if (userId) {
      try {
        await db.insert(platformEmailVerificationsTable).values({
          token: verifyToken,
          userId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        await db
          .update(platformUsersTable)
          .set({ emailVerified: false })
          .where(eq(platformUsersTable.id, userId));
      } catch (err) {
        logger.error({ err }, "signup: failed to create verification token");
      }
    }

    const verifyUrl = `${getAppBaseUrl()}/api/platform/verify-email?token=${verifyToken}`;
    void sendVerificationEmail({ toEmail: email, toName: name, verifyUrl });
    void sendNewSignupAlert({ name, email, companyName, username, method: "password" });
    res.status(201).json({ ok: true, needsVerification: true, email });
  } catch (err) {
    console.error("[signup]", err);
    res.status(500).json({ error: "Sign-up failed. Please try again." });
  }
});

// --- Email verification -----------------------------------------------------

router.get("/platform/verify-email", async (req: Request, res: Response) => {
  const origin = getFrontendOrigin(req);
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) { res.redirect(`${origin}/?verify_status=invalid`); return; }
  try {
    const [row] = await db
      .select()
      .from(platformEmailVerificationsTable)
      .where(eq(platformEmailVerificationsTable.token, token))
      .limit(1);
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      res.redirect(`${origin}/?verify_status=expired`);
      return;
    }
    // Mark token consumed
    await db
      .update(platformEmailVerificationsTable)
      .set({ usedAt: new Date() })
      .where(eq(platformEmailVerificationsTable.token, token));
    // Mark user verified
    await db
      .update(platformUsersTable)
      .set({ emailVerified: true })
      .where(eq(platformUsersTable.id, row.userId));
    // Resolve the company that owns this user
    const [mem] = await db
      .select({ companySlug: platformMembershipsTable.companySlug, companyId: platformMembershipsTable.companyId })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, row.userId))
      .limit(1);
    if (!mem) { res.redirect(`${origin}/?verify_status=error`); return; }
    // Mark the company as needing account-type selection (new signup gate)
    await db
      .update(platformCompaniesTable)
      .set({ setupComplete: false })
      .where(eq(platformCompaniesTable.id, mem.companyId));
    // Issue the first session
    const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress;
    const sid = await createPlatformSession(mem.companySlug, makeIpHint(rawIp), row.userId, mem.companyId);
    setPlatformCookie(res, sid);
    res.redirect(`${origin}/?needs_setup=true`);
  } catch (err) {
    logger.error({ err }, "verify-email: unexpected error");
    res.redirect(`${origin}/?verify_status=error`);
  }
});

// Always returns ok - never reveal whether an email address is registered.
router.post("/platform/resend-verification", loginLimiter, async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email) {
      const user = await getUserByEmail(email);
      if (user && user.emailVerified !== true) {
        await db
          .delete(platformEmailVerificationsTable)
          .where(eq(platformEmailVerificationsTable.userId, user.id));
        const token = crypto.randomBytes(32).toString("hex");
        await db.insert(platformEmailVerificationsTable).values({
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        const verifyUrl = `${getAppBaseUrl()}/api/platform/verify-email?token=${token}`;
        void sendVerificationEmail({ toEmail: email, toName: user.name || email, verifyUrl });
      }
    }
  } catch (err) {
    logger.error({ err }, "resend-verification: unexpected error (non-fatal)");
  }
  res.json({ ok: true });
});

// --- Password reset ----------------------------------------------------------

// Request a password reset link. Always returns { ok: true } with the same
// timing-safe shape whether or not the email is registered, so the endpoint
// cannot be used to enumerate accounts. The token is single-use, 1-hour expiry.
router.post("/platform/forgot-password", loginLimiter, async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email) {
      const user = await getUserByEmail(email);
      if (user) {
        // Invalidate any previously issued tokens for this user.
        await db
          .delete(platformPasswordResetsTable)
          .where(eq(platformPasswordResetsTable.userId, user.id));
        const token = crypto.randomBytes(32).toString("hex");
        await db.insert(platformPasswordResetsTable).values({
          token,
          userId: user.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });
        const resetUrl = `${getAppBaseUrl()}/?reset_token=${token}`;
        void sendPasswordResetEmail({ toEmail: email, toName: user.name || email, resetUrl });
      }
    }
  } catch (err) {
    // Never leak errors that could reveal whether the address exists.
    logger.error({ err }, "forgot-password: unexpected error (non-fatal)");
  }
  res.json({ ok: true });
});

// Complete a password reset: validate the single-use token, set the new
// password, and bump session_version so every existing session is revoked.
router.post("/platform/reset-password", loginLimiter, async (req: Request, res: Response) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!token) {
      res.status(400).json({ error: "This reset link is invalid. Please request a new one." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    // Consume the token atomically: the conditional UPDATE only succeeds for a
    // token that is still unused and unexpired, so two concurrent requests can
    // never both pass validation (single-use guarantee under concurrency).
    const consumed = await db
      .update(platformPasswordResetsTable)
      .set({ usedAt: new Date() })
      .where(and(
        eq(platformPasswordResetsTable.token, token),
        sql`${platformPasswordResetsTable.usedAt} IS NULL`,
        sql`${platformPasswordResetsTable.expiresAt} > now()`,
      ))
      .returning({ userId: platformPasswordResetsTable.userId });
    const row = consumed[0];
    if (!row) {
      res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      return;
    }

    const ph = hashPassword(password);
    await db
      .update(platformUsersTable)
      .set({ passwordHash: ph })
      .where(eq(platformUsersTable.id, row.userId));

    // Keep the legacy platform_accounts credential store in sync so slug-based
    // logins keep working with the new password.
    const memberships = await db
      .select({ companySlug: platformMembershipsTable.companySlug, role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, row.userId));
    for (const mem of memberships) {
      if (mem.role === "owner" || mem.role === "admin") {
        await db
          .update(platformAccountsTable)
          .set({ passwordHash: ph })
          .where(eq(platformAccountsTable.username, mem.companySlug));
      }
    }

    // Revoke every existing session: bump session_version (fast-path rejection
    // for user-linked sessions), delete session rows by userId, AND delete by
    // each associated company slug - legacy sessions carry user_id = NULL and
    // skip the version check, so they must be removed by username too.
    await incrementSessionVersion(row.userId);
    await db
      .delete(platformSessionsTable)
      .where(eq(platformSessionsTable.userId, row.userId));
    for (const mem of memberships) {
      await db
        .delete(platformSessionsTable)
        .where(eq(platformSessionsTable.username, normUsername(mem.companySlug)));
    }

    // Clear MFA trusted devices for every associated account so all devices
    // must re-enter a TOTP code on next login after a password reset.
    for (const mem of memberships) {
      await clearTrustedDevices(normUsername(mem.companySlug));
    }

    // Security alert - non-fatal: never blocks the response.
    void (async () => {
      try {
        const [u] = await db
          .select({ email: platformUsersTable.email, name: platformUsersTable.name })
          .from(platformUsersTable)
          .where(eq(platformUsersTable.id, row.userId))
          .limit(1);
        if (u?.email) {
          await sendPasswordChangedEmail({ toEmail: u.email, toName: u.name || "AIO Fusion user" });
        }
      } catch (err) {
        logger.warn({ err }, "reset-password: failed to send password changed alert (non-fatal)");
      }
    })();

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "reset-password: unexpected error");
    res.status(500).json({ error: "Password reset failed. Please try again." });
  }
});

// Change password for a signed-in user: verify the current password, set the
// new one in BOTH credential stores (platform_users + legacy platform_accounts),
// and revoke every other session while keeping the current one alive.
router.post("/platform/change-password", requirePlatformAuth, loginLimiter, async (req: Request, res: Response) => {
  try {
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    if (!currentPassword) {
      res.status(400).json({ error: "Enter your current password." });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }

    const actor = req.account!;
    const username = normUsername(actor.username);
    const currentSid = getPlatformSessionId(req);

    // Verify the current password. Prefer the platform_users hash (primary
    // store); fall back to the legacy platform_accounts hash for legacy
    // sessions or users without a password hash yet (e.g. SSO-only would fail
    // verification here, which is correct - they have no current password).
    let userRow: { id: string; passwordHash: string | null } | undefined;
    if (actor.userId) {
      const rows = await db
        .select({ id: platformUsersTable.id, passwordHash: platformUsersTable.passwordHash })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, actor.userId))
        .limit(1);
      userRow = rows[0];
    }
    let verified = false;
    if (userRow?.passwordHash) {
      verified = verifyPassword(currentPassword, userRow.passwordHash);
    } else {
      const account = await getAccount(username);
      verified = !!account && verifyPassword(currentPassword, account.passwordHash);
    }
    if (!verified) {
      res.status(401).json({ error: "Your current password is incorrect." });
      return;
    }

    const ph = hashPassword(newPassword);

    if (userRow) {
      await db
        .update(platformUsersTable)
        .set({ passwordHash: ph })
        .where(eq(platformUsersTable.id, userRow.id));

      // Keep the legacy platform_accounts credential store in sync so
      // slug-based logins keep working with the new password.
      const memberships = await db
        .select({ companySlug: platformMembershipsTable.companySlug, role: platformMembershipsTable.role })
        .from(platformMembershipsTable)
        .where(eq(platformMembershipsTable.userId, userRow.id));
      for (const mem of memberships) {
        if (mem.role === "owner" || mem.role === "admin") {
          await db
            .update(platformAccountsTable)
            .set({ passwordHash: ph })
            .where(eq(platformAccountsTable.username, mem.companySlug));
        }
      }

      // Revoke every OTHER session but keep this one: bump session_version,
      // re-stamp the current session row with the new version so it survives
      // the fast-path check, then delete the rest by userId AND by each
      // associated slug (legacy sessions carry user_id = NULL and skip the
      // version check, so they must be removed by username too).
      const newVersion = await incrementSessionVersion(userRow.id);
      if (currentSid) {
        await db
          .update(platformSessionsTable)
          .set({ sessionVersion: newVersion })
          .where(eq(platformSessionsTable.sid, currentSid));
      }
      await db
        .delete(platformSessionsTable)
        .where(and(
          eq(platformSessionsTable.userId, userRow.id),
          currentSid ? ne(platformSessionsTable.sid, currentSid) : sql`true`,
        ));
      for (const mem of memberships) {
        await db
          .delete(platformSessionsTable)
          .where(and(
            eq(platformSessionsTable.username, normUsername(mem.companySlug)),
            currentSid ? ne(platformSessionsTable.sid, currentSid) : sql`true`,
          ));
      }

      // Clear MFA trusted devices for every associated account so all devices
      // must re-enter a TOTP code on next login after a password change.
      for (const mem of memberships) {
        await clearTrustedDevices(normUsername(mem.companySlug));
      }
      await clearTrustedDevices(username);
    } else {
      // Legacy session without a linked platform_users row: update the legacy
      // account store, and sync any platform_users row that shares its email
      // so both credential stores stay consistent.
      await db
        .update(platformAccountsTable)
        .set({ passwordHash: ph })
        .where(eq(platformAccountsTable.username, username));
      const account = await getAccount(username);
      if (account?.email) {
        const emailUser = await getUserByEmail(account.email);
        if (emailUser) {
          await db
            .update(platformUsersTable)
            .set({ passwordHash: ph })
            .where(eq(platformUsersTable.id, emailUser.id));
        }
      }
      if (currentSid) await revokeOtherSessions(username, currentSid);
      // Clear MFA trusted devices for the legacy account.
      await clearTrustedDevices(username);
    }

    // Security alert - non-fatal: never blocks the response.
    void (async () => {
      try {
        let toEmail: string | null | undefined;
        let toName: string | undefined;
        if (userRow) {
          const [u] = await db
            .select({ email: platformUsersTable.email, name: platformUsersTable.name })
            .from(platformUsersTable)
            .where(eq(platformUsersTable.id, userRow.id))
            .limit(1);
          toEmail = u?.email;
          toName = u?.name || undefined;
        } else {
          const acct = await getAccount(username);
          toEmail = acct?.email;
        }
        if (toEmail) {
          await sendPasswordChangedEmail({ toEmail, toName: toName || username });
        }
      } catch (err) {
        logger.warn({ err, username }, "change-password: failed to send password changed alert (non-fatal)");
      }
    })();

    logger.info({ username }, "change-password: password changed");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "change-password: unexpected error");
    res.status(500).json({ error: "Failed to change password. Please try again." });
  }
});

// Self-service email change: signed-in user updates their own email address.
// Updates both platform_users (primary) and platform_accounts (legacy sync).
// Sends a fail-soft security notice to the OLD address and a confirmation to
// the NEW address. Enforces uniqueness: the new email must not already exist.
router.post("/platform/change-email", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const actor = req.account!;
    const newEmail = typeof req.body?.newEmail === "string" ? req.body.newEmail.trim().toLowerCase() : "";
    if (!newEmail || !EMAIL_RE.test(newEmail)) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    // Resolve the current (old) email for the actor.
    let oldEmail: string | null = null;
    let oldName: string | undefined;
    let userRow: { id: string; email: string | null } | undefined;
    if (actor.userId) {
      const rows = await db
        .select({ id: platformUsersTable.id, email: platformUsersTable.email, name: platformUsersTable.name })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, actor.userId))
        .limit(1);
      userRow = rows[0] ? { id: rows[0].id, email: rows[0].email } : undefined;
      oldEmail = rows[0]?.email ?? null;
      oldName = rows[0]?.name || undefined;
    }
    if (!oldEmail) {
      // Fallback: resolve via platform_accounts
      const account = await getAccount(normUsername(actor.username));
      oldEmail = account?.email ?? null;
    }

    if (!oldEmail) {
      res.status(400).json({ error: "No email address is associated with your account." });
      return;
    }

    if (oldEmail === newEmail) {
      res.status(400).json({ error: "The new email address is the same as your current one." });
      return;
    }

    // Reject if the new address is already registered in either credential store.
    // emailExists checks platform_accounts; getUserByEmail checks platform_users.
    if (await emailExists(newEmail) || !!(await getUserByEmail(newEmail))) {
      res.status(409).json({ error: "That email address is already associated with another account." });
      return;
    }

    // Update platform_users (primary store).
    if (userRow) {
      await db
        .update(platformUsersTable)
        .set({ email: newEmail })
        .where(eq(platformUsersTable.id, userRow.id));
    }

    // Update platform_accounts (legacy store) - keep in sync.
    await db
      .update(platformAccountsTable)
      .set({ email: newEmail })
      .where(eq(platformAccountsTable.username, normUsername(actor.username)));

    void logAdminEvent(
      { username: actor.username, id: actor.userId },
      "email_changed",
      actor.username,
      "account",
      { oldEmail, newEmail },
    );

    // Fire-and-forget security notices - never block the response.
    const capturedOld = oldEmail;
    const capturedName = oldName || actor.username;
    void (async () => {
      try {
        await sendEmailChangedEmail({ oldEmail: capturedOld, newEmail, toName: capturedName });
      } catch (err) {
        logger.warn({ err, username: actor.username }, "change-email: failed to send email changed alerts (non-fatal)");
      }
    })();

    logger.info({ username: actor.username, oldEmail, newEmail }, "change-email: email changed");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "change-email: unexpected error");
    res.status(500).json({ error: "Failed to change email address. Please try again." });
  }
});

// Admin/manager email change: update a target account's email address.
// Admins may change any account; managers may change their own descendants'.
// Updates both platform_users (primary) and platform_accounts (legacy sync).
// Sends a fail-soft security notice to the OLD address and a confirmation to
// the NEW address - never to the actor performing the change.
router.post(
  "/platform/accounts/email",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.body?.username);
      const newEmail = typeof req.body?.newEmail === "string" ? req.body.newEmail.trim().toLowerCase() : "";

      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!newEmail || !EMAIL_RE.test(newEmail)) {
        res.status(400).json({ error: "A valid email address is required." });
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

      const oldEmail = existing.email ?? null;

      if (oldEmail === newEmail) {
        // No-op - already set to this address.
        res.json({ ok: true });
        return;
      }

      // Reject if the new address is already registered in either credential store.
      // emailExists checks platform_accounts; getUserByEmail checks platform_users.
      if (await emailExists(newEmail) || !!(await getUserByEmail(newEmail))) {
        res.status(409).json({ error: "That email address is already associated with another account." });
        return;
      }

      // Update platform_accounts (legacy store).
      await db
        .update(platformAccountsTable)
        .set({ email: newEmail })
        .where(eq(platformAccountsTable.username, target));

      // Update platform_users (primary store) - look up by old email to stay in sync.
      if (oldEmail) {
        const [userRow] = await db
          .select({ id: platformUsersTable.id, name: platformUsersTable.name })
          .from(platformUsersTable)
          .where(eq(platformUsersTable.email, oldEmail))
          .limit(1);
        if (userRow) {
          await db
            .update(platformUsersTable)
            .set({ email: newEmail })
            .where(eq(platformUsersTable.id, userRow.id));
        }
      }

      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "email_changed",
        target,
        "account",
        { oldEmail, newEmail, changedBy: actor.username },
      );

      // Security notices - fail-soft, fire-and-forget.
      if (oldEmail) {
        // Resolve a display name for the notice - prefer platform_users name.
        let toName: string = target;
        try {
          const [u] = await db
            .select({ name: platformUsersTable.name })
            .from(platformUsersTable)
            .where(eq(platformUsersTable.email, newEmail)) // already updated above
            .limit(1);
          if (u?.name) toName = u.name;
        } catch { /* non-fatal */ }

        const capturedOld = oldEmail;
        const capturedName = toName;
        void (async () => {
          try {
            await sendEmailChangedEmail({ oldEmail: capturedOld, newEmail, toName: capturedName });
          } catch (err) {
            logger.warn({ err, target }, "accounts/email: failed to send email changed alerts (non-fatal)");
          }
        })();
      }

      logger.info({ actor: actor.username, target, oldEmail, newEmail }, "accounts/email: email changed");
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "accounts/email: unexpected error");
      res.status(500).json({ error: "Failed to change email address." });
    }
  },
);

// Request a "set first password" email for SSO-only accounts. Requires an
// active session (identity already confirmed). Derives the email from the
// session user - never trusts the request body - and reuses the same
// platform_password_resets machinery as the forgot-password flow.
router.post("/platform/request-set-password", requirePlatformAuth, loginLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.account) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const actor = req.account;

    // Resolve the user row from the session's linked userId or email.
    let user: Awaited<ReturnType<typeof getUserByEmail>> | undefined;
    if (actor.userId) {
      const rows = await db
        .select()
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, actor.userId))
        .limit(1);
      user = rows[0] ?? undefined;
    }
    if (!user) {
      const acc = await getAccount(normUsername(actor.username));
      if (acc?.email) user = await getUserByEmail(acc.email) ?? undefined;
    }

    if (!user) {
      res.status(400).json({ error: "Could not find a user record for this session." });
      return;
    }

    // Guard: if the user already has a password, they must use change-password.
    if (user.passwordHash) {
      res.status(409).json({ error: "Your account already has a password. Use Change Password instead." });
      return;
    }

    const email = user.email;
    if (!email) {
      res.status(400).json({ error: "No email address is associated with this account." });
      return;
    }

    // Reuse the same token machinery as forgot-password: invalidate stale
    // tokens, issue a fresh one (1-hour TTL), and send the reset email.
    await db
      .delete(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, user.id));
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(platformPasswordResetsTable).values({
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const resetUrl = `${getAppBaseUrl()}/?reset_token=${token}`;
    void sendPasswordResetEmail({ toEmail: email, toName: user.name || email, resetUrl });

    logger.info({ username: actor.username }, "request-set-password: link sent");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "request-set-password: unexpected error");
    res.status(500).json({ error: "Failed to send the link. Please try again." });
  }
});

// Set account type after signup (Agency/Partner vs Client). Requires a session.
router.post("/platform/setup/account-type", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const accountType = typeof req.body?.accountType === "string" ? req.body.accountType : "";
    if (accountType !== "agency" && accountType !== "client") {
      res.status(400).json({ error: "accountType must be 'agency' or 'client'." });
      return;
    }
    const username = normUsername(req.account!.username);
    await db
      .update(platformAccountsTable)
      .set({ role: accountType })
      .where(eq(platformAccountsTable.username, username));
    await db
      .update(platformCompaniesTable)
      .set({ role: accountType, setupComplete: true })
      .where(eq(platformCompaniesTable.slug, username));
    logger.info({ username, accountType }, "setup/account-type: role set");
    res.json({ ok: true, role: accountType });
  } catch (err) {
    logger.error({ err }, "setup/account-type: unexpected error");
    res.status(500).json({ error: "Failed to set account type." });
  }
});

// --- Settings: change account type (post-setup) ----------------------------
//
// Distinct from /platform/setup/account-type: this endpoint NEVER touches
// setupComplete and is gated to the account owner (not just any authed session).

router.post("/platform/settings/account-type", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    // Only agency/client accounts may switch type. Admins and legacy "user"
    // accounts are excluded.
    const currentRole = normalizeRole(account.role);
    if (currentRole !== "agency" && currentRole !== "client") {
      res.status(403).json({ error: "Only Agency/Partner or Client accounts can change account type." });
      return;
    }
    // Only the account owner (membershipRole null/undefined or "owner") may
    // change the account type. Team admins/members cannot.
    const memRole = account.membershipRole;
    if (memRole !== null && memRole !== undefined && memRole !== "owner") {
      res.status(403).json({ error: "Only the account owner can change the account type." });
      return;
    }

    const accountType = typeof req.body?.accountType === "string" ? req.body.accountType : "";
    if (accountType !== "agency" && accountType !== "client") {
      res.status(400).json({ error: "accountType must be 'agency' or 'client'." });
      return;
    }

    const username = normUsername(account.username);

    // Block agency→client switch when sub-accounts exist. A client cannot
    // manage sub-accounts, so allowing the switch would orphan them.
    if (accountType === "client") {
      const [subCountRow] = await db
        .select({ cnt: count() })
        .from(platformAccountsTable)
        .where(eq(platformAccountsTable.parent, username));
      const subCount = Number(subCountRow?.cnt ?? 0);
      if (subCount > 0) {
        res.status(400).json({
          error: `You have ${subCount} client sub-account${subCount === 1 ? "" : "s"}. Remove or reassign them before switching to a Client account type.`,
        });
        return;
      }
    }

    // Update both tables. setupComplete is intentionally NOT touched here.
    await db
      .update(platformAccountsTable)
      .set({ role: accountType })
      .where(eq(platformAccountsTable.username, username));
    await db
      .update(platformCompaniesTable)
      .set({ role: accountType })
      .where(eq(platformCompaniesTable.slug, username));

    logger.info({ username, accountType }, "settings/account-type: role updated");
    res.json({ ok: true, role: accountType });
  } catch (err) {
    logger.error({ err }, "settings/account-type: unexpected error");
    res.status(500).json({ error: "Failed to update account type." });
  }
});

// --- Admin: list pending accounts -------------------------------------------

router.get("/platform/admin/pending", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const rows = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.status, "pending_approval"));

    const displayNames = await getDisplayNames();

    const accounts = rows.map((r) => ({
      username: r.username,
      email: r.email ?? null,
      website: r.website ?? null,
      displayName: displayNames.get(r.username) ?? null,
      createdAt: r.createdAt,
    }));

    res.json({ accounts });
  } catch {
    res.status(500).json({ error: "Failed to load pending accounts." });
  }
});

// --- Admin: approve a pending account ---------------------------------------

router.post("/platform/admin/accounts/:username/approve", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const target = normUsername(req.params.username);
    if (!target) { res.status(400).json({ error: "Username required." }); return; }
    const account = await getAccount(target);
    if (!account) { res.status(404).json({ error: "Account not found." }); return; }
    if (account.status !== "pending_approval") {
      res.status(400).json({ error: "Account is not pending approval." });
      return;
    }
    await db
      .update(platformAccountsTable)
      .set({ status: "active" })
      .where(eq(platformAccountsTable.username, target));
    await db
      .update(platformCompaniesTable)
      .set({ status: "active" })
      .where(eq(platformCompaniesTable.slug, target));

    void logAdminEvent(
      { username: req.account!.username, id: req.account!.userId },
      "account_approve",
      target,
      "account",
      { email: account.email },
    );

    if (account.email) {
      const metaRow = await db
        .select()
        .from(platformMetaTable)
        .where(eq(platformMetaTable.key, `account:profile:${target}`))
        .limit(1);
      const profileMeta = metaRow[0]?.value ? (JSON.parse(metaRow[0].value) as { ownerName?: string }) : null;
      void sendApprovalEmail({
        toEmail: account.email,
        toName: profileMeta?.ownerName ?? target,
        loginUrl: "https://www.aiofusion.ai",
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to approve account." });
  }
});

// --- Admin: reject (suspend) a pending account -------------------------------

router.post("/platform/admin/accounts/:username/reject", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    if (req.account!.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    const target = normUsername(req.params.username);
    if (!target) { res.status(400).json({ error: "Username required." }); return; }
    const account = await getAccount(target);
    if (!account) { res.status(404).json({ error: "Account not found." }); return; }
    if (account.status !== "pending_approval") {
      res.status(400).json({ error: "Only pending accounts can be rejected." });
      return;
    }
    // Suspend rather than hard-delete: legacy pending accounts can sign in
    // (pending_approval is treated as active since the approval flow was
    // retired), so they may already hold data. Suspension blocks access
    // everywhere while preserving data; an admin can still delete the
    // account through the normal account-deletion flow if appropriate.
    await db
      .update(platformAccountsTable)
      .set({ status: "suspended" })
      .where(eq(platformAccountsTable.username, target));
    await db
      .update(platformCompaniesTable)
      .set({ status: "suspended" })
      .where(eq(platformCompaniesTable.slug, target));
    void logAdminEvent(
      { username: req.account!.username, id: req.account!.userId },
      "account_reject",
      target,
      "account",
      { email: account.email, reason: req.body?.reason ?? null },
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to reject account." });
  }
});

// --- Google OAuth 2.0 sign-in / sign-up -------------------------------------

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const OAUTH_STATE_COOKIE = "aio_oauth_state";
const OAUTH_LINK_COOKIE = "aio_oauth_link";
// Carries a pending team-invite token across the SSO round-trip so the
// callback can attach the signed-in user to the inviting workspace instead of
// creating a fresh account.
const INVITE_COOKIE = "aio_invite";

function setInviteCookie(res: Response, token: string): void {
  res.cookie(INVITE_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/",
  });
}

// If the SSO round-trip carried a team-invite token, consume it for this
// email + SSO identity. Returns a redirect path when the invite flow handled
// the sign-in (success or a terminal invite error), or null to fall through to
// the normal SSO resolution.
async function handleSsoInvite(
  req: Request,
  res: Response,
  profile: { email: string; name: string; googleId?: string; microsoftId?: string },
): Promise<string | null> {
  const token = (req.cookies as Record<string, string>)?.[INVITE_COOKIE] ?? "";
  if (!token) return null;
  res.clearCookie(INVITE_COOKIE, { path: "/" });
  const invite = await getValidInvite(token);
  if (!invite) return `/?oauth_status=error&oauth_msg=invite_invalid`;
  if (invite.email.toLowerCase() !== profile.email.toLowerCase()) {
    // The invite is bound to a specific email address; a different SSO account
    // must not be able to claim it.
    return `/?oauth_status=error&oauth_msg=invite_email_mismatch`;
  }

  // Resolve or create the user row for this email and attach the SSO identity.
  let user = await getUserByEmail(profile.email);
  if (!user) {
    const [created] = await db
      .insert(platformUsersTable)
      .values({
        email: profile.email.toLowerCase(),
        name: profile.name || null,
        googleId: profile.googleId || null,
        microsoftId: profile.microsoftId || null,
        emailVerified: true,
      })
      .returning();
    user = created!;
  } else {
    if (profile.googleId && !user.googleId) await linkGoogleId(user.id, profile.googleId);
    if (profile.microsoftId && !user.microsoftId) await linkMicrosoftId(user.id, profile.microsoftId);
  }

  const ok = await consumeInvite(invite, user.id);
  if (!ok) return `/?oauth_status=error&oauth_msg=invite_invalid`;

  // Invited users skip account-type selection: session goes straight into the
  // inviting workspace.
  const sid = await createPlatformSession(invite.companySlug, makeIpHint(req.ip), user.id, invite.companyId);
  setPlatformCookie(res, sid);
  return `/?oauth_status=ok`;
}

// Returns the canonical host for this deployment.
// CANONICAL_DOMAIN (e.g. "www.aiofusion.ai") takes highest priority so the
// OAuth callback URL and session cookie domain are always on the domain users
// actually browse to. Falls back to REPLIT_DOMAINS, then the request host.
function getCanonicalHost(req: Request): string {
  let canonical = process.env.CANONICAL_DOMAIN?.trim();
  // Staging safety guard: a staging deployment must never use the production
  // canonical domain (this happens when secrets are copied from the live
  // deployment). Ignore any CANONICAL_DOMAIN that doesn't look like a staging
  // host so OAuth callbacks/redirects stay on the staging domain.
  const isStaging = (process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV) === "staging";
  if (isStaging && canonical && !canonical.includes("staging")) {
    logger.warn({ canonical }, "Ignoring non-staging CANONICAL_DOMAIN on staging deployment");
    canonical = undefined;
  }
  if (canonical) return canonical;
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const first = replitDomains.split(",")[0]!.trim();
    if (first) return first;
  }
  // On staging, never trust request headers for the OAuth canonical host - 
  // fall through to the fixed staging domain instead.
  if (isStaging) return "staging.aiofusion.ai";
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  const hostname = host.split(":")[0];
  if (hostname) return hostname;
  return "www.aiofusion.ai";
}

function getGoogleCallbackUrl(req: Request): string {
  return `https://${getCanonicalHost(req)}/api/platform/auth/google/callback`;
}

function getFrontendOrigin(req: Request): string {
  if (process.env.NODE_ENV !== "production") {
    const host = req.get("x-forwarded-host") || req.get("host") || "";
    const hostname = host.split(":")[0];
    if (hostname) return `https://${hostname}`;
  }
  return `https://${getCanonicalHost(req)}`;
}

// HTML-attribute encode a string before injecting into an HTML template.
// Prevents code/state values (which are opaque hex strings from the provider)
// from being misinterpreted as markup if they ever contain special characters.
function htmlAttrEncode(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Build the interstitial page that auto-submits the OAuth code via a POST form.
// Scanners follow GETs but never execute JS or submit forms, so the one-time
// authorization code is never redeemed until the real browser acts on it.
function buildOauthInterstitial(postAction: string, code: string, state: string, nonce: string): string {
  const safeAction = htmlAttrEncode(postAction);
  const safeCode = htmlAttrEncode(code);
  const safeState = htmlAttrEncode(state);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Completing sign-in\u2026</title>` +
    `<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc}` +
    `p{color:#374151;font-size:15px}</style></head><body>` +
    `<p>Completing sign-in, please wait\u2026</p>` +
    `<noscript><p>JavaScript is required to complete sign-in. <a href="/?oauth_status=error&amp;oauth_msg=no_js">Return to sign-in</a></p></noscript>` +
    `<form id="f" method="POST" action="${safeAction}">` +
    `<input type="hidden" name="code" value="${safeCode}">` +
    `<input type="hidden" name="state" value="${safeState}">` +
    `</form><script nonce="${htmlAttrEncode(nonce)}">document.getElementById('f').submit();</script></body></html>`;
}

// Known link-scanner / bot user-agent patterns. When matched the GET callback
// returns an empty 200 immediately - no code redemption, no error redirect.
const SCANNER_UA_RE = /safelinks|outlook\s*safe|microsoftpreview|microsoftteams|iframely|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|applebot|bingpreview/i;

router.get("/platform/auth/google", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google Sign-In is not configured." });
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });
  // Team invite flow: carry the invite token across the OAuth round-trip.
  if (typeof req.query.invite === "string" && req.query.invite.trim()) {
    setInviteCookie(res, req.query.invite.trim());
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  res.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
});

// Link Google to an existing logged-in account.
router.get("/platform/auth/google/link", requirePlatformAuth, (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google Sign-In is not configured." });
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/",
  });
  res.cookie(OAUTH_LINK_COOKIE, req.account!.username, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/",
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  res.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
});

// GET callback: scanner/bot guard + interstitial page.
// Does NOT redeem the authorization code - only validates the CSRF state and
// serves a tiny HTML page that auto-submits a POST form. Scanners (Outlook Safe
// Links, Teams link-preview, etc.) follow GET redirects but never execute JS or
// submit forms, so the one-time code is preserved for the real browser.
router.get("/platform/auth/google/callback", (req: Request, res: Response) => {
  // HEAD requests from health-checks / scanners - respond empty immediately.
  if (req.method === "HEAD") { res.status(200).end(); return; }
  // Known link-scanner user-agents - empty 200, no code consumption.
  if (SCANNER_UA_RE.test(req.headers["user-agent"] ?? "")) { res.status(200).end(); return; }

  const origin = getFrontendOrigin(req);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=not_configured`);
    return;
  }
  const { code, state, error: oauthError } = req.query as Record<string, string>;
  if (oauthError) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=${encodeURIComponent(oauthError)}`);
    return;
  }
  // Validate CSRF state - reject early so scanners that do carry cookies can't
  // be tricked into delivering a valid interstitial for a forged code.
  // Important: do NOT clear the cookie here; the POST handler will read + clear it.
  const storedState = (req.cookies as Record<string, string>)?.[OAUTH_STATE_COOKIE];
  if (!state || state !== storedState) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=invalid_state`);
    return;
  }
  if (!code) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_code`);
    return;
  }
  // Serve the auto-submit interstitial. The form POSTs code+state back to this
  // same path (method=POST) so the redirect_uri registered with Google stays
  // unchanged. The aio_oauth_state and aio_oauth_link cookies survive to the POST.
  const postUrl = `${origin}/api/platform/auth/google/callback`;
  const nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  // The global CSP (script-src 'self') blocks inline scripts, which would
  // silently break the auto-submit form. Re-issue the header with a nonce.
  res.setHeader("Content-Security-Policy", cspHeaderWithScriptNonce(nonce));
  res.status(200).send(buildOauthInterstitial(postUrl, code, state, nonce));
});

// POST callback: the real code redemption, triggered by the interstitial's
// auto-submit form. Scanners never POST, so the authorization code is safe.
router.post("/platform/auth/google/callback", async (req: Request, res: Response) => {
  const origin = getFrontendOrigin(req);
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=not_configured`);
      return;
    }
    // code and state arrive in the POST body (from the interstitial form).
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const state = typeof req.body?.state === "string" ? req.body.state : "";
    // Verify CSRF state and clear the cookie - single-use.
    const storedState = (req.cookies as Record<string, string>)?.[OAUTH_STATE_COOKIE];
    const linkUsername = (req.cookies as Record<string, string>)?.[OAUTH_LINK_COOKIE] ?? "";
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    res.clearCookie(OAUTH_LINK_COOKIE, { path: "/" });
    if (!state || state !== storedState) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=invalid_state`);
      return;
    }
    if (!code) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_code`);
      return;
    }
    // Exchange authorisation code for access token.
    // redirect_uri must exactly match what was used during authorisation
    // (getGoogleCallbackUrl is request-derived from CANONICAL_DOMAIN / host header - 
    // same value the initiation handler sent to Google).
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGoogleCallbackUrl(req),
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenRes.ok) {
      // Distinguish "code already redeemed" (scanner ate it) from other failures.
      let tokenErrBody: { error?: string } = {};
      try { tokenErrBody = await tokenRes.json() as { error?: string }; } catch { /* ignore */ }
      const msg = tokenErrBody.error === "invalid_grant" ? "code_already_used" : "token_exchange_failed";
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=${msg}`);
      return;
    }
    const tokens = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokens.access_token) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_access_token`);
      return;
    }
    // Fetch the user's Google profile
    const userInfoRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoRes.ok) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=userinfo_failed`);
      return;
    }
    const userInfo = await userInfoRes.json() as { email?: string; name?: string; given_name?: string };
    if (!userInfo.email) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_email`);
      return;
    }
    const googleId = (userInfo as { id?: string }).id ?? "";

    // --- Google account link flow (logged-in user linking their account) ----
    // linkUsername arrives via the aio_oauth_link cookie which survives the
    // GET interstitial unchanged and is cleared above.
    if (linkUsername) {
      const linkAccount = await getAccount(linkUsername);
      if (!linkAccount || !linkAccount.email) {
        res.redirect(`${origin}/?link_google=error`);
        return;
      }
      const linkUser = await getUserByEmail(linkAccount.email);
      if (!linkUser) {
        res.redirect(`${origin}/?link_google=error`);
        return;
      }
      if (linkUser.googleId) {
        res.redirect(`${origin}/?link_google=already_linked`);
        return;
      }
      if (googleId) {
        const existingGoogleUser = googleId ? await getUserByGoogleId(googleId) : null;
        if (existingGoogleUser && existingGoogleUser.id !== linkUser.id) {
          res.redirect(`${origin}/?link_google=google_taken`);
          return;
        }
        await linkGoogleId(linkUser.id, googleId);
      }
      res.redirect(`${origin}/?link_google=ok`);
      return;
    }

    // --- Team invite flow: attach this Google identity to the inviting
    // workspace instead of resolving/creating an account of their own.
    {
      const inviteRedirect = await handleSsoInvite(req, res, {
        email: userInfo.email,
        name: userInfo.name || userInfo.given_name || userInfo.email.split("@")[0],
        googleId: googleId || undefined,
      });
      if (inviteRedirect) {
        res.redirect(`${origin}${inviteRedirect}`);
        return;
      }
    }

    // --- User-first identity resolution ------------------------------------
    // Step 1: resolve the human user by Google id (stable across email changes)
    // then fall back to email lookup in platform_users.
    let existingUser = googleId ? await getUserByGoogleId(googleId) : null;
    if (!existingUser) {
      existingUser = await getUserByEmail(userInfo.email);
    }

    // Step 2: if an existing user is found, route them to their active workspace
    // via platform_memberships - this is the new source of truth for
    // user → company association. The platform_accounts row is checked only for
    // status (active/suspended/pending) and is NOT used to pick the company.
    if (existingUser) {
      const displayName = userInfo.name || userInfo.given_name || userInfo.email.split("@")[0];
      const membership = await getPrimaryMembership(existingUser.id);
      if (membership) {
        const account = await getAccount(membership.companySlug);
        if (account) {
          // Note: legacy "pending_approval" is treated as active - the
          // signup-approval flow was removed (new signups are active
          // immediately), matching the password-login path.
          if (account.status === "suspended") {
            res.redirect(`${origin}/?oauth_status=suspended`);
            return;
          }
          // Active - link googleId to user record then create session.
          let userId: string | undefined;
          let activeCompanyId: string | undefined;
          let oauthCo: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
          try {
            userId = await ensurePlatformUser({
              email: userInfo.email,
              name: displayName,
              googleId: googleId || null,
              companyUsername: account.username,
              membershipRole: membership.role,
              companyRole: account.role,
              companyStatus: account.status,
            });
            oauthCo = await getCompanyBySlug(account.username);
            activeCompanyId = oauthCo?.id;
          } catch {
            // Non-fatal.
            userId = existingUser.id;
          }
          await finishOauthLoginOrChallenge(req, res, origin, {
            username: account.username,
            role: account.role,
            userId,
            activeCompanyId,
            needsSetup: oauthCo?.setupComplete === false,
          });
          return;
        }
      }
    }

    // Step 3: no existing user or no membership - look up by email in
    // platform_accounts as fallback (covers legacy accounts not yet backfilled).
    const [existing] = await db
      .select()
      .from(platformAccountsTable)
      .where(ilike(platformAccountsTable.email, userInfo.email))
      .limit(1);
    if (existing) {
      if (existing.status === "suspended") {
        res.redirect(`${origin}/?oauth_status=suspended`);
        return;
      }
      // Active legacy account - ensure user/company rows, then create session.
      const displayName = userInfo.name || userInfo.given_name || userInfo.email.split("@")[0];
      let userId: string | undefined;
      let activeCompanyId: string | undefined;
      let legacyOauthCo: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
      try {
        userId = await ensurePlatformUser({
          email: userInfo.email,
          name: displayName,
          googleId: googleId || null,
          companyUsername: existing.username,
          membershipRole: existing.role === "admin" ? "admin" : "owner",
          companyRole: existing.role,
          companyStatus: existing.status,
        });
        legacyOauthCo = await getCompanyBySlug(existing.username);
        activeCompanyId = legacyOauthCo?.id;
      } catch {
        // Non-fatal.
      }
      await finishOauthLoginOrChallenge(req, res, origin, {
        username: existing.username,
        role: existing.role,
        userId,
        activeCompanyId,
        needsSetup: legacyOauthCo?.setupComplete === false,
      });
      return;
    }
    // No account - register a new pending one from the Google profile
    const displayName = userInfo.name || userInfo.given_name || userInfo.email.split("@")[0];
    const emailDomain = userInfo.email.split("@")[1] ?? "";
    let baseSlug = (emailDomain.split(".")[0] ?? "user")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24);
    if (!baseSlug || !USERNAME_RE.test(baseSlug)) baseSlug = "user";
    let username = baseSlug;
    for (let i = 1; ; i++) {
      if (!(await getAccount(username))) break;
      username = `${baseSlug}-${i}`;
    }
    await db.insert(platformAccountsTable).values({
      username,
      passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")),
      role: "agency",
      status: "active",
      email: userInfo.email,
      website: null,
    });
    await db.insert(platformMetaTable).values({
      key: `account:profile:${username}`,
      value: JSON.stringify({ displayName, ownerName: displayName }),
    }).onConflictDoUpdate({
      target: platformMetaTable.key,
      set: { value: JSON.stringify({ displayName, ownerName: displayName }) },
    });
    // Create the human user record for this Google sign-up and start a session.
    let newUserId: string | undefined;
    let newActiveCompanyId: string | undefined;
    try {
      newUserId = await ensurePlatformUser({
        email: userInfo.email,
        name: displayName,
        googleId: googleId || null,
        companyUsername: username,
        membershipRole: "owner",
      });
      const company = await getCompanyBySlug(username);
      newActiveCompanyId = company?.id;
    } catch {
      // Non-fatal.
    }
    // New Google SSO user: email already verified; show account-type selector.
    if (newUserId) {
      try { await db.update(platformUsersTable).set({ emailVerified: true }).where(eq(platformUsersTable.id, newUserId)); } catch { /* non-fatal */ }
    }
    if (newActiveCompanyId) {
      try { await db.update(platformCompaniesTable).set({ setupComplete: false }).where(eq(platformCompaniesTable.id, newActiveCompanyId)); } catch { /* non-fatal */ }
    }
    void sendNewSignupAlert({ name: displayName, email: userInfo.email, companyName: displayName, username, method: "google" });
    await finishOauthLoginOrChallenge(req, res, origin, {
      username,
      role: "agency",
      userId: newUserId,
      activeCompanyId: newActiveCompanyId,
      needsSetup: true,
    });
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=unexpected`);
  }
});

// --- Microsoft OAuth (Entra ID) - mirrors the Google flow exactly -----------

const MICROSOFT_AUTH_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ME = "https://graph.microsoft.com/v1.0/me";
const MS_STATE_COOKIE = "aio_ms_state";

router.get("/platform/auth/microsoft", (req: Request, res: Response) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const origin = getFrontendOrigin(req);
  if (!clientId) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=microsoft_not_configured`);
    return;
  }
  const action = typeof req.query.action === "string" ? req.query.action : "login";
  const state = `${action}:${crypto.randomBytes(16).toString("hex")}`;
  const redirect_uri = `${getAppBaseUrl()}/api/platform/auth/microsoft/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri,
    scope: "openid profile email User.Read",
    state,
    response_mode: "query",
  });
  res.cookie(MS_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600_000 });
  // Team invite flow: carry the invite token across the OAuth round-trip.
  if (typeof req.query.invite === "string" && req.query.invite.trim()) {
    setInviteCookie(res, req.query.invite.trim());
  }
  res.redirect(`${MICROSOFT_AUTH_ENDPOINT}?${params.toString()}`);
});

// GET callback: scanner/bot guard + interstitial page (mirrors Google logic).
// The aio_ms_state cookie is validated but NOT cleared here - the POST clears it.
// The action flag embedded in state ("login:..." / "link:...") is preserved
// because state travels as a hidden field in the interstitial form.
router.get("/platform/auth/microsoft/callback", (req: Request, res: Response) => {
  if (req.method === "HEAD") { res.status(200).end(); return; }
  if (SCANNER_UA_RE.test(req.headers["user-agent"] ?? "")) { res.status(200).end(); return; }

  const origin = getFrontendOrigin(req);
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=microsoft_not_configured`);
    return;
  }
  const { code, state, error: oauthError } = req.query as Record<string, string>;
  if (oauthError || !code) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=${oauthError ?? "no_code"}`);
    return;
  }
  // Validate CSRF state without clearing the cookie (POST will clear it).
  const storedState = (req.cookies as Record<string, string>)?.[MS_STATE_COOKIE] ?? "";
  if (!storedState || storedState !== state) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=state_mismatch`);
    return;
  }
  // Serve the auto-submit interstitial.
  // redirect_uri for Microsoft is getAppBaseUrl()-based (env var) - same path,
  // same method split, so no Azure app registration change is needed.
  const postUrl = `${origin}/api/platform/auth/microsoft/callback`;
  const nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  // Global CSP blocks inline scripts - add a per-response nonce (see Google callback).
  res.setHeader("Content-Security-Policy", cspHeaderWithScriptNonce(nonce));
  res.status(200).send(buildOauthInterstitial(postUrl, code, state, nonce));
});

// POST callback: actual code redemption for Microsoft.
router.post("/platform/auth/microsoft/callback", async (req: Request, res: Response) => {
  const origin = getFrontendOrigin(req);
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=microsoft_not_configured`);
    return;
  }
  try {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const state = typeof req.body?.state === "string" ? req.body.state : "";
    if (!code) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_code`);
      return;
    }
    const storedState = (req.cookies as Record<string, string>)?.[MS_STATE_COOKIE] ?? "";
    res.clearCookie(MS_STATE_COOKIE);
    if (!storedState || storedState !== state) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=state_mismatch`);
      return;
    }
    // action is embedded in the state value ("login:nonce" or "link:nonce").
    const action = (state as string).split(":")[0] ?? "login";
    // redirect_uri must exactly match the one used during authorisation.
    // Microsoft uses getAppBaseUrl() (env var) - same value as the initiation handler.
    const redirect_uri = `${getAppBaseUrl()}/api/platform/auth/microsoft/callback`;

    // Exchange code for access token
    const tokenResp = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri, scope: "openid profile email User.Read" }).toString(),
    });
    if (!tokenResp.ok) {
      let tokenErrBody: { error?: string } = {};
      try { tokenErrBody = await tokenResp.json() as { error?: string }; } catch { /* ignore */ }
      const msg = tokenErrBody.error === "invalid_grant" ? "code_already_used" : "token_exchange_failed";
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=${msg}`);
      return;
    }
    const tokenData = (await tokenResp.json()) as { access_token?: string };
    if (!tokenData.access_token) { res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_access_token`); return; }

    // Fetch Microsoft profile
    const graphResp = await fetch(MICROSOFT_GRAPH_ME, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    if (!graphResp.ok) { res.redirect(`${origin}/?oauth_status=error&oauth_msg=graph_failed`); return; }
    const profile = (await graphResp.json()) as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };
    const microsoftId = profile.id ?? "";
    if (!microsoftId) { res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_microsoft_id`); return; }
    const msEmail = ((profile.mail || profile.userPrincipalName) ?? "").toLowerCase();
    if (!msEmail || !EMAIL_RE.test(msEmail)) { res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_email`); return; }
    const displayName = profile.displayName || msEmail.split("@")[0];

    // --- Link action: attach Microsoft to the current session account --------
    // action is extracted from state above; req.account comes from the aio_sid
    // session cookie that the browser carries alongside the POST.
    if (action === "link") {
      if (!req.account) { res.redirect(`${origin}/?oauth_status=error&oauth_msg=not_signed_in`); return; }
      const conflictUser = await getUserByMicrosoftId(microsoftId);
      if (conflictUser) {
        const acc = await getAccount(normUsername(req.account.username));
        if (conflictUser.email !== (acc?.email ?? "").toLowerCase()) {
          res.redirect(`${origin}/?oauth_status=error&oauth_msg=microsoft_already_linked`);
          return;
        }
      }
      const acc = await getAccount(normUsername(req.account.username));
      if (acc?.email) {
        const u = await getUserByEmail(acc.email);
        if (u) await linkMicrosoftId(u.id, microsoftId);
      }
      res.redirect(`${origin}/?oauth_status=linked_microsoft`);
      return;
    }

    // --- Team invite flow: attach this Microsoft identity to the inviting
    // workspace instead of resolving/creating an account of their own.
    {
      const inviteRedirect = await handleSsoInvite(req, res, {
        email: msEmail,
        name: displayName,
        microsoftId,
      });
      if (inviteRedirect) {
        res.redirect(`${origin}${inviteRedirect}`);
        return;
      }
    }

    // --- Login / signup action ------------------------------------------------
    // Step 1: look up by Microsoft ID (fastest path for returning users)
    const byMsId = await getUserByMicrosoftId(microsoftId);
    if (byMsId) {
      const membership = await getPrimaryMembership(byMsId.id);
      if (membership) {
        const account = await getAccount(membership.companySlug);
        if (account) {
          if (account.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
          let userId: string | undefined; let activeCompanyId: string | undefined;
          let co: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
          try {
            userId = await ensurePlatformUser({ email: msEmail, name: displayName, companyUsername: account.username, membershipRole: membership.role, companyRole: account.role, companyStatus: account.status });
            await linkMicrosoftId(userId, microsoftId);
            co = await getCompanyBySlug(account.username); activeCompanyId = co?.id;
          } catch { userId = byMsId.id; }
          await finishOauthLoginOrChallenge(req, res, origin, {
            username: account.username,
            role: account.role,
            userId,
            activeCompanyId,
            needsSetup: co?.setupComplete === false,
          });
          return;
        }
      }
    }

    // Step 2: look up by email in platform_users (link Microsoft to existing account)
    const byEmail = msEmail ? await getUserByEmail(msEmail) : null;
    if (byEmail) {
      await linkMicrosoftId(byEmail.id, microsoftId);
      const membership = await getPrimaryMembership(byEmail.id);
      if (membership) {
        const account = await getAccount(membership.companySlug);
        if (account) {
          if (account.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
          let userId: string | undefined; let activeCompanyId: string | undefined;
          let co: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
          try {
            userId = await ensurePlatformUser({ email: msEmail, name: displayName, companyUsername: account.username, membershipRole: membership.role, companyRole: account.role, companyStatus: account.status });
            co = await getCompanyBySlug(account.username); activeCompanyId = co?.id;
          } catch { userId = byEmail.id; }
          await finishOauthLoginOrChallenge(req, res, origin, {
            username: account.username,
            role: account.role,
            userId,
            activeCompanyId,
            needsSetup: co?.setupComplete === false,
          });
          return;
        }
      }
    }

    // Step 3: look up by email in platform_accounts (legacy accounts)
    const [legacyMs] = await db.select().from(platformAccountsTable).where(ilike(platformAccountsTable.email, msEmail)).limit(1);
    if (legacyMs) {
      if (legacyMs.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
      let userId: string | undefined; let activeCompanyId: string | undefined;
      let co: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
      try {
        userId = await ensurePlatformUser({ email: msEmail, name: displayName, companyUsername: legacyMs.username, membershipRole: legacyMs.role === "admin" ? "admin" : "owner", companyRole: legacyMs.role, companyStatus: legacyMs.status });
        await linkMicrosoftId(userId, microsoftId);
        co = await getCompanyBySlug(legacyMs.username); activeCompanyId = co?.id;
      } catch { /* non-fatal */ }
      await finishOauthLoginOrChallenge(req, res, origin, {
        username: legacyMs.username,
        role: legacyMs.role,
        userId,
        activeCompanyId,
        needsSetup: co?.setupComplete === false,
      });
      return;
    }

    // Step 4: brand new user
    const emailDomain = msEmail.split("@")[1] ?? "";
    let baseSlug = (emailDomain.split(".")[0] ?? "user").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
    if (!baseSlug || !USERNAME_RE.test(baseSlug)) baseSlug = "user";
    let username = baseSlug;
    for (let i = 1; ; i++) { if (!(await getAccount(username))) break; username = `${baseSlug}-${i}`; }
    await db.insert(platformAccountsTable).values({ username, passwordHash: hashPassword(crypto.randomBytes(32).toString("hex")), role: "agency", status: "active", email: msEmail, website: null });
    await db.insert(platformMetaTable).values({ key: `account:profile:${username}`, value: JSON.stringify({ displayName, ownerName: displayName }) }).onConflictDoUpdate({ target: platformMetaTable.key, set: { value: JSON.stringify({ displayName, ownerName: displayName }) } });
    let newUserId: string | undefined; let newActiveCompanyId: string | undefined;
    try {
      newUserId = await ensurePlatformUser({ email: msEmail, name: displayName, companyUsername: username, membershipRole: "owner" });
      await linkMicrosoftId(newUserId, microsoftId);
      const co = await getCompanyBySlug(username); newActiveCompanyId = co?.id;
    } catch { /* non-fatal */ }
    if (newUserId) { try { await db.update(platformUsersTable).set({ emailVerified: true }).where(eq(platformUsersTable.id, newUserId)); } catch { /* non-fatal */ } }
    if (newActiveCompanyId) { try { await db.update(platformCompaniesTable).set({ setupComplete: false }).where(eq(platformCompaniesTable.id, newActiveCompanyId)); } catch { /* non-fatal */ } }
    void sendNewSignupAlert({ name: displayName, email: msEmail, companyName: displayName, username, method: "microsoft" });
    await finishOauthLoginOrChallenge(req, res, origin, {
      username,
      role: "agency",
      userId: newUserId,
      activeCompanyId: newActiveCompanyId,
      needsSetup: true,
    });
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=unexpected`);
  }
});

router.post("/platform/logout", async (req: Request, res: Response) => {
  try {
    const sid = getPlatformSessionId(req);
    if (sid) await deletePlatformSession(sid);
    clearPlatformCookie(res);
    // Never leave a stashed admin session behind after a logout.
    clearImpersonationStashCookie(res);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Logout failed" });
  }
});

// --- Impersonation ("view account" for support) -----------------------------
//
// Lets an admin briefly step into another account's view without a password,
// for support/debugging. The admin's own session id is stashed in a second
// cookie so "exit" can restore it without a fresh login; the target account
// gets a normal (single-use) session, which - like a real login - ends any
// session that account already had open.

// POST /api/platform/accounts/:username/impersonate - admin only.
router.post(
  "/platform/accounts/:username/impersonate",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin" && actor.role !== "agency") {
        res.status(403).json({ error: "Admin or agency access required." });
        return;
      }
      // Already viewing as someone else: don't allow nesting, which would
      // overwrite the stash and strand the original admin session.
      if (getImpersonationStashId(req)) {
        res.status(400).json({ error: "Exit the current view-as session first." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (target === normUsername(actor.username)) {
        res.status(400).json({ error: "You are already signed in as this account." });
        return;
      }
      const account = await getAccount(target);
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      // Agency accounts may only enter their own direct client sub-accounts.
      if (actor.role === "agency" && account.parent !== normUsername(actor.username)) {
        res.status(403).json({ error: "You can only enter your own client accounts." });
        return;
      }
      const adminSid = getPlatformSessionId(req);
      if (!adminSid) {
        res.status(401).json({ error: "Unauthorized: sign in required" });
        return;
      }
      const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.socket.remoteAddress;
      const sid = await createPlatformSession(account.username, makeIpHint(rawIp));
      setImpersonationStashCookie(res, adminSid);
      setPlatformCookie(res, sid);
      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "impersonate_start",
        account.username,
        "account",
        { role: account.role },
      );
      res.json({ account: { username: account.username, role: account.role } });
    } catch {
      res.status(500).json({ error: "Failed to start view-as session" });
    }
  },
);

// POST /api/platform/exit-impersonation - restores the stashed admin session.
router.post("/platform/exit-impersonation", async (req: Request, res: Response) => {
  try {
    const stashSid = getImpersonationStashId(req);
    if (!stashSid) {
      res.status(400).json({ error: "Not currently viewing another account." });
      return;
    }
    const adminAccount = await getPlatformSessionAccount(stashSid);
    if (!adminAccount) {
      // The stashed admin session expired or was revoked; there is nothing
      // safe to restore, so just clear both cookies and require a fresh login.
      clearImpersonationStashCookie(res);
      clearPlatformCookie(res);
      res.status(401).json({ error: "Your original session expired. Please sign in again." });
      return;
    }
    const viewedSid = getPlatformSessionId(req);
    if (viewedSid && viewedSid !== stashSid) await deletePlatformSession(viewedSid);
    setPlatformCookie(res, stashSid);
    clearImpersonationStashCookie(res);
    void logAdminEvent(
      { username: adminAccount.username, id: adminAccount.userId },
      "impersonate_exit",
      null,
      "account",
      null,
    );
    res.json({ account: { username: adminAccount.username, role: adminAccount.role } });
  } catch {
    res.status(500).json({ error: "Failed to exit view-as session" });
  }
});

// GET /platform/admin/master-owners - admin only. Returns the set of usernames
// that currently have masterOwner=true.
router.get(
  "/platform/admin/master-owners",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.account!.role !== "admin") {
        res.status(403).json({ error: "Admin only." });
        return;
      }
      const set = await getMasterOwnerSet();
      res.json({ usernames: Array.from(set) });
    } catch {
      res.status(500).json({ error: "Failed to load master-owner list." });
    }
  },
);

// GET /platform/admin/accounts/:username/master-owner - admin only.
router.get(
  "/platform/admin/accounts/:username/master-owner",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.account!.role !== "admin") {
        res.status(403).json({ error: "Admin only." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) { res.status(400).json({ error: "Username required." }); return; }
      const account = await getAccount(target);
      if (!account) { res.status(404).json({ error: "Account not found." }); return; }
      res.json({ masterOwner: await isMasterOwner(target) });
    } catch {
      res.status(500).json({ error: "Failed to read master-owner flag." });
    }
  },
);

// POST /platform/admin/accounts/:username/master-owner - admin only.
// Body: { masterOwner: boolean }
router.post(
  "/platform/admin/accounts/:username/master-owner",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.account!.role !== "admin") {
        res.status(403).json({ error: "Admin only." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) { res.status(400).json({ error: "Username required." }); return; }
      const account = await getAccount(target);
      if (!account) { res.status(404).json({ error: "Account not found." }); return; }
      // masterOwner only makes sense for agency / legacy-user accounts.
      const targetRole = normalizeRole(account.role);
      if (targetRole !== "agency" && targetRole !== "user") {
        res.status(400).json({ error: "masterOwner can only be set on agency accounts." });
        return;
      }
      const value = req.body?.masterOwner === true;
      await setMasterOwner(target, value);
      void logAdminEvent(
        { username: req.account!.username, id: req.account!.userId },
        "master_owner_set",
        target,
        "account",
        { masterOwner: value },
      );
      res.json({ ok: true, masterOwner: value });
    } catch {
      res.status(500).json({ error: "Failed to update master-owner flag." });
    }
  },
);

// POST /platform/switch-to-master - for agency accounts with masterOwner=true.
// Stashes the current (agency) session and issues a fresh admin session, using
// the same stash-and-replace cookie pattern as impersonation so the banner's
// "Exit" flow automatically restores the agency session.
router.post(
  "/platform/switch-to-master",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      // Only agency / legacy-user accounts may switch to master.
      // Clients are explicitly out of scope; admins are already there.
      if (actor.role !== "agency" && actor.role !== "user") {
        res.status(403).json({ error: "Only agency accounts may switch to master." });
        return;
      }
      if (getImpersonationStashId(req)) {
        res.status(400).json({ error: "Exit the current view-as session first." });
        return;
      }
      if (!(await isMasterOwner(actor.username))) {
        res.status(403).json({ error: "Master-owner access not granted for this account." });
        return;
      }
      const adminRows = await db
        .select()
        .from(platformAccountsTable)
        .where(eq(platformAccountsTable.role, "admin"))
        .limit(1);
      if (adminRows.length === 0) {
        res.status(500).json({ error: "No admin account found." });
        return;
      }
      const adminRow = adminRows[0];
      const agencySid = getPlatformSessionId(req);
      if (!agencySid) {
        res.status(401).json({ error: "Unauthorized: sign in required." });
        return;
      }
      const rawIp =
        (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.socket.remoteAddress;
      const adminSid = await createPlatformSession(adminRow.username, makeIpHint(rawIp));
      // Stash the agency session so the impersonation banner's "Exit" can restore it.
      setImpersonationStashCookie(res, agencySid);
      setPlatformCookie(res, adminSid);
      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "switch_to_master",
        adminRow.username,
        "account",
        { from: actor.username },
      );
      res.json({ account: { username: adminRow.username, role: normalizeRole(adminRow.role) } });
    } catch {
      res.status(500).json({ error: "Failed to switch to master." });
    }
  },
);

// --- Pending invites for the signed-in user ----------------------------------

// GET /platform/my-invites - list pending invites addressed to the signed-in
// user's email. Only works for new-auth sessions that carry a userId. Legacy
// sessions (no userId) return an empty list.
router.get(
  "/platform/my-invites",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    const userId = req.account?.userId;
    if (!userId) {
      res.json({ invites: [] });
      return;
    }
    try {
      const [userRow] = await db
        .select({ email: platformUsersTable.email })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, userId))
        .limit(1);
      if (!userRow?.email) {
        res.json({ invites: [] });
        return;
      }
      const rows = await db
        .select({
          token: platformInvitationsTable.token,
          companySlug: platformInvitationsTable.companySlug,
          companyId: platformInvitationsTable.companyId,
          role: platformInvitationsTable.role,
          expiresAt: platformInvitationsTable.expiresAt,
          createdAt: platformInvitationsTable.createdAt,
          companyDisplayName: platformCompaniesTable.displayName,
        })
        .from(platformInvitationsTable)
        .leftJoin(
          platformCompaniesTable,
          eq(platformInvitationsTable.companyId, platformCompaniesTable.id),
        )
        .where(
          and(
            eq(platformInvitationsTable.email, userRow.email),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            gt(platformInvitationsTable.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(platformInvitationsTable.createdAt));

      // Resolve display names from platform_meta (account:profile:{slug})
      // for any row whose companies.display_name column is null - password
      // signup stores the name there, not in the companies table directly.
      const slugsNeedingMeta = rows
        .filter((r) => !r.companyDisplayName)
        .map((r) => r.companySlug);
      const metaDisplayNames = new Map<string, string>();
      if (slugsNeedingMeta.length > 0) {
        const metaKeys = slugsNeedingMeta.map((s) => profileKey(s));
        const metaRows = await db
          .select({ key: platformMetaTable.key, value: platformMetaTable.value })
          .from(platformMetaTable)
          .where(inArray(platformMetaTable.key, metaKeys));
        for (const m of metaRows) {
          const slug = m.key.slice(PROFILE_PREFIX.length);
          const dn = parseDisplayName(m.value);
          if (dn) metaDisplayNames.set(slug, dn);
        }
      }

      res.json({
        invites: rows.map((r) => ({
          token: r.token,
          companyId: r.companyId,
          companySlug: r.companySlug,
          companyName:
            r.companyDisplayName ||
            metaDisplayNames.get(r.companySlug) ||
            r.companySlug,
          role: normalizeMembershipRole(r.role),
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
        })),
      });
    } catch (err) {
      logger.error({ err }, "my-invites: failed to load");
      res.status(500).json({ error: "Failed to load invitations." });
    }
  },
);

// POST /platform/my-invites/:token/accept - in-app accept for an already
// signed-in user. Adds the membership without issuing a new session (the
// caller stays logged in to their current workspace). The client should offer
// a "Switch to workspace" button separately after success.
// Guards: userId required, email must match invite email exactly.
router.post(
  "/platform/my-invites/:token/accept",
  requirePlatformAuth,
  loginLimiter,
  async (req: Request, res: Response) => {
    const userId = req.account?.userId;
    if (!userId) {
      res.status(403).json({ error: "Legacy sessions cannot accept invitations. Please sign in again." });
      return;
    }
    try {
      const token = String(req.params.token || "").trim();
      const invite = await getValidInvite(token);
      if (!invite) {
        res.status(404).json({ error: "This invitation is invalid, expired, or has already been used." });
        return;
      }
      // Email-bound: the signed-in user's email must match the invited email.
      const [userRow] = await db
        .select({ email: platformUsersTable.email })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, userId))
        .limit(1);
      if (!userRow?.email || userRow.email !== invite.email) {
        res.status(403).json({ error: "This invitation is for a different email address." });
        return;
      }
      const ok = await consumeInvite(invite, userId);
      if (!ok) {
        res.status(409).json({ error: "This invitation has already been used." });
        return;
      }
      const [company] = await db
        .select({
          displayName: platformCompaniesTable.displayName,
          slug: platformCompaniesTable.slug,
          role: platformCompaniesTable.role,
        })
        .from(platformCompaniesTable)
        .where(eq(platformCompaniesTable.id, invite.companyId))
        .limit(1);
      void logAdminEvent(
        { username: req.account!.username, id: userId },
        "team_invite_accepted_inapp",
        userId,
        "membership",
        { companySlug: invite.companySlug, role: normalizeMembershipRole(invite.role) },
      );
      res.json({
        ok: true,
        companyId: invite.companyId,
        companySlug: company?.slug ?? invite.companySlug,
        companyName: company?.displayName || company?.slug || invite.companySlug,
        role: normalizeMembershipRole(invite.role),
      });
    } catch (err) {
      logger.error({ err }, "my-invites: failed to accept");
      res.status(500).json({ error: "Failed to accept invitation." });
    }
  },
);

// POST /platform/switch-workspace - switch the signed-in user's active
// workspace. Requires a platform_memberships row for (userId, companyId).
// Issues a fresh session pointing at the new workspace; createPlatformSession
// revokes prior sessions for this userId (single-session-per-user model).
// The client should reload after this so all workspace-scoped state is reset.
router.post(
  "/platform/switch-workspace",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    const userId = req.account?.userId;
    if (!userId) {
      res.status(403).json({ error: "Legacy sessions cannot switch workspaces. Please sign in again." });
      return;
    }
    try {
      const companyId = typeof req.body?.companyId === "string" ? req.body.companyId.trim() : "";
      if (!companyId) {
        res.status(400).json({ error: "companyId is required." });
        return;
      }
      // Verify the user has an active membership in the target workspace.
      const [mem] = await db
        .select({
          companySlug: platformMembershipsTable.companySlug,
          membershipRole: platformMembershipsTable.role,
          companyRole: platformCompaniesTable.role,
        })
        .from(platformMembershipsTable)
        .innerJoin(
          platformCompaniesTable,
          eq(platformMembershipsTable.companyId, platformCompaniesTable.id),
        )
        .where(
          and(
            eq(platformMembershipsTable.userId, userId),
            eq(platformMembershipsTable.companyId, companyId),
            eq(platformCompaniesTable.status, "active"),
          ),
        )
        .limit(1);
      if (!mem) {
        res.status(403).json({ error: "You do not have access to that workspace." });
        return;
      }
      const rawIp =
        (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.socket.remoteAddress;
      // A full session re-issue is safer than mutating activeCompanyId in-place:
      // it stamps the current session_version and revokes stale sessions.
      // Side-effect: any other tabs open in the old workspace will get a 401 on
      // their next request. This matches login/invite-accept behaviour and is
      // consistent with the single-session-per-user model already in use.
      const sid = await createPlatformSession(mem.companySlug, makeIpHint(rawIp), userId, companyId);
      setPlatformCookie(res, sid);
      res.json({
        ok: true,
        account: {
          username: mem.companySlug,
          role: normalizeRole(mem.companyRole),
          membershipRole: normalizeMembershipRole(mem.membershipRole),
        },
      });
    } catch (err) {
      logger.error({ err }, "switch-workspace: failed");
      res.status(500).json({ error: "Failed to switch workspace." });
    }
  },
);

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
      const [names, archivedSet, mfaSet] = await Promise.all([
        getDisplayNames(),
        getArchivedSet(),
        getMfaEnabledSet(),
      ]);
      res.json({
        accounts: filtered.map((r) =>
          publicAccount(
            r,
            names.get(normUsername(r.username)),
            archivedSet.has(normUsername(r.username)),
            mfaSet.has(normUsername(r.username)),
          ),
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

      // Seat-cap enforcement: if the parent account has a maxSeats limit, count
      // existing direct sub-accounts and reject if the cap is already reached.
      if (actor.role !== "admin") {
        const parentAccount = await getAccount(normUsername(actor.username));
        if (parentAccount?.maxSeats != null) {
          const [{ value: currentSeats }] = await db
            .select({ value: count() })
            .from(platformAccountsTable)
            .where(eq(platformAccountsTable.parent, normUsername(actor.username)));
          if (currentSeats >= parentAccount.maxSeats) {
            res.status(403).json({
              error: `Seat cap reached (${parentAccount.maxSeats} ${parentAccount.maxSeats === 1 ? "seat" : "seats"} allowed). Contact your administrator to increase the limit.`,
            });
            return;
          }
        }
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
      // Clear MFA trusted devices so all devices must re-enter a TOTP code
      // after an admin-set password change.
      await clearTrustedDevices(target);

      // Security alert to the target account - non-fatal, fire-and-forget.
      // Recipient is the target's email, resolved from platform_users (for the
      // name) then falling back to platform_accounts email. Never sent to the
      // actor (admin/manager performing the reset).
      const targetEmail = existing.email;
      void (async () => {
        try {
          if (!targetEmail) return;
          let toName: string | undefined;
          try {
            const [u] = await db
              .select({ name: platformUsersTable.name })
              .from(platformUsersTable)
              .where(eq(platformUsersTable.email, targetEmail))
              .limit(1);
            toName = u?.name || undefined;
          } catch { /* non-fatal: fall back to username */ }
          await sendPasswordChangedEmail({ toEmail: targetEmail, toName: toName || target });
        } catch (err) {
          logger.warn({ err, target }, "accounts/password: failed to send password changed alert (non-fatal)");
        }
      })();

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
// shown separately in the parent's UI. Projects are NOT reassigned - the parent
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

// Reset (clear) a target account's two-factor login state so a user who lost
// both their authenticator device and recovery codes can sign in again with
// just their password. Guarded by the same canManage hierarchy as other
// account-management actions; actors cannot reset their own MFA here (they
// should use the normal disable flow, which re-verifies a TOTP code). Master
// (admin-role) targets automatically re-enter forced enrolment on next login.
router.post(
  "/platform/accounts/reset-mfa",
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
      if (target === normUsername(actor.username)) {
        res.status(400).json({ error: "You cannot reset your own two-factor login here. Use the security settings instead." });
        return;
      }
      if (!(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot reset two-factor login for this account." });
        return;
      }
      const state = await getMfaState(target);
      if (!state) {
        res.status(400).json({ error: "This account does not have two-factor login set up." });
        return;
      }
      await clearMfaState(target);
      try { await clearTrustedDevices(target); } catch { /* non-fatal */ }
      // Security alert to the affected user (fail-soft: never blocks the reset).
      // The recipient must be the workspace OWNER (or the canonical account
      // contact email) - never an arbitrary/latest team member, who could
      // otherwise intercept a security notice meant for the account holder.
      void (async () => {
        try {
          const [ownerRow] = await db
            .select({ email: platformUsersTable.email, name: platformUsersTable.name })
            .from(platformMembershipsTable)
            .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
            .where(and(
              eq(platformMembershipsTable.companySlug, target),
              eq(platformMembershipsTable.role, "owner"),
            ))
            .orderBy(platformMembershipsTable.createdAt)
            .limit(1);
          const toEmail = ownerRow?.email || existing.email;
          if (!toEmail) {
            logger.warn({ target }, "reset-mfa: no owner/account email on record - security alert not sent");
            return;
          }
          await sendMfaAdminResetEmail({ toEmail, toName: ownerRow?.name || target });
        } catch (err) {
          logger.warn({ err, target }, "reset-mfa: failed to send security alert (non-fatal)");
        }
      })();
      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "mfa_admin_reset",
        target,
        "account",
        { targetRole: existing.role },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to reset two-factor login" });
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
      // Remove membership rows for this company explicitly before the account
      // row is deleted, so the cascade FK (platform_companies.slug →
      // platform_accounts.username) does not race against the DELETE below on
      // databases where the constraint has not yet been backfilled by the
      // startup migration. This is safe to run regardless of FK state.
      await db
        .delete(platformMembershipsTable)
        .where(eq(platformMembershipsTable.companySlug, target));
      await db
        .delete(platformCompaniesTable)
        .where(eq(platformCompaniesTable.slug, target));
      await db
        .delete(platformAccountsTable)
        .where(eq(platformAccountsTable.username, target));
      await deleteProfile(target);
      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "account_delete",
        target,
        "account",
        { deletedRole: existing.role, projectsReassignedTo: normUsername(actor.username) },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete account" });
    }
  },
);

// Self-serve "delete my account and data" (GDPR right to erasure). Any signed-in
// account may call this on itself. Requires the caller to re-enter their own
// password as a confirmation step for such a destructive, irreversible action.
// An account with active (non-archived) sub-accounts must remove or reassign
// them first - we never silently cascade-delete another account's data as a
// side effect of someone else's deletion request.
router.post(
  "/platform/account/self-delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const username = normUsername(actor.username);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!password) {
        res.status(400).json({ error: "Enter your password to confirm." });
        return;
      }
      const account = await getAccount(username);
      if (!account || !verifyPassword(password, account.passwordHash)) {
        res.status(401).json({ error: "Incorrect password." });
        return;
      }
      if (account.role === "admin") {
        const admins = await db
          .select({ username: platformAccountsTable.username })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.role, "admin"));
        if (admins.length <= 1) {
          res.status(400).json({ error: "You are the last admin, so this account cannot be deleted. Promote another account to admin first." });
          return;
        }
      }
      const children = await db
        .select({ username: platformAccountsTable.username })
        .from(platformAccountsTable)
        .where(eq(platformAccountsTable.parent, username));
      if (children.length > 0) {
        res.status(400).json({
          error: `You still have ${children.length} client account${children.length === 1 ? "" : "s"} under you. Delete or reassign them first.`,
        });
        return;
      }

      // Hard-delete everything scoped to this account. Order does not matter
      // (no foreign keys tie these tables together), but we log the event
      // before removing the account row so the actor/target are still valid.
      void logAdminEvent({ username: actor.username, id: actor.userId }, "account_self_delete", username, "account", {
        role: account.role,
      });
      await db.delete(archiveItemsTable).where(eq(archiveItemsTable.owner, username));
      await db.delete(plannerItemsTable).where(eq(plannerItemsTable.owner, username));
      await db.delete(scoringConfigsTable).where(eq(scoringConfigsTable.owner, username));
      await db.delete(auditLocksTable).where(eq(auditLocksTable.owner, username));
      await db.delete(projectSnapshotsTable).where(eq(projectSnapshotsTable.owner, username));
      await db.delete(projectsTable).where(eq(projectsTable.owner, username));
      await db.delete(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, username));
      await db.delete(mediaContactsTable).where(eq(mediaContactsTable.accountId, username));
      await db.delete(mediaCategoriesTable).where(eq(mediaCategoriesTable.accountId, username));
      await db.delete(tokenUsageTable).where(eq(tokenUsageTable.accountId, username));
      await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, username));
      await deleteProfile(username);
      await db.delete(platformMetaTable).where(eq(platformMetaTable.key, archiveKey(username)));
      // Clean up membership and company rows so no orphaned references remain
      // in the new user/company layer after the legacy account row is deleted.
      await db
        .delete(platformMembershipsTable)
        .where(eq(platformMembershipsTable.companySlug, username));
      await db
        .delete(platformCompaniesTable)
        .where(eq(platformCompaniesTable.slug, username));
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, username));

      clearPlatformCookie(res);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete account. Please try again or contact info@aiofusion.ai." });
    }
  },
);

// Set (or clear) the seat cap for an agency account. Admin-only.
// PATCH /api/platform/accounts/:username/seat-cap
// Body: { maxSeats: number | null } - null clears the limit
router.patch(
  "/platform/accounts/:username/seat-cap",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Only an admin can set seat caps." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      const raw = req.body?.maxSeats;
      let maxSeats: number | null;
      if (raw === null || raw === undefined || raw === "") {
        maxSeats = null;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          res.status(400).json({ error: "maxSeats must be a non-negative integer or null." });
          return;
        }
        maxSeats = n;
      }
      await db
        .update(platformAccountsTable)
        .set({ maxSeats })
        .where(eq(platformAccountsTable.username, target));
      res.json({ ok: true, maxSeats });
    } catch {
      res.status(500).json({ error: "Failed to update seat cap" });
    }
  },
);

// --- Sessions API -----------------------------------------------------------

// Helper: mask all but the last 8 chars of a session id before sending to
// the browser (reduces exposure of the actual token).
function maskSid(sid: string): string {
  if (sid.length <= 8) return "*".repeat(sid.length);
  return "*".repeat(sid.length - 8) + sid.slice(-8);
}

function sessionToPublic(
  s: { sid: string; createdAt: Date; expiresAt: Date; ipHint: string | null; userId?: string | null; userEmail?: string | null; userName?: string | null },
  currentSid: string,
) {
  return {
    sid: maskSid(s.sid),
    isCurrent: s.sid === currentSid,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ipHint: s.ipHint ?? null,
    userId: s.userId ?? null,
    userEmail: s.userEmail ?? null,
    userName: s.userName ?? null,
  };
}

// Return the calling user's own active sessions.
// GET /api/platform/sessions
router.get(
  "/platform/sessions",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const account = req.account!;
      const currentSid = getPlatformSessionId(req) ?? "";
      const sessions = await listPlatformSessions(account.username);
      res.json({ sessions: sessions.map((s) => sessionToPublic(s, currentSid)) });
    } catch {
      res.status(500).json({ error: "Failed to load sessions" });
    }
  },
);

// Return active sessions for any account. Admin-only.
// GET /api/platform/accounts/:username/sessions
router.get(
  "/platform/accounts/:username/sessions",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      const target = normUsername(req.params.username);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      const currentSid = getPlatformSessionId(req) ?? "";
      const sessions = await listPlatformSessions(target);
      res.json({ sessions: sessions.map((s) => sessionToPublic(s, currentSid)) });
    } catch {
      res.status(500).json({ error: "Failed to load sessions" });
    }
  },
);

// Revoke a specific session by masked sid suffix. The caller may revoke their
// own non-current sessions; admins may revoke any session on any account.
// DELETE /api/platform/sessions/:sid
router.delete(
  "/platform/sessions/:sid",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const currentSid = getPlatformSessionId(req) ?? "";
      // The client sends the masked sid (last 8 chars). We need to resolve it
      // to a real sid. We search among the caller's own sessions first; admins
      // may also specify a username query param to revoke from another account.
      const targetUsername = typeof req.query.username === "string"
        ? normUsername(req.query.username)
        : normUsername(actor.username);

      // Only admins may revoke other users' sessions.
      if (targetUsername !== normUsername(actor.username) && actor.role !== "admin") {
        res.status(403).json({ error: "You can only revoke your own sessions." });
        return;
      }

      const maskedParam = req.params.sid;
      const sessions = await listPlatformSessions(targetUsername);
      const match = sessions.find((s) => maskSid(s.sid) === maskedParam);
      if (!match) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      // Non-admins cannot revoke their current session here (they use logout).
      if (match.sid === currentSid && actor.role !== "admin") {
        res.status(400).json({ error: "Use logout to end your current session." });
        return;
      }
      await deletePlatformSession(match.sid);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to revoke session" });
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

    void logAdminEvent(
      { username: req.account!.username, id: req.account!.userId },
      "platform_migrate",
      null,
      "platform",
      { inserted },
    );

    res.json({ ok: true, inserted });
  } catch {
    res.status(500).json({ error: "Migration failed" });
  }
});

// Change an account's role. Admin-only - only an admin may escalate or
// demote another account's role. Cannot be used to demote the last admin.
router.post(
  "/platform/accounts/role",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Only an admin can change account roles." });
        return;
      }
      const target = normUsername(req.body?.username);
      const newRole = normalizeRole(req.body?.role);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!["admin", "agency", "client"].includes(newRole)) {
        res.status(400).json({ error: "Role must be admin, agency, or client." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (existing.role === newRole) {
        res.json({ ok: true });
        return;
      }
      // Prevent removing the last admin.
      if (existing.role === "admin" && newRole !== "admin") {
        const admins = await db
          .select({ username: platformAccountsTable.username })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.role, "admin"));
        if (admins.length <= 1) {
          res.status(400).json({ error: "Cannot demote the last admin." });
          return;
        }
      }
      const prevRole = existing.role;
      await db
        .update(platformAccountsTable)
        .set({ role: newRole })
        .where(eq(platformAccountsTable.username, target));
      // Keep platform_companies.role in sync so membership queries that join
      // on the company layer see the correct workspace role without needing to
      // fall back to the legacy accounts table.
      await db
        .update(platformCompaniesTable)
        .set({ role: newRole })
        .where(eq(platformCompaniesTable.slug, target));
      // Update the membership role for the owner of this company so the
      // membership layer reflects the current role (owner membership role
      // mirrors the account role for single-owner companies).
      await db
        .update(platformMembershipsTable)
        .set({ role: newRole === "admin" ? "admin" : "owner" })
        .where(eq(platformMembershipsTable.companySlug, target));
      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "account_role_change",
        target,
        "account",
        { previousRole: prevRole, newRole },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to change account role" });
    }
  },
);

// Move an account to a different parent (re-parent). Admin-only. The new
// parent must exist and be an agency or admin account; you cannot re-parent
// to a leaf client. Passing an empty string for newParent places the account
// directly under admin (parent = null).
router.post(
  "/platform/accounts/reparent",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      if (actor.role !== "admin") {
        res.status(403).json({ error: "Only an admin can move accounts." });
        return;
      }
      const target = normUsername(req.body?.username);
      const rawParent = typeof req.body?.newParent === "string" ? req.body.newParent.trim() : "";
      const newParent = rawParent ? normUsername(rawParent) : null;
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (existing.role === "admin") {
        res.status(400).json({ error: "Cannot re-parent the admin account." });
        return;
      }
      if (newParent) {
        const parentAccount = await getAccount(newParent);
        if (!parentAccount) {
          res.status(404).json({ error: "New parent account not found." });
          return;
        }
        if (parentAccount.role === "client") {
          res.status(400).json({ error: "Cannot nest under a client account. Choose an agency or admin." });
          return;
        }
      }
      const prevParent = existing.parent ?? null;
      const resolvedParent = newParent ?? "admin";
      await db
        .update(platformAccountsTable)
        .set({ parent: resolvedParent })
        .where(eq(platformAccountsTable.username, target));
      // Keep platform_companies.parentSlug in sync so the company hierarchy
      // layer stays consistent with the legacy accounts layer.
      await db
        .update(platformCompaniesTable)
        .set({ parentSlug: resolvedParent })
        .where(eq(platformCompaniesTable.slug, target));
      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "account_reparent",
        target,
        "account",
        { previousParent: prevParent, newParent: resolvedParent },
      );
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to move account" });
    }
  },
);

// --- Admin events (audit log) -----------------------------------------------

function buildAuditConditions(query: Request["query"]) {
  const { action, actor, from, to } = query;
  const conditions = [];
  if (typeof action === "string" && action.trim()) {
    conditions.push(ilike(adminEventsTable.action, `%${action.trim()}%`));
  }
  if (typeof actor === "string" && actor.trim()) {
    conditions.push(ilike(adminEventsTable.actorUsername, `%${actor.trim()}%`));
  }
  if (typeof from === "string" && from.trim()) {
    const d = new Date(from.trim());
    if (!isNaN(d.getTime())) conditions.push(gte(adminEventsTable.createdAt, d));
  }
  if (typeof to === "string" && to.trim()) {
    const d = new Date(to.trim());
    if (!isNaN(d.getTime())) {
      // If a date-only string was supplied (no time component), treat it as
      // end-of-day so the full selected day is included in results.
      if (/^\d{4}-\d{2}-\d{2}$/.test(to.trim())) {
        d.setUTCHours(23, 59, 59, 999);
      }
      conditions.push(lte(adminEventsTable.createdAt, d));
    }
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

// Column set for admin events queries - includes human identity fields
// resolved from platform_users via a LEFT JOIN on actorId.
const AUDIT_COLS = {
  id: adminEventsTable.id,
  actorId: adminEventsTable.actorId,
  actorUsername: adminEventsTable.actorUsername,
  actorName: platformUsersTable.name,
  actorEmail: platformUsersTable.email,
  action: adminEventsTable.action,
  targetId: adminEventsTable.targetId,
  targetType: adminEventsTable.targetType,
  metadata: adminEventsTable.metadata,
  createdAt: adminEventsTable.createdAt,
} as const;

// Return up to 500 admin events (filtered). Admin-only.
// Query params: action, actor, from (ISO), to (ISO)
router.get(
  "/platform/admin-events",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.account!.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      const where = buildAuditConditions(req.query);
      const rows = await db
        .select(AUDIT_COLS)
        .from(adminEventsTable)
        .leftJoin(platformUsersTable, eq(adminEventsTable.actorId, platformUsersTable.id))
        .where(where)
        .orderBy(desc(adminEventsTable.createdAt))
        .limit(500);
      res.json({ events: rows });
    } catch {
      res.status(500).json({ error: "Failed to load audit log" });
    }
  },
);

function csvEscape(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

// Stream all matching events as CSV. Admin-only.
// Query params: action, actor, from (ISO), to (ISO)
router.get(
  "/platform/admin-events/export",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (req.account!.role !== "admin") {
        res.status(403).json({ error: "Admin access required." });
        return;
      }
      const where = buildAuditConditions(req.query);
      const rows = await db
        .select(AUDIT_COLS)
        .from(adminEventsTable)
        .leftJoin(platformUsersTable, eq(adminEventsTable.actorId, platformUsersTable.id))
        .where(where)
        .orderBy(desc(adminEventsTable.createdAt));

      const dateSlug = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-log-${dateSlug}.csv"`,
      );

      res.write("id,time,actor_id,actor_name,actor_email,actor,action,target_type,target_id,detail\n");
      for (const row of rows) {
        const detail =
          row.metadata
            ? Object.entries(row.metadata as Record<string, unknown>)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(" | ")
            : "";
        res.write(
          [
            csvEscape(row.id),
            csvEscape(row.createdAt),
            csvEscape(row.actorId ?? ""),
            csvEscape(row.actorName ?? ""),
            csvEscape(row.actorEmail ?? ""),
            csvEscape(row.actorUsername),
            csvEscape(row.action),
            csvEscape(row.targetType ?? ""),
            csvEscape(row.targetId ?? ""),
            csvEscape(detail),
          ].join(",") + "\n",
        );
      }
      res.end();
    } catch {
      res.status(500).json({ error: "Failed to export audit log" });
    }
  },
);

// ---------------------------------------------------------------------------
// PROFILE IMAGES - user photo ("avatar") and brand/agency logo ("logo").
// Stored as data URLs in platform_meta (small, client-side resized images)
// so no extra storage infrastructure is needed and they survive deploys.
// ---------------------------------------------------------------------------
const IMAGE_KINDS = ["avatar", "logo"] as const;
type ImageKind = (typeof IMAGE_KINDS)[number];
const profileImageKey = (kind: ImageKind, username: string) =>
  `account:image:${kind}:${normUsername(username)}`;
// ~600KB of base64 ≈ 450KB image - plenty for a resized avatar/logo.
const MAX_IMAGE_DATA_URL_LENGTH = 800_000;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

router.post("/platform/profile/image", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const { kind, dataUrl } = (req.body ?? {}) as { kind?: string; dataUrl?: string };
    if (!IMAGE_KINDS.includes(kind as ImageKind)) {
      res.status(400).json({ error: "Invalid image kind" });
      return;
    }
    if (typeof dataUrl !== "string" || !DATA_URL_RE.test(dataUrl)) {
      res.status(400).json({ error: "Image must be a PNG, JPEG or WebP data URL" });
      return;
    }
    if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
      res.status(400).json({ error: "Image is too large - please use a smaller photo" });
      return;
    }
    const key = profileImageKey(kind as ImageKind, req.account!.username);
    await db
      .insert(platformMetaTable)
      .values({ key, value: dataUrl })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: dataUrl } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save image" });
  }
});

router.delete("/platform/profile/image/:kind", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const kind = req.params.kind;
    if (!IMAGE_KINDS.includes(kind as ImageKind)) {
      res.status(400).json({ error: "Invalid image kind" });
      return;
    }
    await db
      .delete(platformMetaTable)
      .where(eq(platformMetaTable.key, profileImageKey(kind as ImageKind, req.account!.username)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove image" });
  }
});

router.get("/platform/profile/image/:kind", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const kind = req.params.kind;
    if (!IMAGE_KINDS.includes(kind as ImageKind)) {
      res.status(400).json({ error: "Invalid image kind" });
      return;
    }
    const [row] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, profileImageKey(kind as ImageKind, req.account!.username)))
      .limit(1);
    if (!row?.value || !DATA_URL_RE.test(row.value)) {
      res.status(404).json({ error: "No image" });
      return;
    }
    const [, mime] = row.value.match(/^data:(image\/[a-z]+);base64,/) ?? [];
    const base64 = row.value.slice(row.value.indexOf(",") + 1);
    const buf = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", mime || "image/png");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buf);
  } catch {
    res.status(500).json({ error: "Failed to load image" });
  }
});

export default router;

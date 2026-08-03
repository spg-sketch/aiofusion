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
} from "@workspace/db";
import { and, count, desc, eq, gte, ilike, like, lte, sql } from "drizzle-orm";
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
} from "../lib/platform-auth";
import { requirePlatformAuth } from "../middleware/platform-auth";
import {
  getMfaState,
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
} from "../lib/mfa";
import { loginLimiter } from "../middleware/rate-limit";
import { logAdminEvent } from "../lib/admin-events";
import { sendNewSignupAlert, sendApprovalEmail, sendVerificationEmail, sendPasswordResetEmail, getAppBaseUrl } from "../lib/notify-email";

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
  let masterOwner = false;
  let emailVerified: boolean | null = null;
  let setupComplete: boolean | null = null;
  if (req.account) {
    try {
      const acc = await getAccount(normUsername(req.account.username));
      if (acc?.email) {
        const u = await getUserByEmail(acc.email);
        googleLinked = !!(u?.googleId);
        emailVerified = u?.emailVerified ?? null;
      }
    } catch { /* non-fatal */ }
    try {
      masterOwner = await isMasterOwner(req.account.username);
    } catch { /* non-fatal */ }
    try {
      const co = await getCompanyBySlug(normUsername(req.account.username));
      setupComplete = co?.setupComplete ?? null;
    } catch { /* non-fatal */ }
  }
  const accountWithGoogle = req.account ? { ...req.account, googleLinked } : null;
  res.setHeader("Cache-Control", "no-store");
  res.json({ account: accountWithGoogle, impersonating, masterOwner, emailVerified, setupComplete });
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
): Promise<void> {
  const isMaster = normalizeRole(identity.role) === "admin";
  let mfa: Awaited<ReturnType<typeof getMfaState>> = null;
  try {
    mfa = await getMfaState(identity.username);
  } catch { /* non-fatal: fall through to challenge rules below */ }

  if (mfa?.enabled) {
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
        }, rawIp ?? undefined);
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
    }, rawIp ?? undefined);
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
      // MFA was disabled between password check and this call — let them in.
      await completeMfaLogin(res, pending, clientIp(req));
      return;
    }
    if (verifyTotp(state.secret, code)) {
      await completeMfaLogin(res, pending, clientIp(req));
      return;
    }
    // Fall back to recovery codes (single-use).
    const remaining = consumeRecoveryCode(state, code);
    if (remaining !== null) {
      await saveMfaState(pending.u, { ...state, recoveryHashes: remaining });
      await logAdminEvent({ username: pending.u }, "mfa_recovery_code_used", pending.u, "account");
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
// (admin) accounts — MFA is mandatory for them.
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
    await logAdminEvent({ username: account.username }, "mfa_disabled", account.username, "account");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not disable two-factor authentication" });
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
    const website = typeof req.body?.website === "string" ? req.body.website.trim().slice(0, 128) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name) { res.status(400).json({ error: "Your name is required." }); return; }
    if (!email || !EMAIL_RE.test(email)) { res.status(400).json({ error: "A valid email address is required." }); return; }
    if (!companyName) { res.status(400).json({ error: "Company name is required." }); return; }
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

// Always returns ok — never reveal whether an email address is registered.
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
    // each associated company slug — legacy sessions carry user_id = NULL and
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

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "reset-password: unexpected error");
    res.status(500).json({ error: "Password reset failed. Please try again." });
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

// --- Admin: reject (delete) a pending account -------------------------------

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
    // Hard-delete the rejected application — no data was ever created.
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, target));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, `%:${target}`));
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
  // On staging, never trust request headers for the OAuth canonical host —
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

router.get("/platform/auth/google/callback", async (req: Request, res: Response) => {
  const origin = getFrontendOrigin(req);
  try {
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
    // Verify CSRF state
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
    // Exchange authorisation code for access token
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
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=token_exchange_failed`);
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

    // --- User-first identity resolution ------------------------------------
    // Step 1: resolve the human user by Google id (stable across email changes)
    // then fall back to email lookup in platform_users.
    let existingUser = googleId ? await getUserByGoogleId(googleId) : null;
    if (!existingUser) {
      existingUser = await getUserByEmail(userInfo.email);
    }

    // Step 2: if an existing user is found, route them to their active workspace
    // via platform_memberships — this is the new source of truth for
    // user → company association. The platform_accounts row is checked only for
    // status (active/suspended/pending) and is NOT used to pick the company.
    if (existingUser) {
      const displayName = userInfo.name || userInfo.given_name || userInfo.email.split("@")[0];
      const membership = await getPrimaryMembership(existingUser.id);
      if (membership) {
        const account = await getAccount(membership.companySlug);
        if (account) {
          if (account.status === "pending_approval") {
            res.redirect(`${origin}/?oauth_status=pending`);
            return;
          }
          if (account.status === "suspended") {
            res.redirect(`${origin}/?oauth_status=suspended`);
            return;
          }
          // Active — link googleId to user record then create session.
          let userId: string | undefined;
          let activeCompanyId: string | undefined;
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
            const company = await getCompanyBySlug(account.username);
            activeCompanyId = company?.id;
          } catch {
            // Non-fatal.
            userId = existingUser.id;
          }
          const sid = await createPlatformSession(account.username, makeIpHint(req.ip), userId, activeCompanyId);
          setPlatformCookie(res, sid);
          const oauthCo = activeCompanyId ? await getCompanyBySlug(account.username) : null;
          const oauthSuffix = (oauthCo?.setupComplete === false) ? "&needs_setup=true" : "";
          res.redirect(`${origin}/?oauth_status=ok${oauthSuffix}`);
          return;
        }
      }
    }

    // Step 3: no existing user or no membership — look up by email in
    // platform_accounts as fallback (covers legacy accounts not yet backfilled).
    const [existing] = await db
      .select()
      .from(platformAccountsTable)
      .where(ilike(platformAccountsTable.email, userInfo.email))
      .limit(1);
    if (existing) {
      if (existing.status === "pending_approval") {
        res.redirect(`${origin}/?oauth_status=pending`);
        return;
      }
      if (existing.status === "suspended") {
        res.redirect(`${origin}/?oauth_status=suspended`);
        return;
      }
      // Active legacy account — ensure user/company rows, then create session.
      const displayName = userInfo.name || userInfo.given_name || userInfo.email.split("@")[0];
      let userId: string | undefined;
      let activeCompanyId: string | undefined;
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
        const company = await getCompanyBySlug(existing.username);
        activeCompanyId = company?.id;
      } catch {
        // Non-fatal.
      }
      const sid = await createPlatformSession(existing.username, makeIpHint(req.ip), userId, activeCompanyId);
      setPlatformCookie(res, sid);
      const legacyOauthCo = activeCompanyId ? await getCompanyBySlug(existing.username) : null;
      const legacyOauthSuffix = (legacyOauthCo?.setupComplete === false) ? "&needs_setup=true" : "";
      res.redirect(`${origin}/?oauth_status=ok${legacyOauthSuffix}`);
      return;
    }
    // No account — register a new pending one from the Google profile
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
    const newSid = await createPlatformSession(username, makeIpHint(req.ip), newUserId, newActiveCompanyId);
    setPlatformCookie(res, newSid);
    void sendNewSignupAlert({ name: displayName, email: userInfo.email, companyName: displayName, username, method: "google" });
    res.redirect(`${origin}/?oauth_status=ok&needs_setup=true`);
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=unexpected`);
  }
});

// --- Microsoft OAuth (Entra ID) — mirrors the Google flow exactly -----------

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
  res.redirect(`${MICROSOFT_AUTH_ENDPOINT}?${params.toString()}`);
});

router.get("/platform/auth/microsoft/callback", async (req: Request, res: Response) => {
  const origin = getFrontendOrigin(req);
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=microsoft_not_configured`);
    return;
  }
  try {
    const { code, state, error: oauthError } = req.query as Record<string, string>;
    if (oauthError || !code) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=${oauthError ?? "no_code"}`);
      return;
    }
    const storedState = (req.cookies as Record<string, string>)?.[MS_STATE_COOKIE] ?? "";
    res.clearCookie(MS_STATE_COOKIE);
    if (!storedState || storedState !== state) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=state_mismatch`);
      return;
    }
    const action = (state as string).split(":")[0] ?? "login";
    const redirect_uri = `${getAppBaseUrl()}/api/platform/auth/microsoft/callback`;

    // Exchange code for access token
    const tokenResp = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri, scope: "openid profile email User.Read" }).toString(),
    });
    if (!tokenResp.ok) { res.redirect(`${origin}/?oauth_status=error&oauth_msg=token_exchange_failed`); return; }
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

    // --- Login / signup action ------------------------------------------------
    // Step 1: look up by Microsoft ID (fastest path for returning users)
    const byMsId = await getUserByMicrosoftId(microsoftId);
    if (byMsId) {
      const membership = await getPrimaryMembership(byMsId.id);
      if (membership) {
        const account = await getAccount(membership.companySlug);
        if (account) {
          if (account.status === "pending_approval") { res.redirect(`${origin}/?oauth_status=pending`); return; }
          if (account.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
          let userId: string | undefined; let activeCompanyId: string | undefined;
          try {
            userId = await ensurePlatformUser({ email: msEmail, name: displayName, companyUsername: account.username, membershipRole: membership.role, companyRole: account.role, companyStatus: account.status });
            await linkMicrosoftId(userId, microsoftId);
            const co = await getCompanyBySlug(account.username); activeCompanyId = co?.id;
          } catch { userId = byMsId.id; }
          const sid = await createPlatformSession(account.username, makeIpHint(req.ip), userId, activeCompanyId);
          setPlatformCookie(res, sid);
          const co = activeCompanyId ? await getCompanyBySlug(account.username) : null;
          res.redirect(`${origin}/?oauth_status=ok${(co?.setupComplete === false) ? "&needs_setup=true" : ""}`);
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
          if (account.status === "pending_approval") { res.redirect(`${origin}/?oauth_status=pending`); return; }
          if (account.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
          let userId: string | undefined; let activeCompanyId: string | undefined;
          try {
            userId = await ensurePlatformUser({ email: msEmail, name: displayName, companyUsername: account.username, membershipRole: membership.role, companyRole: account.role, companyStatus: account.status });
            const co = await getCompanyBySlug(account.username); activeCompanyId = co?.id;
          } catch { userId = byEmail.id; }
          const sid = await createPlatformSession(account.username, makeIpHint(req.ip), userId, activeCompanyId);
          setPlatformCookie(res, sid);
          const co = activeCompanyId ? await getCompanyBySlug(account.username) : null;
          res.redirect(`${origin}/?oauth_status=ok${(co?.setupComplete === false) ? "&needs_setup=true" : ""}`);
          return;
        }
      }
    }

    // Step 3: look up by email in platform_accounts (legacy accounts)
    const [legacyMs] = await db.select().from(platformAccountsTable).where(ilike(platformAccountsTable.email, msEmail)).limit(1);
    if (legacyMs) {
      if (legacyMs.status === "pending_approval") { res.redirect(`${origin}/?oauth_status=pending`); return; }
      if (legacyMs.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
      let userId: string | undefined; let activeCompanyId: string | undefined;
      try {
        userId = await ensurePlatformUser({ email: msEmail, name: displayName, companyUsername: legacyMs.username, membershipRole: legacyMs.role === "admin" ? "admin" : "owner", companyRole: legacyMs.role, companyStatus: legacyMs.status });
        await linkMicrosoftId(userId, microsoftId);
        const co = await getCompanyBySlug(legacyMs.username); activeCompanyId = co?.id;
      } catch { /* non-fatal */ }
      const sid = await createPlatformSession(legacyMs.username, makeIpHint(req.ip), userId, activeCompanyId);
      setPlatformCookie(res, sid);
      const co = activeCompanyId ? await getCompanyBySlug(legacyMs.username) : null;
      res.redirect(`${origin}/?oauth_status=ok${(co?.setupComplete === false) ? "&needs_setup=true" : ""}`);
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
    const newSid = await createPlatformSession(username, makeIpHint(req.ip), newUserId, newActiveCompanyId);
    setPlatformCookie(res, newSid);
    void sendNewSignupAlert({ name: displayName, email: msEmail, companyName: displayName, username, method: "microsoft" });
    res.redirect(`${origin}/?oauth_status=ok&needs_setup=true`);
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

// POST /api/platform/accounts/:username/impersonate — admin only.
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

// POST /api/platform/exit-impersonation — restores the stashed admin session.
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

// GET /platform/admin/master-owners — admin only. Returns the set of usernames
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

// GET /platform/admin/accounts/:username/master-owner — admin only.
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

// POST /platform/admin/accounts/:username/master-owner — admin only.
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

// POST /platform/switch-to-master — for agency accounts with masterOwner=true.
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
// them first — we never silently cascade-delete another account's data as a
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
// Body: { maxSeats: number | null }   — null clears the limit
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

// Change an account's role. Admin-only — only an admin may escalate or
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

// Column set for admin events queries — includes human identity fields
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

export default router;

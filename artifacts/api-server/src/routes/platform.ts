import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { finishPersonalLogin, personalMfaPolicy, type LoginIdentity } from "../lib/login-mfa";
import {
  getDeployedAppOrigin,
  isStagingDeployment,
  normalizeCanonicalDomain,
  PRODUCTION_CANONICAL_HOST,
  STAGING_CANONICAL_HOST,
} from "../lib/app-url";
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
  mediaDiscoveriesTable,
  mediaCategoriesTable,
  mediaContactCategoriesTable,
  mediaImportBatchesTable,
  mediaContactFieldOverridesTable,
  mediaRecommendationSetsTable,
  mediaRecommendationItemsTable,
  mediaRecommendationDecisionsTable,
  mediaOutreachTable,
  mediaOutreachActivitiesTable,
  mediaPlacementsTable,
  tokenUsageTable,
  auditLocksTable,
  savedAuditsTable,
  savedDiagnosticsTable,
  savedContentGeoTable,
  savedTechGeoTable,
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
  isAgencyPartnerClient,
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
  isImpersonatedRequest,
  IMPERSONATION_BLOCKED_MESSAGE,
  isRestrictedMaster,
  MASTER_OWNER_REQUIRED_MESSAGE,
  setImpersonationStashCookie,
  clearImpersonationStashCookie,
  getPlatformSessionAccount,
  makeIpHint,
  ensurePlatformUser,
  createFreshPlatformSignup,
  PlatformSignupConflictError,
  emailVerificationTargetKey,
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
  createSignedInSession,
  LAST_SIGN_IN_PREFIX,
  lastSignInKey,
  deleteWorkspaceMetadata,
  DEFAULT_ADMIN_USERNAME,
  normalizeWorkspaceRole,
} from "../lib/platform-auth";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { canAccessInsightsCms, isAioFusionStaffEmail } from "../lib/insights-cms-access";
import { cspHeaderWithScriptNonce } from "../middleware/csp";
import { fetchGoogleAvatarDataUrl } from "../lib/google-avatar";
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
  mfaSubject,
  getMfaGeneration,
  validateMfaIdentity,
  personalMfaMigrationRequired,
  validateMfaPendingToken,
  consumeMfaPending,
  beginMfaEnrollment,
  replaceMfaState,
  hasMfaSession,
  recordMfaSession,
} from "../lib/mfa";
import { lockoutRemainingMs, recordLoginFailure, clearLoginFailures, lockoutMessage } from "../lib/login-lockout";
import { loginLimiter } from "../middleware/rate-limit";
import { logAdminEvent } from "../lib/admin-events";
import { sendNewSignupAlert, sendApprovalEmail, sendVerificationEmail, sendPasswordResetEmail, sendMfaAdminResetEmail, sendMfaChangedEmail, sendPasswordChangedEmail, sendEmailChangedEmail, sendNewTrustedDeviceEmail, sendClientAccountCreatedEmail, sendClientAccessChangedEmail, sendAccountTypeChangedEmail, getAppBaseUrl } from "../lib/notify-email";
import {
  INVITE_INVALID_MESSAGES,
  getValidInvite,
  getInviteInvalidReason,
  consumeInvite,
  countSeatsUsed,
  getTeamSeatLimit,
} from "../lib/team-invites";
import { getDiscountInvite, consumeDiscountInvite, applyInviteAccountType } from "../lib/discount-invites";
import { sweepTeamViolationsForCompany } from "./team";
import {
  getCompanyBillingRecord,
  saveCompanyBillingRecord,
  validateCompanyBillingFields,
} from "../lib/company-billing-record";
import { getBillingState, getBetaTrialSummary, hasPaidSubscription, startBetaTrial } from "../lib/billing";
import type { PlanKey } from "../lib/billing-plans";

const router: IRouter = Router();
const DELETE_CONFIRMATION_COOKIE = "aio_delete_confirmation";
const DELETE_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

function deleteConfirmationKey(token: string): string {
  return `account-delete-confirmation:${crypto.createHash("sha256").update(token).digest("hex")}`;
}

async function issueDeleteConfirmation(
  res: Response,
  userId: string,
  provider: "google" | "microsoft",
): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(platformMetaTable).values({
    key: deleteConfirmationKey(token),
    value: JSON.stringify({
      userId,
      provider,
      expiresAt: Date.now() + DELETE_CONFIRMATION_TTL_MS,
    }),
  });
  res.cookie(DELETE_CONFIRMATION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DELETE_CONFIRMATION_TTL_MS,
    path: "/",
  });
}

async function consumeDeleteConfirmation(req: Request, res: Response, userId: string): Promise<boolean> {
  const token = (req.cookies as Record<string, string>)?.[DELETE_CONFIRMATION_COOKIE] ?? "";
  res.clearCookie(DELETE_CONFIRMATION_COOKIE, { path: "/" });
  if (!token) return false;
  const key = deleteConfirmationKey(token);
  const [row] = await db.delete(platformMetaTable)
    .where(eq(platformMetaTable.key, key))
    .returning({ value: platformMetaTable.value });
  if (!row) return false;
  try {
    const confirmation = JSON.parse(row.value) as { userId?: string; expiresAt?: number };
    return confirmation.userId === userId
      && typeof confirmation.expiresAt === "number"
      && confirmation.expiresAt > Date.now();
  } catch {
    return false;
  }
}

async function getPasswordlessOwnerForSsoDelete(account: NonNullable<Request["account"]>) {
  if (!account.userId) return null;
  const [user] = await db.select().from(platformUsersTable)
    .where(eq(platformUsersTable.id, account.userId))
    .limit(1);
  if (!user || user.passwordHash) return null;
  const [ownerMembership] = await db.select({ role: platformMembershipsTable.role })
    .from(platformMembershipsTable)
    .where(and(
      eq(platformMembershipsTable.userId, user.id),
      eq(platformMembershipsTable.companySlug, normUsername(account.username)),
      eq(platformMembershipsTable.role, "owner"),
    ))
    .limit(1);
  return ownerMembership ? user : null;
}

const MIGRATED_FLAG = "accounts_migrated";
type OnboardingStep = "account_type" | "workspace_basics" | "access" | "billing" | "first_project";
type OnboardingState = { step: OnboardingStep; accessChoice?: "beta" | "paid" };
const ONBOARDING_PREFIX = "account:onboarding:v1:";
const onboardingKey = (username: string) => `${ONBOARDING_PREFIX}${normUsername(username)}`;

async function readOnboardingState(username: string): Promise<OnboardingState> {
  const [row] = await db.select().from(platformMetaTable)
    .where(eq(platformMetaTable.key, onboardingKey(username))).limit(1);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value) as Partial<OnboardingState>;
      if (["account_type", "workspace_basics", "access", "billing", "first_project"].includes(parsed.step ?? "")) {
        return parsed as OnboardingState;
      }
    } catch { /* corrupt state safely restarts at the first durable checkpoint */ }
  }
  return { step: "account_type" };
}

async function writeOnboardingState(username: string, state: OnboardingState): Promise<void> {
  const key = onboardingKey(username);
  const value = JSON.stringify(state);
  await db.insert(platformMetaTable).values({ key, value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

async function isEligibleForOnboarding(
  identity: Pick<LoginIdentity, "username" | "role" | "userId"> & { membershipRole?: string | null },
  impersonated = false,
): Promise<boolean> {
  const account = await getAccount(normUsername(identity.username));
  const company = await getCompanyBySlug(identity.username);
  let membershipRole = identity.membershipRole;
  if (identity.userId && membershipRole === undefined) {
    const [membership] = await db.select({ role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(and(eq(platformMembershipsTable.userId, identity.userId), eq(platformMembershipsTable.companySlug, normUsername(identity.username))))
      .limit(1);
    membershipRole = membership?.role;
  }
  return !!account
    && !account.parent
    && !impersonated
    && !(await isManaged(identity.username))
    && (membershipRole === undefined || membershipRole === null || normalizeMembershipRole(membershipRole) === "owner")
    && company?.setupComplete === false
    && normalizeRole(identity.role) !== "admin";
}

async function isOnboardingOwner(req: Request, _company?: typeof platformCompaniesTable.$inferSelect | null): Promise<boolean> {
  if (!req.account) return false;
  return isEligibleForOnboarding({
    username: req.account.username,
    role: req.account.role,
    userId: req.account.userId,
    membershipRole: req.account.membershipRole,
  }, await isImpersonatedRequest(req));
}

async function resolvedOnboardingState(username: string): Promise<OnboardingState> {
  const stored = await readOnboardingState(username);
  if (stored.step === "access" || stored.step === "billing") {
    const billing = await getBillingState(username);
    if (hasPaidSubscription(billing)) return { step: "first_project", accessChoice: "paid" };
    if (getBetaTrialSummary(billing).status === "active") {
      return { step: "first_project", accessChoice: "beta" };
    }
  }
  return stored;
}

type AccountTypeTransitionResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "seat_limit"; seatsUsed?: number; seatLimit?: number };

// Apply a workspace account-type change atomically. Moving an agency to client
// turns every project-scoped person into an account-pool colleague, so the
// client capacity check must happen before the role change and normalization.
async function transitionWorkspaceAccountType(
  username: string,
  newRole: "admin" | "agency" | "client",
  markSetupComplete = false,
): Promise<AccountTypeTransitionResult> {
  const seatLimit = newRole === "client" ? await getTeamSeatLimit(username) : null;

  return db.transaction(async (tx) => {
    const [company] = await tx
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, username))
      .limit(1);
    if (!company) return { ok: false as const, reason: "missing" as const };

    await tx.execute(sql`SELECT 1 FROM platform_companies WHERE id = ${company.id} FOR UPDATE`);
    await tx.execute(sql`SELECT 1 FROM platform_accounts WHERE username = ${username} FOR UPDATE`);

    if (newRole === "client") {
      const { members, pendingInvites } = await countSeatsUsed(company.id, tx);
      const seatsUsed = members + pendingInvites;
      if (seatsUsed > seatLimit!) {
        return { ok: false as const, reason: "seat_limit" as const, seatsUsed, seatLimit: seatLimit! };
      }
    }

    await tx
      .update(platformAccountsTable)
      .set({ role: newRole })
      .where(eq(platformAccountsTable.username, username));
    await tx
      .update(platformCompaniesTable)
      .set(markSetupComplete ? { role: newRole, setupComplete: true } : { role: newRole })
      .where(eq(platformCompaniesTable.id, company.id));

    if (newRole === "client") {
      // Every client colleague is content and has workspace-wide access.
      // Keeping this inside the transition prevents a temporarily invalid
      // role/access shape from escaping between the type change and the sweep.
      await tx
        .update(platformMembershipsTable)
        .set({ projectAccess: null })
        .where(eq(platformMembershipsTable.companyId, company.id));
      await tx
        .update(platformMembershipsTable)
        .set({ role: "content" })
        .where(
          and(
            eq(platformMembershipsTable.companyId, company.id),
            ne(platformMembershipsTable.role, "owner"),
          ),
        );
      await tx
        .update(platformInvitationsTable)
        .set({ role: "content", projectAccess: null })
        .where(
          and(
            eq(platformInvitationsTable.companyId, company.id),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            isNull(platformInvitationsTable.declinedAt),
          ),
        );
    }

    return { ok: true as const };
  });
}

function publicAccount(
  row: { username: string; role: string; parent: string | null; website?: string | null },
  displayName?: string,
  archived?: boolean,
  mfaEnabled?: boolean,
  managed?: boolean,
  lastSignInAt?: string,
  agencyManaged?: boolean,
) {
  return {
    username: row.username,
    role: normalizeRole(row.role),
    parent: row.parent ?? undefined,
    ...(displayName ? { displayName } : {}),
    ...(archived ? { archived: true } : {}),
    ...(mfaEnabled ? { mfaEnabled: true } : {}),
    ...(managed ? { managed: true } : {}),
    ...(agencyManaged ? { agencyManaged: true } : {}),
    ...(lastSignInAt ? { lastSignInAt } : {}),
    ...(row.website ? { website: row.website } : {}),
  };
}

function parseLastSignIn(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const at = new Date(value);
  return Number.isFinite(at.getTime()) ? at.toISOString() : undefined;
}

async function getLastSignIns(): Promise<Map<string, string>> {
  const storedRows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${LAST_SIGN_IN_PREFIX}%`));
  const map = new Map<string, string>();
  for (const row of storedRows) {
    const at = parseLastSignIn(row.value);
    if (at) map.set(row.key.slice(LAST_SIGN_IN_PREFIX.length), at);
  }
  return map;
}

// Friendly display names live in the generic platform_meta key/value table
// (one row per account, keyed `account:profile:<username>`) so no schema change
// is needed. The value is JSON, currently just { displayName }.
const PROFILE_PREFIX = "account:profile:";
const profileKey = (username: string) => `${PROFILE_PREFIX}${normUsername(username)}`;
const WORKSPACE_NAME_REVIEW_PREFIX = "workspace-name-reviewed:";
const workspaceNameReviewKey = (username: string) =>
  `${WORKSPACE_NAME_REVIEW_PREFIX}${normUsername(username)}`;

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

// Managed client accounts: the agency runs the account on the client's
// behalf and the client has no sign-in access. Flag stored as a
// platform_meta row (same pattern as archived).
const MANAGED_PREFIX = "account:managed:";
const managedKey = (username: string) => `${MANAGED_PREFIX}${normUsername(username)}`;

async function getManagedSet(): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${MANAGED_PREFIX}%`));
  return new Set(rows.map((r) => r.key.slice(MANAGED_PREFIX.length)));
}

async function isManaged(username: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, managedKey(username)));
  return rows.length > 0;
}

// Pick the workspace a signing-in human should land in: their most recent
// membership whose company is NOT a managed (access-disabled) client account
// and is not an agency/partner client. The hierarchy-derived check is needed
// because older partner rows may not have the managed metadata flag.
// Falls back to the primary membership when every workspace is managed, so
// the downstream managed check still rejects the login with a clear error.
async function pickLoginMembership(
  userId: string,
): Promise<typeof platformMembershipsTable.$inferSelect | null> {
  const primary = await getPrimaryMembership(userId);
  if (!primary) return null;
  if (!(await isManaged(primary.companySlug))
    && !(await isAgencyPartnerClient(primary.companySlug))) return primary;
  const mems = await db
    .select()
    .from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.userId, userId))
    .orderBy(desc(platformMembershipsTable.createdAt));
  for (const m of mems) {
    if (!(await isManaged(m.companySlug))
      && !(await isAgencyPartnerClient(m.companySlug))) return m;
  }
  return primary;
}

async function provisionAioFusionStaffMembership(opts: {
  email: string;
  name: string;
  googleId?: string;
  microsoftId?: string;
}): Promise<{ username: string; role: Role; userId: string; activeCompanyId: string } | null> {
  const masterAccount = await getAccount(DEFAULT_ADMIN_USERNAME);
  if (!masterAccount || normalizeRole(masterAccount.role) !== "admin" || masterAccount.status === "suspended") {
    throw new Error("The Master workspace is unavailable.");
  }

  // A domain is not an access grant. Only the retained, explicitly authorized
  // roster may sign in; OAuth must never reinsert a revoked staff membership.
  const user = await getUserByEmail(opts.email);
  if (!user) throw new Error("Your personal Master access has not been approved.");
  const [membership] = await db.select().from(platformMembershipsTable).where(and(
    eq(platformMembershipsTable.userId, user.id), eq(platformMembershipsTable.companySlug, DEFAULT_ADMIN_USERNAME),
  )).limit(1);
  if (!membership) throw new Error("Your personal Master access has not been approved.");
  const userId = user.id;
  if (opts.googleId) await linkGoogleId(userId, opts.googleId);
  if (opts.microsoftId) await linkMicrosoftId(userId, opts.microsoftId);
  await db
    .update(platformUsersTable)
    .set({ emailVerified: true })
    .where(eq(platformUsersTable.id, userId));

  const masterCompany = await getCompanyBySlug(masterAccount.username);
  if (!masterCompany) throw new Error("The Master workspace company record is unavailable.");
  // Provisioning can deliberately decline to recreate a removed membership.
  // The human identity alone never authorizes Master sign-in or an MFA token.
  // Check the actual membership, not just its revocation marker: an explicit
  // later invitation may legitimately have restored access.
  const [currentMembership] = await db.select({ userId: platformMembershipsTable.userId })
    .from(platformMembershipsTable)
    .where(and(
      eq(platformMembershipsTable.userId, userId),
      eq(platformMembershipsTable.companyId, masterCompany.id),
    )).limit(1);
  if (!currentMembership) return null;

  return {
    username: masterAccount.username,
    role: "admin",
    userId,
    activeCompanyId: masterCompany.id,
  };
}

const MANAGED_LOGIN_ERROR =
  "This account is managed by your agency. Contact them for access.";

// Recent-sign-in warning window: destructive access changes (revoke /
// mark-managed) on a client who signed in within this window require an
// explicit confirmation from the agency, so an actively-signing-in client
// isn't locked out by accident. Shared by both the "Remove client access"
// and "Mark as managed" flows.
const RECENT_SIGN_IN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Most recent genuine sign-in for an account. Never infer this from sessions:
// those are also issued for impersonation and workspace switching.
async function getLastSignInAt(username: string): Promise<Date | null> {
  const [stored] = await db
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, lastSignInKey(username)))
    .limit(1);
  const remembered = parseLastSignIn(stored?.value);
  return remembered ? new Date(remembered) : null;
}

async function setManaged(username: string, managed: boolean): Promise<void> {
  const key = managedKey(username);
  if (managed) {
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

// Set (or, when blank, clear) only an account's display name while preserving
// other profile metadata such as the account holder's preferred name.
async function setDisplayName(username: string, displayName: string): Promise<void> {
  const key = profileKey(username);
  const dn = displayName.trim().slice(0, 64);
  const [stored] = await db
    .select({ value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, key))
    .limit(1);
  let profile: Record<string, unknown> = {};
  if (stored?.value) {
    try {
      const parsed = JSON.parse(stored.value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        profile = parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid legacy metadata cannot be merged safely; replace it below.
    }
  }

  if (dn) profile.displayName = dn;
  else delete profile.displayName;

  if (Object.keys(profile).length === 0) {
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, key));
    return;
  }
  const value = JSON.stringify(profile);
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

// Account type changes are sensitive enough that the person who owns the
// workspace must be notified. Prefer the oldest owner membership (the same
// ownership rule used for other security notices), then fall back to the
// legacy account contact for accounts that predate platform_users.
async function getAccountOwnerContact(username: string): Promise<{ email: string; name: string } | null> {
  const [owner] = await db
    .select({ email: platformUsersTable.email, name: platformUsersTable.name })
    .from(platformMembershipsTable)
    .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
    .where(
      and(
        eq(platformMembershipsTable.companySlug, normUsername(username)),
        eq(platformMembershipsTable.role, "owner"),
      ),
    )
    .orderBy(platformMembershipsTable.createdAt)
    .limit(1);
  if (owner?.email) return { email: owner.email, name: owner.name || username };

  const [account] = await db
    .select({ email: platformAccountsTable.email })
    .from(platformAccountsTable)
    .where(eq(platformAccountsTable.username, normUsername(username)))
    .limit(1);
  return account?.email ? { email: account.email, name: username } : null;
}

// --- Session lifecycle ------------------------------------------------------

// Who is signed in (or null). Drives the client's view of the current session.
router.get("/platform/me", async (req: Request, res: Response) => {
  let impersonating: { by: string; byRole: string } | null = null;
  // The active account is the viewed workspace, but identity fields describe
  // the human who authenticated. During an authorized agency/master
  // impersonation those must come from the stashed operator session rather
  // than from the managed client's legacy account row.
  let impersonationOperator: NonNullable<Request["account"]> | null = null;
  const stashSid = getImpersonationStashId(req);
  if (req.account && stashSid && stashSid !== getPlatformSessionId(req)) {
    const adminAccount = await getPlatformSessionAccount(stashSid);
    if (
      adminAccount
      && (normalizeRole(adminAccount.role) === "admin" || normalizeRole(adminAccount.role) === "agency")
      && await canManage(adminAccount, req.account.username)
    ) {
      impersonationOperator = adminAccount;
      impersonating = { by: adminAccount.username, byRole: adminAccount.role };
    }
  }
  let googleLinked = false;
  let microsoftLinked = false;
  let hasPassword = false;
  let masterOwner = false;
  // True when the signed-in workspace is a client account owned by an
  // agency/partner parent: billing sits entirely with the agency, so the
  // client UI must never show billing/payment sections.
  let agencyManagedClient = false;
  let emailVerified: boolean | null = null;
  let setupComplete: boolean | null = null;
  // Profile fields for intake form prefill. Only populated for the account's
  // own direct session (not impersonation, not a team-member session).
  let accountDisplayName: string | null = null;
  let accountWebsite: string | null = null;
  let signedInUserName: string | null = null;
  let signedInUserEmail: string | null = null;
  let activeCompanyName: string | null = null;
  let sessionIdentityCompanyName: string | null = null;
  let workspaceNameNeedsReview = false;
  let organicWorkspace = false;
  let resolvedUser: typeof platformUsersTable.$inferSelect | null = null;
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
      organicWorkspace = !!acc && !acc.parent;
      // Legacy fallback: sessions created before userId was stored.
      if (!u) {
        if (acc?.email) u = await getUserByEmail(acc.email);
      }
      if (u) {
        resolvedUser = u;
        googleLinked = !!(u.googleId);
        microsoftLinked = !!(u.microsoftId);
        hasPassword = !!(u.passwordHash);
        emailVerified = u.emailVerified ?? null;
        signedInUserName = u.name?.trim() || null;
        signedInUserEmail = u.email?.trim() || null;
      }
      accountWebsite = acc?.website ?? null;
    } catch { /* non-fatal */ }
    try {
      masterOwner = await isMasterOwner(req.account.username);
    } catch { /* non-fatal */ }
    try {
      agencyManagedClient = await isAgencyPartnerClient(req.account.username);
    } catch { /* non-fatal */ }
    try {
       const co = await getCompanyBySlug(normUsername(req.account.username));
       setupComplete = co?.setupComplete ?? null;
       activeCompanyName = co?.displayName?.trim() || null;
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
    // Older SSO signups could copy the person's name into the workspace-name
    // field. Flag only the narrow, high-confidence case: a completed,
    // top-level workspace viewed by its owner, with an SSO identity and an
    // exact personal/workspace-name match. Never alter the name here.
    const currentWorkspaceName = accountDisplayName || activeCompanyName;
    if (
      organicWorkspace
      && setupComplete !== false
      && (req.account.membershipRole == null || req.account.membershipRole === "owner")
      && (googleLinked || microsoftLinked)
      && signedInUserName
      && currentWorkspaceName
      && signedInUserName.localeCompare(currentWorkspaceName, undefined, { sensitivity: "accent" }) === 0
    ) {
      try {
        const [reviewed] = await db
          .select({ key: platformMetaTable.key })
          .from(platformMetaTable)
          .where(eq(platformMetaTable.key, workspaceNameReviewKey(req.account.username)))
          .limit(1);
        workspaceNameNeedsReview = !reviewed;
      } catch { /* fail closed: do not show an uncertain prompt */ }
    }
  }
  sessionIdentityCompanyName = activeCompanyName || accountDisplayName;
  // Keep the viewed account above for account/workspace data, but expose the
  // original operator as the authenticated identity while impersonating. This
  // prevents the client from treating a managed client's contact/credential
  // owner as the signed-in person.
  if (impersonationOperator) {
    sessionIdentityCompanyName = null;
    try {
      let operatorUser: typeof platformUsersTable.$inferSelect | null = null;
      if (impersonationOperator.userId) {
        const [user] = await db
          .select()
          .from(platformUsersTable)
          .where(eq(platformUsersTable.id, impersonationOperator.userId))
          .limit(1);
        operatorUser = user ?? null;
      }
      if (!operatorUser) {
        const operatorAccount = await getAccount(normUsername(impersonationOperator.username));
        if (operatorAccount?.email) operatorUser = await getUserByEmail(operatorAccount.email);
        signedInUserEmail = operatorUser?.email?.trim() || operatorAccount?.email?.trim() || null;
      } else {
        signedInUserEmail = operatorUser.email?.trim() || null;
      }
      signedInUserName = operatorUser?.name?.trim() || impersonationOperator.username;
      const operatorCompany = await getCompanyBySlug(normUsername(impersonationOperator.username));
      activeCompanyName = operatorCompany?.displayName?.trim() || null;
      if (!activeCompanyName) {
        const [operatorProfile] = await db
          .select()
          .from(platformMetaTable)
          .where(eq(platformMetaTable.key, profileKey(normUsername(impersonationOperator.username))))
          .limit(1);
        activeCompanyName = parseDisplayName(operatorProfile?.value) ?? null;
      }
      sessionIdentityCompanyName = activeCompanyName;
    } catch {
      // Keep the already-resolved viewed-account data if operator lookup is
      // unavailable; the authorization boundary remains enforced by middleware.
    }
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
  let onboarding: OnboardingState | null = null;
  if (req.account && await isOnboardingOwner(req)) {
    try {
      onboarding = await resolvedOnboardingState(normUsername(req.account.username));
    } catch { /* setup gate remains active even if its detail cannot be read */ }
  }
  res.json({
    account: accountWithGoogle,
    impersonating,
    masterOwner,
    agencyManagedClient,
    emailVerified,
    insightsCmsAccess: canAccessInsightsCms(req.account?.role, resolvedUser ?? req.platformUser),
    setupComplete,
    onboarding,
    hasPassword,
    sessionIdentity: req.account
      ? {
          userName: signedInUserName,
          userEmail: signedInUserEmail,
          companyName: sessionIdentityCompanyName
            || (normalizeRole((impersonationOperator ?? req.account).role) === "admin"
              ? "Master"
              : (impersonationOperator ?? req.account).username),
        }
      : null,
    // Returned for client-side intake prefill. The client performs its own
    // role + impersonation guard before using these values.
    accountProfile: {
      displayName: accountDisplayName,
      website: accountWebsite,
      workspaceNameNeedsReview,
    },
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

// Decide whether to issue a session immediately or return an MFA challenge.
async function finishLoginOrChallenge(
  res: Response,
  identity: LoginIdentity,
  rawIp: string | undefined,
  trustedDeviceCookie?: string,
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  // Managed (access-disabled) and agency/partner client accounts cannot be
  // signed into at all - the agency works on the client's behalf via "View
  // account" instead.
  const agencyPartnerClient = await isAgencyPartnerClient(identity.username);
  if (agencyPartnerClient || await isManaged(identity.username)) {
    res.status(403).json({
      error: agencyPartnerClient ? AGENCY_PARTNER_CLIENT_MESSAGE : MANAGED_LOGIN_ERROR,
    });
    return;
  }
  await finishPersonalLogin(res, identity, rawIp, trustedDeviceCookie);
}

// Issue the real session after a successful MFA code check during login.
async function completeMfaLogin(
  res: Response,
  payload: NonNullable<ReturnType<typeof verifyMfaPendingToken>>,
  rawIp: string | undefined,
  extra?: Record<string, unknown>,
  onAuthenticated?: () => Promise<void>,
): Promise<void> {
  // Access may have been revoked between the password check and the MFA code.
  const agencyPartnerClient = await isAgencyPartnerClient(payload.u);
  if (agencyPartnerClient || await isManaged(payload.u)) {
    res.status(403).json({
      error: agencyPartnerClient ? AGENCY_PARTNER_CLIENT_MESSAGE : MANAGED_LOGIN_ERROR,
    });
    return;
  }
  const policy = await personalMfaPolicy({ username: payload.u, userId: payload.uid, activeCompanyId: payload.cid });
  if (policy.generation !== payload.g || policy.migrationRequired || !await consumeMfaPending(payload)) {
    res.status(401).json({ error: "Your sign-in session expired. Please sign in again." });
    return;
  }
  // The MFA token is only a transport hint. Recompute eligibility after the
  // code so a role/workspace change during MFA cannot open the setup gate.
  const needsSetup = await isEligibleForOnboarding({
    username: payload.u, role: payload.role, userId: payload.uid,
  });
  // Full authentication complete: clear the MFA-stage lockout counter.
  await clearLoginFailures("mfa:" + policy.subject);
  const sid = await createSignedInSession(payload.u, rawIp, payload.uid, payload.cid, payload.g);
  if (onAuthenticated) await onAuthenticated();
  setPlatformCookie(res, sid);
  res.json({
    account: { username: payload.u, role: policy.role },
    ...(needsSetup ? { needsSetup: true } : {}),
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
  res.setHeader("Cache-Control", "no-store");
  // Managed (access-disabled) and agency/partner client accounts cannot be
  // signed into via SSO either - use the managed redirect so the frontend
  // shows a clear error.
  if (await isAgencyPartnerClient(identity.username) || await isManaged(identity.username)) {
    res.redirect(`${origin}/?oauth_status=managed`);
    return;
  }
  const policy = await personalMfaPolicy(identity);
  if (policy.migrationRequired) {
    res.redirect(`${origin}/?oauth_status=mfa_recovery_required`);
    return;
  }
  const isMaster = policy.required;
  const mfa = await getMfaState(policy.subject);

  if (mfa?.enabled || isMaster) {
    const mode: "enroll" | "verify" = mfa?.enabled ? "verify" : "enroll";
    // Trusted device: skip the code for verify-mode challenges only (mandatory
    // enrolment can never be skipped).
    if (mode === "verify" && await isTrustedDevice(
      policy.subject,
      (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE],
    )) {
      const sid = await createSignedInSession(
        identity.username,
        req.ip,
        identity.userId,
        identity.activeCompanyId,
        policy.generation,
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
      g: policy.generation,
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

  const sid = await createSignedInSession(
    identity.username,
    req.ip,
    identity.userId,
    identity.activeCompanyId,
  );
  setPlatformCookie(res, sid);
  res.redirect(`${origin}/?oauth_status=ok${identity.needsSetup ? "&needs_setup=true" : ""}`);
}

// Login message for a suspended account. If the suspension was cascaded from
// the account's agency (suspended-via flag), show the neutral "contact your
// agency" wording - the agency's own status is never disclosed to its clients.
async function suspendedLoginMessage(slug: string): Promise<string> {
  try {
    const [row] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `suspended-via:${slug}`))
      .limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value) as { label?: string };
      if (parsed?.label) return `Access is currently unavailable. Please contact ${parsed.label}.`;
    }
  } catch { /* fall through to the generic message */ }
  return "This account has been suspended. Contact your administrator.";
}

function clientIp(req: Request): string | undefined {
  return (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress ?? undefined;
}

const UNVERIFIED_EMAIL_LOGIN_ERROR =
  "Please verify your email address before signing in. Check your inbox for the verification link.";

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
    // Progressive lockout: after 5 failed attempts the identifier is locked
    // for a doubling delay. Checked before any credential work; the message
    // never reveals whether the account exists.
    const loginUser = identifier.includes("@") ? await getUserByEmail(identifier) : null;
    const loginKey = loginUser ? mfaSubject({ userId: loginUser.id, username: identifier }) : `legacy-login:${normUsername(identifier)}`;
    const lockedMs = await lockoutRemainingMs(loginKey);
    if (lockedMs > 0) {
      res.setHeader("Retry-After", Math.ceil(lockedMs / 1000));
      res.status(429).json({ error: lockoutMessage(lockedMs) });
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
    if (!isEmail && newUser) {
      res.status(400).json({ error: "Sign in with your personal email address, not the workspace name." });
      return;
    }
    if (newUser && newUser.passwordHash && verifyPassword(password, newUser.passwordHash)) {
      // NULL remains the legacy/SSO value. Only an explicit false from the
      // password-signup flow blocks authentication.
      if (newUser.emailVerified === false) {
        res.status(403).json({
          error: UNVERIFIED_EMAIL_LOGIN_ERROR,
          needsVerification: true,
          email: newUser.email,
        });
        return;
      }
      // Credential verified via platform_users. Resolve company for status check.
      const membership = await pickLoginMembership(newUser.id);
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
        if (acct.status === "suspended") { res.status(403).json({ error: await suspendedLoginMessage(acct.username) }); return; }
        if (await isAgencyPartnerClient(acct.username)) {
          res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
          return;
        }
        let activeCompanyId: string | undefined;
        try {
          const company = await getCompanyBySlug(acct.username);
          activeCompanyId = company?.id;
        } catch { /* non-fatal */ }
        const loginNeedsSetup = await isEligibleForOnboarding({
          username: acct.username, role: acct.role, userId: newUser.id, membershipRole: membership?.role,
        });
        await clearLoginFailures(loginKey);
        await finishLoginOrChallenge(res, {
          username: acct.username,
          role: acct.role,
          userId: newUser.id,
          securityGeneration: newUser.sessionVersion,
          activeCompanyId,
          needsSetup: loginNeedsSetup,
        }, rawIp ?? undefined, (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE]);
        return;
      }
    }

    // --- Legacy fallback: platform_accounts ----------------------------------
    if (newUser) {
      await recordLoginFailure(loginKey);
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }
    // Covers accounts not yet backfilled into platform_users (e.g. username-only
    // accounts without an email address set).
    const account = await getAccountByIdentifier(identifier);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      await recordLoginFailure(loginKey);
      res.status(401).json({ error: "Incorrect username or password." });
      return;
    }
    if (account.username === DEFAULT_ADMIN_USERNAME) {
      res.status(403).json({ error: "This legacy sign-in requires verified personal account recovery." });
      return;
    }
    // A legacy account may have been backfilled into platform_users after the
    // password signup. Respect an explicit pending-verification marker there,
    // while continuing to allow NULL (legacy/SSO) identities.
    if (account.email) {
      const legacyUser = await getUserByEmail(account.email);
      if (legacyUser?.emailVerified === false) {
        res.status(403).json({
          error: UNVERIFIED_EMAIL_LOGIN_ERROR,
          needsVerification: true,
          email: legacyUser.email,
        });
        return;
      }
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
      res.status(403).json({ error: await suspendedLoginMessage(account.username) });
      return;
    }
    if (await isAgencyPartnerClient(account.username)) {
      res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
      return;
    }
    // Keep genuine userless credentials isolated. The personal policy rejects
    // named rosters/retained identities; login never creates a membership here.
    const legacyNeedsSetup = await isEligibleForOnboarding({
      username: account.username, role: account.role, membershipRole: "owner",
    });
    await clearLoginFailures(loginKey);
    await finishLoginOrChallenge(res, {
      username: account.username,
      role: account.role,
      needsSetup: legacyNeedsSetup,
    }, rawIp ?? undefined, (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE]);
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// --- MFA endpoints ------------------------------------------------------------
router.use("/platform/mfa", async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (await isImpersonatedRequest(req)) {
      res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
      return;
    }
    if (req.account && !req.body?.mfaToken) {
      const policy = await personalMfaPolicy(req.account);
      if (policy.migrationRequired) {
        res.status(403).json({ error: "Verified individual recovery is required.", code: "MFA_MIGRATION_REQUIRED" });
        return;
      }
    }
    next();
  } catch {
    res.status(401).json({ error: "Your security session is unavailable. Please sign in again." });
  }
});

async function verifiedMfaRecipient(userId?: string) {
  if (!userId) return null;
  const [user] = await db.select({ email: platformUsersTable.email, name: platformUsersTable.name })
    .from(platformUsersTable).where(and(eq(platformUsersTable.id, userId), eq(platformUsersTable.emailVerified, true))).limit(1);
  return user?.email ? { toEmail: user.email, toName: user.name || user.email } : null;
}

async function notifyPersonalMfa(userId: string | undefined, enabled: boolean) {
  try {
    const recipient = await verifiedMfaRecipient(userId);
    if (recipient) await sendMfaChangedEmail({ ...recipient, enabled });
  } catch (err) { logger.warn({ err, userId }, "Personal MFA security notification failed"); }
}

async function checkPersonalMfaLockout(res: Response, subject: string): Promise<boolean> {
  const remaining = await lockoutRemainingMs(`mfa:${subject}`);
  if (!remaining) return false;
  res.setHeader("Retry-After", Math.ceil(remaining / 1000));
  res.status(429).json({ error: lockoutMessage(remaining) });
  return true;
}

// Begin (or restart) TOTP enrolment. Accepts EITHER a pending login token in
// `mfaToken` (mandatory enrolment for masters during login) OR an authenticated
// session (opt-in enrolment for everyone else). Generates a fresh secret stored
// unconfirmed; nothing changes for login until /platform/mfa/enable confirms it.
router.post("/platform/mfa/setup", loginLimiter, async (req: Request, res: Response) => {
  try {
    let username: string | null = null;
    let userId: string | undefined;
    let generation: number | undefined;
    const token = typeof req.body?.mfaToken === "string" ? req.body.mfaToken : "";
    if (token) {
      const payload = await validateMfaPendingToken(token);
      if (!payload || payload.mode !== "enroll") {
        res.status(401).json({ error: "Your sign-in session expired. Please sign in again." });
        return;
      }
      username = payload.u;
      userId = payload.uid;
      generation = payload.g;
    } else if (req.account) {
      username = req.account.username;
      userId = req.account.userId;
    }
    if (!username) {
      res.status(401).json({ error: "Sign in first to set up two-factor authentication." });
      return;
    }
      if (await isAgencyPartnerClient(username)) {
        res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
        return;
      }
    const subject = mfaSubject({ username, userId });
    const existing = await getMfaState(subject);
    if (existing?.enabled) {
      res.status(409).json({ error: "Two-factor authentication is already enabled on this account." });
      return;
    }
    const { secret } = await beginMfaEnrollment(subject, generation ?? await getMfaGeneration(subject));
    const recipient = await verifiedMfaRecipient(userId);
    const label = recipient?.toEmail || subject;
    res.setHeader("Cache-Control", "no-store");
    res.json({ secret, otpauthUrl: buildOtpauthUrl(secret, label), email: recipient?.toEmail });
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
    let userId: string | undefined;
    let pending: ReturnType<typeof verifyMfaPendingToken> = null;
    if (token) {
      pending = await validateMfaPendingToken(token);
      if (!pending || pending.mode !== "enroll") {
        res.status(401).json({ error: "Your sign-in session expired. Please sign in again." });
        return;
      }
      username = pending.u;
      userId = pending.uid;
    } else if (req.account) {
      username = req.account.username;
      userId = req.account.userId;
    }
    if (!username) {
      res.status(401).json({ error: "Sign in first to set up two-factor authentication." });
      return;
    }
    const subject = mfaSubject({ username, userId });
    const state = await getMfaState(subject);
    if (await checkPersonalMfaLockout(res, subject)) return;
    if (!state) {
      res.status(400).json({ error: "Two-factor setup has not been started. Scan the QR code first." });
      return;
    }
    if (state.enabled) {
      res.status(409).json({ error: "Two-factor authentication is already enabled." });
      return;
    }
    if (!verifyTotp(state.secret, code)) {
      await recordLoginFailure(`mfa:${subject}`);
      res.status(401).json({ error: "That code is not valid. Check your authenticator app and try again." });
      return;
    }
    const recoveryCodes = generateRecoveryCodes();
    const generation = pending?.g ?? await getMfaGeneration(subject);
    if (!await replaceMfaState(subject, state, {
      secret: state.secret,
      enabled: true,
      recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    }, generation)) {
      res.status(409).json({ error: "Two-factor setup changed. Start again." });
      return;
    }
    await logAdminEvent({ username, id: userId }, "mfa_enabled", userId ?? subject, userId ? "user" : "legacy-account");
    void notifyPersonalMfa(userId, true);
    await clearLoginFailures(`mfa:${subject}`);
    if (pending) {
      await completeMfaLogin(res, pending, clientIp(req), { recoveryCodes });
      return;
    }
    const sid = getPlatformSessionId(req);
    if (sid) await recordMfaSession(sid, subject, generation);
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
    const pending = await validateMfaPendingToken(token);
    if (!pending || pending.mode !== "verify") {
      res.status(401).json({ error: "Your sign-in session expired. Please sign in again." });
      return;
    }
    if (!code) {
      res.status(400).json({ error: "Enter the 6-digit code from your authenticator app." });
      return;
    }
    const subject = mfaSubject({ username: pending.u, userId: pending.uid });
    const mfaLockedMs = await lockoutRemainingMs("mfa:" + subject);
    if (mfaLockedMs > 0) {
      res.setHeader("Retry-After", Math.ceil(mfaLockedMs / 1000));
      res.status(429).json({ error: lockoutMessage(mfaLockedMs) });
      return;
    }
    const state = await getMfaState(subject);
    if (!state?.enabled) {
      res.status(401).json({ error: "Two-factor protection changed. Please sign in again." });
      return;
    }
    // "Trust this device for 30 days": on success, register the device and set
    // a signed, device-bound cookie so future logins here skip the code.
    const trustThisDevice = async () => {
      if (req.body?.trustDevice !== true) return;
      try {
        const label = (req.headers["user-agent"] as string | undefined)?.slice(0, 160) || "Unknown device";
        const { cookieValue, device } = await addTrustedDevice(subject, label, pending.g);
        res.cookie(TRUSTED_DEVICE_COOKIE, cookieValue, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: TRUSTED_DEVICE_TTL_MS,
        });
        await logAdminEvent({ username: pending.u, id: pending.uid }, "mfa_device_trusted", pending.uid ?? subject, pending.uid ? "user" : "legacy-account");
        // Security alert: fire-and-forget, never blocks login.
        // Recipient = earliest OWNER membership email, falling back to the
        // account's canonical email - same rule as reset-mfa alert.
        void (async () => {
          try {
            const recipient = await verifiedMfaRecipient(pending.uid);
            if (!recipient) return;
            const securitySettingsUrl = `${getAppBaseUrl()}/?account_section=security`;
            await sendNewTrustedDeviceEmail({
              ...recipient,
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
      await completeMfaLogin(res, pending, clientIp(req), undefined, trustThisDevice);
      return;
    }
    // Fall back to recovery codes (single-use).
    const remaining = consumeRecoveryCode(state, code);
    if (remaining !== null && await replaceMfaState(subject, state, { ...state, recoveryHashes: remaining }, pending.g)) {
      await logAdminEvent({ username: pending.u, id: pending.uid }, "mfa_recovery_code_used", pending.uid ?? subject, pending.uid ? "user" : "legacy-account");
      await completeMfaLogin(res, pending, clientIp(req), { recoveryCodesRemaining: remaining.length }, trustThisDevice);
      return;
    }
    // Wrong TOTP + not a recovery code: count towards the progressive lockout
    // for this account so an attacker with a stolen password cannot brute-force
    // the 6-digit code either. Scoped under "mfa:" so a fresh password login
    // (which clears the plain login counter) cannot reset the MFA lockout.
    await recordLoginFailure("mfa:" + subject);
    res.status(401).json({ error: "That code is not valid. Try again, or use a recovery code." });
  } catch {
    res.status(500).json({ error: "Could not verify the code" });
  }
});

// Current MFA status for the signed-in account.
router.get("/platform/mfa/status", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    const policy = await personalMfaPolicy(account);
    const state = await getMfaState(policy.subject);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      enabled: state?.enabled === true,
      required: policy.required,
      email: policy.email,
      recoveryCodesRemaining: state?.enabled ? state.recoveryHashes.length : 0,
    });
  } catch {
    res.status(500).json({ error: "Could not load two-factor status" });
  }
});

// Turn MFA off. Requires a currently-valid TOTP code, and is refused for master
// (admin) accounts - MFA is mandatory for them.
router.post("/platform/mfa/disable", requirePlatformAuth, loginLimiter, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    const policy = await personalMfaPolicy(account);
    if (policy.required) {
      res.status(403).json({ error: "Two-factor authentication is mandatory for master accounts and cannot be disabled." });
      return;
    }
    const state = await getMfaState(policy.subject);
    if (await checkPersonalMfaLockout(res, policy.subject)) return;
    if (!state?.enabled) {
      res.status(400).json({ error: "Two-factor authentication is not enabled." });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!verifyTotp(state.secret, code) && consumeRecoveryCode(state, code) === null) {
      await recordLoginFailure(`mfa:${policy.subject}`);
      res.status(401).json({ error: "Enter a valid code from your authenticator app to turn this off." });
      return;
    }
    if (!await replaceMfaState(policy.subject, state, null, policy.generation)) {
      res.status(409).json({ error: "Two-factor protection changed. Try again." });
      return;
    }
    res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: "/" });
    await logAdminEvent({ username: account.username, id: account.userId }, "mfa_disabled", account.userId ?? policy.subject, account.userId ? "user" : "legacy-account");
    void notifyPersonalMfa(account.userId, false);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not disable two-factor authentication" });
  }
});

// Replace recovery codes with 10 fresh ones. Requires MFA to be enabled and a
// currently-valid TOTP code (recovery codes are NOT accepted here - a stolen
// recovery code must not be able to mint fresh ones). Returns the new codes
// exactly once; all previously-issued codes stop working immediately.
router.post("/platform/mfa/recovery-codes", requirePlatformAuth, loginLimiter, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    const subject = mfaSubject(account);
    const state = await getMfaState(subject);
    if (await checkPersonalMfaLockout(res, subject)) return;
    if (!state?.enabled) {
      res.status(400).json({ error: "Two-factor authentication is not enabled." });
      return;
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!verifyTotp(state.secret, code)) {
      await recordLoginFailure(`mfa:${subject}`);
      res.status(401).json({ error: "Enter a valid code from your authenticator app to regenerate recovery codes." });
      return;
    }
    const recoveryCodes = generateRecoveryCodes();
    if (!await replaceMfaState(subject, state, {
      ...state,
      recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    })) {
      res.status(409).json({ error: "Recovery codes changed. Try again." });
      return;
    }
    await logAdminEvent({ username: account.username, id: account.userId }, "mfa_recovery_codes_regenerated", account.userId ?? subject, account.userId ? "user" : "legacy-account");
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
    const subject = mfaSubject(account);
    const devices = await listTrustedDevices(subject);
    const cookie = (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE];
    const payload = cookie ? verifyTrustedDeviceToken(cookie) : null;
    const currentId = payload && payload.u === subject ? payload.d : null;
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
    const removed = await revokeTrustedDevice(mfaSubject(account), id);
    if (!removed) {
      res.status(404).json({ error: "That device is no longer on your trusted list." });
      return;
    }
    // If the revoked device is this browser, drop its cookie too.
    const cookie = (req.cookies as Record<string, string> | undefined)?.[TRUSTED_DEVICE_COOKIE];
    const payload = cookie ? verifyTrustedDeviceToken(cookie) : null;
    if (payload && payload.d === id) res.clearCookie(TRUSTED_DEVICE_COOKIE, { path: "/" });
    await logAdminEvent({ username: account.username, id: account.userId }, "mfa_device_revoked", account.userId ?? mfaSubject(account), account.userId ? "user" : "legacy-account");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not remove the trusted device" });
  }
});

// --- Self-serve sign-up (public, no auth required) --------------------------
//
// Creates a new active agency account and sends an email-verification link.
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

    // Optional discount invite (beta/VIP link). Validate BEFORE creating the
    // account: a broken/expired link must fail loudly here, not silently
    // produce a full-price account.
    const discountToken = typeof req.body?.discountInvite === "string" ? req.body.discountInvite : "";
    let discountInvite: import("../lib/discount-invites").DiscountInvite | null = null;
    if (discountToken) {
      const looked = await getDiscountInvite(discountToken);
      if (!looked.invite) {
        const msg =
          looked.reason === "expired"
            ? "This invitation link has expired. Please ask for a new one."
            : looked.reason === "used"
              ? "This invitation link has already been used."
              : "This invitation link is not valid.";
        res.status(400).json({ error: msg });
        return;
      }
      // The invite is a bearer link, but it was issued FOR a specific email:
      // bind redemption to that address so a forwarded/leaked URL cannot be
      // used by someone else.
      if (looked.invite.email !== email.toLowerCase()) {
        res.status(400).json({
          error: "This invitation was issued for a different email address. Please sign up with the invited email.",
        });
        return;
      }
      discountInvite = looked.invite;
    }

    // Email must not identify either a legacy account or an existing human
    // identity. The transaction below repeats this check and relies on the
    // platform_users unique constraint for concurrent signups.
    if (await emailExists(email) || await getUserByEmail(email)) {
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

    const ph = hashPassword(password);
    const verifyToken = crypto.randomBytes(32).toString("hex");
    let username = baseSlug;
    let signup: { userId: string; companyId: string } | undefined;
    for (let attempt = 0; attempt < 100 && !signup; attempt++) {
      username = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
      try {
        signup = await createFreshPlatformSignup({
          email,
          name,
          passwordHash: ph,
          companyUsername: username,
          companyName,
          website,
          verificationToken: verifyToken,
        });
      } catch (err) {
        if (err instanceof PlatformSignupConflictError && err.conflict === "username") {
          continue;
        }
        // A concurrent request can win the platform_users unique constraint
        // after the preflight check. Its transaction has rolled this attempt
        // back; surface the same duplicate response rather than retrying with
        // a second account.
        if (
          (err instanceof PlatformSignupConflictError && err.conflict === "email")
          || await getUserByEmail(email)
          || await emailExists(email)
        ) {
          res.status(409).json({ error: "An account with that email already exists. Try signing in instead." });
          return;
        }
        logger.error({ err, username, email }, "signup: atomic provisioning failed");
        res.status(500).json({ error: "Sign-up failed. Please try again." });
        return;
      }
    }
    if (!signup) {
      logger.error({ email, baseSlug }, "signup: could not allocate a unique workspace name");
      res.status(500).json({ error: "Sign-up failed. Please try again." });
      return;
    }
    const { userId } = signup;

    // Redeem the discount invite: mark it used, stamp the account's discount
    // record (checkout attaches the coupon server-side), and pre-set the
    // invited account type. Awaited (not fire-and-forget) so a failure here
    // surfaces instead of leaving a full-price account behind.
    if (discountInvite) {
      try {
        await consumeDiscountInvite(discountInvite.token, username);
        await applyInviteAccountType(username, discountInvite.accountType);
      } catch (err) {
        logger.error({ err, username }, "signup: discount invite redemption failed");
        // The identity/workspace transaction is intentionally not undone here:
        // it cannot safely compensate after commit. The account remains
        // unverified and no session is issued.
        res.status(400).json({ error: "This invitation link could not be applied. Please contact support." });
        return;
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

// Public lookup for a discount-invite link: lets the signup page pre-fill the
// invitee's email, show the discount transparently, and lock the account type.
// Exposes only what the invited person was already told - never a coupon code.
router.get("/platform/discount-invite", async (req: Request, res: Response) => {
  try {
    const raw = typeof req.query.token === "string" ? req.query.token : "";
    if (!raw) { res.status(400).json({ error: "Missing invitation token." }); return; }
    const looked = await getDiscountInvite(raw);
    if (!looked.invite) {
      const msg =
        looked.reason === "expired"
          ? "This invitation link has expired. Please ask for a new one."
          : looked.reason === "used"
            ? "This invitation link has already been used."
            : "This invitation link is not valid.";
      res.status(404).json({ error: msg, reason: looked.reason });
      return;
    }
    res.json({
      ok: true,
      email: looked.invite.email,
      accountType: looked.invite.accountType,
      percent: looked.invite.percent,
      label: looked.invite.label,
    });
  } catch (err) {
    logger.error({ err }, "discount-invite: lookup route failed");
    res.status(500).json({ error: "Could not check this invitation. Please try again." });
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

    // Resolve the owner's workspace before consuming the token. The signup
    // identity owns exactly one freshly-created account, but explicitly tying
    // the verification to the owner membership + matching account email keeps
    // a later workspace membership from becoming an accidental target.
    const [verificationUser] = await db
      .select({
        email: platformUsersTable.email,
        emailVerified: platformUsersTable.emailVerified,
        passwordHash: platformUsersTable.passwordHash,
        googleId: platformUsersTable.googleId,
        microsoftId: platformUsersTable.microsoftId,
      })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, row.userId))
      .limit(1);
    const ownerEmail = verificationUser?.email?.trim().toLowerCase();
    if (!ownerEmail) {
      res.redirect(`${origin}/?verify_status=error`);
      return;
    }
    const [targetMeta] = await db
      .select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, emailVerificationTargetKey(token)))
      .limit(1);
    let target: { userId: string; companyId: string; companySlug: string } | null = null;
    if (targetMeta) {
      try {
        const parsed = JSON.parse(targetMeta.value) as {
          userId?: unknown;
          companyId?: unknown;
          companySlug?: unknown;
        } | null;
        if (
          !parsed
          || typeof parsed !== "object"
          || typeof parsed.userId !== "string"
          || typeof parsed.companyId !== "string"
          || typeof parsed.companySlug !== "string"
          || parsed.userId !== row.userId
        ) {
          res.redirect(`${origin}/?verify_status=error`);
          return;
        }
        target = {
          userId: parsed.userId,
          companyId: parsed.companyId,
          companySlug: normUsername(parsed.companySlug),
        };
      } catch {
        res.redirect(`${origin}/?verify_status=error`);
        return;
      }
    }

    const memberships = await db
      .select({
        companySlug: platformMembershipsTable.companySlug,
        companyId: platformMembershipsTable.companyId,
        setupComplete: platformCompaniesTable.setupComplete,
      })
      .from(platformMembershipsTable)
      .innerJoin(
        platformCompaniesTable,
        eq(platformMembershipsTable.companyId, platformCompaniesTable.id),
      )
      .innerJoin(
        platformAccountsTable,
        eq(platformMembershipsTable.companySlug, platformAccountsTable.username),
      )
      .where(and(
        eq(platformMembershipsTable.userId, row.userId),
        eq(platformMembershipsTable.role, "owner"),
        sql`lower(${platformAccountsTable.email}) = ${ownerEmail}`,
        isNull(platformAccountsTable.parent),
        ...(target
          ? [
              eq(platformMembershipsTable.companyId, target.companyId),
              eq(platformMembershipsTable.companySlug, target.companySlug),
            ]
          : []),
      ))
      .orderBy(desc(platformMembershipsTable.createdAt));
    // New signups carry an exact server-owned target. Historical tokens have
    // no metadata, so fail closed if their owner identity has become
    // ambiguous instead of silently selecting an arbitrary workspace.
    const mem = target ? memberships[0] : memberships.length === 1 ? memberships[0] : undefined;
    if (!mem) {
      res.redirect(`${origin}/?verify_status=error`);
      return;
    }
    if (await isAgencyPartnerClient(mem.companySlug)) {
      res.redirect(`${origin}/?verify_status=managed`);
      return;
    }
    const historicalSignupRepair =
      target == null
      && verificationUser.emailVerified === false
      && verificationUser.passwordHash != null
      && verificationUser.googleId == null
      && verificationUser.microsoftId == null;

    // Claim the token atomically so concurrent clicks cannot both create a
    // first session.
    const [claimed] = await db
      .update(platformEmailVerificationsTable)
      .set({ usedAt: new Date() })
      .where(and(
        eq(platformEmailVerificationsTable.token, token),
        isNull(platformEmailVerificationsTable.usedAt),
      ))
      .returning({ token: platformEmailVerificationsTable.token });
    if (!claimed) {
      res.redirect(`${origin}/?verify_status=expired`);
      return;
    }

    // Mark user verified.
    await db
      .update(platformUsersTable)
      .set({ emailVerified: true })
      .where(eq(platformUsersTable.id, row.userId));

    // New signup/resend tokens carry an explicit target. A historical token
    // may repair only in the narrow, proven-false password-signup case above;
    // arbitrary legacy/SSO/invited verification rows never repair NULL.
    if (target || historicalSignupRepair) {
      await db
        .update(platformCompaniesTable)
        .set({ setupComplete: false })
        .where(and(
          eq(platformCompaniesTable.id, mem.companyId),
          isNull(platformCompaniesTable.setupComplete),
        ));
    }
    // Issue the first session
    const rawIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress;
    const sid = await createSignedInSession(mem.companySlug, rawIp, row.userId, mem.companyId);
    setPlatformCookie(res, sid);
    res.redirect(`${origin}/?needs_setup=${target != null || historicalSignupRepair || mem.setupComplete === false}`);
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
      if (user && user.emailVerified === false) {
        const token = crypto.randomBytes(32).toString("hex");
        await db.transaction(async (tx) => {
          await tx
            .delete(platformEmailVerificationsTable)
            .where(eq(platformEmailVerificationsTable.userId, user.id));
          await tx.insert(platformEmailVerificationsTable).values({
            token,
            userId: user.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          });
          const ownerWorkspaces = await tx
            .select({
              companyId: platformMembershipsTable.companyId,
              companySlug: platformMembershipsTable.companySlug,
            })
            .from(platformMembershipsTable)
            .innerJoin(
              platformCompaniesTable,
              eq(platformMembershipsTable.companyId, platformCompaniesTable.id),
            )
            .innerJoin(
              platformAccountsTable,
              eq(platformMembershipsTable.companySlug, platformAccountsTable.username),
            )
            .where(and(
              eq(platformMembershipsTable.userId, user.id),
              eq(platformMembershipsTable.role, "owner"),
              sql`lower(${platformAccountsTable.email}) = ${email}`,
              isNull(platformAccountsTable.parent),
            ))
            .limit(2);
          if (ownerWorkspaces.length === 1) {
            await tx.insert(platformMetaTable).values({
              key: emailVerificationTargetKey(token),
              value: JSON.stringify({
                userId: user.id,
                companyId: ownerWorkspaces[0]!.companyId,
                companySlug: ownerWorkspaces[0]!.companySlug,
              }),
            });
          }
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
      let partnerOnly = false;
      if (user) {
        // Agency partner clients are permanently managed - never send a reset
        // link to a human whose ONLY workspaces are partner clients. Keep the
        // response identical (ok: true) so addresses cannot be enumerated.
        const memberships = await db
          .select({ companySlug: platformMembershipsTable.companySlug })
          .from(platformMembershipsTable)
          .where(eq(platformMembershipsTable.userId, user.id));
        if (memberships.length > 0) {
          partnerOnly = true;
          for (const mem of memberships) {
            if (!(await isAgencyPartnerClient(normUsername(mem.companySlug)))) {
              partnerOnly = false;
              break;
            }
          }
        }
      }
      if (user && !partnerOnly) {
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

    const memberships = await db
      .select({ companySlug: platformMembershipsTable.companySlug, role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, row.userId));

    // Agency partner clients are permanently managed: never sync a password
    // into their slug credential store, and refuse the reset outright when the
    // human's ONLY workspaces are partner clients (multi-workspace humans may
    // still reset the password they use for their other workspaces).
    const partnerClientSlugs = new Set<string>();
    for (const mem of memberships) {
      if (await isAgencyPartnerClient(normUsername(mem.companySlug))) {
        partnerClientSlugs.add(mem.companySlug);
      }
    }
    if (memberships.length > 0 && partnerClientSlugs.size === memberships.length) {
      res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
      return;
    }

    const ph = hashPassword(password);
    await db
      .update(platformUsersTable)
      .set({ passwordHash: ph })
      .where(eq(platformUsersTable.id, row.userId));

    // Keep the legacy platform_accounts credential store in sync so slug-based
    // logins keep working with the new password.
    for (const mem of memberships) {
      if ((mem.role === "owner" || mem.role === "admin") && mem.companySlug !== DEFAULT_ADMIN_USERNAME && !partnerClientSlugs.has(mem.companySlug)) {
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
        .where(and(eq(platformSessionsTable.username, normUsername(mem.companySlug)), isNull(platformSessionsTable.userId)));
    }

    // Clear MFA trusted devices for every associated account so all devices
    // must re-enter a TOTP code on next login after a password reset.
    await clearTrustedDevices(mfaSubject({ userId: row.userId, username: "" }));

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
    // Guardrail: never allow password changes while impersonating an account.
    if (await isImpersonatedRequest(req)) {
      res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
      return;
    }
    // Agency partner clients are permanently managed - they never hold their
    // own credentials, so a leftover legacy session cannot mint a password.
    if (await isAgencyPartnerClient(normUsername(req.account!.username))) {
      res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
      return;
    }
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
        if ((mem.role === "owner" || mem.role === "admin") && mem.companySlug !== DEFAULT_ADMIN_USERNAME) {
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
            isNull(platformSessionsTable.userId),
            currentSid ? ne(platformSessionsTable.sid, currentSid) : sql`true`,
          ));
      }

      // Clear MFA trusted devices for every associated account so all devices
      // must re-enter a TOTP code on next login after a password change.
      await clearTrustedDevices(mfaSubject({ userId: userRow.id, username }));
      if (currentSid && (await getMfaState(mfaSubject({ userId: userRow.id, username })))?.enabled) {
        await recordMfaSession(currentSid, mfaSubject({ userId: userRow.id, username }), newVersion);
      }
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
    // Guardrail: never allow email changes while impersonating an account.
    if (await isImpersonatedRequest(req)) {
      res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
      return;
    }
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
      // Master Technical / Operational Support members cannot manage accounts.
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }
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

    // Agency partner clients are permanently managed - never issue them a
    // set-password link, even from an SSO-authenticated session.
    if (await isAgencyPartnerClient(normUsername(actor.username))) {
      res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
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
    const account = req.account!;
    const username = normUsername(account.username);
    const setupCompany = await getCompanyBySlug(username);
    const membershipRole = account.membershipRole;
    if (membershipRole !== undefined && membershipRole !== null && membershipRole !== "owner") {
      res.status(403).json({ error: "Only the account owner can choose the account type." });
      return;
    }
    // New signups historically start with the default agency role before email
    // verification marks setupComplete=false. The setup flag, not that default
    // role, is therefore the authority on whether this one-time choice is open.
    if (!(await isOnboardingOwner(req, setupCompany ?? null))) {
      res.status(409).json({ error: "Your account type has already been selected." });
      return;
    }
    const accountType = typeof req.body?.accountType === "string" ? req.body.accountType : "";
    if (accountType !== "agency" && accountType !== "client") {
      res.status(400).json({ error: "accountType must be 'agency' or 'client'." });
      return;
    }
    const transition = await transitionWorkspaceAccountType(username, accountType);
    if (!transition.ok) {
      res.status(transition.reason === "missing" ? 404 : 400).json({
        error: transition.reason === "seat_limit"
          ? `This workspace has ${transition.seatsUsed} team seats in use, above its Client limit of ${transition.seatLimit}. Remove team members or pending invites before changing account type.`
          : "Account workspace not found.",
        ...(transition.reason === "seat_limit" ? { limitReached: true } : {}),
      });
      return;
    }
    if (accountType !== "client") {
      await sweepTeamViolationsForCompany(username, {
        username: account.username,
        id: account.userId,
      });
    }
    await writeOnboardingState(username, { step: "workspace_basics" });
    logger.info({ username, accountType }, "setup/account-type: role set");
    res.json({ ok: true, role: accountType });
  } catch (err) {
    logger.error({ err }, "setup/account-type: unexpected error");
    res.status(500).json({ error: "Failed to set account type." });
  }
});

router.get("/platform/onboarding", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const username = normUsername(req.account!.username);
    const company = await getCompanyBySlug(username);
    if (!(await isOnboardingOwner(req, company))) {
      res.status(409).json({ error: "This workspace does not require onboarding." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    const state = await resolvedOnboardingState(username);
    let existingProject: { id: string; name: string } | null = null;
    if (state.step === "first_project") {
      const [project] = await db.select({ id: projectsTable.id, name: projectsTable.name })
        .from(projectsTable)
        .where(and(eq(projectsTable.owner, username), isNull(projectsTable.deletedAt)))
        .orderBy(desc(projectsTable.updatedAt))
        .limit(1);
      existingProject = project ?? null;
    }
    res.json({ state, existingProject, role: normalizeRole(req.account!.role) });
  } catch (err) {
    logger.error({ err }, "onboarding: failed to load state");
    res.status(500).json({ error: "Could not load account setup." });
  }
});

router.post("/platform/onboarding/workspace-basics", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const username = normUsername(req.account!.username);
    const company = await getCompanyBySlug(username);
    if (!(await isOnboardingOwner(req, company))) {
      res.status(409).json({ error: "This workspace does not require onboarding." });
      return;
    }
    const current = await resolvedOnboardingState(username);
    if (current.step !== "workspace_basics") {
      res.status(409).json({ error: "Complete the current setup step first.", state: current });
      return;
    }
    const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim().slice(0, 64) : "";
    let website = typeof req.body?.website === "string" ? req.body.website.trim().slice(0, 200) : "";
    if (!displayName || !website) {
      res.status(400).json({ error: "Enter your company name and website." });
      return;
    }
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      new URL(website);
    } catch {
      res.status(400).json({ error: "Enter a valid website address." });
      return;
    }
    await setDisplayName(username, displayName);
    await db.update(platformAccountsTable).set({ website }).where(eq(platformAccountsTable.username, username));
    await db.update(platformCompaniesTable).set({ displayName, website }).where(eq(platformCompaniesTable.slug, username));
    const state: OnboardingState = { step: "access" };
    await writeOnboardingState(username, state);
    res.json({ ok: true, state });
  } catch (err) {
    logger.error({ err }, "onboarding: failed to save company basics");
    res.status(500).json({ error: "Could not save company details." });
  }
});

router.post("/platform/onboarding/access", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const username = normUsername(req.account!.username);
    const company = await getCompanyBySlug(username);
    if (!(await isOnboardingOwner(req, company))) {
      res.status(409).json({ error: "This workspace does not require onboarding." });
      return;
    }
    const current = await resolvedOnboardingState(username);
    if (current.step !== "access") {
      res.status(409).json({ error: "Complete the current setup step first.", state: current });
      return;
    }
    const choice = req.body?.choice;
    if (choice !== "beta" && choice !== "paid") {
      res.status(400).json({ error: "Choose free beta or paid access." });
      return;
    }
    let state: OnboardingState;
    if (choice === "beta") {
      const plan: PlanKey = normalizeRole(req.account!.role) === "agency" ? "agency" : "inhouse";
      const billing = await startBetaTrial(username, plan);
      if (!billing || getBetaTrialSummary(billing).status !== "active") {
        res.status(409).json({ error: "This workspace is not eligible for a new beta trial." });
        return;
      }
      state = { step: "first_project", accessChoice: "beta" };
    } else {
      state = { step: "billing", accessChoice: "paid" };
    }
    await writeOnboardingState(username, state);
    res.json({ ok: true, state });
  } catch (err) {
    logger.error({ err }, "onboarding: failed to choose access");
    res.status(500).json({ error: "Could not activate your access choice." });
  }
});

router.post("/platform/onboarding/complete", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const username = normUsername(req.account!.username);
    const company = await getCompanyBySlug(username);
    if (!(await isOnboardingOwner(req, company))) {
      res.status(409).json({ error: "This workspace does not require onboarding." });
      return;
    }
    const current = await resolvedOnboardingState(username);
    if (current.step !== "first_project") {
      res.status(409).json({ error: "Complete the current setup step first.", state: current });
      return;
    }
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId.trim() : "";
    if (projectId) {
      // Preserve compatibility for an older browser that already created its
      // first project before this account-only completion flow was introduced.
      const [project] = await db.select({ id: projectsTable.id }).from(projectsTable)
        .where(and(eq(projectsTable.id, projectId), eq(projectsTable.owner, username), isNull(projectsTable.deletedAt)))
        .limit(1);
      if (!project) {
        res.status(409).json({ error: "Your project must be saved before setup can finish." });
        return;
      }
    } else {
      // New onboarding ends before project creation. Revalidate the selected
      // access server-side so callers cannot skip the beta/payment step by
      // posting directly to this endpoint.
      const billing = await getBillingState(username);
      const accessIsActive = current.accessChoice === "paid"
        ? hasPaidSubscription(billing)
        : current.accessChoice === "beta" && getBetaTrialSummary(billing).status === "active";
      if (!accessIsActive) {
        res.status(409).json({ error: "Activate beta or paid access before finishing account setup.", state: current });
        return;
      }
    }
    await db.transaction(async (tx) => {
      await tx.update(platformCompaniesTable).set({ setupComplete: true })
        .where(and(eq(platformCompaniesTable.slug, username), eq(platformCompaniesTable.setupComplete, false)));
      await tx.delete(platformMetaTable).where(eq(platformMetaTable.key, onboardingKey(username)));
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "onboarding: failed to complete");
    res.status(500).json({ error: "Could not finish account setup." });
  }
});

// --- Settings: change account type (post-setup) ----------------------------
//
// Distinct from /platform/setup/account-type: this endpoint NEVER touches
// setupComplete and is gated to the account owner (not just any authed session).

router.post("/platform/settings/account-type", requirePlatformAuth, async (req: Request, res: Response) => {
  try {
    const account = req.account!;
    // Agency/client accounts may switch type, and legacy "user" accounts
    // (created before account types existed) may pick one for the first
    // time. Admins are excluded.
    const currentRole = normalizeRole(account.role);
    if (currentRole !== "agency" && currentRole !== "client" && currentRole !== "user") {
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

    // setupComplete is intentionally NOT touched on settings changes.
    const transition = await transitionWorkspaceAccountType(username, accountType);
    if (!transition.ok) {
      res.status(transition.reason === "missing" ? 404 : 400).json({
        error: transition.reason === "seat_limit"
          ? `This workspace has ${transition.seatsUsed} team seats in use, above its Client limit of ${transition.seatLimit}. Remove team members or pending invites before changing account type.`
          : "Account workspace not found.",
        ...(transition.reason === "seat_limit" ? { limitReached: true } : {}),
      });
      return;
    }
    if (accountType !== "client") {
      await sweepTeamViolationsForCompany(username, {
        username: account.username,
        id: account.userId,
      });
    }

    logger.info({ username, accountType }, "settings/account-type: role updated");
    // Confirmation email to the owner - a type change reshapes the whole
    // dashboard, so it warrants the same notice as other account changes.
    // req.account does not carry the email, so resolve it: prefer the human
    // user record, fall back to the legacy account row.
    if (currentRole !== accountType) {
      void (async () => {
        try {
          const owner = await getAccountOwnerContact(username);
          if (owner) {
            await sendAccountTypeChangedEmail({
              toEmail: owner.email,
              contactName: owner.name,
              previousType: currentRole,
              newType: accountType,
              changedByAdmin: false,
            });
          }
        } catch (err) {
          logger.warn({ err, username }, "settings/account-type: failed to send confirmation email (non-fatal)");
        }
      })();
    }
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
        loginUrl: getAppBaseUrl(),
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

// Carries a discount invite token across an SSO (Google/Microsoft) round-trip
// so the invite can be redeemed when the new account is created.
const DISCOUNT_INVITE_COOKIE = "aio_discount_invite";

function setDiscountInviteCookie(res: Response, token: string): void {
  res.cookie(DISCOUNT_INVITE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });
}

// Read and clear the discount invite cookie. Returns empty string when absent.
function popDiscountInviteCookie(req: Request, res: Response): string {
  const token = (req.cookies as Record<string, string>)?.[DISCOUNT_INVITE_COOKIE] ?? "";
  res.clearCookie(DISCOUNT_INVITE_COOKIE, { path: "/" });
  return token;
}

function setInviteCookie(res: Response, token: string): void {
  res.cookie(INVITE_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/",
  });
}

// If the SSO round-trip carried a team-invite token, consume it for this
// email + SSO identity. A true result means the response was completed, a
// string is a terminal error redirect, and null falls through to normal SSO.
async function handleSsoInvite(
  req: Request,
  res: Response,
  profile: { email: string; name: string; googleId?: string; microsoftId?: string },
): Promise<string | true | null> {
  const token = (req.cookies as Record<string, string>)?.[INVITE_COOKIE] ?? "";
  if (!token) return null;
  res.clearCookie(INVITE_COOKIE, { path: "/" });
  const invite = await getValidInvite(token);
  if (!invite) {
    // Logs the specific failure reason (not found / used / revoked / expired).
    await getInviteInvalidReason(token);
    return `/?oauth_status=error&oauth_msg=invite_invalid`;
  }
  if (await isAgencyPartnerClient(invite.companySlug)) {
    return `/?oauth_status=managed`;
  }
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

  // Invited users skip account-type selection, not their personal MFA.
  const account = await getAccount(invite.companySlug);
  if (!account) return `/?oauth_status=error&oauth_msg=invite_invalid`;
  await finishOauthLoginOrChallenge(req, res, getFrontendOrigin(req), {
    username: invite.companySlug, role: account.role, userId: user.id,
    activeCompanyId: invite.companyId, needsSetup: false,
  });
  return true;
}

// Returns the canonical host for this deployment.
// CANONICAL_DOMAIN (e.g. "aiofusion.ai") takes highest priority so the
// OAuth callback URL and session cookie domain are always on the domain users
// actually browse to. Falls back to REPLIT_DOMAINS, then the request host.
function getCanonicalHost(req: Request): string {
  // Never derive staging OAuth URLs from copied secrets, preview domains, or
  // request headers: all callbacks must remain in the isolated environment.
  if (isStagingDeployment()) return STAGING_CANONICAL_HOST;

  const canonical = normalizeCanonicalDomain(process.env.CANONICAL_DOMAIN);
  if (canonical) return canonical;
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const first = normalizeCanonicalDomain(replitDomains.split(",")[0]);
    if (first) return first;
  }
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  const hostname = host.split(":")[0];
  if (hostname) return hostname;
  return PRODUCTION_CANONICAL_HOST;
}

function getGoogleCallbackUrl(req: Request): string {
  return `https://${getCanonicalHost(req)}/api/platform/auth/google/callback`;
}

function getFrontendOrigin(req: Request): string {
  const deployedOrigin = getDeployedAppOrigin();
  if (deployedOrigin) return deployedOrigin;
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Completing sign-in\u2026</title>` +
    `<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc}` +
    `p{color:#374151;font-size:15px}</style></head><body>` +
    `<p>Completing sign-in, please wait\u2026</p>` +
    `<form id="f" method="POST" action="${safeAction}">` +
    `<input type="hidden" name="code" value="${safeCode}">` +
    `<input type="hidden" name="state" value="${safeState}">` +
    // No-JS fallback: a real submit button inside the form. Scanners still do
    // not click buttons, so the one-time code remains safe; human users
    // without JavaScript can complete the hop themselves.
    `<noscript><p style="text-align:center">JavaScript is off, so press the button to finish signing in.</p>` +
    `<p style="text-align:center"><button type="submit" style="padding:10px 28px;border-radius:10px;border:0;background:#C8497A;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Continue</button></p>` +
    `<p style="text-align:center"><a href="/?oauth_status=error&amp;oauth_msg=no_js" style="color:#374151;font-size:13px">Return to sign-in</a></p></noscript>` +
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
  // Discount invite flow: carry the discount token across the OAuth round-trip
  // so it can be redeemed when the new account is created on return.
  if (typeof req.query.discount === "string" && req.query.discount.trim()) {
    setDiscountInviteCookie(res, req.query.discount.trim());
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
router.get("/platform/auth/google/link", requirePlatformAuth, async (req: Request, res: Response) => {
  if (req.account && await isAgencyPartnerClient(req.account.username)) {
    res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
    return;
  }
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

router.get("/platform/auth/google/delete-confirmation", requirePlatformAuth, async (req: Request, res: Response) => {
  if (await isImpersonatedRequest(req)) {
    res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
    return;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const actorUser = req.account ? await getPasswordlessOwnerForSsoDelete(req.account) : null;
  if (!clientId) {
    res.status(503).json({ error: "Google re-authentication is not available." });
    return;
  }
  if (!actorUser?.googleId) {
    res.status(403).json({ error: "Google confirmation is only available to passwordless workspace owners." });
    return;
  }
  const state = `delete:${crypto.randomBytes(16).toString("hex")}`;
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/",
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "login",
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
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // The global CSP (script-src 'self') blocks inline scripts, which would
  // silently break the auto-submit form. Re-issue the header with a nonce.
  res.setHeader("Content-Security-Policy", cspHeaderWithScriptNonce(nonce));
  res.status(200).send(buildOauthInterstitial(postUrl, code, state, nonce));
});

// POST callback: the real code redemption, triggered by the interstitial's
// auto-submit form (or the no-JS Continue button). Some aggressive scanners
// do submit visible forms, so known scanner user-agents are rejected here
// too - they get an empty 200 and the one-time code stays unredeemed.
router.post("/platform/auth/google/callback", async (req: Request, res: Response) => {
  if (SCANNER_UA_RE.test(req.headers["user-agent"] ?? "")) { res.status(200).end(); return; }
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
    const userInfo = await userInfoRes.json() as { email?: string; verified_email?: boolean; name?: string; given_name?: string; id?: string; picture?: string };
    if (!userInfo.email) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=no_email`);
      return;
    }
    const googleId = userInfo.id ?? "";
    if (!googleId || (userInfo.verified_email !== true && !await getUserByGoogleId(googleId))) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=unverified_identity`);
      return;
    }

    if (state.startsWith("delete:")) {
      const actor = req.account;
      const actorUser = actor ? await getPasswordlessOwnerForSsoDelete(actor) : null;
      if (!actor || !actorUser || !googleId || actorUser.googleId !== googleId) {
        res.redirect(`${origin}/?delete_reauth=${actorUser ? "identity_mismatch" : "not_allowed"}`);
        return;
      }
      if (await isImpersonatedRequest(req)) {
        res.redirect(`${origin}/?delete_reauth=impersonation_blocked`);
        return;
      }
      await issueDeleteConfirmation(res, actorUser.id, "google");
      res.redirect(`${origin}/?delete_reauth=ok`);
      return;
    }

    // --- Google account link flow (logged-in user linking their account) ----
    // linkUsername arrives via the aio_oauth_link cookie which survives the
    // GET interstitial unchanged and is cleared above.
    if (linkUsername) {
      const linkAccount = await getAccount(linkUsername);
      if (
        !linkAccount
        || !req.account?.userId
        || normUsername(req.account.username) !== normUsername(linkUsername)
      ) {
        res.redirect(`${origin}/?link_google=error`);
        return;
      }
      if (await isAgencyPartnerClient(linkAccount.username)) {
        res.redirect(`${origin}/?link_google=error`);
        return;
      }
      const [linkUser] = await db
        .select()
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, req.account.userId))
        .limit(1);
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
      await maybeImportGoogleAvatar(
        linkUser.id,
        linkAccount.username,
        req.account.membershipRole == null || req.account.membershipRole === "owner",
        userInfo.picture,
      );
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
        if (inviteRedirect !== true) res.redirect(`${origin}${inviteRedirect}`);
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
    if (existingUser && userInfo.verified_email === true && existingUser.email?.toLowerCase() === userInfo.email.toLowerCase()) {
      await db.update(platformUsersTable).set({ emailVerified: true }).where(eq(platformUsersTable.id, existingUser.id));
    }

    // AIO Fusion staff use the existing Master workspace rather than creating
    // a customer workspace or entering account-type setup.
    if (userInfo.verified_email === true && isAioFusionStaffEmail(userInfo.email)) {
      const staff = await provisionAioFusionStaffMembership({
        email: userInfo.email,
        name: userInfo.name || userInfo.given_name || userInfo.email.split("@")[0],
        googleId: googleId || undefined,
      });
      if (!staff) {
        res.redirect(`${origin}/?oauth_status=error&oauth_msg=master_access_removed`);
        return;
      }
      await finishOauthLoginOrChallenge(req, res, origin, {
        ...staff,
        needsSetup: false,
      });
      return;
    }

    // Step 2: if an existing user is found, route them to their active workspace
    // via platform_memberships - this is the new source of truth for
    // user → company association. The platform_accounts row is checked only for
    // status (active/suspended/pending) and is NOT used to pick the company.
    if (existingUser) {
      const displayName = userInfo.name || userInfo.given_name || userInfo.email.split("@")[0];
      const membership = await pickLoginMembership(existingUser.id);
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
          if (await isAgencyPartnerClient(account.username)) {
            res.redirect(`${origin}/?oauth_status=managed`);
            return;
          }
          // Active - link googleId to user record then create session.
          let userId: string | undefined;
          let activeCompanyId: string | undefined;
          let oauthCo: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
          try {
            userId = existingUser.id;
            if (googleId) await linkGoogleId(userId, googleId);
            oauthCo = await getCompanyBySlug(account.username);
            activeCompanyId = oauthCo?.id;
          } catch {
            // Non-fatal.
            userId = existingUser.id;
          }
          if (userId) {
            await maybeImportGoogleAvatar(
              userId,
              account.username,
              membership.role === "owner",
              userInfo.picture,
            );
          }
          await finishOauthLoginOrChallenge(req, res, origin, {
            username: account.username,
            role: account.role,
            userId,
            activeCompanyId,
            needsSetup: await isEligibleForOnboarding({ username: account.username, role: account.role, userId, membershipRole: membership.role }),
          });
          return;
        }
      }
    }

    // A retained identity without a current membership was revoked. Never
    // bootstrap its old account email back into a membership.
    if (existingUser) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=membership_required`);
      return;
    }
    // Step 3: no existing user or no membership - look up by email in
    // platform_accounts as fallback (covers legacy accounts not yet backfilled).
    const [existing] = await db
      .select()
      .from(platformAccountsTable)
      .where(ilike(platformAccountsTable.email, userInfo.email))
      .limit(1);
    if (existing) {
      if (existing.username === DEFAULT_ADMIN_USERNAME) {
        res.redirect(`${origin}/?oauth_status=error&oauth_msg=membership_required`);
        return;
      }
      if (existing.status === "suspended") {
        res.redirect(`${origin}/?oauth_status=suspended`);
        return;
      }
      if (await isAgencyPartnerClient(existing.username)) {
        res.redirect(`${origin}/?oauth_status=managed`);
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
      if (userId) await maybeImportGoogleAvatar(userId, existing.username, true, userInfo.picture);
      await finishOauthLoginOrChallenge(req, res, origin, {
        username: existing.username,
        role: existing.role,
        userId,
        activeCompanyId,
        needsSetup: await isEligibleForOnboarding({ username: existing.username, role: existing.role, userId, membershipRole: existing.role === "admin" ? "admin" : "owner" }),
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
      value: JSON.stringify({ ownerName: displayName }),
    }).onConflictDoUpdate({
      target: platformMetaTable.key,
      set: { value: JSON.stringify({ ownerName: displayName }) },
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
        companySetupComplete: false,
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
    // ensurePlatformUser sets this explicitly for a new SSO workspace. Keep
    // the idempotent update as a repair for rows created by an older build.
    if (newActiveCompanyId) {
      try {
        await db.update(platformCompaniesTable)
          .set({ setupComplete: false })
          .where(and(eq(platformCompaniesTable.id, newActiveCompanyId), isNull(platformCompaniesTable.setupComplete)));
      } catch { /* non-fatal */ }
    }
    if (newUserId) await maybeImportGoogleAvatar(newUserId, username, false, userInfo.picture);
    void sendNewSignupAlert({ name: displayName, email: userInfo.email, companyName: null, username, method: "google" });
    // Discount invite: redeem any discount token that was carried across the
    // OAuth round-trip in the discount-invite cookie. Fail-soft - a redemption
    // failure must never block the sign-in.
    const discountToken = popDiscountInviteCookie(req, res);
    if (discountToken) {
      try {
        const { getDiscountInvite: getInvite, consumeDiscountInvite: consumeInvite, applyInviteAccountType: applyType } = await import("../lib/discount-invites");
        const looked = await getInvite(discountToken);
        // getDiscountInvite already filters out used/expired invites.
        // Require an exact email match (case-insensitive) so a forwarded or
        // intercepted invite URL cannot be redeemed by an unintended account.
        if (looked.invite && looked.invite.email.toLowerCase() === userInfo.email.toLowerCase()) {
          await consumeInvite(looked.invite.token, username);
          await applyType(username, looked.invite.accountType);
        } else if (looked.invite) {
          logger.warn({ username, inviteEmail: looked.invite.email, ssoEmail: userInfo.email }, "google-sso: discount invite email mismatch - invite not consumed (non-fatal)");
        }
      } catch (err) {
        logger.warn({ err, username }, "google-sso: could not redeem discount invite for new account (non-fatal)");
      }
    }
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

router.get("/platform/auth/microsoft", async (req: Request, res: Response) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const origin = getFrontendOrigin(req);
  if (!clientId) {
    res.redirect(`${origin}/?oauth_status=error&oauth_msg=microsoft_not_configured`);
    return;
  }
  const action = typeof req.query.action === "string" ? req.query.action : "login";
  if (action === "link") {
    if (!req.account) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=not_signed_in`);
      return;
    }
    if (await isAgencyPartnerClient(req.account.username)) {
      res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
      return;
    }
  }
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
  // Discount invite flow: carry the discount token across the OAuth round-trip.
  if (typeof req.query.discount === "string" && req.query.discount.trim()) {
    setDiscountInviteCookie(res, req.query.discount.trim());
  }
  res.redirect(`${MICROSOFT_AUTH_ENDPOINT}?${params.toString()}`);
});

router.get("/platform/auth/microsoft/delete-confirmation", requirePlatformAuth, async (req: Request, res: Response) => {
  if (await isImpersonatedRequest(req)) {
    res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
    return;
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const actorUser = req.account ? await getPasswordlessOwnerForSsoDelete(req.account) : null;
  if (!clientId) {
    res.status(503).json({ error: "Microsoft re-authentication is not available." });
    return;
  }
  if (!actorUser?.microsoftId) {
    res.status(403).json({ error: "Microsoft confirmation is only available to passwordless workspace owners." });
    return;
  }
  const state = `delete:${crypto.randomBytes(16).toString("hex")}`;
  const redirectUri = `${getAppBaseUrl()}/api/platform/auth/microsoft/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile email User.Read",
    state,
    response_mode: "query",
    prompt: "login",
  });
  res.cookie(MS_STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600_000, path: "/",
  });
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
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  // Global CSP blocks inline scripts - add a per-response nonce (see Google callback).
  res.setHeader("Content-Security-Policy", cspHeaderWithScriptNonce(nonce));
  res.status(200).send(buildOauthInterstitial(postUrl, code, state, nonce));
});

// POST callback: actual code redemption for Microsoft. Scanner user-agents
// are rejected before redemption (see the Google POST callback).
router.post("/platform/auth/microsoft/callback", async (req: Request, res: Response) => {
  if (SCANNER_UA_RE.test(req.headers["user-agent"] ?? "")) { res.status(200).end(); return; }
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

    if (action === "delete") {
      const actor = req.account;
      const actorUser = actor ? await getPasswordlessOwnerForSsoDelete(actor) : null;
      if (!actor || !actorUser || actorUser.microsoftId !== microsoftId) {
        res.redirect(`${origin}/?delete_reauth=${actorUser ? "identity_mismatch" : "not_allowed"}`);
        return;
      }
      if (await isImpersonatedRequest(req)) {
        res.redirect(`${origin}/?delete_reauth=impersonation_blocked`);
        return;
      }
      await issueDeleteConfirmation(res, actorUser.id, "microsoft");
      res.redirect(`${origin}/?delete_reauth=ok`);
      return;
    }

    // --- Link action: attach Microsoft to the current session account --------
    // action is extracted from state above; req.account comes from the aio_sid
    // session cookie that the browser carries alongside the POST.
    if (action === "link") {
      if (!req.account) { res.redirect(`${origin}/?oauth_status=error&oauth_msg=not_signed_in`); return; }
      if (await isAgencyPartnerClient(req.account.username)) {
        res.redirect(`${origin}/?oauth_status=managed`);
        return;
      }
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
        if (inviteRedirect !== true) res.redirect(`${origin}${inviteRedirect}`);
        return;
      }
    }

    // --- Login / signup action ------------------------------------------------
    if (isAioFusionStaffEmail(msEmail)) {
      const staff = await provisionAioFusionStaffMembership({
        email: msEmail,
        name: displayName,
        microsoftId,
      });
      if (!staff) {
        res.redirect(`${origin}/?oauth_status=error&oauth_msg=master_access_removed`);
        return;
      }
      await finishOauthLoginOrChallenge(req, res, origin, {
        ...staff,
        needsSetup: false,
      });
      return;
    }

    // Step 1: look up by Microsoft ID (fastest path for returning users)
    const byMsId = await getUserByMicrosoftId(microsoftId);
    if (byMsId) {
      const membership = await pickLoginMembership(byMsId.id);
      if (membership) {
        const account = await getAccount(membership.companySlug);
        if (account) {
          if (account.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
          if (await isAgencyPartnerClient(account.username)) { res.redirect(`${origin}/?oauth_status=managed`); return; }
          let userId: string | undefined; let activeCompanyId: string | undefined;
          let co: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
          try {
            userId = byMsId.id;
            await linkMicrosoftId(userId, microsoftId);
            co = await getCompanyBySlug(account.username); activeCompanyId = co?.id;
          } catch { userId = byMsId.id; }
          await finishOauthLoginOrChallenge(req, res, origin, {
            username: account.username,
            role: account.role,
            userId,
            activeCompanyId,
            needsSetup: await isEligibleForOnboarding({ username: account.username, role: account.role, userId, membershipRole: membership.role }),
          });
          return;
        }
      }
    }

    // Step 2: look up by email in platform_users (link Microsoft to existing account)
    if (byMsId) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=membership_required`);
      return;
    }
    const byEmail = msEmail ? await getUserByEmail(msEmail) : null;
    if (byEmail) {
      await linkMicrosoftId(byEmail.id, microsoftId);
      const membership = await pickLoginMembership(byEmail.id);
      if (membership) {
        const account = await getAccount(membership.companySlug);
        if (account) {
          if (account.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
          if (await isAgencyPartnerClient(account.username)) { res.redirect(`${origin}/?oauth_status=managed`); return; }
          let userId: string | undefined; let activeCompanyId: string | undefined;
          let co: Awaited<ReturnType<typeof getCompanyBySlug>> = null;
          try {
            userId = byEmail.id;
            co = await getCompanyBySlug(account.username); activeCompanyId = co?.id;
          } catch { userId = byEmail.id; }
          await finishOauthLoginOrChallenge(req, res, origin, {
            username: account.username,
            role: account.role,
            userId,
            activeCompanyId,
            needsSetup: await isEligibleForOnboarding({ username: account.username, role: account.role, userId, membershipRole: membership.role }),
          });
          return;
        }
      }
    }

    // Step 3: look up by email in platform_accounts (legacy accounts)
    if (byEmail) {
      res.redirect(`${origin}/?oauth_status=error&oauth_msg=membership_required`);
      return;
    }
    const [legacyMs] = await db.select().from(platformAccountsTable).where(ilike(platformAccountsTable.email, msEmail)).limit(1);
    if (legacyMs) {
      if (legacyMs.username === DEFAULT_ADMIN_USERNAME) {
        res.redirect(`${origin}/?oauth_status=error&oauth_msg=membership_required`);
        return;
      }
      if (legacyMs.status === "suspended") { res.redirect(`${origin}/?oauth_status=suspended`); return; }
      if (await isAgencyPartnerClient(legacyMs.username)) { res.redirect(`${origin}/?oauth_status=managed`); return; }
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
        needsSetup: await isEligibleForOnboarding({ username: legacyMs.username, role: legacyMs.role, userId, membershipRole: legacyMs.role === "admin" ? "admin" : "owner" }),
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
    await db.insert(platformMetaTable).values({ key: `account:profile:${username}`, value: JSON.stringify({ ownerName: displayName }) }).onConflictDoUpdate({ target: platformMetaTable.key, set: { value: JSON.stringify({ ownerName: displayName }) } });
    let newUserId: string | undefined; let newActiveCompanyId: string | undefined;
    try {
      newUserId = await ensurePlatformUser({
        email: msEmail,
        name: displayName,
        companyUsername: username,
        membershipRole: "owner",
        companySetupComplete: false,
      });
      await linkMicrosoftId(newUserId, microsoftId);
      const co = await getCompanyBySlug(username); newActiveCompanyId = co?.id;
    } catch { /* non-fatal */ }
    if (newUserId) { try { await db.update(platformUsersTable).set({ emailVerified: true }).where(eq(platformUsersTable.id, newUserId)); } catch { /* non-fatal */ } }
    if (newActiveCompanyId) {
      try {
        await db.update(platformCompaniesTable)
          .set({ setupComplete: false })
          .where(and(eq(platformCompaniesTable.id, newActiveCompanyId), isNull(platformCompaniesTable.setupComplete)));
      } catch { /* non-fatal */ }
    }
    void sendNewSignupAlert({ name: displayName, email: msEmail, companyName: null, username, method: "microsoft" });
    // Discount invite: redeem any discount token carried across the OAuth
    // round-trip in the discount-invite cookie. Fail-soft.
    const msDiscountToken = popDiscountInviteCookie(req, res);
    if (msDiscountToken) {
      try {
        const { getDiscountInvite: getInvite, consumeDiscountInvite: consumeInvite, applyInviteAccountType: applyType } = await import("../lib/discount-invites");
        const looked = await getInvite(msDiscountToken);
        // getDiscountInvite already filters out used/expired invites.
        // Require an exact email match so a forwarded invite URL cannot be
        // redeemed by an unintended account.
        if (looked.invite && looked.invite.email.toLowerCase() === msEmail.toLowerCase()) {
          await consumeInvite(looked.invite.token, username);
          await applyType(username, looked.invite.accountType);
        } else if (looked.invite) {
          logger.warn({ username, inviteEmail: looked.invite.email, ssoEmail: msEmail }, "microsoft-sso: discount invite email mismatch - invite not consumed (non-fatal)");
        }
      } catch (err) {
        logger.warn({ err, username }, "microsoft-sso: could not redeem discount invite for new account (non-fatal)");
      }
    }
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
      // This is agency impersonation, not a client authentication event. Do
      // not overwrite the client's true last-sign-in timestamp.
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
        .where(eq(platformAccountsTable.username, DEFAULT_ADMIN_USERNAME))
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
      if (!actor.userId) {
        res.status(403).json({ error: "Use an approved personal Master identity." });
        return;
      }
      const masterPolicy = await personalMfaPolicy({ username: DEFAULT_ADMIN_USERNAME, userId: actor.userId });
      if (masterPolicy.migrationRequired || !await hasMfaSession(agencySid, masterPolicy.subject)) {
        res.status(403).json({ error: "Sign in again and complete your personal two-factor authentication.", code: "MFA_REQUIRED" });
        return;
      }
      const adminSid = await createPlatformSession(adminRow.username, makeIpHint(rawIp), actor.userId, masterPolicy.companyId);
      await recordMfaSession(adminSid, masterPolicy.subject, masterPolicy.generation);
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
// user's email.
const SESSION_REFRESH_REQUIRED = "session_refresh_required";
const SESSION_REFRESH_REQUIRED_MESSAGE =
  "Your session needs to be refreshed before invitations can be loaded. Please sign out, then sign in again.";

router.get(
  "/platform/my-invites",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    const userId = req.account?.userId;
    if (!userId) {
      // The canonical bootstrap Master login is intentionally a legacy
      // account-only identity. It cannot receive person-addressed invitations,
      // so an empty list is correct and avoids a permanent refresh warning.
      if (
        req.account?.username === DEFAULT_ADMIN_USERNAME
        && normalizeRole(req.account.role) === "admin"
      ) {
        res.json({ invites: [] });
        return;
      }
      res.status(409).json({
        error: SESSION_REFRESH_REQUIRED_MESSAGE,
        reason: SESSION_REFRESH_REQUIRED,
      });
      return;
    }
    try {
      const [userRow] = await db
        .select({ email: platformUsersTable.email })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, userId))
        .limit(1);
      const normalizedEmail = userRow?.email?.trim().toLowerCase();
      if (!normalizedEmail) {
        res.status(409).json({
          error: SESSION_REFRESH_REQUIRED_MESSAGE,
          reason: SESSION_REFRESH_REQUIRED,
        });
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
            sql`lower(trim(${platformInvitationsTable.email})) = ${normalizedEmail}`,
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            isNull(platformInvitationsTable.declinedAt),
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
// Guards: userId required, email must match the normalized invited email.
router.post(
  "/platform/my-invites/:token/accept",
  requirePlatformAuth,
  loginLimiter,
  async (req: Request, res: Response) => {
    const userId = req.account?.userId;
    if (!userId) {
      res.status(409).json({
        error: SESSION_REFRESH_REQUIRED_MESSAGE,
        reason: SESSION_REFRESH_REQUIRED,
      });
      return;
    }
    try {
      const token = String(req.params.token || "").trim();
      const [userRow] = await db
        .select({ email: platformUsersTable.email })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, userId))
        .limit(1);
      const normalizedEmail = userRow?.email?.trim().toLowerCase();
      if (!normalizedEmail) {
        res.status(409).json({
          error: SESSION_REFRESH_REQUIRED_MESSAGE,
          reason: SESSION_REFRESH_REQUIRED,
        });
        return;
      }
      const invite = await getValidInvite(token);
      if (!invite) {
        const reason = await getInviteInvalidReason(token);
        res.status(404).json({ error: INVITE_INVALID_MESSAGES[reason], reason });
        return;
      }
      if (await isAgencyPartnerClient(invite.companySlug)) {
        res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
        return;
      }
      // Email-bound: the signed-in user's email must match the invited email.
      if (normalizedEmail !== invite.email.trim().toLowerCase()) {
        res.status(403).json({
          error: "This invitation is for a different email address.",
          reason: "email_mismatch",
        });
        return;
      }
      const ok = await consumeInvite(invite, userId);
      if (!ok) {
        const reason = await getInviteInvalidReason(token);
        res.status(404).json({ error: INVITE_INVALID_MESSAGES[reason], reason });
        return;
      }
      const [membership] = await db
        .select({ role: platformMembershipsTable.role })
        .from(platformMembershipsTable)
        .where(
          and(
            eq(platformMembershipsTable.userId, userId),
            eq(platformMembershipsTable.companyId, invite.companyId),
          ),
        )
        .limit(1);
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
        role: normalizeMembershipRole(membership?.role ?? invite.role),
      });
    } catch (err) {
      logger.error({ err }, "my-invites: failed to accept");
      res.status(500).json({ error: "Failed to accept invitation." });
    }
  },
);

// POST /platform/my-invites/:token/decline - decline an invite addressed to
// the signed-in user. The email match prevents a user from declining another
// person's invitation merely by learning its token.
router.post(
  "/platform/my-invites/:token/decline",
  requirePlatformAuth,
  loginLimiter,
  async (req: Request, res: Response) => {
    const userId = req.account?.userId;
    if (!userId) {
      res.status(409).json({
        error: SESSION_REFRESH_REQUIRED_MESSAGE,
        reason: SESSION_REFRESH_REQUIRED,
      });
      return;
    }
    try {
      const token = String(req.params.token || "").trim();
      const [userRow] = await db
        .select({ email: platformUsersTable.email })
        .from(platformUsersTable)
        .where(eq(platformUsersTable.id, userId))
        .limit(1);
      const normalizedEmail = userRow?.email?.trim().toLowerCase();
      if (!normalizedEmail) {
        res.status(409).json({
          error: SESSION_REFRESH_REQUIRED_MESSAGE,
          reason: SESSION_REFRESH_REQUIRED,
        });
        return;
      }
      const invite = await getValidInvite(token);
      if (!invite) {
        const reason = await getInviteInvalidReason(token);
        res.status(404).json({ error: INVITE_INVALID_MESSAGES[reason], reason });
        return;
      }
      if (normalizedEmail !== invite.email.trim().toLowerCase()) {
        res.status(403).json({
          error: "This invitation is for a different email address.",
          reason: "email_mismatch",
        });
        return;
      }
      const declined = await db
        .update(platformInvitationsTable)
        .set({ declinedAt: new Date() })
        .where(
          and(
            eq(platformInvitationsTable.token, invite.token),
            isNull(platformInvitationsTable.usedAt),
            isNull(platformInvitationsTable.revokedAt),
            isNull(platformInvitationsTable.declinedAt),
            gt(platformInvitationsTable.expiresAt, new Date()),
          ),
        )
        .returning({ token: platformInvitationsTable.token });
      if (declined.length === 0) {
        res.status(409).json({ error: "This invitation is no longer available." });
        return;
      }
      void logAdminEvent(
        { username: req.account!.username, id: userId },
        "team_invite_declined_inapp",
        userId,
        "invitation",
        { companySlug: invite.companySlug },
      );
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "my-invites: failed to decline");
      res.status(500).json({ error: "Failed to decline invitation." });
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
      // Managed (access-disabled) client workspaces cannot be entered by
      // multi-workspace humans either - only the agency's "View account".
      const agencyPartnerClient = await isAgencyPartnerClient(mem.companySlug);
      if (agencyPartnerClient || await isManaged(mem.companySlug)) {
        res.status(403).json({
          error: agencyPartnerClient ? AGENCY_PARTNER_CLIENT_MESSAGE : MANAGED_LOGIN_ERROR,
        });
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
      const subject = mfaSubject({ userId, username: mem.companySlug });
      const policy = await personalMfaPolicy({ userId, username: mem.companySlug, activeCompanyId: companyId });
      const sourceSid = getPlatformSessionId(req);
      const assured = !!sourceSid && await hasMfaSession(sourceSid, subject);
      if (policy.migrationRequired || ((policy.required || (await getMfaState(subject))?.enabled) && !assured)) {
        res.status(403).json({ error: "Sign in again and complete your personal two-factor authentication.", code: "MFA_REQUIRED" });
        return;
      }
      const sid = await createPlatformSession(mem.companySlug, makeIpHint(rawIp), userId, companyId);
      if (assured) await recordMfaSession(sid, subject, policy.generation);
      setPlatformCookie(res, sid);
      res.json({
        ok: true,
        account: {
          username: mem.companySlug,
          role: normalizeWorkspaceRole(mem.companySlug, mem.companyRole),
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
          website: platformAccountsTable.website,
        })
        .from(platformAccountsTable);
      const visible = await getVisibleUsernames(account);
      const filtered =
        visible === null
          ? rows
          : rows.filter((r) => visible.includes(normUsername(r.username)));
      const agencyParentSlugs = new Set(
        rows
          .filter((r) => normalizeRole(r.role) === "agency")
          .map((r) => normUsername(r.username)),
      );
      const [names, archivedSet, mfaSet, managedSet, lastSignIns] = await Promise.all([
        getDisplayNames(),
        getArchivedSet(),
        getMfaEnabledSet(),
        getManagedSet(),
        getLastSignIns().catch(() => new Map<string, string>()),
      ]);
      res.json({
        accounts: filtered.map((r) =>
          publicAccount(
            r,
            names.get(normUsername(r.username)),
            archivedSet.has(normUsername(r.username)),
            mfaSet.has(normUsername(r.username)),
            managedSet.has(normUsername(r.username)),
            lastSignIns.get(normUsername(r.username)),
            normalizeRole(r.role) === "client" &&
              !!r.parent &&
              agencyParentSlugs.has(normUsername(r.parent)),
          ),
        ),
      });
    } catch {
      res.status(500).json({ error: "Failed to load accounts" });
    }
  },
);

export const AGENCY_PARTNER_CLIENT_MESSAGE =
  "This client is managed by your agency - agency partner client accounts are always managed and never have their own sign-in.";

// Whether the given platform_users row belongs ONLY to the target company
// (single membership, pointing at the target slug). Used to make sure access
// grant/revoke operations on a client account never touch the credentials of
// a human who also belongs to other workspaces.
async function userBelongsOnlyTo(userId: string, targetUsername: string): Promise<boolean> {
  const mems = await db
    .select({ companySlug: platformMembershipsTable.companySlug })
    .from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.userId, userId));
  return mems.length === 1 && normUsername(mems[0]!.companySlug) === normUsername(targetUsername);
}

// Send the welcome "set your password" email to a client's key contact.
// Issues a single-use 7-day reset token only for brand-new users; if the
// contact email already belongs to a platform_users row we must NOT issue a
// reset token - their existing password must not be threatened by an emailed
// link. We still send the email, just without the set-password button.
// Fail-soft throughout: the caller's operation succeeds even when the email
// cannot be sent or the token insertion fails.
async function sendWelcomeSetPasswordEmail(opts: {
  targetUsername: string;
  contactEmail: string;
  contactName: string;
  companyName: string;
  actorUsername: string;
  companyRole: Role;
  // Grant-access flow: also issue a token when the contact already has a
  // platform_users row, provided their ONLY membership is the target client
  // account (so an emailed link can never threaten an unrelated account's
  // password). Needed to re-grant access after a revoke scrambled it.
  allowExistingUserToken?: boolean;
  // When true, no email is sent unless a usable set-password token was issued
  // (the grant-access flow must never claim access was granted without a
  // working credential path; the create flow keeps its fail-soft email).
  requireToken?: boolean;
}): Promise<{ tokenIssued: boolean }> {
  const { targetUsername, contactEmail, contactName, companyName, actorUsername } = opts;
  let agencyName = actorUsername;
  try {
    const [metaRow] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, profileKey(normUsername(actorUsername))))
      .limit(1);
    if (metaRow?.value) {
      const parsed = JSON.parse(metaRow.value) as { displayName?: unknown };
      if (typeof parsed.displayName === "string" && parsed.displayName.trim()) agencyName = parsed.displayName;
    }
  } catch { /* fall back to username */ }

  let setPasswordUrl: string | undefined;
  try {
    const existingUser = await getUserByEmail(contactEmail);
    if (existingUser && opts.allowExistingUserToken) {
      if (await userBelongsOnlyTo(existingUser.id, targetUsername)) {
        await db
          .delete(platformPasswordResetsTable)
          .where(eq(platformPasswordResetsTable.userId, existingUser.id));
        const welcomeToken = crypto.randomBytes(32).toString("hex");
        await db.insert(platformPasswordResetsTable).values({
          token: welcomeToken,
          userId: existingUser.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
        setPasswordUrl = `${getAppBaseUrl()}/?reset_token=${welcomeToken}&welcome=1`;
      }
    } else if (!existingUser) {
      // Eagerly create the platform_users + platform_companies +
      // platform_memberships rows so the FK in platform_password_resets
      // is satisfied.  The membership role is "owner" (the contact owns
      // their client account).  ensurePlatformUser is idempotent on
      // conflict so a concurrent login on the same email is safe.
      const account = await getAccount(targetUsername);
      const newUserId = await ensurePlatformUser({
        email: contactEmail,
        name: contactName || null,
        passwordHash: account?.passwordHash ?? null,
        companyUsername: targetUsername,
        membershipRole: "owner",
        companyRole: opts.companyRole,
        companyParentSlug: normUsername(actorUsername),
      });
      // Invalidate any pre-existing tokens for this user (mirrors
      // forgot-password behaviour) then issue a fresh 7-day welcome token.
      await db
        .delete(platformPasswordResetsTable)
        .where(eq(platformPasswordResetsTable.userId, newUserId));
      const welcomeToken = crypto.randomBytes(32).toString("hex");
      await db.insert(platformPasswordResetsTable).values({
        token: welcomeToken,
        userId: newUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      setPasswordUrl = `${getAppBaseUrl()}/?reset_token=${welcomeToken}&welcome=1`;
    }
  } catch (err) {
    logger.warn({ err, contactEmail }, "accounts: failed to issue welcome token (non-fatal) - email sent without set-password link");
  }

  if (opts.requireToken && !setPasswordUrl) return { tokenIssued: false };

  void sendClientAccountCreatedEmail({
    toEmail: contactEmail,
    contactName,
    companyName,
    agencyName,
    username: targetUsername,
    loginUrl: getAppBaseUrl(),
    setPasswordUrl,
  });
  return { tokenIssued: Boolean(setPasswordUrl) };
}

// Create a sub-account. The new account's parent is the caller (so it joins the
// caller's visibility subtree). Only an admin may create another admin.
class AccountCreationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

router.post(
  "/platform/accounts",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      // Master Technical / Operational Support members cannot create accounts.
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }
      let username = normUsername(req.body?.username);
      // Managed accounts are run by the agency on the client's behalf: no
      // welcome email, no set-password link, and a random unguessable password
      // is generated server-side (the agency uses "View account" instead).
      // Clients created by an agency/partner account are ALWAYS managed -
      // billing sits with the agency and the client never gets a sign-in -
      // regardless of what the request body says.
      const actorIsAgencyPartner = normalizeRole(actor.role) === "agency";
      const managed = req.body?.managed === true || actorIsAgencyPartner;
      let password = typeof req.body?.password === "string" ? req.body.password : "";
      // Agency partners can never choose a client password - even a direct API
      // call with a supplied password gets a server-generated one instead.
      if (actorIsAgencyPartner || (managed && !password)) {
        password = crypto.randomBytes(24).toString("hex");
      }
      const requestedRole = normalizeRole(req.body?.role);
      // Optional client-company details captured at creation time.
      let website = typeof req.body?.website === "string" ? req.body.website.trim().slice(0, 200) : "";
      if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
      const contactName = typeof req.body?.contactName === "string" ? req.body.contactName.trim().slice(0, 80) : "";
      const contactEmail = typeof req.body?.contactEmail === "string" ? req.body.contactEmail.trim().slice(0, 200) : "";
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        res.status(400).json({ error: "Key contact email address doesn't look valid." });
        return;
      }
      // When set, the username is a suggestion derived from the company name;
      // append a numeric suffix instead of failing on a collision.
      const autoUsername = req.body?.autoUsername === true;
      const creationRequestKey = req.body?.creationRequestKey;
      if (creationRequestKey !== undefined
        && (typeof creationRequestKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(creationRequestKey))) {
        res.status(400).json({ error: "Invalid account creation request key." });
        return;
      }
      // Optional client logo, validated exactly like the profile-image route.
      const logoDataUrl = typeof req.body?.logoDataUrl === "string" ? req.body.logoDataUrl : "";
      if (logoDataUrl && (!DATA_URL_RE.test(logoDataUrl) || logoDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH)) {
        res.status(400).json({ error: "Logo must be a PNG, JPEG or WebP image (max ~450KB after resizing)." });
        return;
      }
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
      if (!password || password.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters." });
        return;
      }
      // A direct client is a leaf account and may not create sub-accounts.
      if (!canCreateSubAccounts(actor.role)) {
        res.status(403).json({ error: "Your account cannot create other accounts." });
        return;
      }
      const actorUsername = normUsername(actor.username);
      const receiptKey = creationRequestKey
        ? `account:creation:${actorUsername}:${creationRequestKey}` : undefined;
      // Fingerprint only non-secret inputs. Including passwords in a fast hash
      // would create a cheap password verifier alongside the salted slow hash.
      const suppliedPassword = !actorIsAgencyPartner
        && typeof req.body?.password === "string" && req.body.password.length > 0;
      const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
        username, role, managed, autoUsername, website, contactName, contactEmail,
        displayName: displayName.trim().slice(0, 64), logoDataUrl,
        suppliedPassword,
      })).digest("hex");
      const passwordHash = hashPassword(password);
      const result = await db.transaction(async (tx) => {
        if (receiptKey) {
          // The unique key serializes retries across API processes. The claim,
          // account and final receipt commit together, or all roll back.
          const claimed = await tx.insert(platformMetaTable)
            .values({ key: receiptKey, value: "{}" })
            .onConflictDoNothing({ target: platformMetaTable.key })
            .returning({ key: platformMetaTable.key });
          if (!claimed.length) {
            const [stored] = await tx.select().from(platformMetaTable)
              .where(eq(platformMetaTable.key, receiptKey)).limit(1);
            const receipt = JSON.parse(stored.value) as {
              fingerprint: string; username: string; welcomeLinkCreated?: boolean;
            };
            if (receipt.fingerprint !== fingerprint) {
              throw new AccountCreationError(409, "This creation request was already used with different account details.");
            }
            const [existing] = await tx.select().from(platformAccountsTable)
              .where(eq(platformAccountsTable.username, receipt.username)).limit(1);
            if (!existing || existing.parent !== actorUsername) {
              throw new AccountCreationError(409, "The account from this creation request is no longer available.");
            }
            // Supplied passwords are compared only using the existing slow
            // verifier. Server-generated managed passwords are not replay input.
            if (suppliedPassword && !verifyPassword(password, existing.passwordHash)) {
              throw new AccountCreationError(409, "This creation request was already used with different account details.");
            }
            return { username: receipt.username, replayed: true, welcomeLinkCreated: receipt.welcomeLinkCreated };
          }
        }
        // Check capacity after replay: a lost response must remain recoverable
        // even when the newly created account consumed the final seat.
        if (actor.role !== "admin") {
          const [parentAccount] = await tx.select().from(platformAccountsTable)
            .where(eq(platformAccountsTable.username, actorUsername)).limit(1);
          if (parentAccount?.maxSeats != null) {
            const [{ value: currentSeats }] = await tx.select({ value: count() })
              .from(platformAccountsTable).where(eq(platformAccountsTable.parent, actorUsername));
            if (currentSeats >= parentAccount.maxSeats) {
              throw new AccountCreationError(403,
                `Seat cap reached (${parentAccount.maxSeats} ${parentAccount.maxSeats === 1 ? "seat" : "seats"} allowed). Contact your administrator to increase the limit.`);
            }
          }
        }
        const base = username.slice(0, 28);
        let inserted = false;
        for (let attempt = 0; attempt <= 50; attempt++) {
          const candidate = attempt === 0 ? username : `${base}-${attempt}`;
          const rows = await tx.insert(platformAccountsTable).values({
            username: candidate, passwordHash, role, parent: actorUsername,
            ...(website ? { website } : {}),
            ...(contactEmail ? { email: contactEmail } : {}),
          }).onConflictDoNothing({ target: platformAccountsTable.username })
            .returning({ username: platformAccountsTable.username });
          if (rows.length) {
            username = candidate;
            inserted = true;
            break;
          }
          if (!autoUsername) throw new AccountCreationError(409, "That username already exists.");
        }
        if (!inserted) {
          throw new AccountCreationError(409, "Could not find a free username - please choose one manually.");
        }
        if (displayName.trim() || contactName) {
          const value = JSON.stringify({
            ...(displayName.trim() ? { displayName: displayName.trim().slice(0, 64) } : {}),
            ...(contactName ? { ownerName: contactName } : {}),
          });
          await tx.insert(platformMetaTable).values({ key: profileKey(username), value })
            .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
        }
        if (logoDataUrl) {
          await tx.insert(platformMetaTable)
            .values({ key: profileImageKey("logo", username), value: logoDataUrl })
            .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: logoDataUrl } });
        }
        if (managed) {
          await tx.insert(platformMetaTable).values({ key: managedKey(username), value: "true" })
            .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: "true" } });
        }
        // Until the optional post-commit email succeeds, retries must not claim
        // a welcome link exists or issue another one.
        const welcomeLinkCreated = contactEmail && !managed ? false : undefined;
        if (receiptKey) {
          await tx.update(platformMetaTable)
            .set({ value: JSON.stringify({ fingerprint, username, welcomeLinkCreated }) })
            .where(eq(platformMetaTable.key, receiptKey));
        }
        return { username, replayed: false, welcomeLinkCreated };
      });
      username = result.username;
      if (result.replayed) {
        res.json({ ok: true, username, welcomeLinkCreated: result.welcomeLinkCreated });
        return;
      }
      // Tell the key contact they have a login. Fail-soft: account creation
      // succeeds even if the email cannot be sent or the token insertion fails.
      // Managed accounts skip this entirely - the client is not given access.
      // welcomeLinkCreated: undefined when no welcome email applies (managed
      // or no contact email), true/false when a set-password link was/wasn't
      // issued - the UI warns the agency when it is explicitly false.
      let welcomeLinkCreated: boolean | undefined;
      if (contactEmail && !managed) {
        const { tokenIssued } = await sendWelcomeSetPasswordEmail({
          targetUsername: username,
          contactEmail,
          contactName,
          companyName: displayName.trim() || username,
          actorUsername: actor.username,
          companyRole: role,
        });
        welcomeLinkCreated = tokenIssued;
        if (receiptKey) {
          // Email status is optional, outside the required creation transaction.
          // A persistence failure must not turn a committed create into a 500.
          try {
            await db.update(platformMetaTable)
              .set({ value: JSON.stringify({ fingerprint, username, welcomeLinkCreated }) })
              .where(eq(platformMetaTable.key, receiptKey));
          } catch {
            logger.warn({ username }, "Could not persist account creation welcome status");
          }
        }
      }
      res.json({ ok: true, username, welcomeLinkCreated });
    } catch (error) {
      if (error instanceof AccountCreationError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
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
      if (!newPassword || newPassword.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters." });
        return;
      }
      // Guardrails: no credential changes while impersonating, and master
      // Technical / Operational Support members cannot manage credentials.
      if (await isImpersonatedRequest(req)) {
        res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
        return;
      }
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
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
      // Agency partner clients are permanently managed - no password may ever
      // be set on them (their agency signs in via "Client projects" instead).
      // This applies to the client's own session too: this route does not
      // verify the current password, so a leftover/SSO client session must
      // not be able to mint one for itself.
      if (await isAgencyPartnerClient(target)) {
        res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
        return;
      }
      const passwordHash = hashPassword(newPassword);
      const credentialMembers = await db.select({ userId: platformMembershipsTable.userId })
        .from(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, target));
      const credentialUser = existing.email ? await getUserByEmail(existing.email) : null;
      if (target === DEFAULT_ADMIN_USERNAME || credentialMembers.length > 1
        || (credentialMembers.length === 1 && credentialMembers[0].userId !== credentialUser?.id)) {
        res.status(409).json({ error: "This workspace has personal identities. Use the person's verified password recovery flow." });
        return;
      }
      await db
        .update(platformAccountsTable)
        .set({ passwordHash })
        .where(eq(platformAccountsTable.username, target));

      // A modern login verifies platform_users.password_hash before the legacy
      // account record. Keep that credential in sync, then invalidate every
      // session belonging to this human as well as legacy slug sessions. This
      // route is also used by admins resetting another account's password, so
      // there is no target session to preserve in that case.
      const targetUser = existing.email
        ? await getUserByEmail(existing.email)
        : undefined;
      const memberships = targetUser
        ? await db
          .select({
            companySlug: platformMembershipsTable.companySlug,
            role: platformMembershipsTable.role,
          })
          .from(platformMembershipsTable)
          .where(eq(platformMembershipsTable.userId, targetUser.id))
        : [];
      const currentSid = getPlatformSessionId(req);
      const preserveCurrentSession = Boolean(
        currentSid && targetUser && actor.userId === targetUser.id,
      );
      if (targetUser) {
        await db
          .update(platformUsersTable)
          .set({ passwordHash })
          .where(eq(platformUsersTable.id, targetUser.id));
        // One person can own or administer multiple workspaces. Legacy
        // slug-based login may still be used for each of those workspaces, so
        // update every matching credential too; otherwise the former password
        // would still work through a different workspace slug.
        for (const membership of memberships) {
          if (
            (membership.role === "owner" || membership.role === "admin")
            && membership.companySlug !== DEFAULT_ADMIN_USERNAME
            && !(await isAgencyPartnerClient(normUsername(membership.companySlug)))
          ) {
            await db
              .update(platformAccountsTable)
              .set({ passwordHash })
              .where(eq(platformAccountsTable.username, membership.companySlug));
          }
        }
        const newSessionVersion = await incrementSessionVersion(targetUser.id);
        if (preserveCurrentSession && currentSid) {
          await db
            .update(platformSessionsTable)
            .set({ sessionVersion: newSessionVersion })
            .where(eq(platformSessionsTable.sid, currentSid));
        }
        await db
          .delete(platformSessionsTable)
          .where(and(
            eq(platformSessionsTable.userId, targetUser.id),
            preserveCurrentSession ? ne(platformSessionsTable.sid, currentSid!) : sql`true`,
          ));
      }
      // Version checks do not apply to legacy sessions (their user_id is NULL).
      // Remove those for every workspace associated with this identity.
      const legacySessionUsernames = new Set([
        target,
        ...memberships.map((membership) => normUsername(membership.companySlug)),
      ]);
      for (const username of legacySessionUsernames) {
        await db
          .delete(platformSessionsTable)
          .where(and(
            eq(platformSessionsTable.username, username),
            isNull(platformSessionsTable.userId),
            preserveCurrentSession ? ne(platformSessionsTable.sid, currentSid!) : sql`true`,
          ));
      }
      // Clear MFA trusted devices so all devices must re-enter a TOTP code
      // after an admin-set password change. This must happen after all password
      // writes succeed, so a rejected password never logs devices out.
      await clearTrustedDevices(mfaSubject({ username: target, userId: targetUser?.id }));
      if (preserveCurrentSession && currentSid && targetUser && (await getMfaState(mfaSubject({ username: target, userId: targetUser.id })))?.enabled) {
        await recordMfaSession(currentSid, mfaSubject({ username: target, userId: targetUser.id }), await getMfaGeneration(mfaSubject({ username: target, userId: targetUser.id })));
      }

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

// Best-effort lookup of the friendly names used in client-access emails:
// the target's company/contact names and the acting agency's display name.
async function getAccessEmailNames(target: string, actorUsername: string): Promise<{
  contactName: string;
  companyName: string;
  agencyName: string;
}> {
  let contactName = "";
  let companyName = target;
  let agencyName = actorUsername;
  try {
    const [metaRow] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, profileKey(target)))
      .limit(1);
    if (metaRow?.value) {
      const parsed = JSON.parse(metaRow.value) as { displayName?: unknown; ownerName?: unknown };
      if (typeof parsed.displayName === "string" && parsed.displayName.trim()) companyName = parsed.displayName.trim();
      if (typeof parsed.ownerName === "string" && parsed.ownerName.trim()) contactName = parsed.ownerName.trim();
    }
  } catch { /* fall back to username */ }
  try {
    const [actorRow] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, profileKey(normUsername(actorUsername))))
      .limit(1);
    if (actorRow?.value) {
      const parsed = JSON.parse(actorRow.value) as { displayName?: unknown };
      if (typeof parsed.displayName === "string" && parsed.displayName.trim()) agencyName = parsed.displayName.trim();
    }
  } catch { /* fall back to username */ }
  return { contactName, companyName, agencyName };
}

// Grant or revoke a client account's sign-in access. Agencies use this to hand
// a managed account over to the client (welcome set-password email, or a
// password chosen by the agency) - or to withdraw access again (scramble the
// password and revoke all active sessions). Enforced within the caller's own
// subtree via canManage.
router.post(
  "/platform/accounts/access",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      // Destructive credential/session operation: only the workspace owner or
      // a team admin may grant/revoke client access. Viewer, billing and
      // regular members are refused even inside their own subtree. Master
      // admins (role "admin") always pass - their membershipRole is owner/null.
      const actorMemRole = actor.membershipRole;
      if (actorMemRole !== null && actorMemRole !== undefined && actorMemRole !== "owner" && actorMemRole !== "admin") {
        res.status(403).json({ error: "Only the account owner or a team admin can change client access." });
        return;
      }
      const target = normUsername(req.body?.username);
      const action = req.body?.action;
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      // "mark-managed" is the agency-facing backfill for client accounts that
      // were created as managed before the flag existed: it records the flag
      // and (like revoke) makes sure no sign-in credential remains usable.
      if (action !== "grant" && action !== "revoke" && action !== "mark-managed" && action !== "resend-welcome") {
        res.status(400).json({ error: "Action must be 'grant', 'revoke', 'mark-managed' or 'resend-welcome'." });
        return;
      }
      if (target === normUsername(actor.username)) {
        res.status(400).json({ error: "You cannot change access on your own account." });
        return;
      }
      if (!(await canManage(actor, target))) {
        res.status(403).json({ error: "You cannot change this account." });
        return;
      }
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (normalizeRole(existing.role) !== "client") {
        res.status(400).json({ error: "Access can only be changed on client accounts." });
        return;
      }
      // Agency partner clients are permanently managed: sign-in access can
      // never be granted to them. (Revoke/mark-managed stay available as a
      // clean-up path for any legacy passworded client under an agency.)
      if ((action === "grant" || action === "resend-welcome") && (await isAgencyPartnerClient(target))) {
        res.status(403).json({ error: AGENCY_PARTNER_CLIENT_MESSAGE });
        return;
      }

      if (action === "resend-welcome") {
        if (!existing.email) {
          res.status(400).json({ error: "This client has no email address for a set-password link. Set a password directly instead." });
          return;
        }
        try {
          const existingContact = await getUserByEmail(existing.email);
          if (existingContact && !(await userBelongsOnlyTo(existingContact.id, target))) {
            res.status(409).json({
              error: "The key contact's email already belongs to a user with other workspaces, so a set-password link can't be sent. Set a password directly instead.",
            });
            return;
          }
        } catch { /* requireToken below remains the final credential safeguard */ }
        let contactName = "";
        let companyName = target;
        try {
          const [metaRow] = await db
            .select()
            .from(platformMetaTable)
            .where(eq(platformMetaTable.key, profileKey(target)))
            .limit(1);
          if (metaRow?.value) {
            const parsed = JSON.parse(metaRow.value) as { displayName?: unknown; ownerName?: unknown };
            if (typeof parsed.displayName === "string" && parsed.displayName.trim()) companyName = parsed.displayName.trim();
            if (typeof parsed.ownerName === "string" && parsed.ownerName.trim()) contactName = parsed.ownerName.trim();
          }
        } catch { /* fall back to username */ }
        const { tokenIssued } = await sendWelcomeSetPasswordEmail({
          targetUsername: target,
          contactEmail: existing.email,
          contactName,
          companyName,
          actorUsername: actor.username,
          companyRole: "client",
          allowExistingUserToken: true,
          requireToken: true,
        });
        if (!tokenIssued) {
          res.status(502).json({ error: "Couldn't create a new set-password link. Try again, or set a password directly." });
          return;
        }
        res.json({ ok: true, emailSent: true });
        return;
      }

      // Destructive actions scramble the password and sign the client out
      // everywhere. When the client signed in recently they are probably
      // actively using the account, so surface the last sign-in and require
      // an explicit confirmation (resubmit with confirmRecentSignIn: true)
      // before proceeding.
      if (
        (action === "revoke" || action === "mark-managed") &&
        req.body?.confirmRecentSignIn !== true
      ) {
        const lastSignInAt = await getLastSignInAt(target);
        if (lastSignInAt && Date.now() - lastSignInAt.getTime() < RECENT_SIGN_IN_WINDOW_MS) {
          res.status(409).json({
            requiresConfirmation: true,
            lastSignInAt: lastSignInAt.toISOString(),
            error: "This client signed in recently. Confirm to remove their access anyway.",
          });
          return;
        }
      }

      if (action === "grant") {
        if (password) {
          // Agency sets the password directly and shares it with the client.
          if (password.length < 8) {
            res.status(400).json({ error: "Password must be at least 8 characters." });
            return;
          }
          const ph = hashPassword(password);
          await db
            .update(platformAccountsTable)
            .set({ passwordHash: ph })
            .where(eq(platformAccountsTable.username, target));
          // Keep the modern credential store in step so email logins work -
          // but only when the user belongs solely to this client account.
          if (existing.email) {
            try {
              const u = await getUserByEmail(existing.email);
              if (u && (await userBelongsOnlyTo(u.id, target))) {
                await db
                  .update(platformUsersTable)
                  .set({ passwordHash: ph })
                  .where(eq(platformUsersTable.id, u.id));
              }
            } catch { /* non-fatal - slug login still works */ }
          }
          await setManaged(target, false);
          // Courtesy notice to the key contact (fail-soft, never blocks).
          if (existing.email) {
            const names = await getAccessEmailNames(target, actor.username);
            void sendClientAccessChangedEmail({
              toEmail: existing.email,
              ...names,
              action: "restored",
            });
          }
          res.json({ ok: true, emailSent: false });
          return;
        }
        // Email flow: send the welcome set-password email to the key contact.
        if (!existing.email) {
          res.status(400).json({ error: "This account has no key contact email. Set a password instead." });
          return;
        }
        // If the contact email already belongs to a human with OTHER
        // workspace memberships, an emailed set-password link is off the
        // table (it would threaten their unrelated credential). Refuse
        // up-front instead of claiming access was granted without a usable
        // credential path.
        try {
          const existingContact = await getUserByEmail(existing.email);
          if (existingContact && !(await userBelongsOnlyTo(existingContact.id, target))) {
            res.status(409).json({
              error: "The key contact's email already belongs to a user with other workspaces, so a set-password link can't be sent. Set a password directly instead.",
            });
            return;
          }
        } catch { /* fall through - requireToken below still protects */ }
        let contactName = "";
        let companyName = target;
        try {
          const [metaRow] = await db
            .select()
            .from(platformMetaTable)
            .where(eq(platformMetaTable.key, profileKey(target)))
            .limit(1);
          if (metaRow?.value) {
            const parsed = JSON.parse(metaRow.value) as { displayName?: unknown; ownerName?: unknown };
            if (typeof parsed.displayName === "string" && parsed.displayName.trim()) companyName = parsed.displayName.trim();
            if (typeof parsed.ownerName === "string" && parsed.ownerName.trim()) contactName = parsed.ownerName.trim();
          }
        } catch { /* fall back to username */ }
        const { tokenIssued } = await sendWelcomeSetPasswordEmail({
          targetUsername: target,
          contactEmail: existing.email,
          contactName,
          companyName,
          actorUsername: actor.username,
          companyRole: "client",
          allowExistingUserToken: true,
          requireToken: true,
        });
        if (!tokenIssued) {
          // No usable credential path was created - do NOT enable access or
          // claim success. The agency can retry or set a password directly.
          res.status(502).json({ error: "Couldn't create the set-password link. Try again, or set a password directly." });
          return;
        }
        await setManaged(target, false);
        res.json({ ok: true, emailSent: true });
        return;
      }

      // action === "revoke" | "mark-managed": scramble the password and
      // revoke active sessions, then record the managed flag. mark-managed is
      // behaviourally identical - it exists so pre-existing managed accounts
      // (created before the flag was persisted) can be labelled truthfully.
      const scrambled = hashPassword(crypto.randomBytes(32).toString("hex"));
      await db
        .update(platformAccountsTable)
        .set({ passwordHash: scrambled })
        .where(eq(platformAccountsTable.username, target));
      if (existing.email) {
        try {
          const u = await getUserByEmail(existing.email);
          if (u && (await userBelongsOnlyTo(u.id, target))) {
            await db
              .update(platformUsersTable)
              .set({ passwordHash: scrambled })
              .where(eq(platformUsersTable.id, u.id));
            // Kill any outstanding set-password / reset links.
            await db
              .delete(platformPasswordResetsTable)
              .where(eq(platformPasswordResetsTable.userId, u.id));
            // Fast-revoke any session stamped with this user's version.
            await incrementSessionVersion(u.id);
          }
        } catch { /* non-fatal - sessions are still deleted below */ }
      }
      // Revoke every active session on this client account.
      await db
        .delete(platformSessionsTable)
        .where(eq(platformSessionsTable.username, target));
      await clearTrustedDevices(target);
      await setManaged(target, true);
      // Courtesy/security notice to the key contact (fail-soft, never blocks).
      if (existing.email) {
        const names = await getAccessEmailNames(target, actor.username);
        void sendClientAccessChangedEmail({
          toEmail: existing.email,
          ...names,
          action: "revoked",
        });
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to change client access" });
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
      const websiteProvided = typeof req.body?.website === "string";
      const confirmsWorkspaceNameReview = req.body?.confirmWorkspaceNameReview === true;
      let website = websiteProvided ? req.body.website.trim().slice(0, 200) : "";
      if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
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
      if (
        confirmsWorkspaceNameReview
        && (!isSelf || (actor.membershipRole != null && actor.membershipRole !== "owner"))
      ) {
        res.status(403).json({ error: "Only the workspace owner can confirm its name." });
        return;
      }
      await setDisplayName(target, displayName);
      const companyDisplayName = displayName.trim().slice(0, 64);
      await db
        .update(platformCompaniesTable)
        .set({ displayName: companyDisplayName || target })
        .where(eq(platformCompaniesTable.slug, target));
      if (websiteProvided) {
        await db
          .update(platformAccountsTable)
          .set({ website: website || null })
          .where(eq(platformAccountsTable.username, target));
        // Modern workspace records carry the same profile value. Keep both
        // stores aligned so /platform/me and any future company reads agree.
        await db
          .update(platformCompaniesTable)
          .set({ website: website || null })
          .where(eq(platformCompaniesTable.slug, target));
      }
      if (confirmsWorkspaceNameReview) {
        await db
          .insert(platformMetaTable)
          .values({
            key: workspaceNameReviewKey(target),
            value: JSON.stringify({ reviewedAt: new Date().toISOString() }),
          })
          .onConflictDoUpdate({
            target: platformMetaTable.key,
            set: { value: JSON.stringify({ reviewedAt: new Date().toISOString() }) },
          });
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to update account" });
    }
  },
);

// --- Company and billing information ----------------------------------------
//
// Stored on platform_companies (billing_email / vat_number, schema v2).
// Read/write allowed for the account itself when the member is owner, admin,
// or billing (the Billing role exists precisely to maintain these fields),
// and for anyone who can manage the account (agency parent, master admin).

function canEditBillingDetails(account: { membershipRole?: string }): boolean {
  const r = account.membershipRole;
  // Undefined = legacy full-access session; content/viewer are excluded.
  return r === undefined || r === "owner" || r === "admin" || r === "billing";
}

router.get(
  "/platform/billing-details",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(typeof req.query.username === "string" ? req.query.username : actor.username);
      const isSelf = target === normUsername(actor.username);
      if (isSelf) {
        if (!canEditBillingDetails(actor)) {
          res.status(403).json({ error: "You do not have access to billing details." });
          return;
        }
      } else if (!canEditBillingDetails(actor) || !(await canManage(actor, target))) {
        // Managing a descendant still requires a billing-capable membership
        // role on the actor's own workspace (viewer/content members cannot
        // reach a child's billing details through canManage alone).
        res.status(403).json({ error: "You cannot view this account's billing details." });
        return;
      }
      const record = await getCompanyBillingRecord(target);
      if (!record) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.json(record);
    } catch {
      res.status(500).json({ error: "Could not load billing details" });
    }
  },
);

router.post(
  "/platform/billing-details",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(typeof req.body?.username === "string" ? req.body.username : actor.username);
      const isSelf = target === normUsername(actor.username);
      if (isSelf) {
        if (!canEditBillingDetails(actor)) {
          res.status(403).json({ error: "You do not have access to billing details." });
          return;
        }
      } else if (!canEditBillingDetails(actor) || !(await canManage(actor, target))) {
        // Same rule as the GET: the actor's own membership role must allow
        // billing access before they can edit a managed account's details.
        res.status(403).json({ error: "You cannot change this account's billing details." });
        return;
      }
      const validation = validateCompanyBillingFields(req.body);
      if (!validation.ok) {
        res.status(400).json({
          error: "Complete the highlighted company and billing information.",
          fieldErrors: validation.fieldErrors,
        });
        return;
      }
      const company = await getCompanyBySlug(target);
      if (!company) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      await saveCompanyBillingRecord(target, validation.fields, validation.billingAddress);
      // Keep the Stripe customer's invoice details in step. Awaited so a
      // failed sync is at least logged before we respond; fail-soft inside,
      // so a Stripe outage never blocks saving details in the app.
      const { syncStripeBillingDetails } = await import("../lib/billing");
      await syncStripeBillingDetails(target);
      res.json({ ok: true, record: await getCompanyBillingRecord(target) });
    } catch {
      res.status(500).json({ error: "Could not save billing details" });
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
      // Master Technical / Operational Support members cannot archive accounts.
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }
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
      // Guardrails: no credential changes while impersonating, and master
      // Technical / Operational Support members cannot manage credentials.
      if (await isImpersonatedRequest(req)) {
        res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
        return;
      }
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }
      const [namedMember] = await db.select().from(platformMembershipsTable)
        .where(eq(platformMembershipsTable.companySlug, target)).limit(1);
      if (target === DEFAULT_ADMIN_USERNAME || existing.email || namedMember) {
        res.status(409).json({ error: "MFA belongs to people, not workspaces. Use verified personal recovery in the team roster.", code: "PERSONAL_MFA_REQUIRED" });
        return;
      }
      const state = await getMfaState(`legacy:${target}`);
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

// The frontend uses this server-authoritative capability check to hide the
// destructive QA control everywhere except staging.
function configuredStagingSignupTestEmail(): string | null {
  const email = process.env.STAGING_SIGNUP_TEST_EMAIL?.trim().toLowerCase() ?? "";
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function configuredStagingSignupTestUsername(): Promise<string | null> {
  const email = configuredStagingSignupTestEmail();
  if (!email) return null;
  const rows = await db
    .select({ companySlug: platformMembershipsTable.companySlug })
    .from(platformMembershipsTable)
    .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
    .where(and(
      sql`lower(${platformUsersTable.email}) = ${email}`,
      eq(platformMembershipsTable.role, "owner"),
    ));
  return rows.length === 1 ? normUsername(rows[0]!.companySlug) : null;
}

router.get(
  "/platform/admin/staging-test-reset",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    if (
      !isStagingDeployment()
      || normalizeRole(req.account!.role) !== "admin"
      || await isImpersonatedRequest(req)
      || isRestrictedMaster(req.account!)
    ) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    const username = await configuredStagingSignupTestUsername();
    if (!username) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    res.json({ enabled: true, username });
  },
);

// Return a top-level password account to the beginning of onboarding without
// deleting its login identity. This is intentionally staging-only so a reusable
// QA login can exercise the new-account journey without risking live data.
router.post(
  "/platform/admin/accounts/:username/reset-staging-test",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      if (!isStagingDeployment()) {
        res.status(404).json({ error: "Not found." });
        return;
      }
      const actor = req.account!;
      if (normalizeRole(actor.role) !== "admin") {
        res.status(403).json({ error: "Admin access is required." });
        return;
      }
      if (await isImpersonatedRequest(req)) {
        res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
        return;
      }
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }

      const target = normUsername(req.params.username);
      const configuredTarget = await configuredStagingSignupTestUsername();
      if (!configuredTarget || configuredTarget !== target) {
        res.status(403).json({ error: "Only the configured reusable staging signup account can be reset." });
        return;
      }
      const account = await getAccount(target);
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (normalizeRole(account.role) === "admin") {
        res.status(400).json({ error: "Admin accounts cannot be used as reusable signup test accounts." });
        return;
      }
      if (account.parent) {
        res.status(400).json({ error: "Only a top-level account can be reset to the new-account journey." });
        return;
      }

      const owners = await db
        .select({
          id: platformUsersTable.id,
          passwordHash: platformUsersTable.passwordHash,
          googleId: platformUsersTable.googleId,
          microsoftId: platformUsersTable.microsoftId,
        })
        .from(platformMembershipsTable)
        .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
        .where(and(
          eq(platformMembershipsTable.companySlug, target),
          eq(platformMembershipsTable.role, "owner"),
        ));
      const owner = owners[0];
      if (
        owners.length !== 1
        || !owner
        || (!owner.passwordHash && !owner.googleId && !owner.microsoftId)
      ) {
        res.status(400).json({ error: "Choose a dedicated account with one owner who can sign in." });
        return;
      }
      const ownerMemberships = await db
        .select({ companySlug: platformMembershipsTable.companySlug })
        .from(platformMembershipsTable)
        .where(eq(platformMembershipsTable.userId, owner.id));
      const companyMemberships = await db
        .select({ userId: platformMembershipsTable.userId })
        .from(platformMembershipsTable)
        .where(eq(platformMembershipsTable.companySlug, target));
      if (ownerMemberships.length !== 1 || companyMemberships.length !== 1) {
        res.status(400).json({
          error: "This reset requires a dedicated test login that belongs only to this workspace and has no team members.",
        });
        return;
      }
      const children = await db
        .select({ username: platformAccountsTable.username })
        .from(platformAccountsTable)
        .where(eq(platformAccountsTable.parent, target));
      if (children.length > 0) {
        res.status(400).json({ error: "Remove this account's client accounts before resetting it." });
        return;
      }
      const [company] = await db
        .select({
          stripeCustomerId: platformCompaniesTable.stripeCustomerId,
          stripeSubscriptionId: platformCompaniesTable.stripeSubscriptionId,
          subscriptionStatus: platformCompaniesTable.subscriptionStatus,
        })
        .from(platformCompaniesTable)
        .where(eq(platformCompaniesTable.slug, target))
        .limit(1);
      if (!company) {
        res.status(400).json({ error: "This account does not have a workspace record." });
        return;
      }
      if (
        company.stripeCustomerId
        || company.stripeSubscriptionId
        || (company.subscriptionStatus && company.subscriptionStatus !== "none")
      ) {
        res.status(400).json({
          error: "A Stripe-linked account cannot be reset. Use a dedicated staging account that has never entered checkout.",
        });
        return;
      }

      let deletedProjectCount = 0;

      const workspaceMetaKeys = [
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
      ].map((prefix) => `${prefix}${target}`);

      await db.transaction(async (tx) => {
        // Lock the account and company, then repeat every destructive
        // eligibility check inside the transaction. This prevents a reset from
        // proceeding on stale preflight state if membership, hierarchy, or
        // billing changes while the request is in flight.
        await tx.execute(sql`SELECT 1 FROM platform_accounts WHERE username = ${target} FOR UPDATE`);
        await tx.execute(sql`SELECT 1 FROM platform_companies WHERE slug = ${target} FOR UPDATE`);

        const [lockedAccount] = await tx
          .select({ role: platformAccountsTable.role, parent: platformAccountsTable.parent })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.username, target))
          .limit(1);
        const lockedOwners = await tx
          .select({
            id: platformUsersTable.id,
            email: platformUsersTable.email,
            passwordHash: platformUsersTable.passwordHash,
            googleId: platformUsersTable.googleId,
            microsoftId: platformUsersTable.microsoftId,
          })
          .from(platformMembershipsTable)
          .innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
          .where(and(
            eq(platformMembershipsTable.companySlug, target),
            eq(platformMembershipsTable.role, "owner"),
          ));
        const lockedOwner = lockedOwners[0];
        const lockedOwnerMemberships = lockedOwner
          ? await tx
            .select({ companySlug: platformMembershipsTable.companySlug })
            .from(platformMembershipsTable)
            .where(eq(platformMembershipsTable.userId, lockedOwner.id))
          : [];
        const lockedCompanyMemberships = await tx
          .select({ userId: platformMembershipsTable.userId })
          .from(platformMembershipsTable)
          .where(eq(platformMembershipsTable.companySlug, target));
        const lockedChildren = await tx
          .select({ username: platformAccountsTable.username })
          .from(platformAccountsTable)
          .where(eq(platformAccountsTable.parent, target));
        const [lockedCompany] = await tx
          .select({
            stripeCustomerId: platformCompaniesTable.stripeCustomerId,
            stripeSubscriptionId: platformCompaniesTable.stripeSubscriptionId,
            subscriptionStatus: platformCompaniesTable.subscriptionStatus,
          })
          .from(platformCompaniesTable)
          .where(eq(platformCompaniesTable.slug, target))
          .limit(1);
        const configuredEmail = configuredStagingSignupTestEmail();
        if (
          !lockedAccount
          || normalizeRole(lockedAccount.role) === "admin"
          || lockedAccount.parent
          || lockedOwners.length !== 1
          || !lockedOwner
          || lockedOwner.email?.trim().toLowerCase() !== configuredEmail
          || (!lockedOwner.passwordHash && !lockedOwner.googleId && !lockedOwner.microsoftId)
          || lockedOwnerMemberships.length !== 1
          || lockedCompanyMemberships.length !== 1
          || lockedChildren.length > 0
          || !lockedCompany
          || !!lockedCompany.stripeCustomerId
          || !!lockedCompany.stripeSubscriptionId
          || (!!lockedCompany.subscriptionStatus && lockedCompany.subscriptionStatus !== "none")
        ) {
          throw new Error("STAGING_TEST_ELIGIBILITY_CHANGED");
        }

        const lockedProjects = await tx
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(and(eq(projectsTable.owner, target), isNull(projectsTable.deletedAt)));
        deletedProjectCount = lockedProjects.length;

        const contacts = await tx
          .select({ id: mediaContactsTable.id })
          .from(mediaContactsTable)
          .where(eq(mediaContactsTable.accountId, target));
        const contactIds = contacts.map((row) => row.id);
        const outlets = await tx
          .select({ id: mediaOutletsTable.id })
          .from(mediaOutletsTable)
          .where(eq(mediaOutletsTable.accountId, target));
        const outletIds = outlets.map((row) => row.id);
        const categories = await tx
          .select({ id: mediaCategoriesTable.id })
          .from(mediaCategoriesTable)
          .where(eq(mediaCategoriesTable.accountId, target));
        const categoryIds = categories.map((row) => row.id);
        const recommendationSets = await tx
          .select({ id: mediaRecommendationSetsTable.id })
          .from(mediaRecommendationSetsTable)
          .where(eq(mediaRecommendationSetsTable.accountId, target));
        const recommendationSetIds = recommendationSets.map((row) => row.id);

        if (contactIds.length > 0) {
          await tx.update(mediaOutreachTable).set({ contactId: null }).where(inArray(mediaOutreachTable.contactId, contactIds));
          const [sharedRecommendationItem] = await tx
            .select({ id: mediaRecommendationItemsTable.id })
            .from(mediaRecommendationItemsTable)
            .innerJoin(
              mediaRecommendationSetsTable,
              eq(mediaRecommendationItemsTable.recommendationSetId, mediaRecommendationSetsTable.id),
            )
            .where(and(
              inArray(mediaRecommendationItemsTable.contactId, contactIds),
              ne(mediaRecommendationSetsTable.accountId, target),
            ))
            .limit(1);
          const [sharedDecision] = await tx
            .select({ id: mediaRecommendationDecisionsTable.id })
            .from(mediaRecommendationDecisionsTable)
            .where(and(
              inArray(mediaRecommendationDecisionsTable.contactId, contactIds),
              ne(mediaRecommendationDecisionsTable.accountId, target),
            ))
            .limit(1);
          if (sharedRecommendationItem || sharedDecision) {
            throw new Error("STAGING_TEST_SHARED_MEDIA");
          }
        }
        if (outletIds.length > 0) {
          await tx.update(mediaOutreachTable).set({ outletId: null }).where(inArray(mediaOutreachTable.outletId, outletIds));
          const [sharedOutletContact] = await tx
            .select({ id: mediaContactsTable.id })
            .from(mediaContactsTable)
            .where(and(
              inArray(mediaContactsTable.outletId, outletIds),
              sql`${mediaContactsTable.accountId} IS DISTINCT FROM ${target}`,
            ))
            .limit(1);
          if (sharedOutletContact) throw new Error("STAGING_TEST_SHARED_MEDIA");
        }
        if (categoryIds.length > 0) {
          const [sharedCategoryLink] = await tx
            .select({ id: mediaContactCategoriesTable.id })
            .from(mediaContactCategoriesTable)
            .where(and(
              inArray(mediaContactCategoriesTable.categoryId, categoryIds),
              sql`${mediaContactCategoriesTable.accountId} IS DISTINCT FROM ${target}`,
            ))
            .limit(1);
          if (sharedCategoryLink) throw new Error("STAGING_TEST_SHARED_MEDIA");
        }

        await tx.delete(mediaPlacementsTable).where(eq(mediaPlacementsTable.accountId, target));
        await tx.delete(mediaOutreachActivitiesTable).where(eq(mediaOutreachActivitiesTable.accountId, target));
        await tx.delete(mediaOutreachTable).where(eq(mediaOutreachTable.accountId, target));
        await tx.delete(mediaRecommendationDecisionsTable)
          .where(eq(mediaRecommendationDecisionsTable.accountId, target));
        if (recommendationSetIds.length > 0) {
          await tx.delete(mediaRecommendationItemsTable)
            .where(inArray(mediaRecommendationItemsTable.recommendationSetId, recommendationSetIds));
        }
        await tx.delete(mediaRecommendationSetsTable)
          .where(eq(mediaRecommendationSetsTable.accountId, target));
        if (contactIds.length > 0) {
          await tx.update(mediaOutreachTable).set({ contactId: null }).where(inArray(mediaOutreachTable.contactId, contactIds));
          await tx.delete(mediaContactCategoriesTable)
            .where(inArray(mediaContactCategoriesTable.contactId, contactIds));
          await tx.delete(mediaContactFieldOverridesTable)
            .where(inArray(mediaContactFieldOverridesTable.contactId, contactIds));
        }
        await tx.delete(mediaContactCategoriesTable).where(eq(mediaContactCategoriesTable.accountId, target));
        await tx.delete(mediaContactFieldOverridesTable).where(eq(mediaContactFieldOverridesTable.accountId, target));
        await tx.delete(mediaImportBatchesTable).where(eq(mediaImportBatchesTable.accountId, target));
        await tx.delete(mediaDiscoveriesTable).where(eq(mediaDiscoveriesTable.accountId, target));
        await tx.delete(mediaContactsTable).where(eq(mediaContactsTable.accountId, target));
        await tx.delete(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, target));
        await tx.delete(mediaCategoriesTable).where(eq(mediaCategoriesTable.accountId, target));

        await tx.delete(archiveItemsTable).where(eq(archiveItemsTable.owner, target));
        await tx.delete(plannerItemsTable).where(eq(plannerItemsTable.owner, target));
        await tx.delete(scoringConfigsTable).where(eq(scoringConfigsTable.owner, target));
        await tx.delete(auditLocksTable).where(eq(auditLocksTable.owner, target));
        await tx.delete(savedAuditsTable).where(eq(savedAuditsTable.owner, target));
        await tx.delete(savedDiagnosticsTable).where(eq(savedDiagnosticsTable.owner, target));
        await tx.delete(savedContentGeoTable).where(eq(savedContentGeoTable.owner, target));
        await tx.delete(savedTechGeoTable).where(eq(savedTechGeoTable.owner, target));
        await tx.delete(projectSnapshotsTable).where(eq(projectSnapshotsTable.owner, target));
        // Keep tombstone rows so the next browser sync removes locally cached
        // projects instead of treating them as missing server data to recover.
        await tx
          .update(projectsTable)
          .set({
            name: "",
            data: {},
            intake: null,
            logo: null,
            tier: null,
            deletedAt: new Date(),
          })
          .where(eq(projectsTable.owner, target));
        await tx.delete(tokenUsageTable).where(eq(tokenUsageTable.accountId, target));
        await tx.delete(platformInvitationsTable).where(eq(platformInvitationsTable.companySlug, target));
        await tx.delete(platformSessionsTable).where(eq(platformSessionsTable.username, target));
        await tx.delete(platformMetaTable).where(inArray(platformMetaTable.key, workspaceMetaKeys));

        await tx
          .update(platformAccountsTable)
          .set({ role: "agency", status: "active", maxSeats: null, website: null })
          .where(eq(platformAccountsTable.username, target));
        await tx.execute(sql`
          UPDATE platform_companies
          SET role = 'agency',
              status = 'active',
              max_seats = NULL,
              setup_complete = false,
              free_access = false,
              display_name = NULL,
              website = NULL,
              billing_email = NULL,
              key_account_holder_email = NULL,
              vat_number = NULL,
              billing_address = NULL,
              billing_address_version = NULL,
              plan = NULL,
              billing_frequency = NULL,
              subscription_status = NULL,
              current_period_end = NULL,
              beta_trial_started_at = NULL,
              beta_trial_ends_at = NULL
          WHERE slug = ${target}
        `);
        await tx.insert(platformMetaTable).values({
          key: onboardingKey(target),
          value: JSON.stringify({ step: "account_type" } satisfies OnboardingState),
        });
      });

      await logAdminEvent(
        { username: actor.username, id: actor.userId },
        "staging_test_account_reset",
        target,
        "account",
        { deletedProjectCount },
      );
      res.json({ ok: true, username: target, deletedProjectCount });
    } catch (error) {
      if (error instanceof Error && error.message === "STAGING_TEST_ELIGIBILITY_CHANGED") {
        res.status(409).json({
          error: "This account changed while the reset was starting. Review its team, clients, and billing state, then try again.",
        });
        return;
      }
      if (error instanceof Error && error.message === "STAGING_TEST_SHARED_MEDIA") {
        res.status(409).json({
          error: "This account has media records referenced by another workspace. Remove those shared references before resetting it.",
        });
        return;
      }
      logger.error({ err: error, target: req.params.username }, "staging test account reset failed");
      res.status(500).json({ error: "Failed to reset the staging test account." });
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
      // Guardrail: no account deletions while impersonating.
      if (await isImpersonatedRequest(req)) {
        res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
        return;
      }
      const actor = req.account!;
      // Master sub-roles: Technical / Operational Support members of the
      // master workspace may not delete accounts.
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }
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
      await deleteWorkspaceMetadata(target);
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
// account may call this on itself. Password accounts re-enter their password;
// SSO-only accounts provide a fresh, single-use provider confirmation.
// An account with active (non-archived) sub-accounts must remove or reassign
// them first - we never silently cascade-delete another account's data as a
// side effect of someone else's deletion request.
router.post(
  "/platform/account/self-delete",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      // Guardrail: no account deletions while impersonating.
      if (await isImpersonatedRequest(req)) {
        res.status(403).json({ error: IMPERSONATION_BLOCKED_MESSAGE });
        return;
      }
      const actor = req.account!;
      const username = normUsername(actor.username);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const account = await getAccount(username);
      if (!account) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      let confirmed = password ? verifyPassword(password, account.passwordHash) : false;
      if (!confirmed && req.body?.confirmation === "sso" && actor.userId) {
        const tokenConfirmed = await consumeDeleteConfirmation(req, res, actor.userId);
        const eligibleUser = await getPasswordlessOwnerForSsoDelete(actor);
        confirmed = tokenConfirmed && !!eligibleUser;
      }
      if (!confirmed) {
        const [actorUser] = actor.userId
          ? await db.select({ passwordHash: platformUsersTable.passwordHash })
              .from(platformUsersTable)
              .where(eq(platformUsersTable.id, actor.userId))
              .limit(1)
          : [];
        if (!password && actorUser?.passwordHash) {
          res.status(400).json({ error: "Enter your password to confirm." });
        } else {
          res.status(401).json({ error: password ? "Incorrect password." : "Re-authentication expired or was already used. Please try again." });
        }
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

      await db.transaction(async (tx) => {
        const contacts = await tx
          .select({ id: mediaContactsTable.id })
          .from(mediaContactsTable)
          .where(eq(mediaContactsTable.accountId, username));
        const contactIds = contacts.map((row) => row.id);
        const outlets = await tx
          .select({ id: mediaOutletsTable.id })
          .from(mediaOutletsTable)
          .where(eq(mediaOutletsTable.accountId, username));
        const outletIds = outlets.map((row) => row.id);
        const categories = await tx
          .select({ id: mediaCategoriesTable.id })
          .from(mediaCategoriesTable)
          .where(eq(mediaCategoriesTable.accountId, username));
        const categoryIds = categories.map((row) => row.id);
        const recommendationSets = await tx
          .select({ id: mediaRecommendationSetsTable.id })
          .from(mediaRecommendationSetsTable)
          .where(eq(mediaRecommendationSetsTable.accountId, username));
        const recommendationSetIds = recommendationSets.map((row) => row.id);

        await tx.delete(mediaPlacementsTable).where(eq(mediaPlacementsTable.accountId, username));
        await tx.delete(mediaOutreachActivitiesTable).where(eq(mediaOutreachActivitiesTable.accountId, username));
        await tx.delete(mediaOutreachTable).where(eq(mediaOutreachTable.accountId, username));
        // Private contacts can appear in another visible workspace's saved
        // recommendation history. Remove only those references, not the other
        // workspace's set or unrelated contacts.
        if (contactIds.length > 0) {
          await tx.update(mediaOutreachTable).set({ contactId: null }).where(inArray(mediaOutreachTable.contactId, contactIds));
          await tx.delete(mediaRecommendationItemsTable)
            .where(inArray(mediaRecommendationItemsTable.contactId, contactIds));
          await tx.delete(mediaRecommendationDecisionsTable)
            .where(inArray(mediaRecommendationDecisionsTable.contactId, contactIds));
          await tx.delete(mediaContactCategoriesTable)
            .where(inArray(mediaContactCategoriesTable.contactId, contactIds));
          await tx.delete(mediaContactFieldOverridesTable)
            .where(inArray(mediaContactFieldOverridesTable.contactId, contactIds));
        }
        if (recommendationSetIds.length > 0) {
          await tx.delete(mediaRecommendationItemsTable)
            .where(inArray(mediaRecommendationItemsTable.recommendationSetId, recommendationSetIds));
        }
        await tx.delete(mediaRecommendationDecisionsTable)
          .where(eq(mediaRecommendationDecisionsTable.accountId, username));
        await tx.delete(mediaRecommendationSetsTable)
          .where(eq(mediaRecommendationSetsTable.accountId, username));
        await tx.delete(mediaContactCategoriesTable)
          .where(eq(mediaContactCategoriesTable.accountId, username));
        if (categoryIds.length > 0) {
          await tx.delete(mediaContactCategoriesTable)
            .where(inArray(mediaContactCategoriesTable.categoryId, categoryIds));
        }
        await tx.delete(mediaContactFieldOverridesTable)
          .where(eq(mediaContactFieldOverridesTable.accountId, username));
        await tx.delete(mediaImportBatchesTable)
          .where(eq(mediaImportBatchesTable.accountId, username));
        await tx.delete(mediaDiscoveriesTable)
          .where(eq(mediaDiscoveriesTable.accountId, username));
        await tx.delete(mediaContactsTable).where(eq(mediaContactsTable.accountId, username));
        if (outletIds.length > 0) {
          await tx.update(mediaOutreachTable).set({ outletId: null }).where(inArray(mediaOutreachTable.outletId, outletIds));
          await tx.update(mediaContactsTable)
            .set({ outletId: null })
            .where(inArray(mediaContactsTable.outletId, outletIds));
        }
        await tx.delete(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, username));
        await tx.delete(mediaCategoriesTable).where(eq(mediaCategoriesTable.accountId, username));

        await tx.delete(archiveItemsTable).where(eq(archiveItemsTable.owner, username));
        await tx.delete(plannerItemsTable).where(eq(plannerItemsTable.owner, username));
        await tx.delete(scoringConfigsTable).where(eq(scoringConfigsTable.owner, username));
        await tx.delete(auditLocksTable).where(eq(auditLocksTable.owner, username));
        await tx.delete(savedAuditsTable).where(eq(savedAuditsTable.owner, username));
        await tx.delete(savedDiagnosticsTable).where(eq(savedDiagnosticsTable.owner, username));
        await tx.delete(savedContentGeoTable).where(eq(savedContentGeoTable.owner, username));
        await tx.delete(savedTechGeoTable).where(eq(savedTechGeoTable.owner, username));
        await tx.delete(projectSnapshotsTable).where(eq(projectSnapshotsTable.owner, username));
        await tx.delete(projectsTable).where(eq(projectsTable.owner, username));
        await tx.delete(tokenUsageTable).where(eq(tokenUsageTable.accountId, username));
        await tx.delete(platformSessionsTable).where(eq(platformSessionsTable.username, username));
        await tx.delete(platformMetaTable).where(inArray(
          platformMetaTable.key,
          [
            `account:last-sign-in:${username}`,
            `account:onboarding:v1:${username}`,
            `account:profile:${username}`,
            `account:archived:${username}`,
            `account:master-owner:${username}`,
            `account:managed:${username}`,
            `account:mfa:${username}`,
            `account:mfa-trusted:${username}`,
            `account:team-seats:${username}`,
            `account:image:logo:${username}`,
            `account:image:avatar:${username}`,
            `account-discount:${username}`,
            `projectAddons:${username}`,
            `checkout:pending:${username}`,
            `billing:last-payment:${username}`,
            `fairUsage:multiplier:${username}`,
            `spendLimit:monthly:gbp:${username}`,
            `suspended-via:${username}`,
          ],
        ));
        await tx.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, username));
        await tx.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, username));
        await tx.delete(platformAccountsTable).where(eq(platformAccountsTable.username, username));
      });

      void logAdminEvent({ username: actor.username, id: actor.userId }, "account_self_delete", username, "account", {
        role: account.role,
      });

      clearPlatformCookie(res);
      res.json({ ok: true });
    } catch (error) {
      logger.error({ err: error, username: req.account?.username }, "self-delete: failed");
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
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
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
      // Scope to the calling human user's own sessions. Multiple members of a
      // workspace share the slug, so slug-only scoping would expose other
      // members' sessions (email, name, IP hint). Legacy sessions without a
      // userId must never fall back to slug-wide listing: show only sessions
      // that are equally userId-less (i.e. other legacy logins of the same
      // legacy credential), never userId-backed member sessions.
      const all = await listPlatformSessions(account.username, account.userId);
      const sessions = account.userId
        ? all
        : all.filter((s) => !s.userId);
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
      // Non-admins may only resolve (and therefore revoke) sessions belonging
      // to their own userId. Workspace slugs are shared across members, so a
      // slug-scoped lookup would let any member revoke a colleague's session.
      let sessions;
      if (actor.role === "admin") {
        sessions = await listPlatformSessions(targetUsername);
      } else if (actor.userId) {
        sessions = await listPlatformSessions(targetUsername, actor.userId);
      } else {
        // Legacy session with no userId: never resolve against the slug-wide
        // list (it would include other members' sessions). Only sessions that
        // are equally userId-less (other logins of the same legacy credential)
        // are eligible.
        sessions = (await listPlatformSessions(targetUsername)).filter((s) => !s.userId);
      }
      const match = sessions.find((s) => maskSid(s.sid) === maskedParam);
      if (!match) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      // Defense in depth: even if the lookup ever widens, never let a
      // non-admin revoke a session owned by a different human user. For
      // legacy (userId-less) actors this also blocks any userId-backed target.
      if (actor.role !== "admin") {
        const sameHuman = actor.userId
          ? match.userId === actor.userId
          : !match.userId;
        if (!sameHuman) {
          res.status(403).json({ error: "You can only revoke your own sessions." });
          return;
        }
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
    if (isRestrictedMaster(req.account!)) {
      res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
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

    // Parent validation uses a two-pass strategy so batch parents are only
    // accepted when they were actually persisted (not just present in the
    // request). This closes two gaps:
    //   (a) A batch parent with an invalid password fails the validation below
    //       and is never inserted, so its slug never enters eligibleParents.
    //   (b) A batch parent whose username collides with an existing client
    //       account is skipped on conflict (rowCount = 0), so again the slug
    //       is never added, and the child client is correctly rejected.
    //
    // Phase 0: pre-populate eligible parents from the existing database so
    // that clients referencing pre-existing non-client accounts are accepted.
    const eligibleParents = new Set<string>();
    {
      const rows = await db
        .select({ username: platformAccountsTable.username, role: platformAccountsTable.role })
        .from(platformAccountsTable);
      for (const r of rows) {
        if (normalizeRole(r.role) !== "client") {
          eligibleParents.add(normUsername(r.username));
        }
      }
    }

    // Phase 1: insert all non-client (admin / legacy-user) accounts first.
    // Track which ones were actually written to the DB - only those are valid
    // parents for Phase 2.
    const clientRows: typeof incoming = [];
    for (const u of incoming) {
      const username = normUsername(u?.username);
      const password = typeof u?.password === "string" ? u.password : "";
      if (!username || !USERNAME_RE.test(username) || password.length < 1) continue;
      if (u?.role === "client") {
        clientRows.push(u);
        continue;
      }
      // Migration coerces all non-admin roles to the legacy "user" type.
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
        .onConflictDoNothing({ target: platformAccountsTable.username });
      if (result.rowCount) {
        inserted += result.rowCount;
        // Only successfully inserted (non-client) accounts are eligible parents.
        eligibleParents.add(username);
      }
    }

    // Phase 2: insert client-role accounts, validating each parent against
    // the confirmed eligible-parent set.
    for (const u of clientRows) {
      const username = normUsername(u?.username);
      const password = typeof u?.password === "string" ? u.password : "";
      if (!username || !USERNAME_RE.test(username) || password.length < 1) continue;
      const parent = normUsername(u?.parent);

      if (!parent) {
        logger.warn(
          { username },
          "platform migrate: skipping client-role account with no parent - it would be invisible to non-admin users. Re-create it via POST /api/platform/accounts to assign the correct parent.",
        );
        continue;
      }
      if (!eligibleParents.has(parent)) {
        logger.warn(
          { username, parent },
          "platform migrate: skipping client-role account whose parent does not exist or is itself a client. Re-create it via POST /api/platform/accounts after ensuring the parent account exists.",
        );
        continue;
      }
      // Client accounts are coerced to "user" (legacy localStorage role).
      const result = await db
        .insert(platformAccountsTable)
        .values({
          username,
          passwordHash: hashPassword(password),
          role: "user" as Role,
          parent,
        })
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
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
        return;
      }
      const target = normUsername(req.body?.username);
      const newRole = normalizeRole(req.body?.role);
      if (!target) {
        res.status(400).json({ error: "Username is required." });
        return;
      }
      if (!["agency", "client"].includes(newRole)) {
        res.status(400).json({ error: "Account type must be agency or client. Master access is managed through membership of the AIO Fusion workspace." });
        return;
      }
      if (target === DEFAULT_ADMIN_USERNAME) {
        res.status(400).json({ error: "The canonical AIO Fusion Master workspace account type cannot be changed." });
        return;
      }
      const accountTypeRole = newRole as "agency" | "client";
      const existing = await getAccount(target);
      if (!existing) {
        res.status(404).json({ error: "Account not found." });
        return;
      }
      if (existing.role === accountTypeRole) {
        res.json({ ok: true });
        return;
      }
      const prevRole = existing.role;
      const transition = await transitionWorkspaceAccountType(target, accountTypeRole);
      if (!transition.ok) {
        res.status(transition.reason === "missing" ? 404 : 400).json({
          error: transition.reason === "seat_limit"
            ? `This workspace has ${transition.seatsUsed} team seats in use, above its Client limit of ${transition.seatLimit}. Remove team members or pending invites before changing account type.`
            : "Account workspace not found.",
          ...(transition.reason === "seat_limit" ? { limitReached: true } : {}),
        });
        return;
      }
      if (accountTypeRole !== "client") {
        await sweepTeamViolationsForCompany(target, {
          username: actor.username,
          id: actor.userId,
        });
      }
      // Membership roles describe a person's permissions *inside* a
      // workspace. They are intentionally independent of the workspace's
      // account type: changing an account type must never promote every team
      // member to owner. The sweep above changes only roles made invalid by
      // the new team model.
      void logAdminEvent(
        { username: actor.username, id: actor.userId },
        "account_role_change",
        target,
        "account",
        { previousRole: prevRole, newRole },
      );
      // Tell the account owner by email. Fire-and-forget - the role change
      // has already been committed, so a mail failure must not fail the API.
      void (async () => {
        try {
          const owner = await getAccountOwnerContact(target);
          if (!owner) return;
          await sendAccountTypeChangedEmail({
            toEmail: owner.email,
            contactName: owner.name,
            previousType: prevRole,
            newType: newRole,
            changedByAdmin: true,
          });
        } catch (err) {
          logger.warn({ err, target }, "accounts/role: failed to send account type email (non-fatal)");
        }
      })();
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
      if (isRestrictedMaster(actor)) {
        res.status(403).json({ error: MASTER_OWNER_REQUIRED_MESSAGE });
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
const personalAvatarKey = (userId: string) => `user:image:avatar:${userId}`;
const googleAvatarOptOutKey = (userId: string) => `user:image:google-opt-out:${userId}`;
const personalAvatarLockKey = (userId: string) => `personal-avatar:${userId}`;
// ~600KB of base64 ≈ 450KB image - plenty for a resized avatar/logo.
const MAX_IMAGE_DATA_URL_LENGTH = 800_000;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

async function maybeImportGoogleAvatar(
  userId: string,
  username: string,
  canMigrateLegacy: boolean,
  picture?: string,
): Promise<void> {
  if (!picture) return;
  try {
    const avatarKey = personalAvatarKey(userId);
    const legacyKey = canMigrateLegacy ? profileImageKey("avatar", username) : null;
    const candidateKeys = [
      avatarKey,
      googleAvatarOptOutKey(userId),
      ...(legacyKey ? [legacyKey] : []),
    ];
    const currentRows = await db
      .select({ key: platformMetaTable.key, value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(inArray(platformMetaTable.key, candidateKeys));
    if (currentRows.some((row) => row.key === avatarKey || row.key === googleAvatarOptOutKey(userId))) {
      return;
    }
    const legacyAvatar = legacyKey
      ? currentRows.find((row) => row.key === legacyKey && DATA_URL_RE.test(row.value))
      : undefined;
    if (legacyAvatar) {
      await db.transaction(async (tx) => {
        if (process.env.NODE_ENV !== "test") {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personalAvatarLockKey(userId)}))`);
        }
        const lockedRows = await tx
          .select({ key: platformMetaTable.key })
          .from(platformMetaTable)
          .where(inArray(platformMetaTable.key, [avatarKey, googleAvatarOptOutKey(userId)]));
        if (lockedRows.length > 0) return;
        await tx
          .insert(platformMetaTable)
          .values({ key: avatarKey, value: legacyAvatar.value })
          .onConflictDoNothing({ target: platformMetaTable.key });
        await tx.delete(platformMetaTable).where(eq(platformMetaTable.key, legacyAvatar.key));
      });
      return;
    }
    const dataUrl = await fetchGoogleAvatarDataUrl(picture);
    if (!dataUrl || dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) return;
    await db.transaction(async (tx) => {
      if (process.env.NODE_ENV !== "test") {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personalAvatarLockKey(userId)}))`);
      }
      const existingRows = await tx
        .select({ key: platformMetaTable.key, value: platformMetaTable.value })
        .from(platformMetaTable)
        .where(inArray(platformMetaTable.key, candidateKeys));
      if (existingRows.some((row) => row.key === avatarKey || row.key === googleAvatarOptOutKey(userId))) {
        return;
      }
      const lockedLegacyAvatar = legacyKey
        ? existingRows.find((row) => row.key === legacyKey && DATA_URL_RE.test(row.value))
        : undefined;
      if (lockedLegacyAvatar) {
        await tx
          .insert(platformMetaTable)
          .values({ key: avatarKey, value: lockedLegacyAvatar.value })
          .onConflictDoNothing({ target: platformMetaTable.key });
        await tx.delete(platformMetaTable).where(eq(platformMetaTable.key, lockedLegacyAvatar.key));
        return;
      }
      await tx
        .insert(platformMetaTable)
        .values({ key: avatarKey, value: dataUrl })
        .onConflictDoNothing({ target: platformMetaTable.key });
    });
  } catch (error) {
    logger.warn({ err: error, userId }, "Google profile photo import failed");
  }
}

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
    const imageKind = kind as ImageKind;
    if (imageKind === "avatar" && req.account!.userId) {
      const userId = req.account!.userId;
      await db.transaction(async (tx) => {
        if (process.env.NODE_ENV !== "test") {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personalAvatarLockKey(userId)}))`);
        }
        await tx
          .insert(platformMetaTable)
          .values({ key: personalAvatarKey(userId), value: dataUrl })
          .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: dataUrl } });
      });
    } else {
      const key = profileImageKey(imageKind, req.account!.username);
      await db
        .insert(platformMetaTable)
        .values({ key, value: dataUrl })
        .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: dataUrl } });
    }
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
    if (kind === "avatar" && req.account!.userId) {
      const userId = req.account!.userId;
      const ownedWorkspaces = await db
        .select({ slug: platformCompaniesTable.slug })
        .from(platformMembershipsTable)
        .innerJoin(platformCompaniesTable, eq(platformMembershipsTable.companyId, platformCompaniesTable.id))
        .where(and(
          eq(platformMembershipsTable.userId, userId),
          eq(platformMembershipsTable.role, "owner"),
        ));
      const legacyKeys = Array.from(new Set([
        profileImageKey("avatar", req.account!.username),
        ...ownedWorkspaces.map(({ slug }) => profileImageKey("avatar", slug)),
      ]));
      await db.transaction(async (tx) => {
        if (process.env.NODE_ENV !== "test") {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${personalAvatarLockKey(userId)}))`);
        }
        await tx
          .delete(platformMetaTable)
          .where(inArray(platformMetaTable.key, [
            personalAvatarKey(userId),
            ...legacyKeys,
          ]));
        await tx
          .insert(platformMetaTable)
          .values({ key: googleAvatarOptOutKey(userId), value: "true" })
          .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: "true" } });
      });
    } else {
      await db
        .delete(platformMetaTable)
        .where(eq(platformMetaTable.key, profileImageKey(kind as ImageKind, req.account!.username)));
    }
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
    const imageKind = kind as ImageKind;
    const keys = imageKind === "avatar" && req.account!.userId
      ? [
          personalAvatarKey(req.account!.userId),
          ...(req.account!.membershipRole == null || req.account!.membershipRole === "owner"
            ? [profileImageKey("avatar", req.account!.username)]
            : []),
        ]
      : [profileImageKey(imageKind, req.account!.username)];
    const rows = await db
      .select()
      .from(platformMetaTable)
      .where(inArray(platformMetaTable.key, keys));
    const row = rows.find((candidate) => candidate.key === keys[0]) ?? rows[0];
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

// Fetch the logo of a managed client account. The caller must be the parent
// agency (or an admin) for the requested account - same canManage hierarchy
// as other managed-account endpoints. Returns the binary image or 404.
router.get(
  "/platform/accounts/:username/logo",
  requirePlatformAuth,
  async (req: Request, res: Response) => {
    try {
      const actor = req.account!;
      const target = normUsername(req.params.username);
      if (!target) {
        res.status(400).json({ error: "Invalid username" });
        return;
      }
      // An account may always fetch its own logo; others require canManage.
      if (normUsername(actor.username) !== target && !(await canManage(actor, target))) {
        res.status(403).json({ error: "You are not authorised to view that account's logo." });
        return;
      }
      const [row] = await db
        .select()
        .from(platformMetaTable)
        .where(eq(platformMetaTable.key, profileImageKey("logo", target)))
        .limit(1);
      if (!row?.value || !DATA_URL_RE.test(row.value)) {
        res.status(404).json({ error: "No logo" });
        return;
      }
      const [, mime] = row.value.match(/^data:(image\/[a-z]+);base64,/) ?? [];
      const base64 = row.value.slice(row.value.indexOf(",") + 1);
      const buf = Buffer.from(base64, "base64");
      res.setHeader("Content-Type", mime || "image/png");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(buf);
    } catch {
      res.status(500).json({ error: "Failed to load logo" });
    }
  },
);

export default router;

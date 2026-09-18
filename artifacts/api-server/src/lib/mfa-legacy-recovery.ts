import crypto from "node:crypto";
import {
  db, platformUsersTable, platformCompaniesTable, platformAccountsTable,
  platformMembershipsTable, platformMetaTable, platformSessionsTable, adminEventsTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { isStagingDeployment } from "./app-url";
import {
  type MfaDb, getMfaState, mfaKey, migrationApprovalKey, reenrollmentKey,
  legacyRecoveryAuthorizationKey, createMfaPendingToken, totpCode, trustedKey,
} from "./mfa";
import { sendMfaLegacyRecoveryEmail } from "./notify-email";
import { logger } from "./logger";

// This route is an explicitly approved *individual enrollment* proof, not an
// operator reset or attribution/move of the shared authenticator. Never accept
// user IDs, provider claims or workspace choices from a recovery request.
const PURPOSE = "staging-master-google-legacy-recovery:v1";
export const LEGACY_RECOVERY_TTL_MS = 5 * 60 * 1000;
const DENIED = "Individual recovery is unavailable. Sign in again or contact an authorised Master Owner.";
const nonceKey = (nonce: string) => `mfa-legacy-recovery:nonce:${nonce}`;
interface RecoveryPayload {
  purpose: typeof PURPOSE;
  uid: string;
  cid: string;
  email: string;
  googleId: string;
  g: number;
  jti: string;
  iat: number;
  exp: number;
}
export class LegacyRecoveryError extends Error {
  constructor(message = DENIED, readonly status = 403) { super(message); }
}
function signature(body: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new LegacyRecoveryError();
  // Domain separation also prevents generic pending/trusted-device verifiers
  // from accepting this token, even if a payload is accidentally extended.
  return crypto.createHmac("sha256", secret).update(`${PURPOSE}:${body}`).digest("base64url");
}
function sign(payload: RecoveryPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body)}`;
}
function parse(token: unknown): RecoveryPayload {
  if (!isStagingDeployment() || typeof token !== "string" || token.length > 4096) throw new LegacyRecoveryError();
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) throw new LegacyRecoveryError();
  const expected = signature(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new LegacyRecoveryError();
  let p: RecoveryPayload;
  try { p = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { throw new LegacyRecoveryError(); }
  const now = Date.now();
  if (!p || p.purpose !== PURPOSE || !Number.isInteger(p.g)
    || !Number.isFinite(p.iat) || !Number.isFinite(p.exp) || p.iat > now
    || p.exp <= now || p.exp <= p.iat || p.exp - p.iat > LEGACY_RECOVERY_TTL_MS
    || ![p.uid, p.cid, p.email, p.googleId, p.jti].every(v => typeof v === "string" && v.length > 0)) throw new LegacyRecoveryError();
  return p;
}
async function meta(tx: MfaDb, key: string) {
  const [row] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, key)).limit(1);
  return row;
}

async function eligible(tx: MfaDb, p: Pick<RecoveryPayload, "uid" | "email" | "googleId"> & Partial<RecoveryPayload>) {
  // Use the same human/company row locks as enrollment and membership changes.
  // The shared legacy row serializes the TOTP replay ledger across all Owners.
  await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${p.uid} FOR UPDATE`);
  await tx.execute(sql`SELECT id FROM platform_companies WHERE slug = 'admin' FOR UPDATE`);
  await tx.execute(sql`SELECT username FROM platform_accounts WHERE username = 'admin' FOR UPDATE`);
  await tx.execute(sql`SELECT user_id FROM platform_memberships WHERE user_id = ${p.uid} AND company_slug = 'admin' FOR UPDATE`);
  await tx.execute(sql`SELECT key FROM platform_meta WHERE key = 'account:mfa:admin' FOR UPDATE`);
  const [user] = await tx.select().from(platformUsersTable).where(eq(platformUsersTable.id, p.uid)).limit(1);
  const [company] = await tx.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "admin")).limit(1);
  const [account] = await tx.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "admin")).limit(1);
  const [member] = await tx.select().from(platformMembershipsTable).where(and(
    eq(platformMembershipsTable.userId, p.uid), eq(platformMembershipsTable.companySlug, "admin"),
  )).limit(1);
  if (!isStagingDeployment() || !user || user.emailVerified !== true
    || user.googleId !== p.googleId || user.email?.trim().toLowerCase() !== p.email
    || (p.g !== undefined && user.sessionVersion !== p.g)
    || !company || company.status !== "active" || company.role !== "admin" || company.parentSlug
    || !account || account.status !== "active" || account.role !== "admin" || account.parent
    || !member || member.role !== "owner" || member.companyId !== company.id
    || (p.cid !== undefined && p.cid !== company.id)) throw new LegacyRecoveryError();
  const forbidden = await tx.select().from(platformMetaTable).where(inArray(platformMetaTable.key, [
    "account:archived:admin", "account:managed:admin",
    `master-membership-revoked:${company.id}:${user.id}`,
    mfaKey(`user:${user.id}`), migrationApprovalKey(user.id), legacyRecoveryAuthorizationKey(user.id), reenrollmentKey(user.id),
  ]));
  const legacy = await getMfaState("legacy:admin", tx);
  if (forbidden.length || !legacy?.enabled) throw new LegacyRecoveryError();
  return { user, company, legacy };
}

/** Called ONLY after a fresh Google code exchange, before any OAuth identity
 * linking/provisioning/verification writes. Inputs are server-fetched userinfo.
 * Null means the existing conservative login/migration gate must handle it. */
export async function issueGoogleLegacyRecovery(profile: {
  provider: "google"; googleId: string; email: string; emailVerified: boolean;
}): Promise<string | null> {
  if (!isStagingDeployment() || profile.provider !== "google" || profile.emailVerified !== true || !profile.googleId) return null;
  return db.transaction(async tx => {
    const [user] = await tx.select().from(platformUsersTable).where(eq(platformUsersTable.googleId, profile.googleId)).limit(1);
    if (!user) return null;
    const identity = { uid: user.id, email: profile.email.trim().toLowerCase(), googleId: profile.googleId };
    let live;
    try { live = await eligible(tx, identity); } catch (err) {
      if (err instanceof LegacyRecoveryError) return null;
      throw err;
    }
    const iat = Date.now();
    const payload: RecoveryPayload = {
      ...identity, purpose: PURPOSE, cid: live.company.id, g: live.user.sessionVersion,
      jti: crypto.randomUUID(), iat, exp: iat + LEGACY_RECOVERY_TTL_MS,
    };
    const token = sign(payload);
    await tx.insert(platformMetaTable).values({ key: nonceKey(payload.jti), value: JSON.stringify(payload) });
    return token;
  });
}
async function validate(tx: MfaDb, p: RecoveryPayload) {
  const live = await eligible(tx, p);
  const nonce = await meta(tx, nonceKey(p.jti));
  if (p.exp <= Date.now() || !nonce || nonce.value !== JSON.stringify(p)) throw new LegacyRecoveryError();
  return live;
}
export async function legacyRecoveryStatus(recoveryToken: unknown): Promise<{ email: string }> {
  const p = parse(recoveryToken);
  return db.transaction(async tx => {
    await validate(tx, p);
    return { email: p.email };
  });
}
export interface LegacyRecoveryResult { mfaEnrollRequired: true; mfaToken: string; email: string }
export async function recoverLegacyMfa(recoveryToken: unknown, code: unknown): Promise<LegacyRecoveryResult> {
  const p = parse(recoveryToken);
  const result = await db.transaction(async tx => {
    const { user, legacy } = await validate(tx, p);
    const lockKey = `mfa-legacy-recovery:lockout:${user.id}`;
    const prior = await meta(tx, lockKey);
    const lock = prior ? JSON.parse(prior.value) as { failures: number; at: number; until: number } : null;
    const now = Date.now();
    if (lock && lock.until > now) return { error: new LegacyRecoveryError("Too many invalid codes. Please wait before trying again.", 429) };
    const clean = typeof code === "string" ? code.replace(/\s+/g, "") : "";
    const currentStep = Math.floor(now / 30_000);
    // Record every matching timestep (rare six-digit collisions included).
    const steps = /^\d{6}$/.test(clean) ? [currentStep - 1, currentStep, currentStep + 1].filter(step =>
      crypto.timingSafeEqual(Buffer.from(totpCode(legacy.secret, step * 30_000)), Buffer.from(clean))) : [];
    const factorId = crypto.createHash("sha256").update(legacy.secret).digest("hex");
    const replayKeys = steps.map(step => `mfa-legacy-recovery:step:${factorId}:${step}`);
    const used = replayKeys.length ? await tx.select().from(platformMetaTable).where(inArray(platformMetaTable.key, replayKeys)) : [];
    if (!steps.length || used.length) {
      const failures = lock && now - lock.at < 3_600_000 ? lock.failures + 1 : 1;
      const until = failures >= 5 ? now + Math.min(60_000 * 2 ** (failures - 5), 900_000) : 0;
      const value = JSON.stringify({ failures, at: now, until });
      await tx.insert(platformMetaTable).values({ key: lockKey, value })
        .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
      // Return instead of throwing so the durable failure counter commits.
      return { error: new LegacyRecoveryError("Invalid or already used authenticator code.", 400) };
    }
    await tx.insert(platformMetaTable).values(replayKeys.map(key => ({ key, value: String(now) })));
    const consumed = await tx.delete(platformMetaTable).where(eq(platformMetaTable.key, nonceKey(p.jti))).returning();
    if (consumed.length !== 1) throw new LegacyRecoveryError();
    const generation = user.sessionVersion + 1;
    await tx.update(platformUsersTable).set({ sessionVersion: generation }).where(eq(platformUsersTable.id, user.id));
    await tx.delete(platformSessionsTable).where(eq(platformSessionsTable.userId, user.id));
    await tx.delete(platformMetaTable).where(inArray(platformMetaTable.key, [trustedKey(`user:${user.id}`), lockKey]));
    // Deliberately distinct from an operator approval marker. No factor is
    // copied or created here; normal setup generates a new random secret.
    await tx.insert(platformMetaTable).values([
      { key: legacyRecoveryAuthorizationKey(user.id), value: JSON.stringify({ method: PURPOSE, at: now, generation }) },
      { key: reenrollmentKey(user.id), value: "true" },
    ]);
    await tx.insert(adminEventsTable).values({
      actorId: user.id, actorUsername: "admin", action: "mfa_legacy_individual_recovery",
      targetId: user.id, targetType: "user",
      metadata: { method: "verified-google-and-legacy-totp", environment: "staging", companyId: p.cid },
    });
    return { user, mfaToken: createMfaPendingToken({ u: "admin", uid: user.id, cid: p.cid, role: "admin", mode: "enroll", g: generation }) };
  });
  if ("error" in result) throw result.error;
  // Existing notification transport; neither codes nor tokens enter the notice
  // or logs. Failure must not roll back a committed, single-use recovery.
  try { await sendMfaLegacyRecoveryEmail({ toEmail: p.email, toName: result.user.name || p.email }); }
  catch { logger.warn("MFA individual recovery security notice could not be sent"); }
  return { mfaEnrollRequired: true, mfaToken: result.mfaToken, email: p.email };
}
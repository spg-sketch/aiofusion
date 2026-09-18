import crypto from "crypto";
import { db, platformMetaTable, platformUsersTable, platformSessionsTable, platformMembershipsTable, platformCompaniesTable, platformAccountsTable } from "@workspace/db";
import { and, eq, like, sql, inArray } from "drizzle-orm";

// TOTP two-factor authentication (RFC 6238, HMAC-SHA1, 30s step, 6 digits)
// implemented on node's crypto so no external dependency is needed.
//
// Named identities use stable platform_users IDs (person:mfa:<id>).
// Old account:mfa:<slug> records are never interpreted as a human's factor:
// legitimate non-Master userless credentials retain an isolated legacy subject,
// while named users pass the conservative migration/recovery gate below.
//
// State shape (JSON):
//   { secret, enabled, recoveryHashes: string[], updatedAt }
// `enabled: false` with a secret present = enrolment started but not confirmed.

export const MFA_PREFIX = "account:mfa:";
export type MfaDb = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;
export function mfaSubject(identity: { userId?: string | null; username: string }): string {
  return identity.userId ? `user:${identity.userId}` : `legacy:${identity.username.trim().toLowerCase()}`;
}
// Bare slugs are retained only for offline legacy tooling; request handlers must
// always supply an explicit subject. Personal keys can never collide with slugs.
export const mfaKey = (subject: string) => subject.startsWith("user:")
  ? `person:mfa:${subject.slice(5)}` : `${MFA_PREFIX}${subject.replace(/^legacy:/, "").trim().toLowerCase()}`;
export const migrationApprovalKey = (userId: string) => `person:mfa-migration-approved:${userId}`;
export const reenrollmentKey = (userId: string) => `person:mfa-reenroll:${userId}`;

export async function getMfaGeneration(subject: string, tx: MfaDb = db): Promise<number> {
  if (subject.startsWith("user:")) {
    const [user] = await tx.select({ version: platformUsersTable.sessionVersion }).from(platformUsersTable)
      .where(eq(platformUsersTable.id, subject.slice(5))).limit(1);
    if (!user) throw new Error("MFA identity no longer exists");
    return user.version;
  }
  const [row] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, `mfa-generation:${subject}`)).limit(1);
  return row ? Number(row.value) : 0;
}

export async function getPersonalMfaStatus(userId: string, tx: MfaDb = db) {
  const state = await getMfaState(`user:${userId}`, tx);
  const [recovery] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, reenrollmentKey(userId))).limit(1);
  return { enabled: state?.enabled === true, recoveryCodesRemaining: state?.recoveryHashes.length ?? 0,
    recoveryRequired: !!recovery, migrationRequired: await personalMfaMigrationRequired(userId, tx) };
}

export async function personalMfaMigrationRequired(userId: string, tx: MfaDb = db): Promise<boolean> {
  if ((await getMfaState(`user:${userId}`, tx))?.enabled) return false;
  const [approved] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, migrationApprovalKey(userId))).limit(1);
  if (approved) return false;
  const memberships = await tx.select({ slug: platformMembershipsTable.companySlug }).from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.userId, userId));
  for (const membership of memberships) {
    // Every member of an historically protected workspace is gated. Never
    // guess which member owned an old shared factor from creation order.
    if ((await getMfaState(`legacy:${membership.slug}`, tx))?.enabled) return true;
  }
  return false;
}

export async function resetPersonalMfa(userId: string, transaction?: MfaDb): Promise<void> {
  const reset = async (tx: MfaDb) => {
    await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${userId} FOR UPDATE`);
    const subject = `user:${userId}`;
    await getMfaGeneration(subject, tx); // reject deleted / nonexistent targets
    await tx.update(platformUsersTable).set({ sessionVersion: sql`${platformUsersTable.sessionVersion} + 1` })
      .where(eq(platformUsersTable.id, userId));
    await tx.delete(platformMetaTable).where(inArray(platformMetaTable.key, [
      mfaKey(subject), trustedKey(subject), `login-lockout:${subject}`, `login-lockout:mfa:${subject}`,
    ]));
    await tx.delete(platformSessionsTable).where(eq(platformSessionsTable.userId, userId));
    await tx.insert(platformMetaTable).values({ key: migrationApprovalKey(userId), value: "explicit-personal-recovery" })
      .onConflictDoNothing();
    await tx.insert(platformMetaTable).values({ key: reenrollmentKey(userId), value: "true" }).onConflictDoNothing();
  };
  if (transaction) await reset(transaction); else await db.transaction(reset);
}

export async function validateMfaIdentity(identity: { username: string; userId?: string; activeCompanyId?: string }, tx: MfaDb = db) {
  const slug = identity.username.trim().toLowerCase();
  const [account] = await tx.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, slug)).limit(1);
  if (!account || account.status === "suspended") throw new Error("Account access is unavailable");
  const flags = await tx.select().from(platformMetaTable).where(inArray(platformMetaTable.key, [`account:archived:${slug}`, `account:managed:${slug}`]));
  if (flags.length) throw new Error("Account access is unavailable");
  if (identity.userId) {
    const [user] = await tx.select().from(platformUsersTable).where(eq(platformUsersTable.id, identity.userId)).limit(1);
    const [membership] = await tx.select({ companyId: platformMembershipsTable.companyId, role: platformCompaniesTable.role, status: platformCompaniesTable.status })
      .from(platformMembershipsTable).innerJoin(platformCompaniesTable, eq(platformMembershipsTable.companyId, platformCompaniesTable.id))
      .where(and(eq(platformMembershipsTable.userId, identity.userId), eq(platformMembershipsTable.companySlug, slug))).limit(1);
    if (!user || user.emailVerified === false || !membership || membership.status === "suspended"
      || (identity.activeCompanyId && identity.activeCompanyId !== membership.companyId)) throw new Error("Membership access was revoked");
    // Master membership anywhere requires personal assurance even when a
    // different workspace is selected as the landing page.
    const [master] = await tx.select().from(platformMembershipsTable)
      .where(and(eq(platformMembershipsTable.userId, identity.userId), eq(platformMembershipsTable.companySlug, "admin"))).limit(1);
    const [reenrollment] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, reenrollmentKey(identity.userId))).limit(1);
    return { required: !!master || !!reenrollment, email: user.email, role: slug === "admin" ? "admin" : account.role === "admin" ? "agency" : account.role, companyId: membership.companyId };
  }
  // A named Master roster retires the shared bootstrap identity permanently;
  // deployment must not revive it to recover personal MFA.
  if (slug === "admin") throw new Error("Use your approved personal Master sign-in");
  // Isolated compatibility only: a legacy credential may not sidestep a named
  // roster, or revive a retained identity whose membership was revoked.
  const [namedMember] = await tx.select({ userId: platformMembershipsTable.userId }).from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.companySlug, slug)).limit(1);
  const [retainedHuman] = account.email ? await tx.select({ id: platformUsersTable.id }).from(platformUsersTable)
    .where(sql`lower(${platformUsersTable.email}) = ${account.email.trim().toLowerCase()}`).limit(1) : [];
  if (namedMember || retainedHuman) throw new Error("Sign in with your personal email address");
  return { required: false, email: null, role: account.role, companyId: undefined };
}

export interface MfaState {
  secret: string; // base32
  enabled: boolean;
  recoveryHashes: string[]; // sha256 hex of unused recovery codes
  updatedAt?: string;
}

export async function getMfaState(username: string, tx: MfaDb = db): Promise<MfaState | null> {
  const [row] = await tx
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, mfaKey(username)))
    .limit(1);
  if (!row?.value) return null;
  try {
    const obj = JSON.parse(row.value) as Partial<MfaState>;
    if (typeof obj.secret !== "string" || !obj.secret || typeof obj.enabled !== "boolean" || !Array.isArray(obj.recoveryHashes)) throw new Error("Invalid MFA state");
    return {
      secret: obj.secret,
      enabled: obj.enabled === true,
      recoveryHashes: Array.isArray(obj.recoveryHashes) ? obj.recoveryHashes.filter((h): h is string => typeof h === "string") : [],
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
    };
  } catch {
    throw new Error("MFA security state is unreadable");
  }
}

// Compare-and-swap prevents concurrent enrollment / recovery requests from
// overwriting an active factor or consuming the same recovery code twice.
export async function replaceMfaState(subject: string, previous: MfaState, next: MfaState | null, generation?: number): Promise<boolean> {
  return db.transaction(async tx => {
  if (subject.startsWith("user:")) await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${subject.slice(5)} FOR UPDATE`);
  if (generation !== undefined && await getMfaGeneration(subject, tx) !== generation) return false;
  const condition = and(eq(platformMetaTable.key, mfaKey(subject)),
    sql`${platformMetaTable.value}::jsonb->>'secret' = ${previous.secret}`,
    sql`coalesce(${platformMetaTable.value}::jsonb->>'updatedAt', '') = ${previous.updatedAt ?? ""}`,
    sql`${platformMetaTable.value}::jsonb->>'enabled' = ${String(previous.enabled)}`);
  const rows = next
    ? await tx.update(platformMetaTable).set({ value: JSON.stringify({ ...next, updatedAt: crypto.randomUUID() }) }).where(condition).returning()
    : await tx.delete(platformMetaTable).where(condition).returning();
  if (rows.length && next?.enabled && !previous.enabled && subject.startsWith("user:")) {
    await tx.delete(platformMetaTable).where(eq(platformMetaTable.key, reenrollmentKey(subject.slice(5))));
  }
  if (rows.length && !next) {
    await tx.delete(platformMetaTable).where(eq(platformMetaTable.key, trustedKey(subject)));
    if (subject.startsWith("user:")) {
      await tx.update(platformUsersTable).set({ sessionVersion: sql`${platformUsersTable.sessionVersion} + 1` }).where(eq(platformUsersTable.id, subject.slice(5)));
      await tx.delete(platformSessionsTable).where(eq(platformSessionsTable.userId, subject.slice(5)));
    } else {
      const version = await getMfaGeneration(subject, tx);
      await tx.insert(platformMetaTable).values({ key: `mfa-generation:${subject}`, value: String(version + 1) })
        .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: String(version + 1) } });
    }
  }
  return rows.length === 1;
  });
}

export async function beginMfaEnrollment(subject: string, generation?: number): Promise<MfaState> {
  return db.transaction(async tx => {
  if (subject.startsWith("user:")) await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${subject.slice(5)} FOR UPDATE`);
  if (generation !== undefined && await getMfaGeneration(subject, tx) !== generation) throw new Error("Sign in again");
  await tx.insert(platformMetaTable).values({ key: mfaKey(subject), value: JSON.stringify({
    secret: generateTotpSecret(), enabled: false, recoveryHashes: [], updatedAt: crypto.randomUUID(),
  }) }).onConflictDoNothing();
  const state = await getMfaState(subject, tx);
  if (!state || state.enabled) throw new Error("Two-factor authentication is already enabled");
  return state;
  });
}

export async function saveMfaState(username: string, state: MfaState): Promise<void> {
  const value = JSON.stringify({ ...state, updatedAt: new Date().toISOString() });
  await db
    .insert(platformMetaTable)
    .values({ key: mfaKey(username), value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

// Usernames (normalised) of all accounts with MFA fully enabled. Used by the
// admin accounts list so it can badge enrolled accounts without N queries.
export async function getMfaEnabledSet(): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${MFA_PREFIX}%`));
  const enabled = new Set<string>();
  const memberships = await db.select({ slug: platformMembershipsTable.companySlug }).from(platformMembershipsTable);
  const personalWorkspaces = new Set(memberships.map(row => row.slug));
  for (const row of rows) {
    try {
      const obj = JSON.parse(row.value ?? "") as Partial<MfaState>;
      if (obj.enabled === true && typeof obj.secret === "string" && obj.secret) {
        const slug = row.key.slice(MFA_PREFIX.length);
        if (slug !== "admin" && !personalWorkspaces.has(slug)) enabled.add(slug);
      }
    } catch {
      /* ignore malformed rows */
    }
  }
  return enabled;
}

export async function clearMfaState(username: string): Promise<void> {
  await db.delete(platformMetaTable).where(eq(platformMetaTable.key, mfaKey(username)));
}

// --- Base32 (RFC 4648, no padding) ------------------------------------------

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// --- TOTP --------------------------------------------------------------------

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20)); // 160-bit secret
}

function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function totpCode(secretB32: string, timeMs = Date.now(), stepSec = 30): string {
  return hotp(base32Decode(secretB32), Math.floor(timeMs / 1000 / stepSec));
}

// Verify with a ±1 step window to tolerate clock drift.
export function verifyTotp(secretB32: string, code: string, timeMs = Date.now()): boolean {
  const clean = (code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(timeMs / 1000 / 30);
  for (const delta of [0, -1, 1]) {
    const expected = hotp(secret, counter + delta);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

// otpauth:// URI for authenticator apps (rendered as a QR code client-side).
export function buildOtpauthUrl(secretB32: string, accountLabel: string, issuer = "AIO Fusion"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// --- Recovery codes -----------------------------------------------------------

// 10 single-use codes of the form XXXX-XXXX (Crockford-ish, unambiguous chars).
const RC_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let raw = "";
    const bytes = crypto.randomBytes(8);
    for (const b of bytes) raw += RC_ALPHABET[b % RC_ALPHABET.length];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function normalizeRecoveryCode(code: string): string {
  return (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Returns remaining hashes if the code matched (consuming it), or null if not.
export function consumeRecoveryCode(state: MfaState, code: string): string[] | null {
  const hash = hashRecoveryCode(code);
  const idx = state.recoveryHashes.indexOf(hash);
  if (idx === -1) return null;
  return state.recoveryHashes.filter((_, i) => i !== idx);
}

// --- Signed pending-login token ------------------------------------------------
//
// After a correct password, when an MFA challenge is required we do NOT issue a
// session cookie. Instead the login endpoint returns a short-lived stateless
// token that carries the verified identity; the /platform/mfa/verify and
// /platform/mfa/enable endpoints exchange it for a real session once the TOTP
// (or recovery) code checks out. HMAC-signed with SESSION_SECRET.

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface MfaPendingPayload {
  /** account username */
  u: string;
  /** platform_users id, when known */
  uid?: string;
  /** active company id, when known */
  cid?: string;
  role: string;
  needsSetup?: boolean;
  mode: "enroll" | "verify";
  exp: number;
  g: number;
  jti: string;
}

function tokenSecret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (s) return Buffer.from(s);
  // Per-process fallback: tokens survive within one server run, which is all
  // the 10-minute TTL needs in development.
  if (!fallbackSecret) fallbackSecret = crypto.randomBytes(32);
  return fallbackSecret;
}
let fallbackSecret: Buffer | null = null;

function sign(data: string): string {
  return crypto.createHmac("sha256", tokenSecret()).update(data).digest("base64url");
}

export function createMfaPendingToken(payload: Omit<MfaPendingPayload, "exp" | "jti">): string {
  const full: MfaPendingPayload = { ...payload, jti: crypto.randomUUID(), exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export const TRUSTED_DEVICE_COOKIE = "aio_mfa_trust";
export function verifyMfaPendingToken(token: string): MfaPendingPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as MfaPendingPayload;
    if (typeof payload.u !== "string" || !payload.u) return null;
    if (payload.mode !== "enroll" && payload.mode !== "verify") return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    if (!Number.isInteger(payload.g) || typeof payload.jti !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function validateMfaPendingToken(token: string): Promise<MfaPendingPayload | null> {
  const payload = verifyMfaPendingToken(token);
  if (!payload) return null;
  const subject = mfaSubject({ userId: payload.uid, username: payload.u });
  await validateMfaIdentity({ userId: payload.uid, username: payload.u, activeCompanyId: payload.cid });
  if (await getMfaGeneration(subject) !== payload.g) return null;
  if (payload.uid && await personalMfaMigrationRequired(payload.uid)) return null;
  const [used] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, `mfa-used:${payload.jti}`)).limit(1);
  return used ? null : payload;
}

export async function consumeMfaPending(payload: MfaPendingPayload): Promise<boolean> {
  const inserted = await db.insert(platformMetaTable).values({ key: `mfa-used:${payload.jti}`, value: String(payload.exp) })
    .onConflictDoNothing().returning();
  return inserted.length === 1;
}

export const mfaSessionKey = (sid: string) => `mfa-session:${crypto.createHash("sha256").update(sid).digest("hex")}`;
export async function recordMfaSession(sid: string, subject: string, generation: number): Promise<void> {
  await db.transaction(async tx => {
    if (subject.startsWith("user:")) await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${subject.slice(5)} FOR UPDATE`);
    if (await getMfaGeneration(subject, tx) !== generation) throw new Error("Security changed; sign in again");
    const [session] = await tx.select().from(platformSessionsTable).where(eq(platformSessionsTable.sid, sid)).limit(1);
    if (!session || mfaSubject({ username: session.username, userId: session.userId }) !== subject) throw new Error("Session identity changed");
    await validateMfaIdentity({ username: session.username, userId: session.userId ?? undefined, activeCompanyId: session.activeCompanyId ?? undefined }, tx);
    if (!(await getMfaState(subject, tx))?.enabled) throw new Error("Personal MFA proof is no longer current");
    await tx.insert(platformMetaTable).values({ key: mfaSessionKey(sid), value: JSON.stringify({ subject, generation }) })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: JSON.stringify({ subject, generation }) } });
  });
}

export async function hasMfaSession(sid: string, subject: string): Promise<boolean> {
  const [row] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, mfaSessionKey(sid))).limit(1);
  if (!row) return false;
  const assurance = JSON.parse(row.value);
  return assurance.subject === subject && assurance.generation === await getMfaGeneration(subject);
}

export function verifyTrustedDeviceToken(token: string): TrustedDeviceTokenPayload | null {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(`td:${body}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TrustedDeviceTokenPayload;
    if (typeof payload.u !== "string" || !payload.u) return null;
    if (typeof payload.d !== "string" || !payload.d) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

interface TrustedDeviceTokenPayload {
  /** account username */
  u: string;
  /** device id */
  d: string;
  exp: number;
  g: number;
}

export const trustedKey = (subject: string) => subject.startsWith("user:")
  ? `person:mfa-trusted:${subject.slice(5)}` : `${TRUSTED_PREFIX}${subject.replace(/^legacy:/, "").trim().toLowerCase()}`;

export async function clearTrustedDevices(username: string): Promise<void> {
  await db.delete(platformMetaTable).where(eq(platformMetaTable.key, trustedKey(username)));
}

export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function addTrustedDevice(username: string, label: string, expectedGeneration?: number): Promise<{ device: TrustedDevice; cookieValue: string }> {
  return db.transaction(async tx => {
  if (username.startsWith("user:")) await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${username.slice(5)} FOR UPDATE`);
  const generation = await getMfaGeneration(username, tx);
  if (expectedGeneration !== undefined && generation !== expectedGeneration) throw new Error("Sign in again");
  const now = Date.now();
  const device: TrustedDevice = {
    id: crypto.randomBytes(16).toString("hex"),
    label: (label || "Unknown device").slice(0, 160),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TRUSTED_DEVICE_TTL_MS).toISOString(),
  };
  const existing = await listTrustedDevices(username, tx);
  await saveTrustedDevices(username, [...existing, device], tx);
  return { device, cookieValue: createTrustedDeviceToken(username, device.id, now + TRUSTED_DEVICE_TTL_MS, generation) };
  });
}

export async function listTrustedDevices(username: string, tx: MfaDb = db): Promise<TrustedDevice[]> {
  const [row] = await tx
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, trustedKey(username)))
    .limit(1);
  if (!row?.value) return [];
  try {
    const arr = JSON.parse(row.value);
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr.filter((d): d is TrustedDevice =>
      d && typeof d.id === "string" && typeof d.expiresAt === "string" && Date.parse(d.expiresAt) > now,
    ).map((d) => ({
      id: d.id,
      label: typeof d.label === "string" ? d.label : "Unknown device",
      createdAt: typeof d.createdAt === "string" ? d.createdAt : new Date(0).toISOString(),
      expiresAt: d.expiresAt,
    }));
  } catch {
    return [];
  }
}

export function createTrustedDeviceToken(username: string, deviceId: string, expMs: number, generation = 0): string {
  const payload: TrustedDeviceTokenPayload = { u: username.trim().toLowerCase(), d: deviceId, exp: expMs, g: generation };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(`td:${body}`)}`;
}

export async function isTrustedDevice(username: string, cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const payload = verifyTrustedDeviceToken(cookieValue);
  if (!payload || payload.u !== username.trim().toLowerCase()) return false;
  if (payload.g !== await getMfaGeneration(username)) return false;
  try {
    const devices = await listTrustedDevices(username);
    return devices.some((d) => d.id === payload.d);
  } catch {
    return false;
  }
}

export interface TrustedDevice {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
}

async function saveTrustedDevices(username: string, devices: TrustedDevice[], tx: MfaDb = db): Promise<void> {
  const value = JSON.stringify(devices);
  await tx
    .insert(platformMetaTable)
    .values({ key: trustedKey(username), value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

const TRUSTED_PREFIX = "account:mfa-trusted:";

export async function revokeTrustedDevice(username: string, deviceId: string): Promise<boolean> {
  return db.transaction(async tx => {
  if (username.startsWith("user:")) await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${username.slice(5)} FOR UPDATE`);
  const devices = await listTrustedDevices(username, tx);
  const remaining = devices.filter((d) => d.id !== deviceId);
  if (remaining.length === devices.length) return false;
  await saveTrustedDevices(username, remaining, tx);
  return true;
  });
}

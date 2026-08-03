import crypto from "crypto";
import { db, platformMetaTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// TOTP two-factor authentication (RFC 6238, HMAC-SHA1, 30s step, 6 digits)
// implemented on node's crypto so no external dependency is needed.
//
// MFA state is stored per-account in the generic platform_meta key/value table
// (key `account:mfa:<username>`) — the same pattern as the master-owner and
// archived flags. This works uniformly for both auth paths (platform_users and
// the legacy platform_accounts fallback, including the seeded master admin
// which has no email / platform_users row).
//
// State shape (JSON):
//   { secret, enabled, recoveryHashes: string[], updatedAt }
// `enabled: false` with a secret present = enrolment started but not confirmed.

export const MFA_PREFIX = "account:mfa:";
const mfaKey = (username: string) => `${MFA_PREFIX}${username.trim().toLowerCase()}`;

export interface MfaState {
  secret: string; // base32
  enabled: boolean;
  recoveryHashes: string[]; // sha256 hex of unused recovery codes
  updatedAt?: string;
}

export async function getMfaState(username: string): Promise<MfaState | null> {
  const [row] = await db
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, mfaKey(username)))
    .limit(1);
  if (!row?.value) return null;
  try {
    const obj = JSON.parse(row.value) as Partial<MfaState>;
    if (typeof obj.secret !== "string" || !obj.secret) return null;
    return {
      secret: obj.secret,
      enabled: obj.enabled === true,
      recoveryHashes: Array.isArray(obj.recoveryHashes) ? obj.recoveryHashes.filter((h): h is string => typeof h === "string") : [],
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveMfaState(username: string, state: MfaState): Promise<void> {
  const value = JSON.stringify({ ...state, updatedAt: new Date().toISOString() });
  await db
    .insert(platformMetaTable)
    .values({ key: mfaKey(username), value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
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

export function createMfaPendingToken(payload: Omit<MfaPendingPayload, "exp">): string {
  const full: MfaPendingPayload = { ...payload, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  return `${body}.${sign(body)}`;
}

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
    return payload;
  } catch {
    return null;
  }
}

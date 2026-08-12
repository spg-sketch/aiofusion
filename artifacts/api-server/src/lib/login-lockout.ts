// Progressive login lockout.
//
// Complements the per-IP rate limiter with a per-identifier counter that
// survives server restarts (stored in platform_meta). After LOCKOUT_THRESHOLD
// consecutive failures the identifier is locked for a delay that doubles with
// each further failure, capped at LOCKOUT_MAX_MS. A successful sign-in clears
// the counter.
//
// The identifier is whatever the caller typed (email or company slug),
// normalised - deliberately NOT validated against existing accounts, so the
// lockout response does not leak whether an account exists.

import { db, platformMetaTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_MS = 60 * 1000; // 1 minute after the 5th failure
const LOCKOUT_MAX_MS = 15 * 60 * 1000; // cap at 15 minutes
// Failures older than this are forgotten (rolling window).
const FAILURE_TTL_MS = 60 * 60 * 1000;

interface LockoutState {
  fails: number;
  lastFailAt: number;
  until: number; // epoch ms; 0 = not locked
}

function lockoutKey(identifier: string): string {
  return `login-lockout:${identifier.trim().toLowerCase()}`;
}

async function readState(identifier: string): Promise<LockoutState | null> {
  const [row] = await db
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, lockoutKey(identifier)))
    .limit(1);
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as LockoutState;
    if (typeof parsed.fails !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeState(identifier: string, state: LockoutState): Promise<void> {
  const key = lockoutKey(identifier);
  const value = JSON.stringify(state);
  await db
    .insert(platformMetaTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

/** Milliseconds remaining on an active lockout, or 0 if not locked. */
export async function lockoutRemainingMs(identifier: string): Promise<number> {
  if (!identifier) return 0;
  const state = await readState(identifier);
  if (!state) return 0;
  const now = Date.now();
  if (state.until > now) return state.until - now;
  return 0;
}

/** Record a failed attempt; returns the new lockout duration in ms (0 = none yet). */
export async function recordLoginFailure(identifier: string): Promise<number> {
  if (!identifier) return 0;
  const now = Date.now();
  const prev = await readState(identifier);
  const stale = !prev || now - prev.lastFailAt > FAILURE_TTL_MS;
  const fails = stale ? 1 : prev.fails + 1;
  let lockMs = 0;
  if (fails >= LOCKOUT_THRESHOLD) {
    // 5th failure = base delay, doubling for each failure beyond that.
    lockMs = Math.min(LOCKOUT_BASE_MS * 2 ** (fails - LOCKOUT_THRESHOLD), LOCKOUT_MAX_MS);
  }
  await writeState(identifier, { fails, lastFailAt: now, until: lockMs ? now + lockMs : 0 });
  return lockMs;
}

/** Clear the failure counter after a successful sign-in. */
export async function clearLoginFailures(identifier: string): Promise<void> {
  if (!identifier) return;
  try {
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, lockoutKey(identifier)));
  } catch {
    /* non-fatal */
  }
}

/** User-facing message for an active lockout. Same wording regardless of whether the account exists. */
export function lockoutMessage(remainingMs: number): string {
  const mins = Math.max(1, Math.ceil(remainingMs / 60000));
  return `Too many failed sign-in attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

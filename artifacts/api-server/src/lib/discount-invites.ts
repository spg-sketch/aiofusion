import crypto from "crypto";
import type Stripe from "stripe";
import { db, platformMetaTable, platformCompaniesTable, platformAccountsTable } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";
import { logger } from "./logger";
import { normUsername } from "./platform-auth";
import { normalizeInviteToken } from "./team-invites";
import { getUncachableStripeClient } from "./stripe-client";
import { getBillingState } from "./billing";

// ---------------------------------------------------------------------------
// Discount invites (beta / early-adopter / VIP)
//
// Master admin issues a single-use invite link that pre-loads an account type
// and a % discount. The recipient completes normal signup; when they start
// Stripe Checkout the server attaches a coupon (created or reused for that %)
// at SUBSCRIPTION level, so the discount persists on every renewal. The URL
// token is a server-side reference only - no coupon codes reach the client,
// and organic signups have no way to self-apply a discount.
//
// Storage (platform_meta, no schema change):
//   discount-invite:<token>  -> DiscountInvite JSON
//   account-discount:<slug>  -> AccountDiscount JSON (written on redemption)
// ---------------------------------------------------------------------------

export const DISCOUNT_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const INVITE_PREFIX = "discount-invite:";
const inviteKey = (token: string) => `${INVITE_PREFIX}${token}`;
const DISCOUNT_PREFIX = "account-discount:";
const discountKey = (slug: string) => `${DISCOUNT_PREFIX}${normUsername(slug)}`;

export type DiscountAccountType = "client" | "agency";

export interface DiscountInvite {
  token: string;
  email: string;
  accountType: DiscountAccountType; // client = In-House, agency = Agency/Partner
  percent: number; // integer 1-99
  label: string; // "Beta", "VIP", ...
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedBySlug?: string;
}

export interface AccountDiscount {
  percent: number;
  label: string;
  inviteEmail: string;
  redeemedAt: string;
  // Set when the master admin ends the discount: the Stripe discount is
  // removed from the subscription (so the next renewal bills full price) and
  // future checkouts stop attaching the coupon.
  endedAt?: string;
}

function parseJson<T>(value: string | undefined | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function readMeta(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function writeMeta(key: string, value: string): Promise<void> {
  await db
    .insert(platformMetaTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

export function isDiscountAccountType(v: unknown): v is DiscountAccountType {
  return v === "client" || v === "agency";
}

export function isValidDiscountPercent(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99;
}

export async function createDiscountInvite(opts: {
  email: string;
  accountType: DiscountAccountType;
  percent: number;
  label: string;
  createdBy: string;
}): Promise<DiscountInvite> {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const invite: DiscountInvite = {
    token,
    email: opts.email.trim().toLowerCase(),
    accountType: opts.accountType,
    percent: opts.percent,
    label: opts.label.trim().slice(0, 32),
    createdBy: normUsername(opts.createdBy),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DISCOUNT_INVITE_TTL_MS).toISOString(),
  };
  await writeMeta(inviteKey(token), JSON.stringify(invite));
  return invite;
}

export async function listDiscountInvites(): Promise<DiscountInvite[]> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${INVITE_PREFIX}%`));
  const invites: DiscountInvite[] = [];
  for (const r of rows) {
    const inv = parseJson<DiscountInvite>(r.value);
    if (inv?.token) invites.push(inv);
  }
  invites.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return invites;
}

export type DiscountInviteFailure = "not_found" | "used" | "expired";

// Look up an invite from a raw (possibly mangled) URL token. Follows the
// team-invite robustness conventions: normalise the token and log the exact
// failure reason so support can see why a link did not work.
export async function getDiscountInvite(
  rawToken: string,
): Promise<{ invite: DiscountInvite } | { invite: null; reason: DiscountInviteFailure }> {
  const token = normalizeInviteToken(rawToken);
  const invite = parseJson<DiscountInvite>(await readMeta(inviteKey(token)));
  const fail = (reason: DiscountInviteFailure) => {
    logger.warn(
      {
        reason,
        tokenPrefix: token.slice(0, 8),
        rawTokenDiffers: token !== String(rawToken ?? "").trim(),
      },
      "discount-invite: lookup failed",
    );
    return { invite: null as null, reason };
  };
  if (!invite) return fail("not_found");
  if (invite.usedAt) return fail("used");
  if (new Date(invite.expiresAt).getTime() < Date.now()) return fail("expired");
  return { invite };
}

// Mark the invite used and stamp the redeeming account's discount record.
// Called during signup AFTER the account row exists. Single-use is enforced
// with an atomic compare-and-swap on the stored invite JSON: two concurrent
// redemptions both read the unused invite, but only the first conditional
// UPDATE matches the original value - the loser gets zero rows and fails.
export async function consumeDiscountInvite(token: string, slug: string): Promise<void> {
  const clean = normalizeInviteToken(token);
  const raw = await readMeta(inviteKey(clean));
  const invite = parseJson<DiscountInvite>(raw);
  if (!invite || invite.usedAt) throw new Error("Invite no longer valid");
  if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error("Invite expired");
  const now = new Date().toISOString();
  invite.usedAt = now;
  invite.usedBySlug = normUsername(slug);
  const claimed = await db
    .update(platformMetaTable)
    .set({ value: JSON.stringify(invite) })
    .where(and(eq(platformMetaTable.key, inviteKey(clean)), eq(platformMetaTable.value, raw as string)))
    .returning();
  if (claimed.length === 0) throw new Error("Invite no longer valid");
  const discount: AccountDiscount = {
    percent: invite.percent,
    label: invite.label,
    inviteEmail: invite.email,
    redeemedAt: now,
  };
  await writeMeta(discountKey(slug), JSON.stringify(discount));
  logger.info(
    { slug: normUsername(slug), percent: invite.percent, label: invite.label },
    "discount-invite: redeemed",
  );
}

export async function getAccountDiscount(slug: string): Promise<AccountDiscount | null> {
  return parseJson<AccountDiscount>(await readMeta(discountKey(slug)));
}

// The discount that should apply to a NEW checkout: redeemed and not ended.
export async function getActiveAccountDiscount(slug: string): Promise<AccountDiscount | null> {
  const d = await getAccountDiscount(slug);
  return d && !d.endedAt ? d : null;
}

// Map of slug -> discount for the admin overview (single scan).
export async function getAllAccountDiscounts(): Promise<Map<string, AccountDiscount>> {
  const rows = await db
    .select()
    .from(platformMetaTable)
    .where(like(platformMetaTable.key, `${DISCOUNT_PREFIX}%`));
  const map = new Map<string, AccountDiscount>();
  for (const r of rows) {
    const d = parseJson<AccountDiscount>(r.value);
    if (d) map.set(r.key.slice(DISCOUNT_PREFIX.length), d);
  }
  return map;
}

// Find-or-create the reusable Stripe coupon for a given percent. Deterministic
// id so the same % always reuses one coupon; duration "forever" keeps the
// discount on every renewal of the subscription it is attached to.
export async function ensureDiscountCoupon(stripe: Stripe, percent: number): Promise<string> {
  const id = `aio-invite-${percent}pct`;
  try {
    const existing = await stripe.coupons.retrieve(id);
    if (existing && !existing.deleted) return id;
  } catch {
    /* not found - create below */
  }
  try {
    await stripe.coupons.create({
      id,
      percent_off: percent,
      duration: "forever",
      name: `AIO Fusion invite ${percent}% off`,
    });
  } catch (err) {
    // Raced creation: another request created it between retrieve and create.
    const code = (err as { code?: string })?.code;
    if (code !== "resource_already_exists") throw err;
  }
  return id;
}

// End a discount effective at the next renewal: remove the Stripe discount
// from the live subscription (Stripe bills full price from the next invoice;
// the already-paid period is untouched) and mark the record ended so future
// checkouts stop attaching the coupon.
export async function endAccountDiscount(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = normUsername(slug);
  const discount = await getAccountDiscount(clean);
  if (!discount || discount.endedAt) return { ok: false, error: "This account has no active discount." };
  const state = await getBillingState(clean);
  if (state?.stripeSubscriptionId) {
    const stripe = await getUncachableStripeClient();
    try {
      await stripe.subscriptions.deleteDiscount(state.stripeSubscriptionId);
    } catch (err) {
      // No discount on the subscription (e.g. never checked out) is fine;
      // anything else must surface so the admin knows Stripe still discounts.
      const code = (err as { code?: string })?.code;
      if (code !== "resource_missing") {
        logger.error({ err, slug: clean }, "discount-invite: failed to remove Stripe discount");
        return { ok: false, error: "Stripe refused to remove the discount. Please try again." };
      }
    }
  }
  discount.endedAt = new Date().toISOString();
  await writeMeta(discountKey(clean), JSON.stringify(discount));
  logger.warn({ slug: clean, percent: discount.percent }, "discount-invite: discount ended at next renewal");
  return { ok: true };
}

// Apply the invite's pre-set account type to a freshly signed-up account.
export async function applyInviteAccountType(slug: string, accountType: DiscountAccountType): Promise<void> {
  const username = normUsername(slug);
  await db
    .update(platformAccountsTable)
    .set({ role: accountType })
    .where(eq(platformAccountsTable.username, username));
  await db
    .update(platformCompaniesTable)
    .set({ role: accountType })
    .where(eq(platformCompaniesTable.slug, username));
}

import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import {
  db,
  platformCompaniesTable,
  platformMetaTable,
  projectsTable,
} from "@workspace/db";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getUncachableStripeClient } from "./stripe-client";
import { getStripeCheckoutReadiness } from "./stripe-readiness";
import {
  PLAN_PRICES,
  PROJECT_TIER_PRICES,
  TIER_ACTION_LIMITS,
  INCLUDED_PROJECT_TIER,
  INCLUDED_PROJECTS,
  isPlanKey,
  isBillingFrequency,
  isProjectTier,
  type PlanKey,
  type BillingFrequency,
  type PlanPrice,
  type ProjectTier,
} from "./billing-plans";
import { getAccount, normUsername, normalizeRole } from "./platform-auth";
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from "./notify-email";
import {
  composeStoredBillingAddress,
  countryNameToIso2,
  getCompanyBillingRecord,
  splitStoredBillingAddress,
} from "./company-billing-record";

// ---------------------------------------------------------------------------
// Subscription state
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "none" | "active" | "past_due" | "cancelled";

export interface BillingState {
  status: SubscriptionStatus;
  plan: PlanKey | null;
  frequency: BillingFrequency | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  includedProjects: number;
  freeAccess: boolean;
  betaTrialStartedAt: Date | null;
  betaTrialEndsAt: Date | null;
}

export type BetaTrialStatus = "eligible" | "active" | "expired" | "used" | "exempt";

export interface BetaTrialSummary {
  status: BetaTrialStatus;
  startedAt: Date | null;
  endsAt: Date | null;
  daysRemaining: number;
}

export const BETA_TRIAL_DAYS = 60;
export const BETA_TRIAL_ACTION_LIMIT = 50;
export const BETA_TRIAL_AGENCY_PROJECT_CAP = 2;
export const BETA_TRIAL_CLIENT_PROJECT_CAP = 1;
// Kept for callers that imported the old constant. Trial allowance decisions
// must use getBetaTrialProjectCap(), since the cap depends on the billing root.
export const BETA_TRIAL_PROJECT_CAP = BETA_TRIAL_AGENCY_PROJECT_CAP;
const DAY_MS = 24 * 60 * 60 * 1000;
let ensureBetaTrialColumnsPromise: Promise<unknown> | null = null;

async function ensureBetaTrialColumns(): Promise<void> {
  ensureBetaTrialColumnsPromise ??= db.execute(sql`
    ALTER TABLE platform_companies
      ADD COLUMN IF NOT EXISTS beta_trial_started_at timestamptz,
      ADD COLUMN IF NOT EXISTS beta_trial_ends_at timestamptz
  `);
  await ensureBetaTrialColumnsPromise;
}

export function getBetaTrialSummary(
  state: Pick<BillingState, "status" | "freeAccess" | "betaTrialStartedAt" | "betaTrialEndsAt"> | null,
  now = new Date(),
): BetaTrialSummary {
  if (state?.freeAccess || state?.status === "active" || state?.status === "past_due") {
    return { status: "exempt", startedAt: state?.betaTrialStartedAt ?? null, endsAt: state?.betaTrialEndsAt ?? null, daysRemaining: 0 };
  }
  if (!state?.betaTrialStartedAt || !state.betaTrialEndsAt) {
    return {
      status: state?.status === "none" || !state ? "eligible" : "used",
      startedAt: null,
      endsAt: null,
      daysRemaining: 0,
    };
  }
  const remainingMs = state.betaTrialEndsAt.getTime() - now.getTime();
  return {
    status: remainingMs > 0 ? "active" : "expired",
    startedAt: state.betaTrialStartedAt,
    endsAt: state.betaTrialEndsAt,
    daysRemaining: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
  };
}

export async function getBillingState(slug: string): Promise<BillingState | null> {
  await ensureBetaTrialColumns();
  const [row] = await db
    .select({
      subscriptionStatus: platformCompaniesTable.subscriptionStatus,
      plan: platformCompaniesTable.plan,
      billingFrequency: platformCompaniesTable.billingFrequency,
      stripeCustomerId: platformCompaniesTable.stripeCustomerId,
      stripeSubscriptionId: platformCompaniesTable.stripeSubscriptionId,
      currentPeriodEnd: platformCompaniesTable.currentPeriodEnd,
      freeAccess: platformCompaniesTable.freeAccess,
      betaTrialStartedAt: sql<Date | null>`beta_trial_started_at`,
      betaTrialEndsAt: sql<Date | null>`beta_trial_ends_at`,
    })
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.slug, normUsername(slug)))
    .limit(1);
  if (!row) return null;
  const plan = isPlanKey(row.plan) ? row.plan : null;
  const status: SubscriptionStatus =
    row.subscriptionStatus === "active" ||
    row.subscriptionStatus === "past_due" ||
    row.subscriptionStatus === "cancelled"
      ? row.subscriptionStatus
      : "none";
  return {
    status,
    plan,
    frequency: isBillingFrequency(row.billingFrequency) ? row.billingFrequency : null,
    stripeCustomerId: row.stripeCustomerId ?? null,
    stripeSubscriptionId: row.stripeSubscriptionId ?? null,
    currentPeriodEnd: row.currentPeriodEnd ?? null,
    includedProjects: plan ? INCLUDED_PROJECTS[plan] : 0,
    freeAccess: row.freeAccess === true,
    betaTrialStartedAt: row.betaTrialStartedAt ? new Date(row.betaTrialStartedAt) : null,
    betaTrialEndsAt: row.betaTrialEndsAt ? new Date(row.betaTrialEndsAt) : null,
  };
}

// An account is "entitled" while its subscription is active or in dunning
// (past_due keeps access during the retry window - Stripe cancels it, and we
// flip to cancelled, if payment never recovers).
export function isEntitled(
  state: Pick<BillingState, "status" | "freeAccess" | "betaTrialStartedAt" | "betaTrialEndsAt"> | null,
  now = new Date(),
): boolean {
  return !!state && (
    state.freeAccess ||
    state.status === "active" ||
    state.status === "past_due" ||
    getBetaTrialSummary(state, now).status === "active"
  );
}

export function hasPaidSubscription(
  state: Pick<BillingState, "status"> | null,
): boolean {
  return !!state && (state.status === "active" || state.status === "past_due");
}

export async function startBetaTrial(slug: string, plan: PlanKey): Promise<BillingState | null> {
  await ensureBetaTrialColumns();
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + BETA_TRIAL_DAYS * DAY_MS);
  const result = await db.execute(sql`
    UPDATE platform_companies
    SET beta_trial_started_at = ${startedAt},
        beta_trial_ends_at = ${endsAt},
        plan = ${plan}
    WHERE slug = ${normUsername(slug)}
      AND free_access = false
      AND beta_trial_started_at IS NULL
      AND (subscription_status IS NULL OR subscription_status = 'none')
    RETURNING slug
  `);
  if (result.rows.length === 0) return null;
  return getBillingState(slug);
}

// Walk up the account hierarchy to the top-level account that carries the
// subscription (agencies subscribe for their managed clients). Cycle-guarded.
export async function resolveBillingSlug(slug: string): Promise<string> {
  let current = normUsername(slug);
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    if (seen.has(current)) break;
    seen.add(current);
    const acc = await getAccount(current);
    if (!acc?.parent) break;
    const parent = normUsername(acc.parent);
    const parentAcc = await getAccount(parent);
    if (!parentAcc || parentAcc.role === "admin") break;
    current = parent;
  }
  return current;
}

/**
 * Return the project cap for an active beta trial at the billing root.
 *
 * This is intentionally derived from existing account/plan data rather than
 * persisted as another billing field. A managed client resolves to its
 * agency's root and therefore receives the agency cap. Direct clients get one
 * project, including legacy active trials whose plan was never recorded.
 */
export async function getBetaTrialProjectCap(
  billingSlug: string,
  state?: Pick<BillingState, "plan"> | null,
): Promise<number> {
  const account = await getAccount(billingSlug);
  const role = normalizeRole(account?.role);

  // The root role is authoritative for existing active trials. In particular,
  // a direct client with a legacy NULL plan must not retain the old cap of two.
  if (role === "client") return BETA_TRIAL_CLIENT_PROJECT_CAP;
  if (role === "agency") return BETA_TRIAL_AGENCY_PROJECT_CAP;

  // `user` is the legacy role and historically behaved as an agency. For rows
  // with a recorded trial plan, prefer that authoritative plan instead.
  if (state?.plan === "inhouse") return BETA_TRIAL_CLIENT_PROJECT_CAP;
  return BETA_TRIAL_AGENCY_PROJECT_CAP;
}

// ---------------------------------------------------------------------------
// Per-project action limits
// ---------------------------------------------------------------------------

export const NO_SUBSCRIPTION_ACTION_LIMIT = 0;

// Derives the 30-day action limit for a project:
//  - subscribed account + explicit project tier  -> that tier's limit
//  - subscribed account + no tier (included)     -> Premium (75)
//  - active beta trial                           -> its plan/project tier limit
//  - unstarted or expired trial                  -> no paid actions
// Fail closed: any DB error denies paid actions.
export async function getProjectActionLimit(
  accountId: string,
  projectId?: string | null,
): Promise<number> {
  try {
    const billingSlug = await resolveBillingSlug(accountId);
    const state = await getBillingState(billingSlug);
    if (!isEntitled(state)) return 0;
    if (getBetaTrialSummary(state).status === "active") return BETA_TRIAL_ACTION_LIMIT;
    if (projectId) {
      const [proj] = await db
        .select({ tier: projectsTable.tier, owner: projectsTable.owner })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);
      // Only honour a project's tier when the project actually belongs to
      // this account's billing subtree - otherwise a caller could pass an
      // arbitrary project id and inherit another account's (or a fabricated)
      // higher tier.
      if (
        proj &&
        isProjectTier(proj.tier) &&
        proj.owner &&
        (await resolveBillingSlug(proj.owner)) === billingSlug
      ) {
        return TIER_ACTION_LIMITS[proj.tier];
      }
    }
    return TIER_ACTION_LIMITS[INCLUDED_PROJECT_TIER];
  } catch (err) {
    logger.warn({ err, accountId, projectId }, "billing: getProjectActionLimit failed - denying paid actions");
    return NO_SUBSCRIPTION_ACTION_LIMIT;
  }
}

// ---------------------------------------------------------------------------
// Purchased project add-ons
// ---------------------------------------------------------------------------
//
// Each purchased additional project is its own annual Stripe subscription.
// The account's add-ons are stored as a JSON array in platform_meta under
// `projectAddons:<slug>`:
//   { subscriptionId, tier, projectId|null, pendingTier?, purchasedAt }
// - projectId null  = purchased but not yet attached to a project; the next
//                     project the account creates consumes it.
// - pendingTier     = a queued downgrade that takes effect at renewal.

export interface ProjectAddon {
  subscriptionId: string;
  tier: ProjectTier;
  projectId: string | null;
  // Agency packages may be reserved by an empty managed client before its
  // first project exists. The eventual project consumes this same package.
  ownerSlug?: string | null;
  // false for a tier-only upgrade attached to an already-included project.
  // Missing means true for backwards-compatible capacity add-ons.
  grantsCapacity?: boolean;
  pendingTier?: ProjectTier;
  purchasedAt: string;
}

const addonsKey = (slug: string) => `projectAddons:${normUsername(slug)}`;

// Add-ons are stored as one JSON array per account, so every read-modify-write
// (webhook fulfilment, tier changes, cancellation, new-project assignment)
// must be serialised or concurrent updates can lose each other's changes.
// The api-server runs as a single process, so an in-process per-slug promise
// chain is sufficient; the same lock also serialises project-allowance
// count-then-insert checks in the store routes.
const slugLocks = new Map<string, Promise<void>>();

export async function withSlugLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const key = normUsername(slug);
  const prev = slugLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  slugLocks.set(key, tail);
  void tail.then(() => {
    // Drop the map entry once no newer waiter has chained onto it.
    if (slugLocks.get(key) === tail) slugLocks.delete(key);
  });
  return run;
}

// Locks on the RESOLVED billing slug so all accounts sharing one billing pool
// (an agency and its managed children) serialise on the same lock. Everything
// that reads or mutates a shared allowance / add-on pool must go through this
// (or already hold it). NOTE: never nest withSlugLock/withBillingLock calls
// for the same slug - that deadlocks.
//
// NOTE ON MULTI-PROCESS SAFETY: withSlugLock is an in-process promise chain -
// it serialises concurrent requests within the same server process but does
// nothing when two separate processes (e.g. a scaled deployment) run the same
// critical section simultaneously. For checkout creation specifically, use
// claimCheckout / releaseCheckout as a cross-process DB guard in addition to
// this in-process lock.
export async function withBillingLock<T>(
  slug: string,
  fn: (billingSlug: string) => Promise<T>,
): Promise<T> {
  const owner = normUsername(slug);
  for (let attempt = 0; attempt < 6; attempt++) {
    const billingSlug = await resolveBillingSlug(owner);
    const outcome = await withSlugLock(billingSlug, async () => {
      // Reparenting can occur while this caller waits in the old root's queue.
      // Never execute the critical section under a stale billing pool.
      if ((await resolveBillingSlug(owner)) !== billingSlug) {
        return { stable: false as const };
      }
      return { stable: true as const, value: await fn(billingSlug) };
    });
    if (outcome.stable) return outcome.value;
  }
  throw new Error(`billing: account hierarchy kept changing while locking ${owner}`);
}

// Acquire multiple billing pools in canonical order. This is used by transfers
// so source and destination capacity/add-on state cannot change between the
// decision and write. Duplicate roots collapse to one lock.
export async function withBillingLocks<T>(
  slugs: string[],
  fn: (billingSlugs: string[]) => Promise<T>,
): Promise<T> {
  const owners = slugs.map(normUsername);
  for (let attempt = 0; attempt < 6; attempt++) {
    const roots = [
      ...new Set(await Promise.all(owners.map((owner) => resolveBillingSlug(owner)))),
    ].sort();
    const acquire = (
      index: number,
    ): Promise<{ stable: false } | { stable: true; value: T }> =>
      index < roots.length
        ? withSlugLock(roots[index]!, () => acquire(index + 1))
        : (async () => {
            const freshRoots = [
              ...new Set(await Promise.all(owners.map((owner) => resolveBillingSlug(owner)))),
            ].sort();
            if (
              freshRoots.length !== roots.length
              || freshRoots.some((root, rootIndex) => root !== roots[rootIndex])
            ) {
              return { stable: false as const };
            }
            return { stable: true as const, value: await fn(roots) };
          })();
    const outcome = await acquire(0);
    if (outcome.stable) return outcome.value;
  }
  throw new Error("billing: account hierarchy kept changing while locking billing roots");
}

// ---------------------------------------------------------------------------
// Cross-process checkout race protection
// ---------------------------------------------------------------------------
//
// The in-process billing lock (withBillingLock) prevents same-process races
// but does not help when two server processes attempt a checkout simultaneously.
// A DB-backed pending-checkout record bridges that gap.
//
// Design:
//  - The first request INSERTs a claim with { at, tok, sid?, url? }.
//    "at" is the claim timestamp (for TTL), "tok" is a unique token (UUID).
//  - After the Stripe session is created, the claim is updated (finalizeCheckoutClaim)
//    to include the session id and url. Subsequent requests can reuse this URL.
//  - The claim is NOT released when the URL is returned to the browser.
//    It is held open so no second process can race in while the session tab
//    is still active.
//  - The webhook (checkout.session.completed) releases the claim conditionally
//    using the claim token stored in the Stripe session metadata ("claim_tok").
//  - If session creation fails, the route releases the claim immediately so
//    the user can retry.
//  - Stale *pre-session* claims (older than CHECKOUT_PENDING_TTL_MS and no
//    Stripe session created yet) are preempted by the UPSERT WHERE guard so a
//    crashed process never permanently blocks checkouts. Finalized claims (those
//    with a `sid` already set) are intentionally NOT preemptable by TTL alone:
//    the Stripe session is still open and can complete. They are released by the
//    checkout.session.completed or checkout.session.expired webhook instead.
//    Preemption is safe because releaseCheckout is conditional on the token:
//    an expired claimant calling release with its old token does not delete the
//    new claimant's record.

export const CHECKOUT_PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const checkoutPendingKey = (slug: string) => `checkout:pending:${normUsername(slug)}`;

type CheckoutClaim = {
  at: string;
  tok: string;
  frequency?: BillingFrequency;
  sid?: string;
  url?: string;
};

// Atomically claim the checkout-in-progress slot for a billing account.
//
// Returns:
//  { claimed: true,  claimToken }               - slot acquired, proceed to create session
//  { claimed: false, existingUrl }              - live session already open; reuse this URL
//  { claimed: false, existingUrl: undefined }   - mid-claim race (another process is creating
//                                                  the session but has not finalized yet)
export async function claimCheckout(
  slug: string,
  frequency?: BillingFrequency,
): Promise<
  | { claimed: true; claimToken: string }
  | {
      claimed: false;
      existingUrl?: string;
      existingSessionId?: string;
      existingClaimToken?: string;
      existingFrequency?: BillingFrequency;
    }
> {
  const key = checkoutPendingKey(slug);
  const claimToken = randomUUID();
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - CHECKOUT_PENDING_TTL_MS).toISOString();
  const newValue = JSON.stringify({ at: now, tok: claimToken, frequency } satisfies CheckoutClaim);

  // Atomic: INSERT wins the slot. ON CONFLICT DO UPDATE only fires when the
  // existing claim is stale AND has no Stripe session created yet (sid IS NULL).
  // A finalized claim (sid present) is never preempted by TTL - the session may
  // still be open. No rows returned means a live claim is already in progress.
  const result = await db.execute(sql`
    INSERT INTO platform_meta (key, value)
    VALUES (${key}, ${newValue})
    ON CONFLICT (key) DO UPDATE
      SET value = ${newValue}
      WHERE (platform_meta.value::json->>'at') < ${stale}
        AND (platform_meta.value::json->>'sid') IS NULL
    RETURNING key
  `);
  const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
  if (rows.length > 0) {
    return { claimed: true, claimToken };
  }

  // A live claim exists. Read it to expose any already-created session URL so
  // the caller can redirect the user there instead of returning a 409.
  const [existing] = await db
    .select({ value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, key));

  if (existing?.value) {
    try {
      const data = JSON.parse(existing.value) as Partial<CheckoutClaim>;
      return {
        claimed: false,
        existingUrl: data.url,
        existingSessionId: data.sid,
        existingClaimToken: data.tok,
        existingFrequency: isBillingFrequency(data.frequency) ? data.frequency : undefined,
      };
    } catch {
      // Malformed value - treat as no URL available
    }
  }
  return { claimed: false };
}

// Update the claim with the Stripe session details after the session is created.
// Extends the TTL from the session-creation time.
// Conditional on the claim token so a preempted process cannot overwrite a
// successor's claim.
export async function finalizeCheckoutClaim(
  slug: string,
  claimToken: string,
  sessionId: string,
  sessionUrl: string,
  frequency?: BillingFrequency,
): Promise<void> {
  const key = checkoutPendingKey(slug);
  const value = JSON.stringify({
    at: new Date().toISOString(),
    tok: claimToken,
    sid: sessionId,
    url: sessionUrl,
    frequency,
  } satisfies CheckoutClaim);
  // RETURNING is required to detect if the claim was preempted. If another
  // process TTL-preempted this claim between claimCheckout and session
  // creation, the stored token will no longer match and 0 rows are updated.
  // We must throw in that case - returning the URL would give the user a
  // session that is no longer protected by a durable claim.
  const result = await db.execute(sql`
    UPDATE platform_meta
    SET value = ${value}
    WHERE key = ${key}
      AND (value::json->>'tok') = ${claimToken}
    RETURNING key
  `);
  if (result.rows.length === 0) {
    throw new Error(
      `billing: checkout claim preempted for ${slug} - token no longer owns the claim row`,
    );
  }
}

// Conditionally release the checkout claim.
// Only deletes the row when the stored token matches so a TTL-expired claimant
// calling release with its old token cannot remove the new claimant's record.
export async function releaseCheckout(slug: string, claimToken: string): Promise<void> {
  const key = checkoutPendingKey(slug);
  await db.execute(sql`
    DELETE FROM platform_meta
    WHERE key = ${key}
      AND (value::json->>'tok') = ${claimToken}
  `);
}

export async function checkoutClaimMatchesSession(
  slug: string,
  sessionId: string,
  claimToken: string,
): Promise<boolean> {
  const [row] = await db
    .select({ value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, checkoutPendingKey(slug)))
    .limit(1);
  if (!row?.value) return false;
  try {
    const claim = JSON.parse(row.value) as Partial<CheckoutClaim>;
    return claim.sid === sessionId && claim.tok === claimToken;
  } catch {
    return false;
  }
}

// True when the project exists, is live (not deleted) and is owned by the
// billing account's subtree. Used to revalidate stale project bindings at
// webhook fulfilment and before any add-on-driven project mutation - a
// project can be deleted or reassigned while a checkout tab sits open.
export async function isProjectInBillingSubtree(slug: string, projectId: string): Promise<boolean> {
  const projects = await listBillingProjects(slug);
  return projects.some((p) => p.id === projectId);
}

export async function getProjectAddons(slug: string): Promise<ProjectAddon[]> {
  const [row] = await db
    .select({ value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, addonsKey(slug)))
    .limit(1);
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is ProjectAddon =>
        a && typeof a.subscriptionId === "string" && isProjectTier(a.tier),
    );
  } catch {
    return [];
  }
}

export type PackageKind = "agency" | "client" | "master";
export type PackageAccess = "none" | "beta" | "paid" | "free";

export interface PackageCapacity {
  billingSlug: string;
  kind: PackageKind;
  access: PackageAccess;
  included: number;
  purchased: number;
  /** Capacity units currently reserved (not merely projects created). */
  reserved: number;
  /** Number of live projects represented by those reservations. */
  used: number;
  /** null is the explicit, unlimited Master exception. */
  remaining: number | null;
  /** null is the explicit, unlimited Master exception. */
  allowance: number | null;
  overLimit: boolean;
}

type CapacitySnapshotOptions = {
  excludeProjectId?: string;
  addProjectOwner?: string;
};

async function packageCapacitySnapshot(
  slug: string,
  options: CapacitySnapshotOptions = {},
): Promise<PackageCapacity> {
  const billingSlug = await resolveBillingSlug(slug);
  const root = await getAccount(billingSlug);
  const role = normalizeRole(root?.role);
  const state = await getBillingState(billingSlug);
  // A recorded plan is authoritative for the legacy `user` role, which
  // predates the Agency/Client split.
  const kind: PackageKind = role === "admin"
    ? "master"
    : role === "agency" || (role === "user" && state?.plan !== "inhouse")
      ? "agency"
      : "client";
  const trial = getBetaTrialSummary(state);
  const access: PackageAccess = hasPaidSubscription(state)
    ? "paid"
    : state?.freeAccess
      ? "free"
      : trial.status === "active"
        ? "beta"
        : "none";
  const addons = kind === "master" ? [] : await getProjectAddons(billingSlug);

  let included = 0;
  if (access === "beta") {
    included = kind === "agency" ? BETA_TRIAL_AGENCY_PROJECT_CAP : BETA_TRIAL_CLIENT_PROJECT_CAP;
  } else if (access === "paid") {
    const rootIncluded = kind === "agency"
      ? INCLUDED_PROJECTS.agency
      : INCLUDED_PROJECTS.inhouse;
    // Explicit Agency/Client roles cap stale or mismatched plan data
    // conservatively. Only the legacy `user` role derives its package kind
    // authoritatively from the recorded plan.
    included = state?.plan
      ? role === "user"
        ? INCLUDED_PROJECTS[state.plan]
        : Math.min(rootIncluded, INCLUDED_PROJECTS[state.plan])
      : rootIncluded;
  } else if (access === "free") {
    // Free access follows the root account kind without treating a stale plan
    // left by account reclassification as newly purchased package capacity.
    included = kind === "agency" ? INCLUDED_PROJECTS.agency : INCLUDED_PROJECTS.inhouse;
  }

  const accountRows = await db.execute(sql`SELECT username, parent FROM platform_accounts`);
  const accounts = ((accountRows as unknown as { rows?: Array<{ username: string; parent: string | null }> }).rows ?? [])
    .map((row) => ({ username: normUsername(row.username), parent: normUsername(row.parent ?? "") }));
  const owners = new Set(await billingSubtreeOwners(billingSlug));
  const archivedRows = await db
    .select({ key: platformMetaTable.key })
    .from(platformMetaTable);
  const archived = new Set(
    archivedRows
      .map((row) => row.key)
      .filter((key) => key.startsWith("account:archived:"))
      .map((key) => normUsername(key.slice("account:archived:".length))),
  );
  const projects = await listBillingProjects(billingSlug);
  const counts = new Map<string, number>();
  for (const project of projects) {
    if (project.id === options.excludeProjectId) continue;
    counts.set(project.owner, (counts.get(project.owner) ?? 0) + 1);
  }
  if (options.addProjectOwner) {
    const owner = normUsername(options.addProjectOwner);
    if (owners.has(owner)) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  const used = [...counts.values()].reduce((sum, count) => sum + count, 0);
  let reserved = used;
  if (kind === "agency") {
    reserved = counts.get(billingSlug) ?? 0;
    for (const account of accounts) {
      if (account.username === billingSlug || !owners.has(account.username)) continue;
      const live = counts.get(account.username) ?? 0;
      // Active empty managed clients reserve a unit. Archived empty clients
      // release theirs, but archived clients with live data remain consuming.
      reserved += archived.has(account.username) ? live : Math.max(1, live);
    }
  }
  if (kind === "master") {
    return {
      billingSlug,
      kind,
      access: "free",
      included: 0,
      purchased: 0,
      reserved,
      used,
      remaining: null,
      allowance: null,
      overLimit: false,
    };
  }
  const purchased = access === "paid"
    ? addons.filter((addon) => addon.grantsCapacity !== false).length
    : 0;
  const allowance = included + purchased;
  return {
    billingSlug,
    kind,
    access,
    included,
    purchased,
    reserved,
    used,
    remaining: Math.max(0, allowance - reserved),
    allowance,
    overLimit: reserved > allowance,
  };
}

export async function getPackageCapacity(slug: string): Promise<PackageCapacity> {
  return packageCapacitySnapshot(slug);
}

export async function checkProjectCapacityUnlocked(
  owner: string,
  projectId: string,
): Promise<{ allowed: boolean; error?: string; capacity: PackageCapacity }> {
  const target = normUsername(owner);
  const current = await packageCapacitySnapshot(target);
  const before = await packageCapacitySnapshot(target, { excludeProjectId: projectId });
  const [existing] = await db
    .select({ owner: projectsTable.owner, deletedAt: projectsTable.deletedAt })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  // Existing legacy agency-root projects remain readable/editable, but normal
  // operations cannot create, restore or transfer another project to the root.
  if (
    before.kind === "agency"
    && target === before.billingSlug
    && (!existing || existing.deletedAt || normUsername(existing.owner ?? "") !== target)
  ) {
    return {
      allowed: false,
      error: "Agency projects must belong to a managed client.",
      capacity: current,
    };
  }

  if (before.kind === "agency" && target !== before.billingSlug) {
    const projects = await listBillingProjects(before.billingSlug);
    const otherAtDestination = projects.some(
      (project) => project.id !== projectId && project.owner === target,
    );
    if (otherAtDestination) {
      return {
        allowed: false,
        error: "Each managed client can have one project.",
        capacity: current,
      };
    }
  }

  const after = await packageCapacitySnapshot(target, {
    excludeProjectId: projectId,
    addProjectOwner: target,
  });
  const existingLiveInSameBillingRoot = !!existing
    && !existing.deletedAt
    && !!existing.owner
    && (await resolveBillingSlug(existing.owner)) === current.billingSlug;
  const allowed = after.allowance === null
    || (current.access !== "none" && (
      after.reserved <= after.allowance
      // Existing live excess may move within the same billing pool so customers
      // can normalize legacy ownership without increasing the excess. A deleted
      // or brand-new project cannot revive an unfunded over-limit reservation.
      || (existingLiveInSameBillingRoot && after.reserved <= current.reserved)
    ));
  return allowed
    ? { allowed: true, capacity: after }
    : {
        allowed: false,
        error: `You've reached your ${after.allowance}-package allowance.`,
        capacity: current,
      };
}

export async function saveProjectAddons(slug: string, addons: ProjectAddon[]): Promise<void> {
  const value = JSON.stringify(addons);
  await db
    .insert(platformMetaTable)
    .values({ key: addonsKey(slug), value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

// The account's total project allowance: plan-included projects plus purchased
// add-ons. Unstarted and expired trial accounts get no additional capacity.
export const LEGACY_PROJECT_CAP = 2;

export async function getProjectAllowance(slug: string): Promise<number> {
  try {
    const capacity = await getPackageCapacity(slug);
    return capacity.allowance ?? Number.MAX_SAFE_INTEGER;
  } catch (err) {
    logger.warn({ err, slug }, "billing: getProjectAllowance failed - denying additional capacity");
    return 0;
  }
}

// When a NEW project is created, attach the oldest unassigned purchased add-on
// (if any) so the project immediately carries the tier that was paid for.
// Fail-soft: any error leaves the project as a plain (included) project.
export async function assignAddonToNewProject(slug: string, projectId: string): Promise<void> {
  try {
    await withBillingLock(slug, (billingSlug) =>
      assignAddonToNewProjectUnlocked(billingSlug, projectId),
    );
  } catch (err) {
    logger.warn({ err, slug, projectId }, "billing: assignAddonToNewProject failed (non-fatal)");
  }
}

// When a project is reassigned to an owner OUTSIDE its current billing
// subtree, the paid tier must not travel with it - the add-on belongs to the
// purchaser's billing account. Detach the binding (the slot becomes
// unassigned, ready for the purchaser's next project) and clear the
// project's tier. Called by the owner-reassignment route BEFORE the owner
// changes, so the scoped tier update still matches the old subtree.
export async function detachAddonForProjectTransfer(
  currentOwnerSlug: string,
  projectId: string,
  newOwnerSlug: string,
): Promise<void> {
  const oldRoot = await resolveBillingSlug(normUsername(currentOwnerSlug));
  const newRoot = await resolveBillingSlug(normUsername(newOwnerSlug));
  if (oldRoot === newRoot) return; // same billing pool - binding stays valid
  await withSlugLock(oldRoot, async () => {
    await detachAddonForProjectTransferUnlocked(oldRoot, projectId, newRoot);
  });
}

export async function detachAddonForProjectTransferUnlocked(
  oldRoot: string,
  projectId: string,
  newRoot: string,
): Promise<void> {
  if (oldRoot === newRoot) return;
  const addons = await getProjectAddons(oldRoot);
  const addon = addons.find((a) => a.projectId === projectId);
  if (!addon) return;
  const cleared = await setProjectTierScoped(oldRoot, projectId, null);
  if (!cleared && (await isProjectInBillingSubtree(oldRoot, projectId))) {
    logger.warn({ oldRoot, projectId }, "billing: transfer detach could not clear tier - binding kept");
    return;
  }
  addon.projectId = null;
  const capacity = await getPackageCapacity(oldRoot);
  if (capacity.kind !== "agency") addon.ownerSlug = null;
  await saveProjectAddons(oldRoot, addons);
  logger.warn(
    { oldRoot, newRoot, projectId, subscriptionId: addon.subscriptionId },
    "billing: project left its billing subtree - add-on detached, tier cleared",
  );
}

// Release a deleted project's add-on while preserving an Agency managed
// client's reservation. Direct Client packages return to the unassigned pool.
// Call while holding the billing-root lock and before (or atomically with) the
// soft-delete so the scoped tier clear can still match the live row.
export async function releaseAddonForDeletedProjectUnlocked(
  billingSlug: string,
  projectId: string,
): Promise<void> {
  const addons = await getProjectAddons(billingSlug);
  const addon = addons.find((candidate) => candidate.projectId === projectId);
  if (!addon) return;
  await setProjectTierScoped(billingSlug, projectId, null);
  addon.projectId = null;
  const capacity = await getPackageCapacity(billingSlug);
  if (capacity.kind !== "agency") addon.ownerSlug = null;
  await saveProjectAddons(billingSlug, addons);
}

// Reconcile an already-completed same-billing-root ownership transfer. A
// package reserved by the source managed client stays with that client; the
// destination project may consume only its own reserved package (if any).
export async function reconcileProjectAddonOwnershipUnlocked(
  billingSlug: string,
  projectId: string,
  previousOwner: string,
  targetOwner: string,
): Promise<void> {
  const source = normUsername(previousOwner);
  const target = normUsername(targetOwner);
  if (source === target) return;
  const addons = await getProjectAddons(billingSlug);
  const oldAddon = addons.find((candidate) => candidate.projectId === projectId);
  if (oldAddon) {
    await setProjectTierScoped(billingSlug, projectId, null);
    oldAddon.projectId = null;
    oldAddon.ownerSlug = source;
  }
  const targetAddon = addons.find(
    (candidate) =>
      candidate.grantsCapacity !== false
      && !candidate.projectId
      && candidate.ownerSlug === target,
  );
  if (targetAddon && await setProjectTierScoped(billingSlug, projectId, targetAddon.tier)) {
    targetAddon.projectId = projectId;
  }
  if (oldAddon || targetAddon) await saveProjectAddons(billingSlug, addons);
}

// Called after a managed client has been inserted while its billing-root lock
// is held. If that empty client pushed reservations beyond the included
// package, bind the oldest purchased package now; its first project reuses it.
export async function reserveAddonForOwnerUnlocked(
  billingSlug: string,
  ownerSlug: string,
): Promise<void> {
  const owner = normUsername(ownerSlug);
  const addons = await getProjectAddons(billingSlug);
  if (addons.some((addon) => addon.ownerSlug === owner)) return;
  const free = addons.find(
    (addon) => addon.grantsCapacity !== false && !addon.projectId && !addon.ownerSlug,
  );
  if (!free) return;
  const capacity = await getPackageCapacity(billingSlug);
  if (capacity.reserved <= capacity.included) return;
  free.ownerSlug = owner;
  await saveProjectAddons(billingSlug, addons);
}

// Release an empty managed-client reservation (archive/reparent). A package
// already attached to a live project is intentionally left untouched.
export async function releaseAddonForOwnerUnlocked(
  billingSlug: string,
  ownerSlug: string,
): Promise<void> {
  const owner = normUsername(ownerSlug);
  const addons = await getProjectAddons(billingSlug);
  const addon = addons.find(
    (candidate) => !candidate.projectId && candidate.ownerSlug === owner,
  );
  if (!addon) return;
  addon.ownerSlug = null;
  await saveProjectAddons(billingSlug, addons);
}

// Same as assignAddonToNewProject but assumes the caller ALREADY holds the
// billing-slug lock (the store routes run count + insert + assignment as one
// critical section). billingSlug must be the resolved billing slug.
export async function assignAddonToNewProjectUnlocked(
  billingSlug: string,
  projectId: string,
): Promise<void> {
  const [project] = await db
    .select({ owner: projectsTable.owner, deletedAt: projectsTable.deletedAt })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!project || project.deletedAt) return;
  const owner = normUsername(project?.owner ?? "");
  const addons = await getProjectAddons(billingSlug);
  const existing = addons.find((addon) => addon.projectId === projectId);
  // A same-owner retry is idempotent. If the owner write committed but the
  // post-commit add-on reconciliation failed, use the authoritative live row
  // to heal the stale reservation instead of returning early.
  if (existing) {
    const recordedOwner = normUsername(existing.ownerSlug ?? billingSlug);
    if (recordedOwner !== owner) {
      await reconcileProjectAddonOwnershipUnlocked(
        billingSlug,
        projectId,
        recordedOwner,
        owner,
      );
    }
    return;
  }
  const reserved = addons.find(
    (a) => a.grantsCapacity !== false && !a.projectId && a.ownerSlug === owner,
  );
  const free = reserved ?? addons.find(
    (a) => a.grantsCapacity !== false && !a.projectId && !a.ownerSlug,
  );
  if (!free) return;

  // Add-ons are purchased for projects BEYOND the plan's included allowance.
  // A new project that still falls within the included count must not
  // automatically consume a paid slot - that would mean the account gets an
  // add-on "for free" and the next genuinely extra project has no slot to use.
  if (!reserved) {
    const capacity = await getPackageCapacity(billingSlug);
    if (capacity.reserved <= capacity.included) {
      logger.info(
        {
          slug: billingSlug,
          projectId,
          included: capacity.included,
          reserved: capacity.reserved,
        },
        "billing: new project is within included allowance - not consuming a purchased add-on slot",
      );
      return;
    }
  }

  if (!(await setProjectTierScoped(billingSlug, projectId, free.tier))) return;
  free.projectId = projectId;
  free.ownerSlug = owner || null;
  await saveProjectAddons(billingSlug, addons);
  logger.info(
    { slug: billingSlug, projectId, tier: free.tier, subscriptionId: free.subscriptionId },
    "billing: assigned purchased add-on to new project",
  );
}

// All account slugs in the billing subtree (the billing account plus its
// descendant sub-accounts).
export async function billingSubtreeOwners(slug: string): Promise<string[]> {
  const billingSlug = await resolveBillingSlug(slug);
  const accountRows = await db.execute(
    sql`SELECT username, parent FROM platform_accounts`,
  );
  const rows = ((accountRows as unknown as { rows?: Array<{ username: string; parent: string | null }> }).rows ?? []) as Array<{ username: string; parent: string | null }>;
  const childrenByParent = new Map<string, string[]>();
  for (const r of rows) {
    const parent = normUsername(r.parent ?? "");
    if (!parent) continue;
    const list = childrenByParent.get(parent) || [];
    list.push(normUsername(r.username));
    childrenByParent.set(parent, list);
  }
  const allowed = new Set<string>();
  const queue = [normUsername(billingSlug)];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (allowed.has(cur)) continue;
    allowed.add(cur);
    for (const child of childrenByParent.get(cur) || []) queue.push(child);
  }
  return [...allowed];
}

// All live projects owned by the billing subtree, for the billing UI's usage
// counter and pickers, and for allowance counting.
export async function listBillingProjects(slug: string): Promise<
  Array<{ id: string; name: string; tier: ProjectTier | null; owner: string }>
> {
  const allowed = new Set(await billingSubtreeOwners(slug));
  const projectRows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      tier: projectsTable.tier,
      owner: projectsTable.owner,
      deletedAt: projectsTable.deletedAt,
    })
    .from(projectsTable);
  return projectRows
    .filter((p) => !p.deletedAt && allowed.has(normUsername(p.owner ?? "")))
    .map((p) => ({
      id: p.id,
      name: p.name,
      tier: isProjectTier(p.tier) ? p.tier : null,
      owner: normUsername(p.owner ?? ""),
    }));
}

// Sets (or clears) a project's tier with the ownership check IN the SQL
// predicate, so a project reassigned out of the billing subtree between a
// read and this write can never be mutated. Returns false when no live,
// subtree-owned row matched (a stale binding).
export async function setProjectTierScoped(
  slug: string,
  projectId: string,
  tier: ProjectTier | null,
): Promise<boolean> {
  const owners = await billingSubtreeOwners(slug);
  const updated = await db
    .update(projectsTable)
    .set({ tier })
    .where(
      and(
        eq(projectsTable.id, projectId),
        inArray(projectsTable.owner, owners),
        isNull(projectsTable.deletedAt),
      ),
    )
    .returning({ id: projectsTable.id });
  return updated.length > 0;
}

// When an add-on subscription is cancelled, the project it funded must not
// remain usable - the paid slot bought the project's existence, not just its
// tier. Soft-delete it (same recoverable semantics as the user delete route:
// data is kept, snapshots remain, an admin can restore) so the account drops
// back within its allowance. Same subtree-scoped predicate as tier updates.
export async function softDeleteProjectScoped(slug: string, projectId: string): Promise<boolean> {
  const owners = await billingSubtreeOwners(slug);
  const updated = await db
    .update(projectsTable)
    .set({ tier: null, deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(projectsTable.id, projectId),
        inArray(projectsTable.owner, owners),
        isNull(projectsTable.deletedAt),
      ),
    )
    .returning({ id: projectsTable.id });
  return updated.length > 0;
}

// ---------------------------------------------------------------------------
// Price resolution (find-or-create by lookup_key; never hardcode price ids)
// ---------------------------------------------------------------------------

const priceIdCache = new Map<string, string>();

export async function ensurePriceId(stripe: Stripe, price: PlanPrice): Promise<string> {
  const cached = priceIdCache.get(price.lookupKey);
  if (cached) return cached;

  const existing = await stripe.prices.list({
    lookup_keys: [price.lookupKey],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) {
    priceIdCache.set(price.lookupKey, existing.data[0].id);
    return existing.data[0].id;
  }

  // Find or create the product by name, then create the price.
  const products = await stripe.products.search({
    query: `name:'${price.productName.replace(/'/g, "\\'")}' AND active:'true'`,
  });
  const product =
    products.data[0] ??
    (await stripe.products.create({ name: price.productName }));

  const created = await stripe.prices.create({
    product: product.id,
    unit_amount: price.unitAmount,
    currency: "gbp",
    lookup_key: price.lookupKey,
    recurring: {
      interval: price.interval,
      interval_count: price.intervalCount,
    },
  });
  priceIdCache.set(price.lookupKey, created.id);
  logger.info({ lookupKey: price.lookupKey, priceId: created.id }, "billing: created Stripe price");
  return created.id;
}

// Ensures every catalogue price exists in Stripe. Idempotent.
export async function ensureAllPrices(stripe: Stripe): Promise<void> {
  for (const plan of Object.values(PLAN_PRICES)) {
    for (const price of Object.values(plan)) await ensurePriceId(stripe, price);
  }
  for (const price of Object.values(PROJECT_TIER_PRICES)) await ensurePriceId(stripe, price);
}

// ---------------------------------------------------------------------------
// Webhook business handlers (idempotent)
// ---------------------------------------------------------------------------

// Webhook secret for signature verification. The connection settings rarely
// carry one; the managed webhook created by stripe-replit-sync stores its
// secret in stripe._managed_webhooks, so read it from there as the fallback.
export async function getWebhookSecret(): Promise<string | null> {
  const { getStripeCredentials } = await import("./stripe-client");
  try {
    const { webhookSecret } = await getStripeCredentials();
    if (webhookSecret) return webhookSecret;
  } catch {
    /* fall through to the DB lookup */
  }
  try {
    const result = await db.execute(
      sql`SELECT secret FROM "stripe"."_managed_webhooks" WHERE enabled IS DISTINCT FROM false ORDER BY updated_at DESC LIMIT 1`,
    );
    const rows = (result as unknown as { rows?: Array<{ secret?: string }> }).rows ?? [];
    return rows[0]?.secret ?? null;
  } catch (err) {
    logger.warn({ err }, "billing: managed webhook secret lookup failed");
    return null;
  }
}

// Records a Stripe event id in platform_meta; returns false if it was already
// processed (making every handler idempotent under webhook retries).
export async function claimStripeEvent(eventId: string): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO platform_meta (key, value)
    VALUES (${"stripeEvent:" + eventId}, ${new Date().toISOString()})
    ON CONFLICT (key) DO NOTHING
    RETURNING key
  `);
  const rows = (result as unknown as { rows?: unknown[] }).rows ?? [];
  return rows.length > 0;
}

// Releases a claim so Stripe's retry of the same event id is re-processed.
// Used when the business handler fails after the claim was taken - without
// this, a transient DB error would permanently swallow the event.
export async function releaseStripeEvent(eventId: string): Promise<void> {
  await db
    .delete(platformMetaTable)
    .where(eq(platformMetaTable.key, "stripeEvent:" + eventId));
}

async function findSlugByCustomerId(customerId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: platformCompaniesTable.slug })
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.stripeCustomerId, customerId))
    .limit(1);
  return row?.slug ?? null;
}

async function getBillingContact(slug: string): Promise<{ email: string | null; companyName: string }> {
  const [company] = await db
    .select({
      billingEmail: platformCompaniesTable.billingEmail,
      email: platformCompaniesTable.email,
      displayName: platformCompaniesTable.displayName,
      slug: platformCompaniesTable.slug,
    })
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.slug, slug))
    .limit(1);
  if (!company) return { email: null, companyName: slug };
  return {
    email: company.billingEmail || company.email || null,
    companyName: company.displayName || company.slug,
  };
}

function customerIdOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

// Best-effort extraction of the subscription id from an invoice, tolerant of
// both older (`invoice.subscription`) and newer (`invoice.parent`) API shapes.
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (legacy) return typeof legacy === "string" ? legacy : legacy.id;
  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
  }).parent;
  const sub = parent?.subscription_details?.subscription;
  if (sub) return typeof sub === "string" ? sub : sub.id;
  return null;
}

// Stale-event guard shared by the invoice handlers: an invoice for a
// subscription other than the one currently stored (e.g. from a superseded
// subscription) must not mutate the account's status.
async function invoiceMatchesStoredSubscription(
  slug: string,
  invoice: Stripe.Invoice,
): Promise<boolean> {
  const state = await getBillingState(slug);
  const invoiceSub = invoiceSubscriptionId(invoice);
  if (state?.stripeSubscriptionId && invoiceSub && invoiceSub !== state.stripeSubscriptionId) {
    logger.info(
      { slug, invoiceSubscription: invoiceSub, storedSubscription: state.stripeSubscriptionId },
      "billing: invoice event for a superseded subscription - ignored",
    );
    return false;
  }
  return true;
}

// checkout.session.completed: activate the subscription on the account named
// in the session metadata. Sessions with kind=project-addon record a purchased
// additional project instead of touching the main plan.
export async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "subscription") return;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    logger.info(
      { eventId: event.id, sessionId: session.id, paymentStatus: session.payment_status },
      "billing: completed checkout is not paid yet - awaiting asynchronous payment confirmation",
    );
    return;
  }
  const slug = normUsername(String(session.metadata?.["slug"] ?? session.client_reference_id ?? ""));
  if (!slug) {
    logger.error({ eventId: event.id, sessionId: session.id }, "billing: checkout.session.completed without account slug");
    return;
  }
  if (session.metadata?.["kind"] === "project-addon") {
    await handleProjectAddonPurchased(session, slug);
    return;
  }
  const plan = session.metadata?.["plan"];
  const frequency = session.metadata?.["frequency"];
  const customerId = customerIdOf(session.customer as string | { id: string } | null);
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

  // Conditional UPDATE: only activate when no *different* subscription is
  // already stored. If a duplicate checkout session completes late (e.g. the
  // original pre-TTL session whose claim was superseded), the update matches
  // 0 rows and we cancel the incoming Stripe subscription to prevent double-billing.
  // Conditional UPDATE: only activate when:
  //  - no subscription is currently stored (first purchase), OR
  //  - the stored subscription matches (idempotent re-processing), OR
  //  - the stored subscription was cancelled (legitimate re-subscription).
  // If a duplicate checkout session completes late (e.g. a session from before
  // the TTL-preemption window, which should no longer be possible but is caught
  // here as defence-in-depth), the update matches 0 rows and we cancel the
  // incoming Stripe subscription to prevent double-billing.
  const activated = await db
    .update(platformCompaniesTable)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      plan: isPlanKey(plan) ? plan : null,
      billingFrequency: isBillingFrequency(frequency) ? frequency : null,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      renewalReminderPeriodEnd: null,
    })
    .where(
      and(
        eq(platformCompaniesTable.slug, slug),
        or(
          isNull(platformCompaniesTable.stripeSubscriptionId),
          eq(platformCompaniesTable.stripeSubscriptionId, subscriptionId ?? ""),
          eq(platformCompaniesTable.subscriptionStatus, "cancelled"),
        ),
      ),
    )
    .returning({ slug: platformCompaniesTable.slug });

  if (activated.length === 0) {
    // A different, non-cancelled subscription is already active - this is a
    // late duplicate. Cancel the incoming Stripe subscription.
    logger.warn(
      { slug, incomingSubscription: subscriptionId },
      "billing: duplicate checkout.session.completed - a different active subscription is already stored; cancelling the incoming one",
    );
    if (subscriptionId) {
      try {
        const stripe = await getUncachableStripeClient();
        await stripe.subscriptions.cancel(subscriptionId);
        logger.info({ slug, subscriptionId }, "billing: duplicate subscription cancelled");
      } catch (err) {
        logger.error({ err, slug, subscriptionId }, "billing: could not cancel duplicate subscription (manual cleanup may be needed)");
      }
    }
    return;
  }

  logger.info({ slug, plan, frequency, subscriptionId }, "billing: subscription activated via checkout");

  // Release the checkout claim now that the session has completed. The claim
  // token is stored in the session metadata so we can release conditionally -
  // an old token from a TTL-preempted claimant cannot delete a successor's claim.
  const claimToken = session.metadata?.["claim_tok"];
  if (claimToken) {
    await releaseCheckout(slug, claimToken).catch((err) => {
      logger.warn({ err, slug }, "billing: could not release checkout claim on completion (non-fatal)");
    });
  }

  // Sync confirmed billing details from Stripe back to the app.
  // The customer can correct their name and address during checkout;
  // customer_update: { address: "auto", name: "auto" } causes Stripe to
  // persist what they typed back to the customer object. We read it here so
  // the app's billing details stay accurate without a separate manual step.
  if (customerId) {
    try {
      const stripe = await getUncachableStripeClient();
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !customer.deleted) {
        const c = customer as Stripe.Customer;
        const current = await getCompanyBillingRecord(slug);
        const patch: Record<string, string | number> = {};
        const companyName = c.name?.trim() || current?.companyName || "";
        if (companyName) patch["displayName"] = companyName;
        if (c.email) patch["billingEmail"] = c.email.trim().toLowerCase();
        const addressLine1 = c.address?.line1?.trim() || current?.addressLine1 || "";
        const townCity = c.address?.city?.trim() || current?.townCity || "";
        const postcode = c.address?.postal_code?.trim() || current?.postcode || "";
        const country = c.address?.country?.trim() || current?.country || "";
        if (current && addressLine1 && townCity && postcode && country) {
          patch["billingAddress"] = composeStoredBillingAddress({
            ...current,
            companyName,
            addressLine1,
            addressLine2: c.address?.line2?.trim() || current.addressLine2,
            townCity,
            postcode,
            country,
          });
          patch["billingAddressVersion"] = 1;
        }
        if (Object.keys(patch).length > 0) {
          await db
            .update(platformCompaniesTable)
            .set(patch as Partial<typeof platformCompaniesTable.$inferInsert>)
            .where(eq(platformCompaniesTable.slug, slug));
          logger.info({ slug }, "billing: synced Stripe customer billing details back to app after checkout");
        }
      }
    } catch (err) {
      logger.warn({ err, slug }, "billing: could not sync Stripe billing details after checkout (non-fatal)");
    }
  }

  // If the account's discount was ended AFTER the checkout session was
  // created but BEFORE the customer completed payment, the new subscription
  // carries a coupon the admin has already cancelled. Remove it immediately
  // so the very next invoice bills full price.
  if (subscriptionId) {
    try {
      const { getAccountDiscount } = await import("./discount-invites");
      const discount = await getAccountDiscount(slug);
      if (discount?.endedAt) {
        const stripe = await getUncachableStripeClient();
        await stripe.subscriptions.deleteDiscount(subscriptionId);
        logger.warn(
          { slug, subscriptionId },
          "billing: removed discount from new subscription - discount was ended before checkout completed",
        );
      }
    } catch (err) {
      logger.warn({ err, slug }, "billing: could not check/remove ended discount after checkout (non-fatal)");
    }
  }
}

// A completed project-addon checkout: record the purchase and, when the buyer
// pre-selected a project (the tier-upgrade path for an included project),
// attach it immediately.
async function handleProjectAddonPurchased(
  session: Stripe.Checkout.Session,
  slug: string,
): Promise<void> {
  const tier = session.metadata?.["tier"];
  if (!isProjectTier(tier)) {
    logger.error({ sessionId: session.id, tier }, "billing: project-addon checkout without a valid tier");
    return;
  }
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (!subscriptionId) {
    logger.error({ sessionId: session.id }, "billing: project-addon checkout without a subscription id");
    return;
  }
  // Revalidate the project binding at fulfilment time: the project can be
  // deleted or reassigned out of this account's subtree while the checkout
  // tab sits open. The ownership check lives in the tier update's SQL
  // predicate; when it doesn't match, the add-on is stored unassigned (the
  // next new project consumes it) rather than mutating a foreign project.
  const requestedProjectId = String(session.metadata?.["projectId"] ?? "") || null;
  let projectId: string | null = null;
  await withSlugLock(slug, async () => {
    const addons = await getProjectAddons(slug);
    if (addons.some((a) => a.subscriptionId === subscriptionId)) return; // replayed
    // Attaching to a project already beyond the included package funds that
    // project's existence. Attaching within included capacity is tier-only.
    // New checkout sessions state this explicitly. Missing metadata belongs to
    // legacy sessions, whose add-ons historically funded project existence.
    const grantsCapacity = session.metadata?.["capacityGrant"] !== "false";
    if (requestedProjectId) {
      // A stale checkout can outlive another purchase that has already
      // claimed this project. Never overwrite that durable assignment; keep
      // this newly purchased slot unassigned instead.
      const alreadyAssigned = addons.some((a) => a.projectId === requestedProjectId);
      if (!alreadyAssigned && await setProjectTierScoped(slug, requestedProjectId, tier)) {
        projectId = requestedProjectId;
      } else if (alreadyAssigned) {
        logger.warn(
          { slug, projectId: requestedProjectId, subscriptionId },
          "billing: add-on target project is already assigned - storing slot unassigned",
        );
      } else {
        logger.warn(
          { slug, projectId: requestedProjectId, subscriptionId },
          "billing: add-on's target project no longer belongs to this account - storing slot unassigned",
        );
      }
    }
    addons.push({
      subscriptionId,
      tier,
      projectId,
      ownerSlug: projectId
        ? normUsername((await listBillingProjects(slug)).find((project) => project.id === projectId)?.owner ?? "")
        : null,
      grantsCapacity,
      purchasedAt: new Date().toISOString(),
    });
    await saveProjectAddons(slug, addons);
  });
  // Persist the customer id if this was the account's first-ever checkout.
  const customerId = customerIdOf(session.customer as string | { id: string } | null);
  if (customerId) {
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: sql`coalesce(${platformCompaniesTable.stripeCustomerId}, ${customerId})` })
      .where(eq(platformCompaniesTable.slug, slug));
  }
  logger.info({ slug, tier, projectId, subscriptionId }, "billing: project add-on purchased");
}

// invoice.payment_succeeded: keep the account active and roll the period end.
export async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = customerIdOf(invoice.customer as string | { id: string } | null);
  if (!customerId) return;
  const slug = await findSlugByCustomerId(customerId);
  if (!slug) {
    // Expected for the very first invoice, which can arrive before
    // checkout.session.completed persists the customer id. The checkout
    // handler sets status=active itself, so nothing is lost.
    logger.info({ eventId: event.id, customerId }, "billing: invoice.payment_succeeded for unknown customer (likely first invoice)");
    return;
  }
  // Record the account's most recent successful payment (any invoice: main
  // plan or add-on) for the admin subscription overview. Fail-soft.
  try {
    await db
      .insert(platformMetaTable)
      .values({ key: `billing:last-payment:${slug}`, value: new Date().toISOString() })
      .onConflictDoUpdate({
        target: platformMetaTable.key,
        set: { value: new Date().toISOString() },
      });
  } catch { /* non-fatal */ }
  // Add-on renewal: apply any queued downgrade now that the renewal invoice
  // has been paid at the new (lower) price.
  const invSub = invoiceSubscriptionId(invoice);
  if (invSub) {
    const isAddonInvoice = await withSlugLock(slug, async () => {
      const addons = await getProjectAddons(slug);
      const addon = addons.find((a) => a.subscriptionId === invSub);
      if (!addon) return false;
      // Only a genuine renewal consumes a queued downgrade. Stripe webhooks
      // are unordered: a delayed initial-purchase or one-off invoice success
      // arriving after the downgrade is queued must not apply it early.
      const isRenewal = invoice.billing_reason === "subscription_cycle";
      if (addon.pendingTier && isRenewal) {
        addon.tier = addon.pendingTier;
        delete addon.pendingTier;
        await saveProjectAddons(slug, addons);
        if (addon.projectId) {
          await setProjectTierScoped(slug, addon.projectId, addon.tier);
        }
        logger.info({ slug, subscriptionId: invSub, tier: addon.tier }, "billing: add-on downgrade applied at renewal");
      }
      return true;
    });
    if (isAddonInvoice) return; // add-on invoices never touch the main plan's status
  }
  if (!(await invoiceMatchesStoredSubscription(slug, invoice))) return;
  const periodEndUnix = invoice.lines?.data?.[0]?.period?.end;
  const state = await getBillingState(slug);
  if (state?.stripeSubscriptionId && invSub && state.stripeSubscriptionId !== invSub) return;
  const nextPeriodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
  const periodChanged =
    !!nextPeriodEnd &&
    state?.currentPeriodEnd?.getTime() !== nextPeriodEnd.getTime();
  await db
    .update(platformCompaniesTable)
    .set({
      subscriptionStatus: "active",
      ...(nextPeriodEnd ? { currentPeriodEnd: nextPeriodEnd } : {}),
      ...(periodChanged ? { renewalReminderPeriodEnd: null } : {}),
    })
    .where(eq(platformCompaniesTable.slug, slug));
  logger.info({ slug, periodEndUnix }, "billing: invoice payment succeeded");
}

// customer.subscription.updated: persist Stripe's scheduled-cancellation flag
// and period changes. Webhooks can arrive out of order, so a superseded
// subscription must never mutate the currently active one.
export async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = customerIdOf(subscription.customer as string | { id: string } | null);
  if (!customerId) return;
  const slug = await findSlugByCustomerId(customerId);
  if (!slug) return;
  const state = await getBillingState(slug);
  if (state?.stripeSubscriptionId && state.stripeSubscriptionId !== subscription.id) {
    logger.info(
      { slug, eventSubscription: subscription.id, storedSubscription: state.stripeSubscriptionId },
      "billing: subscription.updated for a superseded subscription - ignored",
    );
    return;
  }
  // Recent Stripe API versions put billing periods on subscription items.
  // Keep older event payloads compatible; for multiple items the next renewal
  // is the earliest valid item period end, not an arbitrary first item.
  const validPeriodEnd = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value > 0
    && Number.isFinite(new Date(value * 1000).getTime());
  const legacyPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const itemPeriodEnds = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter(validPeriodEnd);
  const subscriptionPeriodEnd = validPeriodEnd(legacyPeriodEnd)
    ? legacyPeriodEnd
    : itemPeriodEnds.length ? Math.min(...itemPeriodEnds) : null;
  const nextPeriodEnd = subscriptionPeriodEnd
    ? new Date(subscriptionPeriodEnd * 1000)
    : null;
  const status =
    subscription.status === "canceled"
      ? "cancelled"
      : subscription.status === "past_due"
        ? "past_due"
        : subscription.status === "active" || subscription.status === "trialing"
          ? "active"
          : null;
  await db
    .update(platformCompaniesTable)
    .set({
      cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
      ...(status ? { subscriptionStatus: status } : {}),
      ...(nextPeriodEnd ? { currentPeriodEnd: nextPeriodEnd } : {}),
      ...(nextPeriodEnd && state?.currentPeriodEnd?.getTime() !== nextPeriodEnd.getTime()
        ? { renewalReminderPeriodEnd: null }
        : {}),
    })
    .where(eq(platformCompaniesTable.slug, slug));
  logger.info(
    { slug, cancelAtPeriodEnd: subscription.cancel_at_period_end, periodEnd: nextPeriodEnd },
    "billing: subscription state updated from Stripe",
  );
}

// invoice.payment_failed: mark past_due and email the billing contact.
export async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = customerIdOf(invoice.customer as string | { id: string } | null);
  if (!customerId) return;
  const slug = await findSlugByCustomerId(customerId);
  if (!slug) {
    logger.warn({ eventId: event.id, customerId }, "billing: invoice.payment_failed for unknown customer");
    return;
  }
  if (!(await invoiceMatchesStoredSubscription(slug, invoice))) return;
  await db
    .update(platformCompaniesTable)
    .set({ subscriptionStatus: "past_due" })
    .where(eq(platformCompaniesTable.slug, slug));

  const contact = await getBillingContact(slug);
  if (contact.email) {
    void sendPaymentFailedEmail({
      toEmail: contact.email,
      companyName: contact.companyName,
      amountDuePence: typeof invoice.amount_due === "number" ? invoice.amount_due : null,
    });
  }
  logger.warn({ slug }, "billing: invoice payment failed - account past_due");
}

// customer.subscription.deleted: mark cancelled and email the billing contact.
// Add-on subscriptions (kind=project-addon) instead remove the purchased
// project slot and clear the project's tier - the main plan is untouched.
export async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = customerIdOf(subscription.customer as string | { id: string } | null);
  if (!customerId) return;
  const slug = await findSlugByCustomerId(customerId);
  if (!slug) {
    logger.warn({ eventId: event.id, customerId }, "billing: subscription.deleted for unknown customer");
    return;
  }
  // Add-on cancellation: match by our stored records (metadata is a hint, the
  // stored list is authoritative).
  {
    const wasAddon = await withSlugLock(slug, async () => {
      const addons = await getProjectAddons(slug);
      const idx = addons.findIndex((a) => a.subscriptionId === subscription.id);
      if (idx < 0) return false;
      const [removed] = addons.splice(idx, 1);
      await saveProjectAddons(slug, addons);
      if (removed!.projectId && removed!.grantsCapacity !== false) {
        // The cancelled slot funded this project - retire it (soft-delete,
        // recoverable) so the account cannot keep an unpaid extra project.
        await softDeleteProjectScoped(slug, removed!.projectId);
      } else if (!removed!.projectId) {
        // Unassigned slot: normally no project consumed it, but if a create
        // slipped through while the slot counted towards the allowance the
        // account may now be over. Flag for support rather than guessing
        // which project to retire.
        const capacity = await getPackageCapacity(slug);
        if (capacity.overLimit) {
          logger.error(
            {
              slug,
              reserved: capacity.reserved,
              allowance: capacity.allowance,
              subscriptionId: subscription.id,
            },
            "billing: account over allowance after unassigned add-on cancellation",
          );
        }
      } else {
        // A tier-only upgrade never funded the project's existence.
        await setProjectTierScoped(slug, removed!.projectId, null);
      }
      logger.warn(
        { slug, subscriptionId: subscription.id, projectId: removed!.projectId },
        "billing: project add-on cancelled",
      );
      return true;
    });
    if (wasAddon) return;
  }
  // Stale-event guard: if the account has since started a NEW subscription
  // (e.g. re-subscribed after cancelling), a late deletion event for the old
  // subscription must not cancel the new one.
  const state = await getBillingState(slug);
  if (state?.stripeSubscriptionId && state.stripeSubscriptionId !== subscription.id) {
    logger.info(
      { slug, eventSubscription: subscription.id, storedSubscription: state.stripeSubscriptionId },
      "billing: subscription.deleted for a superseded subscription - ignored",
    );
    return;
  }
  await db
    .update(platformCompaniesTable)
    .set({ subscriptionStatus: "cancelled", cancelAtPeriodEnd: false })
    .where(eq(platformCompaniesTable.slug, slug));

  const contact = await getBillingContact(slug);
  if (contact.email) {
    void sendSubscriptionCancelledEmail({
      toEmail: contact.email,
      companyName: contact.companyName,
    });
  }
  logger.warn({ slug }, "billing: subscription cancelled");
}

// Dispatches a verified Stripe event to the business handlers above.
// Idempotent: each event id is processed at most once.
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const relevant =
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired" ||
    event.type === "invoice.payment_succeeded" ||
    event.type === "invoice.payment_failed" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted";
  if (!relevant) return;

  if (!(await claimStripeEvent(event.id))) {
    logger.info({ eventId: event.id, type: event.type }, "billing: duplicate webhook event skipped");
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(event);
        break;
      case "checkout.session.async_payment_failed": {
        const failedSession = event.data.object as Stripe.Checkout.Session;
        const failedSlug = normUsername(
          String(failedSession.metadata?.["slug"] ?? failedSession.client_reference_id ?? ""),
        );
        const failedClaimToken = failedSession.metadata?.["claim_tok"];
        if (failedSlug && failedClaimToken) {
          await releaseCheckout(failedSlug, failedClaimToken);
          logger.info({ slug: failedSlug }, "billing: asynchronous checkout payment failed - claim released");
        }
        const failedSubscriptionId = typeof failedSession.subscription === "string"
          ? failedSession.subscription
          : failedSession.subscription?.id;
        if (failedSubscriptionId) {
          try {
            const stripe = await getUncachableStripeClient();
            await stripe.subscriptions.cancel(failedSubscriptionId);
          } catch (err) {
            logger.warn(
              { err, slug: failedSlug, subscriptionId: failedSubscriptionId },
              "billing: could not cancel failed asynchronous checkout subscription (non-fatal)",
            );
          }
        }
        break;
      }
      case "checkout.session.expired": {
        // Release the checkout claim so the account is not locked while waiting
        // for the TTL. The session has expired on Stripe's side so it can never
        // complete; the claim token prevents a foreign release.
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        const expiredSlug = normUsername(
          String(expiredSession.metadata?.["slug"] ?? expiredSession.client_reference_id ?? ""),
        );
        const expiredClaimToken = expiredSession.metadata?.["claim_tok"];
        if (expiredSlug && expiredClaimToken) {
          await releaseCheckout(expiredSlug, expiredClaimToken).catch((err) => {
            logger.warn({ err, slug: expiredSlug }, "billing: could not release checkout claim on session expiry (non-fatal)");
          });
          logger.info({ slug: expiredSlug }, "billing: checkout session expired - claim released");
        }
        break;
      }
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
    }
  } catch (err) {
    // Release the claim so Stripe's retry re-processes the event instead of
    // being skipped as a duplicate, then let the route return 5xx.
    await releaseStripeEvent(event.id).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stripe Tax + customer billing details
// ---------------------------------------------------------------------------

// Full billing details for syncing to the Stripe customer. Structured records
// are mapped to Stripe's address contract, including an ISO alpha-2 country.
async function getBillingDetails(slug: string): Promise<{
  email: string | null;
  companyName: string;
  vatNumber: string | null;
  billingAddress: string | null;
  address: {
    line1: string;
    line2?: string;
    city: string;
    postal_code: string;
    country: string;
  } | null;
} | null> {
  const [company] = await db
    .select({
      billingEmail: platformCompaniesTable.billingEmail,
      email: platformCompaniesTable.email,
      displayName: platformCompaniesTable.displayName,
      slug: platformCompaniesTable.slug,
      vatNumber: platformCompaniesTable.vatNumber,
      billingAddress: platformCompaniesTable.billingAddress,
      billingAddressVersion: platformCompaniesTable.billingAddressVersion,
    })
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.slug, normUsername(slug)))
    .limit(1);
  if (!company) return null;
  const storedAddress = company.billingAddressVersion === 1
    ? splitStoredBillingAddress(company.billingAddress)
    : splitStoredBillingAddress("");
  const stripeCountry = countryNameToIso2(storedAddress.country);
  return {
    email: company.billingEmail || company.email || null,
    companyName: company.displayName || company.slug,
    vatNumber: company.vatNumber || null,
    billingAddress: company.billingAddress || null,
    address: storedAddress.addressLine1 && storedAddress.townCity && storedAddress.postcode && stripeCountry
      ? {
          line1: storedAddress.addressLine1,
          ...(storedAddress.addressLine2 ? { line2: storedAddress.addressLine2 } : {}),
          city: storedAddress.townCity,
          postal_code: storedAddress.postcode,
          country: stripeCountry,
        }
      : null,
  };
}

// Maps a VAT number to a Stripe tax-id type. GB numbers use gb_vat; EU-prefixed
// numbers use eu_vat. Anything else is returned as null (not synced - the
// customer can still enter it at checkout via tax_id_collection).
export function vatNumberToTaxId(vat: string): { type: "gb_vat" | "eu_vat"; value: string } | null {
  const v = vat.replace(/\s+/g, "").toUpperCase();
  if (!v) return null;
  if (v.startsWith("GB") || v.startsWith("XI")) return { type: "gb_vat", value: v };
  const EU_PREFIXES = [
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
    "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
    "SE", "SI", "SK",
  ];
  if (EU_PREFIXES.some((p) => v.startsWith(p))) return { type: "eu_vat", value: v };
  return null;
}

// Pushes the account's billing details (name, email, address, VAT number) to
// its Stripe customer so invoices carry them. Fail-soft: billing-details saves
// must never fail because Stripe is unreachable; the next checkout re-syncs.
export async function syncStripeBillingDetails(slug: string): Promise<void> {
  const key = normUsername(slug);
  // Serialised per account so two rapid saves cannot interleave the tax-ID
  // reconciliation (list-then-create races leaving duplicate/stale IDs).
  await withSlugLock(`billing-sync:${key}`, async () => {
    try {
      const state = await getBillingState(key);
      if (!state?.stripeCustomerId) return;
      const details = await getBillingDetails(key);
      if (!details) return;
      const stripe = await getUncachableStripeClient();
      await stripe.customers.update(state.stripeCustomerId, {
        name: details.companyName,
        ...(details.email ? { email: details.email } : {}),
        // Clearing the address in the app deliberately clears it in Stripe
        // too, so old invoice addresses do not linger.
        ...(details.address
          ? { address: details.address }
          : details.billingAddress
            ? {}
            : { address: "" as unknown as Stripe.Emptyable<Stripe.AddressParam> }),
      });
      // Reconcile the customer's tax IDs with the stored VAT number.
      const wanted = details.vatNumber ? vatNumberToTaxId(details.vatNumber) : null;
      const existing = await stripe.customers.listTaxIds(state.stripeCustomerId, { limit: 10 });
      const alreadyThere = wanted
        ? existing.data.some((t) => t.value.replace(/\s+/g, "").toUpperCase() === wanted.value)
        : false;
      let deletesFailed = false;
      for (const t of existing.data) {
        const keep = wanted && t.value.replace(/\s+/g, "").toUpperCase() === wanted.value;
        if (!keep) {
          try {
            await stripe.customers.deleteTaxId(state.stripeCustomerId, t.id);
          } catch (err) {
            deletesFailed = true;
            logger.warn(
              { err, slug: key, taxId: t.id },
              "billing: could not remove a stale tax ID from the Stripe customer - sync incomplete",
            );
          }
        }
      }
      if (wanted && !alreadyThere) {
        try {
          await stripe.customers.createTaxId(state.stripeCustomerId, wanted);
        } catch (err) {
          // An invalid VAT number must not block the rest of the sync - the
          // customer can still enter a valid one at checkout.
          logger.warn({ err, slug: key }, "billing: could not attach VAT number to Stripe customer");
        }
      }
      if (!deletesFailed) {
        logger.info({ slug: key }, "billing: synced billing details to Stripe customer");
      }
    } catch (err) {
      logger.warn({ err, slug: key }, "billing: failed to sync billing details to Stripe (non-fatal)");
    }
  });
}

// Best-effort, fail-soft attachment of a VAT number to a customer - never
// blocks checkout on a malformed stored value.
async function attachVatNumber(stripe: Stripe, customerId: string, slug: string, vatNumber: string): Promise<void> {
  const wanted = vatNumberToTaxId(vatNumber);
  if (!wanted) return;
  try {
    await stripe.customers.createTaxId(customerId, wanted);
  } catch (err) {
    logger.warn({ err, slug }, "billing: could not attach VAT number to new Stripe customer");
  }
}

// True only when the Stripe error unambiguously means "Stripe Tax has not
// been activated in the dashboard yet" (an invalid_request_error on the
// automatic_tax parameter, or Stripe's activation message). Deliberately
// narrow: other tax/config errors must FAIL the checkout rather than silently
// selling without VAT.
function isTaxConfigurationError(err: unknown): boolean {
  const e = err as { type?: string; param?: string; message?: string } | null;
  if (!e || e.type !== "StripeInvalidRequestError") {
    // Plain Errors from mocks/tests carry no type; fall through to message.
    if (e?.type !== undefined) return false;
  }
  if (e?.param?.startsWith("automatic_tax")) return true;
  const msg = e?.message ?? "";
  return (
    (/stripe tax/i.test(msg) && /activat/i.test(msg)) ||
    (/automatic tax calculation/i.test(msg) && /head office address/i.test(msg))
  );
}

export type CheckoutStartFailureCode =
  | "stripe_tax_incomplete"
  | "discount_verification_failed"
  | "stripe_webhook_unavailable";

export class CheckoutStartError extends Error {
  readonly code: CheckoutStartFailureCode;
  readonly publicMessage: string;
  readonly statusCode: number;

  constructor(
    code: CheckoutStartFailureCode,
    publicMessage: string,
    options?: { cause?: unknown; statusCode?: number },
  ) {
    super(publicMessage, { cause: options?.cause });
    this.name = "CheckoutStartError";
    this.code = code;
    this.publicMessage = publicMessage;
    this.statusCode = options?.statusCode ?? 503;
  }
}

export type CheckoutErrorResponse = {
  status: number;
  error: string;
  code: string;
};

// Convert known checkout setup failures into safe, actionable API responses.
// Unknown failures remain generic so internal or Stripe details are never
// leaked to the browser.
export function getCheckoutErrorResponse(err: unknown): CheckoutErrorResponse | null {
  if (err instanceof CheckoutStartError) {
    return {
      status: err.statusCode,
      error: err.publicMessage,
      code: err.code,
    };
  }

  const e = err as { type?: string; code?: string; message?: string } | null;
  const type = e?.type ?? "";
  const code = e?.code ?? "";
  const message = e?.message ?? "";

  if (
    type === "StripeAuthenticationError" ||
    type === "StripePermissionError" ||
    /^(api_key_expired|account_invalid|oauth_not_supported)$/.test(code) ||
    /invalid api key|stripe integration not connected|missing secret key|failed to fetch stripe credentials/i.test(message)
  ) {
    return {
      status: 503,
      error: "Checkout is temporarily unavailable because the Stripe connection needs attention. Please contact support.",
      code: "stripe_connection_unavailable",
    };
  }

  if (
    code === "resource_missing" &&
    /\b(price|product)\b/i.test(message)
  ) {
    return {
      status: 503,
      error: "Checkout is temporarily unavailable because the Stripe price setup is incomplete. Please contact support.",
      code: "stripe_price_unavailable",
    };
  }

  return null;
}

function assertStripeCheckoutReady(): void {
  const readiness = getStripeCheckoutReadiness();
  if (readiness.available) return;
  throw new CheckoutStartError(
    "stripe_webhook_unavailable",
    "Checkout is temporarily unavailable because the payment notification setup needs attention. Please contact support.",
  );
}

// ---------------------------------------------------------------------------
// Startup Stripe Tax health check
// ---------------------------------------------------------------------------

// Probe whether Stripe Tax is activated by attempting a stateless Tax
// Calculation. This is read-only (calculations are not persisted) so it has
// no side effects. If Tax is not fully configured, the call throws an error
// that matches isTaxConfigurationError and a loud warning is logged. Called at
// server startup in live mode only; test-mode omission is intentional since
// Tax activation is a one-time dashboard step.
export async function warnIfTaxDeactivated(stripe: Stripe): Promise<void> {
  try {
    await (stripe.tax as unknown as { calculations: { create: (p: Record<string, unknown>) => Promise<unknown> } })
      .calculations.create({
        currency: "gbp",
        line_items: [{ amount: 100, reference: "_startup_tax_probe_" }],
      });
    // Success - Stripe Tax is active; nothing to warn about.
  } catch (err) {
    if (isTaxConfigurationError(err)) {
      logger.error(
        {},
        "billing: STARTUP - Stripe Tax is NOT fully configured in LIVE mode. " +
          "All live checkout attempts will be refused until you activate Stripe Tax " +
          "and set a valid head office address in the Stripe dashboard. " +
          "See the 'Owner setup' section in replit.md for steps.",
      );
      return;
    }
    // Network errors, auth errors, etc. do not constitute a Tax activation
    // problem - do not block startup on transient Stripe issues.
  }
}

// True when the connected Stripe key is a live key. Checked FRESH on every
// call (no caching): credentials can be swapped from test to live without a
// restart, and a stale "test" answer would permit a taxless live checkout.
export async function isLiveStripeMode(): Promise<boolean> {
  try {
    const { getStripeCredentials } = await import("./stripe-client");
    const { secretKey } = await getStripeCredentials();
    return /^(sk|rk)_live_/.test(secretKey ?? "");
  } catch {
    // Unknown -> assume live: never silently drop VAT when unsure.
    return true;
  }
}

// Creates a Checkout Session with Stripe Tax (automatic tax + billing address
// + VAT number collection). If Stripe Tax is not yet activated:
//  - test mode: log loudly and fall back to a taxless session so test
//    payments are not blocked before the one-time dashboard activation;
//  - live mode: fail the checkout - a UK business must never silently sell
//    without VAT because of a configuration gap.
async function createSessionWithTax(
  stripe: Stripe,
  slug: string,
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  const withTax: Stripe.Checkout.SessionCreateParams = {
    ...params,
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    // Required when reusing an existing customer with automatic tax: the
    // address and name confirmed at checkout are saved back to the customer.
    customer_update: { address: "auto", name: "auto" },
  };
  try {
    return await stripe.checkout.sessions.create(withTax);
  } catch (err) {
    if (!isTaxConfigurationError(err)) throw err;
    if (await isLiveStripeMode()) {
      logger.error(
        { err, slug },
        "billing: Stripe Tax setup is incomplete in LIVE mode - checkout refused. Activate Stripe Tax and set a valid head office address (see replit.md).",
      );
      throw new CheckoutStartError(
        "stripe_tax_incomplete",
        "Stripe Tax setup is incomplete. The account owner must activate Stripe Tax and set a valid head office address in Stripe, then try again.",
        { cause: err },
      );
    }
    logger.error(
      { err, slug },
      "billing: Stripe Tax setup is incomplete - TEST checkout created WITHOUT VAT. Activate Stripe Tax and set a valid head office address (see replit.md).",
    );
    return stripe.checkout.sessions.create(params);
  }
}

// ---------------------------------------------------------------------------
// Checkout session creation
// ---------------------------------------------------------------------------

export async function createCheckoutSession(opts: {
  slug: string;
  plan: PlanKey;
  frequency: BillingFrequency;
  successUrl: string;
  cancelUrl: string;
  // Stored in Stripe session metadata so the webhook can conditionally release
  // the DB checkout claim when the session completes.
  claimToken?: string;
}): Promise<{ url: string; sessionId: string }> {
  assertStripeCheckoutReady();
  const stripe = await getUncachableStripeClient();
  const slug = normUsername(opts.slug);
  const price = PLAN_PRICES[opts.plan][opts.frequency];
  const priceId = await ensurePriceId(stripe, price);

  // Reuse the stored customer, or create one with the billing details prefilled.
  const customerId = await ensureStripeCustomerId(stripe, slug);

  // Invite-based discount: if this account redeemed a discount invite (and
  // the master admin hasn't ended it), attach the reusable coupon for that %
  // server-side. Subscription-level with duration "forever", so every renewal
  // stays discounted. Never driven by client input.
  let discounts: Array<{ coupon: string }> | undefined;
  try {
    const { getActiveAccountDiscount, ensureDiscountCoupon } = await import("./discount-invites");
    const discount = await getActiveAccountDiscount(slug);
    if (discount) {
      discounts = [{ coupon: await ensureDiscountCoupon(stripe, discount.percent) }];
    }
  } catch (err) {
    // Fail LOUD: silently charging an invited beta tester full price would be
    // worse than a failed checkout attempt.
    logger.error({ err, slug }, "billing: failed to resolve discount for checkout");
    throw new CheckoutStartError(
      "discount_verification_failed",
      "We could not verify this account's discount, so no payment was started. Please contact support before retrying.",
      { cause: err },
    );
  }

  const extraMeta: Record<string, string> = {};
  if (opts.claimToken) extraMeta["claim_tok"] = opts.claimToken;

  const session = await createSessionWithTax(stripe, slug, {
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(discounts ? { discounts } : {}),
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: slug,
    metadata: { slug, plan: opts.plan, frequency: opts.frequency, ...extraMeta },
    subscription_data: {
      metadata: { slug, plan: opts.plan, frequency: opts.frequency },
    },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

// Reuses (or creates) the account's Stripe customer. Shared by the plan and
// add-on checkout paths.
async function ensureStripeCustomerId(stripe: Stripe, slug: string): Promise<string> {
  const state = await getBillingState(slug);
  if (state?.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(state.stripeCustomerId);
      if (!customer.deleted) {
        // Keep the customer's invoice details fresh before checkout.
        await syncStripeBillingDetails(slug);
        return state.stripeCustomerId;
      }
      if (hasPaidSubscription(state)) {
        throw new Error("Stored Stripe customer was deleted for an entitled account");
      }
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? (err as { code?: unknown }).code
          : undefined;
      // A customer created in the Replit sandbox does not exist in the live
      // Stripe account. It is safe to replace only before any subscription is
      // active; entitled accounts must be repaired manually to avoid detaching
      // a real subscription from its customer.
      if (code !== "resource_missing" || hasPaidSubscription(state)) throw err;
      logger.info(
        { slug, customerId: state.stripeCustomerId },
        "billing: replacing stale Stripe customer before first live checkout",
      );
    }
  }
  const details = await getBillingDetails(slug);
  const customer = await stripe.customers.create({
    email: details?.email ?? undefined,
    name: details?.companyName ?? slug,
    ...(details?.address
      ? { address: details.address }
      : {}),
    metadata: { slug },
  });
  // VAT number attached separately and fail-soft: a malformed stored value
  // must never block checkout (the customer can enter it at checkout).
  if (details?.vatNumber) await attachVatNumber(stripe, customer.id, slug, details.vatNumber);
  await db
    .update(platformCompaniesTable)
    .set({ stripeCustomerId: customer.id })
    .where(eq(platformCompaniesTable.slug, slug));
  return customer.id;
}

// Checkout for an additional project (its own annual subscription). When
// projectId is given the add-on attaches to that project on fulfilment (used
// to upgrade an included project); otherwise the slot is consumed by the next
// project the account creates.
export async function createProjectCheckoutSession(opts: {
  slug: string;
  tier: ProjectTier;
  projectId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  assertStripeCheckoutReady();
  const stripe = await getUncachableStripeClient();
  const slug = normUsername(opts.slug);
  const priceId = await ensurePriceId(stripe, PROJECT_TIER_PRICES[opts.tier]);
  const customerId = await ensureStripeCustomerId(stripe, slug);
  const metadata: Record<string, string> = {
    slug,
    kind: "project-addon",
    tier: opts.tier,
    capacityGrant: opts.projectId ? "false" : "true",
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  };
  const session = await createSessionWithTax(stripe, slug, {
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: slug,
    metadata,
    subscription_data: { metadata },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

// ---------------------------------------------------------------------------
// Customer Portal (payment method updates + cancellation) and invoices
// ---------------------------------------------------------------------------

let portalConfigurationId: string | null = null;

// The Customer Portal needs a saved configuration. Rather than requiring a
// manual dashboard step, find an active one or create a minimal configuration
// (invoice history, payment-method update, cancel at period end).
async function ensurePortalConfiguration(stripe: Stripe): Promise<string> {
  if (portalConfigurationId) return portalConfigurationId;
  const existing = await stripe.billingPortal.configurations.list({ active: true, limit: 1 });
  if (existing.data[0]) {
    portalConfigurationId = existing.data[0].id;
    return portalConfigurationId;
  }
  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "AIO Fusion billing" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
  });
  portalConfigurationId = created.id;
  logger.info({ configurationId: created.id }, "billing: created Customer Portal configuration");
  return created.id;
}

export async function createPortalSession(slug: string, returnUrl: string): Promise<{ url: string }> {
  const stripe = await getUncachableStripeClient();
  const state = await getBillingState(normUsername(slug));
  if (!state?.stripeCustomerId) throw new Error("No Stripe customer for this account yet");
  const configuration = await ensurePortalConfiguration(stripe);
  const session = await stripe.billingPortal.sessions.create({
    customer: state.stripeCustomerId,
    configuration,
    return_url: returnUrl,
  });
  return { url: session.url };
}

export interface InvoiceSummary {
  id: string;
  number: string | null;
  created: string;
  amountDuePence: number;
  status: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export async function listCustomerInvoices(slug: string): Promise<InvoiceSummary[]> {
  const state = await getBillingState(normUsername(slug));
  if (!state?.stripeCustomerId) return [];
  const stripe = await getUncachableStripeClient();
  const invoices = await stripe.invoices.list({ customer: state.stripeCustomerId, limit: 24 });
  return invoices.data.map((inv) => ({
    id: inv.id ?? "",
    number: inv.number ?? null,
    created: new Date(inv.created * 1000).toISOString(),
    amountDuePence: inv.amount_due ?? 0,
    status: inv.status ?? null,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdf: inv.invoice_pdf ?? null,
  }));
}

// Hosted link for the most recent invoice, for a "view invoice" shortcut on
// the subscription card. Fail-soft: the card renders without it.
export async function getLatestInvoiceLink(slug: string): Promise<string | null> {
  try {
    const state = await getBillingState(normUsername(slug));
    if (!state?.stripeCustomerId) return null;
    const stripe = await getUncachableStripeClient();
    const invoices = await stripe.invoices.list({ customer: state.stripeCustomerId, limit: 1 });
    return invoices.data[0]?.hosted_invoice_url ?? null;
  } catch (err) {
    logger.warn({ err, slug }, "billing: could not load latest invoice link (non-fatal)");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Add-on tier changes
// ---------------------------------------------------------------------------

const TIER_RANK: Record<ProjectTier, number> = { standard: 0, premium: 1, max: 2 };
export const PROJECT_TIER_QUOTE_TTL_MS = 5 * 60 * 1000;

export interface ProjectTierQuote {
  quoteId: string;
  amountDue: number;
  currency: string;
  annualRenewalAmount: number;
  prorationDate: number;
  expiresAt: number;
  applied: "now" | "at_renewal";
}

export interface TierChangeReconciliation {
  matched: boolean;
  amountPaid: number;
  currency: string;
  expectedAmount: number;
}

type StoredProjectTierQuote = ProjectTierQuote & {
  slug: string;
  projectId: string;
  subscriptionId: string;
  tier: ProjectTier;
  itemId: string;
  priceId: string;
  quantity: number;
  subscriptionState: string;
  status: "pending" | "processing";
};

export class ProjectTierChangeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly changed = false,
    readonly reconciliation?: TierChangeReconciliation,
  ) {
    super(message);
    this.name = "ProjectTierChangeError";
  }
}

const tierQuoteKey = (quoteId: string) => `projectTierQuote:${quoteId}`;

function subscriptionItemPriceId(item: Stripe.SubscriptionItem): string {
  return typeof item.price === "string" ? item.price : item.price.id;
}

function subscriptionStateFingerprint(subscription: Stripe.Subscription, item: Stripe.SubscriptionItem): string {
  const periodEnd =
    (item as Stripe.SubscriptionItem & { current_period_end?: number }).current_period_end ??
    (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end ??
    null;
  return JSON.stringify({
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    periodEnd,
    itemId: item.id,
    priceId: subscriptionItemPriceId(item),
    quantity: item.quantity ?? 1,
  });
}

function expandableId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function isDefinitiveStripeRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const stripeError = err as { type?: unknown; statusCode?: unknown };
  if (stripeError.type === "StripeCardError") return true;
  return (
    typeof stripeError.statusCode === "number" &&
    stripeError.statusCode >= 400 &&
    stripeError.statusCode < 500
  );
}

async function getRecurringPriceAmount(
  stripe: Stripe,
  priceId: string,
  quantity: number,
): Promise<{ amount: number; currency: string }> {
  const price = await stripe.prices.retrieve(priceId);
  if (
    price.type !== "recurring" ||
    price.recurring?.interval !== "year" ||
    price.recurring.interval_count !== 1 ||
    price.unit_amount == null
  ) {
    throw new Error("The selected project tier does not have a yearly recurring Stripe price.");
  }
  return { amount: price.unit_amount * quantity, currency: price.currency.toLowerCase() };
}

function previewParams(
  subscriptionId: string,
  itemId: string,
  priceId: string,
  quantity: number,
  prorationDate: number,
): Stripe.InvoiceCreatePreviewParams {
  return {
    subscription: subscriptionId,
    subscription_details: {
      items: [{ id: itemId, price: priceId, quantity }],
      proration_behavior: "always_invoice",
      proration_date: prorationDate,
    },
  };
}

export async function previewAddonTierChange(opts: {
  slug: string;
  projectId: string;
  subscriptionId: string;
  newTier: ProjectTier;
}): Promise<ProjectTierQuote> {
  const slug = normUsername(opts.slug);
  return withSlugLock(slug, async () => {
    const addons = await getProjectAddons(slug);
    const addon = addons.find(
      (candidate) =>
        candidate.subscriptionId === opts.subscriptionId && candidate.projectId === opts.projectId,
    );
    if (!addon) throw new ProjectTierChangeError("Add-on not found.", "ADDON_NOT_FOUND");
    if (addon.tier === opts.newTier && !addon.pendingTier) {
      throw new ProjectTierChangeError("That project is already on this tier.", "TIER_UNCHANGED");
    }

    const stripe = await getUncachableStripeClient();
    const priceId = await ensurePriceId(stripe, PROJECT_TIER_PRICES[opts.newTier]);
    const subscription = await stripe.subscriptions.retrieve(opts.subscriptionId);
    const item = subscription.items.data[0];
    if (!item) throw new Error("Add-on subscription has no item to update");
    const isUpgrade = TIER_RANK[opts.newTier] > TIER_RANK[addon.tier];
    if (isUpgrade && subscriptionItemPriceId(item) === priceId) {
      throw new ProjectTierChangeError(
        "Stripe already has this tier, but local billing is still reconciling. Refresh billing and do not retry this charge.",
        "STRIPE_TIER_ALREADY_CHANGED",
        true,
      );
    }
    const quantity = item.quantity ?? 1;
    const recurring = await getRecurringPriceAmount(stripe, priceId, quantity);
    const prorationDate = Math.floor(Date.now() / 1000);
    let amountDue = 0;
    let currency = recurring.currency;

    if (isUpgrade) {
      const invoice = await stripe.invoices.createPreview(
        previewParams(opts.subscriptionId, item.id, priceId, quantity, prorationDate),
      );
      amountDue = invoice.amount_due;
      currency = invoice.currency.toLowerCase();
    }

    const quoteId = randomUUID();
    const quote: ProjectTierQuote = {
      quoteId,
      amountDue,
      currency,
      annualRenewalAmount: recurring.amount,
      prorationDate,
      expiresAt: Date.now() + PROJECT_TIER_QUOTE_TTL_MS,
      applied: isUpgrade ? "now" : "at_renewal",
    };
    const stored: StoredProjectTierQuote = {
      ...quote,
      slug,
      projectId: opts.projectId,
      subscriptionId: opts.subscriptionId,
      tier: opts.newTier,
      itemId: item.id,
      priceId,
      quantity,
      subscriptionState: subscriptionStateFingerprint(subscription, item),
      status: "pending",
    };
    await db.insert(platformMetaTable).values({
      key: tierQuoteKey(quoteId),
      value: JSON.stringify(stored),
    });
    return quote;
  });
}

async function claimProjectTierQuote(
  quoteId: string,
  target: Pick<StoredProjectTierQuote, "slug" | "projectId" | "subscriptionId" | "tier">,
): Promise<StoredProjectTierQuote> {
  const result = await db.execute(sql`
    UPDATE platform_meta
    SET value = jsonb_set(value::jsonb, '{status}', '"processing"'::jsonb)::text
    WHERE key = ${tierQuoteKey(quoteId)}
      AND (value::json->>'status') = 'pending'
      AND (value::json->>'slug') = ${target.slug}
      AND (value::json->>'projectId') = ${target.projectId}
      AND (value::json->>'subscriptionId') = ${target.subscriptionId}
      AND (value::json->>'tier') = ${target.tier}
      AND ((value::json->>'expiresAt')::bigint) > ${Date.now()}
    RETURNING value
  `);
  const row = (result.rows[0] as { value?: string } | undefined)?.value;
  if (!row) {
    throw new ProjectTierChangeError(
      "This tier quote is no longer available. Request a new quote.",
      "QUOTE_INVALID",
    );
  }
  const quote = JSON.parse(row) as StoredProjectTierQuote;
  return quote;
}

// Changes an add-on subscription's tier.
//  - Upgrade: the price is swapped with an immediate prorated charge and the
//    project's higher action limit applies straight away.
//  - Downgrade: the price is swapped with no proration (the lower price bills
//    from the next renewal) and the lower limit is queued via pendingTier.
export async function changeAddonTier(opts: {
  slug: string;
  projectId: string;
  subscriptionId: string;
  newTier: ProjectTier;
  quoteId?: string;
}): Promise<{ applied: "now" | "at_renewal"; reconciliation?: TierChangeReconciliation }> {
  const slug = normUsername(opts.slug);
  return withSlugLock(slug, async () => {
    const addons = await getProjectAddons(slug);
    const addon = addons.find(
      (candidate) =>
        candidate.subscriptionId === opts.subscriptionId && candidate.projectId === opts.projectId,
    );
    if (!addon) throw new Error("Add-on not found");
    if (addon.tier === opts.newTier && !addon.pendingTier) {
      return { applied: "now" as const };
    }
    const isUpgrade = TIER_RANK[opts.newTier] > TIER_RANK[addon.tier];

    const stripe = await getUncachableStripeClient();
    const priceId = await ensurePriceId(stripe, PROJECT_TIER_PRICES[opts.newTier]);
    const subscription = await stripe.subscriptions.retrieve(opts.subscriptionId);
    const item = subscription.items.data[0];
    if (!item) throw new Error("Add-on subscription has no item to update");
    const itemId = item.id;
    const quantity = item.quantity ?? 1;
    if (isUpgrade && subscriptionItemPriceId(item) === priceId) {
      throw new ProjectTierChangeError(
        "Stripe already has this tier, but local billing is still reconciling. Refresh billing and do not retry this charge.",
        "STRIPE_TIER_ALREADY_CHANGED",
        true,
      );
    }

    if (isUpgrade) {
      if (!opts.quoteId) {
        throw new ProjectTierChangeError(
          "Confirm this upgrade from a current price quote.",
          "QUOTE_REQUIRED",
        );
      }
      const quote = await claimProjectTierQuote(opts.quoteId, {
        slug,
        projectId: opts.projectId,
        subscriptionId: opts.subscriptionId,
        tier: opts.newTier,
      });
      if (
        quote.priceId !== priceId ||
        quote.itemId !== itemId ||
        quote.quantity !== quantity ||
        quote.subscriptionState !== subscriptionStateFingerprint(subscription, item)
      ) {
        throw new ProjectTierChangeError(
          "The subscription changed after this quote was created. Request a new quote.",
          "QUOTE_STALE",
        );
      }

      const revalidated = await stripe.invoices.createPreview(
        previewParams(opts.subscriptionId, itemId, priceId, quantity, quote.prorationDate),
      );
      if (
        revalidated.amount_due !== quote.amountDue ||
        revalidated.currency.toLowerCase() !== quote.currency
      ) {
        throw new ProjectTierChangeError(
          "The amount due has changed. Request a new quote before upgrading.",
          "QUOTE_MISMATCH",
        );
      }

      let updatedSubscription: Stripe.Subscription;
      try {
        updatedSubscription = await stripe.subscriptions.update(
          opts.subscriptionId,
          {
            items: [{ id: itemId, price: priceId, quantity }],
            proration_behavior: "always_invoice",
            proration_date: quote.prorationDate,
            payment_behavior: "error_if_incomplete",
            metadata: { ...subscription.metadata, tier: opts.newTier },
            expand: ["latest_invoice"],
          },
          { idempotencyKey: `project-tier-quote-${quote.quoteId}` },
        );
      } catch (err) {
        if (isDefinitiveStripeRejection(err)) {
          throw new ProjectTierChangeError(
            "The upgrade payment was not completed. Request a fresh quote before trying again.",
            "PAYMENT_FAILED",
          );
        }
        logger.error({ err, slug, subscriptionId: opts.subscriptionId }, "billing: ambiguous project tier update error");
        throw new ProjectTierChangeError(
          "Stripe may have applied this change, but confirmation was interrupted. Refresh billing and do not retry.",
          "UPDATE_OUTCOME_UNKNOWN",
          true,
        );
      }

      let reconciliation: TierChangeReconciliation;
      try {
        const latest = updatedSubscription.latest_invoice;
        const oldLatestInvoiceId = expandableId(subscription.latest_invoice);
        const updatedLatestInvoiceId = expandableId(latest);
        const invoice =
          typeof latest === "string"
            ? await stripe.invoices.retrieve(latest)
            : latest;
        const amountPaid = invoice?.amount_paid ?? 0;
        const invoiceCurrency = invoice?.currency?.toLowerCase() ?? quote.currency;
        reconciliation = {
          matched:
            Boolean(invoice) &&
            Boolean(updatedLatestInvoiceId) &&
            (!oldLatestInvoiceId || updatedLatestInvoiceId !== oldLatestInvoiceId) &&
            invoice!.status === "paid" &&
            invoiceSubscriptionId(invoice!) === opts.subscriptionId &&
            invoice!.amount_due === quote.amountDue &&
            amountPaid === quote.amountDue &&
            invoiceCurrency === quote.currency,
          amountPaid,
          currency: invoiceCurrency,
          expectedAmount: quote.amountDue,
        };
      } catch (err) {
        logger.error({ err, slug, subscriptionId: opts.subscriptionId }, "billing: could not reconcile tier upgrade invoice");
        reconciliation = {
          matched: false,
          amountPaid: 0,
          currency: quote.currency,
          expectedAmount: quote.amountDue,
        };
      }
      if (!reconciliation.matched) {
        throw new ProjectTierChangeError(
          "The Stripe change was applied, but its paid invoice could not be verified. Refresh billing before taking any further action.",
          "INVOICE_RECONCILIATION_FAILED",
          true,
          reconciliation,
        );
      }

      try {
        addon.tier = opts.newTier;
        delete addon.pendingTier;
        await saveProjectAddons(slug, addons);
        if (addon.projectId) {
          const projectUpdated = await setProjectTierScoped(slug, addon.projectId, opts.newTier);
          if (!projectUpdated) {
            throw new Error("The add-on project is no longer available to this billing account.");
          }
        }
      } catch (err) {
        logger.error({ err, slug, subscriptionId: opts.subscriptionId }, "billing: paid tier upgrade persistence failed");
        throw new ProjectTierChangeError(
          "The paid Stripe change was verified, but local billing could not be updated. Refresh billing and do not retry.",
          "LOCAL_RECONCILIATION_FAILED",
          true,
          reconciliation,
        );
      }
      logger.info({ slug, subscriptionId: opts.subscriptionId, tier: opts.newTier }, "billing: add-on upgraded");
      return { applied: "now" as const, reconciliation };
    }

    await stripe.subscriptions.update(opts.subscriptionId, {
      items: [{ id: itemId, price: priceId, quantity }],
      proration_behavior: "none",
      metadata: { ...subscription.metadata, tier: opts.newTier },
    });
    addon.pendingTier = opts.newTier;
    await saveProjectAddons(slug, addons);
    logger.info({ slug, subscriptionId: opts.subscriptionId, pendingTier: opts.newTier }, "billing: add-on downgrade queued to renewal");
    return { applied: "at_renewal" as const };
  });
}

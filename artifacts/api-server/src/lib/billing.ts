import type Stripe from "stripe";
import {
  db,
  platformCompaniesTable,
  platformMetaTable,
  projectsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getUncachableStripeClient } from "./stripe-client";
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
import { getAccount, normUsername } from "./platform-auth";
import { sendPaymentFailedEmail, sendSubscriptionCancelledEmail } from "./notify-email";

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
}

export async function getBillingState(slug: string): Promise<BillingState | null> {
  const [row] = await db
    .select({
      subscriptionStatus: platformCompaniesTable.subscriptionStatus,
      plan: platformCompaniesTable.plan,
      billingFrequency: platformCompaniesTable.billingFrequency,
      stripeCustomerId: platformCompaniesTable.stripeCustomerId,
      stripeSubscriptionId: platformCompaniesTable.stripeSubscriptionId,
      currentPeriodEnd: platformCompaniesTable.currentPeriodEnd,
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
  };
}

// An account is "entitled" while its subscription is active or in dunning
// (past_due keeps access during the retry window - Stripe cancels it, and we
// flip to cancelled, if payment never recovers).
export function isEntitled(state: Pick<BillingState, "status"> | null): boolean {
  return !!state && (state.status === "active" || state.status === "past_due");
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

// ---------------------------------------------------------------------------
// Per-project action limits
// ---------------------------------------------------------------------------

export const NO_SUBSCRIPTION_ACTION_LIMIT = 50;

// Derives the 30-day action limit for a project:
//  - subscribed account + explicit project tier  -> that tier's limit
//  - subscribed account + no tier (included)     -> Premium (75)
//  - unsubscribed account (Beta grandfathering)  -> flat 50, as today
// Fail-soft: any DB error returns the legacy flat limit.
export async function getProjectActionLimit(
  accountId: string,
  projectId?: string | null,
): Promise<number> {
  try {
    const billingSlug = await resolveBillingSlug(accountId);
    const state = await getBillingState(billingSlug);
    if (!isEntitled(state)) return NO_SUBSCRIPTION_ACTION_LIMIT;
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
    logger.warn({ err, accountId, projectId }, "billing: getProjectActionLimit failed - using legacy limit");
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
const slugLocks = new Map<string, Promise<unknown>>();

export async function withSlugLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const key = normUsername(slug);
  const prev = slugLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  slugLocks.set(key, run.catch(() => undefined));
  try {
    return await run;
  } finally {
    if (slugLocks.get(key) !== run && slugLocks.get(key) === undefined) slugLocks.delete(key);
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

export async function saveProjectAddons(slug: string, addons: ProjectAddon[]): Promise<void> {
  const value = JSON.stringify(addons);
  await db
    .insert(platformMetaTable)
    .values({ key: addonsKey(slug), value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

// The account's total project allowance: plan-included projects plus purchased
// add-ons. Unsubscribed accounts get the legacy flat cap of 2.
export const LEGACY_PROJECT_CAP = 2;

export async function getProjectAllowance(slug: string): Promise<number> {
  try {
    const billingSlug = await resolveBillingSlug(slug);
    const state = await getBillingState(billingSlug);
    if (!isEntitled(state)) return LEGACY_PROJECT_CAP;
    const addons = await getProjectAddons(billingSlug);
    return Math.max(
      LEGACY_PROJECT_CAP,
      (state!.plan ? INCLUDED_PROJECTS[state!.plan] : 0) + addons.length,
    );
  } catch (err) {
    logger.warn({ err, slug }, "billing: getProjectAllowance failed - using legacy cap");
    return LEGACY_PROJECT_CAP;
  }
}

// When a NEW project is created, attach the oldest unassigned purchased add-on
// (if any) so the project immediately carries the tier that was paid for.
// Fail-soft: any error leaves the project as a plain (included) project.
export async function assignAddonToNewProject(slug: string, projectId: string): Promise<void> {
  try {
    const billingSlug = await resolveBillingSlug(slug);
    await withSlugLock(billingSlug, async () => {
      const addons = await getProjectAddons(billingSlug);
      const free = addons.find((a) => !a.projectId);
      if (!free) return;
      free.projectId = projectId;
      await saveProjectAddons(billingSlug, addons);
      await db.update(projectsTable).set({ tier: free.tier }).where(eq(projectsTable.id, projectId));
      logger.info(
        { slug: billingSlug, projectId, tier: free.tier, subscriptionId: free.subscriptionId },
        "billing: assigned purchased add-on to new project",
      );
    });
  } catch (err) {
    logger.warn({ err, slug, projectId }, "billing: assignAddonToNewProject failed (non-fatal)");
  }
}

// All live projects owned by the billing subtree (the billing account plus its
// descendant sub-accounts), for the billing UI's usage counter and pickers.
export async function listBillingProjects(slug: string): Promise<
  Array<{ id: string; name: string; tier: ProjectTier | null; owner: string }>
> {
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

  await db
    .update(platformCompaniesTable)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      plan: isPlanKey(plan) ? plan : null,
      billingFrequency: isBillingFrequency(frequency) ? frequency : null,
      subscriptionStatus: "active",
    })
    .where(eq(platformCompaniesTable.slug, slug));
  logger.info({ slug, plan, frequency, subscriptionId }, "billing: subscription activated via checkout");
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
  // tab sits open. An invalid binding leaves the add-on unassigned (the next
  // new project consumes it) rather than mutating a foreign project.
  let projectId = String(session.metadata?.["projectId"] ?? "") || null;
  if (projectId && !(await isProjectInBillingSubtree(slug, projectId))) {
    logger.warn(
      { slug, projectId, subscriptionId },
      "billing: add-on's target project no longer belongs to this account - storing slot unassigned",
    );
    projectId = null;
  }

  await withSlugLock(slug, async () => {
    const addons = await getProjectAddons(slug);
    if (addons.some((a) => a.subscriptionId === subscriptionId)) return; // replayed
    addons.push({
      subscriptionId,
      tier,
      projectId,
      purchasedAt: new Date().toISOString(),
    });
    await saveProjectAddons(slug, addons);
  });
  if (projectId) {
    await db.update(projectsTable).set({ tier }).where(eq(projectsTable.id, projectId));
  }
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
  // Add-on renewal: apply any queued downgrade now that the renewal invoice
  // has been paid at the new (lower) price.
  const invSub = invoiceSubscriptionId(invoice);
  if (invSub) {
    const isAddonInvoice = await withSlugLock(slug, async () => {
      const addons = await getProjectAddons(slug);
      const addon = addons.find((a) => a.subscriptionId === invSub);
      if (!addon) return false;
      if (addon.pendingTier) {
        addon.tier = addon.pendingTier;
        delete addon.pendingTier;
        await saveProjectAddons(slug, addons);
        if (addon.projectId && (await isProjectInBillingSubtree(slug, addon.projectId))) {
          await db.update(projectsTable).set({ tier: addon.tier }).where(eq(projectsTable.id, addon.projectId));
        }
        logger.info({ slug, subscriptionId: invSub, tier: addon.tier }, "billing: add-on downgrade applied at renewal");
      }
      return true;
    });
    if (isAddonInvoice) return; // add-on invoices never touch the main plan's status
  }
  if (!(await invoiceMatchesStoredSubscription(slug, invoice))) return;
  const periodEndUnix = invoice.lines?.data?.[0]?.period?.end;
  await db
    .update(platformCompaniesTable)
    .set({
      subscriptionStatus: "active",
      ...(periodEndUnix ? { currentPeriodEnd: new Date(periodEndUnix * 1000) } : {}),
    })
    .where(eq(platformCompaniesTable.slug, slug));
  logger.info({ slug, periodEndUnix }, "billing: invoice payment succeeded");
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
      if (removed!.projectId && (await isProjectInBillingSubtree(slug, removed!.projectId))) {
        await db
          .update(projectsTable)
          .set({ tier: null })
          .where(eq(projectsTable.id, removed!.projectId));
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
    .set({ subscriptionStatus: "cancelled" })
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
    event.type === "invoice.payment_succeeded" ||
    event.type === "invoice.payment_failed" ||
    event.type === "customer.subscription.deleted";
  if (!relevant) return;

  if (!(await claimStripeEvent(event.id))) {
    logger.info({ eventId: event.id, type: event.type }, "billing: duplicate webhook event skipped");
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
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
// Checkout session creation
// ---------------------------------------------------------------------------

export async function createCheckoutSession(opts: {
  slug: string;
  plan: PlanKey;
  frequency: BillingFrequency;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const stripe = await getUncachableStripeClient();
  const slug = normUsername(opts.slug);
  const price = PLAN_PRICES[opts.plan][opts.frequency];
  const priceId = await ensurePriceId(stripe, price);

  // Reuse the stored customer, or create one with the billing email prefilled.
  const state = await getBillingState(slug);
  let customerId = state?.stripeCustomerId ?? null;
  if (!customerId) {
    const contact = await getBillingContact(slug);
    const customer = await stripe.customers.create({
      email: contact.email ?? undefined,
      name: contact.companyName,
      metadata: { slug },
    });
    customerId = customer.id;
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: customerId })
      .where(eq(platformCompaniesTable.slug, slug));
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: slug,
    metadata: { slug, plan: opts.plan, frequency: opts.frequency },
    subscription_data: {
      metadata: { slug, plan: opts.plan, frequency: opts.frequency },
    },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

// Reuses (or creates) the account's Stripe customer. Shared by the plan and
// add-on checkout paths.
async function ensureStripeCustomerId(stripe: Stripe, slug: string): Promise<string> {
  const state = await getBillingState(slug);
  if (state?.stripeCustomerId) return state.stripeCustomerId;
  const contact = await getBillingContact(slug);
  const customer = await stripe.customers.create({
    email: contact.email ?? undefined,
    name: contact.companyName,
    metadata: { slug },
  });
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
  const stripe = await getUncachableStripeClient();
  const slug = normUsername(opts.slug);
  const priceId = await ensurePriceId(stripe, PROJECT_TIER_PRICES[opts.tier]);
  const customerId = await ensureStripeCustomerId(stripe, slug);
  const metadata: Record<string, string> = {
    slug,
    kind: "project-addon",
    tier: opts.tier,
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
  };
  const session = await stripe.checkout.sessions.create({
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

// ---------------------------------------------------------------------------
// Add-on tier changes
// ---------------------------------------------------------------------------

const TIER_RANK: Record<ProjectTier, number> = { standard: 0, premium: 1, max: 2 };

// Changes an add-on subscription's tier.
//  - Upgrade: the price is swapped with an immediate prorated charge and the
//    project's higher action limit applies straight away.
//  - Downgrade: the price is swapped with no proration (the lower price bills
//    from the next renewal) and the lower limit is queued via pendingTier.
export async function changeAddonTier(opts: {
  slug: string;
  subscriptionId: string;
  newTier: ProjectTier;
}): Promise<{ applied: "now" | "at_renewal" }> {
  const slug = normUsername(opts.slug);
  return withSlugLock(slug, async () => {
    const addons = await getProjectAddons(slug);
    const addon = addons.find((a) => a.subscriptionId === opts.subscriptionId);
    if (!addon) throw new Error("Add-on not found");
    if (addon.tier === opts.newTier && !addon.pendingTier) {
      return { applied: "now" as const };
    }
    const isUpgrade = TIER_RANK[opts.newTier] > TIER_RANK[addon.tier];

    const stripe = await getUncachableStripeClient();
    const priceId = await ensurePriceId(stripe, PROJECT_TIER_PRICES[opts.newTier]);
    const subscription = await stripe.subscriptions.retrieve(opts.subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) throw new Error("Add-on subscription has no item to update");

    await stripe.subscriptions.update(opts.subscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: isUpgrade ? "always_invoice" : "none",
      metadata: { ...subscription.metadata, tier: opts.newTier },
    });

    if (isUpgrade) {
      addon.tier = opts.newTier;
      delete addon.pendingTier;
      await saveProjectAddons(slug, addons);
      if (addon.projectId && (await isProjectInBillingSubtree(slug, addon.projectId))) {
        await db.update(projectsTable).set({ tier: opts.newTier }).where(eq(projectsTable.id, addon.projectId));
      }
      logger.info({ slug, subscriptionId: opts.subscriptionId, tier: opts.newTier }, "billing: add-on upgraded");
      return { applied: "now" as const };
    }
    addon.pendingTier = opts.newTier;
    await saveProjectAddons(slug, addons);
    logger.info({ slug, subscriptionId: opts.subscriptionId, pendingTier: opts.newTier }, "billing: add-on downgrade queued to renewal");
    return { applied: "at_renewal" as const };
  });
}

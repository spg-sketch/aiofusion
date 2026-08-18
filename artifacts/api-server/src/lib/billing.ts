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
        .select({ tier: projectsTable.tier })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);
      if (proj && isProjectTier(proj.tier)) return TIER_ACTION_LIMITS[proj.tier];
    }
    return TIER_ACTION_LIMITS[INCLUDED_PROJECT_TIER];
  } catch (err) {
    logger.warn({ err, accountId, projectId }, "billing: getProjectActionLimit failed - using legacy limit");
    return NO_SUBSCRIPTION_ACTION_LIMIT;
  }
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

// checkout.session.completed: activate the subscription on the account named
// in the session metadata.
export async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== "subscription") return;
  const slug = normUsername(String(session.metadata?.["slug"] ?? session.client_reference_id ?? ""));
  if (!slug) {
    logger.error({ eventId: event.id, sessionId: session.id }, "billing: checkout.session.completed without account slug");
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
export async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = customerIdOf(subscription.customer as string | { id: string } | null);
  if (!customerId) return;
  const slug = await findSlugByCustomerId(customerId);
  if (!slug) {
    logger.warn({ eventId: event.id, customerId }, "billing: subscription.deleted for unknown customer");
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

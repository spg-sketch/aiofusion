import { runMigrations } from "stripe-replit-sync";
import { logger } from "./logger";
import {
  getStripeCredentials,
  getStripeSync,
  getUncachableStripeClient,
  stripeConfigured,
} from "./stripe-client";
import {
  completeStripeWebhookReadinessProbe,
  setStripeCheckoutReadiness,
  startStripeWebhookReadinessProbe,
} from "./stripe-readiness";
import { ensureAllPrices, warnIfTaxDeactivated } from "./billing";

export function shouldRegisterManagedStripeWebhook(): boolean {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.toLowerCase().trim();
  return deploymentEnv === "staging" || deploymentEnv === "production";
}

async function runWebhookReadinessProbe(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
): Promise<boolean> {
  const probe = startStripeWebhookReadinessProbe();
  let customerId: string | null = null;
  try {
    const customer = await stripe.customers.create({
      metadata: { aio_webhook_readiness_probe: probe.probeId },
    });
    customerId = customer.id;
    return await probe.verified;
  } finally {
    probe.cancel();
    if (customerId) {
      await stripe.customers.del(customerId).catch((err) => {
        logger.warn(
          { err, customerId },
          "stripe-init: could not remove temporary webhook readiness customer",
        );
      });
    }
  }
}

async function configureStagingWebhookUrl(): Promise<boolean> {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) {
    logger.warn("stripe-init: REPLIT_DOMAINS not set - staging webhook not configured");
    return false;
  }

  const { webhookSecret } = await getStripeCredentials();
  if (!webhookSecret) {
    logger.warn(
      "stripe-init: STRIPE_STAGING_WEBHOOK_SECRET is not set - staging webhook URL unchanged",
    );
    return false;
  }

  const stripe = await getUncachableStripeClient();
  const targetUrl = `https://${domain}/api/stripe/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const exact = endpoints.data.find(
    (endpoint) => endpoint.url === targetUrl && endpoint.status === "enabled",
  );
  if (exact) {
    logger.info({ url: targetUrl }, "stripe-init: staging webhook already configured");
    return runWebhookReadinessProbe(stripe);
  }

  const managed = endpoints.data.find((endpoint) => {
    const managedBy = endpoint.metadata?.managed_by
      ?.toLowerCase()
      .replace(/[\s-]+/g, "");
    const description = endpoint.description?.toLowerCase().replace(/[\s-]+/g, "") ?? "";
    return managedBy === "stripesync" || description.includes("stripesync");
  });
  if (!managed) {
    logger.warn(
      { url: targetUrl },
      "stripe-init: no existing Stripe-managed webhook found to move to staging",
    );
    return false;
  }

  await stripe.webhookEndpoints.update(managed.id, { url: targetUrl });
  logger.info({ url: targetUrl }, "stripe-init: staging webhook URL configured");
  return runWebhookReadinessProbe(stripe);
}

// Startup Stripe initialisation:
//   1. create the `stripe` schema tables (idempotent)
//   2. register the managed webhook at <domain>/api/stripe/webhook
//   3. make sure every catalogue product/price exists (by lookup_key)
//   4. backfill existing Stripe data into the stripe schema (background)
//
// Reading REPLIT_DOMAINS here is correct: in a deployment it resolves to the
// published domain. Development intentionally does not manage the webhook
// because it may share Stripe and PostgreSQL state with published staging.
export async function initStripe(): Promise<void> {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.toLowerCase().trim();
  if (deploymentEnv === "staging" || deploymentEnv === "production") {
    setStripeCheckoutReadiness({
      available: false,
      reason: "webhook_validation_pending",
    });
  }
  if (!stripeConfigured()) {
    logger.warn("stripe-init: Stripe connection not available in this environment - skipping");
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("stripe-init: DATABASE_URL not set - skipping");
    return;
  }

  // The mirror schema must exist before staging moves the webhook or starts its
  // signed-delivery probe. Otherwise that probe can successfully update
  // business billing state while stripe-replit-sync fails on stripe.accounts.
  await runMigrations({ databaseUrl });
  logger.info("stripe-init: stripe schema ready");

  if (deploymentEnv === "staging") {
    try {
      const valid = completeStripeWebhookReadinessProbe(await configureStagingWebhookUrl());
      if (!valid) {
        logger.error(
          "stripe-init: BILLING CHECKOUT DISABLED - the staging webhook endpoint and selected signing secret could not be validated",
        );
      }
    } catch (err) {
      logger.error(
        { err },
        "stripe-init: BILLING CHECKOUT DISABLED - staging webhook signing-secret validation failed",
      );
    }
    try {
      const stripe = await getUncachableStripeClient();
      await ensureAllPrices(stripe);
      logger.info("stripe-init: staging plan products/prices ensured");
    } catch (err) {
      logger.warn({ err }, "stripe-init: failed to ensure staging plan prices (non-fatal)");
    }
    const stripeSync = await getStripeSync();
    stripeSync
      .syncBackfill()
      .then(() => logger.info("stripe-init: staging backfill complete"))
      .catch((err) => logger.warn({ err }, "stripe-init: staging backfill failed (non-fatal)"));
    return;
  }

  const stripeSync = await getStripeSync();

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain && shouldRegisterManagedStripeWebhook()) {
    const webhook = await stripeSync.findOrCreateManagedWebhook(
      `https://${domain}/api/stripe/webhook`,
    );
    logger.info({ url: webhook?.url }, "stripe-init: managed webhook configured");
    const stripe = await getUncachableStripeClient();
    const valid = completeStripeWebhookReadinessProbe(await runWebhookReadinessProbe(stripe));
    if (!valid) {
      logger.error(
        "stripe-init: BILLING CHECKOUT DISABLED - the production webhook endpoint and selected signing secret do not match",
      );
    }
  } else if (domain) {
    logger.info(
      "stripe-init: development environment - leaving the published Stripe webhook unchanged",
    );
  } else {
    logger.warn("stripe-init: REPLIT_DOMAINS not set - webhook not registered");
  }

  let stripe;
  try {
    stripe = await getUncachableStripeClient();
    await ensureAllPrices(stripe);
    logger.info("stripe-init: plan products/prices ensured");
  } catch (err) {
    logger.warn({ err }, "stripe-init: failed to ensure plan prices (non-fatal)");
  }

  // In live mode, verify that Stripe Tax is fully activated so we surface the
  // problem at startup rather than only when the first real checkout is
  // attempted. Fail-soft: a probe error must never block the server from
  // starting; we already refuse live-mode checkout sessions when Tax is
  // deactivated (in createSessionWithTax), so the damage is limited.
  try {
    const creds = await import("./stripe-client").then((m) => m.getStripeCredentials());
    if (/^(sk|rk)_live_/.test(creds.secretKey ?? "") && stripe) {
      await warnIfTaxDeactivated(stripe);
    }
  } catch { /* non-fatal - do not block startup */ }

  stripeSync
    .syncBackfill()
    .then(() => logger.info("stripe-init: backfill complete"))
    .catch((err) => logger.warn({ err }, "stripe-init: backfill failed (non-fatal)"));
}

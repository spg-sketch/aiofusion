import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getStripeCredentials,
  selectStripeConnectionItem,
  stripeConfigured,
} from "./stripe-client";
import {
  getStripeCheckoutReadiness,
  observeStripeWebhookReadinessProbe,
  setStripeCheckoutReadiness,
  startStripeWebhookReadinessProbe,
} from "./stripe-readiness";

const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;
const originalStagingSecretKey = process.env.STRIPE_STAGING_SECRET_KEY;
const originalStagingWebhookSecret = process.env.STRIPE_STAGING_WEBHOOK_SECRET;
const originalConnectorsHostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
const originalReplIdentity = process.env.REPL_IDENTITY;
const originalWebReplRenewal = process.env.WEB_REPL_RENEWAL;

beforeEach(() => {
  // Never let a real webhook signing secret enter assertion output.
  delete process.env.STRIPE_STAGING_WEBHOOK_SECRET;
});

afterEach(() => {
  if (originalDeploymentEnv === undefined) {
    delete process.env.DEPLOYMENT_ENV;
  } else {
    process.env.DEPLOYMENT_ENV = originalDeploymentEnv;
  }
  if (originalStagingSecretKey === undefined) {
    delete process.env.STRIPE_STAGING_SECRET_KEY;
  } else {
    process.env.STRIPE_STAGING_SECRET_KEY = originalStagingSecretKey;
  }
  if (originalStagingWebhookSecret === undefined) {
    delete process.env.STRIPE_STAGING_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_STAGING_WEBHOOK_SECRET = originalStagingWebhookSecret;
  }
  for (const [key, value] of [
    ["REPLIT_CONNECTORS_HOSTNAME", originalConnectorsHostname],
    ["REPL_IDENTITY", originalReplIdentity],
    ["WEB_REPL_RENEWAL", originalWebReplRenewal],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("selectStripeConnectionItem", () => {
  const testConnection = {
    environment: "development",
    settings: { secret: "sk_test_sandbox" },
  };
  const liveConnection = {
    environment: "production",
    settings: { secret: "sk_live_account" },
  };

  it("selects the sandbox connection on staging regardless of response order", () => {
    process.env.DEPLOYMENT_ENV = "staging";

    expect(selectStripeConnectionItem([liveConnection, testConnection])).toBe(testConnection);
    expect(selectStripeConnectionItem([testConnection, liveConnection])).toBe(testConnection);
  });

  it("selects the live connection only on production", () => {
    process.env.DEPLOYMENT_ENV = "production";

    expect(selectStripeConnectionItem([testConnection, liveConnection])).toBe(liveConnection);
  });

  it("refuses to cross environments when the required connection is absent", () => {
    process.env.DEPLOYMENT_ENV = "staging";

    expect(() => selectStripeConnectionItem([liveConnection])).toThrow(
      /Stripe test credentials are not connected/,
    );
  });

  it("supports a legacy unlabelled connection only when its key mode matches", () => {
    process.env.DEPLOYMENT_ENV = "staging";
    const legacyTestConnection = { settings: { secret_key: "rk_test_legacy" } };

    expect(selectStripeConnectionItem([legacyTestConnection])).toBe(legacyTestConnection);
  });

  it("accepts a sandbox key assigned to Replit's deployment credential slot on staging", () => {
    process.env.DEPLOYMENT_ENV = "staging";
    const deployedSandboxConnection = {
      environment: "production",
      settings: { secret: "sk_test_staging_deployment" },
    };

    expect(selectStripeConnectionItem([deployedSandboxConnection])).toBe(
      deployedSandboxConnection,
    );
  });
});

describe("getStripeCredentials staging override", () => {
  it("uses an explicit test key without requesting the live deployment connection", async () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.STRIPE_STAGING_SECRET_KEY = "sk_test_staging_override";

    await expect(getStripeCredentials()).resolves.toEqual({
      secretKey: "sk_test_staging_override",
    });
  });

  it("rejects a live key in the staging-only override", async () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.STRIPE_STAGING_SECRET_KEY = "sk_live_wrong_environment";

    await expect(getStripeCredentials()).rejects.toThrow(
      /must be a Stripe test key/,
    );
  });

  it("returns the staging webhook signing secret when configured", async () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.STRIPE_STAGING_SECRET_KEY = "sk_test_staging_override";
    process.env.STRIPE_STAGING_WEBHOOK_SECRET = "whsec_staging_webhook";

    await expect(getStripeCredentials()).resolves.toEqual({
      secretKey: "sk_test_staging_override",
      webhookSecret: "whsec_staging_webhook",
    });
  });

  it("rejects an invalid staging webhook signing secret", async () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.STRIPE_STAGING_SECRET_KEY = "sk_test_staging_override";
    process.env.STRIPE_STAGING_WEBHOOK_SECRET = "not-a-signing-secret";

    await expect(getStripeCredentials()).rejects.toThrow(
      /must be a Stripe webhook signing secret/,
    );
  });
});

describe("stripeConfigured", () => {
  it("recognises the protected test-key override on a staging deployment", () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.STRIPE_STAGING_SECRET_KEY = "sk_test_staging_override";

    expect(stripeConfigured()).toBe(true);
  });

  it("does not treat the staging override as configured outside staging", () => {
    process.env.DEPLOYMENT_ENV = "production";
    process.env.STRIPE_STAGING_SECRET_KEY = "sk_test_staging_override";
    delete process.env.REPLIT_CONNECTORS_HOSTNAME;
    delete process.env.REPL_IDENTITY;
    delete process.env.WEB_REPL_RENEWAL;

    expect(stripeConfigured()).toBe(false);
  });
});

describe("Stripe checkout readiness", () => {
  it("fails closed in deployments until startup validation succeeds", () => {
    process.env.DEPLOYMENT_ENV = "production";
    setStripeCheckoutReadiness({
      available: false,
      reason: "webhook_secret_mismatch",
    });

    expect(getStripeCheckoutReadiness()).toEqual({
      available: false,
      reason: "webhook_secret_mismatch",
    });
  });

  it("does not block local development", () => {
    process.env.DEPLOYMENT_ENV = "development";
    setStripeCheckoutReadiness({
      available: false,
      reason: "webhook_validation_pending",
    });

    expect(getStripeCheckoutReadiness()).toEqual({ available: true });
  });

  it("accepts only the matching tagged customer event as probe confirmation", async () => {
    const probe = startStripeWebhookReadinessProbe(1_000);
    observeStripeWebhookReadinessProbe({
      type: "customer.created",
      data: {
        object: {
          metadata: { aio_webhook_readiness_probe: probe.probeId },
        },
      },
    });

    await expect(probe.verified).resolves.toBe(true);
  });
});
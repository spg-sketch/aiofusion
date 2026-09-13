import { afterEach, describe, expect, it } from "vitest";
import { getStripeCredentials, selectStripeConnectionItem } from "./stripe-client";

const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;
const originalStagingSecretKey = process.env.STRIPE_STAGING_SECRET_KEY;

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
});
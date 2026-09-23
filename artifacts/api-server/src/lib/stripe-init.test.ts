import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  migrations: [] as string[],
  backfills: 0,
  managedUrls: [] as string[],
  updatedUrls: [] as string[],
  readiness: [] as unknown[],
  probeSucceeds: true,
  customerCreates: 0,
  customerDeletes: 0,
}));

vi.mock("stripe-replit-sync", () => ({
  runMigrations: ({ databaseUrl }: { databaseUrl: string }) => {
    calls.migrations.push(databaseUrl);
    return Promise.resolve();
  },
}));
vi.mock("./billing", () => ({
  ensureAllPrices: vi.fn(),
  warnIfTaxDeactivated: vi.fn(),
}));
vi.mock("./stripe-client", () => ({
  stripeConfigured: () => true,
  getStripeCredentials: () =>
    Promise.resolve({ secretKey: "sk_test_startup", webhookSecret: "whsec_startup" }),
  getStripeSync: () =>
    Promise.resolve({
      findOrCreateManagedWebhook: (url: string) => {
        calls.managedUrls.push(url);
        return Promise.resolve({ id: "we_managed", url });
      },
      syncBackfill: () => {
        calls.backfills += 1;
        return Promise.resolve();
      },
    }),
  getUncachableStripeClient: () =>
    Promise.resolve({
      webhookEndpoints: {
        list: () =>
          Promise.resolve({
            data: [
              {
                id: "we_managed",
                url: "https://old-staging.example/api/stripe/webhook",
                status: "enabled",
                metadata: { managed_by: "stripe-sync" },
              },
            ],
          }),
        update: (_id: string, values: { url?: string }) => {
          if (values.url) calls.updatedUrls.push(values.url);
          return Promise.resolve({ id: _id, ...values });
        },
        retrieve: (id: string) =>
          Promise.resolve({
            id,
            url: "https://app.example/api/stripe/webhook",
            metadata: {},
          }),
      },
      customers: {
        create: () => {
          calls.customerCreates += 1;
          return Promise.resolve({ id: "cus_readiness_probe" });
        },
        del: () => {
          calls.customerDeletes += 1;
          return Promise.resolve();
        },
      },
    }),
}));
vi.mock("./stripe-readiness", () => ({
  setStripeCheckoutReadiness: (value: unknown) => calls.readiness.push(value),
  completeStripeWebhookReadinessProbe: (valid: boolean) => {
    calls.readiness.push(valid
      ? { available: true }
      : { available: false, reason: "webhook_secret_mismatch" });
    return valid;
  },
  startStripeWebhookReadinessProbe: () => ({
    probeId: "probe_test",
    verified: Promise.resolve(calls.probeSucceeds),
    cancel: () => {},
  }),
}));

import { initStripe, shouldRegisterManagedStripeWebhook } from "./stripe-init";

const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;
const originalDomains = process.env.REPLIT_DOMAINS;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  calls.migrations.length = 0;
  calls.backfills = 0;
  calls.managedUrls.length = 0;
  calls.updatedUrls.length = 0;
  calls.readiness.length = 0;
  calls.probeSucceeds = true;
  calls.customerCreates = 0;
  calls.customerDeletes = 0;
  if (originalDeploymentEnv === undefined) {
    delete process.env.DEPLOYMENT_ENV;
  } else {
    process.env.DEPLOYMENT_ENV = originalDeploymentEnv;
  }
  if (originalDomains === undefined) delete process.env.REPLIT_DOMAINS;
  else process.env.REPLIT_DOMAINS = originalDomains;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("shouldRegisterManagedStripeWebhook", () => {
  it.each(["staging", "production"])(
    "allows the %s deployment to manage its Stripe webhook",
    (environment) => {
      process.env.DEPLOYMENT_ENV = environment;
      expect(shouldRegisterManagedStripeWebhook()).toBe(true);
    },
  );

  it.each([undefined, "development", "test"])(
    "prevents %s from replacing the published Stripe webhook",
    (environment) => {
      if (environment === undefined) {
        delete process.env.DEPLOYMENT_ENV;
      } else {
        process.env.DEPLOYMENT_ENV = environment;
      }
      expect(shouldRegisterManagedStripeWebhook()).toBe(false);
    },
  );
});

describe("Stripe webhook registration at startup", () => {
  it("moves the staging endpoint to the intended raw webhook route", async () => {
    process.env.DEPLOYMENT_ENV = "staging";
    process.env.REPLIT_DOMAINS = "staging.example";
    process.env.DATABASE_URL = "postgres://test-only";

    await initStripe();

    expect(calls.updatedUrls).toEqual(["https://staging.example/api/stripe/webhook"]);
    expect(calls.managedUrls).toEqual([]);
    expect(calls.migrations).toEqual(["postgres://test-only"]);
    expect(calls.backfills).toBe(1);
    expect(calls.readiness.at(-1)).toEqual({ available: true });
    expect(calls.customerCreates).toBe(1);
    expect(calls.customerDeletes).toBe(1);
  });

  it("registers the intended production endpoint", async () => {
    process.env.DEPLOYMENT_ENV = "production";
    process.env.REPLIT_DOMAINS = "app.example";
    process.env.DATABASE_URL = "postgres://test-only";

    await initStripe();

    expect(calls.managedUrls).toEqual(["https://app.example/api/stripe/webhook"]);
    expect(calls.updatedUrls).toEqual([]);
    expect(calls.readiness.at(-1)).toEqual({ available: true });
    expect(calls.customerCreates).toBe(1);
    expect(calls.customerDeletes).toBe(1);
  });

  it("does not let development replace the published endpoint", async () => {
    process.env.DEPLOYMENT_ENV = "development";
    process.env.REPLIT_DOMAINS = "development.example";
    process.env.DATABASE_URL = "postgres://test-only";

    await initStripe();

    expect(calls.managedUrls).toEqual([]);
    expect(calls.updatedUrls).toEqual([]);
  });

  it("disables checkout when Stripe does not deliver a successfully verified probe", async () => {
    process.env.DEPLOYMENT_ENV = "production";
    process.env.REPLIT_DOMAINS = "app.example";
    process.env.DATABASE_URL = "postgres://test-only";
    calls.probeSucceeds = false;

    await initStripe();

    expect(calls.readiness.at(-1)).toEqual({
      available: false,
      reason: "webhook_secret_mismatch",
    });
  });
});
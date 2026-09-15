import { afterEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  managedUrls: [] as string[],
  updatedUrls: [] as string[],
}));

vi.mock("stripe-replit-sync", () => ({
  runMigrations: vi.fn(),
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
        return Promise.resolve({ url });
      },
      syncBackfill: () => Promise.resolve(),
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
        update: (_id: string, values: { url: string }) => {
          calls.updatedUrls.push(values.url);
          return Promise.resolve();
        },
      },
    }),
}));

import { initStripe, shouldRegisterManagedStripeWebhook } from "./stripe-init";

const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;
const originalDomains = process.env.REPLIT_DOMAINS;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  calls.managedUrls.length = 0;
  calls.updatedUrls.length = 0;
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
  });

  it("registers the intended production endpoint", async () => {
    process.env.DEPLOYMENT_ENV = "production";
    process.env.REPLIT_DOMAINS = "app.example";
    process.env.DATABASE_URL = "postgres://test-only";

    await initStripe();

    expect(calls.managedUrls).toEqual(["https://app.example/api/stripe/webhook"]);
    expect(calls.updatedUrls).toEqual([]);
  });

  it("does not let development replace the published endpoint", async () => {
    process.env.DEPLOYMENT_ENV = "development";
    process.env.REPLIT_DOMAINS = "development.example";
    process.env.DATABASE_URL = "postgres://test-only";

    await initStripe();

    expect(calls.managedUrls).toEqual([]);
    expect(calls.updatedUrls).toEqual([]);
  });
});
import { afterEach, describe, expect, it } from "vitest";
import { shouldRegisterManagedStripeWebhook } from "./stripe-init";

const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;

afterEach(() => {
  if (originalDeploymentEnv === undefined) {
    delete process.env.DEPLOYMENT_ENV;
  } else {
    process.env.DEPLOYMENT_ENV = originalDeploymentEnv;
  }
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
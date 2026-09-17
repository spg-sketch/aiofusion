import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendAlert: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("./notify-email", () => ({
  sendStripeWebhookFailureAlert: mocks.sendAlert,
}));
vi.mock("./logger", () => ({
  logger: { info: mocks.info, warn: mocks.warn },
}));

import {
  STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD,
  StripeWebhookHealthMonitor,
} from "./stripe-webhook-health";

describe("StripeWebhookHealthMonitor", () => {
  beforeEach(() => {
    process.env.DEPLOYMENT_ENV = "staging";
    mocks.sendAlert.mockReset().mockResolvedValue(undefined);
    mocks.info.mockReset();
    mocks.warn.mockReset();
  });

  it("alerts once after the threshold and includes only operational metadata", async () => {
    const monitor = new StripeWebhookHealthMonitor();

    for (let index = 0; index < STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD + 3; index += 1) {
      await monitor.recordFailure("signature_verification");
    }

    expect(mocks.sendAlert).toHaveBeenCalledTimes(1);
    expect(mocks.sendAlert).toHaveBeenCalledWith({
      environment: "staging",
      failureClass: "signature_verification",
      consecutiveFailures: STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD,
    });
  });

  it("tracks failure classes independently", async () => {
    const monitor = new StripeWebhookHealthMonitor();

    for (let index = 0; index < STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD; index += 1) {
      await monitor.recordFailure("signature_verification");
      await monitor.recordFailure("event_processing");
    }

    expect(mocks.sendAlert).toHaveBeenCalledTimes(2);
    expect(mocks.sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      failureClass: "signature_verification",
    }));
    expect(mocks.sendAlert).toHaveBeenCalledWith(expect.objectContaining({
      failureClass: "event_processing",
    }));
  });

  it("clears active alert state on recovery and can alert on a later incident", async () => {
    const monitor = new StripeWebhookHealthMonitor();

    for (let index = 0; index < STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD; index += 1) {
      await monitor.recordFailure("event_processing");
    }
    monitor.recordSuccess("event_processing");
    for (let index = 0; index < STRIPE_WEBHOOK_FAILURE_ALERT_THRESHOLD; index += 1) {
      await monitor.recordFailure("event_processing");
    }

    expect(mocks.sendAlert).toHaveBeenCalledTimes(2);
    expect(mocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        failureClass: "event_processing",
        clearedAlert: true,
      }),
      expect.stringContaining("cleared after recovery"),
    );
  });
});
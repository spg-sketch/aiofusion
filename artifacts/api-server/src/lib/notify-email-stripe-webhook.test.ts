import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

import { sendStripeWebhookFailureAlert } from "./notify-email";

describe("sendStripeWebhookFailureAlert", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendEmail.mockReset().mockResolvedValue({ data: { id: "email-id" }, error: null });
  });

  it("identifies environment and failure class without sensitive webhook data", async () => {
    await sendStripeWebhookFailureAlert({
      environment: "production",
      failureClass: "signature_verification",
      consecutiveFailures: 3,
    });

    const message = sendEmail.mock.calls[0]![0];
    expect(message.subject).toBe(
      "[AIO Fusion] Stripe webhook failures - production - signature verification",
    );
    expect(message.text).toContain("Environment:          production");
    expect(message.text).toContain("Failure class:        signature verification");
    expect(message.text).toContain("Consecutive failures: 3");
    expect(message).not.toHaveProperty("requestBody");
    expect(message).not.toHaveProperty("signature");
  });
});
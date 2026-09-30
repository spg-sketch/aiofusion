import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

vi.mock("./app-url", () => ({
  getAppBaseUrl: () => "https://test.example.com",
}));

import {
  sendBookDemoInternalAlert,
  sendBookDemoConfirmation,
  sendEnquiryInternalAlert,
  sendEnquiryConfirmation,
  sendContactFormFailedAlert,
} from "./notify-email";

const recipients = [
  "natalie@aiofusion.ai",
  "patrick@aiofusion.ai",
  "info@aiofusion.ai",
];

describe("contact form team recipients", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendEmail.mockReset().mockResolvedValue({ data: { id: "email-id" }, error: null });
  });

  it("sends demo requests to all three inboxes", async () => {
    await sendBookDemoInternalAlert({
      name: "Alice",
      email: "alice@example.com",
      company: "Acme",
      goal: "Learn more",
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: recipients,
      subject: "[AIO Fusion] Demo request - Acme",
    }));
  });

  it("sends general enquiries to all three inboxes", async () => {
    await sendEnquiryInternalAlert({
      name: "Alice",
      email: "alice@example.com",
      company: "Acme",
      subject: "Question",
      message: "Hello",
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: recipients,
      subject: "[AIO Fusion] Enquiry - Question",
    }));
  });

  it("sends failed-delivery notifications to the same three inboxes", async () => {
    await sendContactFormFailedAlert({
      submissionId: 42,
      type: "book-demo",
      name: "Alice",
      email: "alice@example.com",
      company: "Acme",
      error: "Delivery error",
    });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: recipients }));
  });

  it("keeps customer confirmations addressed to the submitting customer", async () => {
    await sendBookDemoConfirmation({ name: "Alice", toEmail: "alice@example.com" });
    await sendEnquiryConfirmation({ name: "Alice", toEmail: "alice@example.com" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    for (const [message] of sendEmail.mock.calls) {
      expect(message.to).toEqual(["alice@example.com"]);
    }
  });

  it("rejects provider errors so the saved lead can be flagged for retry", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "Recipient rejected" } });
    await expect(sendBookDemoInternalAlert({
      name: "Alice", email: "alice@example.com", company: "Acme", goal: "Learn more",
    })).rejects.toThrow("Recipient rejected");
  });

  it("rejects missing email configuration rather than reporting a successful send", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendEnquiryInternalAlert({
      name: "Alice", email: "alice@example.com", company: "Acme", subject: "Question", message: "Hello",
    })).rejects.toThrow("RESEND_API_KEY is not set");
  });

  it("uses distinct stable keys for each submission message", async () => {
    await sendBookDemoInternalAlert({
      submissionId: 42, name: "Alice", email: "alice@example.com", company: "Acme", goal: "Demo",
    });
    await sendBookDemoConfirmation({ submissionId: 42, name: "Alice", toEmail: "alice@example.com" });
    expect(sendEmail.mock.calls[0][1]).toEqual({ idempotencyKey: "contact-42-internal" });
    expect(sendEmail.mock.calls[1][1]).toEqual({ idempotencyKey: "contact-42-customer" });
  });
});
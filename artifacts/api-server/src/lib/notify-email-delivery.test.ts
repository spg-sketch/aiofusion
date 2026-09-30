import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock("./app-url", () => ({
  getAppBaseUrl: () => "https://test.example.com",
}));

import { logger } from "./logger";
import {
  sendEmailChangedEmail,
  sendInviteReminderEmail,
  sendJournalistPrivacyOutcome,
  sendPasswordResetEmail,
  sendSubscriptionRenewalReminderEmail,
  sendSupportTicketAck,
  sendTeamInviteEmail,
  sendVerificationEmail,
} from "./notify-email";

const recipient = "reader@example.com";
const rejected = { data: null, error: { message: "Sender domain rejected" } };
const accepted = { data: { id: "accepted-id" }, error: null };

describe("email provider acceptance", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendEmail.mockReset().mockResolvedValue(accepted);
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  it("does not log a rejected verification email as sent", async () => {
    sendEmail.mockResolvedValueOnce(rejected);
    await sendVerificationEmail({
      toEmail: recipient, toName: "Reader", verifyUrl: "https://test.example.com/verify",
    });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("failed to send verification"),
    );
  });

  it("does not log a password reset as sent without a provider confirmation ID", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: null });
    await sendPasswordResetEmail({
      toEmail: recipient, toName: "Reader", resetUrl: "https://test.example.com/reset",
    });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("failed to send password reset"),
    );
  });

  it("keeps privacy outcome failure observable to the caller", async () => {
    sendEmail.mockResolvedValueOnce(rejected);
    await expect(sendJournalistPrivacyOutcome({
      toEmail: recipient, requestId: 1, requestType: "access", body: "Your outcome",
    })).rejects.toThrow("Sender domain rejected");
  });

  it("returns false for a rejected team invitation", async () => {
    sendEmail.mockResolvedValueOnce(rejected);
    expect(await sendTeamInviteEmail({
      toEmail: recipient, companyName: "Example", inviterName: "Owner",
      roleLabel: "Member", inviteUrl: "https://test.example.com/invite",
    })).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns false for a support acknowledgement without an acceptance ID", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: null });
    expect(await sendSupportTicketAck({
      toEmail: recipient, toName: "Reader", ticketId: 1, subject: "A question",
    })).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("does not mark an invite reminder sent after provider rejection", async () => {
    sendEmail.mockResolvedValueOnce(rejected);
    await expect(sendInviteReminderEmail({
      toEmail: recipient, companyName: "Example", inviterName: "Owner",
      roleLabel: "Member", inviteUrl: "https://test.example.com/invite",
      expiresAt: new Date("2026-10-01T00:00:00Z"),
    })).rejects.toThrow("Sender domain rejected");
  });

  it("returns false for an unconfirmed subscription reminder", async () => {
    sendEmail.mockResolvedValueOnce({ data: null, error: null });
    expect(await sendSubscriptionRenewalReminderEmail({
      toEmail: recipient, companyName: "Example", renewalAt: new Date("2026-10-10T00:00:00Z"),
    })).toBe(false);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs each email-change notice separately when only one is accepted", async () => {
    sendEmail.mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted);
    await sendEmailChangedEmail({
      oldEmail: "old@example.com", newEmail: "new@example.com", toName: "Reader",
    });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "old@example.com" }),
      expect.stringContaining("failed to send email changed notice"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "new@example.com" }),
      expect.stringContaining("email changed confirmation sent"),
    );
  });
});
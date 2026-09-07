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

import { sendNewSignupAlert } from "./notify-email";

describe("sendNewSignupAlert", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ data: { id: "email-id" }, error: null });
  });

  it("uses the company entered during password signup", async () => {
    await sendNewSignupAlert({
      name: "Alice Person",
      email: "alice@example.com",
      companyName: "Alice Industries",
      username: "alice-industries",
      method: "password",
    });

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: "[AIO Fusion] New signup - Alice Industries",
      text: expect.stringContaining("Company:      Alice Industries"),
      html: expect.stringContaining("Alice Industries"),
    }));
  });

  it("keeps the Google person separate from an unknown company", async () => {
    await sendNewSignupAlert({
      name: "Grace Google",
      email: "grace@example.com",
      companyName: null,
      username: "grace-google",
      method: "google",
    });

    const message = sendEmail.mock.calls[0]![0];
    expect(message.text).toContain("Name:         Grace Google");
    expect(message.text).toContain("Company:      Unknown (not provided by SSO)");
    expect(message.text).toContain("Sign-up via:  Google OAuth");
    expect(message.text).not.toContain("Company:      Grace Google");
  });

  it("keeps the Microsoft person separate from an unknown company", async () => {
    await sendNewSignupAlert({
      name: "Morgan Microsoft",
      email: "morgan@example.com",
      companyName: null,
      username: "morgan-microsoft",
      method: "microsoft",
    });

    const message = sendEmail.mock.calls[0]![0];
    expect(message.text).toContain("Name:         Morgan Microsoft");
    expect(message.text).toContain("Company:      Unknown (not provided by SSO)");
    expect(message.text).toContain("Sign-up via:  Microsoft SSO");
    expect(message.text).not.toContain("Company:      Morgan Microsoft");
  });
});
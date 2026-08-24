import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const serverGetSessions = vi.hoisted(() => vi.fn());
const serverRevokeSession = vi.hoisted(() => vi.fn());
const serverChangeMyPassword = vi.hoisted(() => vi.fn());
const serverRequestSetPassword = vi.hoisted(() => vi.fn());
const serverSelfDeleteAccount = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth", () => ({
  serverGetSessions,
  serverRevokeSession,
  serverChangeMyPassword,
  serverRequestSetPassword,
  serverSelfDeleteAccount,
  canCreateSubAccounts: () => false,
}));

vi.mock("../lib/apiHelpers", () => ({ apiBase: () => "" }));
vi.mock("./MfaPanels", () => ({
  MfaSecuritySection: () => <div data-testid="mfa-security-section" />,
}));

import { AccountSecurityCard } from "./AccountSecurityCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AccountSecurityCard sign-in methods", () => {
  it("shows server-confirmed SSO methods and the first-password flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      hasPassword: false,
      account: { googleLinked: true, microsoftLinked: false },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    render(
      <AccountSecurityCard
        session={{ username: "google-sso-user", role: "client" }}
        onSignOut={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Active sign-in methods")).toBeTruthy();
    });
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.queryByText("Microsoft")).toBeNull();
    expect(screen.queryByText("Email & password")).toBeNull();
    expect(screen.getByRole("button", { name: /set a password/i })).toBeTruthy();
  });
});
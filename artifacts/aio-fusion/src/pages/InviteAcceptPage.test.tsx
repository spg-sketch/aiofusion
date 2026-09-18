import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  serverGetInviteInfo: vi.fn(),
  serverAcceptInvite: vi.fn(),
  serverDeclineInvite: vi.fn(),
  serverLogout: vi.fn(),
  bootstrapAuth: vi.fn(),
  clearSession: vi.fn(),
  setSession: vi.fn(),
  serverMfaSetup: vi.fn(),
  serverMfaEnable: vi.fn(),
  serverMfaVerify: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  ...authMocks,
}));

vi.mock("../lib/apiHelpers", () => ({
  apiBase: () => "",
}));

// Avoid input-otp's layout timers while exercising the actual MFA component.
vi.mock("../components/ui/input-otp", () => ({
  InputOTP: (props: { value: string; onChange: (value: string) => void; disabled: boolean }) => (
    <input aria-label="Authenticator code" value={props.value} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value)} />
  ),
  InputOTPGroup: () => null,
  InputOTPSlot: () => null,
}));

import { InviteAcceptPage } from "./InviteAcceptPage";

const confirmedSession = { username: "master", role: "admin", userEmail: "abbe@example.test", membershipRole: "viewer" };

describe("InviteAcceptPage personal MFA handoff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.bootstrapAuth.mockResolvedValue({ session: confirmedSession });
    authMocks.serverGetInviteInfo.mockResolvedValue({
      ok: true,
      invite: {
        companyName: "Spencer Gallagher",
        email: "abbe@example.test",
        roleLabel: "Content Team Member",
        existingUser: true,
      },
    });
    authMocks.serverAcceptInvite.mockResolvedValue({
      ok: false,
      error: "This browser is already signed in as a different user. Sign out, then reopen this invitation.",
      reason: "signed_in_as_different_user",
    });
  });

  afterEach(cleanup);

  it("offers to sign out instead of silently switching users", async () => {
    render(<InviteAcceptPage token="invite-token" onAccepted={vi.fn()} />);

    const acceptButton = await screen.findByRole("button", { name: /accept & join/i });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText(/already signed in as a different user/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /sign out and continue/i })).toBeInTheDocument();
  });

  it("waits for authoritative /me after ordinary acceptance, without reaccepting on retry", async () => {
    authMocks.serverAcceptInvite.mockResolvedValue({ ok: true, session: { username: "provisional", role: "admin" } });
    let resolveAuthority!: (value: unknown) => void;
    authMocks.bootstrapAuth.mockImplementationOnce(() => new Promise((resolve) => { resolveAuthority = resolve; }));
    const onAccepted = vi.fn();
    render(<InviteAcceptPage token="invite-token" onAccepted={onAccepted} />);
    fireEvent.click(await screen.findByRole("button", { name: /accept & join/i }));
    await screen.findByText("Verifying your session…");
    expect(onAccepted).not.toHaveBeenCalled();
    expect(authMocks.setSession).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /accept & join/i })).not.toBeInTheDocument();

    await act(async () => { resolveAuthority({ session: null, error: "Session verification unavailable." }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Session verification unavailable.");
    expect(onAccepted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry session verification" }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(authMocks.setSession).toHaveBeenCalledWith(confirmedSession);
    expect(authMocks.serverAcceptInvite).toHaveBeenCalledTimes(1);
    expect(authMocks.bootstrapAuth).toHaveBeenCalledTimes(2);
  });

  it("handles a new invitee password submission and preserves the invitation-bound SSO links", async () => {
    authMocks.serverGetInviteInfo.mockResolvedValue({
      ok: true,
      invite: { companyName: "Master", email: "abbe@example.test", roleLabel: "Viewer", existingUser: false },
    });
    authMocks.serverAcceptInvite.mockResolvedValue({ ok: true, session: confirmedSession });
    const onAccepted = vi.fn();
    render(<InviteAcceptPage token="invite token" onAccepted={onAccepted} />);
    await screen.findByRole("button", { name: /set password & join/i });
    expect(screen.getByRole("link", { name: /continue with google/i })).toHaveAttribute("href", "/api/platform/auth/google?invite=invite%20token");
    expect(screen.getByRole("link", { name: /continue with microsoft/i })).toHaveAttribute("href", "/api/platform/auth/microsoft?invite=invite%20token");
    const passwords = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwords[0], { target: { value: "personal-password" } });
    fireEvent.change(passwords[1], { target: { value: "personal-password" } });
    fireEvent.click(screen.getByRole("button", { name: /set password & join/i }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(authMocks.serverAcceptInvite).toHaveBeenCalledWith({ token: "invite token", name: undefined, password: "personal-password" });
    expect(authMocks.bootstrapAuth).toHaveBeenCalledTimes(1);
  });

  it("keeps failed MFA on the consumed invitation, then verifies /me before completing", async () => {
    authMocks.serverAcceptInvite.mockResolvedValue({ ok: false, mfa: { mfaToken: "personal-token", enroll: false, email: "abbe@example.test" } });
    authMocks.serverMfaVerify
      .mockResolvedValueOnce({ ok: false, error: "Invalid authenticator code." })
      .mockResolvedValueOnce({ ok: true, session: confirmedSession });
    let resolveAuthority!: (value: unknown) => void;
    authMocks.bootstrapAuth.mockImplementationOnce(() => new Promise((resolve) => { resolveAuthority = resolve; }));
    const onAccepted = vi.fn();
    render(<InviteAcceptPage token="invite-token" onAccepted={onAccepted} />);
    fireEvent.click(await screen.findByRole("button", { name: /accept & join/i }));
    await screen.findByText("Two-factor verification");
    expect(screen.getByText("abbe@example.test")).toBeInTheDocument();
    expect(authMocks.bootstrapAuth).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Invalid authenticator code.");
    expect(onAccepted).not.toHaveBeenCalled();
    expect(authMocks.bootstrapAuth).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Verifying your session…");
    expect(onAccepted).not.toHaveBeenCalled();
    expect(authMocks.serverMfaVerify).toHaveBeenLastCalledWith("personal-token", "123456", false);
    await act(async () => { resolveAuthority({ session: confirmedSession }); });
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(authMocks.bootstrapAuth).toHaveBeenCalledTimes(1);
    expect(authMocks.serverAcceptInvite).toHaveBeenCalledTimes(1);
  });

  it("requires personal enrollment and saved recovery codes before the authority handoff", async () => {
    authMocks.serverAcceptInvite.mockResolvedValue({ ok: false, mfa: { mfaToken: "enroll-token", enroll: true, email: "abbe@example.test" } });
    authMocks.serverMfaSetup.mockResolvedValue({ ok: true, secret: "TESTSECRET", otpauthUrl: "otpauth://totp/Test?secret=TESTSECRET", email: "abbe@example.test" });
    authMocks.serverMfaEnable.mockResolvedValue({ ok: true, session: confirmedSession, recoveryCodes: ["TEST-ONE", "TEST-TWO"] });
    const onAccepted = vi.fn();
    render(<InviteAcceptPage token="invite-token" onAccepted={onAccepted} />);
    fireEvent.click(await screen.findByRole("button", { name: /accept & join/i }));
    await screen.findByText("TESTSECRET");
    expect(authMocks.serverMfaSetup).toHaveBeenCalledWith("enroll-token");
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /enable/i }));
    await screen.findByText("TEST-ONE");
    expect(authMocks.serverMfaEnable).toHaveBeenCalledWith("123456", "enroll-token");
    expect(authMocks.bootstrapAuth).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
    const proceed = screen.getByRole("button", { name: "Continue to AIO Fusion" });
    expect(proceed).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I have saved my recovery codes somewhere safe."));
    fireEvent.click(proceed);
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(authMocks.bootstrapAuth).toHaveBeenCalledTimes(1);
    expect(authMocks.serverAcceptInvite).toHaveBeenCalledTimes(1);
  });

  it("shows recovery-code warning before authority checks and does not finish on denied /me", async () => {
    authMocks.serverAcceptInvite.mockResolvedValue({ ok: false, mfa: { mfaToken: "recovery-token", enroll: false } });
    authMocks.serverMfaVerify.mockResolvedValue({ ok: true, session: confirmedSession, recoveryCodesRemaining: 2 });
    authMocks.bootstrapAuth.mockResolvedValue({ session: null });
    const onAccepted = vi.fn();
    render(<InviteAcceptPage token="invite-token" onAccepted={onAccepted} />);
    fireEvent.click(await screen.findByRole("button", { name: /accept & join/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Use a recovery code" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "TEST-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Only 2 recovery codes left.");
    expect(authMocks.bootstrapAuth).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue to AIO Fusion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your session could not be verified.");
    expect(onAccepted).not.toHaveBeenCalled();
    expect(authMocks.setSession).not.toHaveBeenCalled();
    expect(authMocks.serverAcceptInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute("href", "/?oauth_status=ok");
  });

  it("cancels MFA without offering to reuse the consumed invitation", async () => {
    authMocks.serverAcceptInvite.mockResolvedValue({ ok: false, mfa: { mfaToken: "personal-token", enroll: false } });
    const onAccepted = vi.fn();
    render(<InviteAcceptPage token="invite-token" onAccepted={onAccepted} />);
    fireEvent.click(await screen.findByRole("button", { name: /accept & join/i }));
    fireEvent.click(await screen.findByRole("button", { name: /back|cancel/i }));
    expect(screen.getByText(/You do not need to accept it again/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to sign in" })).toHaveAttribute("href", "/?oauth_status=ok");
    expect(screen.queryByRole("button", { name: /accept & join/i })).not.toBeInTheDocument();
    expect(authMocks.bootstrapAuth).not.toHaveBeenCalled();
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
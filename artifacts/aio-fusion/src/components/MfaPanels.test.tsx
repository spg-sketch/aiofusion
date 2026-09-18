import { describe, it, expect, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Mock the auth module before importing the component under test.
const serverMfaVerify = vi.hoisted(() => vi.fn());
const serverMfaSetup = vi.hoisted(() => vi.fn());
const serverMfaEnable = vi.hoisted(() => vi.fn());
const serverMfaStatus = vi.hoisted(() => vi.fn());
const serverLegacyMfaRecoveryStatus = vi.hoisted(() => vi.fn());
const serverLegacyMfaRecovery = vi.hoisted(() => vi.fn());
vi.mock("../lib/auth", () => ({
  serverMfaVerify,
  serverMfaSetup,
  serverMfaEnable,
  serverMfaStatus,
  serverLegacyMfaRecoveryStatus,
  serverLegacyMfaRecovery,
  serverMfaTrustedDevices: vi.fn(async () => ({ ok: true, devices: [] })),
  serverMfaRevokeTrustedDevice: vi.fn(),
  serverMfaDisable: vi.fn(),
  serverMfaRegenerateRecoveryCodes: vi.fn(),
}));

// Stub the input-otp based boxes: the library needs ResizeObserver (absent in
// jsdom) and leaves stray timers that fire after test-environment teardown.
// These tests exercise the recovery-code path, which doesn't use the boxes.
vi.mock("./ui/input-otp", () => ({
  InputOTP: (props: any) => <input aria-label={props["aria-label"]} data-testid="otp" disabled={props.disabled} value={props.value ?? ""} onChange={(event) => props.onChange?.(event.target.value)} />,
  InputOTPGroup: (props: any) => <div>{props.children}</div>,
  InputOTPSlot: () => <div />,
}));

import { MfaLoginStep, MfaSecuritySection, RecoveryCodesBlock } from "./MfaPanels";

const SESSION = { username: "user1", role: "client" } as any;
const CHALLENGE = { mfaToken: "tok", enroll: false };

function renderStep(onSuccess = vi.fn()) {
  render(<MfaLoginStep challenge={CHALLENGE} onSuccess={onSuccess} onCancel={() => {}} />);
  return onSuccess;
}

async function submitRecoveryCode() {
  fireEvent.click(screen.getByText("Use a recovery code"));
  fireEvent.change(screen.getByPlaceholderText("XXXX-XXXX"), { target: { value: "AAAA-BBBB" } });
  fireEvent.click(screen.getByText("Verify"));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("personal MFA setup and recovery codes", () => {
  it("requires a save acknowledgement before leaving, and copies only the newly issued codes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onDone = vi.fn();
    render(<RecoveryCodesBlock codes={["TEST-CODE", "SAFE-CODE"]} onDone={onDone} doneLabel="Done" />);
    const done = screen.getByRole("button", { name: "Done" }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("TEST-CODE\nSAFE-CODE"));
    expect(done.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I have saved my recovery codes somewhere safe."));
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("downloads plaintext only on an explicit click, without storing codes in browser storage", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:recovery-test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const store = vi.spyOn(Storage.prototype, "setItem");
    render(<RecoveryCodesBlock codes={["ONLY-ONCE"]} onDone={vi.fn()} doneLabel="Done" />);
    expect(createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(store).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:recovery-test");
    click.mockRestore();
    store.mockRestore();
  });

  it("shows a copy error without pretending the codes were saved", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<RecoveryCodesBlock codes={["ONLY-ONCE"]} onDone={vi.fn()} doneLabel="Done" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy all" }));
    await screen.findByRole("alert");
    expect((screen.getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("labels setup with the verified human email returned by the server, not a workspace", async () => {
    serverMfaSetup.mockResolvedValue({
      ok: true, secret: "PERSONAL-SECRET", email: "viewer@example.test",
      otpauthUrl: "otpauth://totp/AIO:viewer%40example.test?secret=PERSONALSECRET",
    });
    render(<MfaLoginStep challenge={{ enroll: true, mfaToken: "personal-challenge" }} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText("viewer@example.test")).toBeTruthy();
    expect(screen.getByText(/including Viewers/)).toBeTruthy();
    expect(serverMfaSetup).toHaveBeenCalledWith("personal-challenge");
  });

  it("discards the old person's QR and code state when the challenge changes", async () => {
    serverMfaSetup.mockResolvedValueOnce({
      ok: true, secret: "OLD-SECRET", email: "first@example.test", otpauthUrl: "otpauth://totp/first?secret=OLD",
    }).mockImplementationOnce(() => new Promise(() => {}));
    const { rerender } = render(<MfaLoginStep challenge={{ enroll: true, mfaToken: "first" }} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByText("OLD-SECRET");
    rerender(<MfaLoginStep challenge={{ enroll: true, mfaToken: "second" }} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText("OLD-SECRET")).toBeNull();
    expect(screen.queryByText("first@example.test")).toBeNull();
  });

  it("security settings display server-resolved email and cannot leak it to the next signed-in person", async () => {
    serverMfaStatus.mockResolvedValueOnce({
      ok: true, email: "first@example.test", enabled: false, required: true, recoveryCodesRemaining: 0,
    }).mockImplementationOnce(() => new Promise(() => {}));
    const { rerender } = render(<MfaSecuritySection session={{ username: "admin", role: "admin", userEmail: "first@example.test" }} />);
    await screen.findByText("first@example.test");
    expect(screen.getByText("Required for every Master member")).toBeTruthy();
    rerender(<MfaSecuritySection session={{ username: "admin", role: "admin", userEmail: "second@example.test" }} />);
    expect(screen.queryByText("first@example.test")).toBeNull();
  });
});

describe("MfaLoginStep recovery-code warning", () => {
  it("shows the remaining-count warning and defers onSuccess until Continue", async () => {
    serverMfaVerify.mockResolvedValue({ ok: true, session: SESSION, recoveryCodesRemaining: 2 });
    const onSuccess = renderStep();
    await submitRecoveryCode();

    await waitFor(() => {
      expect(screen.getByText("You signed in with a recovery code")).toBeTruthy();
    });
    expect(screen.getByText("Only 2 recovery codes left.")).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Continue to AIO Fusion"));
    expect(onSuccess).toHaveBeenCalledWith(SESSION, false);
  });

  it("shows an explicit message when no recovery codes remain", async () => {
    serverMfaVerify.mockResolvedValue({ ok: true, session: SESSION, recoveryCodesRemaining: 0 });
    renderStep();
    await submitRecoveryCode();

    await waitFor(() => {
      expect(screen.getByText("You have no recovery codes left.")).toBeTruthy();
    });
  });

  it("skips the warning entirely for a TOTP login (no recoveryCodesRemaining)", async () => {
    serverMfaVerify.mockResolvedValue({ ok: true, session: SESSION });
    const onSuccess = renderStep();
    await submitRecoveryCode();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(SESSION, false));
    expect(screen.queryByText("You signed in with a recovery code")).toBeNull();
  });
});

describe("legacy MFA recovery", () => {
  const recoveryChallenge = { mfaToken: "recovery-token", enroll: false, recover: true };

  it("loads the verified identity and submits only the dedicated recovery payload", async () => {
    serverLegacyMfaRecoveryStatus.mockResolvedValue({ ok: true, email: "owner@example.test" });
    serverLegacyMfaRecovery.mockResolvedValue({ ok: false, error: "That original code is not valid." });
    render(<MfaLoginStep challenge={recoveryChallenge} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText("owner@example.test")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to personal setup" }));

    await waitFor(() => expect(serverLegacyMfaRecovery).toHaveBeenCalledWith("recovery-token", "123456"));
    expect(await screen.findByRole("alert")).toHaveTextContent("That original code is not valid.");
    expect(serverMfaVerify).not.toHaveBeenCalled();
    expect(serverMfaSetup).not.toHaveBeenCalledWith("recovery-token");
    expect(serverMfaEnable).not.toHaveBeenCalledWith(expect.anything(), "recovery-token");
  });

  it("shows expired status guidance, supports retry, and cancellation", async () => {
    serverLegacyMfaRecoveryStatus
      .mockResolvedValueOnce({ ok: false, error: "This recovery sign-in has expired." })
      .mockResolvedValueOnce({ ok: true, email: "owner@example.test" });
    const onCancel = vi.fn();
    render(<MfaLoginStep challenge={recoveryChallenge} onSuccess={vi.fn()} onCancel={onCancel} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("expired");
    expect(screen.getByText("Start a fresh Google sign-in to request a new personal recovery check.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry recovery check" }));
    expect(await screen.findByText("owner@example.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel and start a fresh Google sign-in" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("locks submission while busy then transitions to fresh enrolment without creating a session", async () => {
    let resolveRecovery!: (value: any) => void;
    serverLegacyMfaRecoveryStatus.mockResolvedValue({ ok: true, email: "owner@example.test" });
    serverLegacyMfaRecovery.mockImplementation(() => new Promise((resolve) => { resolveRecovery = resolve; }));
    serverMfaSetup.mockResolvedValue({
      ok: true,
      email: "owner@example.test",
      secret: "FRESH-PERSONAL-SECRET",
      otpauthUrl: "otpauth://totp/owner?secret=FRESH",
    });
    const onSuccess = vi.fn();
    render(<MfaLoginStep challenge={recoveryChallenge} onSuccess={onSuccess} onCancel={vi.fn()} />);
    await screen.findByText("owner@example.test");
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    const submit = screen.getByRole("button", { name: "Continue to personal setup" });
    fireEvent.click(submit);
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submit);
    expect(serverLegacyMfaRecovery).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveRecovery({ ok: true, mfaEnrollRequired: true, mfaToken: "fresh-enrol-token", email: "owner@example.test" });
    });
    expect(await screen.findByText("Set up two-factor authentication")).toBeTruthy();
    expect(await screen.findByText("FRESH-PERSONAL-SECRET")).toBeTruthy();
    expect(serverMfaSetup).toHaveBeenCalledWith("fresh-enrol-token");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("finishes the existing fresh enrolment and save-codes flow before exposing the session", async () => {
    serverLegacyMfaRecoveryStatus.mockResolvedValue({ ok: true, email: "owner@example.test" });
    serverLegacyMfaRecovery.mockResolvedValue({
      ok: true, mfaEnrollRequired: true, mfaToken: "fresh-enrol-token", email: "owner@example.test",
    });
    serverMfaSetup.mockResolvedValue({
      ok: true, email: "owner@example.test", secret: "FRESH", otpauthUrl: "otpauth://totp/owner?secret=FRESH",
    });
    serverMfaEnable.mockResolvedValue({ ok: true, session: SESSION, recoveryCodes: ["NEW-ONE", "NEW-TWO"] });
    const onSuccess = vi.fn();
    render(<MfaLoginStep challenge={recoveryChallenge} onSuccess={onSuccess} onCancel={vi.fn()} />);
    await screen.findByText("owner@example.test");
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to personal setup" }));
    await screen.findByText("Set up two-factor authentication");
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & enable" }));

    expect(await screen.findByText("NEW-ONE")).toBeTruthy();
    expect(serverMfaEnable).toHaveBeenCalledWith("654321", "fresh-enrol-token");
    expect(onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("I have saved my recovery codes somewhere safe."));
    fireEvent.click(screen.getByRole("button", { name: "Continue to AIO Fusion" }));
    expect(onSuccess).toHaveBeenCalledWith(SESSION, false);
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Mock the auth module before importing the component under test.
const serverMfaVerify = vi.hoisted(() => vi.fn());
vi.mock("../lib/auth", () => ({
  serverMfaVerify,
  serverMfaSetup: vi.fn(),
  serverMfaEnable: vi.fn(),
  serverMfaStatus: vi.fn(),
  serverMfaDisable: vi.fn(),
  serverMfaRegenerateRecoveryCodes: vi.fn(),
}));

// Stub the input-otp based boxes: the library needs ResizeObserver (absent in
// jsdom) and leaves stray timers that fire after test-environment teardown.
// These tests exercise the recovery-code path, which doesn't use the boxes.
vi.mock("./ui/input-otp", () => ({
  InputOTP: (props: any) => <input data-testid="otp" value={props.value ?? ""} onChange={() => {}} />,
  InputOTPGroup: (props: any) => <div>{props.children}</div>,
  InputOTPSlot: () => <div />,
}));

import { MfaLoginStep } from "./MfaPanels";

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

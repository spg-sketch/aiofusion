import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const verifyMfa = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/auth")>();
  return { ...mod, serverMfaVerify: verifyMfa };
});

import { MfaLoginStep } from "./MfaPanels";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {}
  });
  document.elementFromPoint = () => null;
});

afterEach(() => {
  verifyMfa.mockReset();
  vi.unstubAllGlobals();
});

describe("MFA login completion", () => {
  it("submits a verified MFA challenge and emits its provisional session exactly once", async () => {
    verifyMfa.mockResolvedValue({
      ok: true,
      session: { username: "brand", role: "client" },
      needsSetup: false,
    });
    const onSuccess = vi.fn();
    render(
      <MfaLoginStep
        challenge={{ mfaToken: "mfa-token", enroll: false }}
        onSuccess={onSuccess}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(
      { username: "brand", role: "client" },
      false,
    ));
    expect(verifyMfa).toHaveBeenCalledTimes(1);
  });
});
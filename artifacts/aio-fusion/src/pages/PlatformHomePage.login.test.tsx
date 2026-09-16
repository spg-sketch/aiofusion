import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const login = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../lib/auth")>();
  return { ...mod, serverLogin: login };
});

import { PlatformHomePage } from "./PlatformHomePage";

const noop = () => {};

afterEach(() => {
  login.mockReset();
});

describe("password sign-in submission", () => {
  it("keeps rapid duplicate submits single-flight until the credential request settles", async () => {
    let resolve!: (result: { ok: false; error: string }) => void;
    login.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(
      <PlatformHomePage
        session={null}
        onLoginSuccess={noop}
        onSignOut={noop}
        onCreateProject={noop}
        onContinueToProjects={noop}
        onArchivedProjects={noop}
        onGuidance={noop}
        onBackToLanding={noop}
        onManageUsers={noop}
        onManageSubAccounts={noop}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Email or username"), { target: { value: "brand" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "password" } });
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(login).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ ok: false, error: "Nope" }); });
  });
});
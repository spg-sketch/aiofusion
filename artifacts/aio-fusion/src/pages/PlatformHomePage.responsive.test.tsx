// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformHomePage } from "./PlatformHomePage";

const noop = vi.fn();

describe("PlatformHomePage responsive account home", () => {
  afterEach(cleanup);

  it.each([375, 390])("keeps the main account controls in the mobile layout at %ipx", (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });

    render(
      <PlatformHomePage
        session={{
          username: "mobile-owner",
          role: "agency",
          membershipRole: "owner",
          userName: "A workspace owner with a long display name",
          userEmail: "owner@example.test",
          companyName: "A long agency workspace name for responsive coverage",
        }}
        backToAgency={<button type="button">Back to my agency account</button>}
        onCreateProject={noop}
        onContinueToProjects={noop}
        onArchivedProjects={noop}
        onGuidance={noop}
        onBackToLanding={noop}
        onLoginSuccess={noop}
        onSignOut={noop}
        onManageUsers={noop}
        onManageSubAccounts={noop}
        onTokenUsage={noop}
      />,
    );

    const page = screen.getByTestId("platform-home");
    expect(page.className).toContain("max-w-full");
    expect(page.className).toContain("overflow-x-hidden");
    expect(screen.getByTestId("platform-home-navigation").className).toContain("flex-wrap");
    expect(screen.getByTestId("platform-home-account-identity").className).toContain("min-w-0");
    expect(screen.getByTestId("platform-home-project-controls").className).toContain("grid-cols-1");
    expect(screen.getByRole("button", { name: /^my account$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /project hub/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /back to my agency account/i })).toBeTruthy();
  });
});
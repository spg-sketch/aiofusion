// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("./pages/PlatformHomePage", () => ({
  PlatformHomePage: () => <main data-testid="platform-home-page">Platform home</main>,
}));
vi.mock("./lib/contentAi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/contentAi")>();
  return { ...actual, apiBase: () => "" };
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("App platform-home invitations", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    Element.prototype.scrollTo = () => {};
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/platform/me")) return response({
        account: { username: "invitee", role: "client" }, setupComplete: true, hasPassword: true,
        emailVerified: true, masterOwner: false, impersonating: null,
      });
      if (url.includes("/api/platform/my-invites")) return response({
        invites: [{ token: "pending-1", companyId: "acme-id", companySlug: "acme", companyName: "Acme Workspace", role: "viewer", expiresAt: "2027-01-01", createdAt: "2026-01-01" }],
      });
      if (url.includes("/api/store/projects")) return response({ projects: [], deletedIds: [] });
      return response({}, 404);
    }));
    window.history.replaceState({}, "", "/?aio_switched_workspace=1");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("renders the global banner and offset after workspace-switch redirect", async () => {
    const { default: App } = await import("./App");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Acme Workspace")).toBeTruthy());
    expect(screen.getByTestId("button-accept-invite-pending-1")).toBeTruthy();
    expect(screen.getByTestId("platform-home-banner-offset").style.marginTop).toBe("var(--banner-h, 0px)");
  });
});
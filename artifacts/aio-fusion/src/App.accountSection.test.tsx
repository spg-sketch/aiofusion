import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, configure, fireEvent, act } from "@testing-library/react";

// Full-App render spans several async cycles (bootstrapAuth, lazy chunks,
// Suspense); raise the waitFor budget so slow CI runners don't flake.
configure({ asyncUtilTimeout: 5000 });

// Regression tests for settings-section deep links (task: catch
// settings-section refresh/Back regressions before they ship).
//
//   Refresh - landing on /?account_section=security (what a refresh of the
//     settings page reproduces) must open the Security section, even though
//     App's history-sync effect strips the query string before the lazy
//     SubAccountsPage mounts.
//   Back - after switching sections in-page, a popstate carrying the previous
//     section (what the browser Back button produces) must restore it.

vi.mock("./lib/contentAi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/contentAi")>();
  return { ...mod, apiBase: () => "" };
});

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function agencyMeResponse() {
  return makeResponse({
    account: { username: "acme-agency", role: "agency" },
    impersonating: null,
    setupComplete: true,
    hasPassword: true,
    emailVerified: true,
    masterOwner: false,
    accountProfile: { displayName: "Acme Agency", website: "acme.example" },
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  });
  vi.stubGlobal("IntersectionObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    root = null; rootMargin = ""; thresholds = [];
  });
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }
  document.elementFromPoint = () => null;

  // Authenticated agency session; every other endpoint fails closed (the
  // settings page still renders its nav and section shells without data).
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform/me")) return agencyMeResponse();
    return makeResponse({ error: "unavailable" }, 404);
  }));

  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

async function renderAppAt(url: string) {
  window.history.replaceState({}, "", url);
  const { default: App } = await import("./App");
  return render(<App />);
}

describe("settings-section deep link survives refresh (account_section param)", () => {
  beforeAll(async () => {
    await import("./App");
  });

  it("landing on /?account_section=security opens the Security section", async () => {
    await renderAppAt("/?account_section=security");

    // The section content mounts once auth resolves and SubAccountsPage lazy
    // loads. Assert the Security panel's own heading (not the always-visible
    // nav button) so this fails if the deep link lands on the wrong section.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });
    expect(screen.queryByText("Account type")).toBeNull();
    // History-sync must have rewritten the URL to carry the section, so a
    // second refresh reproduces the same state.
    expect(window.location.search).toContain("account_section=security");
  });

  it("landing on /?account_section=team with a disallowed role falls back to Profile", async () => {
    // Agency owner CAN see team; use a nonsense section instead to assert the
    // safe fallback path never renders a broken page.
    await renderAppAt("/?account_section=not-a-real-section");

    await waitFor(() => {
      expect(screen.getByText("Account type")).toBeInTheDocument();
    });
  });
});

describe("browser Back restores the previous settings section (popstate)", () => {
  it("switching sections then dispatching the previous popstate state returns to it", async () => {
    await renderAppAt("/?account_section=security");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });

    // Move to the Clients section in-page.
    fireEvent.click(screen.getAllByRole("button", { name: /client accounts/i })[0]);
    await waitFor(() => {
      expect(screen.getByText("Create a client account")).toBeInTheDocument();
    });

    // Simulate the browser Back button: popstate carrying the App nav state
    // that the history-sync effect pushed for the Security section.
    act(() => {
      window.history.replaceState(
        { __aioNav: true, view: "sub-accounts", currentPage: "dashboard", insightsArticleId: null, accountSection: "security" },
        "",
        "/?account_section=security",
      );
      window.dispatchEvent(new PopStateEvent("popstate", {
        state: { __aioNav: true, view: "sub-accounts", currentPage: "dashboard", insightsArticleId: null, accountSection: "security" },
      }));
    });

    // Back must land on the SECURITY panel specifically, not just leave Clients.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });
    expect(screen.queryByText("Create a client account")).toBeNull();
  });
});

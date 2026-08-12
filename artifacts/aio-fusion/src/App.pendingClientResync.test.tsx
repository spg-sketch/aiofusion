import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, configure, act } from "@testing-library/react";

// Regression guard for the project-hub live accounts refresh.
//
// resyncProjects() in App.tsx must refresh the cached accounts list
// (refreshAccountsCache) alongside the project sync, and saveUsers must fire
// "aio:accounts-changed" so the pendingClientAccounts memo recomputes. Together
// these make a client account created on ANOTHER device show its
// "Start project" placeholder card in the hub without a page reload.
//
// This test boots the full App as an agency with no sub-accounts, then flips
// the /api/platform/accounts mock to include a new client account and fires a
// window focus event (one of resyncProjects' live-refresh triggers). The
// placeholder card must appear without any remount/reload. If a refactor drops
// the accounts refresh from resyncProjects, or the aio:accounts-changed
// re-render hook, this test fails.

configure({ asyncUtilTimeout: 5000 });

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

const unauthorizedBody = { error: "unauthorized" };

function agencyMeResponse() {
  return makeResponse({
    account: { username: "myagency", role: "agency" },
    impersonating: null,
    setupComplete: true,
    hasPassword: true,
    emailVerified: true,
    masterOwner: false,
    accountProfile: { displayName: "My Agency Ltd", website: "myagency.com" },
  });
}

// Accounts payload before/after the "colleague creates a client on another
// device" moment. The switch is controlled by the test via this flag.
let includeNewClient = false;

function accountsResponse() {
  const accounts: unknown[] = [
    { username: "myagency", role: "agency", displayName: "My Agency Ltd" },
  ];
  if (includeNewClient) {
    accounts.push({
      username: "newclientco",
      role: "client",
      parent: "myagency",
      displayName: "New Client Co",
    });
  }
  return makeResponse({ accounts });
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
  // input-otp polls document.elementFromPoint (not in jsdom).
  document.elementFromPoint = () => null;
  // App scrolls the main <section> ref on page change; jsdom lacks scrollTo.
  Element.prototype.scrollTo = () => {};

  includeNewClient = false;

  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    const method = ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase();
    if (urlStr.includes("/api/platform/me")) return agencyMeResponse();
    if (urlStr.includes("/api/platform/accounts") && method === "GET") return accountsResponse();
    // Empty-but-successful project pull so resyncProjects does not take the
    // "unauthorized" branch and re-bootstrap the session.
    if (urlStr.includes("/api/store/projects") && method === "GET") {
      return makeResponse({ projects: [], deletedIds: [] });
    }
    return makeResponse(unauthorizedBody, 401);
  }));

  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("project hub live accounts refresh (new client placeholder without reload)", () => {
  beforeAll(async () => {
    await import("./App");
  });

  it("shows the new client's Start-project placeholder card after a focus re-sync, without a reload", async () => {
    window.history.replaceState({}, "", "/");
    const { default: App } = await import("./App");
    render(<App />);

    // Navigate to the project hub (view="platform") deterministically: App's
    // popstate listener is attached in an effect after bootstrapAuth kicks
    // off, so under a loaded suite the listener may not be ready on the first
    // dispatch. Re-dispatch inside a poll until the hub's empty state renders.
    const state = { __aioNav: true, view: "platform" };
    await waitFor(async () => {
      await act(async () => {
        window.history.pushState(state, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
        await new Promise((r) => setTimeout(r, 50));
      });
      // Baseline: hub renders empty - no projects and no placeholder cards yet.
      expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
    }, { timeout: 15000 });
    expect(screen.queryByText("New Client Co")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start project/i })).not.toBeInTheDocument();

    // A colleague creates the client account on another device: the next
    // accounts fetch now includes it.
    includeNewClient = true;

    // Simulate the tab regaining focus - one of the live-refresh triggers that
    // calls resyncProjects (which must refresh the accounts cache in parallel).
    // Re-dispatch inside the poll so a slow tick under a loaded suite cannot
    // flake the test.
    await waitFor(async () => {
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
        await new Promise((r) => setTimeout(r, 100));
      });
      // The accounts cache itself must now hold the new client (proves
      // refreshAccountsCache ran as part of the re-sync)...
      const cached = JSON.parse(localStorage.getItem("aio.auth.users.v3") || "[]") as { username: string }[];
      expect(cached.some((u) => u.username === "newclientco")).toBe(true);
      // ...and the placeholder card must appear without any reload (proves the
      // aio:accounts-changed re-render hook still bumps pendingClientAccounts).
      expect(screen.getByText("New Client Co")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Start project/i })).toBeInTheDocument();
    }, { timeout: 15000 });
  }, 30000);
});

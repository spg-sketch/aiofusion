import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, configure, act } from "@testing-library/react";

// Regression guard for keeping managed clients out of the project hub.
//
// resyncProjects() still refreshes the cached accounts list so the Clients
// section stays current across devices. The project hub, however, must only
// render real projects and must never turn a no-project managed client into a
// "Client account" placeholder card.
//
// This test boots the full App as an agency with no sub-accounts, then flips
// the /api/platform/accounts mock to include a new client account and fires a
// window focus event (one of resyncProjects' live-refresh triggers). The
// managed client must remain absent from the hub after that refresh.

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

let activeWorkspace = "myagency";
let visibleProjects: unknown[] = [];
let projectListFailure = false;

function agencyMeResponse() {
  return makeResponse({
    account: { username: activeWorkspace, role: "agency" },
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
  activeWorkspace = "myagency";
  visibleProjects = [];
  projectListFailure = false;

  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const urlStr = String(url);
    const method = ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase();
    if (urlStr.includes("/api/platform/me")) return agencyMeResponse();
    if (urlStr.includes("/api/platform/accounts") && method === "GET") return accountsResponse();
    // Empty-but-successful project pull so resyncProjects does not take the
    // "unauthorized" branch and re-bootstrap the session.
    if (urlStr.includes("/api/store/projects") && method === "GET") {
      if (projectListFailure) return makeResponse({ error: "temporarily unavailable" }, 503);
      return makeResponse({ projects: visibleProjects, deletedIds: [] });
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

describe("project hub excludes managed clients without projects", () => {
  beforeAll(async () => {
    await import("./App");
  });

  it("starts project reads without waiting for content and joins passive refresh bursts", async () => {
    let releaseContent!: () => void;
    let releaseProjects!: () => void;
    const contentPending = new Promise<void>((resolve) => { releaseContent = resolve; });
    const projectsPending = new Promise<void>((resolve) => { releaseProjects = resolve; });
    let contentStarted = false;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (/\/api\/store\/(archive|planner|scoring-config)$/.test(path)) {
        contentStarted = true;
        await contentPending;
        return makeResponse({ items: [], config: null });
      }
      if (path.includes("/api/store/projects")) {
        await projectsPending;
        return makeResponse({ projects: [], deletedIds: [] });
      }
      return originalFetch(url, init);
    }));
    const { default: App } = await import("./App");
    window.history.replaceState({}, "", "/project-hub");
    render(<App />);
    const requestsTo = (path: string) => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes(path));
    await waitFor(() => {
      expect(contentStarted).toBe(true);
      expect(requestsTo("/api/store/projects")).toHaveLength(1);
      expect(requestsTo("/api/platform/accounts")).toHaveLength(1);
    });
    expect(screen.queryByText(/No projects yet/i)).not.toBeInTheDocument();
    // A single app poll, not the previous overlapping 90s + 5m poll loops.
    await waitFor(() => {
      expect(requestsTo("/api/support/tickets?mine=true&hasUpdate=true")).toHaveLength(1);
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(requestsTo("/api/store/projects")).toHaveLength(1);
    expect(requestsTo("/api/platform/accounts")).toHaveLength(1);
    await act(async () => {
      releaseProjects();
      releaseContent();
    });
  });

  it("keeps confirmed projects visible when a background refresh fails", async () => {
    visibleProjects = [{
      id: "stable-project",
      name: "Stable Project",
      owner: "myagency",
      logo: null,
      updatedAt: null,
      data: { id: "stable-project", name: "Stable Project", owner: "myagency" },
    }];
    window.history.replaceState({}, "", "/project-hub");
    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("button", { name: /Stable Project/i })).toBeInTheDocument();
    projectListFailure = true;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await screen.findByText(/current project has been kept/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stable Project/i })).toBeInTheDocument();
    expect(screen.queryByText(/No projects yet/i)).not.toBeInTheDocument();
  });

  it("shows a retry-only unknown state when the first project load fails", async () => {
    projectListFailure = true;
    window.history.replaceState({}, "", "/project-hub");
    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByText("Projects unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry project load/i })).toBeInTheDocument();
    expect(screen.queryByText(/No projects yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create your first project/i })).not.toBeInTheDocument();
  });

  it("refreshes the account cache without adding a managed-client placeholder card", async () => {
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
      // Baseline: hub renders empty because there are no real projects.
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
    // The accounts cache itself must now hold the new client, proving the
    // managed Clients section will see it without a reload.
      const cached = JSON.parse(localStorage.getItem("aio.auth.users.v3") || "[]") as { username: string }[];
      expect(cached.some((u) => u.username === "newclientco")).toBe(true);
      // The project hub remains project-only.
      expect(screen.queryByText("New Client Co")).not.toBeInTheDocument();
      expect(screen.queryByText("Client account")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Start project$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
    }, { timeout: 15000 });
  }, 30000);

  it("clears an open project when another tab changes the authenticated workspace", async () => {
    visibleProjects = [{
      id: "account-a-project",
      name: "Account A Private",
      owner: "myagency",
      logo: null,
      updatedAt: null,
      data: {
        id: "account-a-project",
        name: "Account A Private",
        owner: "myagency",
        initials: "AA",
        color: "#123456",
      },
    }];
    window.history.replaceState({}, "", "/project-hub");
    const { default: App } = await import("./App");
    render(<App />);

    const card = await screen.findByRole("button", { name: /Account A Private/i });
    await act(async () => { card.click(); });
    expect((await screen.findAllByText("Account A Private")).length).toBeGreaterThan(0);

    // Simulate another tab replacing the shared session cookie with Account B.
    activeWorkspace = "account-b";
    visibleProjects = [];
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(screen.queryAllByText("Account A Private")).toHaveLength(0);
      expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
    });
    expect(localStorage.getItem("aio.activeProjectId")).toBeNull();
  }, 30000);
});

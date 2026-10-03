import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, configure, fireEvent, act, within } from "@testing-library/react";
import { UsersAdminPage } from "./pages/UsersAdminPage";

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

const mockServerExitImpersonation = vi.hoisted(() => vi.fn());
vi.mock("./lib/auth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/auth")>();
  return {
    ...mod,
    serverExitImpersonation: (...args: unknown[]) => mockServerExitImpersonation(...args),
  };
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

function clientMeResponse({
  username = "client-289",
  agencyManagedClient = false,
  impersonating = null,
  membershipRole,
}: {
  username?: string;
  agencyManagedClient?: boolean;
  impersonating?: { by: string; byRole?: string } | null;
  membershipRole?: "viewer" | "content" | "billing";
} = {}) {
  return makeResponse({
    account: { username, role: "client", membershipRole },
    impersonating,
    setupComplete: true,
    hasPassword: true,
    emailVerified: true,
    masterOwner: false,
    ...(agencyManagedClient ? { agencyManagedClient: true } : {}),
    accountProfile: { displayName: "Client 289", website: "client.example" },
  });
}

function stubClientAppFetch({
  username = "client-289",
  agencyManagedClient = false,
  impersonating = null,
  projects = [],
  atLimit = false,
  pushLimitReached = false,
  pushFailures = 0,
  onUpsert,
  trial,
  membershipRole,
}: {
  username?: string;
  agencyManagedClient?: boolean;
  impersonating?: { by: string; byRole?: string } | null;
  projects?: unknown[];
  atLimit?: boolean;
  pushLimitReached?: boolean;
  pushFailures?: number;
  onUpsert?: (body: unknown) => void;
  trial?: { status: "active" | "expired"; daysRemaining: number };
  membershipRole?: "viewer" | "content" | "billing";
} = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/platform/me")) {
      return clientMeResponse({ username, agencyManagedClient, impersonating, membershipRole });
    }
    if (url.includes("/api/store/projects/upsert")) {
      if (init?.body) {
        try { onUpsert?.(JSON.parse(String(init.body))); } catch { /* test fixture */ }
      }
      if (pushFailures > 0) {
        pushFailures -= 1;
        return makeResponse({ error: "Project save failed." }, 503);
      }
      return makeResponse(pushLimitReached
        ? { error: "Project allowance reached.", limitReached: true }
        : { ok: true }, pushLimitReached ? 409 : 200);
    }
    if (url.includes("/api/store/projects")) {
      return makeResponse({ projects, deletedIds: [] });
    }
    if (url.includes("/api/platform/billing/subscription")) {
      if (trial) return makeResponse({
        status: "none", plan: null, frequency: null, currentPeriodEnd: null,
        entitled: trial.status === "active", applicablePlan: "inhouse",
        includedProjects: 3, projectAllowance: 3, projectsUsed: 0,
        portalAvailable: false, checkoutAvailable: false, companyRecordComplete: false,
        trial, projects: [], unassignedAddons: [],
        tierPrices: {
          standard: { yearlyTotal: 12000, actionsPerMonth: 50 },
          premium: { yearlyTotal: 24000, actionsPerMonth: 100 },
          max: { yearlyTotal: 36000, actionsPerMonth: 150 },
        },
        prices: { annual: { yearlyTotal: 12000 }, quarterly: { perQuarter: 3000, yearlyTotal: 12000 } },
      });
      return makeResponse(atLimit
        ? { projectsUsed: 3, projectAllowance: 3 }
        : { projectsUsed: 0, projectAllowance: 3 });
    }
    return makeResponse({ error: "unavailable" }, 404);
  }));
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
  Element.prototype.scrollTo = () => {};

  // Authenticated agency session; every other endpoint fails closed (the
  // settings page still renders its nav and section shells without data).
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform/me")) return agencyMeResponse();
    if (url.includes("/api/store/projects")) {
      return makeResponse({ projects: [], deletedIds: [] });
    }
    return makeResponse({ error: "unavailable" }, 404);
  }));

  localStorage.clear();
  sessionStorage.clear();
  mockServerExitImpersonation.mockReset();
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
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<App />);
  });
  return result;
}

describe("settings-section deep link survives refresh (account_section param)", () => {
  beforeAll(async () => {
    await import("./App");
  });

  it("hard-mounts the protected project hub with the saved project after reload", async () => {
    stubClientAppFetch({
      username: "client-289",
      projects: [{
        id: "saved-bob",
        name: "Saved Bob",
        owner: "client-289",
        sector: "Technology",
        initials: "SB",
        color: "#1A647B",
        contentCount: 0,
        avgScore: 0,
        scoreTrend: 0,
        activePlans: 0,
        lastActive: "",
        recentActivity: "",
      }],
    });

    await renderAppAt("/project-hub");

    await waitFor(() => {
      expect(screen.getByText("Saved Bob")).toBeInTheDocument();
    });
    expect(window.location.pathname).toBe("/project-hub");
    expect(screen.getAllByText("Project Hub").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("platform-home")).toBeNull();
  });

  it("landing on /?account_section=security opens the Security section", async () => {
    await renderAppAt("/?account_section=security");

    // The section content mounts once auth resolves and SubAccountsPage lazy
    // loads. Assert the Security panel's own heading (not the always-visible
    // nav button) so this fails if the deep link lands on the wrong section.
    // This first cold settings chunk competes with every full-suite worker.
    // Keep a bounded route-load budget without weakening the destination check.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    }, { timeout: 15_000 });
    expect(screen.queryByText("Account type")).toBeNull();
    // History-sync must have rewritten the URL to carry the section, so a
    // second refresh reproduces the same state.
    await waitFor(() => {
      expect(window.location.search).toContain("account_section=security");
    });
  });

  it("normal return to account settings opens Profile at the top instead of the previous section", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await renderAppAt("/?account_section=security");

    await screen.findByRole("heading", { name: /sign-in & security/i });
    fireEvent.click(screen.getByRole("button", { name: /back to platform/i }));

    const openSettings = await screen.findByRole("button", { name: /account, client & team settings/i });
    fireEvent.click(openSettings);

    await waitFor(() => {
      expect(screen.getByText("Account type")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /sign-in & security/i })).toBeNull();
      expect(window.location.search).toContain("account_section=profile");
    });
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it("landing on /?account_section=team with a disallowed role falls back to Profile", async () => {
    // Agency owner CAN see team; use a nonsense section instead to assert the
    // safe fallback path never renders a broken page.
    await renderAppAt("/?account_section=not-a-real-section");

    await waitFor(() => {
      expect(screen.getByText("Account type")).toBeInTheDocument();
    });
  });

  it("ignores a stale needs_setup flag when the server says setup is complete", async () => {
    await renderAppAt("/?needs_setup=1&account_section=billing");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /company and billing information/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /thank you for signing up to AIO Fusion/i })).toBeNull();
  });

  it("does not gate an exempt member when a stale needs_setup URL is present", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/platform/me")) {
        return makeResponse({
          account: { username: "member-workspace", role: "agency", membershipRole: "viewer" },
          impersonating: null, setupComplete: false, onboarding: null,
          hasPassword: true, emailVerified: true, masterOwner: false,
        });
      }
      if (url.includes("/api/store/projects")) return makeResponse({ projects: [], deletedIds: [] });
      return makeResponse({ error: "unavailable" }, 404);
    }));
    await renderAppAt("/?needs_setup=1&account_section=security");
    // The normal settings destination renders; the stale query parameter and
    // incomplete flag cannot substitute for the server onboarding object.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /thank you for signing up to AIO Fusion/i })).toBeNull();
  });

  it("lets an owner explicitly correct a flagged imported company name", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/platform/me")) {
        return makeResponse({
          account: { username: "morgan-owner", role: "client", googleLinked: true },
          impersonating: null,
          setupComplete: true,
          hasPassword: false,
          sessionIdentity: {
            userName: "Morgan Owner",
            userEmail: "morgan@example.test",
            companyName: "Morgan Owner",
          },
          accountProfile: {
            displayName: "Morgan Owner",
            website: null,
            workspaceNameNeedsReview: true,
          },
        });
      }
      if (url.includes("/api/platform/accounts/profile") && init?.method === "POST") {
        return makeResponse({ ok: true });
      }
      if (url.includes("/api/store/projects")) return makeResponse({ projects: [], deletedIds: [] });
      return makeResponse({ error: "unavailable" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    await renderAppAt("/?account_section=profile");
    const input = await screen.findByLabelText(/company name/i);
    expect(input).toHaveValue("Morgan Owner");
    fireEvent.change(input, { target: { value: "Morgan Communications" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm name/i }));

    await waitFor(() => {
      const profileCall = fetchMock.mock.calls.find(([input]) =>
        String(input).includes("/api/platform/accounts/profile"));
      expect(profileCall).toBeTruthy();
      expect(JSON.parse(String(profileCall?.[1]?.body))).toEqual({
        username: "morgan-owner",
        displayName: "Morgan Communications",
        confirmWorkspaceNameReview: true,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /please check your company name/i })).toBeNull();
      expect(screen.getByText("Morgan Communications")).toBeInTheDocument();
    });
  });
});

describe("View plans opens Billing details from Platform Home", () => {
  it.each(["active", "expired"] as const)("%s trial opens the billing panel and keeps it after refresh", async (status) => {
    stubClientAppFetch({ trial: { status, daysRemaining: status === "active" ? 12 : 0 } });
    const app = await renderAppAt("/platform");

    expect(await screen.findByText(status === "active"
      ? "12 days left in your beta trial"
      : "Your 60-day beta trial has ended")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view plans/i }));

    await screen.findByRole("heading", { name: /company and billing information/i });
    expect(await screen.findByRole("heading", { name: /^subscription$/i })).toBeInTheDocument();
    expect(screen.queryByText("Your profile")).toBeNull();
    await waitFor(() => expect(window.location.search).toBe("?account_section=billing"));

    const billingUrl = window.location.pathname + window.location.search;
    app.unmount();
    await renderAppAt(billingUrl);
    await screen.findByRole("heading", { name: /company and billing information/i });
    expect(await screen.findByRole("heading", { name: /^subscription$/i })).toBeInTheDocument();
    expect(window.location.search).toBe("?account_section=billing");

    fireEvent.click(screen.getByRole("button", { name: /back to platform/i }));
    fireEvent.click(await screen.findByRole("button", { name: /account & team settings/i }));
    await screen.findByText("Your profile");
    expect(screen.queryByRole("heading", { name: /company and billing information/i })).toBeNull();
    await waitFor(() => expect(window.location.search).toBe("?account_section=profile"));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => /\/checkout|\/portal/.test(String(url)))).toBe(false);
  });

  it.each([
    { membershipRole: "viewer" as const },
    { membershipRole: "content" as const },
    { agencyManagedClient: true },
  ])("does not bypass billing restrictions for %j", async (restrictedSession) => {
    stubClientAppFetch({
      ...restrictedSession,
      trial: { status: "active", daysRemaining: 12 },
    });
    await renderAppAt("/platform");
    fireEvent.click(await screen.findByRole("button", { name: /view plans/i }));

    await screen.findByText("Your profile");
    expect(screen.queryByRole("button", { name: /^billing details$/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /company and billing information/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^subscription$/i })).toBeNull();
  });
});

describe("browser Back restores the previous settings section (popstate)", () => {
  it("switching sections then dispatching the previous popstate state returns to it", async () => {
    await renderAppAt("/?account_section=security");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });

    // Move to the Client Projects section in-page.
    fireEvent.click(screen.getAllByRole("button", { name: /^client projects$/i })[0]);
    await waitFor(() => {
      expect(screen.getByText("Add a Client Project")).toBeInTheDocument();
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
    expect(screen.queryByText("Add a client")).toBeNull();
  });

  it("raw delete-reauth callback history restores the Security section", async () => {
    await renderAppAt("/?account_section=profile");
    await waitFor(() => expect(screen.getByText("Your profile")).toBeInTheDocument());

    act(() => {
      window.history.replaceState(null, "", "/?delete_reauth=expired");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });
  });

  it("Back home then Forward normalized account_section=security reopens Security", async () => {
    await renderAppAt("/?account_section=security");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });

    // Browser Back arrives at the public/home history entry.
    act(() => {
      const homeState = {
        __aioNav: true,
        view: "landing",
        currentPage: "dashboard",
        insightsArticleId: null,
        accountSection: "security",
      };
      window.history.replaceState(homeState, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate", { state: homeState }));
    });
    await act(async () => {});

    // Browser Forward returns to the normalized account URL. Keep the
    // previously-selected section in state to reproduce the same-section case
    // that otherwise leaves Platform Home mounted.
    act(() => {
      const state = {
        __aioNav: true,
        view: "platform-home",
        currentPage: "dashboard",
        insightsArticleId: null,
        accountSection: "security",
      };
      window.history.replaceState(state, "", "/?account_section=security");
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign-in & security/i })).toBeInTheDocument();
    });
  });
});

describe("GEOrge support from account settings", () => {
  it("opens and closes the existing GEOrge support UI", async () => {
    await renderAppAt("/?account_section=profile");

    await waitFor(() => {
      expect(screen.getByText("Account type")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /ask george/i })[0]);
    expect(await screen.findByText("GEO Support Assistant")).toBeInTheDocument();

    const georgeHeader = screen.getByText("GEO Support Assistant").parentElement?.parentElement;
    expect(georgeHeader).toBeTruthy();
    fireEvent.click(within(georgeHeader as HTMLElement).getAllByRole("button")[0]);
    await waitFor(() => {
      expect(screen.queryByText("GEO Support Assistant")).toBeNull();
    });
  });
});

describe("client-project handoff after agency navigation", () => {
  it.each([
    ["malformed JSON", "not-json"],
    ["the legacy project-only shape", JSON.stringify({ projectId: null })],
    ["a different client username", JSON.stringify({ username: "another-client", projectId: null })],
  ])("ignores %s and keeps the old settings URL on settings", async (_label, handoff) => {
    stubClientAppFetch();
    sessionStorage.setItem("aio:open-client-projects", handoff);

    await renderAppAt("/?account_section=clients");

    await waitFor(() => {
      expect(screen.getByText("Account type")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /project hub/i })).toBeNull();
  });

  it("opens the matching client hub even when the old settings URL is still present", async () => {
    stubClientAppFetch({ username: "client-289", agencyManagedClient: true });
    sessionStorage.setItem(
      "aio:open-client-projects",
      JSON.stringify({ username: "client-289", projectId: null }),
    );

    await renderAppAt("/?account_section=clients");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /project hub/i })).toBeInTheDocument();
    });
    expect(screen.queryByText("Account type")).toBeNull();
    expect(sessionStorage.getItem("aio:open-client-projects")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/api/platform/my-invites"))).toBe(false);
    expect(screen.queryByText(/could not load team invitations/i)).toBeNull();
  });

  it("opens a protected handoff at the Project Hub instead of the marketing home", async () => {
    stubClientAppFetch({ username: "client-289", agencyManagedClient: true });
    sessionStorage.setItem(
      "aio:open-client-projects",
      JSON.stringify({ username: "client-289", projectId: null }),
    );

    await renderAppAt("/platform?account_section=clients");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /project hub/i })).toBeInTheDocument();
    });
    expect(screen.queryByText("Account type")).toBeNull();
    expect(screen.queryByText(/The AI Authority Platform/i)).toBeNull();
  });

  it("keeps a normal create modal open after a non-limit save failure and retries its stable id", async () => {
    const upserts: Array<{ id?: string; data?: { name?: string } }> = [];
    stubClientAppFetch({
      username: "client-289",
      pushFailures: 1,
      onUpsert: (body) => upserts.push(body as { id?: string; data?: { name?: string } }),
    });

    await renderAppAt("/platform");
    fireEvent.click(await screen.findByRole("button", { name: /project hub/i }));
    fireEvent.click(await screen.findByRole("button", { name: /create your first project/i }));
    const nameInput = await screen.findByLabelText("Project name");
    fireEvent.change(nameInput, { target: { value: "Retryable Project" } });
    fireEvent.click(screen.getByRole("button", { name: /create & set up/i }));

    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0].data?.name).toBe("Retryable Project");
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Name your project" })).toBeInTheDocument());
    expect(screen.getByLabelText("Project name")).toHaveValue("Retryable Project");
    expect(upserts).toHaveLength(1);
    expect(upserts[0].id).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("aio.projects.v1") ?? "[]"))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Retryable Project" })]));

    fireEvent.click(screen.getByRole("button", { name: /create & set up/i }));
    await waitFor(() => expect(upserts).toHaveLength(2));
    expect(upserts[1].id).toBe(upserts[0].id);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Name your project" })).toBeNull());
    expect(JSON.parse(localStorage.getItem("aio.projects.v1") ?? "[]"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: upserts[0].id, name: "Retryable Project" })]));
  });

  it("clears a resumed pending Client Project intent when creation is cancelled before reload", async () => {
    const pendingProject = {
      id: "pending-cancel-project",
      name: "Pending Cancel Project",
      sector: "Awaiting set-up",
      initials: "PC",
      color: "#C8497A",
      contentCount: 0,
      avgScore: 0,
      scoreTrend: 0,
      activePlans: 0,
      lastActive: "Just now",
      recentActivity: "Project created",
      owner: "client-289",
    };
    stubClientAppFetch({
      username: "client-289",
      agencyManagedClient: true,
      impersonating: { by: "acme-agency", byRole: "agency" },
      pushFailures: 1,
    });
    sessionStorage.setItem("aio:pending-client-project", JSON.stringify({
      username: "client-289",
      operatorUsername: "acme-agency",
      project: pendingProject,
    }));

    await renderAppAt("/platform");
    const dialog = await screen.findByRole("dialog", { name: "Name your project" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(sessionStorage.getItem("aio:pending-client-project")).toBeNull();

    cleanup();
    await renderAppAt("/platform");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Name your project" })).toBeNull();
    });
  });

  it("opens an explicit matching project directly from the handoff", async () => {
    const project = {
      id: "project-289",
      name: "Client 289 Launch",
      sector: "Technology",
      initials: "C2",
      color: "#1A647B",
      contentCount: 0,
      avgScore: 0,
      scoreTrend: 0,
      activePlans: 0,
      lastActive: "",
      recentActivity: "",
      owner: "client-289",
    };
    stubClientAppFetch({
      projects: [{
        id: project.id,
        name: project.name,
        data: project,
        logo: null,
        owner: project.owner,
        updatedAt: null,
      }],
    });
    sessionStorage.setItem(
      "aio:open-client-projects",
      JSON.stringify({ username: "client-289", projectId: project.id }),
    );

    await renderAppAt("/?account_section=clients");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: project.name })).toBeInTheDocument();
    });
    expect(screen.getByText("Authority Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /project hub/i })).toBeNull();
  });

  it("round-trips the real UsersAdmin View account producer into an explicit project", async () => {
    const project = {
      id: "project-admin-handoff",
      name: "Admin Handoff Launch",
      sector: "Technology",
      initials: "AH",
      color: "#1A647B",
      contentCount: 0,
      avgScore: 0,
      scoreTrend: 0,
      activePlans: 0,
      lastActive: "",
      recentActivity: "",
      owner: "client-one",
    };
    localStorage.setItem(
      "aio.auth.users.v3",
      JSON.stringify([
        { username: "admin", password: "", role: "admin", createdAt: 1 },
        { username: "client-one", password: "", role: "client", createdAt: 2 },
      ]),
    );
    localStorage.setItem("aio.projects.v1", JSON.stringify([project]));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/platform/accounts/client-one/impersonate")) {
        return makeResponse({ account: { username: "client-one", role: "client" } });
      }
      if (url.endsWith("/api/platform/accounts")) {
        return makeResponse({
          accounts: [
            { username: "admin", role: "admin" },
            { username: "client-one", role: "client" },
          ],
        });
      }
      if (url.includes("/api/platform/admin/master-owners")) {
        return makeResponse({ usernames: [] });
      }
      if (url.includes("/api/platform/admin/staging-test-reset")) {
        return makeResponse({ enabled: false });
      }
      return makeResponse({ rows: [] });
    }));

    let redirectedTo: string | undefined;
    try {
      render(
        <UsersAdminPage
          session={{ username: "admin", role: "admin" }}
          initialSection="clients"
          onBack={() => {}}
          onAssignProjectOwner={async () => ({ ok: true })}
          onNavigate={(url) => { redirectedTo = url ?? undefined; }}
        />,
      );
      fireEvent.click(await screen.findByRole("button", { name: "View account" }));

      await waitFor(() => {
        expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
          username: "client-one",
          projectId: project.id,
        });
      });
      expect(redirectedTo).toBe("/");
    } finally {
      cleanup();
    }

    stubClientAppFetch({
      username: "client-one",
      projects: [{
        id: project.id,
        name: project.name,
        data: project,
        logo: null,
        owner: project.owner,
        updatedAt: null,
      }],
      impersonating: { by: "admin", byRole: "admin" },
    });
    await renderAppAt("/");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: project.name })).toBeInTheDocument();
    });
    expect(screen.getByText("Authority Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /project hub/i })).toBeNull();
  });

  it("sends an agency-managed client back to its own agency billing when capacity is full", async () => {
    stubClientAppFetch({
      agencyManagedClient: true,
      impersonating: { by: "acme-agency", byRole: "agency" },
      atLimit: true,
    });
    mockServerExitImpersonation.mockResolvedValue({
      ok: true,
      session: { username: "acme-agency", role: "agency" },
    });
    sessionStorage.setItem(
      "aio:open-client-projects",
      JSON.stringify({ username: "client-289", projectId: null }),
    );
    await renderAppAt("/?account_section=clients");
    await screen.findByRole("heading", { name: /project hub/i });

    let lastReplace: string | undefined;
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, replace: (url: string) => { lastReplace = url; } },
    });
    try {
      fireEvent.click(screen.getByRole("button", { name: /start a new piece of work/i }));

      await waitFor(() => {
        expect(mockServerExitImpersonation).toHaveBeenCalledTimes(1);
        expect(lastReplace).toBe(
          `${import.meta.env.BASE_URL}?aio_exit_impersonation=1&account_section=billing`,
        );
      });
    } finally {
      Object.defineProperty(window, "location", { writable: true, value: originalLocation });
    }
  });

  it("also sends an agency-managed client to agency billing when project creation loses a capacity race", async () => {
    stubClientAppFetch({ agencyManagedClient: true, atLimit: false, pushLimitReached: true });
    mockServerExitImpersonation.mockResolvedValue({
      ok: true,
      session: { username: "acme-agency", role: "agency" },
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    sessionStorage.setItem(
      "aio:open-client-projects",
      JSON.stringify({ username: "client-289", projectId: null }),
    );
    await renderAppAt("/?account_section=clients");
    await screen.findByRole("heading", { name: /project hub/i });

    const originalLocation = window.location;
    let lastReplace: string | undefined;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, replace: (url: string) => { lastReplace = url; } },
    });
    try {
      fireEvent.click(screen.getByRole("button", { name: /start a new piece of work/i }));
      fireEvent.change(await screen.findByLabelText("Project name"), { target: { value: "Race Project" } });
      fireEvent.click(screen.getByRole("button", { name: /create & set up/i }));

      await waitFor(() => {
        expect(mockServerExitImpersonation).toHaveBeenCalledTimes(1);
        expect(lastReplace).toBe(
          `${import.meta.env.BASE_URL}?aio_exit_impersonation=1&account_section=billing`,
        );
      });
      expect(alertSpy).toHaveBeenCalledWith("Project allowance reached.");
    } finally {
      Object.defineProperty(window, "location", { writable: true, value: originalLocation });
    }
  });

  it("alerts and does not open client billing when returning to the agency fails", async () => {
    stubClientAppFetch({ agencyManagedClient: true, atLimit: true });
    mockServerExitImpersonation.mockResolvedValue({
      ok: false,
      error: "The agency session has expired.",
    });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    sessionStorage.setItem(
      "aio:open-client-projects",
      JSON.stringify({ username: "client-289", projectId: null }),
    );
    await renderAppAt("/?account_section=clients");
    await screen.findByRole("heading", { name: /project hub/i });

    fireEvent.click(screen.getByRole("button", { name: /start a new piece of work/i }));

    await waitFor(() => {
      expect(mockServerExitImpersonation).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith("The agency session has expired.");
    });
    expect(screen.queryByRole("heading", { name: /company and billing information/i })).toBeNull();
  });
});

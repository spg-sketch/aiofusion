// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, configure, act, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { Client } from "./types";

configure({ asyncUtilTimeout: 5000 });

type ResearchModule = {
  MediaResearchPage: () => ReactElement;
};
type DatabaseModule = {
  MediaDatabasePage: () => ReactElement;
};

let resolveResearchModule!: (module: ResearchModule) => void;
let resolveDatabaseModule!: (module: DatabaseModule) => void;
let researchModule: Promise<ResearchModule>;
let databaseModule: Promise<DatabaseModule>;

// Keep both destination chunks deliberately cold until each test step resolves
// them. This makes the shell/loading invariant observable rather than relying
// on a fast local dynamic import.
vi.mock("./pages/MediaResearchPage", () => researchModule);
vi.mock("./pages/MediaDatabasePage", () => databaseModule);

vi.mock("./pages/PlatformHomePage", () => ({
  PlatformHomePage: ({
    session,
    onContinueToProjects,
    onGuidance,
  }: {
    session: { username: string } | null;
    onContinueToProjects: () => void;
    onGuidance: () => void;
  }) => (
    session
       ? <><button onClick={onContinueToProjects}>Continue to projects</button><button onClick={onGuidance}>Home Guidance</button></>
      : <div>Sign in</div>
  ),
}));

vi.mock("./pages/ClientSelectorPage", () => ({
  default: ({
    onSelectClient,
    onGuidance,
  }: {
    onSelectClient: (client: Client) => void;
    onGuidance: () => void;
  }) => (
    <><button onClick={onGuidance}>Hub Guidance</button><button
      onClick={() => onSelectClient({
        id: "project-1",
        name: "Test project",
        sector: "Technology",
        initials: "TP",
        color: "#123456",
        contentCount: 0,
        avgScore: 0,
        scoreTrend: 0,
        activePlans: 0,
        lastActive: "",
        recentActivity: "",
        owner: "acme-agency",
      })}
    >
      Open test project
    </button></>
  ),
}));

vi.mock("./pages/DashboardPage", () => ({
  DashboardPage: () => <div data-testid="dashboard-page">Existing dashboard page</div>,
}));

vi.mock("./pages/ContentCreatorPage", async () => {
  const { useEffect } = await import("react");
  return {
    ContentCreatorPage: ({
      registerUnsavedEditor,
    }: {
      registerUnsavedEditor?: (registration: {
        dirty: boolean;
        busy: boolean;
        save: () => Promise<{ ok: true }>;
      } | null) => void;
    }) => {
      useEffect(() => {
        registerUnsavedEditor?.({
          dirty: true,
          busy: false,
          save: async () => ({ ok: true }),
        });
        return () => registerUnsavedEditor?.(null);
      }, [registerUnsavedEditor]);
      return <div data-testid="dirty-creator">Dirty Creator editor</div>;
    },
  };
});

vi.mock("./lib/contentAi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/contentAi")>();
  return { ...mod, apiBase: () => "" };
});

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...original,
    useListPublishedHowto: () => ({
      data: [{ id: "fixture-guide", title: "Published fixture guide", type: "Guide", readTime: "3 min", description: "CMS guidance", body: [] }],
      isLoading: false, isError: false,
    }),
  };
});

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const project: Client = {
  id: "project-1",
  name: "Test project",
  sector: "Technology",
  initials: "TP",
  color: "#123456",
  contentCount: 0,
  avgScore: 0,
  scoreTrend: 0,
  activePlans: 0,
  lastActive: "",
  recentActivity: "",
  owner: "acme-agency",
};

beforeEach(() => {
  researchModule = new Promise((resolve) => {
    resolveResearchModule = resolve;
  });
  databaseModule = new Promise((resolve) => {
    resolveDatabaseModule = resolve;
  });

  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  });
  vi.stubGlobal("IntersectionObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    root = null; rootMargin = ""; thresholds = [];
  });
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", () => ({
      matches: false, media: "", onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }
  document.elementFromPoint = () => null;
  Element.prototype.scrollTo = () => {};

  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("aio.auth.session.v3", JSON.stringify({
    username: "acme-agency",
    role: "agency",
  }));
  localStorage.setItem("aio.projects.v1", JSON.stringify([project]));

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform/me")) {
      return makeResponse({
        account: { username: "acme-agency", role: "agency" },
        impersonating: null,
        setupComplete: true,
        hasPassword: true,
        emailVerified: true,
        masterOwner: false,
      });
    }
    if (url.includes("/api/store/projects")) {
      return makeResponse({ projects: [project], deletedIds: [] });
    }
    return makeResponse({ error: "unavailable" }, 404);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("Media Management sidebar navigation", () => {
  it("records mobile project entry and supports Back to the Hub without leaving the app", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 767px)", media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
      removeEventListener: () => {}, dispatchEvent: () => false,
    }));
    window.history.replaceState({}, "", "/platform");
    const { default: App } = await import("./App");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue to projects" }));
    await screen.findByRole("button", { name: "Open test project" });
    const hubState = window.history.state;
    expect(hubState.mobileProjectId).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open test project" }));
    await screen.findByTestId("dashboard-page");
    await waitFor(() => expect(window.history.state.mobileProjectId).toBe("project-1"));
    expect(window.history.state.__aioIndex).toBe(hubState.__aioIndex + 1);
    const back = within(screen.getByRole("navigation", { name: "Mobile workspace navigation" })).getByRole("button", { name: "Back" });
    expect(back).not.toBeDisabled();
    fireEvent.click(back);
    await screen.findByRole("button", { name: "Open test project" });
    expect(screen.queryByTestId("dashboard-page")).toBeNull();
    expect(window.location.pathname).toBe("/project-hub");
  });

  it("guards the mobile Project Hub button when the editor has unsaved work", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 767px)", media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
      removeEventListener: () => {}, dispatchEvent: () => false,
    }));
    window.history.replaceState({}, "", "/platform");
    const { default: App } = await import("./App");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue to projects" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open test project" }));
    await screen.findByTestId("dashboard-page");
    fireEvent.click(screen.getByRole("button", { name: /Content Creator.*Generate pitches and articles/i }));
    await screen.findByTestId("dirty-creator");
    const navigation = screen.getByRole("navigation", { name: "Mobile workspace navigation" });
    fireEvent.click(within(navigation).getByRole("button", { name: "Project Hub" }));
    await screen.findByRole("alertdialog", { name: /Save your changes before leaving/i });
    fireEvent.click(screen.getByRole("button", { name: /Stay on this page/i }));
    expect(screen.getByTestId("dirty-creator")).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Project Hub" }));
    fireEvent.click(await screen.findByRole("button", { name: /Leave without saving/i }));
    await screen.findByRole("button", { name: "Open test project" });
    expect(window.history.state.mobileProjectId).toBeNull();
  });

  it("does not add project-entry history to desktop", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
      removeEventListener: () => {}, dispatchEvent: () => false,
    }));
    window.history.replaceState({}, "", "/platform");
    const { default: App } = await import("./App");
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue to projects" }));
    await screen.findByRole("button", { name: "Open test project" });
    const hubState = window.history.state;
    fireEvent.click(screen.getByRole("button", { name: "Open test project" }));
    await screen.findByTestId("dashboard-page");
    expect(window.history.state.__aioIndex).toBe(hubState.__aioIndex);
    expect(window.history.state).not.toHaveProperty("mobileProjectId");
  });

  it("opens the real Guidance library from both platform entry points, direct URLs and Back", async () => {
    window.history.replaceState({}, "", "/platform");
    const { default: App } = await import("./App");
    const mounted = render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue to projects" }));
    await waitFor(() => expect(window.location.pathname).toBe("/project-hub"));
    const hubState = window.history.state;
    fireEvent.click(screen.getByRole("button", { name: "Hub Guidance" }));
    expect(await screen.findByRole("heading", { name: "Guidance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Published fixture guide.*Read guide/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/guidance");
    act(() => {
      window.history.replaceState(hubState, "", "/project-hub");
      window.dispatchEvent(new PopStateEvent("popstate", { state: hubState }));
    });
    expect(await screen.findByRole("button", { name: "Hub Guidance" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hub Guidance" }));
    await screen.findByRole("heading", { name: "Guidance" });
    fireEvent.click(screen.getByTestId("button-back"));
    fireEvent.click(await screen.findByRole("button", { name: "Home Guidance" }));
    await screen.findByRole("heading", { name: "Guidance" });
    expect(window.location.pathname).toBe("/guidance");
    mounted.unmount();
    // Remount at the canonical URL models a refresh without cached route state.
    window.history.replaceState({}, "", "/guidance");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Guidance" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/guidance");
  });

  it("routes both cards and clears the old page while cold chunks load", async () => {
    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /continue to projects/i }));
    fireEvent.click(await screen.findByRole("button", { name: /open test project/i }));

    const researchCard = await screen.findByRole("button", {
      name: /Media Research.*Recommend journalists and publications/i,
    });
    const databaseCard = await screen.findByRole("button", {
      name: /Media Database.*Publications, journalists and custom categories/i,
    });

    fireEvent.click(researchCard);
    // Suspense may retain an already-mounted chunk as a hidden DOM subtree.
    expect(screen.queryByTestId("dashboard-page")).not.toBeVisible();
    expect(screen.getByRole("status", { name: /loading page/i })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: /Media Research.*Recommend journalists and publications/i,
    })).toBeInTheDocument();

    act(() => {
      resolveResearchModule({
        MediaResearchPage: () => <div data-testid="media-research-page">Media Research destination</div>,
      });
    });
    expect(await screen.findByTestId("media-research-page")).toBeInTheDocument();

    fireEvent.click(databaseCard);
    expect(screen.getByTestId("media-research-page")).not.toBeVisible();
    expect(screen.getByRole("status", { name: /loading page/i })).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: /Media Database.*Publications, journalists and custom categories/i,
    })).toBeInTheDocument();

    act(() => {
      resolveDatabaseModule({
        MediaDatabasePage: () => <div data-testid="media-database-page">Media Database destination</div>,
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId("media-database-page")).toBeInTheDocument();
    });
  });

  it("preserves the Back destination after Stay and reaches it on the next Back", async () => {
    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /continue to projects/i }));
    fireEvent.click(await screen.findByRole("button", { name: /open test project/i }));
    await screen.findByTestId("dashboard-page");
    const dashboardState = window.history.state;
    const dashboardUrl = window.location.href;

    fireEvent.click(screen.getByRole("button", {
      name: /Content Creator.*Generate pitches and articles/i,
    }));
    await screen.findByTestId("dirty-creator");
    await waitFor(() => expect(window.history.state?.currentPage).toBe("creator"));
    const creatorState = window.history.state;
    const creatorUrl = window.location.href;

    const go = vi.spyOn(window.history, "go").mockImplementation((delta?: number) => {
      const restoringCreator = Number(delta) > 0;
      window.history.replaceState(
        restoringCreator ? creatorState : dashboardState,
        "",
        restoringCreator ? creatorUrl : dashboardUrl,
      );
      queueMicrotask(() => {
        window.dispatchEvent(new PopStateEvent("popstate", {
          state: restoringCreator ? creatorState : dashboardState,
        }));
      });
    });
    const attemptBack = () => {
      window.history.replaceState(dashboardState, "", dashboardUrl);
      window.dispatchEvent(new PopStateEvent("popstate", { state: dashboardState }));
    };

    act(attemptBack);
    expect(await screen.findByRole("alertdialog", { name: /Save your changes before leaving/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Stay on this page/i }));
    expect(screen.getByTestId("dirty-creator")).toBeInTheDocument();
    expect(window.history.state).toEqual(creatorState);

    act(attemptBack);
    expect(await screen.findByRole("alertdialog", { name: /Save your changes before leaving/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Leave without saving/i }));
    await waitFor(() => expect(screen.getByTestId("dashboard-page")).toBeInTheDocument());
    expect(go).toHaveBeenCalledWith(1);
    expect(go).toHaveBeenCalledWith(-1);
  });
});
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, configure, act } from "@testing-library/react";
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
  }: {
    session: { username: string } | null;
    onContinueToProjects: () => void;
  }) => (
    session
      ? <button onClick={onContinueToProjects}>Continue to projects</button>
      : <div>Sign in</div>
  ),
}));

vi.mock("./pages/ClientSelectorPage", () => ({
  default: ({
    onSelectClient,
  }: {
    onSelectClient: (client: Client) => void;
  }) => (
    <button
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
    </button>
  ),
}));

vi.mock("./pages/DashboardPage", () => ({
  DashboardPage: () => <div data-testid="dashboard-page">Existing dashboard page</div>,
}));

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
    expect(screen.queryByTestId("dashboard-page")).toBeNull();
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
});
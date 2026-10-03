import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
const { loadServerAuditsForProjectMock } = vi.hoisted(() => ({
  loadServerAuditsForProjectMock: vi.fn(),
}));


// ---------------------------------------------------------------------------
// Mocks - must be declared before component import
// ---------------------------------------------------------------------------

vi.mock("../lib/apiHelpers", () => ({ apiBase: () => "" }));
vi.mock("../lib/contentStore", () => ({
  useContentStore: () => {},
  loadArchive: () => [],
  loadPlannerProjects: () => [],
}));
vi.mock("../LlmCheckPage", () => ({
  authorityIndexFor: (result: { score?: number }) => result.score ?? 0,
}));
vi.mock("../lib/auditSync", () => ({
  loadServerAuditsForProject: loadServerAuditsForProjectMock,
}));

beforeEach(() => {
  // Reset shared module mocks explicitly; restoring spies does not reset them.
  vi.resetAllMocks();
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
  loadServerAuditsForProjectMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import ClientSelectorPage from "./ClientSelectorPage";

const baseProps = {
  onSelectClient: () => {},
  clientLogos: {},
  onLogoUpdate: () => {},
  onBackToPlatformHome: () => {},
  onCreateProject: () => {},
  onArchivedProjects: () => {},
  onGuidance: () => {},
  onDeleteProject: () => {},
};

const agencySession = { username: "acme-agency", role: "agency" };

const project = {
  id: "proj-1",
  name: "Live Brand",
  sector: "Tech",
  initials: "LB",
  color: "#123456",
  contentCount: 0,
  avgScore: 0,
  scoreTrend: 0,
  activePlans: 0,
  lastActive: "Today",
  recentActivity: "Created",
  owner: "some-client",
} as any;

describe("ClientSelectorPage project-only hub", () => {
  it("uses the server allowance for a client beta: the first project is available and the second is not", async () => {
    vi.mocked(global.fetch).mockImplementation(async () =>
      new Response(JSON.stringify({
        packageCapacity: {
          billingSlug: "beta-client",
          kind: "client",
          access: "beta",
          included: 1,
          purchased: 0,
          reserved: 0,
          used: 0,
          remaining: 1,
          allowance: 1,
          overLimit: false,
        },
      }), { status: 200 }),
    );
    const { rerender } = render(
      <ClientSelectorPage
        {...baseProps}
        projects={[]}
        session={{ username: "beta-client", role: "client" }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /create your first project/i })).toBeEnabled());

    vi.mocked(global.fetch).mockImplementation(async () =>
      new Response(JSON.stringify({
        packageCapacity: {
          billingSlug: "beta-client",
          kind: "client",
          access: "beta",
          included: 1,
          purchased: 0,
          reserved: 1,
          used: 1,
          remaining: 0,
          allowance: 1,
          overLimit: false,
        },
      }), { status: 200 }),
    );
    rerender(
      <ClientSelectorPage
        {...baseProps}
        projects={[project]}
        session={{ username: "beta-client", role: "client" }}
      />,
    );
    await waitFor(() => expect(screen.getByText("Your beta trial includes 1 project. Upgrade your plan to add another.")).toBeTruthy());
    expect(screen.getByRole("button", { name: /project limit reached/i })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Live Brand" })).toBeTruthy();
  });

  it("keeps a paid client's purchased project slot available", async () => {
    vi.mocked(global.fetch).mockImplementation(async () =>
      new Response(JSON.stringify({
        packageCapacity: {
          billingSlug: "paid-client",
          kind: "client",
          access: "paid",
          included: 1,
          purchased: 1,
          reserved: 1,
          used: 1,
          remaining: 1,
          allowance: 2,
          overLimit: false,
        },
      }), { status: 200 }),
    );
    render(
      <ClientSelectorPage
        {...baseProps}
        projects={[project]}
        session={{ username: "paid-client", role: "client" }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /create project/i })).toBeEnabled());
  });

  it("uses the safe capacity endpoint for a content member who can create projects", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({
        packageCapacity: {
          billingSlug: "client-member",
          kind: "client",
          access: "paid",
          included: 1,
          purchased: 0,
          reserved: 0,
          used: 0,
          remaining: 1,
          allowance: 1,
          overLimit: false,
        },
      }), { status: 200 }),
    );
    render(
      <ClientSelectorPage
        {...baseProps}
        projects={[]}
        session={{ username: "client-member", role: "client", membershipRole: "content" }}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /create your first project/i })).toBeEnabled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/platform/billing/capacity"),
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });

  it("fails closed while allowance is pending, and ignores a stale session response", async () => {
    let releaseOld: (response: Response) => void = () => {};
    const oldResponse = new Promise<Response>((resolve) => { releaseOld = resolve; });
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockImplementationOnce(() => oldResponse);
    fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const { rerender } = render(
      <ClientSelectorPage
        {...baseProps}
        projects={[]}
        session={{ username: "old-client", role: "client" }}
      />,
    );
    expect(screen.getByRole("button", { name: /checking project allowance/i })).toBeDisabled();
    rerender(
      <ClientSelectorPage
        {...baseProps}
        projects={[]}
        session={{ username: "new-client", role: "client" }}
      />,
    );
    releaseOld(new Response(JSON.stringify({ projectsUsed: 0, projectAllowance: 1 }), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("button", { name: /checking project allowance/i })).toBeDisabled());
  });

  it("keeps projects visible when allowance loading fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 503 }));
    render(
      <ClientSelectorPage
        {...baseProps}
        projects={[project, { ...project, id: "proj-2", name: "Second Brand" }]}
        session={{ username: "client-with-error", role: "client" }}
      />,
    );
    await waitFor(() => expect(screen.getByText("Project allowance is unavailable. Refresh and try again.")).toBeTruthy());
    expect(screen.getByRole("heading", { name: "Live Brand" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Second Brand" })).toBeTruthy();
  });

  it("shows the plain empty state when the agency has no projects", () => {
    render(
      <ClientSelectorPage {...baseProps} projects={[]} session={agencySession} />,
    );
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.queryByText("Client account")).toBeNull();
  });

  it("shows the client's own first-project prompt when a client signs in with no projects", async () => {
    render(
      <ClientSelectorPage
        {...baseProps}
        projects={[]}
        session={{ username: "solo-client", role: "client" }}
      />,
    );
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(await screen.findByText(/Checking project allowance|Project allowance is unavailable/i)).toBeTruthy();
  });

  it("shows the latest server audit score without relying on browser storage", async () => {
    loadServerAuditsForProjectMock.mockResolvedValue([
      { id: "audit-1", savedAt: "2026-09-07T08:00:00.000Z", result: { score: 74 } },
    ]);

    render(<ClientSelectorPage {...baseProps} projects={[project]} session={agencySession} />);

    expect(screen.getByText("Loading score...")).toBeTruthy();
    expect(await screen.findByText("74")).toBeTruthy();
    expect(screen.queryByText("No audit yet")).toBeNull();
  });

  it("distinguishes an empty server history from a failed request", async () => {
    loadServerAuditsForProjectMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(null);
    const secondProject = { ...project, id: "proj-2", name: "Second Brand" };

    render(
      <ClientSelectorPage
        {...baseProps}
        projects={[project, secondProject]}
        session={agencySession}
      />,
    );

    expect(await screen.findByText("No audit yet")).toBeTruthy();
    expect(await screen.findByText("Score unavailable")).toBeTruthy();
  });

  it("sorts project cards alphabetically with project ID as a stable tie-breaker", async () => {
    const projects = [
      { ...project, id: "proj-z", name: "Zulu" },
      { ...project, id: "proj-b", name: "alpha" },
      { ...project, id: "proj-a", name: "Alpha" },
    ];

    render(<ClientSelectorPage {...baseProps} projects={projects} session={agencySession} />);
    await waitFor(() => expect(loadServerAuditsForProjectMock).toHaveBeenCalledTimes(3));

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Alpha", "alpha", "Zulu"]);
  });
});

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
  it("shows the plain empty state when the agency has no projects", () => {
    render(
      <ClientSelectorPage {...baseProps} projects={[]} session={agencySession} />,
    );
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.queryByText("Client account")).toBeNull();
  });

  it("shows the client's own first-project prompt when a client signs in with no projects", () => {
    render(
      <ClientSelectorPage
        {...baseProps}
        projects={[]}
        session={{ username: "solo-client", role: "client" }}
      />,
    );
    expect(screen.getByText("No projects yet")).toBeTruthy();
    expect(screen.getByText(/Create your first project/i)).toBeTruthy();
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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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
  loadSavedAudits: () => [],
  authorityIndexFor: () => 0,
}));

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
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
});

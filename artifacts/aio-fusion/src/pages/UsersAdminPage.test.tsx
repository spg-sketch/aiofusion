import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks - must be declared before component import
// ---------------------------------------------------------------------------

vi.mock("../lib/contentAi", () => ({ apiBase: () => "" }));
const mockLoadStoredProjects = vi.fn();
vi.mock("../lib/projectStore", () => ({ loadStoredProjects: () => mockLoadStoredProjects() }));
vi.mock("../lib/projectSync", () => ({ pushProjectMeta: async () => ({}) }));

// Plain vi.fn() - no tuple-style generic - avoids the Vitest 3.x incompatibility
// where forwarding unknown[] to a narrowly typed mock produces a "never" error.
// Return type is inferred from mockReturnValue calls.
const mockGetLocalUsers = vi.fn();
const mockGetPendingAccounts = vi.fn();
const mockServerImpersonate = vi.fn();

vi.mock("../lib/auth", () => ({
  getUsers: () => mockGetLocalUsers(),   // no args forwarding - getUsers takes none
  serverGetPendingAccounts: () => mockGetPendingAccounts(),
  serverGetMasterOwners: async () => ({ ok: true as const, usernames: [] }),
  serverAddUser: async () => ({ ok: true as const }),
  serverDeleteUser: async () => ({ ok: true as const }),
  serverChangePassword: async () => ({ ok: true as const }),
  serverResetMfa: async () => ({ ok: true as const }),
  serverAssignOwner: async () => ({ ok: true as const }),
  serverSetDisplayName: async () => ({ ok: true as const }),
  serverArchiveUser: async () => ({ ok: true as const }),
  serverChangeRole: async () => ({ ok: true as const }),
  serverSetSeatCap: async () => ({ ok: true as const }),
  serverGetAccountSessions: async () => ({ ok: true as const, sessions: [] }),
  serverRevokeSession: async () => ({ ok: true as const }),
  serverImpersonate: (...args: unknown[]) => mockServerImpersonate(...args),
  serverApproveAccount: async () => ({ ok: true as const }),
  serverRejectAccount: async () => ({ ok: true as const }),
  refreshAccountsCache: async () => {},
  canCreateSubAccounts: () => true,
  serverSetMasterOwner: async () => ({ ok: true as const }),
}));

// Silence fetch calls from the admin useEffects (token-usage, audit-locks).
beforeEach(() => {
  sessionStorage.clear();
  mockLoadStoredProjects.mockClear();
  mockGetLocalUsers.mockClear();
  mockGetPendingAccounts.mockClear();
  mockServerImpersonate.mockClear();
  mockLoadStoredProjects.mockReturnValue([]);
  mockServerImpersonate.mockResolvedValue({
    ok: true as const,
    session: { username: "x", role: "admin" as const },
  });
  mockGetPendingAccounts.mockResolvedValue({ ok: true as const, accounts: [] });
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ rows: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import { UsersAdminPage } from "./UsersAdminPage";
import type { User, Session } from "../lib/auth";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ADMIN_SESSION = { username: "admin", role: "admin" as const };

function mkUser(
  username: string,
  opts: { mfaEnabled?: boolean; archived?: boolean; parent?: string } = {},
): User {
  return {
    username,
    password: "",
    role: "agency" as const,
    createdAt: 0,
    // No displayName - accountLabel falls back to username, keeping text unique.
    mfaEnabled: opts.mfaEnabled ?? false,
    archived: opts.archived ?? false,
    ...(opts.parent ? { parent: opts.parent } : {}),
  };
}

function renderPage(users: User[]) {
  mockGetLocalUsers.mockReturnValue(users);
  render(
    <UsersAdminPage
      session={ADMIN_SESSION}
      onBack={() => {}}
      onAssignProjectOwner={async () => ({ ok: true })}
    />,
  );
}

// ---------------------------------------------------------------------------
// 1. Top-level filter tests
// ---------------------------------------------------------------------------

describe("UsersAdminPage - workspace lists do not imply personal MFA", () => {
  it("shows all top-level users when filter is off", async () => {
    renderPage([
      mkUser("alice", { mfaEnabled: true }),
      mkUser("bob"),
      mkUser("carol", { mfaEnabled: true, archived: true }),
      mkUser("dave", { archived: true }),
    ]);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.getByText("bob")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getByText("dave")).toBeInTheDocument();
  });

  it("does not expose workspace MFA badges or filters even with stale cached MFA metadata", async () => {
    renderPage([
      mkUser("alice", { mfaEnabled: true }),
      mkUser("bob"),
      mkUser("carol", { mfaEnabled: true, archived: true }),
      mkUser("dave", { archived: true }),
    ]);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /only without 2fa/i })).not.toBeInTheDocument();
    expect(screen.queryByText("2FA on")).not.toBeInTheDocument();
    expect(screen.getByText(/Two-factor authentication belongs to each person/)).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getByText("dave")).toBeInTheDocument();
  });

  it("keeps active workspace rows regardless of cached MFA", async () => {
    renderPage([
      mkUser("alice", { mfaEnabled: true }),
      mkUser("dave", { archived: true }),
    ]);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    expect(screen.queryByText(/no active agency accounts/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    expect(screen.getByText("dave")).toBeInTheDocument();
  });

  it("keeps archived workspace rows regardless of cached MFA", async () => {
    renderPage([
      mkUser("bob"),
      mkUser("carol", { mfaEnabled: true, archived: true }),
    ]);

    await waitFor(() => expect(screen.getByText("bob")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.queryByText(/no archived accounts match these filters/i)).not.toBeInTheDocument();
  });

  it("does not expose workspace MFA reset actions", async () => {
    renderPage([mkUser("alice", { mfaEnabled: true }), mkUser("bob")]);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    fireEvent.click(screen.getAllByTitle("More actions")[0]);
    expect(screen.queryByRole("button", { name: /reset two-factor/i })).not.toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Nested account filter tests - same-section children
// ---------------------------------------------------------------------------

describe("UsersAdminPage - nested workspaces ignore cached MFA", () => {
  it("keeps a parent and child that both have old workspace MFA metadata", async () => {
    renderPage([
      mkUser("parent", { mfaEnabled: true }),
      mkUser("child", { mfaEnabled: true, parent: "parent" }),
    ]);

    await waitFor(() => expect(screen.getByText("parent")).toBeInTheDocument());
    expect(screen.getByText("parent")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("keeps a nested child independently of the parent's old MFA metadata", async () => {
    renderPage([
      mkUser("parent"),
      mkUser("child", { mfaEnabled: true, parent: "parent" }),
    ]);

    await waitFor(() => expect(screen.getByText("child")).toBeInTheDocument());
    expect(screen.getByText("parent")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("keeps an mfaEnabled parent visible when it has a non-mfaEnabled child (ancestor context)", async () => {
    renderPage([
      mkUser("parent", { mfaEnabled: true }),
      mkUser("child", { parent: "parent" }),
    ]);

    await waitFor(() => expect(screen.getByText("parent")).toBeInTheDocument());

    expect(screen.getByText("parent")).toBeInTheDocument(); // kept for ancestor context
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("places an archived child of a non-archived parent in the archived section", async () => {
    renderPage([
      mkUser("parent"),
      mkUser("archivedchild", { archived: true, parent: "parent" }),
    ]);

    await waitFor(() => expect(screen.getByText("parent")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    // The archived child appears in the archived section.
    expect(screen.getByText("archivedchild")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /only without 2fa/i })).not.toBeInTheDocument();
    expect(screen.getByText("archivedchild")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Hierarchy visibility - archived parent with active child
// ---------------------------------------------------------------------------

describe("UsersAdminPage - hierarchy: archived parent / active child", () => {
  it("shows an active child of an archived parent in the ACTIVE section", async () => {
    renderPage([
      mkUser("archivedparent", { archived: true }),
      mkUser("activechild", { parent: "archivedparent" }),
    ]);

    await waitFor(() => expect(screen.getByText("activechild")).toBeInTheDocument());
    // activechild is non-archived so it must be in the active section.
    expect(screen.getByText("activechild")).toBeInTheDocument();
    expect(screen.queryByText("archivedparent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    // archivedparent is archived and appears in the dedicated archived view.
    expect(screen.getByText("archivedparent")).toBeInTheDocument();
  });

  it("active orphan remains in the active section regardless of cached MFA", async () => {
    renderPage([
      mkUser("archivedparent", { archived: true, mfaEnabled: true }),
      mkUser("activechild", { parent: "archivedparent" }),
    ]);

    await waitFor(() => expect(screen.getByText("activechild")).toBeInTheDocument());
    expect(screen.getByText("activechild")).toBeInTheDocument();
    // Archived parent is not in the active view.
    expect(screen.queryByText("archivedparent")).not.toBeInTheDocument();
  });

  it("archived parents remain in their own section regardless of cached MFA", async () => {
    renderPage([
      mkUser("archivedparent", { archived: true, mfaEnabled: true }),
      mkUser("activechild", { parent: "archivedparent" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    await waitFor(() => expect(screen.getByText("archivedparent")).toBeInTheDocument());
    expect(screen.getByText("archivedparent")).toBeInTheDocument();
    expect(screen.queryByText("activechild")).not.toBeInTheDocument();
  });

  it("deeper mixed chain: active → archived → active (each in its own section)", async () => {
    // A (active) → B (archived) → C (active)
    renderPage([
      mkUser("a"),
      mkUser("b", { archived: true, parent: "a" }),
      mkUser("c", { parent: "b" }),
    ]);

    await waitFor(() => expect(screen.getByText("a")).toBeInTheDocument());

    // Active descendants stay in the active view, even across an archived link.
    expect(screen.getByText("c")).toBeInTheDocument();
    expect(screen.queryByText("b")).not.toBeInTheDocument();

    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("c")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    expect(screen.getByText("b")).toBeInTheDocument();
  });
});

describe("UsersAdminPage - URL-backed section prop", () => {
  it("shows the outstanding support ticket count in navigation", async () => {
    mockGetLocalUsers.mockReturnValue([]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("summary=outstanding")
        ? { outstandingCount: 3 }
        : { rows: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <UsersAdminPage
        session={ADMIN_SESSION}
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
        onSupportAdmin={() => {}}
      />,
    );

    expect(await screen.findAllByRole("button", { name: "Support (3 tickets outstanding)" })).toHaveLength(2);
  });

  it("opens usage directly and responds when browser history changes the prop", async () => {
    mockGetLocalUsers.mockReturnValue([]);
    const props = {
      session: ADMIN_SESSION,
      onBack: () => {},
      onAssignProjectOwner: async () => ({ ok: true }),
    };
    const { rerender } = render(<UsersAdminPage {...props} initialSection="usage" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Token & AI Usage" })).toBeInTheDocument();
    });

    rerender(<UsersAdminPage {...props} initialSection="beta" />);
    expect(screen.getByRole("heading", { name: "Beta Participants" })).toBeInTheDocument();
  });

  it("keeps legacy pending-account recovery available under System Audit", async () => {
    mockGetLocalUsers.mockReturnValue([]);
    mockGetPendingAccounts.mockResolvedValue({
      ok: true as const,
      accounts: [{
        username: "legacy-client",
        email: "legacy@example.com",
        website: "https://example.com",
        displayName: "Legacy Client",
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
    });
    render(
      <UsersAdminPage
        session={ADMIN_SESSION}
        initialSection="audit"
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
      />,
    );

    await waitFor(() => expect(screen.getByText("Legacy Client")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Approve legacy account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("keeps active Master accounts visible and manageable", async () => {
    mockGetLocalUsers.mockReturnValue([
      { ...mkUser("admin"), role: "admin" },
      { ...mkUser("second-master"), role: "admin" },
    ]);
    render(
      <UsersAdminPage
        session={ADMIN_SESSION}
        initialSection="masters"
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
      />,
    );

    expect(screen.getByText("second-master")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View account" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "More actions" }).length).toBeGreaterThan(0);
  });

  it("stashes an account's sole project so View account opens it directly", async () => {
    mockGetLocalUsers.mockReturnValue([
      { ...mkUser("admin"), role: "admin" },
      { ...mkUser("client-one"), role: "client" },
    ]);
    mockLoadStoredProjects.mockReturnValue([
      { id: "project-one", name: "Project One", owner: "client-one" },
    ]);
    render(
      <UsersAdminPage
        session={ADMIN_SESSION}
        initialSection="clients"
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View account" }));
    await waitFor(() => expect(mockServerImpersonate).toHaveBeenCalledWith("client-one"));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
      username: "client-one",
      projectId: "project-one",
    });
  });

  it.each([
    ["no projects", []],
    ["multiple projects", [
      { id: "project-one", name: "Project One", owner: "client-one" },
      { id: "project-two", name: "Project Two", owner: "client-one" },
    ]],
  ])("writes a hub handoff with a null projectId for %s", async (_label, projects) => {
    mockGetLocalUsers.mockReturnValue([
      { ...mkUser("admin"), role: "admin" },
      { ...mkUser("client-one"), role: "client" },
    ]);
    mockLoadStoredProjects.mockReturnValue(projects);
    render(
      <UsersAdminPage
        session={ADMIN_SESSION}
        initialSection="clients"
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View account" }));
    await waitFor(() => expect(mockServerImpersonate).toHaveBeenCalledWith("client-one"));
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
        username: "client-one",
        projectId: null,
      });
    });
  });

  it("reconciles a response-lost View account switch before writing the handoff", async () => {
    sessionStorage.setItem("aio:master-account-return", JSON.stringify({ section: "agencies" }));
    sessionStorage.setItem("aio:open-client-projects", JSON.stringify({ username: "old-client", projectId: "old-project" }));
    mockGetLocalUsers.mockReturnValue([
      { ...mkUser("admin"), role: "admin" },
      { ...mkUser("client-one"), role: "client" },
    ]);
    mockLoadStoredProjects.mockReturnValue([]);
    mockServerImpersonate.mockRejectedValueOnce(new Error("Response lost after switch"));
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/api/platform/me")) {
        return new Response(JSON.stringify({
          account: { username: "client-one" },
          impersonating: { by: "admin" },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <UsersAdminPage
        session={ADMIN_SESSION}
        initialSection="clients"
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View account" }));

    await waitFor(() => expect(mockServerImpersonate).toHaveBeenCalledOnce());
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem("aio:master-account-return")!)).toEqual({ section: "clients" });
      expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
        username: "client-one",
        projectId: null,
      });
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps an unavailable View account reconciliation retryable before another impersonation", async () => {
    mockGetLocalUsers.mockReturnValue([
      { ...mkUser("admin"), role: "admin" },
      { ...mkUser("client-one"), role: "client" },
    ]);
    mockLoadStoredProjects.mockReturnValue([]);
    mockServerImpersonate.mockRejectedValueOnce(new Error("Response lost after switch"));
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/api/platform/me")) return new Response("", { status: 503 });
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });

    render(
      <UsersAdminPage
        session={ADMIN_SESSION}
        initialSection="clients"
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "View account" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Response lost after switch"));
    expect(sessionStorage.getItem("aio:open-client-projects")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry view account" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not confirm the account switch"));
    expect(mockServerImpersonate).toHaveBeenCalledOnce();

    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes("/api/platform/me")) {
        return new Response(JSON.stringify({ account: { username: "admin" }, impersonating: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry view account" }));
    await waitFor(() => expect(mockServerImpersonate).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
        username: "client-one",
        projectId: null,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Project-row delete action
// ---------------------------------------------------------------------------

type DeleteProjectResult = { ok: boolean; error?: string };

function renderProjectDeletePage(
  projects: Array<Record<string, unknown>>,
  session: Session = ADMIN_SESSION,
  onDeleteProject?: (id: string) => Promise<DeleteProjectResult>,
) {
  mockGetLocalUsers.mockReturnValue([mkUser("client-one")]);
  mockLoadStoredProjects.mockReturnValue(projects);
  return render(
    <UsersAdminPage
      session={session}
      initialSection="agencies"
      onBack={() => {}}
      onAssignProjectOwner={async () => ({ ok: true })}
      onDeleteProject={onDeleteProject}
    />,
  );
}

async function openProjectDeleteMenu(name: string, id: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: `Project actions for ${name} (${id})` }), {
    key: "ArrowDown",
  });
  return screen.findByRole("menuitem", { name: "Delete project" });
}

describe("UsersAdminPage - project-row delete action", () => {
  it("binds duplicate project names to the exact row id and includes name, website, id, and Master Admin in confirmation", async () => {
    const onDeleteProject = vi.fn().mockResolvedValue({ ok: true as const });
    const projects = [
      { id: "project-a", name: "Same Name", website: "first.example", owner: "client-one" },
      { id: "project-b", name: "Same Name", website: "second.example", owner: "client-one" },
    ];
    renderProjectDeletePage(projects, ADMIN_SESSION, onDeleteProject);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(await openProjectDeleteMenu("Same Name", "project-b"));

    await waitFor(() => expect(onDeleteProject).toHaveBeenCalledWith("project-b"));
    expect(onDeleteProject).toHaveBeenCalledOnce();
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Delete project "Same Name" from the Master Admin account?'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Website: second.example"));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("ID: project-b"));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("All accounts and other projects will be untouched."));
  });

  it("uses the production namespaced intake aiWebsite in the confirmation", async () => {
    const projectId = "production-shaped-project";
    localStorage.setItem(`aio.intake.v2::${projectId}`, JSON.stringify({
      formData: {
        "4.1": "Production Company",
        "6.2": "https://homepage.example",
      },
      duals: {},
      dualLists: {},
      stringLists: {},
      spokespeople: [],
      products: [],
      productQueries: [],
      businessCategories: [],
      audienceCategories: [],
      mediaCategories: [],
      intakeStatus: "Accepted",
      acceptedAt: "2026-01-01T00:00:00.000Z",
      aiWebsite: "https://canonical.example",
      confirmedEntity: null,
    }));
    try {
      const onDeleteProject = vi.fn().mockResolvedValue({ ok: true as const });
      renderProjectDeletePage([
        { id: projectId, name: "Production Company", owner: "client-one" },
      ], ADMIN_SESSION, onDeleteProject);
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      fireEvent.click(await openProjectDeleteMenu("Production Company", projectId));

      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Website: https://canonical.example"));
      expect(confirmSpy).not.toHaveBeenCalledWith(expect.stringContaining("Website: https://homepage.example"));
      expect(onDeleteProject).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(`aio.intake.v2::${projectId}`);
    }
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const onDeleteProject = vi.fn().mockResolvedValue({ ok: true as const });
    renderProjectDeletePage([
      { id: "cancel-project", name: "Cancel Me", owner: "client-one" },
    ], ADMIN_SESSION, onDeleteProject);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    fireEvent.click(await openProjectDeleteMenu("Cancel Me", "cancel-project"));

    expect(onDeleteProject).not.toHaveBeenCalled();
    expect(screen.queryByRole("menuitem", { name: "Delete project" })).not.toBeInTheDocument();
    expect(screen.getByText("Projects (1)")).toBeInTheDocument();
  });

  it("rereads project rows and counts after the parent removes the project successfully", async () => {
    let projects: Array<Record<string, unknown>> = [
      { id: "remove-project", name: "Remove Me", owner: "client-one" },
      { id: "keep-project", name: "Keep Me", owner: "client-one" },
    ];
    const onDeleteProject = vi.fn(async (id: string) => {
      projects = projects.filter((project) => project.id !== id);
      return { ok: true as const };
    });
    renderProjectDeletePage(projects, ADMIN_SESSION, onDeleteProject);
    mockLoadStoredProjects.mockImplementation(() => projects);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(await openProjectDeleteMenu("Remove Me", "remove-project"));

    await waitFor(() => expect(screen.getByText("Projects (1)")).toBeInTheDocument());
    expect(screen.getByText("Keep Me")).toBeInTheDocument();
    expect(screen.queryByText("Remove Me")).not.toBeInTheDocument();
    expect(onDeleteProject).toHaveBeenCalledWith("remove-project");
  });

  it("shows a retryable row error and retries the same project id", async () => {
    let projects: Array<Record<string, unknown>> = [
      { id: "retry-project", name: "Retry Me", owner: "client-one" },
    ];
    const onDeleteProject = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, error: "Server refused the deletion." })
      .mockImplementationOnce(async (id: string) => {
        projects = projects.filter((project) => project.id !== id);
        return { ok: true as const };
      });
    renderProjectDeletePage(projects, ADMIN_SESSION, onDeleteProject);
    mockLoadStoredProjects.mockImplementation(() => projects);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(await openProjectDeleteMenu("Retry Me", "retry-project"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Server refused the deletion."));

    fireEvent.click(screen.getByRole("button", { name: "Retry deleting project Retry Me" }));

    await waitFor(() => expect(screen.queryByText("Projects (1)")).not.toBeInTheDocument());
    expect(onDeleteProject).toHaveBeenNthCalledWith(2, "retry-project");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("locks duplicate submissions while the parent request is pending", async () => {
    let resolveDelete!: (result: DeleteProjectResult) => void;
    const onDeleteProject = vi.fn().mockImplementation(() => new Promise<DeleteProjectResult>((resolve) => {
      resolveDelete = resolve;
    }));
    renderProjectDeletePage([
      { id: "pending-project", name: "Pending Me", owner: "client-one" },
    ], ADMIN_SESSION, onDeleteProject);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(await openProjectDeleteMenu("Pending Me", "pending-project"));
    await waitFor(() => expect(onDeleteProject).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("Deleting project");

    const pendingActionTrigger = screen.getByRole("button", { name: "Project actions for Pending Me (pending-project)" });
    expect(pendingActionTrigger).toBeDisabled();
    fireEvent.click(pendingActionTrigger);
    expect(onDeleteProject).toHaveBeenCalledOnce();

    resolveDelete({ ok: false, error: "Try again." });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try again."));
  });

  const protectedSessionFixtures: Array<[string, Session]> = [
    ["viewer membership", { ...ADMIN_SESSION, membershipRole: "viewer" as const }],
    ["billing membership", { ...ADMIN_SESSION, membershipRole: "billing" as const }],
    ["admin membership", { ...ADMIN_SESSION, membershipRole: "admin" as const }],
    ["content membership", { ...ADMIN_SESSION, membershipRole: "content" as const }],
    ["non-admin session", { username: "client-one", role: "agency" as const }],
    ["project not in projectAccess", { ...ADMIN_SESSION, projectAccess: ["another-project"] }],
  ];

  it.each(protectedSessionFixtures)("hides project delete actions for %s", async (_label, session) => {
    const onDeleteProject = vi.fn().mockResolvedValue({ ok: true as const });
    renderProjectDeletePage([
      { id: "protected-project", name: "Protected", owner: "client-one" },
    ], session, onDeleteProject);

    await waitFor(() => expect(screen.getByText("Protected")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Project actions for Protected/ })).not.toBeInTheDocument();
    expect(onDeleteProject).not.toHaveBeenCalled();
  });

  it("resets pending state on a workspace switch and ignores a late result from the old workspace", async () => {
    let resolveOldDelete!: (result: DeleteProjectResult) => void;
    const onDeleteProject = vi.fn()
      .mockImplementationOnce(() => new Promise<DeleteProjectResult>((resolve) => {
        resolveOldDelete = resolve;
      }))
      .mockResolvedValue({ ok: true as const });
    let projects: Array<Record<string, unknown>> = [
      { id: "old-project", name: "Old Workspace Project", owner: "client-one" },
    ];
    const workspaceOneSession: Session = { ...ADMIN_SESSION, companyName: "Workspace One" };
    const firstRender = renderProjectDeletePage(
      projects,
      workspaceOneSession,
      onDeleteProject,
    );
    mockLoadStoredProjects.mockImplementation(() => projects);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    fireEvent.click(await openProjectDeleteMenu("Old Workspace Project", "old-project"));
    await waitFor(() => expect(onDeleteProject).toHaveBeenCalledOnce());

    projects = [{ id: "new-project", name: "New Workspace Project", owner: "client-one" }];
    firstRender.rerender(
      <UsersAdminPage
        session={{ ...ADMIN_SESSION, companyName: "Workspace Two" }}
        initialSection="agencies"
        onBack={() => {}}
        onAssignProjectOwner={async () => ({ ok: true })}
        onDeleteProject={onDeleteProject}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("New Workspace Project")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    resolveOldDelete({ ok: false, error: "Old workspace response." });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    // The reset also releases the old synchronous lock, so the new workspace
    // can submit its own project without waiting for the stale request.
    fireEvent.click(await openProjectDeleteMenu("New Workspace Project", "new-project"));
    await waitFor(() => expect(onDeleteProject).toHaveBeenCalledWith("new-project"));
    expect(onDeleteProject).toHaveBeenCalledTimes(2);
  });
});

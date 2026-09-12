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
import type { User } from "../lib/auth";

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

describe("UsersAdminPage - 2FA filter: top-level accounts", () => {
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

  it("hides mfaEnabled top-level users in both sections when filter is on", async () => {
    renderPage([
      mkUser("alice", { mfaEnabled: true }),
      mkUser("bob"),
      mkUser("carol", { mfaEnabled: true, archived: true }),
      mkUser("dave", { archived: true }),
    ]);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

    expect(screen.queryByText("alice")).not.toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    expect(screen.queryByText("carol")).not.toBeInTheDocument();
    expect(screen.getByText("dave")).toBeInTheDocument();
  });

  it("shows empty-state in active section when all active accounts have 2FA", async () => {
    renderPage([
      mkUser("alice", { mfaEnabled: true }),
      mkUser("dave", { archived: true }),
    ]);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

    expect(screen.getByText(/no active agency accounts/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    expect(screen.getByText("dave")).toBeInTheDocument();
  });

  it("shows empty-state in archived section when all archived accounts have 2FA", async () => {
    renderPage([
      mkUser("bob"),
      mkUser("carol", { mfaEnabled: true, archived: true }),
    ]);

    await waitFor(() => expect(screen.getByText("bob")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

    expect(screen.getByText(/no archived accounts match these filters/i)).toBeInTheDocument();
  });

  it("restores all accounts when the filter is toggled off again", async () => {
    renderPage([mkUser("alice", { mfaEnabled: true }), mkUser("bob")]);

    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));
    expect(screen.queryByText("alice")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /without 2fa \(on\)/i }));
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Nested account filter tests - same-section children
// ---------------------------------------------------------------------------

describe("UsersAdminPage - 2FA filter: nested accounts", () => {
  it("hides a nested mfaEnabled child when both parent and child have mfaEnabled", async () => {
    renderPage([
      mkUser("parent", { mfaEnabled: true }),
      mkUser("child", { mfaEnabled: true, parent: "parent" }),
    ]);

    await waitFor(() => expect(screen.getByText("parent")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

    expect(screen.queryByText("parent")).not.toBeInTheDocument();
    expect(screen.queryByText("child")).not.toBeInTheDocument();
  });

  it("hides a nested mfaEnabled child even when the parent has no mfaEnabled", async () => {
    renderPage([
      mkUser("parent"),
      mkUser("child", { mfaEnabled: true, parent: "parent" }),
    ]);

    await waitFor(() => expect(screen.getByText("child")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

    expect(screen.getByText("parent")).toBeInTheDocument();   // parent passes directly
    expect(screen.queryByText("child")).not.toBeInTheDocument(); // child has mfaEnabled
  });

  it("keeps an mfaEnabled parent visible when it has a non-mfaEnabled child (ancestor context)", async () => {
    renderPage([
      mkUser("parent", { mfaEnabled: true }),
      mkUser("child", { parent: "parent" }),
    ]);

    await waitFor(() => expect(screen.getByText("parent")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

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
    // With filter on, archived child (no mfa) stays visible.
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));
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

  it("active orphan appears in active section with filter on when it has no mfaEnabled", async () => {
    renderPage([
      mkUser("archivedparent", { archived: true, mfaEnabled: true }),
      mkUser("activechild", { parent: "archivedparent" }),
    ]);

    await waitFor(() => expect(screen.getByText("activechild")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

    // activechild passes the active-section filter (no mfa).
    expect(screen.getByText("activechild")).toBeInTheDocument();
    // archivedparent has mfa and NO archived descendants without mfa → hidden in archived section.
    expect(screen.queryByText("archivedparent")).not.toBeInTheDocument();
  });

  it("archived parent with mfaEnabled does NOT appear in archived section due to active child (no cross-boundary propagation)", async () => {
    // The archived parent has mfaEnabled; its only child is active (not archived).
    // The archived-section filter must NOT include archivedparent just because
    // activechild passes the active filter - that would be misleading.
    renderPage([
      mkUser("archivedparent", { archived: true, mfaEnabled: true }),
      mkUser("activechild", { parent: "archivedparent" }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Archived accounts" }));
    await waitFor(() => expect(screen.getByText("archivedparent")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));

    expect(screen.queryByText("archivedparent")).not.toBeInTheDocument();
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

    // With filter on: none have mfaEnabled so all remain visible.
    fireEvent.click(screen.getByRole("button", { name: /only without 2fa/i }));
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
      projectId: "project-one",
    });
  });
});

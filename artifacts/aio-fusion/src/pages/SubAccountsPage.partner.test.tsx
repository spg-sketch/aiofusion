/**
 * Agency partner client rows and create form.
 *
 * Agency (role "agency") sessions manage their clients entirely on their
 * behalf: client rows show only "Client projects" + Archive + Delete (no
 * password, no access controls, no Managed badge), and the create form has
 * no password field or managed checkbox - accounts are always managed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks - must be declared before component import
// ---------------------------------------------------------------------------

vi.mock("../lib/apiHelpers", () => ({ apiBase: () => "" }));
vi.mock("../lib/projectStore", () => ({
  loadStoredProjects: () => [
    { id: "proj-1", name: "Client One Project", owner: "client-one" },
  ],
}));
vi.mock("../lib/projectSync", () => ({ pushProjectMeta: async () => ({}) }));
vi.mock("../lib/accountLabels", () => ({ accountLabel: (u: { username: string }) => u.username }));

vi.mock("./TeamSection", () => ({
  TeamSection: () => <div data-testid="team-section">Team section</div>,
}));
vi.mock("../components/AccountSecurityCard", () => ({
  AccountSecurityCard: () => <div data-testid="security-card">Security card</div>,
}));
vi.mock("../components/BillingDetailsCard", () => ({
  BillingDetailsCard: () => <div data-testid="billing-card">Billing card</div>,
}));

const serverAddUser = vi.fn(async () => ({ ok: true as const, username: "new-client" }));
const serverImpersonate = vi.fn(async () => ({ ok: true as const }));

vi.mock("../lib/auth", () => ({
  getSubAccounts: () => [
    { username: "client-one", role: "client", parent: "acme-agency", managed: true },
    { username: "client-two", role: "client", parent: "acme-agency", managed: false },
  ],
  serverAddUser: (...args: unknown[]) => serverAddUser(...(args as [])),
  serverDeleteUser: async () => ({ ok: true as const }),
  serverChangePassword: async () => ({ ok: true as const }),
  serverAssignOwner: async () => ({ ok: true as const }),
  serverSetDisplayName: async () => ({ ok: true as const }),
  serverArchiveUser: async () => ({ ok: true as const }),
  serverSetSeatCap: async () => ({ ok: true as const }),
  refreshAccountsCache: async () => {},
  serverImpersonate: (...args: unknown[]) => serverImpersonate(...(args as [])),
  serverSwitchToMaster: async () => ({ ok: true as const }),
  serverChangeAccountType: async () => ({ ok: true as const }),
  serverSetClientAccess: async () => ({ ok: true as const }),
  canCreateSubAccounts: (role: string) => role === "agency" || role === "admin",
}));

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({}), { status: 404 }),
  );
  serverAddUser.mockClear();
  serverImpersonate.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import { SubAccountsPage } from "./SubAccountsPage";

const baseProps = {
  onBack: () => {},
  onAssignProjectOwner: () => {},
  onSignOut: () => {},
};

const agencySession = { username: "acme-agency", role: "agency" as const };

function openClientsSection() {
  render(<SubAccountsPage {...baseProps} session={agencySession as any} />);
  fireEvent.click(screen.getAllByRole("button", { name: /client accounts/i })[0]);
}

describe("agency partner client rows", () => {
  it("shows only Client projects / Archive / Delete - no password or access controls", () => {
    openClientsSection();
    // Both rows (managed and previously-passworded) get the same buttons.
    expect(screen.getAllByRole("button", { name: /client projects/i }).length).toBe(2);
    expect(screen.queryByRole("button", { name: /change password/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /login as client/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open account/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /give client access/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove client access/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mark as managed/i })).toBeNull();
    // No Managed badge either - it's implied for every partner client.
    expect(screen.queryByText(/^managed$/i)).toBeNull();
    expect(screen.getAllByRole("button", { name: /archive/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /delete/i }).length).toBeGreaterThan(0);
  });

  it("Client projects stashes the sole project id and impersonates", async () => {
    openClientsSection();
    const buttons = screen.getAllByRole("button", { name: /client projects/i });
    fireEvent.click(buttons[0]); // client-one owns exactly one project
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-one"));
    const raw = sessionStorage.getItem("aio:open-client-projects");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ projectId: "proj-1" });
  });

  it("Client projects stashes projectId null when the client has no or many projects", async () => {
    openClientsSection();
    const buttons = screen.getAllByRole("button", { name: /client projects/i });
    fireEvent.click(buttons[1]); // client-two owns no projects
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-two"));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({ projectId: null });
  });
});

describe("agency partner create-client form", () => {
  it("has no password field and no managed checkbox", () => {
    openClientsSection();
    expect(screen.getByText("Create a client account")).toBeTruthy();
    expect(screen.queryByText(/^password$/i)).toBeNull();
    expect(screen.queryByText(/managed account/i)).toBeNull();
    // Partner-specific footnote instead.
    expect(screen.getByText(/there's no password to share/i)).toBeTruthy();
  });

  it("always creates the client as managed", async () => {
    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "New Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "newclient.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /add client/i }));
    await vi.waitFor(() => expect(serverAddUser).toHaveBeenCalled());
    const [, password, role, , opts] = serverAddUser.mock.calls[0] as unknown as [
      string, string, string, string, Record<string, unknown>,
    ];
    expect(password).toBe("");
    expect(role).toBe("client");
    expect(opts.managed).toBe(true);
  });
});

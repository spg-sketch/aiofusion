/**
 * Agency partner client rows and create form.
 *
 * Agency (role "agency") sessions manage their clients entirely on their
 * behalf: client rows show direct project actions + Archive + Delete (no
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
const serverSetDisplayName = vi.fn(async () => ({ ok: true as const }));
const serverSetClientAccess = vi.fn(async () => ({ ok: true as const }));
const getSubAccounts = vi.fn();

const partnerClientRows = [
  { username: "client-one", role: "client", parent: "acme-agency", managed: true, agencyManaged: true },
  { username: "client-two", role: "client", parent: "acme-agency", managed: false },
];

vi.mock("../lib/auth", () => ({
  getSubAccounts: (...args: unknown[]) => getSubAccounts(...(args as [])),
  serverAddUser: (...args: unknown[]) => serverAddUser(...(args as [])),
  serverDeleteUser: async () => ({ ok: true as const }),
  serverChangePassword: async () => ({ ok: true as const }),
  serverAssignOwner: async () => ({ ok: true as const }),
  serverSetDisplayName: (...args: unknown[]) => serverSetDisplayName(...(args as [])),
  serverArchiveUser: async () => ({ ok: true as const }),
  serverSetSeatCap: async () => ({ ok: true as const }),
  refreshAccountsCache: async () => {},
  serverImpersonate: (...args: unknown[]) => serverImpersonate(...(args as [])),
  serverSwitchToMaster: async () => ({ ok: true as const }),
  serverChangeAccountType: async () => ({ ok: true as const }),
   serverSetClientAccess: (...args: unknown[]) => serverSetClientAccess(...(args as [])),
  canCreateSubAccounts: (role: string) => role === "agency" || role === "admin",
}));

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({}), { status: 404 }),
  );
  serverAddUser.mockClear();
  serverImpersonate.mockClear();
   serverSetClientAccess.mockClear();
  getSubAccounts.mockReturnValue(partnerClientRows);
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
  fireEvent.click(screen.getAllByRole("button", { name: /^clients$/i })[0]);
}

describe("agency partner client rows", () => {
  it("presents managed clients with direct project actions and no login status or credential controls", () => {
    openClientsSection();
    expect(screen.getAllByRole("button", { name: /^go to client$/i })).toHaveLength(2);
    expect(screen.queryByText(/never signed in/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /change password/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /login as client/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /open account/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /give client access/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove client access/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mark as managed/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /resend welcome email/i })).toBeNull();
    // No Managed badge either - it's implied for every partner client.
    expect(screen.queryByText(/^managed$/i)).toBeNull();
    expect(screen.getAllByRole("button", { name: /archive/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /delete/i }).length).toBeGreaterThan(0);
  });

  it("does not expose client credential actions to an admin for an agency-managed client", () => {
    getSubAccounts.mockReturnValue([partnerClientRows[0]]);
    render(<SubAccountsPage {...baseProps} session={{ username: "admin", role: "admin" } as any} />);
    fireEvent.click(screen.getAllByRole("button", { name: /client accounts/i })[0]);
    expect(screen.queryByRole("button", { name: /change password/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /give client access/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /resend welcome email/i })).toBeNull();
    expect(serverSetClientAccess).not.toHaveBeenCalled();
  });

  it("Go to client stashes the sole project id and enters the managed workspace", async () => {
    openClientsSection();
    fireEvent.click(screen.getAllByRole("button", { name: /^go to client$/i })[0]);
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-one"));
    const raw = sessionStorage.getItem("aio:open-client-projects");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ projectId: "proj-1" });
  });

  it("Go to client opens the client's project hub when it has no project", async () => {
    openClientsSection();
    fireEvent.click(screen.getAllByRole("button", { name: /^go to client$/i })[1]);
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-two"));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({ projectId: null });
  });

  it("sends the agency to Billing instead of entering the client when its project allowance is full", async () => {
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes("/api/platform/billing/subscription")
        ? new Response(JSON.stringify({ projectsUsed: 3, projectAllowance: 3 }), { status: 200 })
        : new Response(JSON.stringify({}), { status: 404 }),
    );
    const onSectionChange = vi.fn();
    render(
      <SubAccountsPage
        {...baseProps}
        session={agencySession as any}
        initialSection="clients"
        onSectionChange={onSectionChange}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /^go to client$/i })[1]);

    await vi.waitFor(() => expect(onSectionChange).toHaveBeenCalledWith("billing"));
    expect(serverImpersonate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("aio:open-client-projects")).toBeNull();
  });

  it("opens a specific project directly from its project chip", async () => {
    openClientsSection();
    fireEvent.click(screen.getByRole("button", { name: /client one project/i }));
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-one"));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({ projectId: "proj-1" });
  });
});

describe("agency partner create-client form", () => {
  it("has no password field and no managed checkbox", () => {
    openClientsSection();
    expect(screen.getByText("Add a client")).toBeTruthy();
    expect(screen.queryByText(/^password$/i)).toBeNull();
    expect(screen.queryByText(/managed account/i)).toBeNull();
    // Partner-specific footnote instead.
    expect(screen.getByText(/no separate client login or password/i)).toBeTruthy();
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

  it("lets an agency update a client's name and website for future projects", async () => {
    openClientsSection();
    fireEvent.click(screen.getAllByRole("button", { name: /edit details/i })[0]);
    fireEvent.change(screen.getByPlaceholderText(/client name/i), { target: { value: "Updated Client" } });
    fireEvent.change(screen.getByPlaceholderText(/website/i), { target: { value: "https://updated.example" } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));
    await vi.waitFor(() => {
      expect(serverSetDisplayName).toHaveBeenCalledWith(
        "client-one",
        "Updated Client",
        "https://updated.example",
      );
    });
  });
});

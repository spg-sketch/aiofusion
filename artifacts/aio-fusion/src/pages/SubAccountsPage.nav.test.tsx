import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks - must be declared before component import
// ---------------------------------------------------------------------------

vi.mock("../lib/apiHelpers", () => ({ apiBase: () => "" }));
vi.mock("../lib/projectStore", () => ({ loadStoredProjects: () => [] }));
vi.mock("../lib/projectSync", () => ({
  pushProjectMeta: async () => ({}),
  auditAndRecoverLocalProjects: async () => ({ serverProjectIds: [], localOnly: [] }),
}));
vi.mock("../lib/accountLabels", () => ({ accountLabel: (u: string) => u }));

vi.mock("./TeamSection", () => ({
  TeamSection: () => <div data-testid="team-section">Team section</div>,
}));
vi.mock("../components/AccountSecurityCard", () => ({
  AccountSecurityCard: () => <div data-testid="security-card">Security card</div>,
}));
vi.mock("../components/BillingDetailsCard", () => ({
  BillingDetailsCard: () => <div data-testid="billing-card">Billing card</div>,
}));

vi.mock("../lib/auth", () => ({
  getSubAccounts: () => [],
  serverAddUser: async () => ({ ok: true as const }),
  serverDeleteUser: async () => ({ ok: true as const }),
  serverChangePassword: async () => ({ ok: true as const }),
  serverAssignOwner: async () => ({ ok: true as const }),
  serverSetDisplayName: async () => ({ ok: true as const }),
  serverArchiveUser: async () => ({ ok: true as const }),
  serverSetSeatCap: async () => ({ ok: true as const }),
  refreshAccountsCache: async () => {},
  serverImpersonate: async () => ({ ok: true as const }),
  serverSwitchToMaster: async () => ({ ok: true as const }),
  serverChangeAccountType: async () => ({ ok: true as const }),
  serverSetClientAccess: async () => ({ ok: true as const }),
  canCreateSubAccounts: (role: string) => role === "agency" || role === "admin",
}));

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({}), { status: 404 }),
  );
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
  onAssignProjectOwner: async () => ({ ok: true }),
  onSignOut: () => {},
};

const agencySession = { username: "acme-agency", role: "agency" as const };
const clientSession = { username: "solo-client", role: "client" as const };

describe("SubAccountsPage left-hand navigation", () => {
  it("shows both nav groups for an agency owner and defaults to Profile", () => {
    render(<SubAccountsPage {...baseProps} session={agencySession as any} />);
    expect(screen.getByText("My Account")).toBeTruthy();
    expect(screen.getByText("My Client Projects")).toBeTruthy();
    expect(screen.getByText("Active workspace")).toBeTruthy();
    // Profile section is visible by default; other sections are not.
    expect(screen.getByText("Account type")).toBeTruthy();
    expect(screen.queryByTestId("security-card")).toBeNull();
    expect(screen.queryByTestId("billing-card")).toBeNull();
    expect(screen.queryByTestId("team-section")).toBeNull();
    expect(screen.queryByText("Add a Client Project")).toBeNull();
  });

  it("switches sections when a nav item is clicked (one section at a time)", () => {
    render(<SubAccountsPage {...baseProps} session={agencySession as any} />);
    fireEvent.click(screen.getAllByRole("button", { name: /sign-in & security/i })[0]);
    expect(screen.getByTestId("security-card")).toBeTruthy();
    expect(screen.queryByText("Account type")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /^client projects$/i })[0]);
    expect(screen.getByText("Add a Client Project")).toBeTruthy();
    expect(screen.queryByTestId("security-card")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /assign projects/i })[0]);
    expect(screen.getByText("No projects to assign yet.")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /archived client projects/i })[0]);
    expect(screen.getByText(/No archived Client Projects/)).toBeTruthy();
  });

  it("hides client sections and billing/team as appropriate for a direct client viewer member", () => {
    render(
      <SubAccountsPage
        {...baseProps}
        session={{ ...clientSession, membershipRole: "viewer" } as any}
      />,
    );
    expect(screen.queryByText("My Clients")).toBeNull();
    expect(screen.getByText("Active project")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /billing details/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /team members/i })).toBeNull();
    // Security is still available.
    expect(screen.getAllByRole("button", { name: /sign-in & security/i }).length).toBeGreaterThan(0);
  });

  it("shows billing to a billing member but not team", () => {
    render(
      <SubAccountsPage
        {...baseProps}
        session={{ ...clientSession, membershipRole: "billing" } as any}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /billing details/i })[0]);
    expect(screen.getByTestId("billing-card")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /team members/i })).toBeNull();
  });

  it("opens the section named by the initialSection deep link", () => {
    render(
      <SubAccountsPage
        {...baseProps}
        session={agencySession as any}
        initialSection="security"
      />,
    );
    expect(screen.getByTestId("security-card")).toBeTruthy();
    expect(screen.queryByText("Account type")).toBeNull();
  });

  it("falls back to Profile when the deep-linked section is not allowed for the role", () => {
    render(
      <SubAccountsPage
        {...baseProps}
        session={clientSession as any}
        initialSection="clients"
      />,
    );
    expect(screen.getByText("Account type")).toBeTruthy();
  });
});

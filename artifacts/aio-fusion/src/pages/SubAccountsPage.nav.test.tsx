import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

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
  it.each([
    ["direct client", clientSession],
    ["agency", agencySession],
    ["Master", { username: "master", role: "admin" as const }],
  ])("uses the shared Account Settings introduction for %s", (_label, session) => {
    render(<SubAccountsPage {...baseProps} session={session as any} />);
    expect(screen.getByRole("heading", { level: 1, name: "Account Settings" })).toBeTruthy();
    expect(screen.queryByText("Account and team settings")).toBeNull();
  });

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

  it("shows an agency how many paid project slots are used and remain", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/api/platform/billing/capacity")) {
        return new Response(JSON.stringify({
          packageCapacity: {
            billingSlug: "acme-agency",
            kind: "agency",
            access: "paid",
            included: 3,
            purchased: 3,
            reserved: 2,
            used: 2,
            remaining: 4,
            allowance: 6,
            overLimit: false,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    render(<SubAccountsPage {...baseProps} session={agencySession as any} initialSection="clients" />);

    expect(await screen.findByText(
      "3 included · 3 purchased · 2 reserved · 2 projects used · 4 remaining · 6 allowance · within limit",
    )).toBeTruthy();
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
    expect(screen.getByRole("button", { name: /go to project/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit details/i })).toBeNull();
  });

  it("lets a direct client owner open their project and edit its details", async () => {
    const onOpenProject = vi.fn();
    render(
      <SubAccountsPage
        {...baseProps}
        session={{ ...clientSession, companyName: "Vibe Studio" } as any}
        onOpenProject={onOpenProject}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /go to project/i }));
    expect(onOpenProject).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
    expect(screen.getByDisplayValue("Vibe Studio")).toBeTruthy();
    expect(screen.getByRole("button", { name: /save details/i })).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Vibe Studio"), { target: { value: "Vibe Studio Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));
    await waitFor(() => expect(screen.getByText("Vibe Studio Ltd")).toBeTruthy());
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

  it("opens GEOrge from the desktop and mobile account-settings entries", () => {
    const onOpenGeorge = vi.fn();
    render(
      <SubAccountsPage
        {...baseProps}
        session={agencySession as any}
        onOpenGeorge={onOpenGeorge}
      />,
    );

    const georgeButtons = screen.getAllByRole("button", { name: /ask george/i });
    expect(georgeButtons).toHaveLength(2);
    expect(document.querySelector(".settings-george-card")).toBeTruthy();
    expect(document.querySelector(".settings-george-mobile-button")).toBeTruthy();

    fireEvent.click(georgeButtons[0]);
    fireEvent.click(georgeButtons[1]);
    expect(onOpenGeorge).toHaveBeenCalledTimes(2);
  });
});

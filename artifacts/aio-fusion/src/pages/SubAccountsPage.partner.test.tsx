/**
 * Agency partner client rows and create form.
 *
 * Agency (role "agency") sessions manage their clients entirely on their
 * behalf: client rows show direct project actions + Archive + Delete (no
 * password, no access controls, no Managed badge), and the create form has
 * no password field or managed checkbox - accounts are always managed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks - must be declared before component import
// ---------------------------------------------------------------------------

vi.mock("../lib/apiHelpers", () => ({ apiBase: () => "" }));
const projectStoreState = vi.hoisted(() => ({
  projects: [
    { id: "proj-1", name: "Client One Project", owner: "client-one" },
    { id: "proj-2", name: "Client One Second Project", owner: "client-one" },
  ] as Array<Record<string, unknown>>,
}));
vi.mock("../lib/projectStore", () => ({
  loadStoredProjects: () => projectStoreState.projects,
  saveStoredProjects: (projects: Array<Record<string, unknown>>) => {
    projectStoreState.projects = projects;
  },
}));
const auditAndRecoverLocalProjects = vi.fn();
type PushProjectResult = { ok?: boolean; error?: string; limitReached?: boolean; project?: unknown };
const pushProjectMeta = vi.fn<
  (project: unknown, logo?: string | null, options?: { owner?: string }) => Promise<PushProjectResult>
>(async (_project: unknown, _logo?: string | null) => ({}));
vi.mock("../lib/projectSync", () => ({
  pushProjectMeta: (project: unknown, logo?: string | null, options?: { owner?: string }) => pushProjectMeta(project, logo, options),
  auditAndRecoverLocalProjects: () => auditAndRecoverLocalProjects(),
}));
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

type MockCreateResult =
  | { ok: true; username: string }
  | { ok: false; error: string; uncertain?: boolean };
const serverAddUser = vi.fn(async (): Promise<MockCreateResult> => ({ ok: true, username: "new-client" }));
type ImpersonateResult = { ok: true };
const serverImpersonate = vi.fn<(username: string) => Promise<ImpersonateResult>>(
  async (_username: string) => ({ ok: true as const }),
);
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
  serverImpersonate: (username: string) => serverImpersonate(username),
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
  serverSetDisplayName.mockClear();
   serverSetClientAccess.mockClear();
  getSubAccounts.mockReturnValue(partnerClientRows);
  auditAndRecoverLocalProjects.mockResolvedValue({ serverProjectIds: ["proj-1"], localOnly: [] });
  projectStoreState.projects = [
    { id: "proj-1", name: "Client One Project", owner: "client-one" },
    { id: "proj-2", name: "Client One Second Project", owner: "client-one" },
  ];
  pushProjectMeta.mockReset();
  pushProjectMeta.mockResolvedValue({});
  baseProps.onNavigate.mockReset();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
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
  onNavigate: vi.fn(),
};

const agencySession = { username: "acme-agency", role: "agency" as const };

function openClientsSection() {
  render(<SubAccountsPage {...baseProps} session={agencySession as any} />);
  fireEvent.click(screen.getAllByRole("button", { name: /^client projects$/i })[0]);
}

async function clickAsync(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

function captureProtectedRedirect() {
  return {
    get url() { return baseProps.onNavigate.mock.calls.at(-1)?.[0] as string | undefined; },
    restore() {},
  };
}

describe("agency partner client rows", () => {
  it("presents managed clients with direct project actions and no login status or credential controls", () => {
    openClientsSection();
    expect(screen.getAllByRole("button", { name: /^open project hub$/i })).toHaveLength(2);
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

  it("hides sign-in security for an agency-managed client session", () => {
    render(
      <SubAccountsPage
        {...baseProps}
        session={{ username: "client-one", role: "client", agencyManagedClient: true } as any}
        initialSection="security"
      />,
    );

    expect(screen.queryByRole("button", { name: /sign-in & security/i })).toBeNull();
    expect(screen.queryByTestId("security-card")).toBeNull();
    expect(screen.getByText("Account type")).toBeTruthy();
  });

  it("Open Project Hub always enters the managed workspace without selecting a project when several exist", async () => {
    window.history.replaceState({}, "", "/?account_section=clients");
    const redirect = captureProtectedRedirect();
    openClientsSection();
    expect(screen.getByRole("button", { name: /client one second project/i })).toBeTruthy();
    await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[0]);
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-one"));
    const raw = sessionStorage.getItem("aio:open-client-projects");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ username: "client-one", projectId: null });
    expect(redirect.url).toBe(`${import.meta.env.BASE_URL || "/"}project-hub`);
    redirect.restore();
  });

  it("Open Project Hub enters a client with no projects without a capacity check", async () => {
    openClientsSection();
    await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[1]);
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-two"));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({ username: "client-two", projectId: null });
  });

  it("opens the hub even when the agency project allowance is full", async () => {
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

    await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[1]);

    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-two"));
    expect(onSectionChange).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({ username: "client-two", projectId: null });
  });

  it("opens a specific project directly from its project chip", async () => {
    const redirect = captureProtectedRedirect();
    openClientsSection();
    await clickAsync(screen.getByRole("button", { name: /client one project/i }));
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-one"));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({ username: "client-one", projectId: "proj-1" });
    expect(redirect.url).toBe(`${import.meta.env.BASE_URL || "/"}project-hub`);
    redirect.restore();
  });

  it("uses the returned username to save a new Client Project, then opens its hub without selecting it", async () => {
    const redirect = captureProtectedRedirect();
    let releasePush!: (result: { ok: true }) => void;
    pushProjectMeta.mockImplementationOnce(() => new Promise((resolve) => { releasePush = resolve; }));
    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "New Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "newclient.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));

    await vi.waitFor(() => expect(serverAddUser).toHaveBeenCalled());
    await vi.waitFor(() => expect(pushProjectMeta).toHaveBeenCalledOnce());
    const [project] = pushProjectMeta.mock.calls[0] as unknown as [{ id: string; name: string; owner: string }];
    expect(JSON.parse(sessionStorage.getItem("aio:pending-client-project")!)).toEqual(expect.objectContaining({
      username: "new-client",
      operatorUsername: "acme-agency",
      project: expect.objectContaining({ id: project.id, name: "New Client Co", owner: "new-client" }),
    }));
    expect(project).toEqual(expect.objectContaining({ name: "New Client Co", owner: "new-client" }));
    await act(async () => { releasePush({ ok: true }); });
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("new-client"));
    await vi.waitFor(() => expect(sessionStorage.getItem("aio:open-client-projects")).toBeTruthy());
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
      username: "new-client",
      projectId: null,
    });
    expect(redirect.url).toBe(`${import.meta.env.BASE_URL || "/"}project-hub`);
    redirect.restore();
  });

  it("reuses the creation request key when the response is lost", async () => {
    const redirect = captureProtectedRedirect();
    serverAddUser.mockRejectedValueOnce(new Error("The creation response was lost"));
    pushProjectMeta.mockResolvedValue({ ok: true });
    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "Retry Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "retryclient.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));

    await vi.waitFor(() => expect(screen.getByText("The creation response was lost")).toBeTruthy());
    expect(serverAddUser).toHaveBeenCalledTimes(1);
    const firstOptions = (serverAddUser.mock.calls[0] as unknown as unknown[])[4] as { creationRequestKey?: string };
    expect(firstOptions.creationRequestKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    await clickAsync(screen.getByRole("button", { name: /add client project/i }));
    await vi.waitFor(() => expect(serverAddUser).toHaveBeenCalledTimes(2));
    const secondOptions = (serverAddUser.mock.calls[1] as unknown as unknown[])[4] as { creationRequestKey?: string };
    expect(secondOptions.creationRequestKey).toBe(firstOptions.creationRequestKey);
    await vi.waitFor(() => expect(redirect.url).toBe(`${import.meta.env.BASE_URL || "/"}project-hub`));
    redirect.restore();
  });

  it("does not start a new creation when an uncertain draft is edited", async () => {
    serverAddUser.mockRejectedValueOnce(new Error("The creation response was lost"));
    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "Original Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "originalclient.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));

    await vi.waitFor(() => expect(screen.getByText(/couldn't confirm whether this client was created/i)).toBeTruthy());
    // fireEvent intentionally bypasses the disabled control to model a stale
    // browser event; handleAdd must still refuse a second logical request.
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "Edited Client Co" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));

    await vi.waitFor(() => expect(screen.getByText(/retry the original request before editing/i)).toBeTruthy());
    expect(serverAddUser).toHaveBeenCalledTimes(1);
  });

  it("keeps an uncertain draft locked when its recovery retry gets a definitive auth error", async () => {
    serverAddUser.mockRejectedValueOnce(new Error("The creation response was lost"));
    serverAddUser.mockResolvedValueOnce({ ok: false, error: "Not authorized", uncertain: false });
    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "Locked Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "lockedclient.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));
    await vi.waitFor(() => expect(screen.getByText(/couldn't confirm whether this client was created/i)).toBeTruthy());

    await clickAsync(screen.getByRole("button", { name: /add client project/i }));
    await vi.waitFor(() => expect(screen.getByText("Not authorized")).toBeTruthy());
    expect(screen.getByPlaceholderText(/acme ltd/i)).toBeDisabled();
    expect(serverAddUser).toHaveBeenCalledTimes(2);
  });

  it("starts with a fresh creation request key after a confirmed success", async () => {
    const redirect = captureProtectedRedirect();
    pushProjectMeta.mockResolvedValue({ ok: true });
    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "First Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "firstclient.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));
    await vi.waitFor(() => expect(serverAddUser).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(pushProjectMeta).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(redirect.url).toBe(`${import.meta.env.BASE_URL || "/"}project-hub`));
    const firstOptions = (serverAddUser.mock.calls[0] as unknown as unknown[])[4] as { creationRequestKey?: string };

    // Agency project creation navigates to the protected hub and leaves the
    // pending handoff button disabled. Remount as a fresh page after success
    // before exercising the next create request.
    cleanup();
    render(<SubAccountsPage {...baseProps} session={agencySession as any} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^client projects$/i })[0]);
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "Second Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "secondclient.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));
    await vi.waitFor(() => expect(serverAddUser).toHaveBeenCalledTimes(2));
    const secondOptions = (serverAddUser.mock.calls[1] as unknown as unknown[])[4] as { creationRequestKey?: string };
    expect(secondOptions.creationRequestKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(secondOptions.creationRequestKey).not.toBe(firstOptions.creationRequestKey);
    redirect.restore();
  });

  it("saves the named project directly to the server-authorized client owner before entering its hub", async () => {
    const order: string[] = [];
    serverAddUser.mockResolvedValueOnce({ ok: true as const, username: "named-client" });
    serverImpersonate.mockImplementationOnce(async (username: string) => {
      order.push(`impersonate:${username}`);
      return { ok: true as const };
    });
    pushProjectMeta.mockImplementationOnce(async (project: unknown) => {
      order.push("save-project");
      return { ok: true as const, project };
    });

    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "Named Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "named-client.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));

    await vi.waitFor(() => expect(pushProjectMeta).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("named-client"));
    const [project] = pushProjectMeta.mock.calls[0] as unknown as [{ id: string; name: string; owner: string }];
    expect(order).toEqual(["save-project", "impersonate:named-client"]);
    expect(pushProjectMeta.mock.calls[0]?.[2]).toEqual({ owner: "named-client" });
    expect(project).toEqual(expect.objectContaining({
      name: "Named Client Co",
      owner: "named-client",
    }));
    expect(projectStoreState.projects).toContainEqual(expect.objectContaining({
      id: project.id,
      name: "Named Client Co",
      owner: "named-client",
    }));
    expect(serverAddUser).toHaveBeenCalledOnce();
  });

  it("creates a zero-project Client Project for the server-authorized owner before entering it", async () => {
    getSubAccounts.mockReturnValue([partnerClientRows[1]]);
    const order: string[] = [];
    serverImpersonate.mockImplementationOnce(async (username: string) => {
      order.push(`impersonate:${username}`);
      return { ok: true as const };
    });
    pushProjectMeta.mockImplementationOnce(async (project: unknown) => {
      order.push("save-project");
      return { ok: true as const, project };
    });

    const redirect = captureProtectedRedirect();
    render(<SubAccountsPage {...baseProps} session={agencySession as any} initialSection="clients" />);
    await clickAsync(screen.getByRole("button", { name: /^create project$/i }));

    await vi.waitFor(() => expect(pushProjectMeta).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledWith("client-two"));
    const [project] = pushProjectMeta.mock.calls[0] as unknown as [{ id: string; name: string; owner: string }];
    expect(order).toEqual(["save-project", "impersonate:client-two"]);
    expect(pushProjectMeta.mock.calls[0]?.[2]).toEqual({ owner: "client-two" });
    expect(project).toEqual(expect.objectContaining({
      name: "client-two",
      owner: "client-two",
    }));
    expect(projectStoreState.projects).toContainEqual(expect.objectContaining({
      id: project.id,
      owner: "client-two",
    }));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
      username: "client-two",
      projectId: null,
    });
    expect(redirect.url).toBe(`${import.meta.env.BASE_URL || "/"}project-hub`);
    redirect.restore();
    expect(serverAddUser).not.toHaveBeenCalled();
  });

  it("retries a failed pending project save with the same id without duplicating the account", async () => {
    serverAddUser.mockResolvedValueOnce({ ok: true as const, username: "retry-client" });
    serverImpersonate.mockResolvedValueOnce({ ok: true as const });
    pushProjectMeta
      .mockResolvedValueOnce({ ok: false as const, error: "Project save failed." })
      .mockResolvedValueOnce({ ok: true as const });

    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "Retry Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "retry-client.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Project save failed."));
    expect(serverAddUser).toHaveBeenCalledOnce();
    expect(serverImpersonate).not.toHaveBeenCalled();
    expect(pushProjectMeta).toHaveBeenCalledOnce();
    const firstProject = (pushProjectMeta.mock.calls[0] as unknown as [{ id: string }])[0];

    await clickAsync(screen.getByRole("button", { name: /retry navigation to project hub/i }));

    await vi.waitFor(() => expect(pushProjectMeta).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledOnce());
    const secondProject = (pushProjectMeta.mock.calls[1] as unknown as [{ id: string }])[0];
    expect(secondProject.id).toBe(firstProject.id);
    expect(serverAddUser).toHaveBeenCalledOnce();
    expect(serverImpersonate).toHaveBeenCalledOnce();
    expect(projectStoreState.projects.filter((project) => project.id === firstProject.id)).toHaveLength(1);
  });

  it("clears a stale handoff on navigation failure and retries navigation without creating again", async () => {
    sessionStorage.setItem("aio:open-client-projects", JSON.stringify({ username: "old-client", projectId: "old-project" }));
    serverImpersonate.mockRejectedValueOnce(new Error("The workspace switch failed"));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes("/api/platform/me")
        ? new Response(JSON.stringify({ account: { username: "acme-agency" }, impersonating: null }), { status: 200 })
        : new Response(JSON.stringify({}), { status: 404 }),
    );

    openClientsSection();
    await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[0]);

    await vi.waitFor(() => expect(screen.getByText("The workspace switch failed")).toBeTruthy());
    expect(sessionStorage.getItem("aio:open-client-projects")).toBeNull();
    expect(screen.getByRole("button", { name: /retry navigation to project hub/i })).toBeTruthy();
    expect(serverAddUser).not.toHaveBeenCalled();

    serverImpersonate.mockResolvedValueOnce({ ok: true as const });
    await clickAsync(screen.getByRole("button", { name: /retry navigation to project hub/i }));
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledTimes(2));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
      username: "client-one",
      projectId: null,
    });
  });

  it("recovers a response-lost switch only when /me confirms target and original operator", async () => {
    sessionStorage.setItem("aio:open-client-projects", JSON.stringify({ username: "old-client", projectId: "old-project" }));
    serverImpersonate.mockRejectedValueOnce(new Error("Response lost after switch"));
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes("/api/platform/me")
        ? new Response(
            JSON.stringify({
              account: { username: "client-one" },
              impersonating: { by: "acme-agency" },
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify({}), { status: 404 }),
    );

    openClientsSection();
    await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[0]);

    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
    await vi.waitFor(() => {
      expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
        username: "client-one",
        projectId: null,
      });
    });
  });

  it("keeps an uncertain retry when /me is unavailable and reconciles again before impersonating", async () => {
    serverImpersonate.mockRejectedValueOnce(new Error("Response lost after switch"));
    openClientsSection();
    await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[0]);

    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Response lost after switch"));
    await clickAsync(screen.getByRole("button", { name: /retry navigation to project hub/i }));
    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not confirm the workspace switch"));
    expect(serverImpersonate).toHaveBeenCalledOnce();

    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).includes("/api/platform/me")
        ? new Response(JSON.stringify({ account: { username: "acme-agency" }, impersonating: null }), { status: 200 })
        : new Response(JSON.stringify({}), { status: 404 }),
    );
    await clickAsync(screen.getByRole("button", { name: /retry navigation to project hub/i }));
    await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledTimes(2));
    expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
      username: "client-one",
      projectId: null,
    });
  });

  it.each(["storage", "history"] as const)(
    "does not re-impersonate after a successful switch with %s handoff failure",
    async (failureKind) => {
      const failure = new Error(`${failureKind} handoff failed`);
      const storageSpy = failureKind === "storage"
        ? vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw failure; })
        : null;
      const historySpy = failureKind === "history"
        ? (() => {
            baseProps.onNavigate.mockImplementationOnce(() => { throw failure; });
            return { mockRestore: () => baseProps.onNavigate.mockReset() };
          })()
        : null;

      openClientsSection();
      await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[0]);

      await vi.waitFor(() => expect(screen.getByText(failure.message)).toBeTruthy());
      expect(serverImpersonate).toHaveBeenCalledTimes(1);
      storageSpy?.mockRestore();
      historySpy?.mockRestore();

      await clickAsync(screen.getByRole("button", { name: /retry navigation to project hub/i }));
      await vi.waitFor(() => expect(serverImpersonate).toHaveBeenCalledTimes(1));
      expect(JSON.parse(sessionStorage.getItem("aio:open-client-projects")!)).toEqual({
        username: "client-one",
        projectId: null,
      });
    },
  );

  it("keeps a failed entry retry visible after leaving the clients section", async () => {
    serverImpersonate.mockRejectedValueOnce(new Error("Unable to switch workspace"));
    openClientsSection();
    await clickAsync(screen.getAllByRole("button", { name: /^open project hub$/i })[0]);
    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to switch workspace"));

    fireEvent.click(screen.getAllByRole("button", { name: /archived client projects/i })[0]);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to switch workspace");
    expect(screen.getByRole("button", { name: /retry navigation to project hub/i })).toBeTruthy();
  });

  it("keeps archive and delete confirmations agency-owned without client sign-in claims", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    openClientsSection();

    fireEvent.click(screen.getAllByRole("button", { name: /^archive$/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    confirmSpy.mock.calls.forEach(([message]) => {
      expect(message).not.toMatch(/sign[\s-]*in/i);
    });
  });

  it("keeps restore confirmation agency-owned without client sign-in claims", () => {
    getSubAccounts.mockReturnValue([{ ...partnerClientRows[0], archived: true }]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SubAccountsPage {...baseProps} session={agencySession as any} initialSection="archived" />);

    fireEvent.click(screen.getByRole("button", { name: /^restore$/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(confirmSpy.mock.calls[0][0]).not.toMatch(/sign[\s-]*in/i);
  });

  it("audits projects and requires confirmation before assigning one to a client", async () => {
    const onAssignProjectOwner = vi.fn(async () => ({ ok: true as const }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      render(
        <SubAccountsPage
          {...baseProps}
          session={agencySession as any}
          initialSection="assign"
          onAssignProjectOwner={onAssignProjectOwner}
        />,
      );
    });
    await vi.waitFor(() => {
      expect(screen.getByRole("combobox", { name: /owner for client one project/i })).toBeEnabled();
    });

    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: /owner for client one project/i }), {
        target: { value: "client-two" },
      });
    });

    await vi.waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Client One Project"));
      expect(onAssignProjectOwner).toHaveBeenCalledWith("proj-1", "client-two");
    });
  });

  it("does not display the recovery report or old browser-only project names", async () => {
    auditAndRecoverLocalProjects.mockResolvedValueOnce({
      serverProjectIds: ["proj-1"],
      localOnly: [{
        id: "old-browser-project",
        name: "Old Browser Project",
        recovered: false,
        error: "You cannot modify this project.",
      }],
    });
    await act(async () => {
      render(<SubAccountsPage {...baseProps} session={agencySession as any} initialSection="assign" />);
    });

    await vi.waitFor(() => {
      expect(screen.getByRole("combobox", { name: /owner for client one project/i })).toBeEnabled();
    });
    expect(screen.queryByText(/safely stored on the server|available for review|browser-only projects|not recovered/i)).toBeNull();
    expect(screen.queryByText(/Old Browser Project|You cannot modify this project/i)).toBeNull();
    expect(screen.getByText("Client One Project")).toBeTruthy();
  });

  it("keeps every owner control disabled when the audit cannot reach the server", async () => {
    auditAndRecoverLocalProjects.mockResolvedValueOnce(null);
    render(
      <SubAccountsPage
        {...baseProps}
        session={agencySession as any}
        initialSection="assign"
      />,
    );

    expect(await screen.findByText(/server could not be reached/i)).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /owner for client one project/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /retry audit/i })).toBeTruthy();
  });
});

describe("agency partner create-client form", () => {
  it("has no password field and no managed checkbox", () => {
    openClientsSection();
    expect(screen.getByText("Add a Client Project")).toBeTruthy();
    expect(screen.queryByText(/^password$/i)).toBeNull();
    expect(screen.queryByText(/managed account/i)).toBeNull();
    // Partner-specific footnote instead.
    expect(screen.getByText(/no separate client login or password/i)).toBeTruthy();
  });

  it("always creates the client as managed", async () => {
    openClientsSection();
    fireEvent.change(screen.getByPlaceholderText(/acme ltd/i), { target: { value: "New Client Co" } });
    fireEvent.change(screen.getByPlaceholderText(/www\.acme\.com/i), { target: { value: "newclient.example.com" } });
    await clickAsync(screen.getByRole("button", { name: /add client project/i }));
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
    await clickAsync(screen.getByRole("button", { name: /save details/i }));
    await vi.waitFor(() => {
      expect(serverSetDisplayName).toHaveBeenCalledWith(
        "client-one",
        "Updated Client",
        "https://updated.example",
      );
    });
  });

  it("uses standard button variants for editing profile and respects cancel behavior", async () => {
    openClientsSection();
    const editButtons = screen.getAllByRole("button", { name: /edit details/i });
    expect(editButtons[0].className).toContain("aio-button--outline");
    expect(editButtons[0].className).toContain("aio-button--compact");

    // Enter edit mode
    fireEvent.click(editButtons[0]);
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    expect(cancelButton.className).toContain("aio-button--outline");
    expect(cancelButton.className).toContain("aio-button--compact");

    // Change input
    const nameInput = screen.getByPlaceholderText(/client name/i);
    fireEvent.change(nameInput, { target: { value: "Changed Name" } });

    // Cancel should exit edit mode without saving
    fireEvent.click(cancelButton);
    expect(screen.queryByPlaceholderText(/client name/i)).toBeNull();
    expect(serverSetDisplayName).not.toHaveBeenCalled();
  });

  it.each(["agency", "admin"] as const)("keeps %s row actions purpose-specific", (role) => {
    render(<SubAccountsPage {...baseProps} session={{ username: "acme-agency", role }} initialSection="clients" />);
    expect(screen.getAllByRole("button", { name: /^archive$/i })[0]).toHaveClass("aio-button--outline", "aio-button--compact");
    expect(screen.getAllByRole("button", { name: /^delete$/i })[0]).toHaveClass("aio-button--destructive", "aio-button--compact");
    expect(screen.getAllByRole("button", { name: /^(open project hub|open account)$/i })[0]).toHaveClass("aio-button--primary");
  });
});

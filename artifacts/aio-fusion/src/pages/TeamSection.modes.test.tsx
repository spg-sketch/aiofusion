// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TeamOverview } from "../lib/auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const getTeamMock = vi.hoisted(() => vi.fn());
const updateMemberMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true })));
const removeMemberMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true })));
const resetMfaMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  const mock: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) {
    mock[k] = typeof v === "function" ? vi.fn(() => Promise.resolve({ ok: true })) : v;
  }
  mock.serverGetTeam = getTeamMock;
  mock.serverUpdateTeamMember = updateMemberMock;
  mock.serverRemoveTeamMember = removeMemberMock;
  mock.serverResetMemberMfa = resetMfaMock;
  mock.serverGetMyInvites = vi.fn(() => Promise.resolve({ ok: true, invites: [] }));
  return mock;
});

vi.mock("../lib/projectStore", () => ({
  loadStoredProjects: () => [
    { id: "p1", name: "Project One" },
    { id: "p2", name: "Project Two" },
  ],
}));

import { TeamSection } from "./TeamSection";

const baseTeam = (over: Partial<TeamOverview>): TeamOverview => ({
  members: [
    {
      userId: "u-owner",
      email: "owner@x.test",
      name: "Owner",
      role: "owner",
      projectAccess: null,
      position: null,
      createdAt: "2026-01-01",
      isSelf: true,
    } as any,
  ],
  invites: [],
  seatLimit: 3,
  seatsUsed: 1,
  ...over,
});

beforeEach(() => {
  getTeamMock.mockReset();
  updateMemberMock.mockClear();
  removeMemberMock.mockClear();
  resetMfaMock.mockReset();
});

describe("TeamSection personal MFA recovery", () => {
  function personalTeam(canResetMemberMfa = true): TeamOverview {
    return baseTeam({
      teamMode: "standard", seatLimit: null, canResetMemberMfa,
      members: [
        { userId: "self", name: "Current Owner", email: "owner@example.test", role: "owner", projectAccess: null, position: null, createdAt: "", isSelf: true, mfaStatus: "enabled", mfaEnabled: true, canResetMfa: true },
        { userId: "colleague", name: "Test Colleague", email: "colleague@example.test", role: "viewer", projectAccess: null, position: null, createdAt: "", isSelf: false, mfaStatus: "legacy_transition", mfaEnabled: false, canResetMfa: true },
      ],
    });
  }

  it("shows authoritative individual status but never a self-reset action", async () => {
    getTeamMock.mockResolvedValue({ ok: true, team: personalTeam() });
    render(<TeamSection />);
    expect(await screen.findByText("Personal 2FA: Enabled")).toBeTruthy();
    expect(screen.getByText(/Personal 2FA: Legacy transition/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset two-factor for owner@example.test" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset two-factor for colleague@example.test" })).toBeTruthy();
  });

  it("requires both the named email and verified-identity acknowledgement before target-only reset", async () => {
    getTeamMock.mockResolvedValue({ ok: true, team: personalTeam() });
    resetMfaMock.mockResolvedValue({ ok: true });
    render(<TeamSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset two-factor for colleague@example.test" }));
    const confirm = screen.getByRole("button", { name: "Confirm reset for colleague@example.test" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type colleague@example.test to confirm"), { target: { value: "owner@example.test" } });
    fireEvent.click(screen.getByLabelText(/independently verified this person's identity/));
    expect(confirm.disabled).toBe(true);
    expect(resetMfaMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Type colleague@example.test to confirm"), { target: { value: "colleague@example.test" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(resetMfaMock).toHaveBeenCalledWith("colleague", "colleague@example.test"));
    expect(await screen.findByText(/Only this person's factors/)).toBeTruthy();
  });

  it("hides reset controls when the server does not grant the capability", async () => {
    getTeamMock.mockResolvedValue({ ok: true, team: personalTeam(false) });
    render(<TeamSection />);
    await screen.findByText("Test Colleague");
    expect(screen.queryByRole("button", { name: /Reset two-factor/ })).toBeNull();
  });

  it("keeps reset failures explicit and does not claim success", async () => {
    getTeamMock.mockResolvedValue({ ok: true, team: personalTeam() });
    resetMfaMock.mockResolvedValue({ ok: false, error: "Membership changed. Refresh and try again." });
    render(<TeamSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Reset two-factor for colleague@example.test" }));
    fireEvent.change(screen.getByLabelText("Type colleague@example.test to confirm"), { target: { value: "colleague@example.test" } });
    fireEvent.click(screen.getByLabelText(/independently verified this person's identity/));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reset for colleague@example.test" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Membership changed");
    expect(screen.queryByText(/Only this person's factors/)).toBeNull();
  });
});

describe("TeamSection team modes", () => {
  it("direct clients receive the full Agency Partner team controls", async () => {
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({
        teamMode: "agency",
        projectSeatLimit: 3,
        projectSeats: { p1: 0, p2: 0 },
      }),
    });
    render(<TeamSection />);
    await waitFor(() => expect(screen.getByText(/account seats/)).toBeTruthy());

    expect(document.querySelector("select")).toBeTruthy();
    const toggle = screen.getByText(/Assign to specific projects/);
    expect(toggle).toBeTruthy();
    (toggle.querySelector("input") as HTMLInputElement).click();
    await waitFor(() => expect(screen.getByText("Content Team Member")).toBeTruthy());
    expect(screen.getByText("Project One")).toBeTruthy();
    expect(screen.getByText("Project Two")).toBeTruthy();
  });

  it("agency mode: account-seat counter, project seats with per-project counts", async () => {
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({
        teamMode: "agency",
        projectSeatLimit: 3,
        projectSeats: { p1: 3, p2: 1 },
      }),
    });
    render(<TeamSection />);
    await waitFor(() => expect(screen.getByText(/account seats/)).toBeTruthy());

    // Account-seat invite shows the full role dropdown.
    expect(document.querySelector("select")).toBeTruthy();

    // Switch to a project seat: role locks to content, chips show usage.
    const toggle = screen.getByText(/Assign to specific projects/);
    (toggle.querySelector("input") as HTMLInputElement).click();
    await waitFor(() => expect(screen.getByText("Content Team Member")).toBeTruthy());
    expect(screen.getByText("(3/3)")).toBeTruthy();
    expect(screen.getByText("(1/3)")).toBeTruthy();
    // The full project's checkbox is disabled.
    const fullChip = screen.getByText("Project One").closest("label")!;
    expect((fullChip.querySelector("input") as HTMLInputElement).disabled).toBe(true);
    const openChip = screen.getByText("Project Two").closest("label")!;
    expect((openChip.querySelector("input") as HTMLInputElement).disabled).toBe(false);
  });

  it("agency mode: a full account pool blocks account invites but not project seats", async () => {
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({ teamMode: "agency", seatsUsed: 3, projectSeatLimit: 3, projectSeats: {} }),
    });
    render(<TeamSection />);
    await waitFor(() => expect(screen.getByText(/account seat limit/)).toBeTruthy());
    const submit = screen.getByText(/Send invite/).closest("button")!;
    expect(submit.disabled).toBe(true);

    // Switching to a project seat re-enables the form.
    const toggle = screen.getByText(/Assign to specific projects/);
    (toggle.querySelector("input") as HTMLInputElement).click();
    await waitFor(() => expect((screen.getByText(/Send invite/).closest("button") as HTMLButtonElement).disabled).toBe(false));
  });

  it("Master mode shows unlimited team members and keeps the role form", async () => {
    getTeamMock.mockResolvedValue({ ok: true, team: baseTeam({ seatLimit: null }) });
    render(<TeamSection />);
    await waitFor(() => expect(screen.getByText(/Unlimited team members/)).toBeTruthy());
    expect(screen.getByText(/separate from customer and Agency Partner seat allowances/)).toBeTruthy();
    expect(document.querySelector("select")).toBeTruthy();
    expect(screen.queryByText(/account seats/)).toBeNull();
  });

  it("offers Owner only for existing members when the server grants master-owner capability", async () => {
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({
        canPromoteOwners: true,
        members: [
          ...baseTeam({}).members,
          {
            userId: "u-natalie",
            email: "natalie@x.test",
            name: "Natalie",
            role: "admin",
            projectAccess: null,
            position: null,
            createdAt: "2026-01-02",
            isSelf: false,
          } as any,
        ],
      }),
    });
    render(<TeamSection />);
    await screen.findByText("Natalie");

    const selects = Array.from(document.querySelectorAll("select"));
    const inviteRole = selects[0] as HTMLSelectElement;
    const memberRole = selects[1] as HTMLSelectElement;
    expect(Array.from(inviteRole.options).some((o) => o.value === "owner")).toBe(false);
    expect(Array.from(memberRole.options).some((o) => o.value === "owner")).toBe(true);

    fireEvent.change(memberRole, { target: { value: "owner" } });
    await waitFor(() => expect(updateMemberMock).toHaveBeenCalledWith("u-natalie", { role: "owner" }));

    // Existing owner rows remain badges: no role control or removal button.
    expect(screen.getByText("Owner (you)").closest("div")?.parentElement?.querySelector("select")).toBeNull();
    expect(screen.queryByTitle("Remove from team") ? screen.getAllByTitle("Remove from team") : []).toHaveLength(1);
  });

  it("does not offer Owner when the server denies the capability", async () => {
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({
        canPromoteOwners: false,
        members: [
          ...baseTeam({}).members,
          {
            userId: "u-natalie-admin-view",
            email: "natalie-admin@x.test",
            name: "Natalie Admin View",
            role: "admin",
            projectAccess: null,
            position: null,
            createdAt: "2026-01-02",
            isSelf: false,
          } as any,
        ],
      }),
    });
    render(<TeamSection />);
    await screen.findByText("Natalie Admin View");
    expect(Array.from(document.querySelectorAll("option")).some((o) => o.value === "owner")).toBe(false);
  });

  it("lets an authorized Master Owner confirm or cancel another Owner's demotion", async () => {
    const confirm = vi.spyOn(window, "confirm");
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({
        seatLimit: null,
        canManageOwners: true,
        members: [
          ...baseTeam({}).members,
          {
            userId: "u-alex",
            email: "alex@x.test",
            name: "Alex Owner",
            role: "owner",
            projectAccess: null,
            position: null,
            createdAt: "2026-01-02",
            isSelf: false,
            canEditRole: true,
            canRemove: true,
            protectionReason: null,
          },
        ],
      }),
    });
    render(<TeamSection />);
    const roleSelect = await screen.findByLabelText("Role for Alex Owner");

    confirm.mockReturnValueOnce(false);
    fireEvent.change(roleSelect, { target: { value: "admin" } });
    expect(updateMemberMock).not.toHaveBeenCalled();
    expect(confirm.mock.calls[0]?.[0]).toContain("Alex Owner");
    expect(confirm.mock.calls[0]?.[0]).toContain("lose ownership privileges");

    confirm.mockReturnValueOnce(true);
    fireEvent.change(roleSelect, { target: { value: "viewer" } });
    await waitFor(() => expect(updateMemberMock).toHaveBeenCalledWith("u-alex", { role: "viewer" }));
    confirm.mockRestore();
  });

  it("names an Owner in remove confirmation and explains account and data are not deleted", async () => {
    const confirm = vi.spyOn(window, "confirm");
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({
        seatLimit: null,
        canManageOwners: true,
        members: [
          ...baseTeam({}).members,
          {
            userId: "u-riley",
            email: "riley@x.test",
            name: "Riley Owner",
            role: "owner",
            projectAccess: null,
            position: null,
            createdAt: "2026-01-02",
            isSelf: false,
            canEditRole: true,
            canRemove: true,
            protectionReason: null,
          },
        ],
      }),
    });
    render(<TeamSection />);
    const remove = await screen.findByRole("button", { name: "Remove Riley Owner from team" });
    expect(remove.textContent).toContain("Remove");

    confirm.mockReturnValueOnce(false);
    fireEvent.click(remove);
    expect(removeMemberMock).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(remove);
    await waitFor(() => expect(removeMemberMock).toHaveBeenCalledWith("u-riley"));
    const message = String(confirm.mock.calls[1]?.[0]);
    expect(message).toContain("Riley Owner");
    expect(message).toContain("lose access immediately");
    expect(message).toContain("does not delete their user account or their data");
    confirm.mockRestore();
  });

  it("shows authoritative self and protected-owner denials without granting controls", async () => {
    getTeamMock.mockResolvedValue({
      ok: true,
      team: baseTeam({
        canManageOwners: true,
        members: [
          { ...baseTeam({}).members[0], canEditRole: false, canRemove: false, protectionReason: "You cannot manage yourself." },
          {
            userId: "u-protected",
            email: "protected@x.test",
            name: "Protected Owner",
            role: "owner",
            projectAccess: null,
            position: null,
            createdAt: "2026-01-02",
            isSelf: false,
            canEditRole: false,
            canRemove: false,
            protectionReason: "Only the Master Owner can manage this Owner.",
          },
        ],
      }),
    });
    render(<TeamSection />);
    await screen.findByText("Protected Owner");
    expect(screen.getByTestId("member-protection-u-owner").textContent).toContain("cannot change your own role");
    expect(screen.getByTestId("member-protection-u-protected").textContent).toContain("Only the Master Owner");
    expect(screen.queryByLabelText("Role for Protected Owner")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Protected Owner from team" })).toBeNull();
  });

  it("removes stale role controls when the authoritative post-change refresh fails", async () => {
    getTeamMock
      .mockResolvedValueOnce({
        ok: true,
        team: baseTeam({
          members: [
            ...baseTeam({}).members,
            {
              userId: "u-jordan",
              email: "jordan@x.test",
              name: "Jordan",
              role: "admin",
              projectAccess: null,
              position: null,
              createdAt: "2026-01-02",
              isSelf: false,
              canEditRole: true,
              canRemove: true,
              protectionReason: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false, error: "Could not refresh authoritative team." });
    render(<TeamSection />);
    fireEvent.change(await screen.findByLabelText("Role for Jordan"), { target: { value: "viewer" } });

    expect((await screen.findByRole("alert")).textContent).toContain("Could not refresh authoritative team.");
    expect(screen.queryByLabelText("Role for Jordan")).toBeNull();
    expect(screen.getByRole("button", { name: "Retry team list" })).toBeTruthy();
  });
});

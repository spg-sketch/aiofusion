// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TeamOverview } from "../lib/auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const getTeamMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  const mock: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) {
    mock[k] = typeof v === "function" ? vi.fn(() => Promise.resolve({ ok: true })) : v;
  }
  mock.serverGetTeam = getTeamMock;
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

beforeEach(() => getTeamMock.mockReset());

describe("TeamSection team modes", () => {
  it("client mode: fixed content role, no project restriction UI", async () => {
    getTeamMock.mockResolvedValue({ ok: true, team: baseTeam({ teamMode: "client" }) });
    render(<TeamSection />);
    await waitFor(() => expect(screen.getByText(/Team members/)).toBeTruthy());

    // Role is a fixed label, not a dropdown.
    expect(screen.getByText("Content Team Member")).toBeTruthy();
    expect(document.querySelector("select")).toBeNull();
    // No project-restriction checkbox.
    expect(screen.queryByText(/Limit to specific projects/)).toBeNull();
    expect(screen.queryByText(/Assign to specific projects/)).toBeNull();
    expect(screen.getByText(/Invite up to 3 colleagues/)).toBeTruthy();
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

  it("standard mode keeps the original single-pool form", async () => {
    getTeamMock.mockResolvedValue({ ok: true, team: baseTeam({}) });
    render(<TeamSection />);
    await waitFor(() => expect(screen.getByText(/\/ 3 seats/)).toBeTruthy());
    expect(document.querySelector("select")).toBeTruthy();
    expect(screen.queryByText(/account seats/)).toBeNull();
  });
});

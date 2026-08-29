// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getInvitesMock = vi.hoisted(() => vi.fn());
const acceptMock = vi.hoisted(() => vi.fn());
const switchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  const mock: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) mock[key] = typeof value === "function" ? vi.fn(() => Promise.resolve({ ok: true })) : value;
  mock.serverGetMyInvites = getInvitesMock;
  mock.serverAcceptMyInvite = acceptMock;
  mock.serverSwitchWorkspace = switchMock;
  return mock;
});
vi.mock("../lib/projectStore", () => ({ loadStoredProjects: () => [] }));

import { TeamSection } from "./TeamSection";

const invite = {
  token: "invite-1", companyId: "company-1", companySlug: "acme", companyName: "Acme",
  role: "viewer" as const, expiresAt: "2026-12-01", createdAt: "2026-01-01",
};

beforeEach(() => {
  getInvitesMock.mockReset();
  acceptMock.mockReset();
  switchMock.mockReset();
});

describe("TeamSection invitation states", () => {
  it("shows load failure and retries instead of treating it as empty", async () => {
    getInvitesMock.mockResolvedValueOnce({ ok: false, error: "Invitation service unavailable." }).mockResolvedValueOnce({ ok: true, invites: [invite] });
    render(<TeamSection />);
    await waitFor(() => expect(screen.getByTestId("status-invites-load-error")).toHaveTextContent("Invitation service unavailable."));
    fireEvent.click(screen.getByTestId("button-retry-invites"));
    await waitFor(() => expect(screen.getByTestId("button-accept-invite-invite-1")).toBeTruthy());
    expect(getInvitesMock).toHaveBeenCalledTimes(2);
  });

  it("shows joined state and reports a workspace switch failure", async () => {
    getInvitesMock.mockResolvedValue({ ok: true, invites: [invite] });
    acceptMock.mockResolvedValue({ ok: true, companyId: "company-1", companyName: "Acme" });
    switchMock.mockResolvedValue({ ok: false, error: "Switch denied." });
    const accepted = vi.fn();
    render(<TeamSection onInvitationAccepted={accepted} />);
    await waitFor(() => screen.getByTestId("button-accept-invite-invite-1"));
    fireEvent.click(screen.getByTestId("button-accept-invite-invite-1"));
    await waitFor(() => expect(screen.getByText("Joined Acme!")).toBeTruthy());
    expect(accepted).toHaveBeenCalledWith({ token: "invite-1", companyId: "company-1", companyName: "Acme" });
    fireEvent.click(screen.getByTestId("button-switch-workspace-company-1"));
    await waitFor(() => expect(screen.getByText("Switch denied.")).toBeTruthy());
    expect(switchMock).toHaveBeenCalledWith("company-1");
  });
});
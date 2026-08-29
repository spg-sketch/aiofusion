// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const acceptMock = vi.hoisted(() => vi.fn());
const switchMock = vi.hoisted(() => vi.fn());
const declineMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return { ...actual, serverAcceptMyInvite: acceptMock, serverSwitchWorkspace: switchMock, serverDeclineMyInvite: declineMock };
});

import { PendingInvitesBanner } from "./PendingInvitesBanner";

const invite = {
  token: "invite-1", companyId: "company-1", companySlug: "acme", companyName: "Acme",
  role: "viewer" as const, expiresAt: "2026-12-01", createdAt: "2026-01-01",
};

const renderBanner = (props: Partial<React.ComponentProps<typeof PendingInvitesBanner>> = {}) =>
  render(<PendingInvitesBanner invites={[invite]} loading={false} loadError={null} onRetry={vi.fn()} onInviteAccepted={vi.fn()} onDismiss={vi.fn()} {...props} />);

beforeEach(() => {
  acceptMock.mockReset();
  switchMock.mockReset();
  declineMock.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});

describe("PendingInvitesBanner", () => {
  it("shows invite load failure and retries", () => {
    const retry = vi.fn();
    renderBanner({ invites: [], loadError: "Unable to load invitations.", onRetry: retry });
    expect(screen.getByTestId("status-invites-load-error")).toHaveTextContent("Unable to load invitations.");
    fireEvent.click(screen.getByTestId("button-retry-invites"));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps a joined confirmation when a parent refresh removes the invite", async () => {
    acceptMock.mockResolvedValue({ ok: true, companyId: "company-1" });
    const accepted = vi.fn();
    const view = renderBanner({ onInviteAccepted: accepted });
    fireEvent.click(screen.getByTestId("button-accept-invite-invite-1"));
    await waitFor(() => expect(screen.getByText("Joined Acme!")).toBeTruthy());
    expect(accepted).toHaveBeenCalledWith({ token: "invite-1", companyId: "company-1", companyName: "Acme" });
    view.rerender(<PendingInvitesBanner invites={[]} loading={false} loadError={null} onRetry={vi.fn()} onInviteAccepted={accepted} onDismiss={vi.fn()} />);
    expect(screen.getByText("Joined Acme!")).toBeTruthy();
  });

  it("shows a joined invitation accepted from Account Settings", () => {
    renderBanner({
      invites: [],
      acceptedInvites: [{ token: invite.token, companyId: invite.companyId, companyName: invite.companyName }],
    });
    expect(screen.getByText("Joined Acme!")).toBeTruthy();
    expect(screen.getByTestId("button-switch-workspace-company-1")).toBeTruthy();
  });

  it("calls switch and presents a switch failure", async () => {
    acceptMock.mockResolvedValue({ ok: true, companyId: "company-1" });
    switchMock.mockResolvedValue({ ok: false, error: "Switch denied." });
    renderBanner();
    fireEvent.click(screen.getByTestId("button-accept-invite-invite-1"));
    await waitFor(() => screen.getByTestId("button-switch-workspace-company-1"));
    fireEvent.click(screen.getByTestId("button-switch-workspace-company-1"));
    await waitFor(() => expect(screen.getByTestId("status-switch-error")).toHaveTextContent("Switch denied."));
    expect(switchMock).toHaveBeenCalledWith("company-1");
  });

  it.each(["unknown", "used", "declined", "revoked", "replaced", "expired", "inactive", "session_refresh_required", "email_mismatch"] as const)(
    "shows and disables %s invitation failures",
    async (reason) => {
      acceptMock.mockResolvedValue({ ok: false, reason });
      renderBanner();
      fireEvent.click(screen.getByTestId("button-accept-invite-invite-1"));
      await waitFor(() => expect(screen.getByTestId("status-invitation-error").textContent).not.toEqual(""));
      expect(screen.getByTestId("button-accept-invite-invite-1")).toBeDisabled();
    },
  );
});
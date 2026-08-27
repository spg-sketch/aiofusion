import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  serverGetInviteInfo: vi.fn(),
  serverAcceptInvite: vi.fn(),
  serverDeclineInvite: vi.fn(),
  serverLogout: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  ...authMocks,
}));

vi.mock("../lib/apiHelpers", () => ({
  apiBase: () => "",
}));

import { InviteAcceptPage } from "./InviteAcceptPage";

describe("InviteAcceptPage signed-in identity conflict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.serverGetInviteInfo.mockResolvedValue({
      ok: true,
      invite: {
        companyName: "Spencer Gallagher",
        email: "abbe@example.test",
        roleLabel: "Content Team Member",
        existingUser: true,
      },
    });
    authMocks.serverAcceptInvite.mockResolvedValue({
      ok: false,
      error: "This browser is already signed in as a different user. Sign out, then reopen this invitation.",
      reason: "signed_in_as_different_user",
    });
  });

  it("offers to sign out instead of silently switching users", async () => {
    render(<InviteAcceptPage token="invite-token" onAccepted={vi.fn()} />);

    const acceptButton = await screen.findByRole("button", { name: /accept & join/i });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(screen.getByText(/already signed in as a different user/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /sign out and continue/i })).toBeInTheDocument();
  });
});
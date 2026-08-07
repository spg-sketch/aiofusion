import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock auth module - must be declared before the component import
// ---------------------------------------------------------------------------
const mockGetImpersonationState = vi.fn();
const mockServerExitImpersonation = vi.fn();

vi.mock("../lib/auth", () => ({
  getImpersonationState: (...args: unknown[]) => mockGetImpersonationState(...args),
  serverExitImpersonation: (...args: unknown[]) => mockServerExitImpersonation(...args),
  getSession: () => ({ username: "client-account", role: "client" }),
}));

import { ImpersonationBanner } from "./ImpersonationBanner";

// ---------------------------------------------------------------------------
// Capture window.location.replace calls without navigating
// ---------------------------------------------------------------------------
let lastReplace: string | undefined;

beforeEach(() => {
  lastReplace = undefined;
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      ...window.location,
      replace: (url: string) => {
        lastReplace = url;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImpersonationBanner - exit flow", () => {
  it("renders nothing when not impersonating", async () => {
    mockGetImpersonationState.mockResolvedValue(null);
    const { container } = render(<ImpersonationBanner />);
    // Give the async state load a tick to settle
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders the banner when an impersonation state is active", async () => {
    mockGetImpersonationState.mockResolvedValue({ by: "admin", byRole: "admin" });
    render(<ImpersonationBanner />);
    await waitFor(() => {
      expect(screen.getByText(/exit view-as/i)).toBeInTheDocument();
    });
  });

  it("navigates to /?aio_exit_impersonation=1 on a successful exit", async () => {
    mockGetImpersonationState.mockResolvedValue({ by: "admin", byRole: "admin" });
    mockServerExitImpersonation.mockResolvedValue({
      ok: true,
      session: { username: "admin", role: "admin" },
    });

    render(<ImpersonationBanner />);
    await waitFor(() => screen.getByText(/exit view-as/i));

    fireEvent.click(screen.getByText(/exit view-as/i));

    await waitFor(() => {
      expect(lastReplace).toBe("/?aio_exit_impersonation=1");
    });
  });

  it("redirects to /?aio_session_expired=1 when the admin stash cookie has expired (401)", async () => {
    mockGetImpersonationState.mockResolvedValue({ by: "admin", byRole: "admin" });
    mockServerExitImpersonation.mockResolvedValue({
      ok: false,
      error: "Your original session expired. Please sign in again.",
    });

    render(<ImpersonationBanner />);
    await waitFor(() => screen.getByText(/exit view-as/i));

    fireEvent.click(screen.getByText(/exit view-as/i));

    await waitFor(() => {
      expect(lastReplace).toBe("/?aio_session_expired=1");
    });
  });

  it("shows agency wording when an agency is viewing one of its client accounts", async () => {
    // Session role is 'client' (mocked above) and the stashed session belongs
    // to an agency - this must NOT be labelled 'master'.
    mockGetImpersonationState.mockResolvedValue({ by: "agency-account", byRole: "agency" });
    render(<ImpersonationBanner />);
    await waitFor(() => {
      expect(screen.getByText(/viewing client account/i)).toBeInTheDocument();
      expect(screen.getByText(/back to my agency account/i)).toBeInTheDocument();
      expect(screen.queryByText(/master/i)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Login notice - verify the expired-session notice surfaces in the login form
// ---------------------------------------------------------------------------
describe("Login form - aio_session_expired notice", () => {
  it("shows the expired-session message when initialNotice is set", async () => {
    // PlatformHomePage is the component that receives initialNotice from App.tsx
    // when ?aio_session_expired=1 is in the URL. We test the prop directly here
    // to confirm the wiring works without needing a full App render.
    const { PlatformHomePage } = await import("../pages/PlatformHomePage");

    const notice = "Your admin session expired while in view-as mode. Please sign in again.";

    render(
      <PlatformHomePage
        onCreateProject={() => {}}
        onContinueToProjects={() => {}}
        onArchivedProjects={() => {}}
        onGuidance={() => {}}
        onBackToLanding={() => {}}
        session={null}
        onLoginSuccess={() => {}}
        onSignOut={() => {}}
        onManageUsers={() => {}}
        onManageSubAccounts={() => {}}
        onTokenUsage={() => {}}
        initialNotice={notice}
      />,
    );

    expect(screen.getByText(notice)).toBeInTheDocument();
  });
});

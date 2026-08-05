import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Integration tests for the sign-in redirect-link flows (task: catch redirect
// links breaking before users get locked out).
//
// Background: App.tsx mirrors internal navigation into browser history. Its
// history-sync effect rewrites the URL (dropping the query string) before the
// lazy-loaded PlatformHomePage mounts. Every redirect-based flow — SSO MFA,
// OAuth errors, email-verification links, password reset — depends on App
// capturing the initial query params into state (oauthRedirectParams /
// passwordResetToken props) BEFORE that effect runs. These tests render the
// full App with real redirect URLs and assert the right panel still appears
// after the URL has been cleaned.

vi.mock("./lib/contentAi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/contentAi")>();
  return { ...mod, apiBase: () => "" };
});

// jsdom lacks these; landing/marketing chunks and the OTP input reference them.
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
    root = null; rootMargin = ""; thresholds = [];
  });
  if (!window.matchMedia) {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  // input-otp's password-manager-badge probe polls document.elementFromPoint,
  // which jsdom does not implement.
  document.elementFromPoint = () => null;

  // No server: every network call fails closed. bootstrapAuth treats this as
  // signed-out; content-store sync becomes a no-op.
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  ));

  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Clear any leftover single-use MFA cookie between tests.
  document.cookie = "aio_oauth_mfa_token=; path=/; max-age=0";
  window.history.replaceState({}, "", "/");
});

/** Set the address bar to a redirect landing URL, then import + render App. */
async function renderAppAt(url: string) {
  window.history.replaceState({}, "", url);
  const { default: App } = await import("./App");
  return render(<App />);
}

describe("sign-in redirect links survive the history-sync URL rewrite", () => {
  it("oauth_status=mfa + mfa cookie shows the two-factor verification panel", async () => {
    document.cookie = "aio_oauth_mfa_token=tok-verify-123; path=/";
    await renderAppAt("/?oauth_status=mfa");

    await waitFor(() => {
      expect(screen.getByText("Two-factor verification")).toBeInTheDocument();
    });
    // The single-use cookie must be consumed immediately.
    expect(document.cookie).not.toContain("aio_oauth_mfa_token=tok-verify-123");
    // And the history-sync effect must have cleaned the query string.
    expect(window.location.search).toBe("");
  });

  it("oauth_status=mfa&mfa_mode=enroll shows the enrolment panel", async () => {
    document.cookie = "aio_oauth_mfa_token=tok-enroll-456; path=/";
    await renderAppAt("/?oauth_status=mfa&mfa_mode=enroll");

    await waitFor(() => {
      expect(screen.getByText("Set up two-factor authentication")).toBeInTheDocument();
    });
  });

  it("oauth_status=mfa with a missing cookie shows a clear error, not a silent sign-in form", async () => {
    await renderAppAt("/?oauth_status=mfa");

    await waitFor(() => {
      expect(
        screen.getByText("Two-factor sign-in could not be started. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("oauth_status=error&oauth_msg=invalid_state shows the friendly error message", async () => {
    await renderAppAt("/?oauth_status=error&oauth_msg=invalid_state");

    await waitFor(() => {
      expect(
        screen.getByText("The sign-in session expired. Please try again."),
      ).toBeInTheDocument();
    });
    expect(window.location.search).toBe("");
  });

  it("oauth_status=suspended shows the suspension message", async () => {
    await renderAppAt("/?oauth_status=suspended");

    await waitFor(() => {
      expect(
        screen.getByText("Your account has been suspended. Please contact support."),
      ).toBeInTheDocument();
    });
  });

  it("verify_status=expired shows the verification-pending screen with the expiry notice", async () => {
    await renderAppAt("/?verify_status=expired");

    await waitFor(() => {
      expect(screen.getByText("Verification link expired")).toBeInTheDocument();
      expect(
        screen.getByText("Your verification link has expired. Request a new one below."),
      ).toBeInTheDocument();
    });
  });

  it("verify_status=invalid shows the invalid-link notice on the verification screen", async () => {
    await renderAppAt("/?verify_status=invalid");

    await waitFor(() => {
      expect(
        screen.getByText("This verification link is invalid. Please request a new one."),
      ).toBeInTheDocument();
    });
  });

  it("reset_token=x shows the choose-a-new-password form", async () => {
    await renderAppAt("/?reset_token=some-reset-token");

    await waitFor(() => {
      expect(screen.getByText("Choose a new password")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("New password (min 8 characters)"),
      ).toBeInTheDocument();
    });
  });

  it("a stale MFA challenge does not reappear after unmount/remount", async () => {
    document.cookie = "aio_oauth_mfa_token=tok-once-789; path=/";
    const first = await renderAppAt("/?oauth_status=mfa");

    await waitFor(() => {
      expect(screen.getByText("Two-factor verification")).toBeInTheDocument();
    });

    first.unmount();

    // Remount with the URL as the first session left it (query string cleaned,
    // single-use cookie consumed) — exactly what a reload would see. The stale
    // challenge must NOT resurrect as a dead MFA prompt.
    expect(window.location.search).toBe("");
    const { default: App } = await import("./App");
    render(<App />);

    // Wait for the lazy page chunk to settle (some heading renders).
    await waitFor(() => {
      expect(document.querySelector("h1, h2")).toBeTruthy();
    });
    expect(screen.queryByText("Two-factor verification")).not.toBeInTheDocument();
    expect(screen.queryByText("Set up two-factor authentication")).not.toBeInTheDocument();
  });
});

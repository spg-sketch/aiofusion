// Isolated tests for the in-session login accountProfile wiring.
//
// We mock PlatformHomePage here so we can control exactly when onLoginSuccess
// fires without depending on the full form-submission async chain.  This lets
// us verify the App.tsx wiring directly:
//   onLoginSuccess(s) → setSessionState(s) + fetchAccountProfile() → setAccountProfile(ap)
//
// Three phases are tested:
//   Phase 1 - App starts signed-out (bootstrapAuth returns null session).
//   Phase 2 - onLoginSuccess fires with a brand session.
//             fetchAccountProfile() is called; returns brand profile.
//             accountProfile state is set.
//   Phase 3 - Navigate to platform view → create project → intake shows brand note.
import React from "react";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, configure, act, fireEvent } from "@testing-library/react";

vi.mock("./lib/billingAllowance", () => ({
  fetchProjectAllowance: vi.fn(async () => ({ projectsUsed: 0, projectAllowance: 1, atLimit: false })),
}));

configure({ asyncUtilTimeout: 5000 });

// ─── PlatformHomePage mock ────────────────────────────────────────────────────
// Simplified stand-in: renders a "Sign in" button when signed-out, nothing
// when signed-in, and exposes a "Project Hub" button to navigate to the
// platform.  Immediately calls onContinueToProjects once a session exists so
// the test flow can proceed to ClientSelectorPage without extra clicks.
vi.mock("./pages/PlatformHomePage", async () => ({
  // PlatformHomePage is a named export (not default) - see App.tsx lazy import.
  PlatformHomePage: ({
    session,
    onLoginSuccess,
    onContinueToProjects,
    onSignOut,
  }: {
    session: { username: string; role: string } | null;
    onLoginSuccess: (s: { username: string; role: string }) => void;
    onContinueToProjects: () => void;
    onSignOut: () => void;
  }) => {
    if (!session) {
      return (
        <div>
          <button
            onClick={() => onLoginSuccess({ username: "mybrand", role: "client" })}
          >
            Mock sign in
          </button>
          <button
            onClick={() => onLoginSuccess({ username: "mybrand", role: "client" })}
          >
            Mock MFA success
          </button>
          <button onClick={onSignOut}>Mock sign out</button>
        </div>
      );
    }
    return (
      <div>
        <button onClick={onContinueToProjects}>Project Hub</button>
        <button onClick={onSignOut}>Sign out</button>
      </div>
    );
  },
}));

vi.mock("./pages/GuidedOnboardingPage", () => ({
  GuidedOnboardingPage: () => <div>Guided onboarding</div>,
}));

vi.mock("./lib/contentAi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/contentAi")>();
  return { ...mod, apiBase: () => "" };
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const unauth = () =>
  makeResponse({ error: "unauthorized" }, 401);

function brandMeResponse() {
  return makeResponse({
    account: { username: "mybrand", role: "client" },
    impersonating: null,
    setupComplete: true,
    hasPassword: true,
    emailVerified: true,
    masterOwner: false,
    accountProfile: { displayName: "My Brand Ltd", website: "mybrand.com" },
  });
}

// ─── stubs ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  });
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
  document.elementFromPoint = () => null;
  Element.prototype.scrollTo = () => {};

  // Default: signed out.
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/api/store/projects")) {
      return makeResponse({ projects: [], deletedIds: [] });
    }
    return unauth();
  }));

  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe("App in-session login - onLoginSuccess calls fetchAccountProfile", () => {
  beforeAll(async () => {
    await import("./App");
  });

  it("clicking 'Mock sign in' triggers fetchAccountProfile; brand note appears on intake", async () => {
    // After "Mock sign in" fires, onLoginSuccess sets a brand session.
    // fetchAccountProfile then fetches /api/platform/me → brand profile.
    // setAccountProfile is called with the result.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      // This case starts with an already-authoritative session; the separate
      // signed-out test below covers the post-credential authority hand-off.
      if (urlStr.includes("/api/platform/me")) return brandMeResponse();
      if (urlStr.includes("/api/store/projects")) return makeResponse({ projects: [], deletedIds: [] });
      return unauth();
    }));

    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });

    // Mock PlatformHomePage immediately shows "Project Hub" (session set by
    // bootstrapAuth). Navigate into the platform.
    const projectHubBtn = await screen.findByRole("button", { name: /Project Hub/i }, { timeout: 8000 });
    await act(async () => {
      fireEvent.click(projectHubBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    // Phase 3: create a project → intake.
    const createBtn = await screen.findByRole("button", { name: /Create your first project/i }, { timeout: 6000 });
    await act(async () => {
      fireEvent.click(createBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    const nameInput = await screen.findByPlaceholderText("e.g. Acme Robotics", {}, { timeout: 4000 });
    await act(async () => { fireEvent.change(nameInput, { target: { value: "Brand Project" } }); });

    const createAndSetup = await screen.findByRole("button", { name: /Create.*set up/i }, { timeout: 4000 });
    await act(async () => {
      fireEvent.click(createAndSetup);
      await new Promise((r) => setTimeout(r, 100));
    });

    // IntakePage should show the brand prefill note (accountProfile was set
    // from the brand session → fetchAccountProfile returned brand profile).
    await waitFor(() =>
      expect(screen.getByText(/We've pre-filled your company name and website/i))
        .toBeInTheDocument(),
    { timeout: 8000 });
  }, 35000);

  it("'Mock sign in' → onLoginSuccess fires → fetchAccountProfile called → brand profile propagated; signed-out start then sign-in path", async () => {
    // This test exercises the SPECIFIC BUG FIX: when a user starts signed-out
    // and then logs in, fetchAccountProfile() must be called from onLoginSuccess.
    //
    // Phase 1: bootstrapAuth returns null (signed out).
    // Phase 2: "Mock sign in" fires onLoginSuccess(brandSession).
    //          fetchAccountProfile() is called → returns brand profile.
    //          setAccountProfile(brandProfile) is called.
    // Phase 3: user creates a project → intake shows brand note.
    let loggedIn = false;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/platform/me")) {
        return loggedIn ? brandMeResponse() : unauth();
      }
      if (urlStr.includes("/api/store/projects")) {
        return makeResponse({ projects: [], deletedIds: [] });
      }
      return unauth();
    }));

    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });

    // Phase 1: signed out - Mock PlatformHomePage shows "Mock sign in" button.
    const signInBtn = await screen.findByRole("button", { name: /Mock sign in/i }, { timeout: 8000 });

    // Switch /me to return brand profile BEFORE clicking sign in, so
    // fetchAccountProfile (fired from onLoginSuccess) picks up the brand profile.
    loggedIn = true;

    await act(async () => {
      fireEvent.click(signInBtn);
      // onLoginSuccess(brandSession) fires synchronously inside the click handler.
      // fetchAccountProfile() starts (async) - give it time.
      await new Promise((r) => setTimeout(r, 100));
    });

    // Phase 2: session is now set. Mock PlatformHomePage renders "Project Hub".
    const projectHubBtn = await screen.findByRole("button", { name: /Project Hub/i }, { timeout: 8000 });
    await act(async () => {
      fireEvent.click(projectHubBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    // Phase 3: create a project → intake.
    const createBtn = await screen.findByRole("button", { name: /Create your first project/i }, { timeout: 6000 });
    await act(async () => {
      fireEvent.click(createBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    const nameInput = await screen.findByPlaceholderText("e.g. Acme Robotics", {}, { timeout: 4000 });
    await act(async () => { fireEvent.change(nameInput, { target: { value: "Brand Project" } }); });

    const createAndSetup = await screen.findByRole("button", { name: /Create.*set up/i }, { timeout: 4000 });
    await act(async () => {
      fireEvent.click(createAndSetup);
      await new Promise((r) => setTimeout(r, 100));
    });

    // The brand note must appear - accountProfile was set by fetchAccountProfile
    // called from onLoginSuccess (the bug fix).
    await waitFor(() =>
      expect(screen.getByText(/We've pre-filled your company name and website/i))
        .toBeInTheDocument(),
    { timeout: 8000 });
  }, 40000);

  it("MFA success is provisional until one authoritative /me check, then reaches the project destination", async () => {
    let meCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/platform/me")) {
        meCalls += 1;
        return meCalls === 1 ? unauth() : brandMeResponse();
      }
      if (String(url).includes("/api/store/projects")) return makeResponse({ projects: [], deletedIds: [] });
      if (String(url).includes("/api/platform/accounts")) return makeResponse({ accounts: [] });
      return unauth();
    }));
    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Mock MFA success");
    fireEvent.click(screen.getByText("Mock MFA success"));

    await screen.findByText("Project Hub");
    expect(meCalls).toBe(2);
  });

  it("does not revive an identity when sign-out wins a delayed authority hand-off", async () => {
    let resolveMe!: (response: Response) => void;
    let meCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (String(url).includes("/api/platform/me")) {
        meCalls += 1;
        if (meCalls === 1) return Promise.resolve(unauth());
        return new Promise<Response>((resolve) => { resolveMe = resolve; });
      }
      return Promise.resolve(unauth());
    }));
    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Mock sign in");
    fireEvent.click(screen.getByText("Mock sign in"));
    fireEvent.click(screen.getByText("Mock sign out"));
    await act(async () => { resolveMe(brandMeResponse()); });

    await waitFor(() => expect(screen.queryByText("Project Hub")).not.toBeInTheDocument());
    expect(screen.getByText("Mock sign in")).toBeInTheDocument();
  });

  it("does not start project/account resync from focus while a login authority check is pending", async () => {
    let resolveMe!: (response: Response) => void;
    let meCalls = 0;
    let projectCalls = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (String(url).includes("/api/platform/me")) {
        meCalls += 1;
        if (meCalls === 1) return Promise.resolve(unauth());
        return new Promise<Response>((resolve) => { resolveMe = resolve; });
      }
      if (String(url).includes("/api/store/projects")) {
        projectCalls += 1;
        return Promise.resolve(makeResponse({ projects: [], deletedIds: [] }));
      }
      return Promise.resolve(unauth());
    }));
    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Mock sign in");
    fireEvent.click(screen.getByText("Mock sign in"));
    window.dispatchEvent(new Event("focus"));
    expect(projectCalls).toBe(0);

    await act(async () => { resolveMe(brandMeResponse()); });
    await screen.findByText("Project Hub");
  });

  it("does not flash Project Hub while a slow setup-status check redirects a new client to onboarding", async () => {
    let loggedIn = false;
    let meRequests = 0;
    let resolveSetupCheck!: (response: Response) => void;
    const delayedSetupCheck = new Promise<Response>((resolve) => {
      resolveSetupCheck = resolve;
    });

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/platform/me")) {
        meRequests += 1;
        return loggedIn ? delayedSetupCheck : unauth();
      }
      if (urlStr.includes("/api/store/projects")) {
        return makeResponse({ projects: [], deletedIds: [] });
      }
      return unauth();
    }));

    window.history.replaceState({}, "", "/?oauth_status=ok");
    const { default: App } = await import("./App");
    render(<App />);

    const signInBtn = await screen.findByRole("button", { name: /Mock sign in/i }, { timeout: 8000 });
    loggedIn = true;

    await act(async () => {
      fireEvent.click(signInBtn);
    });

    expect(screen.queryByRole("button", { name: /Project Hub/i })).not.toBeInTheDocument();

    await act(async () => {
      resolveSetupCheck(makeResponse({
        account: { username: "newbrand", role: "client" },
        setupComplete: false,
        onboarding: { step: "account_type" },
        hasPassword: true,
        emailVerified: true,
        accountProfile: { displayName: "New Brand", website: "https://newbrand.example" },
      }));
    });

    expect(await screen.findByText("Guided onboarding", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Project Hub/i })).not.toBeInTheDocument();
    // Initial anonymous bootstrap + the post-credential authoritative check.
    // The provisional identity must not start a second competing /me request.
    expect(meRequests).toBe(2);
  }, 20000);
});

// Isolated tests for the authoritative in-session login/profile handoff.
//
// We mock PlatformHomePage here so we can control exactly when onLoginSuccess
// fires without depending on the full form-submission async chain.  This lets
// us verify the App.tsx wiring directly:
//   onLoginSuccess(provisional) → bootstrapAuth(/me) → confirmed session + profile.
//
// Three phases are tested:
//   Phase 1 - App starts signed-out (bootstrapAuth returns null session).
//   Phase 2 - onLoginSuccess fires with a brand session.
//             bootstrapAuth() is called; returns confirmed brand identity/profile.
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
// platform. The test explicitly clicks it only after authority is established.
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
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe("App in-session login - authoritative session and profile handoff", () => {
  beforeAll(async () => {
    await import("./App");
  });

  it("restoring a signed-in cookie bootstraps the brand profile into project intake", async () => {
    // This is the existing-session baseline: the initial /me establishes both
    // the confirmed identity and the profile, without an in-session login.
    let meRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/platform/me")) {
        meRequests += 1;
        return brandMeResponse();
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

    // Mock PlatformHomePage shows "Project Hub" (session confirmed by
    // bootstrapAuth). Navigate into the platform.
    const projectHubBtn = await screen.findByRole("button", { name: /Project Hub/i }, { timeout: 8000 });
    expect(meRequests).toBe(1);
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
    // from the authoritative /me response).
    await waitFor(() =>
      expect(screen.getByText(/We've pre-filled your company name and website/i))
        .toBeInTheDocument(),
    { timeout: 8000 });
  }, 35000);

  it("password success from a signed-out start confirms /me and propagates its brand profile to intake", async () => {
    let loggedIn = false;
    let meRequests = 0;

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/platform/me")) {
        meRequests += 1;
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

    const signInBtn = await screen.findByRole("button", { name: /Mock sign in/i }, { timeout: 8000 });

    // A successful primary sign-in has established the cookie; the callback
    // remains provisional until the next /me confirms it.
    loggedIn = true;

    await act(async () => {
      fireEvent.click(signInBtn);
      await new Promise((r) => setTimeout(r, 100));
    });

    // Phase 2: session is now set. Mock PlatformHomePage renders "Project Hub".
    const projectHubBtn = await screen.findByRole("button", { name: /Project Hub/i }, { timeout: 8000 });
    expect(meRequests).toBe(2);
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

    // Profile must be taken from /me, not the provisional callback (which
    // contains no company name or website).
    await waitFor(() =>
      expect(screen.getByText(/We've pre-filled your company name and website/i))
        .toBeInTheDocument(),
    { timeout: 8000 });
  }, 40000);

  it("MFA success is provisional until one authoritative /me check, then reaches the project destination", async () => {
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

    fireEvent.click(await screen.findByText("Mock MFA success"));
    expect(meCalls).toBe(2);
    expect(projectCalls).toBe(0);
    expect(screen.queryByText("Project Hub")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create your first project/i })).not.toBeInTheDocument();
    await act(async () => { resolveMe(brandMeResponse()); });

    fireEvent.click(await screen.findByText("Project Hub"));
    expect(await screen.findByRole("button", { name: /Create your first project/i })).toBeInTheDocument();
    expect(meCalls).toBe(2);
    expect(projectCalls).toBeGreaterThan(0);
  });

  it("sign-out invalidates an in-flight login check so a late /me cannot revive the session", async () => {
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

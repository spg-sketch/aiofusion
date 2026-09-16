import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

// Hold the auth destination module just as a cold network chunk would be held.
// This verifies that the App-level auth boundary, rather than the generic root
// Suspense fallback or the prior marketing page, owns the visible hand-off.
const delayedPlatformHome = vi.hoisted(() => {
  let resolve!: (module: { PlatformHomePage: (props: { oauthRedirectParams?: string | null }) => React.ReactNode }) => void;
  const promise = new Promise<{ PlatformHomePage: (props: { oauthRedirectParams?: string | null }) => React.ReactNode }>((done) => {
    resolve = done;
  });
  return { promise, resolve: (module: { PlatformHomePage: (props: { oauthRedirectParams?: string | null }) => React.ReactNode }) => resolve(module) };
});

vi.mock("./pages/PlatformHomePage", () => delayedPlatformHome.promise);

vi.mock("./lib/contentAi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./lib/contentAi")>();
  return { ...mod, apiBase: () => "" };
});

describe("auth destination lazy hand-off", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("synchronously replaces marketing on callback Back/Forward while a cold Platform Home chunk is pending", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /The AI Authority Platform/i })).toBeInTheDocument();
    await act(async () => {
      window.history.replaceState(null, "", "/?oauth_status=error&oauth_msg=invalid_state");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    expect(await screen.findByTestId("auth-page-loading")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /The AI Authority Platform/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Loading page")).not.toBeInTheDocument();

    await act(async () => {
      delayedPlatformHome.resolve({
        PlatformHomePage: ({ oauthRedirectParams }) => (
          <main data-testid="delayed-platform-home">
            {oauthRedirectParams}
          </main>
        ),
      });
    });

    expect(await screen.findByTestId("delayed-platform-home")).toHaveTextContent("oauth_status=error");
  });
});
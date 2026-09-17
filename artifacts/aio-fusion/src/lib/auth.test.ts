import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addUser,
  getSubAccounts,
  getVisibleUsernames,
  canViewOwner,
  saveUsers,
  bootstrapAuth,
  clearWorkspaceScopedCaches,
  setSession,
  getSession,
  serverLogin,
  serverSignUp,
  serverAddUser,
  AUTHORITY_TIMEOUT_MS,
  type Session,
} from "./auth";

const adminSession: Session = { username: "admin", role: "admin" };

function seed() {
  saveUsers([
    { username: "admin", password: "pw-admin", role: "admin", createdAt: 1 },
    { username: "agency", password: "pw-agency", role: "user", createdAt: 2 },
    { username: "other", password: "pw-other", role: "user", createdAt: 3 },
  ]);
}

describe("auth sub-accounts and visibility", () => {
  beforeEach(() => {
    localStorage.clear();
    seed();
  });

  it("creates a sub-account linked to its parent", () => {
    const result = addUser("client-a", "pw-client-1", "user", "agency");
    expect(result.ok).toBe(true);
    const subs = getSubAccounts("agency");
    expect(subs.map((u) => u.username)).toEqual(["client-a"]);
    expect(subs[0].parent).toBe("agency");
  });

  it("matches sub-accounts case-insensitively on parent", () => {
    addUser("client-a", "pw-client-1", "user", "AGENCY");
    expect(getSubAccounts("agency").map((u) => u.username)).toEqual(["client-a"]);
  });

  it("returns null (see everything) for an admin session", () => {
    expect(getVisibleUsernames(adminSession)).toBeNull();
  });

  it("returns empty for no session", () => {
    expect(getVisibleUsernames(null)).toEqual([]);
  });

  it("a normal account sees itself plus its sub-accounts (recursively)", () => {
    addUser("client-a", "pw-a-12345", "user", "agency");
    addUser("client-b", "pw-b-12345", "user", "agency");
    addUser("client-a-sub", "pw-as-1234", "user", "client-a");
    const visible = getVisibleUsernames({ username: "agency", role: "user" });
    expect(visible).not.toBeNull();
    expect(new Set(visible!)).toEqual(new Set(["agency", "client-a", "client-b", "client-a-sub"]));
  });

  it("a sub-account sees only its own projects", () => {
    addUser("client-a", "pw-a-12345", "user", "agency");
    const visible = getVisibleUsernames({ username: "client-a", role: "user" });
    expect(visible).toEqual(["client-a"]);
  });

  it("does not leak another top-level account's projects", () => {
    addUser("client-a", "pw-a-12345", "user", "agency");
    const session: Session = { username: "agency", role: "user" };
    expect(canViewOwner(session, "agency")).toBe(true);
    expect(canViewOwner(session, "client-a")).toBe(true);
    expect(canViewOwner(session, "other")).toBe(false);
    expect(canViewOwner(session, undefined)).toBe(false);
  });

  it("admins can view any owner, including unowned projects", () => {
    expect(canViewOwner(adminSession, "anyone")).toBe(true);
    expect(canViewOwner(adminSession, undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// bootstrapAuth - accountProfile flows from /api/platform/me to the caller
// ---------------------------------------------------------------------------

/** Stub fetch to return a shaped /api/platform/me response; all other calls 401. */
function stubMeResponse(body: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/platform/me")) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // status / accounts-cache / migrate - all 401 no-ops.
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("bootstrapAuth - accountProfile server→client path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("surfaces displayName and website for a direct-owner client session", async () => {
    stubMeResponse({
      account: { username: "mybrand", role: "client" },
      impersonating: null,
      setupComplete: true,
      hasPassword: true,
      sessionIdentity: {
        userName: "Jamie Owner",
        userEmail: "jamie@mybrand.test",
        companyName: "My Brand Ltd",
      },
      accountProfile: { displayName: "My Brand Ltd", website: "mybrand.com" },
    });

    const result = await bootstrapAuth();

    expect(result.session?.username).toBe("mybrand");
    expect(result.session?.userName).toBe("Jamie Owner");
    expect(result.session?.userEmail).toBe("jamie@mybrand.test");
    expect(result.session?.companyName).toBe("My Brand Ltd");
    expect(result.accountProfile?.displayName).toBe("My Brand Ltd");
    expect(result.accountProfile?.website).toBe("mybrand.com");
  });

  it("returns accountProfile null for a team-member session (membershipRole present)", async () => {
    stubMeResponse({
      account: { username: "mybrand", role: "client", membershipRole: "viewer" },
      impersonating: null,
      setupComplete: true,
      hasPassword: true,
      accountProfile: { displayName: "My Brand Ltd", website: "mybrand.com" },
    });

    const result = await bootstrapAuth();

    expect(result.session?.membershipRole).toBe("viewer");
    // membershipRole present → must not expose foreign workspace profile
    expect(result.accountProfile).toBeNull();
  });

  it("returns accountProfile null when impersonating another account", async () => {
    stubMeResponse({
      account: { username: "someagency", role: "agency" },
      impersonating: { by: "admin", byRole: "admin" },
      setupComplete: true,
      hasPassword: true,
      accountProfile: { displayName: "Some Agency Ltd", website: "someagency.com" },
    });

    const result = await bootstrapAuth();

    expect(result.session?.username).toBe("someagency");
    expect(result.accountProfile).toBeNull();
  });

  it("does not mutate a cached session after a timed-out authority retry", async () => {
    vi.useFakeTimers();
    setSession({ username: "cached-user", role: "client" });
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = bootstrapAuth();
    await vi.advanceTimersByTimeAsync(AUTHORITY_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(AUTHORITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.session).toBeNull();
    expect(result.error).toMatch(/could not verify your session in time/i);
    // Cache ownership belongs to App's generation-gated hand-off. The pure
    // bootstrap result never clears or revives identity while a newer request
    // may be in flight.
    expect(getSession()).toEqual({ username: "cached-user", role: "client" });
    vi.useRealTimers();
  });

  it("applies the authority deadline to a stalled /me response body as well as headers", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => new Promise<unknown>(() => {}),
    } as unknown as Response));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = bootstrapAuth();
    await vi.advanceTimersByTimeAsync(AUTHORITY_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(AUTHORITY_TIMEOUT_MS);
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.session).toBeNull();
    expect(result.error).toMatch(/could not verify your session in time/i);
    vi.useRealTimers();
  });

  it("does not fetch /me during credential acceptance; the hand-off bootstraps it once", async () => {
    let meRequests = 0;
    let accountCacheRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/login")) {
        return new Response(JSON.stringify({
          account: { username: "newbrand", role: "client" },
          needsSetup: true,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/platform/me")) {
        meRequests += 1;
        return new Response(JSON.stringify({
          account: { username: "newbrand", role: "client" },
          setupComplete: false,
          onboarding: { step: "account_type" },
          hasPassword: true,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/platform/accounts")) accountCacheRequests += 1;
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }));

    const accepted = await serverLogin("newbrand", "correct-password");
    expect(accepted.ok).toBe(true);
    expect(meRequests).toBe(0);
    expect(accountCacheRequests).toBe(0);

    const bootstrapped = await bootstrapAuth();
    expect(bootstrapped.session?.username).toBe("newbrand");
    expect(bootstrapped.needsSetup).toBe(true);
    expect(meRequests).toBe(1);
    expect(accountCacheRequests).toBe(0);
  });

  it("does not refresh accounts during auto-login registration before authority bootstrap", async () => {
    let meRequests = 0;
    let accountCacheRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/platform/signup")) {
        return new Response(JSON.stringify({ username: "newbrand", role: "client" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/platform/me")) meRequests += 1;
      if (url.endsWith("/api/platform/accounts")) accountCacheRequests += 1;
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }));

    const result = await serverSignUp({
      name: "New Brand",
      email: "newbrand@example.test",
      companyName: "New Brand",
      password: "safe-password",
    });

    expect(result.ok).toBe(true);
    expect(meRequests).toBe(0);
    expect(accountCacheRequests).toBe(0);
  });
});

describe("workspace switch cache isolation", () => {
  beforeEach(() => localStorage.clear());

  it("removes every bare workspace cache while retaining safe migration and project-id scoped keys", () => {
    const outgoingWorkspaceCaches = [
      "aio.activeProjectId",
      "aio.projects.v1",
      "aio.clientLogos.v1",
      "aio.intake.updatedAt.v1",
      "aio.intake.v2",
      "aio.archive.v1",
      "aio.planner.projects.v1",
      "aio.projectData.archive.v1",
      "aio.scoring.v1",
      "aio.auditTiming.visibility",
    ];
    for (const key of outgoingWorkspaceCaches) localStorage.setItem(key, "old-workspace-data");
    localStorage.setItem("aio.store.migrated.v1", "1");
    localStorage.setItem("aio.intake.v2::globally-unique-project-id", "safe-project-data");

    clearWorkspaceScopedCaches();

    for (const key of outgoingWorkspaceCaches) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem("aio.store.migrated.v1")).toBe("1");
    expect(localStorage.getItem("aio.intake.v2::globally-unique-project-id")).toBe("safe-project-data");
  });
});

describe("serverAddUser creation request keys", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("includes the optional creation request key in the platform account body", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ username: "original-client" }), { status: 200 });
      }
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }));

    const result = await serverAddUser("client", "", "client", "Client", {
      autoUsername: true,
      creationRequestKey: "8f1f4c31-0f13-4d3e-a2d4-6e0ee3bb8df3",
    });

    expect(result).toEqual({ ok: true, username: "original-client" });
    const createRequest = requests.find(({ init }) => init?.method === "POST");
    expect(createRequest).toBeTruthy();
    expect(JSON.parse(String(createRequest?.init?.body))).toMatchObject({
      username: "client",
      autoUsername: true,
      creationRequestKey: "8f1f4c31-0f13-4d3e-a2d4-6e0ee3bb8df3",
    });
  });

  it("does not fall back to the suggested username after a malformed auto-username 2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }));

    const result = await serverAddUser("suggested-client", "", "client", "Client", {
      autoUsername: true,
      creationRequestKey: "8f1f4c31-0f13-4d3e-a2d4-6e0ee3bb8df3",
    });

    expect(result).toMatchObject({
      ok: false,
      uncertain: true,
      status: 200,
    });
    expect(result).not.toEqual(expect.objectContaining({ username: "suggested-client" }));
  });
});

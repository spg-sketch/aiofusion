import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addUser,
  getSubAccounts,
  getVisibleUsernames,
  canViewOwner,
  saveUsers,
  bootstrapAuth,
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
      accountProfile: { displayName: "My Brand Ltd", website: "mybrand.com" },
    });

    const result = await bootstrapAuth();

    expect(result.session?.username).toBe("mybrand");
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
});

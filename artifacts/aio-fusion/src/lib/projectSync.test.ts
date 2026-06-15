import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { syncIntakeForProject, ensureDefaultIntakeMigrated } from "./projectSync";

// A fully populated Set-Up blob (a real project's answers).
const FULL = {
  intakeStatus: "Accepted",
  formData: { "4.1": "Bluhalo", "6.2": "https://bluhalo.com" },
};
// A blank Draft (no real answers) - the kind of payload that used to wipe data.
const BLANK = { intakeStatus: "Draft", formData: {} };

// Install a fetch mock. GET .../:id/intake returns `remote`; POST .../intake is
// recorded as a push. Returns the list of pushed bodies for assertions.
function installFetch(remote: { intake: unknown; updatedAt: string | null } | null) {
  const pushed: Array<{ id: string; intake: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, opts?: { method?: string; body?: string }) => {
      const u = String(url);
      const method = (opts?.method || "GET").toUpperCase();
      if (method === "POST" && u.endsWith("/store/projects/intake")) {
        pushed.push(JSON.parse(opts!.body as string));
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }
      if (method === "GET" && u.includes("/intake")) {
        if (!remote) return { ok: false, json: async () => ({}) } as Response;
        return { ok: true, json: async () => remote } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    }),
  );
  return pushed;
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncIntakeForProject - blank can never overwrite populated", () => {
  it("does not let a blank shared copy overwrite populated local answers, and heals the server", async () => {
    localStorage.setItem("aio.intake.v2::p1", JSON.stringify(FULL));
    const pushed = installFetch({ intake: BLANK, updatedAt: new Date().toISOString() });

    const replaced = await syncIntakeForProject("p1");

    // Local answers are untouched...
    expect(JSON.parse(localStorage.getItem("aio.intake.v2::p1")!)).toEqual(FULL);
    expect(replaced).toBe(false);
    // ...and the populated copy was pushed up to restore the wiped server copy.
    expect(pushed).toHaveLength(1);
    expect(pushed[0].intake).toEqual(FULL);
  });

  it("adopts the shared copy when local is a blank Draft (never pushes the blank up)", async () => {
    localStorage.setItem("aio.intake.v2::p1", JSON.stringify(BLANK));
    const pushed = installFetch({ intake: FULL, updatedAt: new Date().toISOString() });

    const replaced = await syncIntakeForProject("p1");

    expect(JSON.parse(localStorage.getItem("aio.intake.v2::p1")!)).toEqual(FULL);
    expect(replaced).toBe(true);
    expect(pushed).toHaveLength(0);
  });

  it("never pushes a blank local copy up when the server has nothing yet", async () => {
    localStorage.setItem("aio.intake.v2::p1", JSON.stringify(BLANK));
    const pushed = installFetch(null);

    await syncIntakeForProject("p1");

    expect(pushed).toHaveLength(0);
  });
});

describe("default project key migration + recovery", () => {
  it("copies the legacy bare-key Set-Up onto the namespaced default key without deleting the bare key", () => {
    localStorage.setItem("aio.intake.v2", JSON.stringify(FULL));

    ensureDefaultIntakeMigrated();

    expect(JSON.parse(localStorage.getItem("aio.intake.v2::default")!)).toEqual(FULL);
    // bare key is preserved (never destructive)
    expect(JSON.parse(localStorage.getItem("aio.intake.v2")!)).toEqual(FULL);
  });

  it("never overwrites an existing namespaced default copy", () => {
    localStorage.setItem("aio.intake.v2", JSON.stringify(BLANK));
    localStorage.setItem("aio.intake.v2::default", JSON.stringify(FULL));

    ensureDefaultIntakeMigrated();

    expect(JSON.parse(localStorage.getItem("aio.intake.v2::default")!)).toEqual(FULL);
  });

  it("recovers a wiped default project: migrates the bare-key answers then pushes them up", async () => {
    // The device still holds Bluhalo's full answers under the legacy bare key,
    // the server copy has been wiped to a blank Draft, and there is no
    // namespaced copy yet.
    localStorage.setItem("aio.intake.v2", JSON.stringify(FULL));
    const pushed = installFetch({ intake: BLANK, updatedAt: new Date().toISOString() });

    const replaced = await syncIntakeForProject("default");

    // The answers were migrated onto the namespaced key and kept intact...
    expect(JSON.parse(localStorage.getItem("aio.intake.v2::default")!)).toEqual(FULL);
    expect(replaced).toBe(false);
    // ...and pushed back up to restore the server copy.
    expect(pushed).toHaveLength(1);
    expect(pushed[0].intake).toEqual(FULL);
  });
});

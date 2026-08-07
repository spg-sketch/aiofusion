import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { syncIntakeForProject, ensureDefaultIntakeMigrated, assertActiveProjectConsistency, setKnownProjectIds, assertActiveProjectConsistencyFromCache } from "./projectSync";

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

describe("assertActiveProjectConsistency", () => {
  const KEY = "aio.activeProjectId";

  it("happy path: valid stored ID is kept untouched", () => {
    localStorage.setItem(KEY, "proj-abc");
    assertActiveProjectConsistency(["proj-abc", "proj-xyz"]);
    expect(localStorage.getItem(KEY)).toBe("proj-abc");
  });

  it("stale ID: stored ID not in the list is cleared with a console warning", () => {
    localStorage.setItem(KEY, "proj-stale");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertActiveProjectConsistency(["proj-abc", "proj-xyz"]);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("proj-stale");
    warnSpy.mockRestore();
  });

  it("missing ID: nothing stored is a no-op (no warning, nothing cleared)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertActiveProjectConsistency(["proj-abc"]);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("empty project list: treated as not yet loaded - no-op even with a stored ID", () => {
    localStorage.setItem(KEY, "proj-abc");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertActiveProjectConsistency([]);
    expect(localStorage.getItem(KEY)).toBe("proj-abc");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("assertActiveProjectConsistencyFromCache (module-level cache)", () => {
  const KEY = "aio.activeProjectId";

  it("uses the cached project IDs registered via setKnownProjectIds", () => {
    setKnownProjectIds(["proj-a", "proj-b"]);
    localStorage.setItem(KEY, "proj-a");
    assertActiveProjectConsistencyFromCache();
    expect(localStorage.getItem(KEY)).toBe("proj-a");
  });

  it("clears a stale ID using the cached list", () => {
    setKnownProjectIds(["proj-a", "proj-b"]);
    localStorage.setItem(KEY, "proj-old");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertActiveProjectConsistencyFromCache();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("create-project flow: cache updated before switch keeps the new ID intact", () => {
    // Simulates confirmCreateProject: existing cache has proj-a only,
    // a new project proj-new is created, cache is updated to include it,
    // then setActiveProjectId (via assertActiveProjectConsistencyFromCache)
    // must not clear the new ID.
    setKnownProjectIds(["proj-a"]);
    // Simulate cache update that happens in confirmCreateProject before the switch
    setKnownProjectIds(["proj-a", "proj-new"]);
    localStorage.setItem(KEY, "proj-new");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertActiveProjectConsistencyFromCache();
    expect(localStorage.getItem(KEY)).toBe("proj-new");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

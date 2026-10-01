import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { syncIntakeForProject, ensureDefaultIntakeMigrated, assertActiveProjectConsistency, setKnownProjectIds, assertActiveProjectConsistencyFromCache, auditAndRecoverLocalProjects, deleteRemoteProject, syncProjectsOnLoad } from "./projectSync";

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

describe("confirmed project deletion", () => {
  it.each([401, 403, 503, 500])("reports HTTP %s without changing the local list", async (status) => {
    localStorage.setItem("aio.projects.v1", JSON.stringify([{ id: "keep", name: "Keep" }]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Please retry" }), { status })));
    expect(await deleteRemoteProject("keep")).toEqual({ ok: false, error: "Please retry" });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toHaveLength(1);
  });

  it("reports network and malformed-success failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await deleteRemoteProject("network")).toMatchObject({ ok: false, error: expect.stringContaining("try again") });
    vi.mocked(fetch).mockResolvedValue(new Response("<html>proxy</html>", { status: 200 }));
    expect(await deleteRemoteProject("network")).toMatchObject({ ok: false });
  });

  it("targets only the exact ID and filters an older in-flight list response", async () => {
    const rows = ["delete-exact", "keep-exact"].map((id) => ({
      id, name: "Duplicate", data: { id, name: "Duplicate" }, logo: null, owner: "admin",
    }));
    localStorage.setItem("aio.projects.v1", JSON.stringify(rows.map((p) => p.data)));
    let resolveList!: (response: Response) => void;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ ok: true }));
      return new Promise<Response>((resolve) => { resolveList = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    const loading = syncProjectsOnLoad();
    expect(await deleteRemoteProject("delete-exact")).toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      credentials: "include", body: JSON.stringify({ id: "delete-exact" }),
    });
    resolveList(new Response(JSON.stringify({ projects: rows, deletedIds: [] })));
    expect(await loading).toMatchObject({ projects: [{ id: "keep-exact" }] });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([expect.objectContaining({ id: "keep-exact" })]);
    // A later authoritative read can legitimately restore the same ID.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: rows, deletedIds: [] }))));
    expect(await syncProjectsOnLoad()).toMatchObject({
      projects: [expect.objectContaining({ id: "keep-exact" }), expect.objectContaining({ id: "delete-exact" })],
    });
  });

  it("drops a stale device copy on refresh without pushing it back", async () => {
    localStorage.setItem("aio.projects.v1", JSON.stringify([{ id: "deleted-elsewhere", name: "Old" }]));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ projects: [], deletedIds: ["deleted-elsewhere"] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await syncProjectsOnLoad()).toMatchObject({ projects: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("replaces another account's cached projects with the authorized server list", async () => {
    localStorage.setItem("aio.projects.v1", JSON.stringify([
      { id: "other-account", name: "Private cached project", owner: "other" },
    ]));
    localStorage.setItem("aio.clientLogos.v1", JSON.stringify({ "other-account": "secret-logo" }));
    localStorage.setItem("aio.activeProjectId", "other-account");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      projects: [{
        id: "authorized",
        name: "Authorized",
        data: { id: "authorized", name: "Authorized" },
        logo: null,
        owner: "current",
        updatedAt: null,
      }],
      deletedIds: [],
    })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncProjectsOnLoad();

    expect(result).toMatchObject({ projects: [{ id: "authorized" }] });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([
      expect.objectContaining({ id: "authorized" }),
    ]);
    expect(localStorage.getItem("aio.clientLogos.v1")).toBe("{}");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("active project omission confirmation", () => {
  const ACTIVE = {
    id: "active-project",
    name: "Active Project",
    data: { id: "active-project", name: "Active Project" },
    logo: "server-logo",
    owner: "current",
    updatedAt: null,
  };

  beforeEach(() => {
    localStorage.setItem("aio.projects.v1", JSON.stringify([{
      id: "active-project",
      name: "Active Project",
      owner: "current",
    }]));
    localStorage.setItem("aio.clientLogos.v1", JSON.stringify({ "active-project": "cached-logo" }));
  });

  it("uses a second successful pull when the first transiently omits the active project", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [], deletedIds: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [ACTIVE], deletedIds: [] })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncProjectsOnLoad({ activeProjectId: "active-project" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ projects: [{ id: "active-project", name: "Active Project" }] });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([
      expect.objectContaining({ id: "active-project", name: "Active Project" }),
    ]);
  });

  it("drops a project omitted by both successful pulls instead of preserving the cached copy", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      new Response(JSON.stringify({ projects: [], deletedIds: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncProjectsOnLoad({ activeProjectId: "active-project" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ projects: [], logos: {} });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([]);
    expect(JSON.parse(localStorage.getItem("aio.clientLogos.v1")!)).toEqual({});
  });

  it("treats an explicit deletion tombstone as authoritative without confirming", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projects: [], deletedIds: ["active-project"] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncProjectsOnLoad({ activeProjectId: "active-project" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toEqual({ projects: [], logos: {} });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([]);
  });

  it.each([
    { status: 503, expected: null },
    { status: 401, expected: "unauthorized" },
  ] as const)("keeps the old cache when confirmation returns HTTP $status", async ({ status, expected }) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [], deletedIds: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unavailable" }), { status }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await syncProjectsOnLoad({ activeProjectId: "active-project" })).toBe(expected);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([
      { id: "active-project", name: "Active Project", owner: "current" },
    ]);
    expect(JSON.parse(localStorage.getItem("aio.clientLogos.v1")!)).toEqual({
      "active-project": "cached-logo",
    });
  });

  it("does not accept a confirmation response after its signal is aborted", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [], deletedIds: [] })))
      .mockImplementationOnce(async () => {
        controller.abort();
        return new Response(JSON.stringify({ projects: [ACTIVE], deletedIds: [] }));
      });
    vi.stubGlobal("fetch", fetchMock);

    expect(await syncProjectsOnLoad({
      signal: controller.signal,
      activeProjectId: "active-project",
    })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([
      { id: "active-project", name: "Active Project", owner: "current" },
    ]);
  });
});

describe("syncProjectsOnLoad - owner column is authoritative", () => {
  it("overwrites the stale owner inside the data blob with the server's owner column after a hand-off", async () => {
    // The agency created the project (data blob says owner: "agency"), then
    // assigned it to its client: the server's owner COLUMN now says "client1"
    // but the blob still carries the stale creator.
    const serverProject = {
      id: "p1",
      name: "Handed Off",
      data: { id: "p1", name: "Handed Off", owner: "agency" },
      logo: null,
      owner: "Client1", // authoritative column (mixed case to check normalisation)
      updatedAt: new Date().toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, opts?: { method?: string }) => {
        const u = String(url);
        const method = (opts?.method || "GET").toUpperCase();
        if (method === "GET" && u.endsWith("/store/projects")) {
          return { ok: true, status: 200, json: async () => ({ projects: [serverProject], deletedIds: [] }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }),
    );
    const { syncProjectsOnLoad } = await import("./projectSync");
    const result = await syncProjectsOnLoad();
    expect(result).not.toBeNull();
    expect(result).not.toBe("unauthorized");
    const projects = (result as { projects: Array<{ id: string; owner?: string }> }).projects;
    expect(projects.find((p) => p.id === "p1")?.owner).toBe("client1");
    // The merged copy in localStorage carries the corrected owner too.
    const stored = JSON.parse(localStorage.getItem("aio.projects.v1")!) as Array<{ id: string; owner?: string }>;
    expect(stored.find((p) => p.id === "p1")?.owner).toBe("client1");
  });

  it("keeps the blob owner when the server column is a legacy NULL", async () => {
    const serverProject = {
      id: "p2",
      name: "Legacy",
      data: { id: "p2", name: "Legacy", owner: "agency" },
      logo: null,
      owner: null,
      updatedAt: new Date().toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, opts?: { method?: string }) => {
        const u = String(url);
        if ((opts?.method || "GET").toUpperCase() === "GET" && u.endsWith("/store/projects")) {
          return { ok: true, status: 200, json: async () => ({ projects: [serverProject], deletedIds: [] }) } as Response;
        }
        return { ok: true, status: 200, json: async () => ({}) } as Response;
      }),
    );
    const { syncProjectsOnLoad } = await import("./projectSync");
    const result = await syncProjectsOnLoad();
    const projects = (result as { projects: Array<{ id: string; owner?: string }> }).projects;
    expect(projects.find((p) => p.id === "p2")?.owner).toBe("agency");
  });
});

describe("auditAndRecoverLocalProjects", () => {
  it("reports but never recreates a browser-only project in the signed-in account", async () => {
    localStorage.setItem("aio.projects.v1", JSON.stringify([
      { id: "server-1", name: "Shared", owner: "agency" },
      { id: "local-1", name: "Cached only", owner: "agency" },
    ]));
    localStorage.setItem("aio.intake.v2::local-1", JSON.stringify(FULL));
    const postedBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, opts?: { method?: string; body?: string }) => {
      const method = (opts?.method || "GET").toUpperCase();
      if (method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            projects: [{ id: "server-1", name: "Shared", data: {}, logo: null, owner: "agency", updatedAt: null }],
            deletedIds: [],
          }),
        } as Response;
      }
      postedBodies.push(JSON.parse(opts!.body!));
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }));

    const audit = await auditAndRecoverLocalProjects();

    expect(audit).toEqual({
      serverProjectIds: ["server-1"],
      localOnly: [{
        id: "local-1",
        name: "Cached only",
        recovered: false,
        error: "browser-only project cannot be safely assigned to the current account",
      }],
    });
    expect(postedBodies).toEqual([]);
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([
      expect.objectContaining({ id: "server-1" }),
    ]);
  });

  it("clearly reports a cached project that was deleted on the server without reviving it", async () => {
    localStorage.setItem("aio.projects.v1", JSON.stringify([
      { id: "deleted-1", name: "Old cached copy", owner: "agency" },
    ]));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ projects: [], deletedIds: ["deleted-1"] }),
    }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    const audit = await auditAndRecoverLocalProjects();

    expect(audit).toEqual({
      serverProjectIds: [],
      localOnly: [{
        id: "deleted-1",
        name: "Old cached copy",
        recovered: false,
        error: "this project was deleted on the server",
      }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("hydrates a server-only project into the reviewed browser list", async () => {
    localStorage.setItem("aio.projects.v1", JSON.stringify([
      { id: "local-known", name: "Known", owner: "agency" },
    ]));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        projects: [
          { id: "local-known", name: "Known", data: { id: "local-known", name: "Known" }, logo: null, owner: "agency", updatedAt: null },
          { id: "remote-new", name: "From another device", data: { id: "remote-new", name: "From another device" }, logo: null, owner: "client1", updatedAt: null },
        ],
        deletedIds: [],
      }),
    }) as Response));

    const audit = await auditAndRecoverLocalProjects();
    const stored = JSON.parse(localStorage.getItem("aio.projects.v1")!) as Array<{
      id: string;
      owner?: string;
    }>;

    expect(audit).toMatchObject({ serverProjectIds: ["local-known", "remote-new"] });
    expect(stored).toEqual([
      expect.objectContaining({ id: "local-known", owner: "agency" }),
      expect.objectContaining({ id: "remote-new", owner: "client1" }),
    ]);
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

  it("empty authoritative project list clears a stored ID", () => {
    localStorage.setItem(KEY, "proj-abc");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertActiveProjectConsistency([]);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
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

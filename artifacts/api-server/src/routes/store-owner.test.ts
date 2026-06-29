import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Server } from "node:http";

// In-memory state plus column markers and predicate helpers, all hoisted so the
// vi.mock factories below (which run before module init) can reference them.
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Pred =
    | { kind: "eq"; col: string; val: unknown }
    | { kind: "inArray"; col: string; vals: unknown[] }
    | { kind: "and"; parts: Pred[] };

  const state = {
    accounts: [] as Array<{ username: string; passwordHash: string; role: string; parent: string | null }>,
    projects: [] as Array<{ id: string; owner: string | null }>,
  };

  const projectsTable = {
    __table: "projects",
    id: { __col: "id" },
    owner: { __col: "owner" },
    updatedAt: { __col: "updatedAt" },
  };
  const platformAccountsTable = {
    __table: "accounts",
    username: { __col: "username" },
    parent: { __col: "parent" },
  };

  function matches(row: Row, pred: Pred | undefined): boolean {
    if (!pred) return true;
    if (pred.kind === "eq") return row[pred.col] === pred.val;
    if (pred.kind === "inArray") return pred.vals.includes(row[pred.col]);
    return pred.parts.every((p) => matches(row, p));
  }
  function rowsFor(table: unknown): Row[] {
    return (table === projectsTable ? state.projects : state.accounts) as Row[];
  }

  return { state, projectsTable, platformAccountsTable, matches, rowsFor };
});

const state = h.state;

vi.mock("drizzle-orm", () => ({
  eq: (col: { __col: string }, val: unknown) => ({ kind: "eq", col: col.__col, val }),
  inArray: (col: { __col: string }, vals: unknown[]) => ({ kind: "inArray", col: col.__col, vals }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

vi.mock("@workspace/db", () => {
  const db = {
    select: (_projection?: unknown) => ({
      from: (table: unknown) => {
        const all = () => h.rowsFor(table).map((r) => ({ ...r }));
        const builder: any = {
          where: (pred: any) => ({
            limit: () => Promise.resolve(all().filter((r) => h.matches(r, pred))),
            then: (resolve: (v: unknown) => unknown) => resolve(all().filter((r) => h.matches(r, pred))),
          }),
          // getVisibleUsernames awaits .from(table) directly (no where).
          then: (resolve: (v: unknown) => unknown) => resolve(all()),
        };
        return builder;
      },
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (pred: any) => {
          const apply = () => {
            const hit: Record<string, unknown>[] = [];
            for (const r of h.rowsFor(table)) {
              if (h.matches(r, pred)) {
                Object.assign(r, values);
                hit.push(r);
              }
            }
            return hit;
          };
          return {
            returning: () => Promise.resolve(apply().map((r) => ({ ...r }))),
            // Routes that do not call .returning() (e.g. soft-delete) await directly.
            then: (resolve: (v: unknown) => unknown) => {
              apply();
              return resolve(undefined);
            },
          };
        },
      }),
    }),
  };
  return {
    db,
    projectsTable: h.projectsTable,
    platformAccountsTable: h.platformAccountsTable,
    platformSessionsTable: {},
    platformMetaTable: {},
    adminEventsTable: {},
  };
});

import storeRouter from "./store";

describe("POST /api/store/projects/owner (owner reassignment authorization)", () => {
  let server: Server;
  let baseUrl: string;
  // The account the test's auth middleware will attach to each request.
  let actor: { username: string; role: string };

  async function reassign(body: unknown) {
    const res = await fetch(`${baseUrl}/api/store/projects/owner`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, json };
  }

  beforeEach(async () => {
    // admin, an agency with a client, plus an unrelated agency.
    state.accounts = [
      { username: "admin", passwordHash: "", role: "admin", parent: null },
      { username: "agency", passwordHash: "", role: "agency", parent: null },
      { username: "client1", passwordHash: "", role: "client", parent: "agency" },
      { username: "other", passwordHash: "", role: "agency", parent: null },
    ];
    state.projects = [
      { id: "p-agency", owner: "agency" },
      { id: "p-other", owner: "other" },
    ];
    actor = { username: "admin", role: "admin" };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.account = { ...actor } as any;
      next();
    });
    app.use("/api", storeRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("lets the master move any project to any account", async () => {
    const { status, json } = await reassign({ id: "p-other", owner: "agency" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(state.projects.find((p) => p.id === "p-other")?.owner).toBe("agency");
  });

  it("rejects an unknown target account (404)", async () => {
    const { status } = await reassign({ id: "p-agency", owner: "ghost" });
    expect(status).toBe(404);
    expect(state.projects.find((p) => p.id === "p-agency")?.owner).toBe("agency");
  });

  it("returns 404 for a project that does not exist", async () => {
    const { status } = await reassign({ id: "missing", owner: "agency" });
    expect(status).toBe(404);
  });

  it("lets an agency reassign its own project to its client", async () => {
    actor = { username: "agency", role: "agency" };
    const { status } = await reassign({ id: "p-agency", owner: "client1" });
    expect(status).toBe(200);
    expect(state.projects.find((p) => p.id === "p-agency")?.owner).toBe("client1");
  });

  it("stops an agency reassigning a project it cannot see", async () => {
    actor = { username: "agency", role: "agency" };
    const { status } = await reassign({ id: "p-other", owner: "client1" });
    expect(status).toBe(403);
    expect(state.projects.find((p) => p.id === "p-other")?.owner).toBe("other");
  });

  it("stops an agency assigning to an account outside its subtree", async () => {
    actor = { username: "agency", role: "agency" };
    const { status } = await reassign({ id: "p-agency", owner: "other" });
    expect(status).toBe(403);
    expect(state.projects.find((p) => p.id === "p-agency")?.owner).toBe("agency");
  });

  it("validates required fields", async () => {
    expect((await reassign({ owner: "agency" })).status).toBe(400);
    expect((await reassign({ id: "p-agency" })).status).toBe(400);
  });

  it("reports a conflict (409) when the scoped write matches no row", async () => {
    // Simulate a TOCTOU race: the project's owner moves out of the agency's
    // visibility set between the pre-check and the write. The scoped update then
    // affects zero rows and must not report a false success.
    actor = { username: "agency", role: "agency" };
    const project = state.projects.find((p) => p.id === "p-agency")!;
    const realRowsFor = h.rowsFor;
    let firstRead = true;
    vi.spyOn(h, "rowsFor").mockImplementation((table: unknown) => {
      const rows = realRowsFor(table);
      // After the initial owner pre-check passes, flip ownership so the scoped
      // UPDATE no longer matches.
      if (table === h.projectsTable && firstRead) {
        firstRead = false;
      } else if (table === h.projectsTable) {
        project.owner = "other";
      }
      return rows;
    });
    const { status } = await reassign({ id: "p-agency", owner: "client1" });
    vi.restoreAllMocks();
    expect(status).toBe(409);
    expect(project.owner).toBe("other");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Server } from "node:http";

// In-memory state plus column markers and predicate helpers, hoisted so the
// vi.mock factories below (which run before module init) can reference them.
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Pred = { kind: "eq"; col: string; val: unknown };

  const state = {
    accounts: [] as Array<{ username: string; passwordHash: string; role: string; parent: string | null }>,
    meta: [] as Array<{ key: string; value: string }>,
  };

  const platformAccountsTable = {
    __table: "accounts",
    username: { __col: "username" },
    parent: { __col: "parent" },
  };
  const platformMetaTable = { __table: "meta", key: { __col: "key" } };

  function matches(row: Row, pred: Pred | undefined): boolean {
    if (!pred) return true;
    return row[pred.col] === pred.val;
  }
  function rowsFor(table: unknown): Row[] {
    if (table === platformAccountsTable) return state.accounts as Row[];
    if (table === platformMetaTable) return state.meta as Row[];
    return [];
  }

  return { state, platformAccountsTable, platformMetaTable, matches, rowsFor };
});

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
          then: (resolve: (v: unknown) => unknown) => resolve(all()),
        };
        return builder;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const push = () => h.rowsFor(table).push({ ...values });
        return {
          onConflictDoUpdate: () => {
            push();
            return Promise.resolve();
          },
          then: (resolve: (v: unknown) => unknown) => {
            push();
            return resolve(undefined);
          },
        };
      },
    }),
    delete: (table: unknown) => ({
      where: (pred: any) => {
        const rows = h.rowsFor(table);
        for (let i = rows.length - 1; i >= 0; i--) {
          if (h.matches(rows[i], pred)) rows.splice(i, 1);
        }
        return Promise.resolve();
      },
    }),
  };
  return {
    db,
    projectsTable: {},
    platformAccountsTable: h.platformAccountsTable,
    platformMetaTable: h.platformMetaTable,
    platformSessionsTable: {},
    platformUsersTable: {},
    adminEventsTable: {},
  };
});

import platformRouter from "./platform";

describe("POST /api/platform/accounts (creation gating + role coercion)", () => {
  let server: Server;
  let baseUrl: string;
  let actor: { username: string; role: string };

  async function create(body: unknown) {
    const res = await fetch(`${baseUrl}/api/platform/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, json };
  }

  function created(username: string) {
    return h.state.accounts.find((a) => a.username === username);
  }

  beforeEach(async () => {
    h.state.accounts = [
      { username: "admin", passwordHash: "", role: "admin", parent: null },
      { username: "agency", passwordHash: "", role: "agency", parent: null },
      { username: "client1", passwordHash: "", role: "client", parent: "agency" },
    ];
    h.state.meta = [];
    actor = { username: "admin", role: "admin" };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.account = { ...actor } as any;
      next();
    });
    app.use("/api", platformRouter);
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

  it("lets the master create an agency with the requested role honoured", async () => {
    const { status, json } = await create({
      username: "newagency",
      password: "pw123456",
      role: "agency",
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(created("newagency")?.role).toBe("agency");
    expect(created("newagency")?.parent).toBe("admin");
  });

  it("lets the master create a direct client", async () => {
    const { status } = await create({ username: "directclient", password: "pw123456", role: "client" });
    expect(status).toBe(200);
    expect(created("directclient")?.role).toBe("client");
  });

  it("coerces an agency's requested role to client regardless of what is asked", async () => {
    actor = { username: "agency", role: "agency" };
    const { status } = await create({ username: "sub1", password: "pw123456", role: "agency" });
    expect(status).toBe(200);
    expect(created("sub1")?.role).toBe("client");
    expect(created("sub1")?.parent).toBe("agency");
  });

  it("blocks a direct client (leaf account) from creating any account", async () => {
    actor = { username: "client1", role: "client" };
    const before = h.state.accounts.length;
    const { status } = await create({ username: "grandchild", password: "pw123456", role: "client" });
    expect(status).toBe(403);
    expect(h.state.accounts.length).toBe(before);
  });

  it("stores an optional display name when provided", async () => {
    const { status } = await create({
      username: "named",
      password: "pw123456",
      role: "client",
      displayName: "Friendly Name",
    });
    expect(status).toBe(200);
    expect(h.state.meta.some((m) => m.value.includes("Friendly Name"))).toBe(true);
  });

  it("rejects a duplicate username (409)", async () => {
    const { status } = await create({ username: "agency", password: "pw123456", role: "client" });
    expect(status).toBe(409);
  });

  it("validates a missing or too-short password", async () => {
    expect((await create({ username: "x9", password: "no", role: "client" })).status).toBe(400);
  });
});

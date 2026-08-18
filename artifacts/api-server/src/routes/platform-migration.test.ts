import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Server } from "node:http";

// ---------------------------------------------------------------------------
// Minimal in-memory DB and logger hoisted so vi.mock factories can use them.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  type AccountRow = {
    username: string;
    passwordHash: string;
    role: string;
    parent: string | null;
  };
  const state = {
    accounts: [] as AccountRow[],
    meta: [] as Array<{ key: string; value: string }>,
  };
  const warnMessages: string[] = [];

  const platformAccountsTable = {
    __table: "accounts",
    username: { __col: "username" },
    key: { __col: "key" },
  };
  const platformMetaTable = { __table: "meta", key: { __col: "key" } };

  return { state, warnMessages, platformAccountsTable, platformMetaTable };
});

vi.mock("drizzle-orm", () => ({
  eq: (col: { __col: string }, val: unknown) => ({ kind: "eq", col: col.__col, val }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
  isNull: () => ({ kind: "isNull" }),
  ne: () => ({}),
  inArray: () => ({}),
  like: () => ({}),
  lte: () => ({}),
  gte: () => ({}),
  ilike: () => ({}),
  gt: () => ({}),
  desc: (col: unknown) => col,
  count: () => "count(*)",
}));

vi.mock("@workspace/db", () => {
  function rowsFor(table: unknown): unknown[] {
    if (table === h.platformAccountsTable) return h.state.accounts;
    if (table === h.platformMetaTable) return h.state.meta;
    return [];
  }
  function matches(row: Record<string, unknown>, pred: { kind: string; col: string; val: unknown } | undefined): boolean {
    if (!pred) return true;
    if (pred.kind === "eq") return row[pred.col] === pred.val;
    return true;
  }

  const db = {
    select: (_p?: unknown) => ({
      from: (table: unknown) => ({
        where: (pred: unknown) => ({
          limit: () => Promise.resolve((rowsFor(table) as Record<string, unknown>[]).filter((r) => matches(r, pred as any))),
          then: (resolve: (v: unknown) => unknown) =>
            resolve((rowsFor(table) as Record<string, unknown>[]).filter((r) => matches(r, pred as any))),
        }),
        then: (resolve: (v: unknown) => unknown) => resolve(rowsFor(table).map((r) => ({ ...(r as object) }))),
        orderBy: () => ({ limit: () => Promise.resolve([]) }),
        groupBy: () => ({ then: (resolve: (v: unknown) => unknown) => resolve([]) }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const rows = rowsFor(table) as Record<string, unknown>[];
        // onConflictDoNothing must be awaitable (the migration code does
        // `const result = await db.insert().values().onConflictDoNothing()`)
        // AND support `.returning()` (used by the account-creation endpoint).
        const makeConflictResult = () => {
          const isConflict = rows.some((r) => r["username"] === values["username"]);
          const rowCount = isConflict ? 0 : 1;
          if (!isConflict) rows.push({ ...values });
          const result: any = Promise.resolve({ rowCount });
          result.returning = () => Promise.resolve(isConflict ? [] : [{ username: values["username"] }]);
          return result;
        };
        return {
          onConflictDoNothing: () => makeConflictResult(),
          onConflictDoUpdate: () => Promise.resolve(),
          then: (resolve: (v: unknown) => unknown) => {
            rows.push({ ...values });
            return resolve(undefined);
          },
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (_vals: unknown) => ({
        where: () => Promise.resolve({ rowCount: 0 }),
      }),
    }),
    delete: (_table: unknown) => ({
      where: () => Promise.resolve(),
    }),
    execute: () => Promise.resolve(),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  };

  return {
    db,
    platformAccountsTable: h.platformAccountsTable,
    platformMetaTable: h.platformMetaTable,
    platformSessionsTable: {},
    platformUsersTable: {},
    platformCompaniesTable: {},
    platformMembershipsTable: {},
    projectsTable: {},
    projectSnapshotsTable: {},
    archiveItemsTable: {},
    plannerItemsTable: {},
    scoringConfigsTable: {},
    mediaOutletsTable: {},
    mediaContactsTable: {},
    mediaCategoriesTable: {},
    tokenUsageTable: {},
    auditLocksTable: {},
    adminEventsTable: {},
    platformEmailVerificationsTable: {},
    platformPasswordResetsTable: {},
    platformInvitationsTable: {},
  };
});

// Capture logger.warn calls so we can assert on them.
vi.mock("../lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => {
      const msg = args.find((a) => typeof a === "string");
      if (msg) h.warnMessages.push(msg as string);
    },
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// POST /api/platform/migrate - orphan-client guard
// ---------------------------------------------------------------------------

describe("POST /api/platform/migrate - client orphan guard", () => {
  let server: Server;
  let baseUrl: string;

  async function migrate(users: unknown[]) {
    const res = await fetch(`${baseUrl}/api/platform/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ users }),
    });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  }

  beforeEach(async () => {
    h.state.accounts = [{ username: "admin", passwordHash: "", role: "admin", parent: null }];
    h.state.meta = [];
    h.warnMessages.length = 0;

    const app = express();
    app.use(express.json());
    // Simulate an admin session so the migration endpoint is reachable.
    app.use((req, _res, next) => {
      req.account = { username: "admin", role: "admin" } as any;
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

  it("skips a client-role account with no parent and logs a warning", async () => {
    const before = h.state.accounts.length;
    const { status } = await migrate([
      { username: "orphanclient", password: "pw12345678", role: "client" },
    ]);
    expect(status).toBe(200);
    // The orphaned client must NOT have been inserted.
    expect(h.state.accounts.length).toBe(before);
    // A warning must have been emitted.
    expect(h.warnMessages.some((m) => m.includes("orphanclient") || m.includes("client"))).toBe(true);
  });

  it("still inserts a client-role account whose parent exists in the DB", async () => {
    // An existing parent account must be present so the tree makes sense.
    h.state.accounts.push({ username: "agency", passwordHash: "", role: "agency", parent: null });
    const before = h.state.accounts.length;
    const { status, json } = await migrate([
      { username: "childclient", password: "pw12345678", role: "client", parent: "agency" },
    ]);
    expect(status).toBe(200);
    // Even with a parent provided, the migration coerces role to "user" (legacy
    // localStorage only knew admin/user). The account should be inserted.
    expect(h.state.accounts.length).toBeGreaterThan(before);
    expect(json?.inserted).toBeGreaterThanOrEqual(1);
  });

  it("skips a client-role account with a dangling parent (parent does not exist)", async () => {
    const before = h.state.accounts.length;
    const { status } = await migrate([
      { username: "orphanwithdangling", password: "pw12345678", role: "client", parent: "nonexistent-agency" },
    ]);
    expect(status).toBe(200);
    // The account must NOT be inserted - dangling parent would make it invisible.
    expect(h.state.accounts.length).toBe(before);
    // A warning must have been emitted.
    expect(h.warnMessages.some((m) => m.includes("orphanwithdangling") || m.includes("parent"))).toBe(true);
  });

  it("skips a client-role account nested under a client parent (forbidden nesting)", async () => {
    // Seed a client account as a potential (invalid) parent.
    h.state.accounts.push({ username: "parentclient", passwordHash: "", role: "client", parent: "admin" });
    const before = h.state.accounts.length;
    const { status } = await migrate([
      { username: "nestedclient", password: "pw12345678", role: "client", parent: "parentclient" },
    ]);
    expect(status).toBe(200);
    // The nested client must NOT be inserted.
    expect(h.state.accounts.length).toBe(before);
    expect(h.warnMessages.some((m) => m.includes("nestedclient") || m.includes("parent"))).toBe(true);
  });

  it("accepts an admin-role account with no parent (top-level)", async () => {
    const before = h.state.accounts.length;
    const { status, json } = await migrate([
      { username: "admin2", password: "pw12345678", role: "admin" },
    ]);
    expect(status).toBe(200);
    expect(json?.inserted).toBeGreaterThanOrEqual(1);
    expect(h.state.accounts.length).toBeGreaterThan(before);
  });

  it("accepts a user-role account with no parent (top-level agency)", async () => {
    const before = h.state.accounts.length;
    const { status, json } = await migrate([
      { username: "topagency", password: "pw12345678", role: "user" },
    ]);
    expect(status).toBe(200);
    expect(json?.inserted).toBeGreaterThanOrEqual(1);
    expect(h.state.accounts.length).toBeGreaterThan(before);
  });

  it("allows a client to reference a parent from the same migration batch", async () => {
    // No pre-existing agency - it arrives in the same batch as its client.
    const before = h.state.accounts.length;
    const { status, json } = await migrate([
      { username: "batchagency", password: "pw12345678", role: "user" },
      { username: "batchclient", password: "pw12345678", role: "client", parent: "batchagency" },
    ]);
    expect(status).toBe(200);
    // Both accounts should be inserted.
    expect(h.state.accounts.length).toBeGreaterThan(before + 1);
    expect(json?.inserted).toBeGreaterThanOrEqual(2);
  });
});

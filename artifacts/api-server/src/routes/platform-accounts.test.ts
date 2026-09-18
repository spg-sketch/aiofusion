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
    companies: [] as Array<{ slug: string; role: string; parentSlug: string | null }>,
    meta: [] as Array<{ key: string; value: string }>,
  };

  const platformAccountsTable = {
    __table: "accounts",
    username: { __col: "username" },
    parent: { __col: "parent" },
  };
  const platformMetaTable = { __table: "meta", key: { __col: "key" } };
  const platformCompaniesTable = { __table: "companies", slug: { __col: "slug" } };

  function matches(row: Row, pred: Pred | undefined): boolean {
    if (!pred) return true;
    return row[pred.col] === pred.val;
  }
  function rowsFor(table: unknown): Row[] {
    if (table === platformAccountsTable) return state.accounts as Row[];
    if (table === platformMetaTable) return state.meta as Row[];
    if (table === platformCompaniesTable) return state.companies as Row[];
    return [];
  }

  return { state, platformAccountsTable, platformCompaniesTable, platformMetaTable, matches, rowsFor };
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
          // Mirrors Postgres: insert nothing on a username conflict and return
          // the inserted rows (empty array when skipped).
           onConflictDoNothing: () => ({
            returning: () => {
              const rows = h.rowsFor(table);
               const conflictColumn = "key" in values ? "key" : "username";
               if (rows.some((r) => r[conflictColumn] === values[conflictColumn])) {
                return Promise.resolve([]);
              }
              push();
               return Promise.resolve([
                 {
                   [conflictColumn]: values[conflictColumn],
                 },
               ]);
            },
          }),
          then: (resolve: (v: unknown) => unknown) => {
            push();
            return resolve(undefined);
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (pred: any) => {
          for (const row of h.rowsFor(table)) {
            if (h.matches(row, pred)) Object.assign(row, values);
          }
          return Promise.resolve();
        },
      }),
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
     transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return {
    db,
    projectsTable: {},
    platformAccountsTable: h.platformAccountsTable,
    platformCompaniesTable: h.platformCompaniesTable,
    platformMetaTable: h.platformMetaTable,
    platformSessionsTable: {},
    platformUsersTable: {},
    adminEventsTable: {},
  };
});

vi.mock("../lib/billing", () => ({
  getBillingState: () => Promise.resolve(null),
  getBetaTrialSummary: () => ({ status: "eligible", startedAt: null, endsAt: null, daysRemaining: 0 }),
  getPackageCapacity: (slug: string) => Promise.resolve({
    billingSlug: slug,
    kind: "agency",
    access: "free",
    included: 999,
    purchased: 0,
    reserved: 0,
    used: 0,
    remaining: 999,
    allowance: 999,
    overLimit: false,
  }),
  hasPaidSubscription: () => false,
  releaseAddonForOwnerUnlocked: () => Promise.resolve(),
  reserveAddonForOwnerUnlocked: () => Promise.resolve(),
  startBetaTrial: () => Promise.resolve(null),
  withBillingLock: (_slug: string, fn: (slug: string) => Promise<unknown>) => fn(_slug),
  withBillingLocks: (slugs: string[], fn: (roots: string[]) => Promise<unknown>) => fn(slugs),
  assignAddonToNewProjectUnlocked: () => Promise.resolve(),
  detachAddonForProjectTransferUnlocked: () => Promise.resolve(),
}));

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
    h.state.companies = [];
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

  it("always sets the parent when autoUsername picks a suffixed slug on a collision", async () => {
    // "agency" is already taken, so with autoUsername=true the server should
    // try "agency-1" (or further suffixes) - the parent must survive the retry.
    actor = { username: "admin", role: "admin" };
    const { status, json } = await create({
      username: "agency",
      password: "pw123456",
      role: "client",
      autoUsername: true,
      creationRequestKey: "master-auto-create-0001",
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    // The suffixed account must carry a parent - not be orphaned.
    const inserted = h.state.accounts.find((a) => a.username === json.username);
    expect(inserted).toBeDefined();
    expect(inserted?.parent).toBeTruthy();
  });

  it("sets the parent even when agency creates a client with a colliding username", async () => {
    // Add a pre-existing account that will collide with the requested name.
    h.state.accounts.push({ username: "newclient", passwordHash: "", role: "client", parent: "agency" });
    actor = { username: "agency", role: "agency" };
    const { status, json } = await create({
      username: "newclient",
      password: "pw123456",
      role: "client",
      autoUsername: true,
      creationRequestKey: "agency-auto-create-0001",
    });
    expect(status).toBe(200);
    // The created account (with a suffix) must have "agency" as its parent.
    const inserted = h.state.accounts.find((a) => a.username === json.username);
    expect(inserted?.parent).toBe("agency");
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/accounts/:username/logo
// ---------------------------------------------------------------------------

describe("GET /api/platform/accounts/:username/logo", () => {
  let server: Server;
  let baseUrl: string;
  let actor: { username: string; role: string };

  // Minimal valid PNG data URL (1×1 transparent pixel).
  const SAMPLE_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  async function getLogo(username: string) {
    return fetch(`${baseUrl}/api/platform/accounts/${username}/logo`, {
      credentials: "include",
    });
  }

  beforeEach(async () => {
    h.state.accounts = [
      { username: "admin", passwordHash: "", role: "admin", parent: null },
      { username: "agency", passwordHash: "", role: "agency", parent: null },
      { username: "otheragency", passwordHash: "", role: "agency", parent: null },
      { username: "client1", passwordHash: "", role: "client", parent: "agency" },
    ];
    h.state.meta = [];
    actor = { username: "agency", role: "agency" };

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

  it("returns 404 when the managed client has no logo", async () => {
    const res = await getLogo("client1");
    expect(res.status).toBe(404);
  });

  it("returns the binary image when the managed client has a logo", async () => {
    h.state.meta.push({ key: "account:image:logo:client1", value: SAMPLE_DATA_URL });
    const res = await getLogo("client1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("returns 403 when the actor does not manage the target account", async () => {
    actor = { username: "otheragency", role: "agency" };
    h.state.meta.push({ key: "account:image:logo:client1", value: SAMPLE_DATA_URL });
    const res = await getLogo("client1");
    expect(res.status).toBe(403);
  });

  it("allows an admin to fetch any account's logo", async () => {
    actor = { username: "admin", role: "admin" };
    h.state.meta.push({ key: "account:image:logo:client1", value: SAMPLE_DATA_URL });
    const res = await getLogo("client1");
    expect(res.status).toBe(200);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

type TestAccount = {
  username: string;
  role: string;
  parent: string | null;
  membershipRole?: string;
  projectAccess?: string[] | null;
};

type TestActor = TestAccount | null;

// The route is backed by a real disposable PGlite database. Auth and billing
// are kept deliberately small here so these tests exercise the project,
// snapshot, tombstone, and scope SQL without touching a real database or
// external billing state.
const h = vi.hoisted(() => ({
  accounts: [] as TestAccount[],
  actor: null as TestActor,
  client: null as any,
  db: null as any,
}));

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  h.client = client;
  h.db = db;

  await client.exec(`
    CREATE TABLE platform_accounts (
      username varchar PRIMARY KEY,
      password_hash text NOT NULL DEFAULT '',
      role varchar NOT NULL DEFAULT 'user',
      parent varchar,
      max_seats integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      email varchar,
      website varchar,
      status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE projects (
      id varchar PRIMARY KEY,
      name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      intake jsonb,
      logo text,
      owner varchar,
      tier varchar(16),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE project_snapshots (
      id serial PRIMARY KEY,
      project_id varchar NOT NULL,
      name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      intake jsonb,
      logo text,
      owner varchar,
      reason varchar NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return {
    ...schema,
    db,
    pool: { end: () => client.close() },
  };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (
    req: { account?: TestActor },
    res: { status: (code: number) => { json: (body: unknown) => unknown } },
    next: () => void,
  ) => {
    if (!req.account) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    next();
  },
}));

vi.mock("../lib/platform-auth", () => ({
  normUsername: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
  getAccount: async (username: string) =>
    h.accounts.find((account) => account.username === username) ?? null,
  getVisibleUsernames: async (actor: TestAccount) => {
    if (actor.role === "admin") return null;
    const visible = new Set([actor.username]);
    const own = h.accounts.find((account) => account.username === actor.username);
    if (own?.parent) visible.add(own.parent);
    const queue = [actor.username];
    while (queue.length) {
      const parent = queue.shift()!;
      for (const child of h.accounts.filter((account) => account.parent === parent)) {
        if (!visible.has(child.username)) {
          visible.add(child.username);
          queue.push(child.username);
        }
      }
    }
    return [...visible];
  },
  isRestrictedMaster: (account: TestAccount) =>
    account.role === "admin" &&
    account.membershipRole !== undefined &&
    account.membershipRole !== "owner",
  MASTER_OWNER_REQUIRED_MESSAGE: "Only the master account owner can perform this action.",
  canAccessProjects: (account: TestAccount) => account.membershipRole !== "billing",
  canWriteProjects: (account: TestAccount) =>
    account.membershipRole !== "billing" && account.membershipRole !== "viewer",
}));

vi.mock("../lib/billing", () => ({
  getProjectAllowance: () => Promise.resolve(999),
  assignAddonToNewProjectUnlocked: () => Promise.resolve(),
  withBillingLock: (_slug: string, fn: (slug: string) => Promise<unknown>) => fn(_slug),
  listBillingProjects: () => Promise.resolve([]),
  detachAddonForProjectTransfer: () => Promise.resolve(),
}));

vi.mock("../lib/admin-events", () => ({
  logAdminEvent: () => Promise.resolve(),
}));

import { db, projectsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import storeRouter from "./store";

describe("protected individual project deletion", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (h.actor) req.account = { ...h.actor } as NonNullable<typeof req.account>;
      next();
    });
    app.use("/api", storeRouter);
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await h.client.close();
  });

  beforeEach(async () => {
    // Recreate the snapshot table on every test: the backup-failure case drops
    // it to make the snapshot write fail, and all state remains disposable.
    await h.client.exec(`
      DROP TABLE IF EXISTS project_snapshots;
      DROP FUNCTION IF EXISTS move_project_owner_after_snapshot();
      TRUNCATE projects, platform_accounts RESTART IDENTITY;
      CREATE TABLE project_snapshots (
        id serial PRIMARY KEY,
        project_id varchar NOT NULL,
        name varchar NOT NULL DEFAULT '',
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        intake jsonb,
        logo text,
        owner varchar,
        reason varchar NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    h.accounts = [
      { username: "admin", role: "admin", parent: null },
      { username: "agency", role: "agency", parent: "admin" },
      { username: "client", role: "client", parent: "agency" },
      { username: "other", role: "agency", parent: null },
    ];
    await h.client.query(
      `INSERT INTO platform_accounts (username, role, parent)
       VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9), ($10, $11, $12)`,
      [
        "admin", "admin", null,
        "agency", "agency", "admin",
        "client", "client", "agency",
        "other", "agency", null,
      ],
    );
    h.actor = { username: "admin", role: "admin", parent: null };
  });

  async function seedProjects() {
    await db.insert(projectsTable).values([
      {
        id: "p-agency",
        name: "Agency project",
        data: { id: "p-agency", name: "Agency project" },
        intake: { formData: { "4.1": "Agency Co" } },
        owner: "agency",
      },
      {
        id: "p-client",
        name: "Client project",
        data: { id: "p-client", name: "Client project" },
        owner: "client",
      },
      {
        id: "p-other",
        name: "Other project",
        data: { id: "p-other", name: "Other project" },
        owner: "other",
      },
    ]);
  }

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
    return {
      status: response.status,
      json: (await response.json().catch(() => null)) as any,
    };
  }

  async function deleteProject(id: string) {
    return request("/store/projects/delete", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
  }

  it("soft-deletes inherited admin-visible projects one at a time without touching other projects or accounts", async () => {
    await seedProjects();

    expect((await deleteProject("p-agency")).status).toBe(200);
    let list = await request("/store/projects");
    expect(list.status).toBe(200);
    expect(list.json.projects.map((project: { id: string }) => project.id).sort()).toEqual([
      "p-client",
      "p-other",
    ]);
    expect(list.json.deletedIds).toEqual(["p-agency"]);

    expect((await deleteProject("p-client")).status).toBe(200);
    list = await request("/store/projects");
    expect(list.json.projects.map((project: { id: string }) => project.id)).toEqual(["p-other"]);
    expect(list.json.deletedIds.sort()).toEqual(["p-agency", "p-client"]);

    const projects = await h.client.query(
      "SELECT id, owner, deleted_at FROM projects ORDER BY id",
    );
    expect(projects.rows).toEqual([
      expect.objectContaining({ id: "p-agency", owner: "agency", deleted_at: expect.anything() }),
      expect.objectContaining({ id: "p-client", owner: "client", deleted_at: expect.anything() }),
      expect.objectContaining({ id: "p-other", owner: "other", deleted_at: null }),
    ]);
    const snapshots = await h.client.query(
      "SELECT project_id, reason FROM project_snapshots ORDER BY project_id",
    );
    expect(snapshots.rows).toEqual([
      { project_id: "p-agency", reason: "pre-delete" },
      { project_id: "p-client", reason: "pre-delete" },
    ]);
    const accounts = await h.client.query(
      "SELECT username, role, parent FROM platform_accounts ORDER BY username",
    );
    expect(accounts.rows).toEqual([
      { username: "admin", role: "admin", parent: null },
      { username: "agency", role: "agency", parent: "admin" },
      { username: "client", role: "client", parent: "agency" },
      { username: "other", role: "agency", parent: null },
    ]);
  });

  it("refuses deletion when the pre-delete backup cannot be written", async () => {
    await seedProjects();
    await h.client.exec("DROP TABLE project_snapshots");

    const result = await deleteProject("p-agency");
    expect(result.status).toBe(503);
    expect(result.json.ok).not.toBe(true);

    const row = await h.client.query(
      "SELECT deleted_at FROM projects WHERE id = 'p-agency'",
    );
    expect(row.rows[0]?.deleted_at).toBeNull();
  });

  it("blocks signed-out, foreign-owner, and unassigned project deletion", async () => {
    await seedProjects();

    h.actor = null;
    expect((await deleteProject("p-agency")).status).toBe(401);

    h.actor = {
      username: "agency",
      role: "agency",
      parent: "admin",
      projectAccess: ["p-agency"],
    };
    expect((await deleteProject("p-other")).status).toBe(403);
    expect((await deleteProject("p-client")).status).toBe(403);
    const rows = await h.client.query(
      "SELECT id, deleted_at FROM projects WHERE id IN ('p-client', 'p-other') ORDER BY id",
    );
    expect(rows.rows).toEqual([
      { id: "p-client", deleted_at: null },
      { id: "p-other", deleted_at: null },
    ]);
  });

  it("blocks restricted master admin/content members but leaves owner and legacy master deletes available", async () => {
    await seedProjects();

    h.actor = { username: "admin", role: "admin", parent: null, membershipRole: "admin" };
    let result = await deleteProject("p-agency");
    expect(result.status).toBe(403);
    expect(result.json.error).toBe("Only the master account owner can perform this action.");

    h.actor = { username: "admin", role: "admin", parent: null, membershipRole: "content" };
    result = await deleteProject("p-agency");
    expect(result.status).toBe(403);
    expect(result.json.error).toBe("Only the master account owner can perform this action.");

    h.actor = { username: "admin", role: "admin", parent: null, membershipRole: "owner" };
    expect((await deleteProject("p-agency")).status).toBe(200);

    // Legacy master sessions have no membershipRole and retain owner-level
    // behavior for backward compatibility.
    h.actor = { username: "admin", role: "admin", parent: null };
    expect((await deleteProject("p-client")).status).toBe(200);
  });

  it("does not apply the restricted-master guard to agency project owners", async () => {
    await seedProjects();
    await db.insert(projectsTable).values({
      id: "p-agency-owned",
      name: "Agency-owned project",
      data: { id: "p-agency-owned", name: "Agency-owned project" },
      owner: "agency",
    });
    h.actor = { username: "agency", role: "agency", parent: "admin" };

    expect((await deleteProject("p-agency-owned")).status).toBe(200);
    const row = await h.client.query(
      "SELECT owner, deleted_at FROM projects WHERE id = 'p-agency-owned'",
    );
    expect(row.rows[0]).toEqual(expect.objectContaining({
      owner: "agency",
      deleted_at: expect.anything(),
    }));
  });

  it("keeps the tombstone when stale hub and intake writes arrive after deletion", async () => {
    await seedProjects();
    expect((await deleteProject("p-agency")).status).toBe(200);

    h.actor = { username: "agency", role: "agency", parent: "admin" };
    expect(
      (
        await request("/store/projects/upsert", {
          method: "POST",
          body: JSON.stringify({
            id: "p-agency",
            name: "Stale hub copy",
            data: { id: "p-agency", name: "Stale hub copy" },
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/store/projects/intake", {
          method: "POST",
          body: JSON.stringify({
            id: "p-agency",
            intake: { formData: { "4.1": "Stale intake copy", "5.1": "answer" } },
          }),
        })
      ).status,
    ).toBe(200);

    const row = await h.client.query(
      "SELECT deleted_at, name, intake FROM projects WHERE id = 'p-agency'",
    );
    expect(row.rows[0]?.deleted_at).not.toBeNull();
    expect(row.rows[0]?.name).toBe("Stale hub copy");
    expect(row.rows[0]?.intake).toEqual({
      formData: { "4.1": "Stale intake copy", "5.1": "answer" },
    });
    const list = await request("/store/projects");
    expect(list.json.projects.map((project: { id: string }) => project.id)).toEqual(["p-client"]);
    expect(list.json.deletedIds).toEqual(["p-agency"]);
  });

  it("reports a conflict instead of false success when scope disappears before the write", async () => {
    await seedProjects();
    h.actor = {
      username: "agency",
      role: "agency",
      parent: "admin",
    };

    // The trigger models an ownership transfer that commits after the
    // authorization read/backup but before the scoped soft-delete UPDATE.
    await h.client.exec(`
      CREATE FUNCTION move_project_owner_after_snapshot() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE projects SET owner = 'other' WHERE id = NEW.project_id;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER move_owner_after_snapshot
      AFTER INSERT ON project_snapshots
      FOR EACH ROW EXECUTE FUNCTION move_project_owner_after_snapshot();
    `);

    const result = await deleteProject("p-agency");
    expect(result.status).toBe(409);
    const row = await h.client.query(
      "SELECT owner, deleted_at FROM projects WHERE id = 'p-agency'",
    );
    expect(row.rows[0]).toEqual({ owner: "other", deleted_at: null });
  });

  it("preserves the transferred owner while deleting the project tombstone", async () => {
    await seedProjects();
    await h.client.query(
      "UPDATE projects SET owner = 'client' WHERE id = 'p-agency'",
    );
    h.actor = { username: "admin", role: "admin", parent: null };

    expect((await deleteProject("p-agency")).status).toBe(200);
    const row = await h.client.query(
      "SELECT owner, deleted_at FROM projects WHERE id = 'p-agency'",
    );
    expect(row.rows[0]).toEqual(expect.objectContaining({
      owner: "client",
      deleted_at: expect.anything(),
    }));
  });
});
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
  allowance: 999,
  lockOwners: [] as string[],
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
    CREATE TABLE media_discoveries (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      candidate_key text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      candidate jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      reviewed_by varchar,
      rejection_reason text,
      contact_id integer,
      outlet_id integer
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
  checkProjectCapacityUnlocked: async (owner: string, projectId: string) => {
    const rows = await h.client.query(
      "SELECT id FROM projects WHERE owner = $1 AND id <> $2 AND deleted_at IS NULL",
      [owner, projectId],
    );
    const allowed = rows.rows.length < h.allowance;
    return {
      allowed,
      error: allowed ? undefined : "Package capacity reached.",
      capacity: {
        billingSlug: owner,
        kind: owner === "admin" ? "master" : "client",
        access: "paid",
        included: h.allowance,
        purchased: 0,
        reserved: rows.rows.length,
        used: rows.rows.length,
        remaining: Math.max(0, h.allowance - rows.rows.length),
        allowance: h.allowance,
        overLimit: rows.rows.length > h.allowance,
      },
    };
  },
  assignAddonToNewProjectUnlocked: () => Promise.resolve(),
  withBillingLock: async (_slug: string, fn: (slug: string) => Promise<unknown>) => {
    let root = _slug;
    const seen = new Set<string>();
    while (!seen.has(root)) {
      seen.add(root);
      const parent = h.accounts.find((account) => account.username === root)?.parent;
      if (!parent) break;
      const parentAccount = h.accounts.find((account) => account.username === parent);
      if (!parentAccount || parentAccount.role === "admin") break;
      root = parent;
    }
    h.lockOwners.push(root);
    return fn(root);
  },
  withBillingLocks: (_slugs: string[], fn: (roots: string[]) => Promise<unknown>) => fn(_slugs),
  resolveBillingSlug: async (slug: string) => {
    const account = h.accounts.find((item) => item.username === slug);
    return account?.parent && account.parent !== "admin" ? account.parent : slug;
  },
  detachAddonForProjectTransferUnlocked: () => Promise.resolve(),
  releaseAddonForDeletedProjectUnlocked: () => Promise.resolve(),
  reconcileProjectAddonOwnershipUnlocked: () => Promise.resolve(),
}));

vi.mock("../lib/admin-events", () => ({
  logAdminEvent: () => Promise.resolve(),
}));

import { db, projectSnapshotsTable, projectsTable } from "@workspace/db";
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
      { username: "direct-client", role: "client", parent: null },
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
    h.allowance = 999;
    h.lockOwners = [];
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

  async function upsertProject(id: string, name = id) {
    return request("/store/projects/upsert", {
      method: "POST",
      body: JSON.stringify({ id, name, data: { id, name } }),
    });
  }

  async function intakeProject(id: string) {
    return request("/store/projects/intake", {
      method: "POST",
      body: JSON.stringify({
        id,
        intake: { formData: { "4.1": id, "5.1": "answer" } },
      }),
    });
  }

  async function restoreProject(id: string, snapshotId: number) {
    return request("/store/projects/restore", {
      method: "POST",
      body: JSON.stringify({ id, snapshotId }),
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

  it("backs up before deleting when seven occupied snapshot IDs are ahead of the counter", async () => {
    await seedProjects();
    await h.client.exec(`
      INSERT INTO project_snapshots (id, project_id, name, data, reason)
      SELECT n, 'existing-backup-' || n, 'Existing backup', '{"preserved":true}'::jsonb, 'import'
      FROM generate_series(1, 7) AS n;
    `);
    expect((await deleteProject("p-agency")).status).toBe(200);
    const snapshots = await h.client.query("SELECT id, project_id, data, reason FROM project_snapshots ORDER BY id");
    expect(snapshots.rows).toHaveLength(8);
    expect(snapshots.rows.slice(0, 7)).toEqual(Array.from({ length: 7 }, (_, index) =>
      expect.objectContaining({ id: index + 1, project_id: `existing-backup-${index + 1}`, data: { preserved: true }, reason: "import" }),
    ));
    expect(snapshots.rows[7]).toEqual(expect.objectContaining({
      id: 8, project_id: "p-agency", reason: "pre-delete", data: expect.objectContaining({ id: "p-agency" }),
    }));
    const project = await h.client.query("SELECT deleted_at FROM projects WHERE id = 'p-agency'");
    expect(project.rows[0].deleted_at).not.toBeNull();
  });

  it("still refuses deletion if snapshot ID collision recovery is exhausted", async () => {
    await seedProjects();
    await h.client.exec(`
      INSERT INTO project_snapshots (id, project_id, name, data)
      SELECT n, 'existing-backup-' || n, 'Existing backup', '{"preserved":true}'::jsonb
      FROM generate_series(1, 8) AS n;
    `);
    expect((await deleteProject("p-agency")).status).toBe(503);
    const project = await h.client.query("SELECT deleted_at FROM projects WHERE id = 'p-agency'");
    expect(project.rows[0].deleted_at).toBeNull();
    const snapshots = await h.client.query("SELECT count(*)::int AS total FROM project_snapshots");
    expect(snapshots.rows[0].total).toBe(8);
  });

  it("does not retry or delete on a different snapshot uniqueness failure", async () => {
    await seedProjects();
    await h.client.exec(`
      CREATE UNIQUE INDEX snapshot_name_unique ON project_snapshots(name);
      INSERT INTO project_snapshots (project_id, name)
      SELECT 'another-project', name FROM projects WHERE id = 'p-agency';
    `);
    expect((await deleteProject("p-agency")).status).toBe(503);
    const counter = await h.client.query("SELECT last_value FROM project_snapshots_id_seq");
    expect(Number(counter.rows[0].last_value)).toBe(2);
    const project = await h.client.query("SELECT deleted_at FROM projects WHERE id = 'p-agency'");
    expect(project.rows[0].deleted_at).toBeNull();
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

  it("enforces a direct client's one-project beta allowance for upsert, without blocking edits", async () => {
    h.allowance = 1;
    h.actor = { username: "direct-client", role: "client", parent: null };

    expect((await upsertProject("client-one")).status).toBe(200);
    expect((await upsertProject("client-two")).status).toBe(403);
    expect((await upsertProject("client-one", "Edited")).status).toBe(200);

    const row = await h.client.query(
      "SELECT name FROM projects WHERE id = 'client-one'",
    );
    expect(row.rows[0]?.name).toBe("Edited");
  });

  it("enforces a direct client's one-project beta allowance for intake, without blocking edits", async () => {
    h.allowance = 1;
    h.actor = { username: "direct-client", role: "client", parent: null };

    expect((await intakeProject("intake-one")).status).toBe(200);
    expect((await intakeProject("intake-two")).status).toBe(403);
    expect((await intakeProject("intake-one")).status).toBe(200);
  });

  it("blocks restoring a deleted project at the cap but allows restoring an active checkpoint", async () => {
    h.allowance = 1;
    h.actor = { username: "client", role: "client", parent: "agency" };
    await db.insert(projectsTable).values([
      {
        id: "live-project",
        name: "Live",
        data: { version: "live" },
        owner: "client",
        deletedAt: null,
      },
      {
        id: "deleted-project",
        name: "Deleted",
        data: { version: "deleted" },
        owner: "client",
        deletedAt: new Date(),
      },
    ]);
    const [deletedSnapshot] = await db
      .insert(projectSnapshotsTable)
      .values({
        projectId: "deleted-project",
        name: "Recovered",
        data: { version: "recovered" },
        owner: "client",
        reason: "upsert",
      })
      .returning({ id: projectSnapshotsTable.id });

    const blocked = await restoreProject("deleted-project", deletedSnapshot!.id);
    expect(blocked.status).toBe(403);
    const deletedRow = await h.client.query(
      "SELECT deleted_at FROM projects WHERE id = 'deleted-project'",
    );
    expect(deletedRow.rows[0]?.deleted_at).not.toBeNull();

    const [activeSnapshot] = await db
      .insert(projectSnapshotsTable)
      .values({
        projectId: "live-project",
        name: "Checkpoint",
        data: { version: "checkpoint" },
        owner: "client",
        reason: "upsert",
      })
      .returning({ id: projectSnapshotsTable.id });
    h.actor = { username: "admin", role: "admin", parent: null };
    const active = await restoreProject("live-project", activeSnapshot!.id);
    expect(active.status).toBe(200);
    const liveRow = await h.client.query(
      "SELECT data FROM projects WHERE id = 'live-project'",
    );
    expect(liveRow.rows[0]?.data).toEqual({ version: "checkpoint" });

    // The staff actor is restoring a child-owned project, so the lock must be
    // rooted at the agency billing account rather than "admin".
    expect(h.lockOwners).toEqual(["agency", "agency"]);
  });
});
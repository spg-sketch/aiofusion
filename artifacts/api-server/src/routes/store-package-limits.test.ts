import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

type Account = { username: string; role: "admin" | "agency" | "client"; parent: string | null };

const h = vi.hoisted(() => ({
  actor: { username: "admin", role: "admin", parent: null } as Account,
  accounts: [] as Account[],
  client: null as any,
}));

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  h.client = client;
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE platform_accounts (
      username varchar PRIMARY KEY, password_hash text NOT NULL DEFAULT '',
      role varchar NOT NULL, parent varchar, max_seats integer,
      created_at timestamptz NOT NULL DEFAULT now(), email varchar, website varchar,
      status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug varchar(64) NOT NULL UNIQUE,
      role varchar NOT NULL DEFAULT 'agency', parent_slug varchar(64), max_seats integer,
      email varchar(255), billing_email varchar(255), key_account_holder_email varchar(255),
      vat_number varchar(64), billing_address varchar(512), billing_address_version integer,
      website varchar(512), display_name varchar(128), free_access boolean NOT NULL DEFAULT false,
      status varchar NOT NULL DEFAULT 'active', setup_complete boolean,
      stripe_customer_id text, stripe_subscription_id text, plan varchar(16),
      billing_frequency varchar(16), subscription_status varchar(16),
      current_period_end timestamptz, cancel_at_period_end boolean NOT NULL DEFAULT false,
      renewal_reminder_period_end timestamptz, created_at timestamptz NOT NULL DEFAULT now()
      , beta_trial_started_at timestamptz, beta_trial_ends_at timestamptz
    );
    CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL);
    CREATE TABLE projects (
      id varchar PRIMARY KEY, name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}'::jsonb, intake jsonb, logo text, owner varchar,
      tier varchar(16), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE project_snapshots (
      id serial PRIMARY KEY, project_id varchar NOT NULL, name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}'::jsonb, intake jsonb, logo text, owner varchar,
      reason varchar NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_discoveries (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL,
      candidate_key text NOT NULL, status varchar(20) NOT NULL DEFAULT 'pending',
      candidate jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz, reviewed_by varchar, rejection_reason text,
      contact_id integer, outlet_id integer
    );
  `);
  return { db, ...schema };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: any, _res: unknown, next: () => void) => {
    req.account = { ...h.actor };
    next();
  },
}));

vi.mock("../lib/member-guards", () => ({
  guardProjectRead: () => true,
  guardProjectWrite: () => true,
  assignedProjectIds: () => null,
  inAssignedScope: () => true,
}));

vi.mock("../lib/platform-auth", () => {
  const normUsername = (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "";
  const visible = (username: string) => {
    const result = new Set([username]);
    const account = h.accounts.find((item) => item.username === username);
    if (account?.parent) result.add(account.parent);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of h.accounts) {
        if (item.parent && result.has(item.parent) && !result.has(item.username)) {
          result.add(item.username);
          changed = true;
        }
      }
    }
    return [...result];
  };
  return {
    normUsername,
    normalizeRole: (role: unknown) =>
      role === "admin" || role === "agency" || role === "client" ? role : "user",
    getAccount: async (username: string) =>
      h.accounts.find((item) => item.username === normUsername(username)) ?? null,
    getVisibleUsernames: async (actor: Account) =>
      actor.role === "admin" ? null : visible(actor.username),
    isRestrictedMaster: () => false,
    MASTER_OWNER_REQUIRED_MESSAGE: "Master owner required.",
  };
});

vi.mock("../lib/admin-events", () => ({ logAdminEvent: () => Promise.resolve() }));
vi.mock("../lib/notify-email", () => ({
  sendPaymentFailedEmail: () => Promise.resolve(),
  sendSubscriptionCancelledEmail: () => Promise.resolve(),
}));

import {
  db,
  platformAccountsTable,
  platformCompaniesTable,
  platformMetaTable,
  projectSnapshotsTable,
  projectsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import storeRouter from "./store";

describe("store package limits (DB-backed)", () => {
  let server: Server;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", storeRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await db.delete(projectSnapshotsTable);
    await db.delete(projectsTable);
    await db.delete(platformMetaTable);
    await db.delete(platformCompaniesTable);
    await db.delete(platformAccountsTable);
    h.accounts = [];
    h.actor = { username: "admin", role: "admin", parent: null };
  });

  async function account(username: string, role: Account["role"], parent: string | null = null) {
    h.accounts.push({ username, role, parent });
    await db.insert(platformAccountsTable).values({
      username, passwordHash: "", role, parent, status: "active",
    });
    await db.insert(platformCompaniesTable).values({
      slug: username, role, parentSlug: parent, status: "active",
    });
  }

  async function beta(slug: string, plan: "agency" | "inhouse") {
    const now = new Date();
    await db.execute(sql`
      UPDATE platform_companies SET plan = ${plan}, beta_trial_started_at = ${now},
      beta_trial_ends_at = ${new Date(now.getTime() + 86_400_000)} WHERE slug = ${slug}
    `);
  }

  async function paid(slug: string, plan: "agency" | "inhouse") {
    await db.update(platformCompaniesTable).set({
      plan,
      subscriptionStatus: "active",
      stripeSubscriptionId: `sub_${slug}`,
      stripeCustomerId: `cus_${slug}`,
    }).where(eq(platformCompaniesTable.slug, slug));
  }

  async function addon(slug: string, subscriptionId = `sub_addon_${slug}`) {
    await db.insert(platformMetaTable).values({
      key: `projectAddons:${slug}`,
      value: JSON.stringify([{
        subscriptionId,
        tier: "standard",
        projectId: null,
        ownerSlug: null,
        purchasedAt: new Date().toISOString(),
      }]),
    });
  }

  async function request(path: string, body?: unknown) {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json().catch(() => ({})) as any };
  }

  const upsert = (id: string, owner?: string) =>
    request("/store/projects/upsert", { id, name: id, data: { id }, ...(owner ? { owner } : {}) });
  const intake = (id: string, owner?: string) =>
    request("/store/projects/intake", { id, name: id, intake: { formData: { "4.1": id } }, ...(owner ? { owner } : {}) });

  it("uses each empty beta Agency client reservation for exactly its first project", async () => {
    await account("agency", "agency");
    await account("one", "client", "agency");
    await account("two", "client", "agency");
    await beta("agency", "agency");
    h.actor = h.accounts[0]!;

    expect((await upsert("p-one", "one")).status).toBe(200);
    expect((await intake("p-two", "two")).status).toBe(200);
    const blocked = await upsert("p-three", "one");
    expect(blocked.status).toBe(403);
    expect(blocked.json.packageCapacity.reserved).toBe(2);
  });

  it("blocks Agency-root projects but accepts a visible client owner only on creation", async () => {
    await account("agency", "agency");
    await account("client", "client", "agency");
    await beta("agency", "agency");
    h.actor = h.accounts[0]!;

    expect((await upsert("root-project")).status).toBe(403);
    expect((await upsert("client-project", "client")).status).toBe(200);
    expect((await upsert("client-project", "agency")).status).toBe(200);
    const [stored] = await db.select({ owner: projectsTable.owner }).from(projectsTable)
      .where(eq(projectsTable.id, "client-project"));
    expect(stored?.owner).toBe("client");
    expect((await upsert("foreign", "unknown")).status).toBe(403);
  });

  it("serializes mixed parallel creation and never creates two projects in one client", async () => {
    await account("agency", "agency");
    await account("client", "client", "agency");
    await beta("agency", "agency");
    h.actor = h.accounts[0]!;

    const same = await Promise.all([upsert("same", "client"), intake("same", "client")]);
    expect(same.every((result) => result.status === 200)).toBe(true);
    await db.delete(projectsTable);
    const different = await Promise.all([upsert("first", "client"), intake("second", "client")]);
    expect(different.map((result) => result.status).sort()).toEqual([200, 403]);
  });

  it("enforces direct Client beta and paid add-on project limits", async () => {
    await account("direct", "client");
    await beta("direct", "inhouse");
    h.actor = h.accounts[0]!;
    expect((await upsert("beta-one")).status).toBe(200);
    expect((await upsert("beta-two")).status).toBe(403);

    await paid("direct", "inhouse");
    await addon("direct");
    expect((await upsert("paid-two")).status).toBe(200);
    expect((await intake("paid-two")).status).toBe(200);
    const [storedAddons] = await db.select({ value: platformMetaTable.value })
      .from(platformMetaTable).where(eq(platformMetaTable.key, "projectAddons:direct"));
    const bindings = JSON.parse(storedAddons!.value) as Array<{ projectId: string | null }>;
    expect(bindings.filter((item) => item.projectId === "paid-two")).toHaveLength(1);
    expect((await upsert("paid-three")).status).toBe(403);
  });

  it("releases a deleted add-on project without letting stale sync resurrect it", async () => {
    await account("direct", "client");
    await paid("direct", "inhouse");
    await addon("direct");
    h.actor = h.accounts[0]!;
    expect((await upsert("included")).status).toBe(200);
    expect((await upsert("funded")).status).toBe(200);
    expect((await request("/store/projects/delete", { id: "funded" })).status).toBe(200);

    const [storedAddons] = await db.select({ value: platformMetaTable.value })
      .from(platformMetaTable).where(eq(platformMetaTable.key, "projectAddons:direct"));
    expect(JSON.parse(storedAddons!.value)[0].projectId).toBeNull();
    expect((await intake("funded")).status).toBe(200);
    const [tombstone] = await db.select({ deletedAt: projectsTable.deletedAt })
      .from(projectsTable).where(eq(projectsTable.id, "funded"));
    expect(tombstone?.deletedAt).not.toBeNull();
    expect((await upsert("replacement")).status).toBe(200);
  });

  it("gives a paid Agency three client units plus a purchased fourth", async () => {
    await account("agency", "agency");
    for (const child of ["one", "two", "three", "four"]) await account(child, "client", "agency");
    await paid("agency", "agency");
    await addon("agency");
    h.actor = h.accounts[0]!;
    for (const child of ["one", "two", "three", "four"]) {
      expect((await upsert(`p-${child}`, child)).status).toBe(200);
    }
    await account("five", "client", "agency");
    expect((await upsert("p-five", "five")).status).toBe(403);
  });

  it("allows edits and reads of legacy excess while denying growth", async () => {
    await account("agency", "agency");
    await account("client", "client", "agency");
    await beta("agency", "agency");
    h.actor = h.accounts[0]!;
    await db.insert(projectsTable).values([
      { id: "legacy-one", name: "one", data: {}, owner: "client" },
      { id: "legacy-two", name: "two", data: {}, owner: "client" },
    ]);

    expect((await upsert("legacy-two", "agency")).status).toBe(200);
    expect((await upsert("legacy-three", "client")).status).toBe(403);
    const listed = await request("/store/projects");
    expect(listed.status).toBe(200);
    expect(listed.json.projects.map((project: any) => project.id).sort())
      .toEqual(["legacy-one", "legacy-two"]);
  });

  it("permits same-root transfer into an empty client but rejects an occupied destination", async () => {
    await account("agency", "agency");
    await account("source", "client", "agency");
    await account("empty", "client", "agency");
    await account("occupied", "client", "agency");
    await paid("agency", "agency");
    h.actor = h.accounts[0]!;
    await db.insert(projectsTable).values([
      { id: "move", name: "move", data: {}, owner: "source" },
      { id: "taken", name: "taken", data: {}, owner: "occupied" },
    ]);

    expect((await request("/store/projects/owner", { id: "move", owner: "empty" })).status).toBe(200);
    expect((await request("/store/projects/owner", { id: "move", owner: "occupied" })).status).toBe(403);
  });

  it("denies resurrection into an occupied client but lets Master exceed package rules", async () => {
    await account("agency", "agency");
    await account("client", "client", "agency");
    await beta("agency", "agency");
    h.actor = h.accounts[0]!;
    await db.insert(projectsTable).values([
      { id: "live", name: "live", data: {}, owner: "client" },
      { id: "deleted", name: "deleted", data: {}, owner: "client", deletedAt: new Date() },
    ]);
    const [snapshot] = await db.insert(projectSnapshotsTable).values({
      projectId: "deleted", name: "restore", data: {}, owner: "client", reason: "pre-delete",
    }).returning({ id: projectSnapshotsTable.id });
    expect((await request("/store/projects/restore", { id: "deleted", snapshotId: snapshot!.id })).status)
      .toBe(403);

    await account("admin", "admin");
    h.actor = h.accounts.find((item) => item.username === "admin")!;
    expect((await upsert("master-one")).status).toBe(200);
    expect((await upsert("master-two")).status).toBe(200);
  });
});
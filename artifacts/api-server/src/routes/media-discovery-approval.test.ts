import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "media-discovery-approval-test-secret";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE projects (
      id varchar PRIMARY KEY, name varchar NOT NULL DEFAULT '', data jsonb NOT NULL DEFAULT '{}'::jsonb,
      intake jsonb, logo text, owner varchar, tier varchar(16),
      updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_outlets (
      id serial PRIMARY KEY, name text NOT NULL, category text NOT NULL DEFAULT '',
      website text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
      country text NOT NULL DEFAULT '', reach_band text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '',
      account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY, outlet_id integer, first_name text NOT NULL DEFAULT '',
      last_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '', mobile text NOT NULL DEFAULT '',
      linkedin_url text NOT NULL DEFAULT '', twitter_handle text NOT NULL DEFAULT '',
      beats text[] NOT NULL DEFAULT '{}'::text[], sectors text[] NOT NULL DEFAULT '{}'::text[],
      geography text NOT NULL DEFAULT '', language text NOT NULL DEFAULT '',
      seniority text NOT NULL DEFAULT '', editorial_status text NOT NULL DEFAULT '',
      source_url text NOT NULL DEFAULT '', source_ref text NOT NULL DEFAULT '',
      publication_reach text NOT NULL DEFAULT '', publication_authority text NOT NULL DEFAULT '',
      journalist_authority text NOT NULL DEFAULT '', confidence text NOT NULL DEFAULT '',
      review_notes text NOT NULL DEFAULT '', provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
      last_verified_at timestamptz, source_check_claimed_at timestamptz,
      source_check_claim_token varchar(80), source_check_failure_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(), account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contact_field_overrides (
      id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL,
      field_name varchar(80) NOT NULL, value text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_contact_source_checks (
      id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL,
      source_url text NOT NULL, outcome varchar(20) NOT NULL, error_code varchar(40),
      error_message text NOT NULL DEFAULT '', observed_evidence jsonb NOT NULL DEFAULT '{}',
      differences jsonb NOT NULL DEFAULT '[]', checked_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_discoveries (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL,
      candidate_key text NOT NULL, status varchar(20) NOT NULL DEFAULT 'pending',
      candidate jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz, reviewed_by varchar, rejection_reason text,
      contact_id integer, outlet_id integer
    );
    CREATE UNIQUE INDEX media_discoveries_test_identity
      ON media_discoveries (account_id, project_id, candidate_key);
    CREATE TABLE media_contact_status_events (
      id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL,
      status varchar(20) NOT NULL, note text NOT NULL DEFAULT '', created_by varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_contact_correction_reports (
      id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL,
      fields text[] NOT NULL DEFAULT '{}', details text NOT NULL, status varchar(20) NOT NULL DEFAULT 'pending',
      reported_by varchar NOT NULL, resolution_note text NOT NULL DEFAULT '', reviewed_by varchar,
      source_check_id integer, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_suppressions (
      id serial PRIMARY KEY, request_id integer, email_hash text, name_hash text, outlet_hash text, linkedin_hash text,
      scope text NOT NULL DEFAULT 'shared', account_id varchar, reason text NOT NULL DEFAULT '',
      active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
    );
  `);
  return { db, ...schema };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: any, res: any, next: () => void) => {
    if (!req.account) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  },
}));

vi.mock("../lib/member-guards", () => ({
  memberProjectGate: (_req: any, _res: any, next: () => void) => next(),
  inAssignedScope: () => true,
}));

vi.mock("../lib/platform-auth", () => ({
  DEFAULT_ADMIN_USERNAME: "admin",
  normUsername: (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "",
  canWriteProjects: () => true,
  getVisibleUsernames: async (account: any) => account.visibleAccounts ?? [account.username],
}));

import { db, mediaContactsTable, mediaDiscoveriesTable, mediaOutletsTable, mediaSuppressionsTable, projectsTable } from "@workspace/db";
import { privacyHash } from "../lib/journalist-privacy";
import { signMediaDiscoveries, type TrustedMediaDiscovery } from "../lib/media-discovery-token";
import router from "./media-db";

const candidate: TrustedMediaDiscovery = {
  candidateKey: "stable-source-name-outlet",
  firstName: "Alex",
  lastName: "Editor",
  role: "Editor",
  email: "alex@example.test",
  outletName: "Example Journal",
  outletWebsite: "https://example.test",
  sourceUrl: "https://example.test/team/alex",
  evidence: "Listed on the publication team page.",
  beats: ["technology"],
  confidence: "High",
  verifiedAt: "2026-01-02T00:00:00.000Z",
};

function appFor(account: { username: string; visibleAccounts?: string[]; role?: string }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).account = { ...account, role: account.role ?? "agency", membershipRole: "owner" };
    (req as any).log = { error: () => {}, warn: () => {}, info: () => {} };
    next();
  });
  app.use("/api", router);
  return app;
}

async function request(
  account: { username: string; visibleAccounts?: string[]; role?: string },
  path: string,
  init?: RequestInit,
) {
  const local = appFor(account);
  const server = local.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    return await fetch(`http://127.0.0.1:${port}/api${path}`, init);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function token(accountId = "account-a", projectId = "project-a", item = candidate) {
  return signMediaDiscoveries({
    accountId,
    projectId,
    expiresAt: Date.now() + 60_000,
    items: [item],
  });
}

beforeEach(async () => {
  await db.delete(mediaDiscoveriesTable);
  await db.delete(mediaContactsTable);
  await db.delete(mediaOutletsTable);
  await db.delete(mediaSuppressionsTable);
  await db.delete(projectsTable);
  await db.insert(projectsTable).values({ id: "project-a", owner: "account-a" });
});

describe("media discovery approval queue", () => {
  it.each(["", "Synthetic Manual Publication"])("persists manual contact and its typed publication %j only in the active workspace", async (outletName) => {
    const created = await request({ username: "account-a" }, "/store/media-db/contacts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Synthetic", lastName: "Writer", outletName, email: "writer@example.invalid" }),
    });
    expect(created.status).toBe(200);
    const body = await created.json() as { contact: { id: number; outletId: number | null; accountId: string } };
    expect(body.contact.accountId).toBe("account-a");
    expect(Boolean(body.contact.outletId)).toBe(Boolean(outletName));
    const list = await request({ username: "account-a" }, "/store/media-db/contacts");
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({
      total: 1,
      contacts: [{ id: body.contact.id, firstName: "Synthetic", lastName: "Writer", outletName: outletName || null }],
    });
    const other = await request({ username: "account-b", visibleAccounts: ["account-a", "account-b"] }, "/store/media-db/contacts");
    expect(other.status).toBe(200);
    expect(await other.json()).toMatchObject({ total: 0, contacts: [] });
    const denied = await request({ username: "account-b" }, `/store/media-db/contacts/${body.contact.id}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "Not allowed" }),
    });
    expect(denied.status).toBe(403);
    const persisted = (await db.select().from(mediaContactsTable))[0];
    expect(persisted).toMatchObject({ id: body.contact.id, accountId: "account-a", role: "" });
    const publications = await db.select().from(mediaOutletsTable);
    if (outletName) expect(publications).toEqual([expect.objectContaining({ id: body.contact.outletId, name: outletName, accountId: "account-a" })]);
    else expect(publications).toHaveLength(0);
  });

  it("retains Master shared entry and rejects privacy-suppressed manual additions before publication creation", async () => {
    const master = await request({ username: "admin", role: "admin" }, "/store/media-db/contacts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Shared", lastName: "Writer", outletName: "Shared Publication" }),
    });
    expect(master.status).toBe(200);
    expect((await db.select().from(mediaContactsTable))[0]?.accountId).toBeNull();
    expect((await db.select().from(mediaOutletsTable))[0]?.accountId).toBeNull();
    await db.insert(mediaSuppressionsTable).values({ emailHash: privacyHash("suppressed@example.invalid"), scope: "workspace", accountId: "account-a", active: 1, reason: "Synthetic privacy regression" });
    const denied = await request({ username: "account-a" }, "/store/media-db/contacts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Private", lastName: "Writer", email: "suppressed@example.invalid", outletName: "Must Not Exist" }),
    });
    expect(denied.status).toBe(409);
    expect(await db.select().from(mediaContactsTable)).toHaveLength(1);
    expect(await db.select().from(mediaOutletsTable)).toHaveLength(1);
  });

  it("queues candidates without creating trusted contact or outlet rows and is idempotent", async () => {
    const body = { discoveryToken: token(), candidateKey: candidate.candidateKey };
    const first = await request({ username: "account-a" }, "/store/media-db/discoveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const second = await request({ username: "account-a" }, "/store/media-db/discoveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await db.select().from(mediaDiscoveriesTable)).toHaveLength(1);
    expect(await db.select().from(mediaContactsTable)).toHaveLength(0);
    expect(await db.select().from(mediaOutletsTable)).toHaveLength(0);
  });

  it("does not link account A's approval to a hierarchy-visible private outlet owned by B", async () => {
    await db.insert(mediaOutletsTable).values({
      name: candidate.outletName,
      website: candidate.outletWebsite,
      accountId: "account-b",
    });
    const saved = await request({ username: "account-a", visibleAccounts: ["account-a", "account-b"] }, "/store/media-db/discoveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discoveryToken: token(), candidateKey: candidate.candidateKey }),
    });
    const queued = await saved.json() as { discovery: { id: number } };
    const approved = await request({ username: "account-a", visibleAccounts: ["account-a", "account-b"] }, `/store/media-db/discoveries/${queued.discovery.id}/approve`, {
      method: "POST",
    });
    expect(approved.status).toBe(200);
    const outlets = await db.select().from(mediaOutletsTable);
    const contacts = await db.select().from(mediaContactsTable);
    expect(outlets).toHaveLength(2);
    expect(outlets.find((outlet) => outlet.accountId === "account-b")).toBeTruthy();
    expect(outlets.find((outlet) => outlet.accountId === "account-a")).toBeTruthy();
    expect(contacts[0]?.accountId).toBe("account-a");
    expect(contacts[0]?.outletId).toBe(outlets.find((outlet) => outlet.accountId === "account-a")?.id);
  });

  it("rejects numeric identifiers at signed discovery submission and approval before creating trusted rows", async () => {
    const contaminated = { ...candidate, firstName: "Alex", lastName: "Editor 1234", candidateKey: "numeric-name" };
    const submitted = await request({ username: "account-a" }, "/store/media-db/discoveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discoveryToken: token("account-a", "project-a", contaminated), candidateKey: contaminated.candidateKey }),
    });
    expect(submitted.status).toBe(400);
    expect(await db.select().from(mediaDiscoveriesTable)).toHaveLength(0);
    expect(await db.select().from(mediaOutletsTable)).toHaveLength(0);
    expect(await db.select().from(mediaContactsTable)).toHaveLength(0);

    const [discovery] = await db.insert(mediaDiscoveriesTable).values({
      accountId: "account-a",
      projectId: "project-a",
      candidateKey: contaminated.candidateKey,
      candidate: contaminated,
    }).returning();
    const approved = await request({ username: "account-a" }, `/store/media-db/discoveries/${discovery.id}/approve`, { method: "POST" });
    expect(approved.status).toBe(400);
    expect((await db.select().from(mediaDiscoveriesTable))[0]?.status).toBe("pending");
    expect(await db.select().from(mediaOutletsTable)).toHaveLength(0);
    expect(await db.select().from(mediaContactsTable)).toHaveLength(0);
  });

  it("limits identity review to writable Master and returns only active shared numeric-only rows", async () => {
    const [outlet] = await db.insert(mediaOutletsTable).values({ name: "Review Outlet", website: "https://review.test" }).returning();
    await db.insert(mediaContactsTable).values([
      { outletId: outlet.id, firstName: "123", lastName: "", sourceRef: "review-source", accountId: null },
      { outletId: outlet.id, firstName: "987", lastName: "", sourceRef: "review-source", accountId: null },
      { outletId: outlet.id, firstName: "Real", lastName: "Name", accountId: null },
      { outletId: outlet.id, firstName: "456", lastName: "", accountId: "account-a" },
    ]);
    const [deletedOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Deleted Review Outlet",
      deletedAt: new Date(),
    }).returning();
    await db.insert(mediaContactsTable).values({
      outletId: deletedOutlet.id,
      firstName: "789",
      lastName: "",
      sourceRef: "review-source",
      accountId: null,
    });
    await db.insert(mediaSuppressionsTable).values({
      nameHash: privacyHash("987"),
      outletHash: privacyHash("Review Outlet"),
      scope: "shared",
      accountId: null,
      reason: "test",
      active: 1,
    });
    const denied = await request({ username: "account-a" }, "/store/media-db/identity-review");
    expect(denied.status).toBe(403);
    const reviewed = await request({ username: "admin", role: "admin" }, "/store/media-db/identity-review?page=1&pageSize=999&q=review-source");
    expect(reviewed.status).toBe(200);
    const body = await reviewed.json() as { contacts: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
    expect(body).toMatchObject({ total: 1, page: 1, pageSize: 50 });
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0]).toMatchObject({ firstName: "123", outletName: "Review Outlet", outletWebsite: "https://review.test" });
  });

  it("rejects contaminated manual names while allowing unrelated edits to retained legacy rows", async () => {
    const rejectedCreate = await request({ username: "account-a" }, "/store/media-db/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Desk", lastName: "2024", outletName: "Manual Outlet" }),
    });
    expect(rejectedCreate.status).toBe(400);
    expect(await db.select().from(mediaOutletsTable)).toHaveLength(0);

    const create = await request({ username: "account-a" }, "/store/media-db/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Alex", lastName: "Editor", outletName: "Manual Outlet" }),
    });
    expect(create.status).toBe(200);
    const { contact } = await create.json() as { contact: { id: number } };
    const contaminatedUpdate = await request({ username: "account-a" }, `/store/media-db/contacts/${contact.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Alex", lastName: "Editor 1234" }),
    });
    expect(contaminatedUpdate.status).toBe(400);
    expect((await db.select().from(mediaContactsTable)).find((row) => row.id === contact.id)?.lastName).toBe("Editor");

    const [legacy] = await db.insert(mediaContactsTable).values({ firstName: "123", lastName: "", accountId: "account-a" }).returning();
    const unrelatedUpdate = await request({ username: "account-a" }, `/store/media-db/contacts/${legacy.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Review required" }),
    });
    expect(unrelatedUpdate.status).toBe(200);
    const savedLegacy = (await db.select().from(mediaContactsTable)).find((row) => row.id === legacy.id);
    expect(savedLegacy).toMatchObject({ firstName: "123", role: "Review required" });
  });
});
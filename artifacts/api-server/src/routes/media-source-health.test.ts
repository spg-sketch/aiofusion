import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const { fetchMediaSourceEvidence } = vi.hoisted(() => ({ fetchMediaSourceEvidence: vi.fn() }));

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE media_outlets (
      id serial PRIMARY KEY, name text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '',
      website text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '',
      reach_band text NOT NULL DEFAULT '', account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY, outlet_id integer, first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
      mobile text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '', twitter_handle text NOT NULL DEFAULT '',
      beats text[] NOT NULL DEFAULT '{}', sectors text[] NOT NULL DEFAULT '{}', geography text NOT NULL DEFAULT '',
      language text NOT NULL DEFAULT '', seniority text NOT NULL DEFAULT '', editorial_status text NOT NULL DEFAULT '',
      source_url text NOT NULL DEFAULT '', source_ref text NOT NULL DEFAULT '', publication_reach text NOT NULL DEFAULT '',
      publication_authority text NOT NULL DEFAULT '', journalist_authority text NOT NULL DEFAULT '', confidence text NOT NULL DEFAULT '',
       review_notes text NOT NULL DEFAULT '', provenance jsonb NOT NULL DEFAULT '{}', last_verified_at timestamptz,
       source_check_claimed_at timestamptz, source_check_claim_token varchar(80),
       source_check_failure_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(), account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contact_field_overrides (
      id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL, field_name varchar(80) NOT NULL,
      value text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_contact_source_checks (
      id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL, source_url text NOT NULL,
      outcome varchar(20) NOT NULL, error_code varchar(40), error_message text NOT NULL DEFAULT '',
      observed_evidence jsonb NOT NULL DEFAULT '{}', differences jsonb NOT NULL DEFAULT '[]',
      checked_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
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
    CREATE TABLE platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255), name varchar(128),
      password_hash text, google_id varchar(255), microsoft_id varchar(255),
      session_version integer NOT NULL DEFAULT 0, email_verified boolean, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_source_reverification_runs (
      singleton_id integer PRIMARY KEY,
      started_at timestamptz NOT NULL
    );
  `);
  return { ...schema, db: drizzle(client, { schema }), __client: client };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const username = String(req.headers["x-account"] || "account-a");
    req.account = { username, role: username === "admin" ? "admin" : "agency", membershipRole: "owner" } as NonNullable<express.Request["account"]>;
    next();
  },
}));
vi.mock("../lib/member-guards", () => ({
  memberProjectGate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  inAssignedScope: () => true,
}));
vi.mock("../lib/platform-auth", () => ({
  DEFAULT_ADMIN_USERNAME: "admin",
  normUsername: (value: string) => value.toLowerCase(),
  getVisibleUsernames: (account: { username: string }) => Promise.resolve([account.username.toLowerCase()]),
  canWriteProjects: () => true,
}));
vi.mock("../lib/safe-fetch", () => ({
  fetchMediaSourceEvidence,
}));
vi.mock("../lib/media-discovery-token", () => ({ verifyMediaDiscoveries: () => [] }));

import router from "./media-db";
import * as workspaceDb from "@workspace/db";

const { db, mediaContactFieldOverridesTable, mediaContactsTable, __client } = workspaceDb as typeof workspaceDb & {
  __client: { exec(sql: string): Promise<unknown> };
};

let server: Server;
let baseUrl = "";

async function post(path: string, account = "account-a", body?: unknown) {
  return fetch(`${baseUrl}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-account": account },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function put(path: string, account = "account-a", body?: unknown) {
  return fetch(`${baseUrl}/api${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-account": account },
    body: JSON.stringify(body ?? {}),
  });
}

async function get(path: string, account = "account-a") {
  return fetch(`${baseUrl}/api${path}`, { headers: { "x-account": account } });
}

describe("media source health routes", () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", router);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await __client.exec("TRUNCATE media_contact_correction_reports, media_contact_status_events, media_contact_source_checks, media_contact_field_overrides, media_contacts, media_outlets RESTART IDENTITY");
    fetchMediaSourceEvidence.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("keeps source-less contacts unverified and workspace scoped", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({ firstName: "No", lastName: "Source", accountId: "account-a" }).returning();
    expect((await post(`/store/media-db/contacts/${contact.id}/source-check`)).status).toBe(400);
    expect((await post(`/store/media-db/contacts/${contact.id}/source-check`, "account-b")).status).toBe(403);
    expect(fetchMediaSourceEvidence).not.toHaveBeenCalled();
  });

  it("records unavailable pages without changing the contact", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Jane", lastName: "Reporter", role: "Editor", email: "jane@example.com",
      sourceUrl: "https://example.com/missing", accountId: "account-a",
    }).returning();
    fetchMediaSourceEvidence.mockRejectedValueOnce(new Error("Site returned HTTP 404"));
    const response = await post(`/store/media-db/contacts/${contact.id}/source-check`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ sourceCheck: expect.objectContaining({ outcome: "unavailable", errorCode: "page_missing" }) }));
    const [stored] = await db.select().from(mediaContactsTable);
    expect(stored.role).toBe("Editor");
    expect(stored.email).toBe("jane@example.com");
  });

  it("requires approval and skips user-owned fields", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Jane", lastName: "Reporter", role: "Energy Editor", email: "jane@example.com",
      sourceUrl: "https://example.com/jane", accountId: "account-a",
    }).returning();
    await db.insert(mediaContactFieldOverridesTable).values({ contactId: contact.id, accountId: "account-a", fieldName: "role", value: "Energy Editor" });
    fetchMediaSourceEvidence.mockResolvedValueOnce({
      url: contact.sourceUrl,
      text: "Jane Reporter Climate Correspondent",
      emails: ["new@example.com"],
      roleCandidates: ["Jane Reporter - Climate Correspondent"],
    });
    const checked = await (await post(`/store/media-db/contacts/${contact.id}/source-check`)).json() as { sourceCheck: { id: number } };
    const beforeApproval = (await db.select().from(mediaContactsTable))[0];
    expect(beforeApproval.role).toBe("Energy Editor");
    expect(beforeApproval.email).toBe("jane@example.com");

    const approved = await post(`/store/media-db/contacts/${contact.id}/source-checks/${checked.sourceCheck.id}/approve`, "account-a", { fields: ["role", "email"] });
    expect(await approved.json()).toEqual(expect.objectContaining({ applied: ["email"], skipped: ["role"] }));
    const afterApproval = (await db.select().from(mediaContactsTable))[0];
    expect(afterApproval.role).toBe("Energy Editor");
    expect(afterApproval.email).toBe("new@example.com");
  });

  it("makes a replacement source immediately checkable with fresh retry state", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Jane", lastName: "Reporter", sourceUrl: "https://example.com/old",
      sourceCheckClaimedAt: new Date(), sourceCheckClaimToken: "old-claim",
      sourceCheckFailureCount: 5, accountId: "account-a",
    }).returning();
    expect((await put(`/store/media-db/contacts/${contact.id}`, "account-a", {
      sourceUrl: "https://example.com/new",
    })).status).toBe(200);
    const [updated] = await db.select().from(mediaContactsTable);
    expect(updated).toEqual(expect.objectContaining({
      sourceUrl: "https://example.com/new",
      sourceCheckClaimedAt: null,
      sourceCheckClaimToken: null,
      sourceCheckFailureCount: 0,
    }));
  });

  it("combines contacts and publications with match explanations without leaking workspaces", async () => {
    const [outlet] = await db.insert(workspaceDb.mediaOutletsTable).values({
      name: "Climate Technology Review", category: "Technology", country: "United Kingdom", accountId: "account-a",
    }).returning();
    await db.insert(mediaContactsTable).values({
      outletId: outlet.id, firstName: "Jane", lastName: "Reporter", role: "Climate Editor",
      beats: ["climate technology"], geography: "London", journalistAuthority: "82", accountId: "account-a",
    });
    await db.insert(mediaContactsTable).values({
      firstName: "Private", lastName: "Reporter", role: "Climate Editor", accountId: "account-b",
    });

    const response = await get("/store/media-db/search?phrase=climate%20technology&location=UK&category=Technology&authority=70");
    expect(response.status).toBe(200);
    const body = await response.json() as { total: number; counts: { contacts: number; outlets: number }; results: Array<{ type: string; matchedFields: string[]; matchedPhrases: string[]; reasons: string[] }> };
    expect(body.counts).toEqual({ contacts: 1, outlets: 0 });
    expect(body.total).toBe(1);
    expect(body.results[0]).toEqual(expect.objectContaining({
      type: "contact",
      matchedFields: expect.arrayContaining(["topic"]),
      matchedPhrases: ["climate technology"],
      reasons: expect.arrayContaining([expect.stringContaining("exact phrase")]),
    }));

    const synonymResponse = await get("/store/media-db/search?phrase=tech");
    expect((await synonymResponse.json() as { counts: { contacts: number; outlets: number } }).counts).toEqual({ contacts: 1, outlets: 1 });
    const strictTopicResponse = await get("/store/media-db/search?topic=Jane");
    expect((await strictTopicResponse.json() as { total: number }).total).toBe(0);
  });

  it("stores departed status and correction reports per workspace without changing trusted fields", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Global", lastName: "Reporter", role: "Editor", email: "trusted@example.com", accountId: null,
    }).returning();
    expect((await post(`/store/media-db/contacts/${contact.id}/status`, "account-a", { status: "departed" })).status).toBe(200);
    expect((await post(`/store/media-db/contacts/${contact.id}/corrections`, "account-a", { fields: ["email"], details: "This address bounces." })).status).toBe(200);

    const accountA = await (await get("/store/media-db/search?topic=Editor", "account-a")).json() as { results: Array<{ contact: { lifecycleStatus: string; hasPendingCorrection: boolean; email: string } }> };
    const accountB = await (await get("/store/media-db/search?topic=Editor", "account-b")).json() as { results: Array<{ contact: { lifecycleStatus: string; hasPendingCorrection: boolean; email: string } }> };
    expect(accountA.results[0].contact).toEqual(expect.objectContaining({ lifecycleStatus: "departed", hasPendingCorrection: true, email: "trusted@example.com" }));
    expect(accountB.results[0].contact).toEqual(expect.objectContaining({ lifecycleStatus: "active", hasPendingCorrection: false, email: "trusted@example.com" }));
  });

  it("lets only Master stewards list and resolve correction reports", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Global", lastName: "Reporter", role: "Editor", email: "trusted@example.com",
      sourceUrl: "https://example.com/global", accountId: null,
    }).returning();
    expect((await post(`/store/media-db/contacts/${contact.id}/corrections`, "account-a", {
      fields: ["email"], details: "The listed address bounces.",
    })).status).toBe(200);

    expect((await get("/store/media-db/corrections", "account-a")).status).toBe(403);
    const queue = await get("/store/media-db/corrections", "admin");
    expect(queue.status).toBe(200);
    const queued = await queue.json() as { corrections: Array<{ id: number; workspace: string; details: string; contact: { email: string }; reporter: { id: string } }> };
    expect(queued.corrections).toHaveLength(1);
    expect(queued.corrections[0]).toEqual(expect.objectContaining({
      workspace: "account-a",
      details: "The listed address bounces.",
      contact: expect.objectContaining({ email: "trusted@example.com" }),
      reporter: expect.objectContaining({ id: "account-a" }),
    }));
    expect((await post(`/store/media-db/corrections/${queued.corrections[0].id}/resolve`, "account-a", {
      outcome: "rejected", note: "Not authorised.",
    })).status).toBe(403);
    expect((await post(`/store/media-db/corrections/${queued.corrections[0].id}/resolve`, "admin", {
      outcome: "resolved", note: "No verifiable replacement was available.",
    })).status).toBe(200);
    expect(((await (await get("/store/media-db/corrections", "admin")).json()) as { corrections: unknown[] }).corrections).toHaveLength(0);
  });

  it("accepts a correction only through supported source evidence", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Global", lastName: "Reporter", role: "Editor", email: "trusted@example.com",
      sourceUrl: "https://example.com/global", accountId: null,
    }).returning();
    const submitted = await (await post(`/store/media-db/contacts/${contact.id}/corrections`, "account-a", {
      fields: ["email"], details: "Use the current public address.",
    })).json() as { correction: { id: number } };
    expect((await post(`/store/media-db/corrections/${submitted.correction.id}/resolve`, "admin", {
      outcome: "accepted", note: "No evidence yet.",
    })).status).toBe(400);

    fetchMediaSourceEvidence.mockResolvedValueOnce({
      url: contact.sourceUrl,
      text: "Global Reporter Editor new@example.com",
      emails: ["new@example.com"],
      roleCandidates: ["Global Reporter - Editor"],
    });
    const checked = await (await post(`/store/media-db/corrections/${submitted.correction.id}/source-check`, "admin")).json() as { sourceCheck: { id: number } };
    const accepted = await post(`/store/media-db/corrections/${submitted.correction.id}/resolve`, "admin", {
      outcome: "accepted", note: "Public profile confirms the replacement address.", sourceCheckId: checked.sourceCheck.id,
    });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual(expect.objectContaining({ applied: ["email"] }));
    expect((await db.select().from(mediaContactsTable))[0].email).toBe("new@example.com");
  });

  it("lets a Master steward check a private contact without granting general edit access", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Private", lastName: "Reporter", role: "Editor", email: "old@example.com",
      sourceUrl: "https://example.com/private", accountId: "account-a",
    }).returning();
    const submitted = await (await post(`/store/media-db/contacts/${contact.id}/corrections`, "account-a", {
      fields: ["email"], details: "The profile lists a new address.",
    })).json() as { correction: { id: number } };
    expect((await put(`/store/media-db/contacts/${contact.id}`, "admin", { email: "forbidden@example.com" })).status).toBe(403);
    fetchMediaSourceEvidence.mockResolvedValueOnce({
      url: contact.sourceUrl,
      text: "Private Reporter Editor new@example.com",
      emails: ["new@example.com"],
      roleCandidates: ["Private Reporter - Editor"],
    });
    const checked = await post(`/store/media-db/corrections/${submitted.correction.id}/source-check`, "admin");
    expect(checked.status).toBe(200);
    const sourceCheck = await checked.json() as { sourceCheck: { id: number } };
    expect((await post(`/store/media-db/corrections/${submitted.correction.id}/resolve`, "admin", {
      outcome: "accepted", note: "The public profile confirms the new address.", sourceCheckId: sourceCheck.sourceCheck.id,
    })).status).toBe(200);
    expect((await db.select().from(mediaContactsTable))[0].email).toBe("new@example.com");
  });

  it("refuses stale source evidence after the trusted contact changes", async () => {
    const [contact] = await db.insert(mediaContactsTable).values({
      firstName: "Global", lastName: "Reporter", role: "Editor", email: "old@example.com",
      sourceUrl: "https://example.com/global", accountId: null,
    }).returning();
    const submitted = await (await post(`/store/media-db/contacts/${contact.id}/corrections`, "account-a", {
      fields: ["email"], details: "The profile lists a new address.",
    })).json() as { correction: { id: number } };
    fetchMediaSourceEvidence.mockResolvedValueOnce({
      url: contact.sourceUrl,
      text: "Global Reporter Editor observed@example.com",
      emails: ["observed@example.com"],
      roleCandidates: ["Global Reporter - Editor"],
    });
    const checked = await (await post(`/store/media-db/corrections/${submitted.correction.id}/source-check`, "admin")).json() as { sourceCheck: { id: number } };
    await db.update(mediaContactsTable).set({ email: "newer-manual@example.com" });
    const response = await post(`/store/media-db/corrections/${submitted.correction.id}/resolve`, "admin", {
      outcome: "accepted", note: "Attempt stale approval.", sourceCheckId: checked.sourceCheck.id,
    });
    expect(response.status).toBe(409);
    expect((await db.select().from(mediaContactsTable))[0].email).toBe("newer-manual@example.com");
    expect(((await (await get("/store/media-db/corrections", "admin")).json()) as { corrections: unknown[] }).corrections).toHaveLength(1);
  });
});
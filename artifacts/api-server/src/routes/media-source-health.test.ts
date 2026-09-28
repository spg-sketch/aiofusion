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
       reach_band text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '',
       account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
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
    CREATE TABLE media_suppressions (
      id serial PRIMARY KEY, request_id integer, email_hash text, name_hash text, outlet_hash text, linkedin_hash text,
      scope text NOT NULL DEFAULT 'shared', account_id varchar, reason text NOT NULL DEFAULT '',
      active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
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
import { privacyHash } from "../lib/journalist-privacy";

const { db, mediaContactFieldOverridesTable, mediaContactsTable, mediaOutletsTable, mediaSuppressionsTable, __client } = workspaceDb as typeof workspaceDb & {
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

  it("applies processing-workspace suppression to global contacts across read and write routes", async () => {
    const [outlet] = await db.insert(mediaOutletsTable).values({ name: "Global News", category: "Technology" }).returning();
    const [contact] = await db.insert(mediaContactsTable).values({
      outletId: outlet.id, firstName: "Global", lastName: "Editor", email: "global-editor@example.test", role: "Editor", accountId: null,
    }).returning();
    await db.insert(mediaSuppressionsTable).values({
      scope: "workspace", accountId: "account-a", emailHash: privacyHash(contact.email), reason: "objection", active: 1,
    });
    const aSearch = await get("/store/media-db/search?phrase=Global", "account-a");
    expect(aSearch.status).toBe(200);
    expect(((await aSearch.json()) as { results: Array<{ type?: string }> }).results.filter((row) => row.type === "contact")).toHaveLength(0);
    const bSearch = await get("/store/media-db/search?phrase=Global", "account-b");
    expect(((await bSearch.json()) as { results: Array<{ type?: string }> }).results.filter((row) => row.type === "contact")).toHaveLength(1);
    expect((await post(`/store/media-db/contacts/${contact.id}/status`, "account-a", { status: "active" })).status).toBe(409);
    expect((await post(`/store/media-db/contacts/${contact.id}/status`, "account-b", { status: "active" })).status).not.toBe(409);
    await db.insert(mediaSuppressionsTable).values({
      scope: "shared", accountId: null, emailHash: privacyHash(contact.email), reason: "objection", active: 1,
    });
    const sharedSearch = await get("/store/media-db/search?phrase=Global", "account-b");
    expect(((await sharedSearch.json()) as { results: Array<{ type?: string }> }).results.filter((row) => row.type === "contact")).toHaveLength(0);
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

  it("keeps large media lists SQL-bounded, scoped, paged, and suppression-aware", async () => {
    const [outlet] = await db.insert(mediaOutletsTable).values({
      name: "Scale News", category: "Technology", accountId: "account-a",
    }).returning();
    await db.insert(mediaOutletsTable).values([
      { name: "Hidden News", category: "Technology", accountId: "account-b" },
      { name: "Deleted News", category: "Technology", accountId: "account-a", deletedAt: new Date() },
    ]);
    const contacts = Array.from({ length: 260 }, (_, index) => ({
      outletId: outlet!.id, firstName: "Scale", lastName: `Reporter ${index}`,
      role: "Editor", email: `scale-${index}@example.test`, sectors: ["Technology"],
      journalistAuthority: "80", accountId: "account-a",
    }));
    await db.insert(mediaContactsTable).values(contacts);
    await db.insert(mediaContactsTable).values([
      { firstName: "Hidden", lastName: "Reporter", accountId: "account-b", sectors: ["Technology"] },
      { firstName: "Deleted", lastName: "Reporter", accountId: "account-a", deletedAt: new Date(), sectors: ["Technology"] },
    ]);
    await db.insert(mediaSuppressionsTable).values({
      scope: "workspace", accountId: "account-a",
      emailHash: privacyHash("scale-0@example.test"), reason: "scale test",
    });

    const first = await (await get("/store/media-db/contacts?page=1&pageSize=25", "account-a")).json() as { contacts: Array<{ email: string }>; total: number; pageSize: number };
    expect(first.pageSize).toBe(25);
    expect(first.contacts).toHaveLength(25);
    expect(first.total).toBe(259);
    expect(first.contacts.map((row) => row.email)).not.toContain("scale-0@example.test");
    const second = await (await get("/store/media-db/contacts?page=2&pageSize=25", "account-a")).json() as { contacts: Array<{ email: string }>; total: number };
    expect(second.contacts).toHaveLength(25);
    expect(second.total).toBe(first.total);
    expect(second.contacts[0]?.email).not.toBe(first.contacts[0]?.email);

    const search = await (await get("/store/media-db/search?phrase=scale&page=2&pageSize=20", "account-a")).json() as {
      results: Array<{ type: string }>; total: number; counts: { contacts: number; outlets: number };
    };
    expect(search.results).toHaveLength(20);
    expect(search.total).toBe(260);
    expect(search.counts.contacts).toBe(259);
    expect(search.counts.outlets).toBe(1);
    expect(search.results.filter((result) => result.type === "contact").length).toBeGreaterThanOrEqual(19);
  });

  it("keeps mixed unified-search pages stable across contact and publication ties", async () => {
    const [firstOutlet, secondOutlet] = await db.insert(mediaOutletsTable).values([
      { name: "Tie Publication", category: "TieCategory", description: "tie", accountId: "account-a" },
      { name: "Tie Publication", category: "OtherCategory", description: "tie", accountId: "account-a" },
    ]).returning();
    const [firstContact, secondContact] = await db.insert(mediaContactsTable).values([
      { outletId: firstOutlet!.id, firstName: "Tie", lastName: "Alpha", role: "tie", journalistAuthority: "90", accountId: "account-a" },
      { outletId: secondOutlet!.id, firstName: "Tie", lastName: "Beta", role: "tie", journalistAuthority: "10", accountId: "account-a" },
    ]).returning();

    const pageOne = await (await get("/store/media-db/search?phrase=tie&page=1&pageSize=2", "account-a")).json() as {
      results: Array<{ type: string; id: number }>; total: number;
    };
    const pageTwo = await (await get("/store/media-db/search?phrase=tie&page=2&pageSize=2", "account-a")).json() as {
      results: Array<{ type: string; id: number }>; total: number;
    };
    expect(pageOne.total).toBeGreaterThanOrEqual(4);
    expect(pageTwo.total).toBe(pageOne.total);
    expect(pageOne.results).toHaveLength(2);
    expect(pageTwo.results).toHaveLength(2);
    expect(pageTwo.results.map((result) => `${result.type}:${result.id}`))
      .not.toEqual(expect.arrayContaining(pageOne.results.map((result) => `${result.type}:${result.id}`)));
    expect([firstContact!.id, secondContact!.id]).toEqual(expect.arrayContaining(
      [...pageOne.results, ...pageTwo.results].filter((result) => result.type === "contact").map((result) => result.id),
    ));

    const categoryResponse = await get("/store/media-db/outlets?page=1&pageSize=10&category=TieCategory", "account-a");
    const categoryBody = await categoryResponse.json() as { outlets: Array<{ id: number; category: string }>; total: number };
    expect(categoryBody.outlets.every((outlet) => outlet.category === "TieCategory")).toBe(true);
    expect(categoryBody.outlets.some((outlet) => outlet.id === firstOutlet!.id)).toBe(true);
    expect(categoryBody.outlets.some((outlet) => outlet.id === secondOutlet!.id)).toBe(false);
  });
});
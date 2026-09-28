import express from "express";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
process.env.NODE_ENV = "test";

const { db, tables, client } = await (async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE journalist_privacy_requests (
      id serial PRIMARY KEY, request_type varchar(20) NOT NULL, name text NOT NULL, email text NOT NULL,
      outlet text NOT NULL DEFAULT '', details text NOT NULL, scope varchar(20) NOT NULL DEFAULT 'workspace',
      approved_scope varchar(20), approved_account_id varchar, matched_contact_ids integer[] NOT NULL DEFAULT '{}',
      disclosure_result jsonb NOT NULL DEFAULT '{}', status varchar(24) NOT NULL DEFAULT 'received',
      assigned_to varchar, due_at timestamptz NOT NULL, verification_status varchar(20) NOT NULL DEFAULT 'unverified',
      verification_note text NOT NULL DEFAULT '', reviewer_approval_at timestamptz, reviewer_approval_by varchar,
      resolution varchar(32), resolution_note text NOT NULL DEFAULT '', notification_status varchar(20) NOT NULL DEFAULT 'pending',
      notification_attempts integer NOT NULL DEFAULT 0, last_notification_error text NOT NULL DEFAULT '',
      outcome_delivery_status varchar(20) NOT NULL DEFAULT 'pending', outcome_delivery_attempts integer NOT NULL DEFAULT 0,
      outcome_delivery_error text NOT NULL DEFAULT '', outcome_delivery_claimed_at timestamptz,
      resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE journalist_privacy_request_events (
      id serial PRIMARY KEY, request_id integer NOT NULL, event_type varchar(32) NOT NULL,
      actor varchar NOT NULL, note text NOT NULL DEFAULT '', metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY, account_id varchar, deleted_at timestamptz, outlet_id integer,
      first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', mobile text NOT NULL DEFAULT '',
      linkedin_url text NOT NULL DEFAULT '', twitter_handle text NOT NULL DEFAULT '', source_ref text NOT NULL DEFAULT '',
      source_url text NOT NULL DEFAULT '', provenance jsonb NOT NULL DEFAULT '{}',
      beats jsonb NOT NULL DEFAULT '[]', sectors jsonb NOT NULL DEFAULT '[]', notes text NOT NULL DEFAULT '',
      geography text NOT NULL DEFAULT '', confidence text NOT NULL DEFAULT '', publication_authority text NOT NULL DEFAULT '',
      journalist_authority text NOT NULL DEFAULT '', review_notes text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE journalist_privacy_legal_holds (
      id serial PRIMARY KEY, request_id integer NOT NULL, scope varchar(120) NOT NULL,
      reason text NOT NULL DEFAULT '', expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE journalist_privacy_completion_ledger (
      id serial PRIMARY KEY, request_id integer NOT NULL, store varchar(40) NOT NULL, store_key text NOT NULL,
      result varchar(24) NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (request_id, store, store_key)
    );
    CREATE TABLE media_suppressions (
      id serial PRIMARY KEY, request_id integer, scope varchar(20) NOT NULL, account_id varchar,
      email_hash varchar(64), name_hash varchar(64), linkedin_hash varchar(64), outlet_hash varchar(64),
      reason varchar(32) NOT NULL, active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
      UNIQUE (request_id, scope, account_id, email_hash, name_hash, linkedin_hash, outlet_hash)
    );
    CREATE TABLE media_outlets (id serial PRIMARY KEY, account_id varchar, name text NOT NULL, linkedin_url text NOT NULL DEFAULT '');
    CREATE TABLE media_contact_field_overrides (id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL, field_name varchar(80) NOT NULL, value text NOT NULL);
    CREATE TABLE media_contact_source_checks (id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL DEFAULT 'workspace-a', source_url text NOT NULL DEFAULT '', outcome varchar NOT NULL DEFAULT 'current', checked_at timestamptz NOT NULL DEFAULT now(), observed_evidence jsonb NOT NULL DEFAULT '{}', differences jsonb NOT NULL DEFAULT '[]', error_message text NOT NULL DEFAULT '');
    CREATE TABLE media_contact_status_events (id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL, status varchar NOT NULL, note text NOT NULL DEFAULT '', created_by varchar NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE media_discoveries (id serial PRIMARY KEY, account_id varchar NOT NULL, status varchar(20) NOT NULL DEFAULT 'pending', candidate jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), contact_id integer);
    CREATE TABLE media_recommendation_sets (id serial PRIMARY KEY, account_id varchar NOT NULL, story_key varchar NOT NULL DEFAULT 'story');
    CREATE TABLE media_recommendation_items (id serial PRIMARY KEY, recommendation_set_id integer NOT NULL DEFAULT 1, contact_id integer NOT NULL, score integer NOT NULL DEFAULT 0, rank integer NOT NULL DEFAULT 0);
    CREATE TABLE media_recommendation_decisions (id serial PRIMARY KEY, account_id varchar NOT NULL DEFAULT 'workspace-a', contact_id integer NOT NULL, story_key varchar NOT NULL DEFAULT 'story', decision varchar NOT NULL DEFAULT 'accepted', note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE media_recommendation_feedback (id serial PRIMARY KEY, account_id varchar NOT NULL DEFAULT 'workspace-a', contact_id integer NOT NULL, story_key varchar NOT NULL DEFAULT 'story', signal varchar NOT NULL DEFAULT 'positive', created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE media_outreach (id serial PRIMARY KEY, account_id varchar NOT NULL DEFAULT 'workspace-a', contact_id integer, story_key varchar NOT NULL DEFAULT 'story', status varchar NOT NULL DEFAULT 'pitched', contact_snapshot jsonb NOT NULL DEFAULT '{}', pitch_date timestamptz, response_date timestamptz, notes text NOT NULL DEFAULT '');
    CREATE TABLE media_contact_correction_reports (
      id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL, fields text[] NOT NULL DEFAULT '{}',
      details text NOT NULL DEFAULT '', status varchar(20) NOT NULL DEFAULT 'pending', reported_by varchar NOT NULL DEFAULT '',
      resolution_note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return { db: drizzle(client, { schema }), tables: schema, client };
})();

vi.mock("@workspace/db", async () => ({ ...(await import("@workspace/db/schema")), db, ...tables }));
vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: any, _res: any, next: any) => {
    const username = String(req.headers["x-account"] ?? "member");
    req.account = { username, role: username === "admin" ? "admin" : "agency", membershipRole: "owner" };
    next();
  },
}));
vi.mock("../lib/notify-email", () => ({
  sendJournalistPrivacyCaseAlert: vi.fn().mockRejectedValue(new Error("mail unavailable")),
  sendJournalistPrivacyOutcome: vi.fn(),
}));

const { default: router } = await import("./journalist-privacy");
const { isSuppressedWithDb, privacyHash } = await import("../lib/journalist-privacy");
const app = express();
app.use(express.json());
app.use(router);
const server: Server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
async function call(path: string, init?: RequestInit) { return fetch(`${baseUrl}${path}`, init); }
afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

describe("journalist privacy route integration", () => {
  it("returns the same neutral intake response and persists before notification failure", async () => {
    const app = express();
    app.use(express.json());
    app.use(router);
    const body = { requestType: "removal", name: "Alex Example", email: "alex@example.test", outlet: "Example", details: "Please remove my data." };
    const first = await call("/journalist-privacy/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const second = await call("/journalist-privacy/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, name: "Different Person", email: "different@example.test" }) });
    const firstBody = await first.json() as { message: string };
    const secondBody = await second.json() as { message: string };
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(firstBody.message).toBe(secondBody.message);
    const rows = await db.select().from(tables.journalistPrivacyRequestsTable);
    expect(rows).toHaveLength(2);
    expect(rows.every((row: any) => row.notificationStatus === "failed")).toBe(true);
  });

  it("keeps ordinary members out of case enumeration and retrieval", async () => {
    const app = express();
    app.use(express.json());
    app.use(router);
    expect((await call("/admin/journalist-privacy/requests", { headers: { "x-account": "member" } })).status).toBe(403);
    expect((await call("/admin/journalist-privacy/requests/1", { headers: { "x-account": "member" } })).status).toBe(403);
  });

  it("approves and rejects a verified explicit no-match case without contacts", async () => {
    const [seed] = await db.insert(tables.journalistPrivacyRequestsTable).values({
      requestType: "removal", name: "No Match", email: "nomatch@example.test", outlet: "None",
      details: "No matching record", scope: "under_review", status: "under_review",
      verificationStatus: "verified", dueAt: new Date(Date.now() + 86400000),
    }).returning();
    const approved = await call(`/admin/journalist-privacy/requests/${seed.id}/approve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ noMatch: true, note: "Verified search found no matching contact." }),
    });
    expect(approved.status).toBe(200);
    const resolved = await call(`/admin/journalist-privacy/requests/${seed.id}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "rejected", note: "Rejected because no matching record exists." }),
    });
    expect(resolved.status, await resolved.clone().text()).toBe(200);
    const [row] = await db.select().from(tables.journalistPrivacyRequestsTable).where(eq(tables.journalistPrivacyRequestsTable.id, seed.id));
    expect(row.status).toBe("resolved");
    expect(row.resolution).toBe("rejected");
    expect(row.matchedContactIds).toEqual([]);
  });

  it("redacts canonical and denormalized copies and records scoped suppression", async () => {
    const seeded = await client.query<{ id: number }>(`
      INSERT INTO journalist_privacy_requests
        (request_type, name, email, outlet, details, due_at, verification_status, verification_note, status)
      VALUES ('removal', 'Alex Reporter', 'alex@example.test', 'Daily News', 'Remove my records', now() + interval '1 month', 'verified', 'Identity checked proportionately', 'under_review')
      RETURNING id
    `);
    const requestId = seeded.rows[0].id;
    const outlet = await client.query<{ id: number }>("INSERT INTO media_outlets (account_id, name) VALUES ('workspace-a', 'Daily News') RETURNING id");
    const contact = await client.query<{ id: number }>(`
      INSERT INTO media_contacts
        (outlet_id, first_name, last_name, role, email, phone, mobile, linkedin_url, twitter_handle, account_id, source_ref, source_url, provenance)
      VALUES ($1, 'Alex', 'Reporter', 'Journalist', 'alex@example.test', '123', '456', 'https://linkedin.test/alex', '@alex', 'workspace-a', 'sheet:2', 'https://daily.test/alex', '{"raw":"personal"}')
      RETURNING id
    `, [outlet.rows[0].id]);
    const contactId = contact.rows[0].id;
    await client.query("INSERT INTO media_contact_field_overrides (contact_id, account_id, field_name, value) VALUES ($1, 'workspace-a', 'email', 'alex@example.test')", [contactId]);
    await client.query("INSERT INTO media_contact_source_checks (contact_id, observed_evidence, differences, error_message) VALUES ($1, '{\"email\":\"alex@example.test\"}', '[\"email\"]', 'personal')", [contactId]);
    await client.query("INSERT INTO media_discoveries (account_id, candidate, contact_id) VALUES ('workspace-a', '{\"email\":\"alex@example.test\"}', $1)", [contactId]);
    await client.query("INSERT INTO media_discoveries (account_id, candidate, contact_id) VALUES ('workspace-a', '{\"firstName\":\"Alex\",\"lastName\":\"Reporter\",\"email\":\"alex@example.test\",\"outletName\":\"Daily News\"}', NULL)");
    await client.query("INSERT INTO media_recommendation_items (contact_id) VALUES ($1)", [contactId]);
    await client.query("INSERT INTO media_recommendation_decisions (contact_id) VALUES ($1)", [contactId]);
    await client.query("INSERT INTO media_recommendation_feedback (contact_id) VALUES ($1)", [contactId]);
    await client.query("INSERT INTO media_outreach (contact_id, contact_snapshot) VALUES ($1, '{\"name\":\"Alex Reporter\",\"email\":\"alex@example.test\"}')", [contactId]);

    const approved = await call(`/admin/journalist-privacy/requests/${requestId}/approve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ scope: "workspace", accountId: "workspace-a", matchedContactIds: [contactId], note: "Confirmed workspace record" }),
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
    const resolved = await call(`/admin/journalist-privacy/requests/${requestId}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "upheld", note: "Removal completed across approved workspace scope" }),
    });
    expect(resolved.status, await resolved.clone().text()).toBe(200);

    const redacted = (await client.query<any>("SELECT * FROM media_contacts WHERE id = $1", [contactId])).rows[0];
    expect(redacted).toMatchObject({ first_name: "[redacted]", last_name: "[redacted]", email: "", phone: "", linkedin_url: "" });
    expect(redacted.deleted_at).toBeTruthy();
    expect((await client.query("SELECT * FROM media_contact_field_overrides WHERE contact_id = $1", [contactId])).rows).toHaveLength(0);
    expect((await client.query<any>("SELECT candidate FROM media_discoveries ORDER BY id")).rows)
      .toEqual([{ candidate: { redacted: true } }, { candidate: { redacted: true } }]);
    expect((await client.query<any>("SELECT scope, account_id FROM media_suppressions WHERE request_id = $1", [requestId])).rows)
      .toEqual([{ scope: "workspace", account_id: "workspace-a" }]);
    const ledger = (await client.query<any>("SELECT store, result FROM journalist_privacy_completion_ledger WHERE request_id = $1", [requestId])).rows;
    expect(ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ store: "contacts", result: "redacted" }),
      expect.objectContaining({ store: "field_overrides", result: "redacted" }),
      expect.objectContaining({ store: "discoveries", result: "redacted" }),
    ]));
  });

  it("enforces workspace suppressions only in that workspace and shared suppressions everywhere", async () => {
    await client.query(
      "INSERT INTO media_suppressions (scope, account_id, email_hash, reason) VALUES ('workspace', 'workspace-a', $1, 'objection'), ('shared', NULL, $2, 'objection')",
      [privacyHash("workspace-only@example.test"), privacyHash("shared@example.test")],
    );
    await expect(isSuppressedWithDb(db, { email: "workspace-only@example.test", accountId: "workspace-a" })).resolves.toBe(true);
    await expect(isSuppressedWithDb(db, { email: "workspace-only@example.test", accountId: "workspace-b" })).resolves.toBe(false);
    await expect(isSuppressedWithDb(db, { email: "shared@example.test", accountId: "workspace-a" })).resolves.toBe(true);
    await expect(isSuppressedWithDb(db, { email: "shared@example.test", accountId: "workspace-b" })).resolves.toBe(true);
  });

  it("allows a global canonical contact in a workspace-scoped approval", async () => {
    const contact = await client.query<{ id: number }>(
      "INSERT INTO media_contacts (first_name, last_name, email, account_id) VALUES ('Global', 'Canonical', 'global@example.test', NULL) RETURNING id",
    );
    const seed = await client.query<{ id: number }>(`
      INSERT INTO journalist_privacy_requests
        (request_type, name, email, outlet, details, due_at, verification_status, status)
      VALUES ('correction', 'Global Canonical', 'global@example.test', 'Example', 'Correction', now() + interval '1 month', 'verified', 'under_review')
      RETURNING id
    `);
    const approved = await call(`/admin/journalist-privacy/requests/${seed.rows[0].id}/approve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ scope: "workspace", accountId: "workspace-a", matchedContactIds: [contact.rows[0].id], note: "Global canonical selected for workspace review." }),
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
  });

  it("keeps shared canonical data and other workspace artifacts intact for a workspace-scoped removal", async () => {
    const contact = await client.query<{ id: number }>(
      "INSERT INTO media_contacts (first_name, last_name, email, account_id, source_ref, provenance) VALUES ('Shared', 'Reporter', 'shared-removal@example.test', NULL, 'shared-source', '{\"shared\":true}') RETURNING id",
    );
    const contactId = contact.rows[0].id;
    const sets = await client.query<{ id: number; account_id: string }>(
      "INSERT INTO media_recommendation_sets (account_id) VALUES ('workspace-a'), ('workspace-b') RETURNING id, account_id",
    );
    for (const workspace of ["workspace-a", "workspace-b"]) {
      await client.query("INSERT INTO media_contact_field_overrides (contact_id, account_id, field_name, value) VALUES ($1, $2, 'email', $3)", [contactId, workspace, `${workspace}@example.test`]);
      await client.query("INSERT INTO media_contact_source_checks (contact_id, account_id, observed_evidence) VALUES ($1, $2, $3)", [contactId, workspace, JSON.stringify({ email: `${workspace}@example.test` })]);
      await client.query("INSERT INTO media_discoveries (account_id, candidate, contact_id) VALUES ($1, $2, $3)", [workspace, JSON.stringify({ email: `${workspace}@example.test` }), contactId]);
      await client.query("INSERT INTO media_recommendation_decisions (account_id, contact_id) VALUES ($1, $2)", [workspace, contactId]);
      await client.query("INSERT INTO media_recommendation_feedback (account_id, contact_id) VALUES ($1, $2)", [workspace, contactId]);
      await client.query("INSERT INTO media_outreach (account_id, contact_id, contact_snapshot) VALUES ($1, $2, $3)", [workspace, contactId, JSON.stringify({ name: "Shared Reporter", email: `${workspace}@example.test` })]);
      await client.query("INSERT INTO media_contact_correction_reports (contact_id, account_id, fields, details) VALUES ($1, $2, ARRAY['email'], $3)", [contactId, workspace, `${workspace} correction details`]);
      await client.query("INSERT INTO media_contact_status_events (contact_id, account_id, status, note, created_by) VALUES ($1, $2, 'active', $3, 'reviewer')", [contactId, workspace, `${workspace} status note`]);
    }
    for (const set of sets.rows) {
      await client.query("INSERT INTO media_recommendation_items (recommendation_set_id, contact_id) VALUES ($1, $2)", [set.id, contactId]);
    }
    const seeded = await client.query<{ id: number }>(`
      INSERT INTO journalist_privacy_requests
        (request_type, name, email, outlet, details, due_at, verification_status, status)
      VALUES ('removal', 'Shared Reporter', 'shared-removal@example.test', 'Shared Outlet', 'Workspace removal', now() + interval '1 month', 'verified', 'under_review')
      RETURNING id
    `);
    const requestId = seeded.rows[0].id;
    const approved = await call(`/admin/journalist-privacy/requests/${requestId}/approve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ scope: "workspace", accountId: "workspace-a", matchedContactIds: [contactId], note: "Confirmed only for workspace A." }),
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
    const resolved = await call(`/admin/journalist-privacy/requests/${requestId}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "upheld", note: "Removed workspace A processing copies only." }),
    });
    expect(resolved.status, await resolved.clone().text()).toBe(200);

    const canonical = (await client.query<any>("SELECT * FROM media_contacts WHERE id = $1", [contactId])).rows[0];
    expect(canonical).toMatchObject({ first_name: "Shared", last_name: "Reporter", email: "shared-removal@example.test", source_ref: "shared-source" });
    expect(canonical.deleted_at).toBeNull();
    expect((await client.query<any>("SELECT account_id FROM media_contact_field_overrides WHERE contact_id = $1", [contactId])).rows).toEqual([{ account_id: "workspace-b" }]);
    expect((await client.query<any>("SELECT account_id, candidate FROM media_discoveries WHERE contact_id = $1", [contactId])).rows)
      .toEqual([{ account_id: "workspace-b", candidate: { email: "workspace-b@example.test" } }]);
    expect((await client.query<any>("SELECT account_id, contact_snapshot FROM media_outreach WHERE contact_id = $1 ORDER BY account_id", [contactId])).rows)
      .toEqual([
        { account_id: "workspace-a", contact_snapshot: { name: "[redacted]", role: "", email: "" } },
        { account_id: "workspace-b", contact_snapshot: { name: "Shared Reporter", email: "workspace-b@example.test" } },
      ]);
    expect((await client.query<any>("SELECT account_id, details FROM media_contact_correction_reports WHERE contact_id = $1 ORDER BY account_id", [contactId])).rows)
      .toEqual([
        { account_id: "workspace-a", details: "Redacted following privacy outcome" },
        { account_id: "workspace-b", details: "workspace-b correction details" },
      ]);
    expect((await client.query<any>("SELECT account_id FROM media_recommendation_decisions WHERE contact_id = $1", [contactId])).rows).toEqual([{ account_id: "workspace-b" }]);
    expect((await client.query<any>("SELECT s.account_id FROM media_recommendation_items i JOIN media_recommendation_sets s ON s.id = i.recommendation_set_id WHERE i.contact_id = $1", [contactId])).rows)
      .toEqual([{ account_id: "workspace-b" }]);
    expect((await client.query<any>("SELECT scope, account_id FROM media_suppressions WHERE request_id = $1", [requestId])).rows)
      .toEqual([{ scope: "workspace", account_id: "workspace-a" }]);
  });

  it("builds an access disclosure from every in-scope store, scoped to the approved workspace", async () => {
    const outlet = await client.query<{ id: number }>("INSERT INTO media_outlets (account_id, name) VALUES ('workspace-a', 'Access Outlet') RETURNING id");
    const contact = await client.query<{ id: number }>(`
      INSERT INTO media_contacts
        (outlet_id, first_name, last_name, role, email, phone, mobile, linkedin_url, twitter_handle, account_id, notes, source_ref)
      VALUES ($1, 'Access', 'Case', 'Journalist', 'access-case@example.test', '999', '888', 'https://linkedin.test/access', '@access', 'workspace-a', 'private note', 'sheet:3')
      RETURNING id
    `, [outlet.rows[0].id]);
    const contactId = contact.rows[0].id;
    const set = await client.query<{ id: number }>("INSERT INTO media_recommendation_sets (account_id) VALUES ('workspace-a') RETURNING id");
    await client.query("INSERT INTO media_contact_field_overrides (contact_id, account_id, field_name, value) VALUES ($1, 'workspace-a', 'email', 'access-case@example.test')", [contactId]);
    await client.query("INSERT INTO media_contact_source_checks (contact_id, account_id, observed_evidence) VALUES ($1, 'workspace-a', '{\"email\":\"access-case@example.test\"}')", [contactId]);
    await client.query("INSERT INTO media_discoveries (account_id, candidate, contact_id) VALUES ('workspace-a', '{\"email\":\"access-case@example.test\"}', $1)", [contactId]);
    await client.query("INSERT INTO media_recommendation_items (recommendation_set_id, contact_id) VALUES ($1, $2)", [set.rows[0].id, contactId]);
    await client.query("INSERT INTO media_recommendation_decisions (account_id, contact_id) VALUES ('workspace-a', $1)", [contactId]);
    await client.query("INSERT INTO media_recommendation_feedback (account_id, contact_id) VALUES ('workspace-a', $1)", [contactId]);
    await client.query("INSERT INTO media_outreach (account_id, contact_id, contact_snapshot) VALUES ('workspace-a', $1, '{\"name\":\"Access Case\",\"email\":\"access-case@example.test\"}')", [contactId]);
    await client.query("INSERT INTO media_contact_correction_reports (contact_id, account_id, fields, details) VALUES ($1, 'workspace-a', ARRAY['email'], 'evidence')", [contactId]);
    await client.query("INSERT INTO media_contact_status_events (contact_id, account_id, status, note, created_by) VALUES ($1, 'workspace-a', 'active', 'status note', 'reviewer')", [contactId]);
    // Another workspace's private processing copy of the same canonical contact must never leak into this disclosure.
    await client.query("INSERT INTO media_contact_field_overrides (contact_id, account_id, field_name, value) VALUES ($1, 'workspace-b', 'email', 'other@example.test')", [contactId]);

    const seeded = await client.query<{ id: number }>(`
      INSERT INTO journalist_privacy_requests
        (request_type, name, email, outlet, details, due_at, verification_status, status)
      VALUES ('access', 'Access Case', 'access-case@example.test', 'Access Outlet', 'Access request', now() + interval '1 month', 'verified', 'under_review')
      RETURNING id
    `);
    const requestId = seeded.rows[0].id;
    const approved = await call(`/admin/journalist-privacy/requests/${requestId}/approve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ scope: "workspace", accountId: "workspace-a", matchedContactIds: [contactId], note: "Confirmed match for access review." }),
    });
    expect(approved.status, await approved.clone().text()).toBe(200);
    const resolved = await call(`/admin/journalist-privacy/requests/${requestId}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "upheld", note: "Disclosure prepared for all in-scope stores." }),
    });
    expect(resolved.status, await resolved.clone().text()).toBe(200);

    const [row] = await client.query<any>("SELECT disclosure_result FROM journalist_privacy_requests WHERE id = $1", [requestId]).then((r) => r.rows);
    const disclosure = row.disclosure_result;
    expect(disclosure.approved).toBe(true);
    expect(disclosure.records.contacts).toHaveLength(1);
    expect(disclosure.records.contacts[0]).toMatchObject({ email: "access-case@example.test", notes: "private note" });
    expect(disclosure.records.fieldOverrides).toEqual([{ contact_id: contactId, field_name: "email", value: "access-case@example.test" }]);
    expect(disclosure.records.sourceChecks).toHaveLength(1);
    expect(disclosure.records.discoveries).toHaveLength(1);
    expect(disclosure.records.recommendations).toHaveLength(1);
    expect(disclosure.records.decisions).toHaveLength(1);
    expect(disclosure.records.feedback).toHaveLength(1);
    expect(disclosure.records.outreach).toHaveLength(1);
    expect(disclosure.records.correctionReports).toHaveLength(1);
    expect(disclosure.records.statusEvents).toHaveLength(1);
    // The other workspace's override must not appear anywhere in the disclosure.
    const serialized = JSON.stringify(disclosure.records);
    expect(serialized).not.toContain("other@example.test");
    expect(serialized).not.toContain("workspace-b");

    const ledgerStores = (await client.query<{ store: string; result: string }>("SELECT store, result FROM journalist_privacy_completion_ledger WHERE request_id = $1", [requestId])).rows;
    for (const store of ["contacts", "field_overrides", "source_checks", "discoveries", "recommendations", "decisions", "feedback", "outreach_snapshots", "correction_reports", "status_events"]) {
      expect(ledgerStores.some((entry) => entry.store === store && entry.result === "disclosed")).toBe(true);
    }
  });

  it("queues an actionable correction and closes only after linked steward acceptance", async () => {
    const contact = await client.query<{ id: number }>(
      "INSERT INTO media_contacts (first_name, last_name, email, account_id) VALUES ('Correct', 'Me', 'correct@example.test', NULL) RETURNING id",
    );
    const seed = await client.query<{ id: number }>(`
      INSERT INTO journalist_privacy_requests
        (request_type, name, email, outlet, details, due_at, verification_status, status)
      VALUES ('correction', 'Correct Me', 'correct@example.test', 'Example', 'Correction', now() + interval '1 month', 'verified', 'under_review')
      RETURNING id
    `);
    const id = seed.rows[0].id;
    await call(`/admin/journalist-privacy/requests/${id}/approve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ scope: "workspace", accountId: "workspace-a", matchedContactIds: [contact.rows[0].id], note: "Approved correction." }),
    });
    const invalid = await call(`/admin/journalist-privacy/requests/${id}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "upheld", note: "Missing evidence." }),
    });
    expect(invalid.status).toBe(400);
    const queued = await call(`/admin/journalist-privacy/requests/${id}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "upheld", note: "Queue correction.", correction: { fields: ["email"], values: { email: "new@example.test" }, evidence: "Verified source record." } }),
    });
    expect(queued.status).toBe(409);
    const reports = await client.query<any>("SELECT id, fields, details, status FROM media_contact_correction_reports WHERE contact_id = $1", [contact.rows[0].id]);
    expect(reports.rows).toHaveLength(1);
    expect(reports.rows[0].fields).toEqual(["email"]);
    expect(reports.rows[0].details).toContain("Verified source record.");
    const retryPending = await call(`/admin/journalist-privacy/requests/${id}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "upheld", note: "Retry pending.", correction: { fields: ["email"], values: { email: "new@example.test" }, evidence: "Verified source record." } }),
    });
    expect(retryPending.status).toBe(409);
    await client.query("UPDATE media_contact_correction_reports SET status = 'accepted' WHERE id = $1", [reports.rows[0].id]);
    const closed = await call(`/admin/journalist-privacy/requests/${id}/resolve`, {
      method: "POST", headers: { "content-type": "application/json", "x-account": "admin" },
      body: JSON.stringify({ resolution: "upheld", note: "Accepted correction.", correction: { fields: ["email"], values: { email: "new@example.test" }, evidence: "Verified source record." } }),
    });
    expect(closed.status).toBe(200);
    expect((await client.query("SELECT event_type FROM journalist_privacy_request_events WHERE request_id = $1", [id])).rows.map((row: any) => row.event_type)).toContain("correction_queued");
  });
});
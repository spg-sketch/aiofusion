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
  `);
  return { ...schema, db: drizzle(client, { schema }), __client: client };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.account = { username: String(req.headers["x-account"] || "account-a"), role: "agency" } as NonNullable<express.Request["account"]>;
    next();
  },
}));
vi.mock("../lib/member-guards", () => ({
  memberProjectGate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  inAssignedScope: () => true,
}));
vi.mock("../lib/platform-auth", () => ({
  normUsername: (value: string) => value.toLowerCase(),
  getVisibleUsernames: (account: { username: string }) => Promise.resolve([account.username.toLowerCase()]),
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
    await __client.exec("TRUNCATE media_contact_source_checks, media_contact_field_overrides, media_contacts RESTART IDENTITY");
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
});
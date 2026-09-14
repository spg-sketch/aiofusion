import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express, { type Request } from "express";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await client.exec(`
    CREATE TABLE media_outlets (
      id serial PRIMARY KEY, name text NOT NULL, category text NOT NULL DEFAULT '',
      website text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
      country text NOT NULL DEFAULT '', reach_band text NOT NULL DEFAULT '',
      account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY, outlet_id integer REFERENCES media_outlets(id),
      first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '', mobile text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '',
      twitter_handle text NOT NULL DEFAULT '', beats text[] NOT NULL DEFAULT '{}',
      sectors text[] NOT NULL DEFAULT '{}', geography text NOT NULL DEFAULT '',
      language text NOT NULL DEFAULT '', seniority text NOT NULL DEFAULT '',
      editorial_status text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '',
      source_ref text NOT NULL DEFAULT '', publication_reach text NOT NULL DEFAULT '',
      publication_authority text NOT NULL DEFAULT '', journalist_authority text NOT NULL DEFAULT '',
      confidence text NOT NULL DEFAULT '', review_notes text NOT NULL DEFAULT '',
      provenance jsonb NOT NULL DEFAULT '{}', last_verified_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(), account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contact_field_overrides (
      id serial PRIMARY KEY, contact_id integer NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
      account_id varchar NOT NULL, field_name varchar(80) NOT NULL, value text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(contact_id, account_id, field_name)
    );
    CREATE TABLE media_import_batches (
      id serial PRIMARY KEY, account_id varchar NOT NULL, idempotency_key varchar(160),
      source_filename text NOT NULL DEFAULT '', source_hash varchar(64) NOT NULL DEFAULT '',
      source_type varchar(20) NOT NULL DEFAULT 'csv', summary jsonb NOT NULL DEFAULT '{}',
      committed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(account_id, idempotency_key)
    );
    CREATE TABLE projects (
      id varchar PRIMARY KEY, name varchar NOT NULL DEFAULT '', data jsonb NOT NULL DEFAULT '{}',
      intake jsonb, logo text, owner varchar, tier varchar(16), deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return {
    db,
    mediaCategoriesTable: schema.mediaCategoriesTable,
    mediaOutletsTable: schema.mediaOutletsTable,
    mediaContactsTable: schema.mediaContactsTable,
    mediaContactFieldOverridesTable: schema.mediaContactFieldOverridesTable,
    mediaImportBatchesTable: schema.mediaImportBatchesTable,
    mediaRecommendationSetsTable: schema.mediaRecommendationSetsTable,
    mediaRecommendationItemsTable: schema.mediaRecommendationItemsTable,
    mediaRecommendationDecisionsTable: schema.mediaRecommendationDecisionsTable,
    projectsTable: schema.projectsTable,
  };
});

import {
  db,
  mediaContactsTable,
  mediaImportBatchesTable,
  mediaOutletsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import mediaRouter from "./media-db";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use((req: Request, _res, next) => {
    const username = req.header("x-test-workspace");
    if (username) {
      req.account = {
        username,
        role: req.header("x-test-platform-role") ?? "agency",
        membershipRole: req.header("x-test-member-role") ?? "owner",
        projectAccess: null,
      } as NonNullable<Request["account"]>;
    }
    req.log = logger as unknown as typeof req.log;
    next();
  });
  app.use("/api", mediaRouter);
  return app;
}

let server: Server;
let baseUrl: string;

async function api(workspace: string, body: Record<string, unknown>, role = "owner", platformRole = "agency") {
  const response = await fetch(`${baseUrl}/api/store/media-db/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-workspace": workspace,
      "x-test-member-role": role,
      "x-test-platform-role": platformRole,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as any };
}

const csv = [
  "First Name,Last Name,Publication,Email,Website,Role",
  "Jane,Doe,Workspace Daily,jane@workspace.test,https://workspace.test,Editor",
  "Jane,Doe,Workspace Daily,jane@workspace.test,https://workspace.test,Editor",
].join("\n");

const workbookRows = [{
  sourceRow: 3,
  sheetName: "Technology",
  sector: "Technology",
  firstName: "Alex",
  lastName: "Smith",
  role: "Reporter",
  outletName: "Workbook News",
  email: "alex@workbook.test",
  website: "https://workbook.test",
  description: "",
  beat: "AI",
  country: "GB",
  reachBand: "National",
  confidence: "verified",
  notes: "",
}];

beforeAll(async () => {
  const app = buildApp();
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

describe("media import route regressions", () => {
  it("scopes preview reconciliation to the active workspace, including platform admins", async () => {
    const [otherOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Workspace Daily", website: "https://workspace.test", accountId: "other-workspace",
    }).returning();
    await db.insert(mediaContactsTable).values({
      outletId: otherOutlet!.id, firstName: "Jane", lastName: "Doe",
      email: "jane@workspace.test", accountId: "other-workspace",
    });

    const normal = await api("preview-workspace", { csv });
    const admin = await api("admin-active-workspace", { csv }, "owner", "admin");

    expect(normal.status).toBe(200);
    expect(normal.json.preview).toMatchObject({ new: 1, duplicate: 1, newOutletCount: 1 });
    expect(admin.status).toBe(200);
    expect(admin.json.preview).toMatchObject({ new: 1, duplicate: 1, newOutletCount: 1 });
  });

  it.each(["viewer", "billing"])("blocks %s members from preview and commit", async (role) => {
    const preview = await api(`blocked-${role}`, { csv }, role);
    const commit = await api(`blocked-${role}`, { csv, commit: true }, role);
    expect(preview.status).toBe(403);
    expect(commit.status).toBe(403);
  });

  it("keeps retries idempotent and stores one consistent batch summary", async () => {
    const body = { csv, commit: true, filename: "contacts.csv", idempotencyKey: "retry-key" };
    const first = await api("retry-workspace", body);
    const replay = await api("retry-workspace", body);

    expect(first.status).toBe(200);
    expect(first.json.result).toMatchObject({ contactsCreated: 1, outletsCreated: 1, duplicatesSkipped: 1 });
    expect(replay.status).toBe(200);
    expect(replay.json.result).toMatchObject({ contactsCreated: 1, outletsCreated: 1, duplicatesSkipped: 1, replayed: true });
    expect(await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.accountId, "retry-workspace"))).toHaveLength(1);
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, "retry-workspace"))).toHaveLength(1);
    expect(await db.select().from(mediaImportBatchesTable).where(eq(mediaImportBatchesTable.accountId, "retry-workspace"))).toHaveLength(1);
  });

  it("serializes concurrent commits without duplicate contacts or outlets", async () => {
    const body = { rows: workbookRows, commit: true, filename: "contacts.xlsx", idempotencyKey: "concurrent-key" };
    const responses = await Promise.all([
      api("concurrent-workspace", body),
      api("concurrent-workspace", body),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.filter((response) => response.json.result.replayed)).toHaveLength(1);
    expect(await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.accountId, "concurrent-workspace"))).toHaveLength(1);
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, "concurrent-workspace"))).toHaveLength(1);
    expect(await db.select().from(mediaImportBatchesTable).where(eq(mediaImportBatchesTable.accountId, "concurrent-workspace"))).toHaveLength(1);
  });

  it("does not create an orphan outlet when an existing email names a new outlet", async () => {
    const [existingOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Existing News", website: "https://existing.test", accountId: "reconcile-workspace",
    }).returning();
    await db.insert(mediaContactsTable).values({
      outletId: existingOutlet!.id, firstName: "Alex", lastName: "Smith",
      email: "alex@workbook.test", accountId: "reconcile-workspace",
    });

    const response = await api("reconcile-workspace", {
      rows: workbookRows, commit: true, filename: "contacts.xlsx", idempotencyKey: "reconcile-key",
    });

    expect(response.status).toBe(200);
    expect(response.json.preview).toMatchObject({ refreshed: 1, new: 0, newOutletCount: 0 });
    expect(response.json.result).toMatchObject({ contactsCreated: 0, outletsCreated: 0, duplicatesSkipped: 1 });
    expect(await db.select().from(mediaOutletsTable).where(and(
      eq(mediaOutletsTable.accountId, "reconcile-workspace"),
      eq(mediaOutletsTable.name, "Workbook News"),
    ))).toHaveLength(0);
  });
});
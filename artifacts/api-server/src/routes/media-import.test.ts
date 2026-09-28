import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
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
      country text NOT NULL DEFAULT '', reach_band text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '',
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
      source_check_claimed_at timestamptz, source_check_claim_token varchar(80),
      source_check_failure_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(), account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contact_field_overrides (
      id serial PRIMARY KEY, contact_id integer NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
      account_id varchar NOT NULL, field_name varchar(80) NOT NULL, value text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(contact_id, account_id, field_name)
    );
    CREATE TABLE media_contact_source_checks (
      id serial PRIMARY KEY, contact_id integer NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
      account_id varchar NOT NULL, source_url text NOT NULL, outcome varchar(20) NOT NULL,
      error_code varchar(40), error_message text NOT NULL DEFAULT '', observed_evidence jsonb NOT NULL DEFAULT '{}',
      differences jsonb NOT NULL DEFAULT '[]', checked_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_contact_status_events (
      id serial PRIMARY KEY, contact_id integer NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
      account_id varchar NOT NULL, status varchar(20) NOT NULL, note text NOT NULL DEFAULT '',
      created_by varchar NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_bookmarks (
      id serial PRIMARY KEY, account_id varchar NOT NULL,
      contact_id integer REFERENCES media_contacts(id) ON DELETE CASCADE,
      outlet_id integer REFERENCES media_outlets(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((contact_id IS NOT NULL) <> (outlet_id IS NOT NULL)),
      UNIQUE(account_id, contact_id), UNIQUE(account_id, outlet_id)
    );
    CREATE TABLE media_contact_correction_reports (
      id serial PRIMARY KEY, contact_id integer NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
      account_id varchar NOT NULL, fields text[] NOT NULL DEFAULT '{}', details text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending', reported_by varchar NOT NULL,
      resolution_note text NOT NULL DEFAULT '', reviewed_by varchar, source_check_id integer,
      reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_import_batches (
      id serial PRIMARY KEY, account_id varchar NOT NULL, idempotency_key varchar(160),
      source_filename text NOT NULL DEFAULT '', source_hash varchar(64) NOT NULL DEFAULT '',
      source_type varchar(20) NOT NULL DEFAULT 'csv', summary jsonb NOT NULL DEFAULT '{}',
      committed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(account_id, idempotency_key)
    );
    CREATE TABLE media_import_jobs (
      id varchar(80) PRIMARY KEY, account_id varchar NOT NULL, idempotency_key varchar(160) NOT NULL,
      source_filename text NOT NULL DEFAULT '', source_hash varchar(64) NOT NULL,
      source_type varchar(20) NOT NULL DEFAULT 'csv', collection_scope varchar(20) NOT NULL,
      category text NOT NULL DEFAULT '', status varchar(24) NOT NULL DEFAULT 'parsing',
      input jsonb NOT NULL DEFAULT '{}', summary jsonb NOT NULL DEFAULT '{}', error text NOT NULL DEFAULT '',
      batch_id integer REFERENCES media_import_batches(id), created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, claimed_at timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      UNIQUE(account_id, idempotency_key)
    );
    CREATE TABLE media_suppressions (
      id serial PRIMARY KEY, request_id integer, email_hash text, name_hash text, outlet_hash text, linkedin_hash text,
      scope text NOT NULL DEFAULT 'shared', account_id varchar, reason text NOT NULL DEFAULT '',
      active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
    );
    CREATE TABLE media_recommendation_sets (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL, criteria jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_recommendation_items (
      id serial PRIMARY KEY, recommendation_set_id integer NOT NULL REFERENCES media_recommendation_sets(id) ON DELETE CASCADE,
      contact_id integer NOT NULL REFERENCES media_contacts(id), score integer NOT NULL,
      reasons jsonb NOT NULL DEFAULT '[]', phrase_attributions jsonb NOT NULL DEFAULT '[]',
      rank integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(recommendation_set_id, contact_id)
    );
    CREATE TABLE media_recommendation_feedback (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL, contact_id integer NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE,
      signal varchar(12) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id, project_id, story_key, contact_id)
    );
    CREATE TABLE media_outreach (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL, contact_id integer, outlet_id integer,
      status varchar(20) NOT NULL DEFAULT 'planned', article_snapshot jsonb NOT NULL DEFAULT '{}',
      contact_snapshot jsonb NOT NULL DEFAULT '{}', outlet_snapshot jsonb NOT NULL DEFAULT '{}',
      target_phrases jsonb NOT NULL DEFAULT '[]', notes text NOT NULL DEFAULT '',
      responsible_team_member text NOT NULL DEFAULT '', created_by varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_recommendation_decisions (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL, contact_id integer NOT NULL, decision varchar(20) NOT NULL,
      note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE platform_accounts (
      username varchar PRIMARY KEY, password_hash text NOT NULL DEFAULT '',
      role varchar NOT NULL DEFAULT 'agency', parent varchar, max_seats integer,
      created_at timestamptz NOT NULL DEFAULT now(), email varchar, website varchar,
      status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE platform_companies (
      id varchar PRIMARY KEY, slug varchar UNIQUE NOT NULL, role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar, free_access boolean NOT NULL DEFAULT true, status varchar NOT NULL DEFAULT 'active',
      plan varchar(16), billing_frequency varchar(16), subscription_status varchar(16),
      stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz,
      beta_trial_started_at timestamptz, beta_trial_ends_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE projects (
      id varchar PRIMARY KEY, name varchar NOT NULL DEFAULT '', data jsonb NOT NULL DEFAULT '{}',
      intake jsonb, logo text, owner varchar, tier varchar(16), deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE archive_items (
      id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL,
      title varchar NOT NULL DEFAULT '', deleted_at timestamptz
    );
    CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL);
    CREATE TABLE token_usage (
      id serial PRIMARY KEY, account_id varchar(200) NOT NULL, operation varchar(80) NOT NULL,
      model varchar(80) NOT NULL, input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0, cost_gbp_estimate numeric(10,6),
      project_id varchar(200), created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Keep this static DB mock's exports aligned with the real schema: the media
  // router imports fair-usage tables even when exercising import routes.
  return { ...schema, db, pool: { end: () => client.close() } };
});

import {
  db,
  mediaContactsTable,
  mediaBookmarksTable,
  mediaContactFieldOverridesTable,
  mediaContactStatusEventsTable,
  mediaImportBatchesTable,
  mediaImportJobsTable,
  mediaOutletsTable,
  mediaRecommendationSetsTable,
  mediaRecommendationItemsTable,
  mediaSuppressionsTable,
  platformAccountsTable,
  projectsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { privacyHash } from "../lib/journalist-privacy";
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
const previousSessionSecret = process.env.SESSION_SECRET;

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
  const json = await response.json() as any;
  if (response.status !== 202 || !json.jobId) return { status: response.status, json };
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const statusResponse = await fetch(`${baseUrl}/api/store/media-db/import-jobs/${json.jobId}`, {
      headers: {
        "x-test-workspace": workspace,
        "x-test-member-role": role,
        "x-test-platform-role": platformRole,
      },
    });
    const statusJson = await statusResponse.json() as any;
    if (statusJson.job?.status === "completed") {
      return { status: 200, json: { ok: true, jobId: json.jobId, preview: json.preview, result: { ...statusJson.job.summary, ...(json.replayed ? { replayed: true } : {}) } } };
    }
    if (statusJson.job?.status === "failed") return { status: 400, json: { error: statusJson.job.error } };
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Import job ${json.jobId} did not finish in the test timeout`);
}

async function mediaRequest(
  method: string,
  path: string,
  workspace: string,
  body?: Record<string, unknown>,
  role = "owner",
  platformRole = "agency",
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-workspace": workspace,
      "x-test-member-role": role,
      "x-test-platform-role": platformRole,
    },
    body: body ? JSON.stringify(body) : undefined,
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

const V33_WORKBOOK = "../../../../attached_assets/AIO_Fusion_Master_Media_Database_V33_040926_(1)_1789542841485.xlsx";

async function encodedV33Workbook(): Promise<string> {
  return (await readFile(new URL(V33_WORKBOOK, import.meta.url))).toString("base64");
}

async function previewThenCommit(
  workspace: string,
  body: Record<string, unknown>,
  role = "owner",
  platformRole = "agency",
) {
  const previewResponse = await api(workspace, { ...body, commit: false }, role, platformRole);
  expect(previewResponse.status).toBe(200);
  const preview = previewResponse.json.preview;
  const commitResponse = await api(workspace, {
    ...body,
    commit: true,
    sourceHash: preview.sourceHash,
    reviewToken: preview.reviewToken,
    acknowledgeTarget: true,
    ...(Number(preview.conflicted ?? preview.conflicts ?? 0) > 0 ? { acknowledgeConflicts: true } : {}),
  }, role, platformRole);
  return { previewResponse, preview, commitResponse };
}

beforeAll(async () => {
  process.env.SESSION_SECRET = "test-session-secret";
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
  if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSessionSecret;
});

describe("media import route regressions", () => {
  it("returns a durable job immediately and reconciles exact-source retries to its persisted summary", async () => {
    const previewResponse = await api("durable-job-workspace", {
      csv,
      filename: "durable.csv",
      collectionScope: "workspace",
      commit: false,
    });
    const commitBody = {
      csv,
      filename: "durable.csv",
      collectionScope: "workspace",
      commit: true,
      idempotencyKey: "durable-job-first",
      sourceHash: previewResponse.json.preview.sourceHash,
      reviewToken: previewResponse.json.preview.reviewToken,
      acknowledgeTarget: true,
    };
    const firstResponse = await fetch(`${baseUrl}/api/store/media-db/import`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-workspace": "durable-job-workspace" },
      body: JSON.stringify(commitBody),
    });
    const first = await firstResponse.json() as any;
    expect(firstResponse.status).toBe(202);
    expect(first.jobId).toMatch(/^[0-9a-f-]{36}$/);

    const retryResponse = await fetch(`${baseUrl}/api/store/media-db/import`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-workspace": "durable-job-workspace" },
      body: JSON.stringify(commitBody),
    });
    const retry = await retryResponse.json() as any;
    expect(retryResponse.status).toBe(202);
    expect(retry).toMatchObject({ jobId: first.jobId, replayed: true });

    let completed: any;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const status = await mediaRequest("GET", `/api/store/media-db/import-jobs/${first.jobId}`, "durable-job-workspace");
      if (status.json.job?.status === "completed") {
        completed = status.json.job;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(completed).toMatchObject({
      id: first.jobId,
      status: "completed",
      sourceHash: previewResponse.json.preview.sourceHash,
      summary: { contactsCreated: 1, duplicatesSkipped: 1 },
    });
  });

  it("reclaims a persisted queued job after an interrupted worker", async () => {
    const workspace = "recovered-job-workspace";
    const rows = [{
      sourceRow: 2,
      firstName: "Recovery",
      lastName: "Reporter",
      outletName: "Recovery News",
      email: "recovery@example.test",
    }];
    const previewResponse = await api(workspace, { rows, filename: "recovery.csv" });
    const preview = previewResponse.json.preview;
    const [payload] = String(preview.reviewToken).split(".");
    const claim = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as { fingerprint: string };
    const jobId = "restart-recovery-job";
    await db.insert(mediaImportJobsTable).values({
      id: jobId,
      accountId: workspace,
      idempotencyKey: "restart-recovery-key",
      sourceFilename: "recovery.csv",
      sourceHash: preview.sourceHash,
      sourceType: "parsed",
      collectionScope: "workspace",
      category: "",
      status: "reconciliation",
      input: {
        rows,
        parsedErrors: [],
        category: "",
        filename: "recovery.csv",
        idempotencyKey: "restart-recovery-key",
        collectionScope: "workspace",
        commit: true,
        acknowledgeTarget: true,
        acknowledgeConflicts: true,
        workspaceId: workspace,
        persistedSourceHash: preview.sourceHash,
        persistedSourceType: "parsed",
        persistedByteLength: 1,
        reviewedFingerprint: claim.fingerprint,
      },
    });

    let completed: any;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const status = await mediaRequest("GET", `/api/store/media-db/import-jobs/${jobId}`, workspace);
      if (status.json.job?.status === "completed") {
        completed = status.json.job;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(completed).toMatchObject({
      id: jobId,
      status: "completed",
      summary: { contactsCreated: 1, sourceHash: preview.sourceHash },
    });
  });

  it("retries failed jobs only when the immutable import identity still matches", async () => {
    const workspace = "failed-retry-workspace";
    const originalRows = [{
      sourceRow: 2,
      firstName: "Retry",
      lastName: "Reporter",
      outletName: "Retry News",
      email: "retry@example.test",
    }];
    const originalPreviewResponse = await api(workspace, {
      rows: originalRows,
      filename: "retry.csv",
      category: "Technology",
    });
    const originalPreview = originalPreviewResponse.json.preview;
    await db.insert(mediaImportJobsTable).values([
      {
        id: "failed-same-source-job",
        accountId: workspace,
        idempotencyKey: "failed-same-source-key",
        sourceFilename: "retry.csv",
        sourceHash: originalPreview.sourceHash,
        sourceType: "parsed",
        collectionScope: "workspace",
        category: "Technology",
        status: "failed",
        error: "Transient database error",
      },
      {
        id: "failed-different-source-job",
        accountId: workspace,
        idempotencyKey: "failed-different-source-key",
        sourceFilename: "retry.csv",
        sourceHash: originalPreview.sourceHash,
        sourceType: "parsed",
        collectionScope: "workspace",
        category: "Technology",
        status: "failed",
        error: "Transient database error",
      },
    ]);

    const retried = await api(workspace, {
      rows: originalRows,
      filename: "retry.csv",
      category: "Technology",
      commit: true,
      idempotencyKey: "failed-same-source-key",
      sourceHash: originalPreview.sourceHash,
      reviewToken: originalPreview.reviewToken,
      acknowledgeTarget: true,
    });
    expect(retried.status).toBe(200);
    expect(retried.json.jobId).toBe("failed-same-source-job");
    const [completedRetry] = await db.select().from(mediaImportJobsTable)
      .where(eq(mediaImportJobsTable.id, "failed-same-source-job"));
    expect(completedRetry).toMatchObject({
      sourceHash: originalPreview.sourceHash,
      category: "Technology",
      collectionScope: "workspace",
      status: "completed",
    });

    const changedRows = [{ ...originalRows[0], email: "different@example.test" }];
    const changedPreviewResponse = await api(workspace, {
      rows: changedRows,
      filename: "different.csv",
      category: "Technology",
    });
    const changedPreview = changedPreviewResponse.json.preview;
    const changedSourceRetry = await api(workspace, {
      rows: changedRows,
      filename: "different.csv",
      category: "Technology",
      commit: true,
      idempotencyKey: "failed-different-source-key",
      sourceHash: changedPreview.sourceHash,
      reviewToken: changedPreview.reviewToken,
      acknowledgeTarget: true,
    });
    expect(changedSourceRetry.status).toBe(409);
    expect(changedSourceRetry.json.error).toMatch(/different source file/i);
    const [unchangedFailedJob] = await db.select().from(mediaImportJobsTable)
      .where(eq(mediaImportJobsTable.id, "failed-different-source-job"));
    expect(unchangedFailedJob).toMatchObject({
      sourceHash: originalPreview.sourceHash,
      category: "Technology",
      collectionScope: "workspace",
      status: "failed",
    });
  });

  it("returns populated category labels from visible, live, unsuppressed contacts", async () => {
    const [workspaceOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Category Workspace Outlet",
      category: "Trade Media",
      accountId: "category-workspace",
    }).returning();
    const [sharedOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Category Shared Outlet",
      category: "Shared Industry",
      accountId: null,
    }).returning();
    const [privateOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Category Private Outlet",
      category: "Private Industry",
      accountId: "category-other",
    }).returning();
    await db.insert(mediaContactsTable).values([
      {
        outletId: workspaceOutlet!.id,
        firstName: "Visible",
        lastName: "Workspace",
        sectors: ["Technology", "  Trade Media  "],
        accountId: "category-workspace",
      },
      {
        outletId: sharedOutlet!.id,
        firstName: "Visible",
        lastName: "Shared",
        sectors: ["Technology"],
        accountId: null,
      },
      {
        outletId: privateOutlet!.id,
        firstName: "Hidden",
        lastName: "Private",
        sectors: ["Private Sector"],
        accountId: "category-other",
      },
      {
        outletId: workspaceOutlet!.id,
        firstName: "Deleted",
        lastName: "Contact",
        sectors: ["Deleted Industry"],
        accountId: "category-workspace",
        deletedAt: new Date(),
      },
      {
        outletId: workspaceOutlet!.id,
        firstName: "Suppressed",
        lastName: "Contact",
        email: "suppressed-category@example.test",
        sectors: ["Suppressed Industry"],
        accountId: "category-workspace",
      },
    ]);
    await db.insert(mediaSuppressionsTable).values({
      scope: "workspace",
      accountId: "category-workspace",
      emailHash: privacyHash("suppressed-category@example.test"),
      reason: "request",
    });

    const response = await mediaRequest("GET", "/api/store/media-db/categories", "category-workspace");
    expect(response.status).toBe(200);
    expect(response.json.categories).toEqual(["Shared Industry", "Technology", "Trade Media"]);
    expect(response.json.categories).not.toEqual(expect.arrayContaining([
      "Private Industry", "Private Sector", "Deleted Industry", "Suppressed Industry",
    ]));
  });

  it("filters a large category contact set against shared and workspace suppressions", async () => {
    const workspace = "category-scale-workspace";
    const [outlet] = await db.insert(mediaOutletsTable).values({
      name: "Scale News",
      category: "Scale Publication",
      accountId: workspace,
    }).returning();
    const contacts = Array.from({ length: 240 }, (_, index) => ({
      outletId: outlet!.id,
      firstName: "Scale",
      lastName: `Reporter ${index}`,
      email: `scale-${index}@example.test`,
      sectors: [index < 120 ? "Suppressed Scale Sector" : "Visible Scale Sector"],
      accountId: workspace,
    }));
    await db.insert(mediaContactsTable).values(contacts);
    await db.insert(mediaSuppressionsTable).values(
      contacts.slice(0, 120).map((contact, index) => ({
        scope: index % 2 === 0 ? "shared" : "workspace",
        accountId: index % 2 === 0 ? null : workspace,
        emailHash: privacyHash(contact.email),
        reason: "scale regression",
      })),
    );

    const response = await mediaRequest("GET", "/api/store/media-db/categories", workspace);
    expect(response.status).toBe(200);
    expect(response.json.categories).toEqual(expect.arrayContaining(["Scale Publication", "Visible Scale Sector"]));
    expect(response.json.categories).not.toContain("Suppressed Scale Sector");
  });

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
    expect(normal.json.preview).toMatchObject({
      collectionScope: "workspace",
      owner: "preview-workspace",
      new: 1,
      duplicate: 1,
      newOutletCount: 1,
    });
    expect(admin.status).toBe(200);
    expect(admin.json.preview).toMatchObject({
      collectionScope: "workspace",
      owner: "admin-active-workspace",
      new: 1,
      duplicate: 1,
      newOutletCount: 1,
    });
  });

  it("keeps the default private and permits an explicit shared import only for writable Master", async () => {
    const sharedRows = [{ ...workbookRows[0], outletName: "Shared Workbook News", email: "alex@shared-workbook.test", website: "https://shared-workbook.test" }];
    const denied = await api("customer-workspace", { rows: sharedRows, collectionScope: "shared" });
    expect(denied.status).toBe(403);
    const restrictedMaster = await api("admin", { rows: sharedRows, collectionScope: "shared" }, "viewer", "admin");
    expect(restrictedMaster.status).toBe(403);

    const preview = await api("admin", { rows: sharedRows, collectionScope: "shared" }, "owner", "admin");
    expect(preview.status).toBe(200);
    expect(preview.json.preview).toMatchObject({
      collectionScope: "shared",
      owner: "Master",
      ownerNamespace: "__global_admin__",
      new: 1,
      newOutletCount: 1,
    });

    const { commitResponse: committed } = await previewThenCommit(
      "admin",
      { rows: sharedRows, collectionScope: "shared", idempotencyKey: "shared-import-key" },
      "owner",
      "admin",
    );
    expect(committed.status).toBe(200);
    expect(committed.json.preview).toMatchObject({
      collectionScope: "shared",
      owner: "Master",
      ownerNamespace: "__global_admin__",
    });
    expect(await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.email, "alex@shared-workbook.test")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ accountId: null })]));
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.website, "https://shared-workbook.test")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ accountId: null })]));
    expect(await db.select().from(mediaImportBatchesTable).where(eq(mediaImportBatchesTable.accountId, "__global_admin__")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ idempotencyKey: "shared-import-key" })]));
  });

  it("protects private rows from Master-wide mutation and shared rows from non-Master mutation", async () => {
    const [privateOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Private Outlet", accountId: "private-owner",
    }).returning();
    const [privateContact] = await db.insert(mediaContactsTable).values({
      outletId: privateOutlet!.id, firstName: "Private", lastName: "Contact", accountId: "private-owner",
      sourceUrl: "https://private.example/contact",
    }).returning();
    const [sharedOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Shared Outlet", accountId: null,
    }).returning();
    const [sharedContact] = await db.insert(mediaContactsTable).values({
      outletId: sharedOutlet!.id, firstName: "Shared", lastName: "Contact", accountId: null,
      sourceUrl: "https://shared.example/contact",
    }).returning();

    expect((await mediaRequest("PUT", `/api/store/media-db/outlets/${privateOutlet!.id}`, "admin", { name: "Leaked" }, "owner", "admin")).status).toBe(403);
    expect((await mediaRequest("DELETE", `/api/store/media-db/contacts/${privateContact!.id}`, "admin", undefined, "owner", "admin")).status).toBe(403);
    expect((await mediaRequest("PUT", `/api/store/media-db/outlets/${sharedOutlet!.id}`, "customer", { name: "Nope" })).status).toBe(403);
    expect((await mediaRequest("DELETE", `/api/store/media-db/contacts/${sharedContact!.id}`, "customer")).status).toBe(403);
    expect((await mediaRequest("POST", `/api/store/media-db/contacts/${sharedContact!.id}/source-check`, "customer")).status).toBe(403);

    expect((await mediaRequest("PUT", `/api/store/media-db/outlets/${sharedOutlet!.id}`, "admin", { name: "Curated" }, "owner", "admin")).status).toBe(200);
    expect((await mediaRequest("PUT", `/api/store/media-db/contacts/${sharedContact!.id}`, "admin", { role: "Curated Editor" }, "owner", "admin")).status).toBe(200);
    expect(await db.select().from(mediaContactFieldOverridesTable).where(eq(mediaContactFieldOverridesTable.accountId, "__global_admin__")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ contactId: sharedContact!.id, fieldName: "role" })]));
    expect((await mediaRequest("DELETE", `/api/store/media-db/contacts/${sharedContact!.id}`, "admin", undefined, "owner", "admin")).status).toBe(200);
  });

  it("keeps unnamed source rows out of Contacts cards and pagination without exposing another workspace's people", async () => {
    await db.insert(platformAccountsTable).values([
      { username: "person-search-workspace", passwordHash: "", role: "agency", parent: null },
      { username: "person-search-other", passwordHash: "", role: "agency", parent: null },
    ]);
    const [publication] = await db.insert(mediaOutletsTable).values({
      name: "Person Search Publication", category: "Cybersecurity", accountId: null,
    }).returning();
    const [namedContact, unnamedContact, otherWorkspaceContact] = await db.insert(mediaContactsTable).values([
      { outletId: publication!.id, firstName: "Riley", lastName: "Reporter", role: "Editor", accountId: null },
      { outletId: publication!.id, firstName: "  ", lastName: "", accountId: null },
      { outletId: publication!.id, firstName: "Private", lastName: "Reporter", accountId: "person-search-other" },
    ]).returning();

    const firstPage = await mediaRequest(
      "GET",
      "/api/store/media-db/search?type=contacts&scope=all&category=Cybersecurity&page=1&pageSize=1",
      "person-search-workspace",
    );
    expect(firstPage.status).toBe(200);
    expect(firstPage.json.total).toBe(1);
    expect(firstPage.json.counts).toEqual({ contacts: 1, outlets: 0 });
    expect(firstPage.json.results).toHaveLength(1);
    expect(firstPage.json.results[0]).toMatchObject({
      type: "contact",
      id: namedContact!.id,
      contact: { firstName: "Riley", lastName: "Reporter", role: "Editor" },
    });
    expect(firstPage.json.results[0].contact.firstName.trim()).not.toBe("");

    const secondPage = await mediaRequest(
      "GET",
      "/api/store/media-db/search?type=contacts&scope=all&category=Cybersecurity&page=2&pageSize=1",
      "person-search-workspace",
    );
    expect(secondPage.json.total).toBe(1);
    expect(secondPage.json.counts.contacts).toBe(1);
    expect(secondPage.json.results).toEqual([]);

    const publications = await mediaRequest(
      "GET",
      "/api/store/media-db/search?type=publications&scope=all&category=Cybersecurity",
      "person-search-workspace",
    );
    expect(publications.json.results[0].outlet.journalists.map((contact: any) => contact.id)).toEqual([namedContact!.id]);
    expect(publications.json.results[0].outlet.journalists.map((contact: any) => contact.id)).not.toContain(unnamedContact!.id);
    const outletBrowse = await mediaRequest(
      "GET",
      "/api/store/media-db/outlets?q=Person%20Search%20Publication",
      "person-search-workspace",
    );
    expect(outletBrowse.json.outlets[0].linkedJournalists.map((contact: any) => contact.id)).toEqual([namedContact!.id]);
    expect(outletBrowse.json.outlets[0].journalistsTotal).toBe(1);

    const otherWorkspaceSearch = await mediaRequest(
      "GET",
      "/api/store/media-db/search?type=contacts&scope=all&category=Cybersecurity",
      "person-search-other",
    );
    expect(otherWorkspaceSearch.json.results.map((result: any) => result.id)).toEqual([
      namedContact!.id,
      otherWorkspaceContact!.id,
    ]);
    expect(otherWorkspaceSearch.json.results.map((result: any) => result.id)).not.toContain(unnamedContact!.id);
    expect(await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, unnamedContact!.id))).toHaveLength(1);
    const stewardContacts = await mediaRequest(
      "GET",
      `/api/store/media-db/contacts?outletId=${publication!.id}`,
      "person-search-workspace",
    );
    expect(stewardContacts.json.contacts.map((contact: any) => contact.id)).toContain(unnamedContact!.id);
  });

  it("keeps private media and reusable bookmarks inside the active account and includes only eligible linked journalists", async () => {
    await db.insert(platformAccountsTable).values([
      { username: "media-parent-430", passwordHash: "", role: "agency", parent: null },
      { username: "media-child-430", passwordHash: "", role: "client", parent: "media-parent-430" },
      { username: "media-other-430", passwordHash: "", role: "agency", parent: null },
    ]);
    const [publication] = await db.insert(mediaOutletsTable).values({
      name: "Bounded Journalists Publication 430", category: "Technology", country: "United Kingdom", website: "345", accountId: null,
    }).returning();
    const [sharedJournalist, suppressedJournalist, parentJournalist, childJournalist, otherJournalist] = await db.insert(mediaContactsTable).values([
      { outletId: publication!.id, firstName: "Shared", lastName: "Journalist", email: "shared-430@example.test", accountId: null },
      { outletId: publication!.id, firstName: "Private", lastName: "Suppressed", email: "suppressed-430@example.test", accountId: null },
      { outletId: publication!.id, firstName: "Parent", lastName: "Journalist", email: "parent-430@example.test", accountId: "media-parent-430" },
      { outletId: publication!.id, firstName: "Child", lastName: "Journalist", email: "child-430@example.test", accountId: "media-child-430" },
      { outletId: publication!.id, firstName: "Other", lastName: "Journalist", email: "other-430@example.test", accountId: "media-other-430" },
    ]).returning();
    await db.insert(mediaSuppressionsTable).values({
      scope: "shared", emailHash: privacyHash(suppressedJournalist!.email), reason: "privacy request",
    });
    await db.insert(mediaContactStatusEventsTable).values({
      contactId: parentJournalist!.id, accountId: "media-parent-430", status: "departed", createdBy: "test",
    });

    const parentSearch = await mediaRequest("GET", "/api/store/media-db/search?phrase=Bounded%20Journalists%20Publication%20430", "media-parent-430");
    const childSearch = await mediaRequest("GET", "/api/store/media-db/search?phrase=Bounded%20Journalists%20Publication%20430", "media-child-430", undefined, "owner", "client");
    const parentPublication = parentSearch.json.results.find((result: any) => result.type === "outlet");
    const childPublication = childSearch.json.results.find((result: any) => result.type === "outlet");
    expect(parentPublication.journalists.map((contact: any) => contact.id)).toEqual([sharedJournalist!.id]);
    expect(parentPublication.outlet.website).toBe("");
    expect(parentPublication.journalistsTotal).toBe(1);
    expect(parentPublication.journalistsNote).toBeNull();
    expect(parentPublication.outlet.linkedJournalists.map((contact: any) => contact.id)).toEqual([sharedJournalist!.id]);
    expect(childPublication.journalists.map((contact: any) => contact.id).sort()).toEqual([sharedJournalist!.id, childJournalist!.id].sort());
    expect(parentPublication.journalists.map((contact: any) => contact.email)).not.toContain(suppressedJournalist!.email);
    expect(childPublication.journalists.map((contact: any) => contact.email)).not.toContain(otherJournalist!.email);
    const outletList = await mediaRequest("GET", "/api/store/media-db/outlets?q=Bounded%20Journalists%20Publication%20430", "media-parent-430");
    expect(outletList.json.outlets[0].website).toBe("");
    expect(outletList.json.outlets[0].linkedJournalists.map((contact: any) => contact.id)).toEqual([sharedJournalist!.id]);

    const contactsOnly = await mediaRequest("GET", "/api/store/media-db/search?type=contacts&scope=all&category=Technology&location=UK", "media-parent-430");
    expect(contactsOnly.json.results.every((result: any) => result.type === "contact")).toBe(true);
    expect(contactsOnly.json.counts.contacts).toBeGreaterThan(0);
    expect(contactsOnly.json.counts.outlets).toBe(0);
    const publicationsOnly = await mediaRequest("GET", "/api/store/media-db/search?type=publications&scope=all&category=Technology", "media-parent-430");
    expect(publicationsOnly.json.results.every((result: any) => result.type === "outlet")).toBe(true);
    expect(publicationsOnly.json.counts.contacts).toBe(0);
    const addedOnly = await mediaRequest("GET", "/api/store/media-db/search?type=contacts&scope=added", "media-parent-430");
    expect(addedOnly.json.results.map((result: any) => result.id)).toEqual([parentJournalist!.id]);

    const parentContactList = await mediaRequest("GET", "/api/store/media-db/contacts?q=Journalist", "media-parent-430");
    const parentContactIds = parentContactList.json.contacts.map((contact: any) => contact.id);
    expect(parentContactIds).toContain(sharedJournalist!.id);
    expect(parentContactIds).not.toContain(childJournalist!.id);
    expect(parentContactIds).not.toContain(otherJournalist!.id);

    const savedContact = await mediaRequest("POST", "/api/store/media-db/bookmarks", "media-parent-430", {
      type: "contact", id: sharedJournalist!.id,
    });
    const savedPublication = await mediaRequest("POST", "/api/store/media-db/bookmarks", "media-parent-430", {
      type: "publication", id: publication!.id,
    });
    const duplicateContactSave = await mediaRequest("POST", "/api/store/media-db/bookmarks", "media-parent-430", {
      type: "contact", id: sharedJournalist!.id,
    });
    const putContactSave = await mediaRequest("PUT", `/api/store/media-db/bookmarks/contact/${sharedJournalist!.id}`, "media-parent-430");
    expect(savedContact.status).toBe(200);
    expect(savedPublication.status).toBe(200);
    expect(duplicateContactSave.json.bookmark.id).toBe(savedContact.json.bookmark.id);
    expect(putContactSave.status).toBe(200);
    expect((await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, sharedJournalist!.id))).length).toBe(1);
    const parentBookmarks = await mediaRequest("GET", "/api/store/media-db/bookmarks", "media-parent-430");
    const childBookmarks = await mediaRequest("GET", "/api/store/media-db/bookmarks", "media-child-430", undefined, "owner", "client");
    expect(parentBookmarks.json.total).toBe(2);
    expect(childBookmarks.json.total).toBe(0);
    expect(parentBookmarks.json.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "contact", id: sharedJournalist!.id, targetId: sharedJournalist!.id }),
      expect.objectContaining({ type: "publication", id: publication!.id, targetId: publication!.id }),
    ]));
    const savedSearch = await mediaRequest("GET", "/api/store/media-db/search?type=contacts&scope=saved", "media-parent-430");
    expect(savedSearch.json.results.every((result: any) => result.type === "contact")).toBe(true);
    expect(savedSearch.json.results.map((result: any) => result.id)).toEqual([sharedJournalist!.id]);
    const savedPublications = await mediaRequest("GET", "/api/store/media-db/search?type=publications&scope=saved", "media-parent-430");
    expect(savedPublications.json.results.map((result: any) => result.id)).toEqual([publication!.id]);
    expect(savedPublications.json.counts.contacts).toBe(0);
    const deleteBookmark = await mediaRequest("DELETE", `/api/store/media-db/bookmarks/contact/${sharedJournalist!.id}`, "media-parent-430");
    expect(deleteBookmark.status).toBe(200);
    const manualPublication = await mediaRequest("POST", "/api/store/media-db/outlets", "media-parent-430", {
      name: "Manually LinkedIn Publication", linkedinUrl: "https://www.linkedin.com/company/manual-entry",
    });
    expect(manualPublication.json.outlet.linkedinUrl).toBe("https://www.linkedin.com/company/manual-entry");
    const updatedManualPublication = await mediaRequest("PUT", `/api/store/media-db/outlets/${manualPublication.json.outlet.id}`, "media-parent-430", {
      linkedinUrl: "www.linkedin.com/company/manual-update",
    });
    expect(updatedManualPublication.json.outlet.linkedinUrl).toBe("https://www.linkedin.com/company/manual-update");
    expect((await mediaRequest("POST", "/api/store/media-db/bookmarks", "media-child-430", {
      type: "contact", id: parentJournalist!.id,
    })).status).toBe(404);
    expect((await mediaRequest("POST", "/api/store/media-db/bookmarks", "media-parent-430", {
      type: "contact", id: sharedJournalist!.id,
    }, "viewer")).status).toBe(403);
    expect(await db.select().from(mediaBookmarksTable).where(eq(mediaBookmarksTable.accountId, "media-parent-430"))).toHaveLength(1);
  });

  it("returns shared contacts to agency and client search/recommendations without unrelated private records", async () => {
    await db.insert(platformAccountsTable).values([
      { username: "agency-search", passwordHash: "", role: "agency", parent: null },
      { username: "client-search", passwordHash: "", role: "client", parent: "agency-search" },
      { username: "unrelated-search", passwordHash: "", role: "agency", parent: null },
    ]);
    await db.execute(sql`INSERT INTO platform_companies (id, slug, free_access, subscription_status, plan) VALUES
      ('agency-search-company', 'agency-search', true, 'active', 'agency'),
      ('client-search-company', 'client-search', true, 'active', 'agency'),
      ('unrelated-search-company', 'unrelated-search', true, 'active', 'agency')`);
    await db.insert(projectsTable).values({
      id: "shared-media-search-project",
      name: "Shared media search project",
      owner: "agency-search",
    });
    await db.execute(sql`INSERT INTO archive_items (id, project_id, owner, title) VALUES
      ('shared-story-agency-search', 'shared-media-search-project', 'agency-search', 'Shared story'),
      ('shared-story-client-search', 'shared-media-search-project', 'agency-search', 'Shared story')`);
    const [sharedOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Shared Access News",
      category: "Technology",
      accountId: null,
    }).returning();
    const [sharedContact] = await db.insert(mediaContactsTable).values({
      outletId: sharedOutlet!.id,
      firstName: "Shared",
      lastName: "Reporter",
      role: "Technology Reporter",
      email: "shared-search@example.test",
      beats: ["shared-topic"],
      sectors: ["Technology"],
      accountId: null,
    }).returning();
    const [privateOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Unrelated Private News",
      category: "Technology",
      accountId: "unrelated-search",
    }).returning();
    const [privateContact] = await db.insert(mediaContactsTable).values({
      outletId: privateOutlet!.id,
      firstName: "Private",
      lastName: "Reporter",
      role: "Technology Reporter",
      email: "private-search@example.test",
      beats: ["shared-topic"],
      sectors: ["Technology"],
      accountId: "unrelated-search",
    }).returning();

    for (const [workspace, platformRole] of [["agency-search", "agency"], ["client-search", "client"]] as const) {
      const search = await mediaRequest("GET", "/api/store/media-db/search?topic=shared-topic", workspace, undefined, "owner", platformRole);
      expect(search.status).toBe(200);
      const searchContacts = (search.json.results as Array<{ type: string; id: number }>)
        .filter((result) => result.type === "contact");
      expect(searchContacts.map((result) => result.id)).toContain(sharedContact!.id);
      expect(searchContacts.map((result) => result.id)).not.toContain(privateContact!.id);

      const recommendations = await mediaRequest(
        "POST",
        "/api/store/media-db/recommendations",
        workspace,
        {
          projectId: "shared-media-search-project",
          storyKey: `shared-story-${workspace}`,
          terms: ["shared-topic"],
        },
        "owner",
        platformRole,
      );
      expect(recommendations.status).toBe(200);
      const recommendedIds = (recommendations.json.items as Array<{ contact: { id: number } }>)
        .map((item) => item.contact.id);
      expect(recommendedIds).toContain(sharedContact!.id);
      expect(recommendedIds).not.toContain(privateContact!.id);
    }
  });

  it.each(["viewer", "billing"])("blocks %s members from preview and commit", async (role) => {
    const preview = await api(`blocked-${role}`, { csv }, role);
    const commit = await api(`blocked-${role}`, { csv, commit: true }, role);
    expect(preview.status).toBe(403);
    expect(commit.status).toBe(403);
  });

  it("keeps retries idempotent and stores one consistent batch summary", async () => {
    const body = { csv, filename: "contacts.csv", idempotencyKey: "retry-key" };
    const firstPreview = await api("retry-workspace", body);
    expect(firstPreview.status).toBe(200);
    const commitBody = {
      ...body,
      commit: true,
      sourceHash: firstPreview.json.preview.sourceHash,
      reviewToken: firstPreview.json.preview.reviewToken,
      acknowledgeTarget: true,
    };
    const first = await api("retry-workspace", commitBody);
    const replay = await api("retry-workspace", commitBody);

    expect(first.status).toBe(200);
    expect(first.json.result).toMatchObject({ contactsCreated: 1, outletsCreated: 1, duplicatesSkipped: 1 });
    expect(replay.status).toBe(200);
    expect(replay.json.result).toMatchObject({ contactsCreated: 1, outletsCreated: 1, duplicatesSkipped: 1, replayed: true });
    expect(await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.accountId, "retry-workspace"))).toHaveLength(1);
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, "retry-workspace"))).toHaveLength(1);
    expect(await db.select().from(mediaImportBatchesTable).where(eq(mediaImportBatchesTable.accountId, "retry-workspace"))).toHaveLength(1);
  });

  it("exposes publication-only outlet mutations consistently in preview and commit", async () => {
    const rows = [{
      sourceRow: 2,
      sheetName: "Publications",
      recordType: "publication" as const,
      firstName: "",
      lastName: "",
      role: "",
      outletName: "Publication Only News",
      email: "",
      website: "https://publication-only.test",
      description: "",
      beat: "",
      country: "GB",
      reachBand: "National",
      confidence: "",
      notes: "",
    }];
    const { preview, commitResponse } = await previewThenCommit("publication-only-workspace", {
      rows,
      filename: "publications.csv",
      idempotencyKey: "publication-only-key",
    });

    expect(preview).toMatchObject({
      importableRows: 0,
      publicationRows: 1,
      newOutletCount: 1,
      expectedMutations: {
        outletsCreated: 1,
        contactsCreated: 0,
        contactsMatched: 0,
        publicationsProcessed: 1,
      },
    });
    expect(commitResponse.status).toBe(200);
    expect(commitResponse.json.result).toMatchObject({
      outletsCreated: 1,
      contactsCreated: 0,
      publicationsProcessed: 1,
      expectedMutations: preview.expectedMutations,
    });
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, "publication-only-workspace")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: "Publication Only News" })]));
  });

  it("refreshes metadata on an existing publication outlet instead of silently skipping it", async () => {
    await db.insert(mediaOutletsTable).values({
      name: "Refresh Outlet",
      website: "https://refresh-outlet.test/old-path",
      category: "Old Category",
      description: "Old description",
      country: "US",
      reachBand: "Local",
      accountId: "publication-refresh-workspace",
    });
    const rows = [{
      sourceRow: 2,
      recordType: "publication" as const,
      firstName: "",
      lastName: "",
      role: "",
      outletName: "Refresh Outlet",
      email: "",
      website: "https://www.refresh-outlet.test/new-path",
      description: "New description",
      beat: "",
      country: "GB",
      reachBand: "National",
      confidence: "",
      notes: "",
      sector: "Technology",
    }];
    const { preview, commitResponse } = await previewThenCommit("publication-refresh-workspace", {
      rows,
      category: "Technology",
      filename: "publication-refresh.csv",
      idempotencyKey: "publication-refresh-key",
    });

    expect(preview).toMatchObject({
      publicationRows: 1,
      outletRefreshed: 1,
      outletUnchanged: 0,
      newOutletCount: 0,
      expectedMutations: {
        outletsCreated: 0,
        outletsUpdated: 1,
        outletsUnchanged: 0,
        publicationsProcessed: 1,
      },
    });
    expect(commitResponse.status).toBe(200);
    expect(commitResponse.json.result).toMatchObject({
      outletsCreated: 0,
      outletsUpdated: 1,
      expectedMutations: preview.expectedMutations,
    });
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, "publication-refresh-workspace")))
      .toEqual([expect.objectContaining({
        category: "Technology",
        description: "New description",
        country: "GB",
        reachBand: "National",
      })]);
  });

  it("keeps shared publication metadata read-only for workspace imports, including Master private uploads", async () => {
    const [sharedOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Shared Publication Refresh",
      website: "https://shared-publication-refresh.test",
      category: "Old Category",
      description: "Shared description",
      country: "US",
      reachBand: "Local",
      accountId: null,
    }).returning();
    const [privateSibling] = await db.insert(mediaOutletsTable).values({
      name: "Shared Publication Refresh",
      website: "https://shared-publication-refresh.test",
      category: "Sibling Category",
      description: "Sibling description",
      country: "CA",
      reachBand: "Regional",
      accountId: "private-sibling",
    }).returning();
    const rows = [{
      sourceRow: 2,
      recordType: "publication" as const,
      firstName: "",
      lastName: "",
      role: "",
      outletName: "Shared Publication Refresh",
      email: "",
      website: "https://shared-publication-refresh.test",
      description: "Incoming description",
      beat: "",
      country: "GB",
      reachBand: "National",
      confidence: "",
      notes: "",
    }];

    const workspaceImport = await previewThenCommit("shared-readonly-workspace", {
      rows,
      category: "Technology",
      filename: "shared-publication.csv",
      idempotencyKey: "shared-readonly-workspace-key",
    });
    expect(workspaceImport.preview).toMatchObject({
      outletRefreshed: 0,
      outletUnchanged: 1,
      expectedMutations: {
        outletsUpdated: 0,
        outletsUnchanged: 1,
        publicationsProcessed: 1,
      },
    });
    expect(workspaceImport.commitResponse.status).toBe(200);
    expect(workspaceImport.commitResponse.json.result).toMatchObject({
      outletsUpdated: 0,
      outletsUnchanged: 1,
      expectedMutations: workspaceImport.preview.expectedMutations,
    });
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, sharedOutlet!.id)))
      .toEqual([expect.objectContaining({
        category: "Old Category",
        description: "Shared description",
        country: "US",
        reachBand: "Local",
      })]);
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, privateSibling!.id)))
      .toEqual([expect.objectContaining({
        category: "Sibling Category",
        description: "Sibling description",
        country: "CA",
        reachBand: "Regional",
      })]);

    const masterPrivateImport = await previewThenCommit("admin", {
      rows,
      category: "Technology",
      filename: "shared-publication.csv",
      idempotencyKey: "shared-readonly-master-private-key",
    }, "owner", "admin");
    expect(masterPrivateImport.preview).toMatchObject({
      collectionScope: "workspace",
      outletRefreshed: 0,
      outletUnchanged: 1,
      expectedMutations: {
        outletsUpdated: 0,
        outletsUnchanged: 1,
      },
    });
    expect(masterPrivateImport.commitResponse.status).toBe(200);
    expect(masterPrivateImport.commitResponse.json.result).toMatchObject({
      outletsUpdated: 0,
      outletsUnchanged: 1,
    });
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, sharedOutlet!.id)))
      .toEqual([expect.objectContaining({
        category: "Old Category",
        description: "Shared description",
        country: "US",
        reachBand: "Local",
      })]);

    const sharedMasterImport = await previewThenCommit("admin", {
      rows,
      collectionScope: "shared",
      category: "Technology",
      filename: "shared-publication.csv",
      idempotencyKey: "shared-refresh-master-key",
    }, "owner", "admin");
    expect(sharedMasterImport.preview).toMatchObject({
      collectionScope: "shared",
      outletRefreshed: 1,
      outletUnchanged: 0,
      expectedMutations: {
        outletsUpdated: 1,
        outletsUnchanged: 0,
      },
    });
    expect(sharedMasterImport.commitResponse.status).toBe(200);
    expect(sharedMasterImport.commitResponse.json.result).toMatchObject({
      outletsUpdated: 1,
      expectedMutations: sharedMasterImport.preview.expectedMutations,
    });
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, sharedOutlet!.id)))
      .toEqual([expect.objectContaining({
        category: "Technology",
        description: "Incoming description",
        country: "GB",
        reachBand: "National",
      })]);
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, privateSibling!.id)))
      .toEqual([expect.objectContaining({
        category: "Sibling Category",
        description: "Sibling description",
        country: "CA",
        reachBand: "Regional",
      })]);
  });

  it("persists a changed LinkedIn URL while preserving a manually overridden field", async () => {
    const [outlet] = await db.insert(mediaOutletsTable).values({
      name: "LinkedIn Refresh News",
      website: "https://linkedin-refresh.test",
      accountId: "linkedin-refresh-workspace",
    }).returning();
    const [contact] = await db.insert(mediaContactsTable).values({
      outletId: outlet!.id,
      firstName: "Alex",
      lastName: "Reporter",
      role: "Manual Role",
      email: "alex@linkedin-refresh.test",
      linkedinUrl: "https://linkedin.test/old",
      accountId: "linkedin-refresh-workspace",
    }).returning();
    await db.insert(mediaContactFieldOverridesTable).values({
      contactId: contact!.id,
      accountId: "linkedin-refresh-workspace",
      fieldName: "role",
      value: "Manual Role",
    });
    const rows = [{
      sourceRow: 2,
      firstName: "Alex",
      lastName: "Reporter",
      role: "Imported Role",
      outletName: "LinkedIn Refresh News",
      email: "alex@linkedin-refresh.test",
      website: "https://linkedin-refresh.test",
      description: "",
      beat: "",
      country: "",
      reachBand: "",
      confidence: "",
      notes: "",
      linkedinUrl: "https://linkedin.test/new",
    }];
    const { preview, commitResponse } = await previewThenCommit("linkedin-refresh-workspace", {
      rows,
      filename: "linkedin-refresh.csv",
      idempotencyKey: "linkedin-refresh-key",
    });

    expect(preview).toMatchObject({ conflicted: 1, refreshed: 0 });
    expect(preview.rowOutcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome: "conflicted", fields: ["linkedinUrl"] }),
    ]));
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("role") }),
    ]));
    expect(commitResponse.status).toBe(200);
    const [afterRefresh] = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.id, contact!.id));
    expect(afterRefresh).toMatchObject({
      role: "Manual Role",
      linkedinUrl: "https://linkedin.test/new",
    });
  });

  it("serializes concurrent commits without duplicate contacts or outlets", async () => {
    const previewResponse = await api("concurrent-workspace", { rows: workbookRows, filename: "contacts.xlsx", idempotencyKey: "concurrent-key" });
    expect(previewResponse.status).toBe(200);
    const body = {
      rows: workbookRows,
      filename: "contacts.xlsx",
      idempotencyKey: "concurrent-key",
      commit: true,
      sourceHash: previewResponse.json.preview.sourceHash,
      reviewToken: previewResponse.json.preview.reviewToken,
      acknowledgeTarget: true,
    };
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

    const { commitResponse: response } = await previewThenCommit("reconcile-workspace", {
      rows: workbookRows, filename: "contacts.xlsx", idempotencyKey: "reconcile-key",
    });

    expect(response.status).toBe(200);
    expect(response.json.preview).toMatchObject({ conflicted: 1, refreshed: 0, new: 0, newOutletCount: 0 });
    expect(response.json.result).toMatchObject({ contactsCreated: 0, outletsCreated: 0, conflicted: 1 });
    expect(await db.select().from(mediaOutletsTable).where(and(
      eq(mediaOutletsTable.accountId, "reconcile-workspace"),
      eq(mediaOutletsTable.name, "Workbook News"),
    ))).toHaveLength(0);
  });

  it("previews and commits the actual encoded V33 workbook with complete sheet reconciliation", async () => {
    const xlsxBase64 = await encodedV33Workbook();
    const body = {
      xlsxBase64,
      filename: "AIO_Fusion_Master_Media_Database_V33.xlsx",
      idempotencyKey: "v33-real-workbook",
      category: "Technology",
    };
    const previewResponse = await api("v33-workspace", body);
    expect(previewResponse.status).toBe(200);
    const preview = previewResponse.json.preview;
    expect(preview.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.sourceByteLength).toBeGreaterThan(3_000_000);
    expect(preview.metadata).toMatchObject({
      sourceType: "xlsx",
      worksheetCount: 129,
      acceptedRows: 19_275,
      rejectedRows: 161,
    });
    expect(preview).toMatchObject({
      validRows: 19_275,
      importableRows: 13_119,
      new: 13_119,
      conflicted: 3_643,
      duplicate: 2_413,
      newOutletCount: 5_359,
      expectedMutations: {
        outletsCreated: 5_359,
        outletsUpdated: 0,
        outletsUnchanged: 0,
        contactsCreated: 13_119,
        contactsMatched: 0,
        publicationsProcessed: 100,
      },
    });
    expect(preview.sheetInventory).toHaveLength(129);
    expect(preview.sheetInventory.every((sheet: { rejectedRows: number; rejectedRowRefs: number[] }) =>
      sheet.rejectedRowRefs.length === sheet.rejectedRows)).toBe(true);
    expect(preview.errors.filter((error: { sheetName?: string }) => error.sheetName).length)
      .toBeGreaterThanOrEqual(preview.metadata.rejectedRows);
    expect(preview.recordTypeCounts.publication).toBe(116);
    expect(preview.rowOutcomes).toHaveLength(preview.validRows);
    expect(preview.rowOutcomes.every((outcome: Record<string, unknown>) => !("identityKey" in outcome))).toBe(true);

    const commit = await api("v33-workspace", {
      ...body,
      commit: true,
      sourceHash: preview.sourceHash,
      reviewToken: preview.reviewToken,
      acknowledgeTarget: true,
      ...(Number(preview.conflicted ?? preview.conflicts ?? 0) > 0 ? { acknowledgeConflicts: true } : {}),
    });
    expect(commit.status).toBe(200);
    expect(commit.json.result.contactsCreated).toBeGreaterThan(0);
    expect(commit.json.result.outletsCreated).toBeGreaterThan(0);
    expect(commit.json.result.expectedMutations).toEqual(preview.expectedMutations);
    expect(commit.json.result.rowOutcomes).toHaveLength(preview.rowOutcomes.length);
    expect(await db.select().from(mediaImportBatchesTable)
      .where(eq(mediaImportBatchesTable.accountId, "v33-workspace")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceHash: preview.sourceHash, idempotencyKey: "v33-real-workbook" }),
      ]));
    const [batch] = await db.select().from(mediaImportBatchesTable)
      .where(eq(mediaImportBatchesTable.accountId, "v33-workspace"));
    expect((batch!.summary as Record<string, unknown>).rowOutcomes).toBeUndefined();
  // Completion validation can run this suite alongside the full release gate,
  // which runs the API suite again. Allow the real 3 MB workbook reconciliation
  // enough headroom under that deliberate CPU and database contention.
  }, 300_000);

  it("conflicts same-email rows when names or outlets differ instead of merging them", async () => {
    const rows = [
      { ...workbookRows[0], sourceRow: 2, firstName: "Alex", lastName: "Smith", outletName: "Same Email Daily", email: "same@identity.test", website: "https://same-email.test" },
      { ...workbookRows[0], sourceRow: 3, firstName: "Alec", lastName: "Smith", outletName: "Same Email Daily", email: "same@identity.test", website: "https://same-email.test" },
      { ...workbookRows[0], sourceRow: 4, firstName: "Alex", lastName: "Smith", outletName: "Other Email Daily", email: "same@identity.test", website: "https://other-email.test" },
    ];
    const response = await api("identity-conflict-workspace", { rows });
    expect(response.status).toBe(200);
    expect(response.json.preview).toMatchObject({ new: 0, conflicted: 3, importableRows: 0 });
    expect(response.json.preview.rowOutcomes.filter((outcome: { outcome: string }) => outcome.outcome === "conflicted")).toHaveLength(3);
    expect(response.json.preview.rowOutcomes.every((outcome: Record<string, unknown>) => !("identityKey" in outcome))).toBe(true);

    const committed = await api("identity-conflict-workspace", {
      rows,
      commit: true,
      sourceHash: response.json.preview.sourceHash,
      reviewToken: response.json.preview.reviewToken,
      acknowledgeTarget: true,
      acknowledgeConflicts: true,
    });
    expect(committed.status).toBe(200);
    expect(committed.json.result).toMatchObject({ contactsCreated: 0, outletsCreated: 0, conflicted: 3 });
    expect(await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.accountId, "identity-conflict-workspace")))
      .toHaveLength(0);
  });

  it("acknowledged sparse-first identity conflicts leave the existing contact and provenance unchanged", async () => {
    const workspace = "sparse-existing-contact-conflict-workspace";
    const [outlet] = await db.insert(mediaOutletsTable).values({
      name: "Sparse Existing Route News",
      website: "https://sparse-existing-route.test",
      accountId: workspace,
    }).returning();
    const provenance = {
      importFilename: "previous-import.csv",
      sourceHash: "previous-source-hash",
      sourceType: "parsed",
      marker: "preserve-existing-provenance",
    };
    const [existingContact] = await db.insert(mediaContactsTable).values({
      outletId: outlet!.id,
      firstName: "Jane",
      lastName: "Doe",
      role: "Existing Editor",
      email: "old@route.test",
      sourceUrl: "https://existing-route-source.test/jane",
      provenance,
      accountId: workspace,
    }).returning();
    const rows = [
      {
        sourceRow: 2,
        firstName: "Jane",
        lastName: "Doe",
        role: "",
        outletName: "Sparse Existing Route News",
        email: "",
        website: "https://sparse-existing-route.test",
      },
      {
        sourceRow: 3,
        firstName: "Jane",
        lastName: "Doe",
        role: "Imported Editor",
        outletName: "Sparse Existing Route News",
        email: "new@route.test",
        website: "https://sparse-existing-route.test",
      },
    ];

    const previewResponse = await api(workspace, {
      rows,
      filename: "sparse-existing-route.csv",
    });
    expect(previewResponse.status).toBe(200);
    const preview = previewResponse.json.preview;
    expect(preview).toMatchObject({
      new: 0,
      refreshed: 0,
      unchanged: 0,
      conflicted: 2,
      importableRows: 0,
      expectedMutations: {
        contactsCreated: 0,
        contactsMatched: 0,
      },
    });
    expect(preview.rowOutcomes).toHaveLength(2);
    expect(preview.rowOutcomes.every((outcome: { outcome: string }) => outcome.outcome === "conflicted")).toBe(true);

    const committed = await api(workspace, {
      rows,
      filename: "sparse-existing-route.csv",
      commit: true,
      sourceHash: preview.sourceHash,
      reviewToken: preview.reviewToken,
      acknowledgeTarget: true,
      acknowledgeConflicts: true,
    });
    expect(committed.status).toBe(200);
    expect(committed.json.result).toMatchObject({
      contactsCreated: 0,
      contactsMatched: 0,
      outletsCreated: 0,
      conflicted: 2,
    });

    const contacts = await db.select().from(mediaContactsTable).where(eq(mediaContactsTable.accountId, workspace));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toEqual(existingContact);
    expect(contacts[0]!.provenance).toEqual(provenance);
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.accountId, workspace))).toHaveLength(1);
  });

  it("rejects parsed row payloads over the hard limit", async () => {
    const tooManyRows = Array.from({ length: 50_001 }, (_, index) => ({
      sourceRow: index + 1,
      firstName: "A",
      lastName: "B",
      outletName: "Too Many Rows",
      email: `row-${index}@too-many.test`,
    }));
    const response = await api("oversized-parsed-workspace", { rows: tooManyRows });
    expect(response.status).toBe(413);
    expect(response.json.error).toMatch(/50,000/);
  });

  it("binds review tokens to source/category and preserves manual edits across re-import", async () => {
    const initialRows = [{
      sourceRow: 2,
      sheetName: "Technology",
      sector: "Technology",
      firstName: "Morgan",
      lastName: "Lee",
      role: "Reporter",
      outletName: "Curated News",
      email: "morgan@curated.test",
      website: "https://curated.test",
      description: "",
      beat: "AI",
      country: "GB",
      reachBand: "National",
      confidence: "verified",
      notes: "",
      sourceUrl: "https://source-one.test/morgan",
    }];
    const initialBody = {
      rows: initialRows,
      category: "Technology",
      filename: "curated.csv",
      idempotencyKey: "curated-initial",
    };
    const initialPreview = await api("curated-workspace", initialBody);
    expect(initialPreview.status).toBe(200);
    const initialToken = initialPreview.json.preview;

    const tamperedHash = await api("curated-workspace", {
      ...initialBody,
      commit: true,
      sourceHash: "0".repeat(64),
      reviewToken: initialToken.reviewToken,
      acknowledgeTarget: true,
    });
    expect(tamperedHash.status).toBe(409);
    const tamperedToken = await api("curated-workspace", {
      ...initialBody,
      commit: true,
      sourceHash: initialToken.sourceHash,
      reviewToken: "tampered",
      acknowledgeTarget: true,
    });
    expect(tamperedToken.status).toBe(409);
    const changedCategory = await api("curated-workspace", {
      ...initialBody,
      category: "Finance",
      commit: true,
      sourceHash: initialToken.sourceHash,
      reviewToken: initialToken.reviewToken,
      acknowledgeTarget: true,
    });
    expect(changedCategory.status).toBe(409);

    const initialCommit = await api("curated-workspace", {
      ...initialBody,
      commit: true,
      sourceHash: initialToken.sourceHash,
      reviewToken: initialToken.reviewToken,
      acknowledgeTarget: true,
    });
    expect(initialCommit.status).toBe(200);
    const [createdContact] = await db.select().from(mediaContactsTable)
      .where(eq(mediaContactsTable.accountId, "curated-workspace"));
    expect(createdContact).toBeDefined();
    const changedCategoryRetry = await api("curated-workspace", {
      ...initialBody,
      category: "Finance",
      commit: true,
      sourceHash: initialToken.sourceHash,
      reviewToken: initialToken.reviewToken,
      acknowledgeTarget: true,
    });
    expect(changedCategoryRetry.status).toBe(409);

    const overrideFingerprintPreview = await api("curated-workspace", {
      ...initialBody,
      idempotencyKey: undefined,
    });
    expect(overrideFingerprintPreview.status).toBe(200);
    await db.insert(mediaContactFieldOverridesTable).values({
      contactId: createdContact!.id,
      accountId: "curated-workspace",
      fieldName: "confidence",
      value: "verified",
    });
    const overrideOnlyStale = await api("curated-workspace", {
      ...initialBody,
      idempotencyKey: "curated-override-stale",
      commit: true,
      sourceHash: overrideFingerprintPreview.json.preview.sourceHash,
      reviewToken: overrideFingerprintPreview.json.preview.reviewToken,
      acknowledgeTarget: true,
    });
    expect(overrideOnlyStale.status).toBe(409);

    const manualEdit = await mediaRequest("PUT", `/api/store/media-db/contacts/${createdContact!.id}`, "curated-workspace", {
      role: "Curated Editor",
      sourceUrl: "https://manual.test/morgan",
    });
    expect(manualEdit.status).toBe(200);

    // The first preview was valid before the edit, but its collection
    // fingerprint is now stale and cannot be committed.
    const staleAfterManualEdit = await api("curated-workspace", {
      ...initialBody,
      idempotencyKey: "curated-stale-after-edit",
      commit: true,
      sourceHash: initialToken.sourceHash,
      reviewToken: initialToken.reviewToken,
      acknowledgeTarget: true,
    });
    expect(staleAfterManualEdit.status).toBe(409);

    const refreshedRows = [{
      ...initialRows[0],
      role: "Source Editor",
      beat: "Startups",
      sector: "Finance",
      sourceUrl: "https://source-two.test/morgan",
    }];
    const refreshedBody = {
      rows: refreshedRows,
      category: "Technology",
      filename: "curated-refresh.csv",
    };
    const refreshedPreview = await api("curated-workspace", refreshedBody);
    expect(refreshedPreview.status).toBe(200);
    expect(refreshedPreview.json.preview.conflicted).toBeGreaterThan(0);
    expect(refreshedPreview.json.preview.rowOutcomes)
      .toEqual(expect.arrayContaining([expect.objectContaining({ outcome: "conflicted" })]));
    const refreshedCommit = await api("curated-workspace", {
      ...refreshedBody,
      commit: true,
      sourceHash: refreshedPreview.json.preview.sourceHash,
      reviewToken: refreshedPreview.json.preview.reviewToken,
      acknowledgeTarget: true,
      acknowledgeConflicts: true,
    });
    expect(refreshedCommit.status).toBe(200);

    const [afterRefresh] = await db.select().from(mediaContactsTable)
      .where(eq(mediaContactsTable.id, createdContact!.id));
    expect(afterRefresh).toMatchObject({
      role: "Curated Editor",
      sourceUrl: "https://manual.test/morgan",
      geography: "GB",
      lastVerifiedAt: null,
    });
    expect(afterRefresh!.beats).toEqual(expect.arrayContaining(["AI", "Startups"]));
    expect(afterRefresh!.sectors).toEqual(expect.arrayContaining(["Technology", "Finance"]));
    expect(afterRefresh!.provenance).toMatchObject({
      sourceType: "parsed",
      sourceVerifiedDateAsserted: false,
    });
    expect(await db.select().from(mediaContactFieldOverridesTable)
      .where(eq(mediaContactFieldOverridesTable.contactId, createdContact!.id)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ fieldName: "role" }),
        expect.objectContaining({ fieldName: "sourceUrl" }),
      ]));
  });
});
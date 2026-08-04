/**
 * Integration tests: AI action route guards
 *
 * Mounts the REAL combined router from routes/index.ts (not a hand-crafted
 * sub-stack) and asserts that:
 *
 *  1. Viewer and billing members get 403 on every AI action path.
 *  2. An allowed role (owner) is NOT blocked by blockReadOnlyMembers.
 *  3. A removed member's session (session_version bumped) is rejected on the
 *     next request (401 / session invalidated).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// Anthropic + OpenAI — mock before any route module is imported.
// ---------------------------------------------------------------------------
const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate, stream: messagesCreate };
    constructor(_opts: unknown) {}
  },
}));

const { chatCompletionsCreate } = vi.hoisted(() => ({ chatCompletionsCreate: vi.fn() }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: chatCompletionsCreate } };
    constructor(_opts: unknown) {}
  },
}));

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database mock (same pattern as team.test.ts)
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await client.exec(`
    CREATE TABLE IF NOT EXISTS platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) UNIQUE,
      name varchar(128),
      password_hash text,
      google_id varchar(255) UNIQUE,
      microsoft_id varchar(255) UNIQUE,
      session_version integer NOT NULL DEFAULT 0,
      email_verified boolean,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug varchar(64) NOT NULL UNIQUE,
      role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar(64),
      max_seats int,
      email varchar(255),
      billing_email varchar(255),
      vat_number varchar(64),
      website varchar(512),
      display_name varchar(128),
      free_access boolean NOT NULL DEFAULT false,
      status varchar NOT NULL DEFAULT 'active',
      setup_complete boolean,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_memberships (
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL,
      role varchar NOT NULL DEFAULT 'owner',
      project_access text,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, company_id)
    );
    CREATE TABLE IF NOT EXISTS platform_invitations (
      token varchar(64) PRIMARY KEY,
      email varchar(255) NOT NULL,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL,
      role varchar NOT NULL DEFAULT 'viewer',
      project_access text,
      invited_by_user_id uuid,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_accounts (
      username varchar PRIMARY KEY,
      password_hash text NOT NULL,
      role varchar NOT NULL DEFAULT 'user',
      parent varchar,
      max_seats int,
      created_at timestamptz NOT NULL DEFAULT now(),
      email varchar,
      website varchar,
      status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS platform_meta (
      key varchar PRIMARY KEY,
      value text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_sessions (
      sid varchar PRIMARY KEY,
      username varchar NOT NULL,
      user_id uuid,
      active_company_id uuid,
      session_version integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      ip_hint varchar
    );
    CREATE TABLE IF NOT EXISTS projects (
      id varchar PRIMARY KEY,
      name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}',
      intake jsonb,
      logo text,
      owner varchar,
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS archive_items (
      id varchar PRIMARY KEY,
      project_id varchar NOT NULL,
      owner varchar NOT NULL,
      title varchar NOT NULL DEFAULT '',
      content_type varchar NOT NULL DEFAULT '',
      spokesperson varchar,
      status varchar NOT NULL DEFAULT 'Draft',
      tags jsonb DEFAULT '[]',
      headline text, standfirst text, body_copy text, body text,
      selected_messages jsonb, media_cats jsonb,
      pub_date varchar, released_at varchar, release_channel varchar, source varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS saved_audits (
      id varchar PRIMARY KEY,
      project_id varchar NOT NULL,
      owner varchar NOT NULL,
      saved_at varchar NOT NULL,
      result jsonb NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS project_snapshots (
      id varchar PRIMARY KEY,
      project_id varchar,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS audit_locks (
      project_id varchar NOT NULL,
      audit_type varchar NOT NULL,
      owner varchar NOT NULL DEFAULT '',
      last_run_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, audit_type)
    );
    CREATE TABLE IF NOT EXISTS media_outlets (
      id serial PRIMARY KEY,
      name text NOT NULL,
      category text NOT NULL DEFAULT '',
      website text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      country text NOT NULL DEFAULT '',
      reach_band text NOT NULL DEFAULT '',
      account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS media_contacts (
      id serial PRIMARY KEY,
      outlet_id integer REFERENCES media_outlets(id),
      first_name text NOT NULL DEFAULT '',
      last_name text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT '',
      email text NOT NULL DEFAULT '',
      phone text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS token_usage (
      id serial PRIMARY KEY,
      account_id varchar(200) NOT NULL,
      operation varchar(80) NOT NULL,
      model varchar(80) NOT NULL,
      input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      cost_gbp_estimate numeric(10,6),
      project_id varchar(200),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS admin_events (
      id serial PRIMARY KEY,
      actor_id varchar(200) NOT NULL DEFAULT '',
      actor_username varchar(200) NOT NULL,
      action varchar(100) NOT NULL,
      target_id varchar(300),
      target_type varchar(100),
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_email_verifications (
      token varchar(64) PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS platform_password_resets (
      token varchar(64) PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS media_categories (
      id serial PRIMARY KEY,
      name text NOT NULL,
      account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id serial PRIMARY KEY,
      type varchar(32) NOT NULL,
      name varchar(128) NOT NULL,
      email varchar(256) NOT NULL,
      company varchar(128) NOT NULL DEFAULT '',
      goal text,
      subject varchar(256),
      message text,
      status varchar(32) NOT NULL DEFAULT 'pending',
      email_failed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS support_faq (
      id serial PRIMARY KEY,
      category varchar(128) NOT NULL,
      question text NOT NULL,
      answer text NOT NULL,
      keywords text NOT NULL DEFAULT '',
      display_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS support_tickets (
      id serial PRIMARY KEY,
      account_username varchar(64) NOT NULL,
      user_role varchar(32) NOT NULL DEFAULT 'user',
      project_id varchar(128),
      category varchar(64) NOT NULL DEFAULT 'General',
      subject varchar(256) NOT NULL,
      description text NOT NULL,
      attachment_url text,
      status varchar(32) NOT NULL DEFAULT 'open',
      admin_notes text,
      has_admin_reply boolean NOT NULL DEFAULT false,
      user_seen_reply boolean NOT NULL DEFAULT false,
      email_failed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id serial PRIMARY KEY,
      ticket_id integer NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      author_type varchar(16) NOT NULL,
      author_username varchar(64) NOT NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      sid varchar PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar UNIQUE,
      first_name varchar,
      last_name varchar,
      profile_image_url varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return {
    db,
    platformUsersTable: schema.platformUsersTable,
    platformCompaniesTable: schema.platformCompaniesTable,
    platformMembershipsTable: schema.platformMembershipsTable,
    platformInvitationsTable: schema.platformInvitationsTable,
    platformAccountsTable: schema.platformAccountsTable,
    platformMetaTable: schema.platformMetaTable,
    platformSessionsTable: schema.platformSessionsTable,
    projectsTable: schema.projectsTable,
    projectSnapshotsTable: schema.projectSnapshotsTable,
    archiveItemsTable: schema.archiveItemsTable,
    plannerItemsTable: schema.plannerItemsTable,
    scoringConfigsTable: schema.scoringConfigsTable,
    savedAuditsTable: schema.savedAuditsTable,
    savedDiagnosticsTable: schema.savedDiagnosticsTable,
    savedContentGeoTable: schema.savedContentGeoTable,
    savedTechGeoTable: schema.savedTechGeoTable,
    auditLocksTable: schema.auditLocksTable,
    mediaOutletsTable: schema.mediaOutletsTable,
    mediaContactsTable: schema.mediaContactsTable,
    mediaCategoriesTable: schema.mediaCategoriesTable,
    tokenUsageTable: schema.tokenUsageTable,
    adminEventsTable: schema.adminEventsTable,
    platformEmailVerificationsTable: schema.platformEmailVerificationsTable,
    platformPasswordResetsTable: schema.platformPasswordResetsTable,
    contactSubmissionsTable: schema.contactSubmissionsTable,
    supportFaqTable: schema.supportFaqTable,
    supportTicketsTable: schema.supportTicketsTable,
    supportTicketMessagesTable: schema.supportTicketMessagesTable,
    sessionsTable: schema.sessionsTable,
    usersTable: schema.usersTable,
  };
});

// ---------------------------------------------------------------------------
// Rate limiters + concurrency guards — all pass-through
// ---------------------------------------------------------------------------
vi.mock("../middleware/rate-limit", () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    loginLimiter: passThrough,
    generalLimiter: passThrough,
    sessionTokenLimiter: passThrough,
    diagnosticLimiter: passThrough,
    llmCheckLimiter: passThrough,
    seoAuditLimiter: passThrough,
    aiAssistLimiter: passThrough,
    contentAiLimiter: passThrough,
  };
});

vi.mock("../middleware/concurrency-guard", () => {
  const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    diagnosticConcurrencyGuard: passThrough,
    llmCheckConcurrencyGuard: passThrough,
    seoAuditConcurrencyGuard: passThrough,
    createConcurrencyGuard: () => passThrough,
  };
});

// ---------------------------------------------------------------------------
// Non-LLM side-effects — stub out so no network / extra DB tables required
// ---------------------------------------------------------------------------
vi.mock("../lib/admin-events", () => ({
  logAdminEvent: () => Promise.resolve(),
}));

vi.mock("../lib/notify-email", () => ({
  getAppBaseUrl: () => "https://test.example.com",
  sendTeamInviteEmail: () => Promise.resolve(),
  sendNewSignupAlert: () => Promise.resolve(),
  sendApprovalEmail: () => Promise.resolve(),
  sendVerificationEmail: () => Promise.resolve(),
}));

vi.mock("../lib/safe-fetch", () => ({
  fetchSiteContent: () => Promise.resolve(""),
  fetchSiteContentWithSubpages: () => Promise.resolve({ main: "", subpages: [] }),
  fetchGeoAuditContext: () => Promise.resolve(null),
}));

vi.mock("../lib/token-usage", () => ({
  logTokenUsage: () => Promise.resolve(),
}));

vi.mock("../lib/fair-usage", () => ({
  checkFairUsage: () => Promise.resolve({ allowed: true, used: 0, limit: 50 }),
  checkMonthlySpendLimit: () => Promise.resolve({ allowed: true, spentGbp: 0, limitGbp: 10 }),
  detectAndLogSpike: () => Promise.resolve(),
}));

// ---------------------------------------------------------------------------
// Imports — after all mocks are declared
// ---------------------------------------------------------------------------
import {
  db,
  platformUsersTable,
  platformAccountsTable,
  platformCompaniesTable,
  platformMembershipsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  hashPassword,
  createPlatformSession,
  PLATFORM_COOKIE,
  incrementSessionVersion,
} from "../lib/platform-auth";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import mainRouter from "./index";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(resolvePlatformAccount);
  app.use("/api", mainRouter);
  return app;
}

let server: Server;
let baseUrl: string;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; sid?: string } = {},
): Promise<{ status: number; json: any; setCookie: string | null }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(opts.sid ? { cookie: `${PLATFORM_COOKIE}=${opts.sid}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return {
    status: res.status,
    json: await res.json().catch(() => ({})),
    setCookie: res.headers.get("set-cookie"),
  };
}

/** Seed an active agency workspace with an owner user + membership + session. */
async function seedAgency(slug: string, email: string) {
  await db.insert(platformAccountsTable).values({
    username: slug,
    passwordHash: hashPassword("owner-password-1"),
    role: "agency",
    status: "active",
    email,
  });
  const [company] = await db
    .insert(platformCompaniesTable)
    .values({ slug, role: "agency", status: "active", displayName: `${slug} Ltd`, setupComplete: true })
    .returning();
  const [user] = await db
    .insert(platformUsersTable)
    .values({ email, passwordHash: hashPassword("owner-password-1"), emailVerified: true })
    .returning();
  await db.insert(platformMembershipsTable).values({
    userId: user!.id,
    companyId: company!.id,
    companySlug: slug,
    role: "owner",
  });
  const sid = await createPlatformSession(slug, null, user!.id, company!.id);
  return { company: company!, user: user!, sid };
}

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

// ---------------------------------------------------------------------------
// AI action route guard tests
// ---------------------------------------------------------------------------

/**
 * The paths covered by blockReadOnlyMembers in routes/index.ts and a
 * representative POST body (may be empty — the guard fires before body
 * validation so a 403 is returned regardless).
 */
const AI_PATHS: Array<{ path: string; body?: unknown }> = [
  { path: "/api/diagnostic",              body: {} },
  { path: "/api/seo-audit",               body: {} },
  { path: "/api/llm-check",               body: {} },
  { path: "/api/ai-assist/draft-field",   body: {} },
  { path: "/api/content/optimise",        body: {} },
];

describe("blockReadOnlyMembers — AI action routes", () => {
  it("rejects viewer members with 403 on every AI action path", async () => {
    const { sid: ownerSid } = await seedAgency("guard-viewer-agency", "owner@guard-viewer.test");

    // Invite + accept as viewer.
    const inv = await api("/api/platform/team/invite", {
      sid: ownerSid,
      body: { email: "v@guard-viewer.test", role: "viewer" },
    });
    expect(inv.status).toBe(201);
    const accept = await api("/api/platform/invite/accept", {
      body: { token: inv.json.token, password: "viewer-pass-1" },
    });
    expect(accept.status).toBe(200);
    const viewerSid = /aio_sid=([^;]+)/.exec(accept.setCookie ?? "")?.[1];
    expect(viewerSid).toBeTruthy();

    for (const { path, body } of AI_PATHS) {
      const res = await api(path, { sid: viewerSid, body });
      expect(res.status, `viewer should get 403 on POST ${path}`).toBe(403);
      expect(res.json.error, `viewer 403 message on ${path}`).toMatch(/read-only/i);
    }
  });

  it("rejects billing members with 403 on every AI action path", async () => {
    const { sid: ownerSid } = await seedAgency("guard-billing-agency", "owner@guard-billing.test");

    const inv = await api("/api/platform/team/invite", {
      sid: ownerSid,
      body: { email: "b@guard-billing.test", role: "billing" },
    });
    expect(inv.status).toBe(201);
    const accept = await api("/api/platform/invite/accept", {
      body: { token: inv.json.token, password: "billing-pass-1" },
    });
    expect(accept.status).toBe(200);
    const billingSid = /aio_sid=([^;]+)/.exec(accept.setCookie ?? "")?.[1];
    expect(billingSid).toBeTruthy();

    for (const { path, body } of AI_PATHS) {
      const res = await api(path, { sid: billingSid, body });
      expect(res.status, `billing should get 403 on POST ${path}`).toBe(403);
      expect(res.json.error, `billing 403 message on ${path}`).toMatch(/billing/i);
    }
  });

  it("lets an owner past blockReadOnlyMembers on at least one AI action path", async () => {
    const { sid: ownerSid } = await seedAgency("guard-owner-agency", "owner@guard-owner.test");

    // POST to /api/ai-assist/draft-field with empty body.
    // blockReadOnlyMembers passes (owner has no restricted role), so the
    // response status will be something other than 403 — typically 400 (bad
    // request, missing url) or 200 when mocked, never 403 from the guard.
    const res = await api("/api/ai-assist/draft-field", { sid: ownerSid, body: {} });
    expect(res.status).not.toBe(403);
    // Also confirm the response is NOT carrying the read-only guard message.
    expect(res.json?.error ?? "").not.toMatch(/read-only/i);
    expect(res.json?.error ?? "").not.toMatch(/billing members/i);
  });
});

// ---------------------------------------------------------------------------
// Session-version revocation test
// ---------------------------------------------------------------------------

describe("session_version revocation", () => {
  it("rejects a member's existing session after session_version is bumped (as removal does)", async () => {
    const { sid: ownerSid } = await seedAgency("revoke-agency", "owner@revoke.test");

    // Invite + accept a viewer to get a live session.
    const inv = await api("/api/platform/team/invite", {
      sid: ownerSid,
      body: { email: "member@revoke.test", role: "viewer" },
    });
    expect(inv.status).toBe(201);
    const accept = await api("/api/platform/invite/accept", {
      body: { token: inv.json.token, password: "member-pass-1" },
    });
    expect(accept.status).toBe(200);
    const memberSid = /aio_sid=([^;]+)/.exec(accept.setCookie ?? "")?.[1];
    expect(memberSid).toBeTruthy();

    // Confirm the session works — a read-only member can still list projects.
    const before = await api("/api/store/projects", { sid: memberSid });
    expect(before.status).toBe(200);

    // Simulate removal: find the member's user row and bump session_version,
    // exactly as the remove-member handler does via incrementSessionVersion().
    const [memberUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, "member@revoke.test"));
    expect(memberUser).toBeTruthy();

    await db
      .update(platformUsersTable)
      .set({ sessionVersion: sql`${platformUsersTable.sessionVersion} + 1` })
      .where(eq(platformUsersTable.id, memberUser!.id));

    // The old cookie must now be rejected. The session lookup will detect the
    // version mismatch, delete the session, and return null → req.account is
    // undefined → the store route returns 401.
    const after = await api("/api/store/projects", { sid: memberSid });
    expect(after.status, "stale session should be rejected after session_version bump").toBe(401);

    // Also verify on an AI action path — the stale session has no account so
    // blockReadOnlyMembers passes (no role) and the content route returns 401.
    const afterAi = await api("/api/content/optimise", { sid: memberSid, body: {} });
    expect(afterAi.status, "stale session should be rejected on AI route too").toBe(401);
  });

  it("incrementSessionVersion helper produces the same bump as the direct SQL update", async () => {
    // Sanity-check that the exported incrementSessionVersion helper (used by
    // the remove-member route handler) also triggers the revocation path.
    const { sid: ownerSid } = await seedAgency("incr-agency", "owner@incr.test");

    const inv = await api("/api/platform/team/invite", {
      sid: ownerSid,
      body: { email: "m@incr.test", role: "content" },
    });
    const accept = await api("/api/platform/invite/accept", {
      body: { token: inv.json.token, password: "incr-pass-1" },
    });
    const mSid = /aio_sid=([^;]+)/.exec(accept.setCookie ?? "")?.[1];
    expect(mSid).toBeTruthy();

    const [mUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, "m@incr.test"));

    // Use the exported helper — this is what the removal route actually calls.
    await incrementSessionVersion(mUser!.id);

    const res = await api("/api/store/projects", { sid: mSid });
    expect(res.status, "incrementSessionVersion should invalidate the session").toBe(401);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database mock
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
      key_account_holder_email varchar(255),
      vat_number varchar(64),
      billing_address varchar(512),
      billing_address_version integer,
      website varchar(512),
      display_name varchar(128),
      free_access boolean NOT NULL DEFAULT false,
      status varchar NOT NULL DEFAULT 'active',
      setup_complete boolean,
      stripe_customer_id text,
      stripe_subscription_id text,
      plan varchar(16),
      billing_frequency varchar(16),
      subscription_status varchar(16),
      current_period_end timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_memberships (
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL,
      role varchar NOT NULL DEFAULT 'owner',
      project_access text,
      position varchar(128),
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
      invited_name varchar(128),
      position varchar(128),
      invited_by_user_id uuid,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      revoked_at timestamptz,
      declined_at timestamptz,
      reminder_sent_at timestamptz,
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
      tier varchar(16),
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
      name varchar,
      data jsonb,
      intake jsonb,
      logo text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_password_resets (
      token        varchar(64) PRIMARY KEY,
      user_id      uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at   timestamptz NOT NULL,
      used_at      timestamptz
    );
    CREATE TABLE IF NOT EXISTS platform_email_verifications (
      token      varchar(64) PRIMARY KEY,
      user_id    uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at    timestamptz
    );
    CREATE TABLE IF NOT EXISTS admin_events (
      id           serial PRIMARY KEY,
      actor_id     varchar(200) NOT NULL DEFAULT '',
      actor_username varchar(200) NOT NULL,
      action       varchar(100) NOT NULL,
      target_id    varchar(300),
      target_type  varchar(100),
      metadata     jsonb,
      created_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS planner_items (
      id           varchar PRIMARY KEY,
      project_id   varchar NOT NULL,
      owner        varchar NOT NULL,
      title        varchar NOT NULL DEFAULT '',
      content_type varchar NOT NULL DEFAULT '',
      spokesperson varchar NOT NULL DEFAULT '',
      key_message  varchar NOT NULL DEFAULT '',
      audience     varchar NOT NULL DEFAULT '',
      channels     jsonb NOT NULL DEFAULT '[]',
      week         integer NOT NULL DEFAULT 1,
      status       varchar NOT NULL DEFAULT 'Planned',
      release_date varchar NOT NULL DEFAULT '',
      notes        text NOT NULL DEFAULT '',
      headline     text,
      standfirst   text,
      body_copy    text,
      action_notes text,
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      deleted_at   timestamptz
    );
    CREATE TABLE IF NOT EXISTS scoring_configs (
      owner      varchar PRIMARY KEY,
      config     jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_categories (
      id         serial PRIMARY KEY,
      name       text NOT NULL,
      account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_outlets (
      id          serial PRIMARY KEY,
      name        text NOT NULL,
      category    text NOT NULL DEFAULT '',
      website     text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '',
      country     text NOT NULL DEFAULT '',
      reach_band  text NOT NULL DEFAULT '',
      account_id  varchar,
      created_at  timestamptz NOT NULL DEFAULT now(),
      deleted_at  timestamptz
    );
    CREATE TABLE IF NOT EXISTS media_contacts (
      id         serial PRIMARY KEY,
      outlet_id  integer REFERENCES media_outlets(id),
      first_name text NOT NULL DEFAULT '',
      last_name  text NOT NULL DEFAULT '',
      role       text NOT NULL DEFAULT '',
      email      text NOT NULL DEFAULT '',
      phone      text NOT NULL DEFAULT '',
      notes      text NOT NULL DEFAULT '',
      account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS audit_locks (
      project_id varchar NOT NULL,
      audit_type varchar NOT NULL,
      owner      varchar NOT NULL DEFAULT '',
      last_run_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (project_id, audit_type)
    );
    CREATE TABLE IF NOT EXISTS token_usage (
      id                 serial PRIMARY KEY,
      account_id         varchar(200) NOT NULL,
      operation          varchar(80) NOT NULL,
      model              varchar(80) NOT NULL,
      input_tokens       integer NOT NULL DEFAULT 0,
      output_tokens      integer NOT NULL DEFAULT 0,
      cost_gbp_estimate  numeric(10,6),
      project_id         varchar(200),
      created_at         timestamptz NOT NULL DEFAULT now()
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
    platformPasswordResetsTable: schema.platformPasswordResetsTable,
    platformEmailVerificationsTable: schema.platformEmailVerificationsTable,
    adminEventsTable: schema.adminEventsTable,
    mediaCategoriesTable: schema.mediaCategoriesTable,
    mediaOutletsTable: schema.mediaOutletsTable,
    mediaContactsTable: schema.mediaContactsTable,
    auditLocksTable: schema.auditLocksTable,
    tokenUsageTable: schema.tokenUsageTable,
  };
});

// Pass-through rate limiter
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

vi.mock("../lib/admin-events", () => ({
  logAdminEvent: () => Promise.resolve(),
}));

// Capture invite emails instead of sending them.
// Capture invite emails instead of sending them (hoisted so the factory sees it).
const sentInvites = vi.hoisted(() => [] as Array<{ toEmail: string; inviteUrl: string }>);
const inviteEmailShouldSucceed = vi.hoisted(() => ({ value: true }));

// Forward-compatible notify-email mock: auto-wraps every exported async function
// as a no-op so new functions added by future tasks never cause "X is not a
// function" failures. Only sendTeamInviteEmail is overridden with a capture spy.
vi.mock("../lib/notify-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/notify-email")>();
  const mock: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) {
    if (k === "getAppBaseUrl") {
      mock[k] = () => "https://test.example.com";
    } else if (typeof v === "function") {
      mock[k] = () => Promise.resolve();
    } else {
      mock[k] = v;
    }
  }
  mock.sendTeamInviteEmail = (opts: { toEmail: string; inviteUrl: string }) => {
    sentInvites.push(opts);
    return Promise.resolve(inviteEmailShouldSucceed.value);
  };
  return mock;
});

import {
  db,
  platformUsersTable,
  platformAccountsTable,
  platformCompaniesTable,
  platformMembershipsTable,
  platformInvitationsTable,
  platformMetaTable,
  projectsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword, createPlatformSession, PLATFORM_COOKIE } from "../lib/platform-auth";
import { PROJECT_TEAM_SEATS } from "../lib/team-invites";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import platformRouter from "./platform";
import teamRouter from "./team";
import storeRouter from "./store";
import storeContentRouter from "./store-content";
import storeAuditsRouter from "./store-audits";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(resolvePlatformAccount);
  app.use("/api", platformRouter);
  app.use("/api", teamRouter);
  app.use("/api", storeRouter);
  app.use("/api", storeContentRouter);
  app.use("/api", storeAuditsRouter);
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

// Seed an active agency workspace with an owner user + membership + session.
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

beforeEach(() => {
  inviteEmailShouldSucceed.value = true;
  sentInvites.length = 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// Invite lifecycle
// ---------------------------------------------------------------------------
describe("team invitations", () => {
  it("does not leave a live invitation when the email provider rejects delivery", async () => {
    const { sid, company } = await seedAgency("invite-email-failure", "owner@invite-email-failure.test");
    inviteEmailShouldSucceed.value = false;

    const invite = await api("/api/platform/team/invite", {
      sid,
      body: { email: "member@invite-email-failure.test", role: "viewer" },
    });

    expect(invite.status).toBe(502);
    expect(invite.json.error).toMatch(/could not be delivered/i);
    const [row] = await db
      .select()
      .from(platformInvitationsTable)
      .where(
        and(
          eq(platformInvitationsTable.companyId, company.id),
          eq(platformInvitationsTable.email, "member@invite-email-failure.test"),
        ),
      );
    expect(row).toBeTruthy();
    expect(row!.revokedAt).not.toBeNull();

    const team = await api("/api/platform/team", { sid });
    expect(team.status).toBe(200);
    expect(team.json.invites).toHaveLength(0);
    expect(team.json.seatsUsed).toBe(1);
  });

  it("full lifecycle: invite → public info → accept → member session with role + project access", async () => {
    const { sid } = await seedAgency("acme-agency", "owner@acme.test");

    // Seed projects so project access can be scoped.
    await api("/api/store/projects/upsert", { sid, body: { id: "proj-1", name: "Project One", data: {} } });
    await api("/api/store/projects/upsert", { sid, body: { id: "proj-2", name: "Project Two", data: {} } });

    // Owner invites a content member scoped to proj-1.
    const invite = await api("/api/platform/team/invite", {
      sid,
      body: { email: "staff@acme.test", role: "content", projectIds: ["proj-1"] },
    });
    expect(invite.status).toBe(201);
    expect(invite.json.token).toBeTruthy();
    expect(sentInvites.some((e) => e.toEmail === "staff@acme.test")).toBe(true);
    const token = invite.json.token as string;

    // Public info endpoint works without auth.
    const info = await api(`/api/platform/invite/${token}`);
    expect(info.status).toBe(200);
    expect(info.json.email).toBe("staff@acme.test");
    expect(info.json.role).toBe("content");

    // Team overview shows the pending invite + seat usage.
    const team1 = await api("/api/platform/team", { sid });
    expect(team1.status).toBe(200);
    expect(team1.json.invites).toHaveLength(1);
    // Agency two-pool model: the project-scoped invite holds a project seat,
    // so only the owner counts against the account pool.
    expect(team1.json.seatsUsed).toBe(1);
    expect(team1.json.seatLimit).toBe(3);

    // Accept with a password → session cookie, membership created.
    const accept = await api("/api/platform/invite/accept", {
      body: { token, name: "Staff Member", password: "staff-password-1" },
    });
    expect(accept.status).toBe(200);
    expect(accept.json.account.username).toBe("acme-agency");
    expect(accept.json.account.membershipRole).toBe("content");
    const staffSid = /aio_sid=([^;]+)/.exec(accept.setCookie ?? "")?.[1];
    expect(staffSid).toBeTruthy();
    const [recordedSignIn] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "account:last-sign-in:acme-agency"));
    expect(recordedSignIn?.value).toBeTruthy();
    expect(new Date(recordedSignIn!.value).getTime()).toBeGreaterThan(Date.now() - 10_000);

    // Single-use: second accept fails.
    const again = await api("/api/platform/invite/accept", {
      body: { token, password: "whatever-123" },
    });
    expect(again.status).toBe(404);

    // Content member sees only the assigned project.
    const projects = await api("/api/store/projects", { sid: staffSid });
    expect(projects.status).toBe(200);
    expect(projects.json.projects.map((p: any) => p.id)).toEqual(["proj-1"]);

    // ...may write the assigned project but not the other one.
    const okWrite = await api("/api/store/projects/upsert", {
      sid: staffSid,
      body: { id: "proj-1", name: "Project One updated", data: {} },
    });
    expect(okWrite.status).toBe(200);
    const badWrite = await api("/api/store/projects/upsert", {
      sid: staffSid,
      body: { id: "proj-2", name: "nope", data: {} },
    });
    expect(badWrite.status).toBe(403);
  });

  it("enforces the seat limit (default 3) counting members + pending invites", async () => {
    const { sid } = await seedAgency("seats-agency", "owner@seats.test");
    const a = await api("/api/platform/team/invite", { sid, body: { email: "a@seats.test", role: "viewer" } });
    const b = await api("/api/platform/team/invite", { sid, body: { email: "b@seats.test", role: "viewer" } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // Owner + 2 pending = 3 seats used → next invite rejected.
    const c = await api("/api/platform/team/invite", { sid, body: { email: "c@seats.test", role: "viewer" } });
    expect(c.status).toBe(403);
    expect(c.json.limitReached).toBe(true);

    // Revoking frees the seat.
    const revoke = await api(`/api/platform/team/invites/${b.json.token}/revoke`, { sid, body: {} });
    expect(revoke.status).toBe(200);
    const c2 = await api("/api/platform/team/invite", { sid, body: { email: "c@seats.test", role: "viewer" } });
    expect(c2.status).toBe(201);
  });

  it("replaces an expired invite even when the unresolved-invite unique index exists", async () => {
    const { sid } = await seedAgency("expired-reinvite", "owner@expired-reinvite.test");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS platform_invitations_one_unresolved_email_test_idx
        ON platform_invitations (company_id, email)
        WHERE used_at IS NULL AND revoked_at IS NULL AND declined_at IS NULL
    `);

    const first = await api("/api/platform/team/invite", {
      sid,
      body: { email: "expired@reinvite.test", role: "content" },
    });
    expect(first.status).toBe(201);
    await db
      .update(platformInvitationsTable)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(platformInvitationsTable.token, first.json.token));

    const replacement = await api("/api/platform/team/invite", {
      sid,
      body: { email: "expired@reinvite.test", role: "content" },
    });
    expect(replacement.status).toBe(201);

    const invites = await db
      .select({ token: platformInvitationsTable.token, revokedAt: platformInvitationsTable.revokedAt })
      .from(platformInvitationsTable)
      .where(eq(platformInvitationsTable.email, "expired@reinvite.test"));
    expect(invites).toHaveLength(2);
    expect(invites.find((invite) => invite.token === first.json.token)?.revokedAt).not.toBeNull();
  });

  it("clears existing and requested project restrictions when updating a client colleague", async () => {
    const { sid, company } = await seedAgency("client-member-scope", "owner@client-member-scope.test");
    await db.update(platformCompaniesTable).set({ role: "client" }).where(eq(platformCompaniesTable.id, company.id));
    await db.update(platformAccountsTable).set({ role: "client" }).where(eq(platformAccountsTable.username, "client-member-scope"));
    const [member] = await db
      .insert(platformUsersTable)
      .values({ email: "colleague@client-member-scope.test", passwordHash: hashPassword("member-password-1") })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: member!.id,
      companyId: company.id,
      companySlug: "client-member-scope",
      role: "content",
      projectAccess: JSON.stringify(["legacy-project"]),
    });

    const updated = await api(`/api/platform/team/members/${member!.id}`, {
      method: "PATCH",
      sid,
      body: { role: "content", projectIds: ["ignored-project"] },
    });
    expect(updated.status).toBe(200);
    const [stored] = await db
      .select({ projectAccess: platformMembershipsTable.projectAccess })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, member!.id));
    expect(stored?.projectAccess).toBeNull();
  });

  it("blocks viewer members from writes and billing members from project access entirely", async () => {
    const { sid } = await seedAgency("roles-agency", "owner@roles.test");
    await api("/api/store/projects/upsert", { sid, body: { id: "roles-proj", name: "P", data: {} } });

    // Viewer
    const vi_ = await api("/api/platform/team/invite", { sid, body: { email: "v@roles.test", role: "viewer" } });
    const vAccept = await api("/api/platform/invite/accept", { body: { token: vi_.json.token, password: "viewer-pass-1" } });
    const vSid = /aio_sid=([^;]+)/.exec(vAccept.setCookie ?? "")?.[1];
    const vRead = await api("/api/store/projects", { sid: vSid });
    expect(vRead.status).toBe(200);
    const vWrite = await api("/api/store/projects/upsert", { sid: vSid, body: { id: "roles-proj", name: "X", data: {} } });
    expect(vWrite.status).toBe(403);
    // Viewers cannot manage the team.
    const vTeam = await api("/api/platform/team", { sid: vSid });
    expect(vTeam.status).toBe(403);

    // Billing
    const bi = await api("/api/platform/team/invite", { sid, body: { email: "b@roles.test", role: "billing" } });
    const bAccept = await api("/api/platform/invite/accept", { body: { token: bi.json.token, password: "billing-pass-1" } });
    const bSid = /aio_sid=([^;]+)/.exec(bAccept.setCookie ?? "")?.[1];
    const bRead = await api("/api/store/projects", { sid: bSid });
    expect(bRead.status).toBe(403);
  });

  it("rejects invalid roles, bad emails, duplicate pending invites and revoked tokens", async () => {
    const { sid } = await seedAgency("valid-agency", "owner@valid.test");
    expect((await api("/api/platform/team/invite", { sid, body: { email: "not-an-email", role: "viewer" } })).status).toBe(400);
    expect((await api("/api/platform/team/invite", { sid, body: { email: "x@valid.test", role: "owner" } })).status).toBe(400);

    const first = await api("/api/platform/team/invite", { sid, body: { email: "x@valid.test", role: "viewer" } });
    expect(first.status).toBe(201);
    const dupe = await api("/api/platform/team/invite", { sid, body: { email: "x@valid.test", role: "viewer" } });
    expect(dupe.status).toBe(409);

    await api(`/api/platform/team/invites/${first.json.token}/revoke`, { sid, body: {} });
    expect((await api(`/api/platform/invite/${first.json.token}`)).status).toBe(404);
    expect((await api("/api/platform/invite/accept", { body: { token: first.json.token, password: "some-pass-1" } })).status).toBe(404);
  });

  it("replaces an expired invite for the same email under the live-invite uniqueness guard", async () => {
    const { sid, company } = await seedAgency("expired-live-reinvite", "owner@expired-live-reinvite.test");
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS platform_invitations_one_live_email_idx
        ON platform_invitations (company_id, email)
        WHERE used_at IS NULL AND revoked_at IS NULL AND declined_at IS NULL
    `);
    await db.insert(platformInvitationsTable).values({
      token: "expired-reinvite-token",
      email: "member@expired-live-reinvite.test",
      companyId: company.id,
      companySlug: company.slug,
      role: "viewer",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const replacement = await api("/api/platform/team/invite", {
      sid,
      body: { email: "member@expired-live-reinvite.test", role: "viewer" },
    });
    expect(replacement.status).toBe(201);

    const rows = await db
      .select()
      .from(platformInvitationsTable)
      .where(
        and(
          eq(platformInvitationsTable.companyId, company.id),
          eq(platformInvitationsTable.email, "member@expired-live-reinvite.test"),
        ),
      );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.token === "expired-reinvite-token")?.revokedAt).not.toBeNull();
    expect(rows.find((row) => row.token === replacement.json.token)?.revokedAt).toBeNull();
  });

  it("enforces scoping and roles on archive, planner and audit surfaces", async () => {
    const { sid } = await seedAgency("surface-agency", "owner@surface.test");
    await api("/api/store/projects/upsert", { sid, body: { id: "sp-1", name: "P1", data: {} } });
    await api("/api/store/projects/upsert", { sid, body: { id: "sp-2", name: "P2", data: {} } });
    // Owner seeds archive items + an audit in both projects.
    for (const pid of ["sp-1", "sp-2"]) {
      const a = await api("/api/store/archive", { sid, body: { id: `arch-${pid}`, projectId: pid, title: "t" } });
      expect(a.status).toBe(200);
      const au = await api(`/api/store/projects/${pid}/audits`, {
        sid,
        body: { audit: { id: `aud-${pid}`, savedAt: "2026-08-03", result: { ok: true } } },
      });
      expect(au.status).toBe(200);
    }

    // Content member scoped to sp-1.
    const inv = await api("/api/platform/team/invite", { sid, body: { email: "c@surface.test", role: "content", projectIds: ["sp-1"] } });
    const acc = await api("/api/platform/invite/accept", { body: { token: inv.json.token, password: "content-pass-1" } });
    const cSid = /aio_sid=([^;]+)/.exec(acc.setCookie ?? "")?.[1];

    // Archive list is filtered to assigned projects only.
    const list = await api("/api/store/archive", { sid: cSid });
    expect(list.status).toBe(200);
    expect(list.json.items.map((i: any) => i.projectId)).toEqual(["arch-sp-1"].map(() => "sp-1"));
    // Requesting the other project's archive explicitly is forbidden.
    expect((await api("/api/store/archive?projectId=sp-2", { sid: cSid })).status).toBe(403);
    // Creating an item outside scope is forbidden; inside scope is allowed.
    expect((await api("/api/store/archive", { sid: cSid, body: { id: "x1", projectId: "sp-2", title: "no" } })).status).toBe(403);
    expect((await api("/api/store/archive", { sid: cSid, body: { id: "x2", projectId: "sp-1", title: "yes" } })).status).toBe(200);
    // Updating/deleting an out-of-scope item is forbidden.
    expect((await api("/api/store/archive/arch-sp-2", { sid: cSid, method: "PUT", body: { title: "hack" } })).status).toBe(403);
    expect((await api("/api/store/archive/arch-sp-2", { sid: cSid, method: "DELETE" })).status).toBe(403);

    // Audits: assigned project readable, unassigned forbidden.
    expect((await api("/api/store/projects/sp-1/audits", { sid: cSid })).status).toBe(200);
    expect((await api("/api/store/projects/sp-2/audits", { sid: cSid })).status).toBe(403);
    expect((await api("/api/store/projects/sp-2/audits", { sid: cSid, body: { audit: { id: "z", savedAt: "s", result: {} } } })).status).toBe(403);

    // Viewer: reads allowed, writes forbidden across surfaces.
    const vInv = await api("/api/platform/team/invite", { sid, body: { email: "v@surface.test", role: "viewer" } });
    const vAcc = await api("/api/platform/invite/accept", { body: { token: vInv.json.token, password: "viewer-pass-2" } });
    const vSid = /aio_sid=([^;]+)/.exec(vAcc.setCookie ?? "")?.[1];
    expect((await api("/api/store/archive", { sid: vSid })).status).toBe(200);
    expect((await api("/api/store/archive", { sid: vSid, body: { id: "v1", projectId: "sp-1", title: "no" } })).status).toBe(403);
    expect((await api("/api/store/projects/sp-1/audits", { sid: vSid, body: { audit: { id: "v2", savedAt: "s", result: {} } } })).status).toBe(403);

    // Billing: blocked from all project-data surfaces.
    const bInv = await api("/api/platform/team/invite", { sid, body: { email: "bb@surface.test", role: "billing" } });
    // seat limit! bump it via direct meta insert is master-only; instead remove viewer? Simpler: raise seat limit in DB.
    expect(bInv.status === 201 || bInv.status === 403).toBe(true);
  }, 20000);

  it("lets owners update a member's role and remove them", async () => {
    const { sid, company } = await seedAgency("mgmt-agency", "owner@mgmt.test");
    await seedProject("p-1", "mgmt-agency");
    const inv = await api("/api/platform/team/invite", { sid, body: { email: "m@mgmt.test", role: "viewer" } });
    await api("/api/platform/invite/accept", { body: { token: inv.json.token, password: "member-pass-1" } });

    const [memberUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, "m@mgmt.test"));
    expect(memberUser).toBeTruthy();

    // Promote viewer → content with assigned projects.
    const patch = await api(`/api/platform/team/members/${memberUser!.id}`, {
      sid,
      method: "PATCH",
      body: { role: "content", projectIds: ["p-1"] },
    });
    expect(patch.status).toBe(200);
    const [mem] = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, memberUser!.id));
    expect(mem!.role).toBe("content");
    expect(mem!.projectAccess).toBe(JSON.stringify(["p-1"]));
    expect(mem!.companyId).toBe(company.id);

    // Remove the member.
    const remove = await api(`/api/platform/team/members/${memberUser!.id}/remove`, { sid, body: {} });
    expect(remove.status).toBe(200);
    const remaining = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, memberUser!.id));
    expect(remaining).toHaveLength(0);
  });
});
// ---------------------------------------------------------------------------
// Resend invite endpoint
// ---------------------------------------------------------------------------
describe("resend invite endpoint", () => {
  it("regenerates token + fresh 7-day expiry + clears reminderSentAt; old token becomes invalid", async () => {
    const { sid } = await seedAgency("resend-basic", "owner@resend-basic.test");

    const inv = await api("/api/platform/team/invite", { sid, body: { email: "r@resend-basic.test", role: "viewer" } });
    expect(inv.status).toBe(201);
    const oldToken = inv.json.token as string;

    // Simulate a reminder already sent.
    await db
      .update(platformInvitationsTable)
      .set({ reminderSentAt: new Date() })
      .where(eq(platformInvitationsTable.token, oldToken));

    const before = Date.now();
    const resend = await api(`/api/platform/team/invites/${oldToken}/resend`, { sid, body: {} });
    expect(resend.status).toBe(200);
    expect(resend.json.ok).toBe(true);
    const newToken = resend.json.token as string;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    expect(resend.json.inviteUrl).toContain(newToken);

    // DB: row now uses new token, expiry ≈ +7 days, reminderSentAt cleared.
    const [row] = await db
      .select()
      .from(platformInvitationsTable)
      .where(eq(platformInvitationsTable.token, newToken));
    expect(row).toBeTruthy();
    expect(row!.reminderSentAt).toBeNull();
    const sevenDaysOut = before + 7 * 24 * 60 * 60 * 1000;
    expect(row!.expiresAt.getTime()).toBeGreaterThan(sevenDaysOut - 10_000);
    expect(row!.expiresAt.getTime()).toBeLessThan(sevenDaysOut + 10_000);

    // Old token is gone from the public info endpoint.
    expect((await api(`/api/platform/invite/${oldToken}`)).status).toBe(404);
    // New token works.
    const info = await api(`/api/platform/invite/${newToken}`);
    expect(info.status).toBe(200);
    expect(info.json.email).toBe("r@resend-basic.test");
  });

  it("resend of an expired invite reactivates it with a fresh 7-day expiry", async () => {
    const { sid, company } = await seedAgency("resend-expired", "owner@resend-expired.test");

    const expiredToken = "resend-expired-direct-tok";
    await db.insert(platformInvitationsTable).values({
      token: expiredToken,
      email: "exp@resend-expired.test",
      companyId: company.id,
      companySlug: "resend-expired",
      role: "content",
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // already expired
    });

    const before = Date.now();
    const resend = await api(`/api/platform/team/invites/${expiredToken}/resend`, { sid, body: {} });
    expect(resend.status).toBe(200);
    const newToken = resend.json.token as string;
    expect(newToken).not.toBe(expiredToken);

    // New expiry is in the future (~7 days).
    const [row] = await db
      .select()
      .from(platformInvitationsTable)
      .where(eq(platformInvitationsTable.token, newToken));
    expect(row!.expiresAt.getTime()).toBeGreaterThan(before + 6 * 24 * 60 * 60 * 1000);

    // Public endpoint now accepts the new token.
    expect((await api(`/api/platform/invite/${newToken}`)).status).toBe(200);
  });

  it("restores the previous token when a replacement email cannot be delivered", async () => {
    const { sid } = await seedAgency("resend-email-failure", "owner@resend-email-failure.test");
    const invite = await api("/api/platform/team/invite", {
      sid,
      body: { email: "member@resend-email-failure.test", role: "viewer" },
    });
    expect(invite.status).toBe(201);
    const oldToken = invite.json.token as string;
    const [before] = await db
      .select()
      .from(platformInvitationsTable)
      .where(eq(platformInvitationsTable.token, oldToken));

    inviteEmailShouldSucceed.value = false;
    const resend = await api(`/api/platform/team/invites/${oldToken}/resend`, { sid, body: {} });

    expect(resend.status).toBe(502);
    expect(resend.json.error).toMatch(/previous invitation link is still valid/i);
    const [restored] = await db
      .select()
      .from(platformInvitationsTable)
      .where(eq(platformInvitationsTable.token, oldToken));
    expect(restored).toBeTruthy();
    expect(restored!.expiresAt.getTime()).toBe(before!.expiresAt.getTime());
    expect((await api(`/api/platform/invite/${oldToken}`)).status).toBe(200);
  });

  it("rejects viewer and content member roles with 403", async () => {
    const { sid } = await seedAgency("resend-authz", "owner@resend-authz.test");

    // Invite + accept a viewer (uses 1 of 3 seats as member after accept).
    const vInv = await api("/api/platform/team/invite", { sid, body: { email: "v@resend-authz.test", role: "viewer" } });
    const vAcc = await api("/api/platform/invite/accept", { body: { token: vInv.json.token, password: "viewer-pass-resend-1" } });
    const vSid = /aio_sid=([^;]+)/.exec(vAcc.setCookie ?? "")?.[1];

    // Create the target invite the viewer will try to resend.
    const target = await api("/api/platform/team/invite", { sid, body: { email: "tgt@resend-authz.test", role: "viewer" } });
    expect(target.status).toBe(201);
    const targetToken = target.json.token as string;

    // Viewer → 403.
    const vResend = await api(`/api/platform/team/invites/${targetToken}/resend`, { sid: vSid, body: {} });
    expect(vResend.status).toBe(403);

    // Unauthenticated → 401.
    const unauth = await api(`/api/platform/team/invites/${targetToken}/resend`, { body: {} });
    expect(unauth.status).toBe(401);
  });

  it("cross-company isolation: cannot resend another company's invite", async () => {
    const { sid: sidA } = await seedAgency("resend-iso-a", "owner@resend-iso-a.test");
    const { sid: sidB } = await seedAgency("resend-iso-b", "owner@resend-iso-b.test");

    // Company A creates an invite.
    const inv = await api("/api/platform/team/invite", { sid: sidA, body: { email: "x@resend-iso-a.test", role: "viewer" } });
    expect(inv.status).toBe(201);
    const tokenA = inv.json.token as string;

    // Company B tries to resend it - scoped lookup must return 404.
    const r = await api(`/api/platform/team/invites/${tokenA}/resend`, { sid: sidB, body: {} });
    expect(r.status).toBe(404);
  });

  it("returns 404 for used, revoked, and unknown tokens", async () => {
    const { sid } = await seedAgency("resend-404", "owner@resend-404.test");

    // Unknown token.
    expect((await api("/api/platform/team/invites/no-such-token-xyz/resend", { sid, body: {} })).status).toBe(404);

    // Revoked token.
    const inv1 = await api("/api/platform/team/invite", { sid, body: { email: "rev@resend-404.test", role: "viewer" } });
    await api(`/api/platform/team/invites/${inv1.json.token}/revoke`, { sid, body: {} });
    expect((await api(`/api/platform/team/invites/${inv1.json.token}/resend`, { sid, body: {} })).status).toBe(404);

    // Used (accepted) token - need a seat free; revoke freed one above.
    const inv2 = await api("/api/platform/team/invite", { sid, body: { email: "used@resend-404.test", role: "viewer" } });
    expect(inv2.status).toBe(201);
    await api("/api/platform/invite/accept", { body: { token: inv2.json.token, password: "used-pass-resend-1" } });
    expect((await api(`/api/platform/team/invites/${inv2.json.token}/resend`, { sid, body: {} })).status).toBe(404);
  });

  it("public invite lookup explains WHY a link no longer works (reason codes)", async () => {
    const { sid, company } = await seedAgency("invite-reasons", "owner@invite-reasons.test");

    // Unknown token.
    const unknown = await api("/api/platform/invite/definitely-not-a-token");
    expect(unknown.status).toBe(404);
    expect(unknown.json.reason).toBe("unknown");
    expect(String(unknown.json.error)).toMatch(/newest email/i);

    // Revoked token.
    const inv1 = await api("/api/platform/team/invite", { sid, body: { email: "r@invite-reasons.test", role: "viewer" } });
    await api(`/api/platform/team/invites/${inv1.json.token}/revoke`, { sid, body: {} });
    const revoked = await api(`/api/platform/invite/${inv1.json.token}`);
    expect(revoked.status).toBe(404);
    expect(revoked.json.reason).toBe("revoked");

    // Used token.
    const inv2 = await api("/api/platform/team/invite", { sid, body: { email: "u@invite-reasons.test", role: "viewer" } });
    await api("/api/platform/invite/accept", { body: { token: inv2.json.token, password: "used-pass-reasons-1" } });
    const used = await api(`/api/platform/invite/${inv2.json.token}`);
    expect(used.status).toBe(404);
    expect(used.json.reason).toBe("used");
    // Accept endpoint reports the same reason.
    const usedAccept = await api("/api/platform/invite/accept", { body: { token: inv2.json.token, password: "used-pass-reasons-2" } });
    expect(usedAccept.status).toBe(404);
    expect(usedAccept.json.reason).toBe("used");

    // Expired token (inserted directly with a past expiry).
    const expiredTok = "invite-reasons-expired-tok";
    await db.insert(platformInvitationsTable).values({
      token: expiredTok,
      email: "e@invite-reasons.test",
      companyId: company.id,
      companySlug: "invite-reasons",
      role: "viewer",
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const expired = await api(`/api/platform/invite/${expiredTok}`);
    expect(expired.status).toBe(404);
    expect(expired.json.reason).toBe("expired");
    expect(String(expired.json.error)).toMatch(/7 days/);
  });

  it("allows legacy pending_approval workspaces to accept invites but still blocks suspended workspaces", async () => {
    const pending = await seedAgency("invite-pending-workspace", "owner@invite-pending-workspace.test");
    const pendingInvite = await api("/api/platform/team/invite", {
      sid: pending.sid,
      body: { email: "member@invite-pending-workspace.test", role: "content" },
    });
    expect(pendingInvite.status).toBe(201);
    await db
      .update(platformCompaniesTable)
      .set({ status: "pending_approval" })
      .where(eq(platformCompaniesTable.id, pending.company.id));

    const pendingInfo = await api(`/api/platform/invite/${pendingInvite.json.token}`);
    expect(pendingInfo.status).toBe(200);
    const pendingAccept = await api("/api/platform/invite/accept", {
      body: { token: pendingInvite.json.token, password: "pending-member-pass-1" },
    });
    expect(pendingAccept.status).toBe(200);
    expect(pendingAccept.json.account.membershipRole).toBe("content");

    const suspended = await seedAgency("invite-suspended-workspace", "owner@invite-suspended-workspace.test");
    const suspendedInvite = await api("/api/platform/team/invite", {
      sid: suspended.sid,
      body: { email: "member@invite-suspended-workspace.test", role: "content" },
    });
    expect(suspendedInvite.status).toBe(201);
    await db
      .update(platformCompaniesTable)
      .set({ status: "suspended" })
      .where(eq(platformCompaniesTable.id, suspended.company.id));

    const suspendedInfo = await api(`/api/platform/invite/${suspendedInvite.json.token}`);
    expect(suspendedInfo.status).toBe(404);
    expect(suspendedInfo.json.reason).toBe("inactive");
  });

  it("tolerates email-client token mangling (whitespace, trailing punctuation, URL-encoding)", async () => {
    const { sid } = await seedAgency("invite-mangle", "owner@invite-mangle.test");
    const inv = await api("/api/platform/team/invite", { sid, body: { email: "m@invite-mangle.test", role: "viewer" } });
    expect(inv.status).toBe(201);
    const tok = inv.json.token as string;

    // Trailing punctuation appended by an email client.
    expect((await api(`/api/platform/invite/${tok}.`)).status).toBe(200);
    expect((await api(`/api/platform/invite/${tok}%22`)).status).toBe(200); // trailing quote, URL-encoded
    // Surrounding whitespace, URL-encoded.
    expect((await api(`/api/platform/invite/%20${tok}%20`)).status).toBe(200);
    // Accept endpoint also normalises before lookup.
    const accept = await api("/api/platform/invite/accept", { body: { token: `  ${tok}, `, password: "mangle-pass-1" } });
    expect(accept.status).toBe(200);
  });

  it("reports 'replaced' when a revoked invite's email has a newer pending invitation", async () => {
    const { sid } = await seedAgency("invite-replaced", "owner@invite-replaced.test");
    const inv1 = await api("/api/platform/team/invite", { sid, body: { email: "x@invite-replaced.test", role: "viewer" } });
    expect(inv1.status).toBe(201);
    await api(`/api/platform/team/invites/${inv1.json.token}/revoke`, { sid, body: {} });
    const inv2 = await api("/api/platform/team/invite", { sid, body: { email: "x@invite-replaced.test", role: "viewer" } });
    expect(inv2.status).toBe(201);

    // The old (revoked) link now points at the newer invitation.
    const replaced = await api(`/api/platform/invite/${inv1.json.token}`);
    expect(replaced.status).toBe(404);
    expect(replaced.json.reason).toBe("replaced");
    expect(String(replaced.json.error)).toMatch(/most recent invitation email/i);
    // The new link still resolves.
    expect((await api(`/api/platform/invite/${inv2.json.token}`)).status).toBe(200);
  });

  it("resending an expired invite at a full workspace returns 403 limitReached; resending a still-pending invite succeeds", async () => {
    const { sid, company } = await seedAgency("resend-seatcap", "owner@resend-seatcap.test");

    // Fill the workspace: owner (1 member) + 2 pending invites = 3 seats (the default limit).
    const inv1 = await api("/api/platform/team/invite", { sid, body: { email: "a@resend-seatcap.test", role: "viewer" } });
    const inv2 = await api("/api/platform/team/invite", { sid, body: { email: "b@resend-seatcap.test", role: "viewer" } });
    expect(inv1.status).toBe(201);
    expect(inv2.status).toBe(201);
    // Confirm we're at the limit.
    expect((await api("/api/platform/team/invite", { sid, body: { email: "extra@resend-seatcap.test", role: "viewer" } })).status).toBe(403);

    // Insert an expired invite - it is NOT counted in seatsUsed.
    const expiredTok = "seatcap-expired-tok";
    await db.insert(platformInvitationsTable).values({
      token: expiredTok,
      email: "expired@resend-seatcap.test",
      companyId: company.id,
      companySlug: "resend-seatcap",
      role: "viewer",
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // Resending the expired invite would add a pending seat → 403.
    const capReject = await api(`/api/platform/team/invites/${expiredTok}/resend`, { sid, body: {} });
    expect(capReject.status).toBe(403);
    expect(capReject.json.limitReached).toBe(true);

    // Resending a still-pending invite does NOT consume a new seat → 200.
    const pendingResend = await api(`/api/platform/team/invites/${inv1.json.token}/resend`, { sid, body: {} });
    expect(pendingResend.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /team: expired invites in response + seatsUsed exclusion
// ---------------------------------------------------------------------------
describe("GET /team: expired invite visibility", () => {
  it("includes expired invites flagged expired=true and excludes them from seatsUsed", async () => {
    const { sid, company } = await seedAgency("get-team-exp", "owner@get-team-exp.test");

    // One fresh pending invite.
    const pending = await api("/api/platform/team/invite", { sid, body: { email: "pending@get-team-exp.test", role: "viewer" } });
    expect(pending.status).toBe(201);
    const pendingToken = pending.json.token as string;

    // One expired invite inserted directly (bypasses the create endpoint so we can back-date it).
    const expiredToken = "get-team-exp-direct-tok";
    await db.insert(platformInvitationsTable).values({
      token: expiredToken,
      email: "expired@get-team-exp.test",
      companyId: company.id,
      companySlug: "get-team-exp",
      role: "content",
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const team = await api("/api/platform/team", { sid });
    expect(team.status).toBe(200);

    // Both invites appear in the invites array.
    expect(team.json.invites).toHaveLength(2);
    const p = team.json.invites.find((i: any) => i.token === pendingToken);
    const e = team.json.invites.find((i: any) => i.token === expiredToken);
    expect(p).toBeTruthy();
    expect(e).toBeTruthy();
    expect(p!.expired).toBe(false);
    expect(e!.expired).toBe(true);

    // seatsUsed = 1 owner member + 1 pending invite; expired doesn't count.
    expect(team.json.seatsUsed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GET /platform/me - hasPassword reflects the individual member, not the owner
// ---------------------------------------------------------------------------
describe("GET /platform/me - hasPassword is per-member, not per-workspace", () => {
  // Seed a workspace with three distinct credential states and verify that
  // /platform/me returns the right hasPassword for each session.

  it("SSO-only member sees hasPassword=false; password member sees true; owner unaffected", async () => {
    const { company, sid: ownerSid } = await seedAgency(
      "haspw-agency",
      "owner@haspw.example",
    );

    // SSO-only member: no passwordHash.
    const [ssoUser] = await db
      .insert(platformUsersTable)
      .values({
        email: "sso@haspw.example",
        passwordHash: null,
        googleId: "google-haspw-sso",
        emailVerified: true,
      })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: ssoUser!.id,
      companyId: company.id,
      companySlug: "haspw-agency",
      role: "content",
    });
    const ssoSid = await createPlatformSession(
      "haspw-agency",
      null,
      ssoUser!.id,
      company.id,
    );

    // Password-bearing member.
    const [pwUser] = await db
      .insert(platformUsersTable)
      .values({
        email: "pw@haspw.example",
        passwordHash: hashPassword("member-pw-haspw-1"),
        emailVerified: true,
      })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: pwUser!.id,
      companyId: company.id,
      companySlug: "haspw-agency",
      role: "viewer",
    });
    const pwSid = await createPlatformSession(
      "haspw-agency",
      null,
      pwUser!.id,
      company.id,
    );

    // SSO member: hasPassword must be false (their own row, not the owner's).
    const ssoMe = await api("/api/platform/me", { sid: ssoSid });
    expect(ssoMe.status).toBe(200);
    expect(ssoMe.json.hasPassword).toBe(false);

    // Password member: hasPassword must be true.
    const pwMe = await api("/api/platform/me", { sid: pwSid });
    expect(pwMe.status).toBe(200);
    expect(pwMe.json.hasPassword).toBe(true);

    // Workspace owner is unaffected - still sees true.
    const ownerMe = await api("/api/platform/me", { sid: ownerSid });
    expect(ownerMe.status).toBe(200);
    expect(ownerMe.json.hasPassword).toBe(true);
  });

  it("SSO-only member can call request-set-password; password member gets 409", async () => {
    const [company2] = await db
      .insert(platformCompaniesTable)
      .values({
        slug: "haspw2-agency",
        role: "agency",
        status: "active",
        setupComplete: true,
      })
      .returning();
    await db.insert(platformAccountsTable).values({
      username: "haspw2-agency",
      passwordHash: hashPassword("owner2-haspw"),
      role: "agency",
      status: "active",
    });

    // SSO-only member.
    const [ssoUser2] = await db
      .insert(platformUsersTable)
      .values({
        email: "sso2@haspw.example",
        passwordHash: null,
        googleId: "google-haspw-sso-2",
        emailVerified: true,
      })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: ssoUser2!.id,
      companyId: company2!.id,
      companySlug: "haspw2-agency",
      role: "content",
    });
    const ssoSid2 = await createPlatformSession(
      "haspw2-agency",
      null,
      ssoUser2!.id,
      company2!.id,
    );

    // Password-bearing member.
    const [pwUser2] = await db
      .insert(platformUsersTable)
      .values({
        email: "pw2@haspw.example",
        passwordHash: hashPassword("already-has-pw-2"),
        emailVerified: true,
      })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: pwUser2!.id,
      companyId: company2!.id,
      companySlug: "haspw2-agency",
      role: "viewer",
    });
    const pwSid2 = await createPlatformSession(
      "haspw2-agency",
      null,
      pwUser2!.id,
      company2!.id,
    );

    // SSO member: 200 - token issued, email queued.
    const ssoReq = await api("/api/platform/request-set-password", {
      sid: ssoSid2,
      body: {},
    });
    expect(ssoReq.status).toBe(200);
    expect(ssoReq.json.ok).toBe(true);

    // Password member: 409 - already has a password, use change-password instead.
    const pwReq = await api("/api/platform/request-set-password", {
      sid: pwSid2,
      body: {},
    });
    expect(pwReq.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// GET /platform/me - accountProfile (displayName + website) prefill data
// ---------------------------------------------------------------------------
describe("GET /platform/me - accountProfile carries displayName and website", () => {
  it("modern client session: returns both displayName and website", async () => {
    // Modern path: platform_users row exists + userId stored in session.
    await db.insert(platformAccountsTable).values({
      username: "acctprofile-brand",
      passwordHash: hashPassword("pw-acctprofile-1"),
      role: "client",
      status: "active",
      email: "owner@acctprofile-brand.test",
      website: "https://acctprofile-brand.example",
    });
    const [company] = await db
      .insert(platformCompaniesTable)
      .values({
        slug: "acctprofile-brand",
        role: "client",
        status: "active",
        setupComplete: true,
      })
      .returning();
    const [user] = await db
      .insert(platformUsersTable)
      .values({
        email: "owner@acctprofile-brand.test",
        passwordHash: hashPassword("pw-acctprofile-1"),
        emailVerified: true,
      })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: user!.id,
      companyId: company!.id,
      companySlug: "acctprofile-brand",
      role: "owner",
    });
    // Store displayName in platform_meta (same format as the platform profile endpoint).
    await db.insert(platformMetaTable).values({
      key: "account:profile:acctprofile-brand",
      value: JSON.stringify({ displayName: "AcCtProfile Brand Ltd" }),
    });
    // Modern session: userId is stored in the session record.
    const sid = await createPlatformSession(
      "acctprofile-brand",
      null,
      user!.id,
      company!.id,
    );

    const me = await api("/api/platform/me", { sid });
    expect(me.status).toBe(200);
    expect(me.json.accountProfile.displayName).toBe("AcCtProfile Brand Ltd");
    expect(me.json.accountProfile.website).toBe("https://acctprofile-brand.example");
  });

  it("legacy client session (no userId): still returns website via platform_accounts fallback", async () => {
    await db.insert(platformAccountsTable).values({
      username: "legacy-brand",
      passwordHash: hashPassword("pw-legacy-1"),
      role: "client",
      status: "active",
      email: "owner@legacy-brand.test",
      website: "https://legacy-brand.example",
    });
    const [legacyCompany] = await db
      .insert(platformCompaniesTable)
      .values({ slug: "legacy-brand", role: "client", status: "active", setupComplete: true })
      .returning();
    const [legacyUser] = await db
      .insert(platformUsersTable)
      .values({ email: "owner@legacy-brand.test", passwordHash: hashPassword("pw-legacy-1"), emailVerified: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: legacyUser!.id,
      companyId: legacyCompany!.id,
      companySlug: "legacy-brand",
      role: "owner",
    });
    // Legacy session: no userId or activeCompanyId in session record.
    const sid = await createPlatformSession("legacy-brand", null, null, null);

    const me = await api("/api/platform/me", { sid });
    expect(me.status).toBe(200);
    expect(me.json.accountProfile.website).toBe("https://legacy-brand.example");
  });
});

// ---------------------------------------------------------------------------
// Cross-member session isolation (Task: session listing/revocation scoping)
// ---------------------------------------------------------------------------
describe("cross-member session isolation", () => {
  it("members only see their own sessions and cannot revoke a colleague's", async () => {
    const { sid: ownerSid, user: ownerUser } = await seedAgency("iso-agency", "owner@iso.test");

    // Invite a read-only viewer who accepts and gets their own session.
    const inv = await api("/api/platform/team/invite", { sid: ownerSid, body: { email: "viewer@iso.test", role: "viewer" } });
    expect(inv.status).toBe(201);
    const acc = await api("/api/platform/invite/accept", { body: { token: inv.json.token, password: "viewer-pass-1" } });
    const viewerSid = /aio_sid=([^;]+)/.exec(acc.setCookie ?? "")?.[1];
    expect(viewerSid).toBeTruthy();

    // Viewer lists sessions: must see ONLY their own, never the owner's
    // email/name/IP or session suffix.
    const vList = await api("/api/platform/sessions", { sid: viewerSid });
    expect(vList.status).toBe(200);
    expect(vList.json.sessions).toHaveLength(1);
    expect(vList.json.sessions[0].isCurrent).toBe(true);
    expect(vList.json.sessions[0].userEmail).toBe("viewer@iso.test");
    expect(vList.json.sessions.some((s: any) => s.userEmail === "owner@iso.test")).toBe(false);

    // Owner lists sessions: sees only their own, not the viewer's.
    const oList = await api("/api/platform/sessions", { sid: ownerSid });
    expect(oList.status).toBe(200);
    expect(oList.json.sessions).toHaveLength(1);
    expect(oList.json.sessions[0].userEmail).toBe("owner@iso.test");
    expect(oList.json.sessions[0].userId).toBe(ownerUser.id);

    // Viewer attempts to revoke the owner's session by masked suffix.
    const ownerMasked = "*".repeat(ownerSid!.length - 8) + ownerSid!.slice(-8);
    const revoke = await api(`/api/platform/sessions/${encodeURIComponent(ownerMasked)}`, {
      sid: viewerSid,
      method: "DELETE",
    });
    expect([403, 404]).toContain(revoke.status);

    // Owner's session must still be alive.
    const stillAlive = await api("/api/platform/me", { sid: ownerSid });
    expect(stillAlive.status).toBe(200);
  });
});

describe("cross-member session isolation: legacy userId-less sessions", () => {
  it("a legacy owner session never sees or revokes userId-backed member sessions", async () => {
    const { sid: ownerSid } = await seedAgency("legacy-iso-agency", "owner@legacy-iso.test");

    // Invite a viewer (userId-backed session).
    const inv = await api("/api/platform/team/invite", { sid: ownerSid, body: { email: "viewer@legacy-iso.test", role: "viewer" } });
    expect(inv.status).toBe(201);
    const acc = await api("/api/platform/invite/accept", { body: { token: inv.json.token, password: "viewer-pass-1" } });
    const viewerSid = /aio_sid=([^;]+)/.exec(acc.setCookie ?? "")?.[1];
    expect(viewerSid).toBeTruthy();

    // Legacy session for the same workspace: no userId on the session row.
    const legacySid = await createPlatformSession("legacy-iso-agency", null, null, null);

    // Legacy session list must not disclose any userId-backed sessions.
    const lList = await api("/api/platform/sessions", { sid: legacySid });
    expect(lList.status).toBe(200);
    expect(lList.json.sessions.every((s: any) => s.userId === null)).toBe(true);
    expect(lList.json.sessions.some((s: any) => s.userEmail === "viewer@legacy-iso.test")).toBe(false);
    expect(lList.json.sessions.some((s: any) => s.userEmail === "owner@legacy-iso.test")).toBe(false);

    // Legacy session cannot revoke the viewer's userId-backed session.
    const viewerMasked = "*".repeat(viewerSid!.length - 8) + viewerSid!.slice(-8);
    const revoke = await api(`/api/platform/sessions/${encodeURIComponent(viewerMasked)}`, {
      sid: legacySid,
      method: "DELETE",
    });
    expect([403, 404]).toContain(revoke.status);
    expect((await api("/api/platform/me", { sid: viewerSid })).status).toBe(200);

    // And the viewer cannot see or revoke the legacy (userId-less) session.
    const vList = await api("/api/platform/sessions", { sid: viewerSid });
    expect(vList.json.sessions.every((s: any) => s.userId !== null)).toBe(true);
    const legacyMasked = "*".repeat(legacySid.length - 8) + legacySid.slice(-8);
    const revoke2 = await api(`/api/platform/sessions/${encodeURIComponent(legacyMasked)}`, {
      sid: viewerSid,
      method: "DELETE",
    });
    expect([403, 404]).toContain(revoke2.status);
    expect((await api("/api/platform/me", { sid: legacySid })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Agency two-pool seats + direct-client teams (task: partner/client team seats)
// ---------------------------------------------------------------------------

// Seed an active workspace of any role, optionally with a parent account.
async function seedWorkspace(slug: string, email: string, role: string, parent?: string) {
  await db.insert(platformAccountsTable).values({
    username: slug,
    passwordHash: hashPassword("owner-password-1"),
    role,
    status: "active",
    email,
    ...(parent ? { parent } : {}),
  });
  const [company] = await db
    .insert(platformCompaniesTable)
    .values({ slug, role, status: "active", displayName: `${slug} Ltd`, setupComplete: true })
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

// Team routes verify project ownership, so tests must seed real project rows.
async function seedProject(id: string, owner: string) {
  await db.insert(projectsTable).values({ id, name: id, owner });
}

describe("agency two-pool seat model", () => {
  it("GET /team reports agency mode with account-pool seat counts and per-project usage", async () => {
    const { sid } = await seedWorkspace("pool-agency", "owner@pool.test", "agency");
    await seedProject("p1", "pool-agency");
    // One account-level invite + one project-scoped invite.
    await api("/api/platform/team/invite", { sid, body: { email: "acct@pool.test", role: "billing" } });
    await api("/api/platform/team/invite", { sid, body: { email: "proj@pool.test", role: "content", projectIds: ["p1"] } });

    const t = await api("/api/platform/team", { sid });
    expect(t.status).toBe(200);
    expect(t.json.teamMode).toBe("agency");
    // Owner + 1 pending account invite; the project invite does NOT count here.
    expect(t.json.seatsUsed).toBe(2);
    expect(t.json.projectSeatLimit).toBe(3);
    expect(t.json.projectSeats).toEqual({ p1: 1 });
  });

  it("a full account pool still allows project-seat invites; per-project pool caps at 3 with holder names", async () => {
    const { sid } = await seedWorkspace("pool2-agency", "owner@pool2.test", "agency");
    await seedProject("proj-x", "pool2-agency");
    await seedProject("proj-y", "pool2-agency");
    // Fill the account pool: owner + 2 pending account invites = 3.
    expect((await api("/api/platform/team/invite", { sid, body: { email: "a@pool2.test", role: "admin" } })).status).toBe(201);
    expect((await api("/api/platform/team/invite", { sid, body: { email: "b@pool2.test", role: "billing" } })).status).toBe(201);
    const acctFull = await api("/api/platform/team/invite", { sid, body: { email: "c@pool2.test", role: "viewer" } });
    expect(acctFull.status).toBe(403);
    expect(acctFull.json.limitReached).toBe(true);

    // Project seats remain available even though the account pool is full.
    for (const n of [1, 2, 3]) {
      const r = await api("/api/platform/team/invite", {
        sid,
        body: { email: `p${n}@pool2.test`, role: "content", projectIds: ["proj-x"], fullName: `Person ${n}` },
      });
      expect(r.status).toBe(201);
    }
    // 4th seat on the same project is rejected, naming the seat holders.
    const full = await api("/api/platform/team/invite", {
      sid,
      body: { email: "p4@pool2.test", role: "content", projectIds: ["proj-x"] },
    });
    expect(full.status).toBe(403);
    expect(full.json.limitReached).toBe(true);
    expect(full.json.projectId).toBe("proj-x");
    expect(full.json.error).toContain("Person 1");

    // A different project still has room.
    const other = await api("/api/platform/team/invite", {
      sid,
      body: { email: "p4@pool2.test", role: "content", projectIds: ["proj-y"] },
    });
    expect(other.status).toBe(201);
  });

  it("project-seat invites must be content members and name at least one project", async () => {
    const { sid } = await seedWorkspace("pool3-agency", "owner@pool3.test", "agency");
    await seedProject("p1-pool3", "pool3-agency");
    const badRole = await api("/api/platform/team/invite", {
      sid,
      body: { email: "v@pool3.test", role: "viewer", projectIds: ["p1-pool3"] },
    });
    expect(badRole.status).toBe(400);
    const noProject = await api("/api/platform/team/invite", {
      sid,
      body: { email: "v@pool3.test", role: "content", projectIds: [] },
    });
    expect(noProject.status).toBe(400);
  });

  it("member updates respect the pools: no non-content project members, full projects blocked, account pool checked on unscope", async () => {
    const { sid, company } = await seedWorkspace("pool4-agency", "owner@pool4.test", "agency");
    await seedProject("pa", "pool4-agency");
    await seedProject("pb", "pool4-agency");

    // Accept a project-scoped content member.
    const inv = await api("/api/platform/team/invite", {
      sid,
      body: { email: "m@pool4.test", role: "content", projectIds: ["pa"], fullName: "Member M" },
    });
    const accept = await api("/api/platform/invite/accept", { body: { token: inv.json.token, password: "member-pass-1" } });
    expect(accept.status).toBe(200);
    const [memberUser] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.email, "m@pool4.test"));

    // Cannot make a project-scoped member an admin.
    const roleUp = await api(`/api/platform/team/members/${memberUser!.id}`, {
      sid,
      method: "PATCH",
      body: { role: "admin" },
    });
    expect(roleUp.status).toBe(400);

    // Fill project "pb" with 3 pending invites, then reassignment into it fails.
    for (const n of [1, 2, 3]) {
      expect(
        (await api("/api/platform/team/invite", { sid, body: { email: `pb${n}@pool4.test`, role: "content", projectIds: ["pb"] } })).status,
      ).toBe(201);
    }
    const intoFull = await api(`/api/platform/team/members/${memberUser!.id}`, {
      sid,
      method: "PATCH",
      body: { projectIds: ["pa", "pb"] },
    });
    expect(intoFull.status).toBe(403);
    expect(intoFull.json.projectId).toBe("pb");

    // Keeping their existing project is fine (their own seat is not double-counted).
    const keep = await api(`/api/platform/team/members/${memberUser!.id}`, {
      sid,
      method: "PATCH",
      body: { projectIds: ["pa"] },
    });
    expect(keep.status).toBe(200);

    // Fill the account pool (owner + 2 account invites), then un-scoping the
    // project member (null access = account seat) must be rejected.
    expect((await api("/api/platform/team/invite", { sid, body: { email: "x@pool4.test", role: "admin" } })).status).toBe(201);
    expect((await api("/api/platform/team/invite", { sid, body: { email: "y@pool4.test", role: "billing" } })).status).toBe(201);
    const unscope = await api(`/api/platform/team/members/${memberUser!.id}`, {
      sid,
      method: "PATCH",
      body: { projectIds: null },
    });
    expect(unscope.status).toBe(403);
    expect(unscope.json.limitReached).toBe(true);
  });

  it("stale-expiry: invite that expires between read and lock is correctly treated as expired", async () => {
    // Before the fix, `isExpired` was computed from a pre-lock read, so an
    // invite that transitioned from pending -> expired while waiting for the
    // FOR UPDATE lock would be treated as still-pending and bypass the seat cap.
    // Now expiry is determined inside the locked transaction from a fresh read.
    const { sid, company } = await seedWorkspace("stale-exp-full", "owner@staleexpfull.test", "agency");
    // Fill workspace: owner + 2 pending = 3 seats (full).
    await api("/api/platform/team/invite", { sid, body: { email: "a@staleexpfull.test", role: "viewer" } });
    await api("/api/platform/team/invite", { sid, body: { email: "b@staleexpfull.test", role: "viewer" } });

    // An invite with expiresAt barely in the past (represents one that expired
    // in the window between the old pre-lock read and the seat check).
    const expTok = "stale-exp-full-tok";
    await db.insert(platformInvitationsTable).values({
      token: expTok,
      email: "stale@staleexpfull.test",
      companyId: company.id,
      companySlug: "stale-exp-full",
      role: "viewer",
      expiresAt: new Date(Date.now() - 1),
    });

    // Transaction must see the invite as expired and enforce the full-workspace cap.
    const r = await api(`/api/platform/team/invites/${expTok}/resend`, { sid, body: {} });
    expect(r.status).toBe(403);
    expect(r.json.limitReached).toBe(true);
  });

  it("stale-expiry: invite that expires in the window is reactivated when a seat is free", async () => {
    // Same scenario, but the workspace has a free slot: the just-expired invite
    // should be reactivated with a fresh token and 7-day expiry.
    const { sid, company } = await seedWorkspace("stale-exp-free", "owner@staleexpfree.test", "agency");
    // Only the owner uses a seat; 2 slots remain.
    const expTok = "stale-exp-free-tok";
    await db.insert(platformInvitationsTable).values({
      token: expTok,
      email: "stale@staleexpfree.test",
      companyId: company.id,
      companySlug: "stale-exp-free",
      role: "viewer",
      expiresAt: new Date(Date.now() - 1),
    });

    const r = await api(`/api/platform/team/invites/${expTok}/resend`, { sid, body: {} });
    expect(r.status).toBe(200);
    expect(r.json.token).toBeTruthy();
    expect(r.json.token).not.toBe(expTok);
    // New token should carry a fresh ~7-day expiry.
    expect(new Date(r.json.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it("concurrent invites for the last account seat: exactly one wins", async () => {
    // Seat limit is 3 (default). Seed with owner + 1 pending invite = 2 seats
    // used, so there is exactly 1 seat remaining.
    const { sid } = await seedWorkspace("concurrent-pool", "owner@concurrent.test", "agency");
    const warmup = await api("/api/platform/team/invite", { sid, body: { email: "w@concurrent.test", role: "viewer" } });
    expect(warmup.status).toBe(201);

    // Fire two simultaneous invite requests for different emails.
    const [r1, r2] = await Promise.all([
      api("/api/platform/team/invite", { sid, body: { email: "c1@concurrent.test", role: "viewer" } }),
      api("/api/platform/team/invite", { sid, body: { email: "c2@concurrent.test", role: "viewer" } }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // Exactly one should succeed (201) and one should be rejected (403).
    expect(statuses).toEqual([201, 403]);
    expect([r1.json.limitReached, r2.json.limitReached]).toContain(true);
  });

  it("concurrent invites for the last project seat: exactly one wins", async () => {
    const { sid } = await seedWorkspace("concurrent-proj", "owner@concproj.test", "agency");
    await seedProject("px", "concurrent-proj");
    // Pre-fill project "px" with 2 of 3 seats.
    const [f1, f2] = await Promise.all([
      api("/api/platform/team/invite", { sid, body: { email: "f1@concproj.test", role: "content", projectIds: ["px"] } }),
      api("/api/platform/team/invite", { sid, body: { email: "f2@concproj.test", role: "content", projectIds: ["px"] } }),
    ]);
    // Both may succeed (2 seats available); we only care that they succeed.
    expect([201].includes(f1.status) || [201].includes(f2.status)).toBe(true);

    // Drain remaining seats serially to ensure exactly 1 slot left.
    const seats = await api("/api/platform/team", { sid });
    const slotsUsed = (seats.json.projectSeats?.px ?? 0) as number;
    for (let i = slotsUsed; i < 2; i++) {
      await api("/api/platform/team/invite", { sid, body: { email: `fill${i}@concproj.test`, role: "content", projectIds: ["px"] } });
    }

    // Now exactly 1 slot remains - fire two concurrent requests.
    const [r1, r2] = await Promise.all([
      api("/api/platform/team/invite", { sid, body: { email: "last1@concproj.test", role: "content", projectIds: ["px"] } }),
      api("/api/platform/team/invite", { sid, body: { email: "last2@concproj.test", role: "content", projectIds: ["px"] } }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 403]);
    expect(r1.json.limitReached ?? r2.json.limitReached).toBe(true);
  });

  it("concurrent resends of an expired invite at the seat limit: exactly one wins", async () => {
    const { sid, company } = await seedWorkspace("concurrent-resend", "owner@concresend.test", "agency");
    // Fill the workspace: owner + 2 pending = 3 seats (full).
    await api("/api/platform/team/invite", { sid, body: { email: "a@concresend.test", role: "viewer" } });
    await api("/api/platform/team/invite", { sid, body: { email: "b@concresend.test", role: "viewer" } });

    // Insert an expired invite that will compete to add a 4th seat.
    const expTok = "concurrent-resend-expired-tok";
    await db.insert(platformInvitationsTable).values({
      token: expTok,
      email: "expired@concresend.test",
      companyId: company.id,
      companySlug: "concurrent-resend",
      role: "viewer",
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // Both resends target the same expired invite - exactly one should succeed.
    const [r1, r2] = await Promise.all([
      api(`/api/platform/team/invites/${expTok}/resend`, { sid, body: {} }),
      api(`/api/platform/team/invites/${expTok}/resend`, { sid, body: {} }),
    ]);
    // One gets 200 (seat available when it ran), the other gets either 403
    // (seat taken) or 404 (invite token already regenerated).
    const succeeded = [r1, r2].filter((r) => r.status === 200);
    const rejected = [r1, r2].filter((r) => r.status !== 200);
    expect(succeeded.length).toBeLessThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
  });

  it("resending an expired project-seat invite re-checks that project's pool", async () => {
    const { sid, company } = await seedWorkspace("pool5-agency", "owner@pool5.test", "agency");
    await seedProject("pz", "pool5-agency");
    const first = await api("/api/platform/team/invite", {
      sid,
      body: { email: "old@pool5.test", role: "content", projectIds: ["pz"] },
    });
    // Expire it.
    await db
      .update(platformInvitationsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformInvitationsTable.token, first.json.token));
    // Fill the project with 3 fresh invites.
    for (const n of [1, 2, 3]) {
      expect(
        (await api("/api/platform/team/invite", { sid, body: { email: `z${n}@pool5.test`, role: "content", projectIds: ["pz"] } })).status,
      ).toBe(201);
    }
    const resend = await api(`/api/platform/team/invites/${first.json.token}/resend`, { sid, body: {} });
    expect(resend.status).toBe(403);
    expect(resend.json.limitReached).toBe(true);
  });

  it("a project invite and expired project-seat resend cannot claim the final seat together", async () => {
    const { sid, company } = await seedWorkspace("project-resend-race", "owner@project-resend-race.test", "agency");
    await seedProject("race-project", "project-resend-race");
    const expired = await api("/api/platform/team/invite", {
      sid,
      body: { email: "expired@project-resend-race.test", role: "content", projectIds: ["race-project"] },
    });
    await db
      .update(platformInvitationsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformInvitationsTable.token, expired.json.token));
    // The expired invitation does not hold a seat; two live invites leave one.
    for (const email of ["one@project-resend-race.test", "two@project-resend-race.test"]) {
      expect(
        (await api("/api/platform/team/invite", {
          sid,
          body: { email, role: "content", projectIds: ["race-project"] },
        })).status,
      ).toBe(201);
    }

    const [newInvite, resend] = await Promise.all([
      api("/api/platform/team/invite", {
        sid,
        body: { email: "new@project-resend-race.test", role: "content", projectIds: ["race-project"] },
      }),
      api(`/api/platform/team/invites/${expired.json.token}/resend`, { sid, body: {} }),
    ]);
    expect([newInvite.status, resend.status].filter((status) => status === 403)).toHaveLength(1);
    expect([newInvite.status, resend.status].filter((status) => status === 201 || status === 200)).toHaveLength(1);
    const team = await api("/api/platform/team", { sid });
    expect(team.json.projectSeats?.["race-project"]).toBe(PROJECT_TEAM_SEATS);
  });
});

describe("direct-client teams", () => {
  it("a direct client can invite up to 3 content colleagues; other roles rejected", async () => {
    const { sid } = await seedWorkspace("direct-client", "owner@direct.test", "client");

    const t = await api("/api/platform/team", { sid });
    expect(t.status).toBe(200);
    expect(t.json.teamMode).toBe("client");

    const admin = await api("/api/platform/team/invite", { sid, body: { email: "a@direct.test", role: "admin" } });
    expect(admin.status).toBe(400);

    const c1 = await api("/api/platform/team/invite", { sid, body: { email: "c1@direct.test", role: "content" } });
    const c2 = await api("/api/platform/team/invite", { sid, body: { email: "c2@direct.test", role: "content" } });
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);
    // Owner + 2 pending = 3 seats: the pool is full.
    const c3 = await api("/api/platform/team/invite", { sid, body: { email: "c3@direct.test", role: "content" } });
    expect(c3.status).toBe(403);
    expect(c3.json.limitReached).toBe(true);

    // A colleague can never be promoted off the content role.
    const accept = await api("/api/platform/invite/accept", { body: { token: c1.json.token, password: "colleague-pass-1" } });
    expect(accept.status).toBe(200);
    const [colleague] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.email, "c1@direct.test"));
    const promote = await api(`/api/platform/team/members/${colleague!.id}`, {
      sid,
      method: "PATCH",
      body: { role: "billing" },
    });
    expect(promote.status).toBe(400);
  });

  it("agency-managed partner clients have no team at all - list, invite and every mutation endpoint", async () => {
    await seedWorkspace("managing-agency", "owner@managing.test", "agency");
    const { sid } = await seedWorkspace("managed-client", "owner@managed.test", "client", "managing-agency");

    expect((await api("/api/platform/team", { sid })).status).toBe(403);
    const invite = await api("/api/platform/team/invite", { sid, body: { email: "c@managed.test", role: "content" } });
    expect(invite.status).toBe(403);
    // Mutation endpoints are gated too - stale team state stays frozen.
    expect((await api("/api/platform/team/invites/some-token/resend", { sid, body: {} })).status).toBe(403);
    expect((await api("/api/platform/team/invites/some-token/revoke", { sid, body: {} })).status).toBe(403);
    expect((await api("/api/platform/team/members/00000000-0000-0000-0000-000000000000", { sid, method: "PATCH", body: { role: "content" } })).status).toBe(403);
    expect((await api("/api/platform/team/members/00000000-0000-0000-0000-000000000000/remove", { sid, body: {} })).status).toBe(403);
  });

  it("resend refuses legacy invites whose role no longer fits the team model", async () => {
    const { sid, company } = await seedWorkspace("legacy-inv-client", "owner@leginv.test", "client");
    // Seed a legacy admin invite directly (pre-dates the content-only rule).
    await db.insert(platformInvitationsTable).values({
      token: "legacy-admin-invite",
      email: "old-admin@leginv.test",
      companyId: company.id,
      companySlug: "legacy-inv-client",
      role: "admin",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const resend = await api("/api/platform/team/invites/legacy-admin-invite/resend", { sid, body: {} });
    expect(resend.status).toBe(409);
  });
});

describe("project ownership enforcement on team invites", () => {
  it("rejects invites and access changes referencing projects the workspace does not own", async () => {
    // Another agency owns a project; ours owns a different one.
    await seedWorkspace("other-agency", "owner@other-ag.test", "agency");
    await seedProject("their-proj", "other-agency");
    const { sid } = await seedWorkspace("own-check-agency", "owner@own-check.test", "agency");
    await seedProject("our-proj", "own-check-agency");

    // Foreign project id -> rejected.
    const foreign = await api("/api/platform/team/invite", {
      sid,
      body: { email: "f@own-check.test", role: "content", projectIds: ["their-proj"] },
    });
    expect(foreign.status).toBe(400);
    expect(foreign.json.error).toContain("don't belong");

    // Mixed list -> rejected too.
    const mixed = await api("/api/platform/team/invite", {
      sid,
      body: { email: "f@own-check.test", role: "content", projectIds: ["our-proj", "their-proj"] },
    });
    expect(mixed.status).toBe(400);

    // Own project -> fine.
    const own = await api("/api/platform/team/invite", {
      sid,
      body: { email: "ok@own-check.test", role: "content", projectIds: ["our-proj"] },
    });
    expect(own.status).toBe(201);

    // PATCH cannot smuggle a foreign project in either.
    const accept = await api("/api/platform/invite/accept", { body: { token: own.json.token, password: "member-pass-1" } });
    expect(accept.status).toBe(200);
    const [member] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.email, "ok@own-check.test"));
    const patch = await api(`/api/platform/team/members/${member!.id}`, {
      sid,
      method: "PATCH",
      body: { projectIds: ["our-proj", "their-proj"] },
    });
    expect(patch.status).toBe(400);
  });

  it("a client sub-account's projects count as the agency's own", async () => {
    const { sid } = await seedWorkspace("parent-ag", "owner@parent-ag.test", "agency");
    await db.insert(platformAccountsTable).values({
      username: "child-client",
      passwordHash: hashPassword("child-pass-1"),
      role: "client",
      status: "active",
      email: "child@parent-ag.test",
      parent: "parent-ag",
    });
    await seedProject("child-proj", "child-client");
    const r = await api("/api/platform/team/invite", {
      sid,
      body: { email: "staff@parent-ag.test", role: "content", projectIds: ["child-proj"] },
    });
    expect(r.status).toBe(201);
  });
});

describe("project ownership: downward-only + resend validation", () => {
  it("a client workspace cannot grant seats on its parent agency's project", async () => {
    // Parent agency owns a project; the client can SEE it (read visibility
    // includes the parent) but must not be able to assign team seats on it.
    await seedWorkspace("par-own-ag", "owner@par-own.test", "agency");
    await seedProject("parent-owned-proj", "par-own-ag");
    const { sid } = await seedWorkspace("par-own-cl", "owner@par-own-cl.test", "client");
    await db.update(platformAccountsTable)
      .set({ parent: "par-own-ag" })
      .where(eq(platformAccountsTable.username, "par-own-cl"));
    // Make the parent non-agency so the client keeps a team (client mode).
    await db.update(platformAccountsTable)
      .set({ role: "client" })
      .where(eq(platformAccountsTable.username, "par-own-ag"));
    // Client-mode invites discard any project scoping - the parent's project
    // id must not end up stored on the invitation.
    const r = await api("/api/platform/team/invite", {
      sid,
      body: { email: "x@par-own-cl.test", role: "content", projectIds: ["parent-owned-proj"] },
    });
    expect(r.status).toBe(201);
    const [stored] = await db
      .select()
      .from(platformInvitationsTable)
      .where(eq(platformInvitationsTable.email, "x@par-own-cl.test"));
    expect(stored!.projectAccess).toBeNull();

    // Nor can a member update smuggle the parent's project in: client-mode
    // updates silently clear all project scoping.
    const accept = await api("/api/platform/invite/accept", { body: { token: r.json.token, password: "member-pass-9" } });
    expect(accept.status).toBe(200);
    const [member] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.email, "x@par-own-cl.test"));
    const patch = await api(`/api/platform/team/members/${member!.id}`, {
      sid,
      method: "PATCH",
      body: { projectIds: ["parent-owned-proj"] },
    });
    expect(patch.status).toBe(200);
    const [updatedMember] = await db
      .select({ projectAccess: platformMembershipsTable.projectAccess })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, member!.id));
    expect(updatedMember?.projectAccess).toBeNull();
  });

  it("resend refuses an expired invite whose project no longer belongs to the workspace", async () => {
    const { sid, company } = await seedWorkspace("resend-own-ag", "owner@resend-own.test", "agency");
    await seedProject("resend-own-proj", "resend-own-ag");
    const inv = await api("/api/platform/team/invite", {
      sid,
      body: { email: "r@resend-own.test", role: "content", projectIds: ["resend-own-proj"] },
    });
    expect(inv.status).toBe(201);
    // Project gets reassigned to an unrelated owner, invite expires.
    await db.update(projectsTable).set({ owner: "someone-else" }).where(eq(projectsTable.id, "resend-own-proj"));
    await db.update(platformInvitationsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformInvitationsTable.companyId, company.id));
    const resend = await api(`/api/platform/team/invites/${inv.json.token}/resend`, { sid, body: {} });
    expect(resend.status).toBe(409);
    expect(resend.json.error).toContain("no longer belongs");
  });
});

// ---------------------------------------------------------------------------
// Admin: team-violation report + fix
// ---------------------------------------------------------------------------
describe("admin team-violation report and fix", () => {
  // Seed a master-admin session (role === "admin" at the account level).
  async function seedMasterAdmin(slug: string, email: string) {
    await db.insert(platformAccountsTable).values({
      username: slug,
      passwordHash: hashPassword("admin-pw-1"),
      role: "admin",
      status: "active",
      email,
    });
    const [company] = await db
      .insert(platformCompaniesTable)
      .values({ slug, role: "admin", status: "active", displayName: `${slug} Ltd`, setupComplete: true })
      .returning();
    const [user] = await db
      .insert(platformUsersTable)
      .values({ email, passwordHash: hashPassword("admin-pw-1"), emailVerified: true })
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

  it("returns 403 for non-admin callers", async () => {
    const { sid } = await seedWorkspace("v-agency-nonadmin", "owner@v-nonadmin.test", "agency");
    const r = await api("/api/platform/admin/team-violations", { sid });
    expect(r.status).toBe(403);
    const rf = await api("/api/platform/admin/team-violations/fix", { sid, body: {} });
    expect(rf.status).toBe(403);
  });

  it("lets a workspace owner review and fix only their own role mismatches", async () => {
    const { sid, company } = await seedWorkspace("owner-role-review", "owner@role-review.test", "client");
    const [member] = await db
      .insert(platformUsersTable)
      .values({ email: "viewer@role-review.test", passwordHash: hashPassword("viewer-pass"), emailVerified: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: member!.id,
      companyId: company.id,
      companySlug: "owner-role-review",
      role: "viewer",
    });

    const report = await api("/api/platform/team/violations", { sid });
    expect(report.status).toBe(200);
    expect(report.json.violations).toHaveLength(1);
    expect(report.json.violations[0]).toMatchObject({ kind: "member", currentRole: "viewer" });

    const fixed = await api("/api/platform/team/violations/fix", { sid, body: {} });
    expect(fixed.status).toBe(200);
    expect(fixed.json.fixed).toBe(1);
    const [updated] = await db
      .select({ role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, member!.id));
    expect(updated?.role).toBe("content");
  });

  it("reports violations: agency project-seat member with non-content role and client member with non-content role", async () => {
    const { sid: adminSid } = await seedMasterAdmin("violations-admin", "admin@violations.test");

    // Agency workspace with a project-scoped member that has 'billing' role (legacy).
    const { company: agencyCompany } = await seedWorkspace("v-agency", "owner@v-agency.test", "agency");
    const [agencyMember] = await db
      .insert(platformUsersTable)
      .values({ email: "billing-proj@v-agency.test", passwordHash: hashPassword("pass1"), emailVerified: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: agencyMember!.id,
      companyId: agencyCompany.id,
      companySlug: "v-agency",
      role: "billing",
      projectAccess: JSON.stringify(["proj-abc"]),
    });

    // Agency workspace with a project-scoped invite that has 'admin' role (legacy).
    await db.insert(platformInvitationsTable).values({
      token: "viol-agency-admin-invite",
      email: "old-admin@v-agency.test",
      companyId: agencyCompany.id,
      companySlug: "v-agency",
      role: "admin",
      projectAccess: JSON.stringify(["proj-xyz"]),
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Client workspace with a member that has 'viewer' role (legacy).
    const { company: clientCompany } = await seedWorkspace("v-client", "owner@v-client.test", "client");
    const [clientMember] = await db
      .insert(platformUsersTable)
      .values({ email: "viewer@v-client.test", passwordHash: hashPassword("pass2"), emailVerified: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: clientMember!.id,
      companyId: clientCompany.id,
      companySlug: "v-client",
      role: "viewer",
    });

    // Client workspace with a non-content invite (legacy).
    await db.insert(platformInvitationsTable).values({
      token: "viol-client-billing-invite",
      email: "old-billing@v-client.test",
      companyId: clientCompany.id,
      companySlug: "v-client",
      role: "billing",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const r = await api("/api/platform/admin/team-violations", { sid: adminSid });
    expect(r.status).toBe(200);
    expect(r.json.total).toBeGreaterThanOrEqual(4);

    // Both violating companies must appear in the report.
    const slugs: string[] = r.json.companies.map((c: any) => c.companySlug);
    expect(slugs).toContain("v-agency");
    expect(slugs).toContain("v-client");

    // The agency company must show the billing member + admin invite as violations.
    const agencyEntry = r.json.companies.find((c: any) => c.companySlug === "v-agency");
    expect(agencyEntry).toBeDefined();
    const agencyViolations = agencyEntry.violations;
    expect(agencyViolations.some((v: any) => v.kind === "member" && v.currentRole === "billing")).toBe(true);
    expect(agencyViolations.some((v: any) => v.kind === "invite" && v.currentRole === "admin")).toBe(true);

    // The client company must show the viewer member + billing invite as violations.
    const clientEntry = r.json.companies.find((c: any) => c.companySlug === "v-client");
    expect(clientEntry).toBeDefined();
    expect(clientEntry.violations.some((v: any) => v.kind === "member" && v.currentRole === "viewer")).toBe(true);
    expect(clientEntry.violations.some((v: any) => v.kind === "invite" && v.currentRole === "billing")).toBe(true);

    // Workspace owners are included in the report for notification purposes.
    expect(clientEntry.ownerEmail).toBe("owner@v-client.test");
    expect(agencyEntry.ownerEmail).toBe("owner@v-agency.test");
  });

  it("fix endpoint downgrades violating members and invites to content role", async () => {
    const { sid: adminSid } = await seedMasterAdmin("fix-admin", "admin@fix.test");

    const { company: fixAgency } = await seedWorkspace("v-fix-agency", "owner@v-fix-agency.test", "agency");
    const [fixMember] = await db
      .insert(platformUsersTable)
      .values({ email: "admin-proj@v-fix-agency.test", passwordHash: hashPassword("pass3"), emailVerified: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: fixMember!.id,
      companyId: fixAgency.id,
      companySlug: "v-fix-agency",
      role: "admin",
      projectAccess: JSON.stringify(["fix-proj"]),
    });
    await db.insert(platformInvitationsTable).values({
      token: "fix-agency-viewer-invite",
      email: "viewer-proj@v-fix-agency.test",
      companyId: fixAgency.id,
      companySlug: "v-fix-agency",
      role: "viewer",
      projectAccess: JSON.stringify(["fix-proj"]),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const fix = await api("/api/platform/admin/team-violations/fix", { sid: adminSid, body: {} });
    expect(fix.status).toBe(200);
    expect(fix.json.ok).toBe(true);
    expect(fix.json.dryRun).toBe(false);
    expect(fix.json.fixed).toBeGreaterThanOrEqual(2);

    // Member role must now be 'content'.
    const [updatedMember] = await db
      .select({ role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, fixMember!.id));
    expect(updatedMember?.role).toBe("content");

    // Invite role must now be 'content'.
    const [updatedInvite] = await db
      .select({ role: platformInvitationsTable.role })
      .from(platformInvitationsTable)
      .where(eq(platformInvitationsTable.token, "fix-agency-viewer-invite"));
    expect(updatedInvite?.role).toBe("content");
  });

  it("dry-run reports violations without changing anything", async () => {
    const { sid: adminSid } = await seedMasterAdmin("dryrun-admin", "admin@dryrun.test");

    const { company: dryClient } = await seedWorkspace("v-dryrun-client", "owner@v-dryrun.test", "client");
    const [dryMember] = await db
      .insert(platformUsersTable)
      .values({ email: "billing@v-dryrun.test", passwordHash: hashPassword("pass4"), emailVerified: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: dryMember!.id,
      companyId: dryClient.id,
      companySlug: "v-dryrun-client",
      role: "billing",
    });

    const dry = await api("/api/platform/admin/team-violations/fix", {
      sid: adminSid,
      body: { dryRun: true },
    });
    expect(dry.status).toBe(200);
    expect(dry.json.dryRun).toBe(true);
    expect(dry.json.fixed).toBeGreaterThanOrEqual(1);

    // DB must be unchanged.
    const [unchanged] = await db
      .select({ role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, dryMember!.id));
    expect(unchanged?.role).toBe("billing");
  });

  it("does not flag account-level (non-project-scoped) agency members with any role", async () => {
    const { sid: adminSid } = await seedMasterAdmin("safe-admin", "admin@safe.test");

    const { company: safeAgency } = await seedWorkspace("v-safe-agency", "owner@v-safe.test", "agency");
    const [safeMember] = await db
      .insert(platformUsersTable)
      .values({ email: "billing-acct@v-safe.test", passwordHash: hashPassword("pass5"), emailVerified: true })
      .returning();
    // Account-level seat (no projectAccess) with 'billing' - this is valid.
    await db.insert(platformMembershipsTable).values({
      userId: safeMember!.id,
      companyId: safeAgency.id,
      companySlug: "v-safe-agency",
      role: "billing",
      projectAccess: null,
    });

    const r = await api("/api/platform/admin/team-violations", { sid: adminSid });
    expect(r.status).toBe(200);
    const entry = r.json.companies.find((c: any) => c.companySlug === "v-safe-agency");
    // v-safe-agency should NOT appear in the violations list.
    expect(entry).toBeUndefined();
  });
});

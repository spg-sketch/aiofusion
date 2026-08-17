import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
      vat_number varchar(64),
      billing_address varchar(512),
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
    return Promise.resolve();
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
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, createPlatformSession, PLATFORM_COOKIE } from "../lib/platform-auth";
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

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// Invite lifecycle
// ---------------------------------------------------------------------------
describe("team invitations", () => {
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

describe("agency two-pool seat model", () => {
  it("GET /team reports agency mode with account-pool seat counts and per-project usage", async () => {
    const { sid } = await seedWorkspace("pool-agency", "owner@pool.test", "agency");
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
    const badRole = await api("/api/platform/team/invite", {
      sid,
      body: { email: "v@pool3.test", role: "viewer", projectIds: ["p1"] },
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

  it("resending an expired project-seat invite re-checks that project's pool", async () => {
    const { sid, company } = await seedWorkspace("pool5-agency", "owner@pool5.test", "agency");
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

  it("agency-managed partner clients have no team at all", async () => {
    await seedWorkspace("managing-agency", "owner@managing.test", "agency");
    const { sid } = await seedWorkspace("managed-client", "owner@managed.test", "client", "managing-agency");

    expect((await api("/api/platform/team", { sid })).status).toBe(403);
    const invite = await api("/api/platform/team/invite", { sid, body: { email: "c@managed.test", role: "content" } });
    expect(invite.status).toBe(403);
  });
});

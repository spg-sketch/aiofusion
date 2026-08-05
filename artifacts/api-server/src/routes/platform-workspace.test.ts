/**
 * Tests for the workspace-switching and in-app invite-acceptance endpoints
 * added to platform.ts:
 *   GET  /platform/me          — now includes `workspaces` array
 *   GET  /platform/my-invites  — pending invites for the signed-in user's email
 *   POST /platform/my-invites/:token/accept — in-app accept (no new session)
 *   POST /platform/switch-workspace         — switch active workspace
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// PGlite in-memory database
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
    CREATE TABLE IF NOT EXISTS platform_password_resets (
      token varchar(64) PRIMARY KEY,
      user_id uuid NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_email_verifications (
      token varchar(64) PRIMARY KEY,
      user_id uuid NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
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
    CREATE TABLE IF NOT EXISTS project_snapshots (
      id varchar PRIMARY KEY,
      project_id varchar,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
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
    CREATE TABLE IF NOT EXISTS admin_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_username varchar NOT NULL DEFAULT '',
      actor_id uuid,
      action varchar NOT NULL,
      target_type varchar,
      target_id varchar,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
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
    platformPasswordResetsTable: schema.platformPasswordResetsTable,
    platformEmailVerificationsTable: schema.platformEmailVerificationsTable,
    projectsTable: schema.projectsTable,
    projectSnapshotsTable: schema.projectSnapshotsTable,
    archiveItemsTable: schema.archiveItemsTable,
    plannerItemsTable: schema.plannerItemsTable,
    scoringConfigsTable: schema.scoringConfigsTable,
    savedAuditsTable: schema.savedAuditsTable,
    savedDiagnosticsTable: schema.savedDiagnosticsTable,
    savedContentGeoTable: schema.savedContentGeoTable,
    savedTechGeoTable: schema.savedTechGeoTable,
    mediaOutletsTable: schema.mediaOutletsTable,
    mediaContactsTable: schema.mediaContactsTable,
    mediaCategoriesTable: schema.mediaCategoriesTable,
    tokenUsageTable: schema.tokenUsageTable,
    auditLocksTable: schema.auditLocksTable,
    adminEventsTable: schema.adminEventsTable,
  };
});

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

vi.mock("../lib/notify-email", () => ({
  getAppBaseUrl: () => "https://test.example.com",
  sendTeamInviteEmail: () => Promise.resolve(),
  sendNewSignupAlert: () => Promise.resolve(),
  sendApprovalEmail: () => Promise.resolve(),
  sendVerificationEmail: () => Promise.resolve(),
  sendPasswordResetEmail: () => Promise.resolve(),
  sendMfaAdminResetEmail: () => Promise.resolve(),
}));

vi.mock("../lib/mfa", () => ({
  getMfaState: () => Promise.resolve(null),
  getMfaEnabledSet: () => Promise.resolve(new Set()),
  saveMfaState: () => Promise.resolve(),
  clearMfaState: () => Promise.resolve(),
  generateTotpSecret: () => ({ secret: "SECRET", uri: "otpauth://totp/test" }),
  verifyTotp: () => true,
  buildOtpauthUrl: () => "otpauth://totp/test",
  generateRecoveryCodes: () => ["code1", "code2"],
  hashRecoveryCode: (c: string) => c,
  consumeRecoveryCode: () => Promise.resolve(false),
  createMfaPendingToken: () => "mfa-token",
  verifyMfaPendingToken: () => null,
  TRUSTED_DEVICE_COOKIE: "aio_td",
  TRUSTED_DEVICE_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  isTrustedDevice: () => Promise.resolve(false),
  addTrustedDevice: () => Promise.resolve("device-id"),
  listTrustedDevices: () => Promise.resolve([]),
  revokeTrustedDevice: () => Promise.resolve(false),
  clearTrustedDevices: () => Promise.resolve(),
  verifyTrustedDeviceToken: () => null,
}));

import {
  db,
  platformUsersTable,
  platformAccountsTable,
  platformCompaniesTable,
  platformMembershipsTable,
  platformInvitationsTable,
  platformMetaTable,
  platformSessionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { hashPassword, createPlatformSession, PLATFORM_COOKIE } from "../lib/platform-auth";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test server helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(resolvePlatformAccount);
  app.use("/api", platformRouter);
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

// Seed an agency workspace: account row, company row, user row, membership, session.
async function seedAgency(slug: string, email: string) {
  await db.insert(platformAccountsTable).values({
    username: slug,
    passwordHash: hashPassword("pw-123456"),
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
    .values({ email, passwordHash: hashPassword("pw-123456"), emailVerified: true })
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

// Seed a pending (unused, unexpired) invitation for the given email.
async function seedInvite(
  companyId: string,
  companySlug: string,
  email: string,
  role = "viewer",
  ttlMs = 7 * 24 * 60 * 60 * 1000,
) {
  const token = `test-token-${Math.random().toString(36).slice(2)}`;
  await db.insert(platformInvitationsTable).values({
    token,
    email,
    companyId,
    companySlug,
    role,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
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
// /platform/me — workspaces field
// ---------------------------------------------------------------------------
describe("GET /platform/me – workspaces field", () => {
  it("includes all active workspaces for the signed-in user", async () => {
    const { sid, company, user } = await seedAgency("ws-me-a", "me-a@test.local");
    // Add a second workspace membership for the same user.
    const [company2] = await db
      .insert(platformCompaniesTable)
      .values({ slug: "ws-me-b", role: "agency", status: "active", displayName: "Me B Ltd", setupComplete: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: user.id, companyId: company2!.id, companySlug: "ws-me-b", role: "content",
    });

    const me = await api("/api/platform/me", { sid });
    expect(me.status).toBe(200);
    expect(Array.isArray(me.json.workspaces)).toBe(true);
    const slugs = me.json.workspaces.map((w: any) => w.companySlug).sort();
    expect(slugs).toContain("ws-me-a");
    expect(slugs).toContain("ws-me-b");
    // Active workspace is the session's current company.
    const active = me.json.workspaces.find((w: any) => w.isActive);
    expect(active?.companySlug).toBe("ws-me-a");
    expect(active?.companyId).toBe(company.id);
  });

  it("returns empty workspaces array for legacy session without userId", async () => {
    // Legacy session: username-only, no userId.
    await db.insert(platformAccountsTable).values({
      username: "legacy-me", passwordHash: hashPassword("pw1"), role: "agency", status: "active",
    });
    const legacySid = await createPlatformSession("legacy-me", null, null, null);
    const me = await api("/api/platform/me", { sid: legacySid });
    expect(me.status).toBe(200);
    expect(me.json.workspaces).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /platform/my-invites
// ---------------------------------------------------------------------------
describe("GET /platform/my-invites", () => {
  it("returns pending invites with the company display name from the companies table", async () => {
    const { sid } = await seedAgency("inv-list-a", "inv-list@test.local");
    const { company: company2 } = await seedAgency("inv-list-b", "inv-list-b-owner@test.local");
    // Invite inv-list@test.local into company2.
    await seedInvite(company2.id, "inv-list-b", "inv-list@test.local", "admin");

    const res = await api("/api/platform/my-invites", { sid });
    expect(res.status).toBe(200);
    expect(res.json.invites).toHaveLength(1);
    expect(res.json.invites[0].companySlug).toBe("inv-list-b");
    expect(res.json.invites[0].role).toBe("admin");
    // seedAgency sets displayName = `${slug} Ltd` on the companies row.
    expect(res.json.invites[0].companyName).toBe("inv-list-b Ltd");
  });

  it("falls back to platform_meta display name when companies.display_name is null", async () => {
    const { sid } = await seedAgency("inv-meta-a", "inv-meta@test.local");
    // Company with no displayName in the companies table.
    const [metaCo] = await db
      .insert(platformCompaniesTable)
      .values({ slug: "inv-meta-b", role: "agency", status: "active", setupComplete: true })
      .returning();
    // Store the human-readable name in platform_meta (password-signup path).
    await db
      .insert(platformMetaTable)
      .values({ key: "account:profile:inv-meta-b", value: JSON.stringify({ displayName: "Meta Agency Two" }) });
    await seedInvite(metaCo!.id, "inv-meta-b", "inv-meta@test.local", "viewer");

    const res = await api("/api/platform/my-invites", { sid });
    expect(res.status).toBe(200);
    expect(res.json.invites).toHaveLength(1);
    expect(res.json.invites[0].companyName).toBe("Meta Agency Two");
  });

  it("excludes expired invites", async () => {
    const { sid } = await seedAgency("inv-exp-a", "inv-exp@test.local");
    const { company: expCompany } = await seedAgency("inv-exp-b", "inv-exp-b@test.local");
    // Expired 1 ms ago.
    await seedInvite(expCompany.id, "inv-exp-b", "inv-exp@test.local", "viewer", -1);

    const res = await api("/api/platform/my-invites", { sid });
    expect(res.status).toBe(200);
    expect(res.json.invites).toHaveLength(0);
  });

  it("returns empty array for legacy session without userId", async () => {
    await db.insert(platformAccountsTable).values({
      username: "legacy-inv", passwordHash: hashPassword("pw1"), role: "agency", status: "active",
    });
    const legacySid = await createPlatformSession("legacy-inv", null, null, null);
    const res = await api("/api/platform/my-invites", { sid: legacySid });
    expect(res.status).toBe(200);
    expect(res.json.invites).toEqual([]);
  });

  it("requires auth", async () => {
    const res = await api("/api/platform/my-invites");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /platform/my-invites/:token/accept
// ---------------------------------------------------------------------------
describe("POST /platform/my-invites/:token/accept", () => {
  it("adds membership without issuing a new session", async () => {
    const { sid, user } = await seedAgency("accept-a", "accept-a@test.local");
    const { company: targetCo } = await seedAgency("accept-b", "accept-b-owner@test.local");
    const token = await seedInvite(targetCo.id, "accept-b", "accept-a@test.local", "content");

    const res = await api(`/api/platform/my-invites/${token}/accept`, { sid, body: {} });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.companySlug).toBe("accept-b");
    expect(res.json.role).toBe("content");

    // No new Set-Cookie header — session must not change.
    expect(res.setCookie).toBeNull();

    // Membership row now exists.
    const [mem] = await db
      .select()
      .from(platformMembershipsTable)
      .where(and(eq(platformMembershipsTable.userId, user.id), eq(platformMembershipsTable.companyId, targetCo.id)));
    expect(mem).toBeTruthy();
    expect(mem!.role).toBe("content");
  });

  it("rejects when signed-in email does not match invite email", async () => {
    const { sid } = await seedAgency("mismatch-a", "mismatch-a@test.local");
    const { company: targetCo } = await seedAgency("mismatch-b", "mismatch-b-owner@test.local");
    const token = await seedInvite(targetCo.id, "mismatch-b", "other@test.local", "viewer");

    const res = await api(`/api/platform/my-invites/${token}/accept`, { sid, body: {} });
    expect(res.status).toBe(403);
  });

  it("rejects an already-used token", async () => {
    const { sid, user } = await seedAgency("used-a", "used-a@test.local");
    const { company: targetCo } = await seedAgency("used-b", "used-b-owner@test.local");
    const token = await seedInvite(targetCo.id, "used-b", "used-a@test.local", "viewer");

    // First accept succeeds.
    await api(`/api/platform/my-invites/${token}/accept`, { sid, body: {} });
    // Second attempt must fail.
    const res = await api(`/api/platform/my-invites/${token}/accept`, { sid, body: {} });
    expect(res.status).toBe(404);
  });

  it("rejects a legacy session without userId", async () => {
    await db.insert(platformAccountsTable).values({
      username: "legacy-accept", passwordHash: hashPassword("pw1"), role: "agency", status: "active",
    });
    const legacySid = await createPlatformSession("legacy-accept", null, null, null);
    const res = await api("/api/platform/my-invites/any-token/accept", { sid: legacySid, body: {} });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /platform/switch-workspace
// ---------------------------------------------------------------------------
describe("POST /platform/switch-workspace", () => {
  it("issues a new session for the target workspace and revokes the old one", async () => {
    const { sid: sidA, user, company: coA } = await seedAgency("sw-a", "sw-a@test.local");
    const [coB] = await db
      .insert(platformCompaniesTable)
      .values({ slug: "sw-b", role: "agency", status: "active", displayName: "SW-B Ltd", setupComplete: true })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: user.id, companyId: coB!.id, companySlug: "sw-b", role: "admin",
    });
    await db.insert(platformAccountsTable).values({
      username: "sw-b", passwordHash: hashPassword("pw1"), role: "agency", status: "active",
    });

    const res = await api("/api/platform/switch-workspace", { sid: sidA, body: { companyId: coB!.id } });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.account.username).toBe("sw-b");
    expect(res.json.account.membershipRole).toBe("admin");

    // New cookie is set.
    const newSid = /aio_sid=([^;]+)/.exec(res.setCookie ?? "")?.[1];
    expect(newSid).toBeTruthy();
    // New session exists in DB for the target workspace.
    const [newSession] = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.sid, newSid!));
    expect(newSession?.activeCompanyId).toBe(coB!.id);
    // Old session is revoked (per-userId deletion in createPlatformSession).
    const [oldSession] = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.sid, sidA));
    expect(oldSession).toBeUndefined();
  });

  it("rejects when the user has no membership in the target workspace", async () => {
    const { sid } = await seedAgency("sw-nomem-a", "sw-nomem@test.local");
    const [otherCo] = await db
      .insert(platformCompaniesTable)
      .values({ slug: "sw-nomem-b", role: "agency", status: "active", setupComplete: true })
      .returning();

    const res = await api("/api/platform/switch-workspace", { sid, body: { companyId: otherCo!.id } });
    expect(res.status).toBe(403);
  });

  it("rejects a legacy session without userId", async () => {
    await db.insert(platformAccountsTable).values({
      username: "legacy-sw", passwordHash: hashPassword("pw1"), role: "agency", status: "active",
    });
    const legacySid = await createPlatformSession("legacy-sw", null, null, null);
    const res = await api("/api/platform/switch-workspace", { sid: legacySid, body: { companyId: "some-id" } });
    expect(res.status).toBe(403);
  });

  it("rejects a missing companyId body field", async () => {
    const { sid } = await seedAgency("sw-bad-a", "sw-bad@test.local");
    const res = await api("/api/platform/switch-workspace", { sid, body: {} });
    expect(res.status).toBe(400);
  });
});

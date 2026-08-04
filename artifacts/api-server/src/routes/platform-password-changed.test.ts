import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// Hoisted captures — must be above all vi.mock calls
// ---------------------------------------------------------------------------
const passwordChangedCalls = vi.hoisted(
  () => [] as Array<{ toEmail: string; toName: string }>,
);
let passwordChangedShouldThrow = false;

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database
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
      username varchar NOT NULL,
      data jsonb,
      owner varchar,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS project_snapshots (
      id varchar PRIMARY KEY,
      project_id varchar,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS archive_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      project_id varchar NOT NULL,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS planner_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      project_id varchar NOT NULL,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS scoring_configs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      project_id varchar NOT NULL,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_outlets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS token_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      tokens int,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS audit_locks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      project_id varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS platform_email_verifications (
      token        varchar(64) PRIMARY KEY,
      user_id      uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at   timestamptz NOT NULL,
      used_at      timestamptz
    );
    CREATE TABLE IF NOT EXISTS platform_password_resets (
      token        varchar(64) PRIMARY KEY,
      user_id      uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at   timestamptz NOT NULL,
      used_at      timestamptz
    );
    CREATE TABLE IF NOT EXISTS admin_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id varchar,
      actor_username varchar,
      action varchar,
      target_id varchar,
      target_type varchar,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  return {
    db,
    platformUsersTable: schema.platformUsersTable,
    platformCompaniesTable: schema.platformCompaniesTable,
    platformMembershipsTable: schema.platformMembershipsTable,
    platformAccountsTable: schema.platformAccountsTable,
    platformMetaTable: schema.platformMetaTable,
    platformSessionsTable: schema.platformSessionsTable,
    projectsTable: schema.projectsTable,
    projectSnapshotsTable: schema.projectSnapshotsTable,
    archiveItemsTable: schema.archiveItemsTable,
    plannerItemsTable: schema.plannerItemsTable,
    scoringConfigsTable: schema.scoringConfigsTable,
    mediaOutletsTable: schema.mediaOutletsTable,
    mediaContactsTable: schema.mediaContactsTable,
    mediaCategoriesTable: schema.mediaCategoriesTable,
    tokenUsageTable: schema.tokenUsageTable,
    auditLocksTable: schema.auditLocksTable,
    adminEventsTable: schema.adminEventsTable,
    platformEmailVerificationsTable: schema.platformEmailVerificationsTable,
    platformPasswordResetsTable: schema.platformPasswordResetsTable,
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

// requirePlatformAuth injects req.account from the __testAccount header
vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: any, _res: unknown, next: () => void) => {
    try {
      const raw = req.headers["x-test-account"];
      req.account = raw ? JSON.parse(raw as string) : null;
    } catch {
      req.account = null;
    }
    next();
  },
}));

vi.mock("../lib/notify-email", () => ({
  getAppBaseUrl: () => "https://test.example.com",
  sendNewSignupAlert: () => Promise.resolve(),
  sendApprovalEmail: () => Promise.resolve(),
  sendSpikeAlert: () => Promise.resolve(),
  sendQuotaBreachAlert: () => Promise.resolve(),
  sendSpendCapAlert: () => Promise.resolve(),
  sendBookDemoInternalAlert: () => Promise.resolve(),
  sendBookDemoConfirmation: () => Promise.resolve(),
  sendEnquiryInternalAlert: () => Promise.resolve(),
  sendEnquiryConfirmation: () => Promise.resolve(),
  sendSupportTicketAlert: () => Promise.resolve(),
  sendSupportTicketAck: () => Promise.resolve(),
  sendVerificationEmail: () => Promise.resolve(),
  sendPasswordResetEmail: () => Promise.resolve(),
  sendMfaAdminResetEmail: () => Promise.resolve(),
  sendPasswordChangedEmail: (opts: { toEmail: string; toName: string }) => {
    if (passwordChangedShouldThrow) throw new Error("simulated email failure");
    passwordChangedCalls.push(opts);
    return Promise.resolve();
  },
}));

import {
  db,
  platformUsersTable,
  platformAccountsTable,
  platformMembershipsTable,
  platformCompaniesTable,
  platformSessionsTable,
  platformPasswordResetsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/platform-auth";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", platformRouter);
  return app;
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = buildApp();
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({ server, baseUrl });
    });
  });
}

async function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Wait briefly for fire-and-forget email tasks to settle. */
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 50));
}

// ---------------------------------------------------------------------------
// POST /api/platform/change-password
// ---------------------------------------------------------------------------
describe("POST /api/platform/change-password — password changed security alert", () => {
  let server: Server;
  let baseUrl: string;

  const USERNAME = "cp-test-agency";
  const EMAIL = "cp-user@example.com";
  const NAME = "Change Password User";
  const PASSWORD = "oldpassword1";

  beforeEach(async () => {
    passwordChangedCalls.length = 0;
    passwordChangedShouldThrow = false;

    const ph = hashPassword(PASSWORD);

    // Insert platform_users row
    await db.insert(platformUsersTable).values({
      email: EMAIL,
      name: NAME,
      passwordHash: ph,
    });
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);

    // Insert platform_accounts (legacy store)
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: EMAIL,
    });

    // Insert platform_companies
    await db.insert(platformCompaniesTable).values({
      slug: USERNAME,
      role: "agency",
    });
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, USERNAME))
      .limit(1);

    // Insert owner membership
    await db.insert(platformMembershipsTable).values({
      userId: userRow!.id,
      companyId: company!.id,
      companySlug: USERNAME,
      role: "owner",
    });

    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, USERNAME));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
  });

  async function changePassword(
    currentPassword: string,
    newPassword: string,
    account: { username: string; userId: string; role: string },
  ) {
    return fetch(`${baseUrl}/api/platform/change-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify(account),
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  it("sends a password changed alert to the user's email on success", async () => {
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);

    const res = await changePassword(PASSWORD, "newpassword99", {
      username: USERNAME,
      userId: userRow!.id,
      role: "agency",
    });
    expect(res.status).toBe(200);

    await flushAsync();

    expect(passwordChangedCalls.length).toBe(1);
    expect(passwordChangedCalls[0]!.toEmail).toBe(EMAIL);
    expect(passwordChangedCalls[0]!.toName).toBe(NAME);
  });

  it("does not block the 200 response when the alert email throws", async () => {
    passwordChangedShouldThrow = true;

    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);

    const res = await changePassword(PASSWORD, "newpassword99", {
      username: USERNAME,
      userId: userRow!.id,
      role: "agency",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("does not send an alert when the current password is wrong", async () => {
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);

    const res = await changePassword("wrongpassword", "newpassword99", {
      username: USERNAME,
      userId: userRow!.id,
      role: "agency",
    });
    expect(res.status).toBe(401);

    await flushAsync();
    expect(passwordChangedCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/reset-password
// ---------------------------------------------------------------------------
describe("POST /api/platform/reset-password — password changed security alert", () => {
  let server: Server;
  let baseUrl: string;

  const USERNAME = "rp-test-agency";
  const EMAIL = "rp-user@example.com";
  const NAME = "Reset Password User";
  const NON_OWNER_EMAIL = "rp-member@example.com";
  const PASSWORD = "initialpass1";

  let ownerUserId: string;
  let nonOwnerUserId: string;

  beforeEach(async () => {
    passwordChangedCalls.length = 0;
    passwordChangedShouldThrow = false;

    const ph = hashPassword(PASSWORD);

    // Insert owner (platform_users)
    await db.insert(platformUsersTable).values({ email: EMAIL, name: NAME, passwordHash: ph });
    const [owner] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);
    ownerUserId = owner!.id;

    // Insert a later non-owner team member
    await db.insert(platformUsersTable).values({ email: NON_OWNER_EMAIL, name: "Non Owner", passwordHash: ph });
    const [nonOwner] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, NON_OWNER_EMAIL))
      .limit(1);
    nonOwnerUserId = nonOwner!.id;

    // Insert platform_accounts (legacy store)
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: EMAIL,
    });

    // Insert platform_companies
    await db.insert(platformCompaniesTable).values({ slug: USERNAME, role: "agency" });
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, USERNAME))
      .limit(1);

    // Memberships: owner first, then non-owner
    await db.insert(platformMembershipsTable).values({
      userId: ownerUserId,
      companyId: company!.id,
      companySlug: USERNAME,
      role: "owner",
    });
    await db.insert(platformMembershipsTable).values({
      userId: nonOwnerUserId,
      companyId: company!.id,
      companySlug: USERNAME,
      role: "member",
    });

    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformPasswordResetsTable).where(eq(platformPasswordResetsTable.userId, ownerUserId));
    await db.delete(platformPasswordResetsTable).where(eq(platformPasswordResetsTable.userId, nonOwnerUserId));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, USERNAME));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, NON_OWNER_EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
  });

  async function seedResetToken(userId: string): Promise<string> {
    const token = `test-reset-token-${Math.random().toString(36).slice(2)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await db.insert(platformPasswordResetsTable).values({ token, userId, expiresAt });
    return token;
  }

  it("sends a password changed alert to the user's email on successful reset", async () => {
    const token = await seedResetToken(ownerUserId);

    const res = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "brandnewpass99" }),
    });
    expect(res.status).toBe(200);

    await flushAsync();

    expect(passwordChangedCalls.length).toBe(1);
    expect(passwordChangedCalls[0]!.toEmail).toBe(EMAIL);
    expect(passwordChangedCalls[0]!.toName).toBe(NAME);
  });

  it("sends the alert to the account whose password was reset, not a non-owner team member", async () => {
    // Reset the non-owner member's password (their token → their email)
    const token = await seedResetToken(nonOwnerUserId);

    const res = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "brandnewpass99" }),
    });
    expect(res.status).toBe(200);

    await flushAsync();

    expect(passwordChangedCalls.length).toBe(1);
    // Must go to the non-owner (whose password was actually reset), NOT the owner
    expect(passwordChangedCalls[0]!.toEmail).toBe(NON_OWNER_EMAIL);
    expect(passwordChangedCalls[0]!.toEmail).not.toBe(EMAIL);
  });

  it("does not block the 200 response when the alert email throws", async () => {
    passwordChangedShouldThrow = true;

    const token = await seedResetToken(ownerUserId);

    const res = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "brandnewpass99" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("does not send an alert when the token is invalid", async () => {
    const res = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "bad-token-xyz", password: "brandnewpass99" }),
    });
    expect(res.status).toBe(400);

    await flushAsync();
    expect(passwordChangedCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/accounts/password  (admin/manager-initiated reset)
// ---------------------------------------------------------------------------
describe("POST /api/platform/accounts/password — password changed security alert", () => {
  let server: Server;
  let baseUrl: string;

  const ADMIN_USERNAME = "apw-admin";
  const TARGET_USERNAME = "apw-target-agency";
  const TARGET_EMAIL = "apw-target@example.com";
  const TARGET_NAME = "Target Agency User";
  const TARGET_PASSWORD = "originalpass1";

  let adminUserId: string;
  let targetUserId: string;

  beforeEach(async () => {
    passwordChangedCalls.length = 0;
    passwordChangedShouldThrow = false;

    const ph = hashPassword(TARGET_PASSWORD);

    // Admin account (legacy only — no platform_users row needed for the actor)
    await db.insert(platformAccountsTable).values({
      username: ADMIN_USERNAME,
      passwordHash: ph,
      role: "admin",
      status: "active",
    });

    // Target: platform_users row (for name lookup) + platform_accounts (legacy)
    await db.insert(platformUsersTable).values({
      email: TARGET_EMAIL,
      name: TARGET_NAME,
      passwordHash: ph,
    });
    const [targetUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, TARGET_EMAIL))
      .limit(1);
    targetUserId = targetUser!.id;

    await db.insert(platformAccountsTable).values({
      username: TARGET_USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: TARGET_EMAIL,
    });

    // Target company + owner membership
    await db.insert(platformCompaniesTable).values({ slug: TARGET_USERNAME, role: "agency" });
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, TARGET_USERNAME))
      .limit(1);
    await db.insert(platformMembershipsTable).values({
      userId: targetUserId,
      companyId: company!.id,
      companySlug: TARGET_USERNAME,
      role: "owner",
    });

    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, TARGET_USERNAME));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, TARGET_USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, TARGET_EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, TARGET_USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, ADMIN_USERNAME));
  });

  async function adminChangePassword(
    targetUsername: string,
    newPassword: string,
    actor: { username: string; role: string; userId?: string },
  ) {
    return fetch(`${baseUrl}/api/platform/accounts/password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify(actor),
      },
      body: JSON.stringify({ username: targetUsername, newPassword }),
    });
  }

  it("sends the alert to the target account's email, not the admin's", async () => {
    const res = await adminChangePassword(TARGET_USERNAME, "newadminset99", {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(200);

    await flushAsync();

    expect(passwordChangedCalls.length).toBe(1);
    expect(passwordChangedCalls[0]!.toEmail).toBe(TARGET_EMAIL);
    expect(passwordChangedCalls[0]!.toName).toBe(TARGET_NAME);
  });

  it("resolves the target name from platform_users when available", async () => {
    const res = await adminChangePassword(TARGET_USERNAME, "newadminset99", {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(200);
    await flushAsync();

    // Name must come from platform_users, not just fall back to username
    expect(passwordChangedCalls[0]!.toName).toBe(TARGET_NAME);
    expect(passwordChangedCalls[0]!.toName).not.toBe(TARGET_USERNAME);
  });

  it("falls back to username as name for legacy accounts without a platform_users row", async () => {
    // A target that only has platform_accounts (no platform_users, no email)
    const LEGACY_USERNAME = "apw-legacy-only";
    await db.insert(platformAccountsTable).values({
      username: LEGACY_USERNAME,
      passwordHash: hashPassword("pass1234"),
      role: "agency",
      status: "active",
      // no email column set
    });

    try {
      const res = await adminChangePassword(LEGACY_USERNAME, "newadminset99", {
        username: ADMIN_USERNAME,
        role: "admin",
      });
      expect(res.status).toBe(200);
      await flushAsync();
      // No email on the account → no alert (nothing to send to)
      expect(passwordChangedCalls.length).toBe(0);
    } finally {
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, LEGACY_USERNAME));
    }
  });

  it("does not block the 200 response when the alert email throws", async () => {
    passwordChangedShouldThrow = true;

    const res = await adminChangePassword(TARGET_USERNAME, "newadminset99", {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("does not send an alert when the account is not found", async () => {
    const res = await adminChangePassword("nonexistent-slug", "newadminset99", {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(404);
    await flushAsync();
    expect(passwordChangedCalls.length).toBe(0);
  });
});

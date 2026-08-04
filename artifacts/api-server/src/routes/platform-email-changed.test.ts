import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// Hoisted captures — must be above all vi.mock calls
// ---------------------------------------------------------------------------
const emailChangedCalls = vi.hoisted(
  () => [] as Array<{ oldEmail: string; newEmail: string; toName: string }>,
);
let emailChangedShouldThrow = false;

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
  sendMfaChangedEmail: () => Promise.resolve(),
  sendPasswordChangedEmail: () => Promise.resolve(),
  sendEmailChangedEmail: (opts: { oldEmail: string; newEmail: string; toName: string }) => {
    if (emailChangedShouldThrow) throw new Error("simulated email failure");
    emailChangedCalls.push(opts);
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
// POST /api/platform/change-email  (self-service)
// ---------------------------------------------------------------------------
describe("POST /api/platform/change-email — self-service email change", () => {
  let server: Server;
  let baseUrl: string;

  const USERNAME = "ce-self-agency";
  const OLD_EMAIL = "ce-self-old@example.com";
  const NEW_EMAIL = "ce-self-new@example.com";
  const NAME = "Self Email User";
  const PASSWORD = "password123";

  let userId: string;

  beforeEach(async () => {
    emailChangedCalls.length = 0;
    emailChangedShouldThrow = false;

    const ph = hashPassword(PASSWORD);

    await db.insert(platformUsersTable).values({
      email: OLD_EMAIL,
      name: NAME,
      passwordHash: ph,
    });
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, OLD_EMAIL))
      .limit(1);
    userId = userRow!.id;

    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: OLD_EMAIL,
    });

    await db.insert(platformCompaniesTable).values({ slug: USERNAME, role: "agency" });
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, USERNAME))
      .limit(1);

    await db.insert(platformMembershipsTable).values({
      userId,
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
    // Clean up both possible email rows
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, OLD_EMAIL));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, NEW_EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
  });

  async function changeEmail(
    newEmail: string,
    account: { username: string; userId: string; role: string },
  ) {
    return fetch(`${baseUrl}/api/platform/change-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify(account),
      },
      body: JSON.stringify({ newEmail }),
    });
  }

  it("sends email changed alerts to BOTH old and new addresses on success", async () => {
    const res = await changeEmail(NEW_EMAIL, {
      username: USERNAME,
      userId,
      role: "agency",
    });
    expect(res.status).toBe(200);

    await flushAsync();

    expect(emailChangedCalls.length).toBe(1);
    expect(emailChangedCalls[0]!.oldEmail).toBe(OLD_EMAIL);
    expect(emailChangedCalls[0]!.newEmail).toBe(NEW_EMAIL);
    expect(emailChangedCalls[0]!.toName).toBe(NAME);
  });

  it("actually updates the email in platform_users", async () => {
    const res = await changeEmail(NEW_EMAIL, {
      username: USERNAME,
      userId,
      role: "agency",
    });
    expect(res.status).toBe(200);

    const [updated] = await db
      .select({ email: platformUsersTable.email })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, userId))
      .limit(1);
    expect(updated?.email).toBe(NEW_EMAIL);
  });

  it("actually updates the email in platform_accounts (legacy sync)", async () => {
    const res = await changeEmail(NEW_EMAIL, {
      username: USERNAME,
      userId,
      role: "agency",
    });
    expect(res.status).toBe(200);

    const [updated] = await db
      .select({ email: platformAccountsTable.email })
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, USERNAME))
      .limit(1);
    expect(updated?.email).toBe(NEW_EMAIL);
  });

  it("does not send alerts when the new email is the same as the current one", async () => {
    const res = await changeEmail(OLD_EMAIL, {
      username: USERNAME,
      userId,
      role: "agency",
    });
    expect(res.status).toBe(400);

    await flushAsync();
    expect(emailChangedCalls.length).toBe(0);
  });

  it("returns 409 when the new email is already registered", async () => {
    // Register the new email on a different account
    await db.insert(platformUsersTable).values({
      email: NEW_EMAIL,
      passwordHash: hashPassword("anotherpass"),
    });

    try {
      const res = await changeEmail(NEW_EMAIL, {
        username: USERNAME,
        userId,
        role: "agency",
      });
      expect(res.status).toBe(409);
      await flushAsync();
      expect(emailChangedCalls.length).toBe(0);
    } finally {
      await db.delete(platformUsersTable).where(eq(platformUsersTable.email, NEW_EMAIL));
    }
  });

  it("does not block the 200 response when the alert email throws", async () => {
    emailChangedShouldThrow = true;

    const res = await changeEmail(NEW_EMAIL, {
      username: USERNAME,
      userId,
      role: "agency",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 400 when the new email is invalid", async () => {
    const res = await changeEmail("not-an-email", {
      username: USERNAME,
      userId,
      role: "agency",
    });
    expect(res.status).toBe(400);
    await flushAsync();
    expect(emailChangedCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/accounts/email  (admin/manager-initiated)
// ---------------------------------------------------------------------------
describe("POST /api/platform/accounts/email — admin email change", () => {
  let server: Server;
  let baseUrl: string;

  const ADMIN_USERNAME = "ae-admin";
  const TARGET_USERNAME = "ae-target-agency";
  const TARGET_OLD_EMAIL = "ae-target-old@example.com";
  const TARGET_NEW_EMAIL = "ae-target-new@example.com";
  const TARGET_NAME = "Target Agency User";
  const TARGET_PASSWORD = "targetpass1";

  let targetUserId: string;

  beforeEach(async () => {
    emailChangedCalls.length = 0;
    emailChangedShouldThrow = false;

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
      email: TARGET_OLD_EMAIL,
      name: TARGET_NAME,
      passwordHash: ph,
    });
    const [targetUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, TARGET_OLD_EMAIL))
      .limit(1);
    targetUserId = targetUser!.id;

    await db.insert(platformAccountsTable).values({
      username: TARGET_USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: TARGET_OLD_EMAIL,
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
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, TARGET_USERNAME));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, TARGET_USERNAME));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, TARGET_USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, TARGET_OLD_EMAIL));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, TARGET_NEW_EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, TARGET_USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, ADMIN_USERNAME));
  });

  async function adminChangeEmail(
    targetUsername: string,
    newEmail: string,
    actor: { username: string; role: string; userId?: string },
  ) {
    return fetch(`${baseUrl}/api/platform/accounts/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify(actor),
      },
      body: JSON.stringify({ username: targetUsername, newEmail }),
    });
  }

  it("sends email changed alerts to BOTH old and new addresses on success", async () => {
    const res = await adminChangeEmail(TARGET_USERNAME, TARGET_NEW_EMAIL, {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(200);

    await flushAsync();

    expect(emailChangedCalls.length).toBe(1);
    expect(emailChangedCalls[0]!.oldEmail).toBe(TARGET_OLD_EMAIL);
    expect(emailChangedCalls[0]!.newEmail).toBe(TARGET_NEW_EMAIL);
  });

  it("actually updates the email in platform_accounts (legacy store)", async () => {
    const res = await adminChangeEmail(TARGET_USERNAME, TARGET_NEW_EMAIL, {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(200);

    const [updated] = await db
      .select({ email: platformAccountsTable.email })
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, TARGET_USERNAME))
      .limit(1);
    expect(updated?.email).toBe(TARGET_NEW_EMAIL);
  });

  it("actually updates the email in platform_users (primary store)", async () => {
    const res = await adminChangeEmail(TARGET_USERNAME, TARGET_NEW_EMAIL, {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(200);

    const [updated] = await db
      .select({ email: platformUsersTable.email })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, targetUserId))
      .limit(1);
    expect(updated?.email).toBe(TARGET_NEW_EMAIL);
  });

  it("does not send alerts when the email is unchanged (same address)", async () => {
    const res = await adminChangeEmail(TARGET_USERNAME, TARGET_OLD_EMAIL, {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    // No-op — same email → 200 OK but no alert
    expect(res.status).toBe(200);

    await flushAsync();
    expect(emailChangedCalls.length).toBe(0);
  });

  it("returns 409 when the new email is already registered on another account", async () => {
    // Register the new email on a different user
    await db.insert(platformUsersTable).values({
      email: TARGET_NEW_EMAIL,
      passwordHash: hashPassword("anotherpass"),
    });

    try {
      const res = await adminChangeEmail(TARGET_USERNAME, TARGET_NEW_EMAIL, {
        username: ADMIN_USERNAME,
        role: "admin",
      });
      expect(res.status).toBe(409);
      await flushAsync();
      expect(emailChangedCalls.length).toBe(0);
    } finally {
      await db.delete(platformUsersTable).where(eq(platformUsersTable.email, TARGET_NEW_EMAIL));
    }
  });

  it("does not block the 200 response when the alert email throws", async () => {
    emailChangedShouldThrow = true;

    const res = await adminChangeEmail(TARGET_USERNAME, TARGET_NEW_EMAIL, {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 404 when the target account is not found", async () => {
    const res = await adminChangeEmail("nonexistent-slug", TARGET_NEW_EMAIL, {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(404);
    await flushAsync();
    expect(emailChangedCalls.length).toBe(0);
  });

  it("returns 400 when the new email is invalid", async () => {
    const res = await adminChangeEmail(TARGET_USERNAME, "bad-email", {
      username: ADMIN_USERNAME,
      role: "admin",
    });
    expect(res.status).toBe(400);
    await flushAsync();
    expect(emailChangedCalls.length).toBe(0);
  });

  it("returns 403 when a non-manager tries to change another account's email", async () => {
    // Create a sibling account (agency cannot manage another agency's sub)
    const UNRELATED = "ae-unrelated-agency";
    await db.insert(platformAccountsTable).values({
      username: UNRELATED,
      passwordHash: hashPassword("pass1234"),
      role: "agency",
      status: "active",
    });

    try {
      const res = await adminChangeEmail(TARGET_USERNAME, TARGET_NEW_EMAIL, {
        username: UNRELATED,
        role: "agency",
      });
      expect(res.status).toBe(403);
      await flushAsync();
      expect(emailChangedCalls.length).toBe(0);
    } finally {
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, UNRELATED));
    }
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug varchar(64) NOT NULL UNIQUE,
      role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar(64),
      max_seats int,
      email varchar(255),
      website varchar(512),
      status varchar NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_memberships (
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL,
      role varchar NOT NULL DEFAULT 'owner',
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
  };
});

// Pass-through rate limiter — avoids the express-rate-limit in-memory store
// from interfering with repeated test requests.
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

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Prevent real emails firing during tests — all notify-email functions are no-ops
vi.mock("../lib/notify-email", () => ({
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
}));

import {
  db,
  platformUsersTable,
  platformAccountsTable,
  platformCompaniesTable,
  platformMembershipsTable,
  platformSessionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, getPrimaryMembership } from "../lib/platform-auth";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Inject a null account so requirePlatformAuth middleware (mocked) still
  // has req.account available for the rare routes that read it.
  app.use((req: any, _res: any, next: any) => {
    req.account = null;
    next();
  });
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

// ---------------------------------------------------------------------------
// POST /api/platform/login — integration tests
// ---------------------------------------------------------------------------
describe("POST /api/platform/login — new user-table auth path", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "login-test@example.com";
  const PASSWORD = "hunter2secure!";
  const USERNAME = "login-test-agency";

  beforeEach(async () => {
    // Seed a platform_accounts row that has an email set (triggers the
    // ensurePlatformUser path inside the legacy login branch).
    const ph = hashPassword(PASSWORD);
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: EMAIL,
    });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    // Clean up rows inserted by this test suite so tests are isolated.
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
  });

  it("returns 200 and account details on valid credentials", async () => {
    const res = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { account?: { username: string; role: string } };
    expect(body.account?.username).toBe(USERNAME);
    expect(body.account?.role).toBe("agency");
  });

  it("sets a session cookie on successful login", async () => {
    const res = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/aio_sid=/);
  });

  it("creates a platform_sessions row with userId set after legacy login with email", async () => {
    const res = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    expect(res.status).toBe(200);

    // The session row should exist and carry the userId that ensurePlatformUser created.
    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, USERNAME));

    expect(sessions.length).toBe(1);
    expect(sessions[0]!.userId).not.toBeNull();
    expect(typeof sessions[0]!.userId).toBe("string");
  });

  it("creates a platform_users row via ensurePlatformUser on first login", async () => {
    await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });

    const users = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL));

    expect(users.length).toBe(1);
    expect(users[0]!.email).toBe(EMAIL);
  });

  it("returns 401 on wrong password", async () => {
    const res = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: "wrong-password" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when username or password is missing", async () => {
    const res = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: USERNAME }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/login — new-path (platform_users as primary)
// ---------------------------------------------------------------------------
describe("POST /api/platform/login — platform_users primary path", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "primary-login@example.com";
  const PASSWORD = "secure-p4ssw0rd!";
  const USERNAME = "primary-login-co";

  beforeEach(async () => {
    const ph = hashPassword(PASSWORD);
    // Seed both platform_accounts (for status check) and the new-path tables.
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: EMAIL,
    });
    // Pre-create the platform_users row (simulates an already-backfilled account).
    await db.insert(platformUsersTable).values({
      email: EMAIL,
      name: "Primary Login User",
      passwordHash: ph,
    }).onConflictDoNothing();
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
  });

  it("authenticates via platform_users when it already has a password hash", async () => {
    const res = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { account?: { username: string } };
    expect(body.account?.username).toBe(USERNAME);
  });

  it("session row has userId from platform_users on new-path login", async () => {
    const [existingUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL));

    await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: PASSWORD }),
    });

    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, USERNAME));

    expect(sessions.length).toBe(1);
    expect(sessions[0]!.userId).toBe(existingUser!.id);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/signup — integration tests
// ---------------------------------------------------------------------------
describe("POST /api/platform/signup", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "signup-test@example.com";

  beforeEach(async () => {
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    // Clean up any rows created during signup tests.
    const users = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL));
    if (users.length > 0) {
      await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    }
    const accounts = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.email, EMAIL));
    for (const acc of accounts) {
      await db.delete(platformMembershipsTable).where(
        eq(platformMembershipsTable.companySlug, acc.username),
      );
      await db.delete(platformAccountsTable).where(
        eq(platformAccountsTable.username, acc.username),
      );
    }
  });

  async function signup(body: unknown) {
    const res = await fetch(`${baseUrl}/api/platform/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  }

  it("returns 201 with username and pending_approval status", async () => {
    const { status, body } = await signup({
      name: "Alice Agency",
      email: EMAIL,
      companyName: "Alice Corp",
      password: "supersecure123",
    });
    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    expect(typeof body.username).toBe("string");
    expect(body.status).toBe("pending_approval");
  });

  it("creates a platform_accounts row with status pending_approval", async () => {
    await signup({
      name: "Bob Builder",
      email: EMAIL,
      companyName: "Bob LLC",
      password: "supersecure123",
    });

    const accounts = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.email, EMAIL));

    expect(accounts.length).toBe(1);
    expect(accounts[0]!.status).toBe("pending_approval");
    expect(accounts[0]!.role).toBe("agency");
  });

  it("creates a platform_users row linked to the new account", async () => {
    const { body } = await signup({
      name: "Carol Company",
      email: EMAIL,
      companyName: "Carol Inc",
      password: "supersecure123",
    });

    const username = body.username as string;

    const users = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL));

    expect(users.length).toBe(1);
    expect(users[0]!.email).toBe(EMAIL);

    const memberships = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.companySlug, username));

    expect(memberships.length).toBe(1);
    expect(memberships[0]!.role).toBe("owner");
    expect(memberships[0]!.userId).toBe(users[0]!.id);
  });

  it("returns 409 when the email is already registered", async () => {
    await signup({
      name: "Dave Duplicate",
      email: EMAIL,
      companyName: "Dave Co",
      password: "supersecure123",
    });
    const { status } = await signup({
      name: "Dave Again",
      email: EMAIL,
      companyName: "Dave Again Co",
      password: "supersecure123",
    });
    expect(status).toBe(409);
  });

  it("returns 400 when required fields are missing", async () => {
    const { status } = await signup({ email: EMAIL, password: "supersecure123" });
    expect(status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const { status } = await signup({
      name: "Short Pass",
      email: EMAIL,
      companyName: "Short Co",
      password: "abc",
    });
    expect(status).toBe(400);
  });

  it("returns 400 when email is invalid", async () => {
    const { status } = await signup({
      name: "Bad Email",
      email: "not-an-email",
      companyName: "Bad Co",
      password: "supersecure123",
    });
    expect(status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/platform/auth/google/callback — OAuth integration tests
// ---------------------------------------------------------------------------
// The route calls fetch() twice: once to exchange the auth code for a token,
// and once to retrieve userinfo. We stub global fetch so that calls to
// googleapis.com are intercepted with controlled responses, while calls to
// localhost (the test server itself) pass through to the real network.
// ---------------------------------------------------------------------------
describe("GET /api/platform/auth/google/callback", () => {
  let server: Server;
  let baseUrl: string;
  const OAUTH_STATE = "test-csrf-state-123";
  const GOOGLE_EMAIL = "oauth-callback@example.com";
  const GOOGLE_NAME = "OAuth Callback User";
  const GOOGLE_ID = "google-sub-oauth-test";
  const ACCOUNT_SLUG = "oauth-callback-co";

  // Builds a fetch stub that intercepts Google's token and userinfo endpoints,
  // forwarding everything else to the original fetch (i.e. our test server).
  function makeFetchStub(
    tokenPayload: unknown,
    userInfoPayload: unknown,
    tokenStatusOk = true,
  ) {
    const realFetch = global.fetch;
    return vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify(tokenStatusOk ? tokenPayload : { error: "invalid_grant" }), {
          status: tokenStatusOk ? 200 : 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("googleapis.com/oauth2/v2/userinfo")) {
        return new Response(JSON.stringify(userInfoPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // All other calls (to our test server) go through normally.
      return realFetch(url, init);
    });
  }

  async function callCallback(overrides: Record<string, string> = {}) {
    const qs = new URLSearchParams({ state: OAUTH_STATE, code: "mock-auth-code", ...overrides });
    const res = await fetch(`${baseUrl}/api/platform/auth/google/callback?${qs}`, {
      redirect: "manual",
      headers: { Cookie: `aio_oauth_state=${OAUTH_STATE}` },
    });
    return res;
  }

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    // Clean up any rows created during this suite.
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, ACCOUNT_SLUG));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, ACCOUNT_SLUG));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, ACCOUNT_SLUG));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, GOOGLE_EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, ACCOUNT_SLUG));
  });

  it("redirects to /?oauth_status=ok for a returning user with an active account", async () => {
    // Seed an existing user + account so the callback finds a returning user.
    const ph = hashPassword("unused-pw");
    await db.insert(platformAccountsTable).values({
      username: ACCOUNT_SLUG,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: GOOGLE_EMAIL,
    });
    // Pre-create the platform_users row (simulates a backfilled account).
    await db.insert(platformUsersTable).values({
      email: GOOGLE_EMAIL,
      name: GOOGLE_NAME,
      googleId: GOOGLE_ID,
    }).onConflictDoNothing();

    vi.stubGlobal(
      "fetch",
      makeFetchStub(
        { access_token: "mock-access-token" },
        { email: GOOGLE_EMAIL, name: GOOGLE_NAME, id: GOOGLE_ID },
      ),
    );

    const res = await callCallback();
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("oauth_status=ok");
  });

  it("creates a platform_sessions row with userId after successful OAuth login", async () => {
    const ph = hashPassword("unused-pw");
    await db.insert(platformAccountsTable).values({
      username: ACCOUNT_SLUG,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: GOOGLE_EMAIL,
    });

    vi.stubGlobal(
      "fetch",
      makeFetchStub(
        { access_token: "mock-access-token" },
        { email: GOOGLE_EMAIL, name: GOOGLE_NAME, id: GOOGLE_ID },
      ),
    );

    await callCallback();

    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, ACCOUNT_SLUG));

    expect(sessions.length).toBe(1);
    expect(sessions[0]!.userId).not.toBeNull();
  });

  it("creates a platform_users row for a first-time Google sign-in on an existing account", async () => {
    // Account exists in platform_accounts but has NO platform_users row yet.
    const ph = hashPassword("unused-pw");
    await db.insert(platformAccountsTable).values({
      username: ACCOUNT_SLUG,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: GOOGLE_EMAIL,
    });

    vi.stubGlobal(
      "fetch",
      makeFetchStub(
        { access_token: "mock-access-token" },
        { email: GOOGLE_EMAIL, name: GOOGLE_NAME, id: GOOGLE_ID },
      ),
    );

    await callCallback();

    const users = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, GOOGLE_EMAIL));

    expect(users.length).toBe(1);
    expect(users[0]!.email).toBe(GOOGLE_EMAIL);
    expect(users[0]!.googleId).toBe(GOOGLE_ID);
  });

  it("redirects to /?oauth_status=pending for a brand-new Google sign-up (no account)", async () => {
    // No account in the DB — this is a first-time Google user.
    vi.stubGlobal(
      "fetch",
      makeFetchStub(
        { access_token: "mock-access-token" },
        { email: "brand-new@example.com", name: "Brand New", id: "google-brand-new" },
      ),
    );

    const qs = new URLSearchParams({ state: OAUTH_STATE, code: "mock-auth-code" });
    const res = await fetch(`${baseUrl}/api/platform/auth/google/callback?${qs}`, {
      redirect: "manual",
      headers: { Cookie: `aio_oauth_state=${OAUTH_STATE}` },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("oauth_status=pending");

    // Cleanup the auto-created account row.
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.email, "brand-new@example.com"));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, "brand-new@example.com"));
  });

  it("matches an existing user by googleId when their Google email has changed", async () => {
    // Simulates a user who changed their email address in Google. The
    // platform_users row still has the OLD email, but the same stable
    // googleId. The callback must resolve identity via googleId (not email)
    // and route the user to their existing workspace without creating a
    // duplicate platform_users row.
    const OLD_EMAIL = "old-email-changed@example.com";
    const NEW_EMAIL = "new-email-changed@example.com";
    const EMAIL_CHANGE_GOOGLE_ID = "google-sub-email-change-test";
    const EMAIL_CHANGE_SLUG = "email-change-co";

    const ph = hashPassword("unused-pw");
    await db.insert(platformAccountsTable).values({
      username: EMAIL_CHANGE_SLUG,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: OLD_EMAIL,
    });
    await db.insert(platformCompaniesTable).values({
      slug: EMAIL_CHANGE_SLUG,
      role: "agency",
    });
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, EMAIL_CHANGE_SLUG));
    const [user] = await db
      .insert(platformUsersTable)
      .values({
        email: OLD_EMAIL,
        name: "Email Change User",
        googleId: EMAIL_CHANGE_GOOGLE_ID,
      })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: user!.id,
      companyId: company!.id,
      companySlug: EMAIL_CHANGE_SLUG,
      role: "owner",
    });

    vi.stubGlobal(
      "fetch",
      makeFetchStub(
        { access_token: "mock-access-token" },
        { email: NEW_EMAIL, name: "Email Change User", id: EMAIL_CHANGE_GOOGLE_ID },
      ),
    );

    try {
      const res = await callCallback();
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("oauth_status=ok");

      // Still matched via googleId — no duplicate platform_users row created
      // for the new email address.
      const usersByGoogleId = await db
        .select()
        .from(platformUsersTable)
        .where(eq(platformUsersTable.googleId, EMAIL_CHANGE_GOOGLE_ID));
      expect(usersByGoogleId.length).toBe(1);
      expect(usersByGoogleId[0]!.id).toBe(user!.id);

      // Routed to their existing workspace/company via the session.
      const sessions = await db
        .select()
        .from(platformSessionsTable)
        .where(eq(platformSessionsTable.username, EMAIL_CHANGE_SLUG));
      expect(sessions.length).toBe(1);
      expect(sessions[0]!.userId).toBe(user!.id);
    } finally {
      await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, EMAIL_CHANGE_SLUG));
      await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, EMAIL_CHANGE_SLUG));
      await db.delete(platformUsersTable).where(eq(platformUsersTable.googleId, EMAIL_CHANGE_GOOGLE_ID));
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, EMAIL_CHANGE_SLUG));
      await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, EMAIL_CHANGE_SLUG));
    }
  });

  it("redirects with invalid_state error when CSRF state does not match", async () => {
    vi.stubGlobal("fetch", makeFetchStub({}, {}));

    const qs = new URLSearchParams({ state: "wrong-state", code: "mock-auth-code" });
    const res = await fetch(`${baseUrl}/api/platform/auth/google/callback?${qs}`, {
      redirect: "manual",
      headers: { Cookie: `aio_oauth_state=${OAUTH_STATE}` },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("invalid_state");
  });

  it("redirects with token_exchange_failed when Google's token endpoint returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchStub({ error: "invalid_grant" }, {}, false /* tokenStatusOk=false */),
    );

    const res = await callCallback();
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("token_exchange_failed");
  });

  it("redirects with not_configured error when OAuth env vars are absent", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    vi.stubGlobal("fetch", makeFetchStub({}, {}));

    const res = await callCallback();
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("not_configured");
  });

  it("blocks a suspended account re-authenticating via Google (session expired, re-login attempted)", async () => {
    // Seed a suspended platform_accounts row plus a matching platform_users
    // row with googleId already set (simulates a previously-linked Google
    // user whose account was suspended after their session expired).
    const ph = hashPassword("unused-pw");
    await db.insert(platformAccountsTable).values({
      username: ACCOUNT_SLUG,
      passwordHash: ph,
      role: "agency",
      status: "suspended",
      email: GOOGLE_EMAIL,
    });
    await db.insert(platformUsersTable).values({
      email: GOOGLE_EMAIL,
      name: GOOGLE_NAME,
      googleId: GOOGLE_ID,
    }).onConflictDoNothing();
    const [user] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, GOOGLE_EMAIL));

    await db.insert(platformCompaniesTable).values({
      slug: ACCOUNT_SLUG,
      role: "agency",
      status: "suspended",
      email: GOOGLE_EMAIL,
    }).onConflictDoNothing();
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, ACCOUNT_SLUG));

    if (!user || !company) {
      throw new Error("Test setup failed: expected user and company rows to exist");
    }
    await db.insert(platformMembershipsTable).values({
      userId: user.id,
      companyId: company.id,
      companySlug: ACCOUNT_SLUG,
      role: "owner",
    }).onConflictDoNothing();

    // Guard the intended branch coverage: this test must exercise the
    // existing-user + membership path (platform.ts ~line 592-605), not the
    // legacy email-fallback path, so confirm the membership actually exists
    // before invoking the callback.
    const membershipCheck = await getPrimaryMembership(user.id);
    if (!membershipCheck) {
      throw new Error("Test setup failed: expected membership row to exist");
    }

    vi.stubGlobal(
      "fetch",
      makeFetchStub(
        { access_token: "mock-access-token" },
        { email: GOOGLE_EMAIL, name: GOOGLE_NAME, id: GOOGLE_ID },
      ),
    );

    const res = await callCallback();

    // The route should still resolve the correct Google identity...
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    // ...but must redirect to the suspended state, never a successful login.
    expect(location).toContain("oauth_status=suspended");
    expect(location).not.toContain("oauth_status=ok");

    // No session should have been created for the suspended account.
    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, ACCOUNT_SLUG));
    expect(sessions.length).toBe(0);
  });
});

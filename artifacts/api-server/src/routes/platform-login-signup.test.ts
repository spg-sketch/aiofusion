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

// Captured sendPasswordResetEmail calls (hoisted so the mock factory sees it).
const passwordResetEmails = vi.hoisted(() => [] as { toEmail: string; toName: string; resetUrl: string }[]);

// Forward-compatible notify-email mock: auto-wraps every exported async function
// as a no-op so new functions added by future tasks never cause "X is not a
// function" failures. Only sendPasswordResetEmail is overridden with a spy.
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
  mock.sendPasswordResetEmail = (...args: unknown[]) => {
    passwordResetEmails.push(args[0] as { toEmail: string; toName: string; resetUrl: string });
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
  platformSessionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, getPrimaryMembership, getPlatformSessionId, getPlatformSessionAccount } from "../lib/platform-auth";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  // URL-encoded body parsing is required for the OAuth POST callback (the
  // interstitial auto-submits code+state as application/x-www-form-urlencoded).
  app.use(express.urlencoded({ extended: false }));
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
    return { status: res.status, body: await res.json() as Record<string, unknown>, setCookies: res.headers.getSetCookie?.() ?? [] };
  }

  it("returns 201 with needsVerification:true and email (no session cookie)", async () => {
    const { status, body, setCookies } = await signup({
      name: "Alice Agency",
      email: EMAIL,
      companyName: "Alice Corp",
      password: "supersecure123",
    });
    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    // Email verification is now required — no immediate session.
    expect(body.needsVerification).toBe(true);
    expect(body.email).toBe(EMAIL);
    expect(setCookies.some((c) => c.startsWith("aio_sid="))).toBe(false);
  });

  it("creates a platform_accounts row with status active (no approval gate)", async () => {
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
    expect(accounts[0]!.status).toBe("active");
    expect(accounts[0]!.role).toBe("agency");
  });

  it("creates a platform_users row linked to the new account", async () => {
    await signup({
      name: "Carol Company",
      email: EMAIL,
      companyName: "Carol Inc",
      password: "supersecure123",
    });

    // Look up the company slug from the accounts table (body no longer returns it).
    const accounts = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.email, EMAIL));
    expect(accounts.length).toBe(1);
    const username = accounts[0]!.username;

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
  // tokenError: when set, returned as the error body (and status 400) instead
  // of the token payload. Defaults to "invalid_client" so the route maps it to
  // token_exchange_failed (not code_already_used which is reserved for "invalid_grant").
  function makeFetchStub(
    tokenPayload: unknown,
    userInfoPayload: unknown,
    tokenStatusOk = true,
    tokenError = "invalid_client",
  ) {
    const realFetch = global.fetch;
    return vi.fn(async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify(tokenStatusOk ? tokenPayload : { error: tokenError }), {
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

  // The GET callback now serves an interstitial; the actual code redemption
  // happens via POST. callCallback sends the code+state as a form-encoded body.
  async function callCallback(overrides: Record<string, string> = {}) {
    const body = { state: OAUTH_STATE, code: "mock-auth-code", ...overrides };
    const res = await fetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: `aio_oauth_state=${OAUTH_STATE}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
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

  it("registers and immediately logs in a brand-new Google sign-up (redirects to oauth_status=ok)", async () => {
    // No account in the DB — this is a first-time Google user. They should be
    // created as active and redirected to oauth_status=ok, not oauth_status=pending.
    vi.stubGlobal(
      "fetch",
      makeFetchStub(
        { access_token: "mock-access-token" },
        { email: "brand-new@example.com", name: "Brand New", id: "google-brand-new" },
      ),
    );

    const res = await fetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: `aio_oauth_state=${OAUTH_STATE}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ state: OAUTH_STATE, code: "mock-auth-code" }).toString(),
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("oauth_status=ok");
    // Must set a session cookie so the user is immediately logged in.
    const allCookies = res.headers.getSetCookie?.() ?? [];
    expect(allCookies.some((c) => c.startsWith("aio_sid="))).toBe(true);

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

    const res = await fetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Cookie: `aio_oauth_state=${OAUTH_STATE}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ state: "wrong-state", code: "mock-auth-code" }).toString(),
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

// ---------------------------------------------------------------------------
// Password reset flow
// ---------------------------------------------------------------------------
describe("POST /api/platform/forgot-password + reset-password", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "reset-test@example.com";
  const OLD_PASSWORD = "oldpassword123!";
  const NEW_PASSWORD = "newpassword456!";
  const USERNAME = "reset-test-agency";
  let userId: string;

  beforeEach(async () => {
    passwordResetEmails.length = 0;
    const ph = hashPassword(OLD_PASSWORD);
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: EMAIL,
    });
    const [company] = await db
      .insert(platformCompaniesTable)
      .values({ slug: USERNAME, role: "agency", status: "active", email: EMAIL })
      .returning({ id: platformCompaniesTable.id });
    const [user] = await db
      .insert(platformUsersTable)
      .values({ email: EMAIL, name: "Reset Tester", passwordHash: ph, emailVerified: true })
      .returning({ id: platformUsersTable.id });
    userId = user.id;
    await db.insert(platformMembershipsTable).values({
      userId,
      companyId: company.id,
      companySlug: USERNAME,
      role: "owner",
    });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
    vi.unstubAllGlobals();
  });

  async function requestReset(email: string) {
    return fetch(`${baseUrl}/api/platform/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  async function getIssuedToken(): Promise<string> {
    const { platformPasswordResetsTable } = (await import("@workspace/db")) as any;
    const rows = await db
      .select()
      .from(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, userId));
    expect(rows.length).toBe(1);
    return rows[0].token as string;
  }

  it("returns the identical response whether or not the email exists", async () => {
    const known = await requestReset(EMAIL);
    const unknown = await requestReset("nobody-here@example.com");
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const knownBody = await known.json();
    const unknownBody = await unknown.json();
    expect(knownBody).toEqual({ ok: true });
    expect(unknownBody).toEqual(knownBody);
    // Email only actually sent for the registered address.
    expect(passwordResetEmails.length).toBe(1);
    expect(passwordResetEmails[0].toEmail).toBe(EMAIL);
    expect(passwordResetEmails[0].resetUrl).toContain("reset_token=");
  });

  it("resets the password with a valid token, revokes sessions, and blocks token reuse", async () => {
    // Sign in first so there's a live session to revoke.
    const loginRes = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: OLD_PASSWORD }),
    });
    expect(loginRes.status).toBe(200);

    await requestReset(EMAIL);
    const token = await getIssuedToken();

    const resetRes = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: NEW_PASSWORD }),
    });
    expect(resetRes.status).toBe(200);
    expect(await resetRes.json()).toEqual({ ok: true });

    // All sessions revoked and session_version bumped.
    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, USERNAME));
    expect(sessions.length).toBe(0);
    const [user] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, userId));
    expect(user.sessionVersion).toBe(1);

    // Old password no longer works; new one does (email + legacy slug login).
    const oldLogin = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: OLD_PASSWORD }),
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: NEW_PASSWORD }),
    });
    expect(newLogin.status).toBe(200);
    const slugLogin = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: NEW_PASSWORD }),
    });
    expect(slugLogin.status).toBe(200);

    // Single use: the same token is rejected the second time.
    const reuse = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "anotherpassword789!" }),
    });
    expect(reuse.status).toBe(400);
  });

  it("only lets one of two concurrent requests consume the same token", async () => {
    await requestReset(EMAIL);
    const token = await getIssuedToken();

    const attempt = (password: string) =>
      fetch(`${baseUrl}/api/platform/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
    const [a, b] = await Promise.all([attempt("concurrentpass1!"), attempt("concurrentpass2!")]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);
  });

  it("revokes legacy sessions (user_id = NULL) bound to the account slug", async () => {
    // Legacy session created before the users table existed: no userId, so the
    // session_version fast-path check is skipped for it.
    await db.insert(platformSessionsTable).values({
      sid: "legacy-reset-session-sid",
      username: USERNAME,
      userId: null,
      sessionVersion: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await requestReset(EMAIL);
    const token = await getIssuedToken();
    const resetRes = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: NEW_PASSWORD }),
    });
    expect(resetRes.status).toBe(200);

    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, USERNAME));
    expect(sessions.length).toBe(0);
  });

  it("rejects expired tokens and short passwords", async () => {
    await requestReset(EMAIL);
    const token = await getIssuedToken();

    // Too-short password.
    const shortRes = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "short" }),
    });
    expect(shortRes.status).toBe(400);

    // Force-expire the token.
    const { platformPasswordResetsTable } = (await import("@workspace/db")) as any;
    await db
      .update(platformPasswordResetsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformPasswordResetsTable.token, token));
    const expiredRes = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: NEW_PASSWORD }),
    });
    expect(expiredRes.status).toBe(400);

    // Bogus token.
    const bogusRes = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token", password: NEW_PASSWORD }),
    });
    expect(bogusRes.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/change-password — signed-in credential change
// ---------------------------------------------------------------------------
describe("POST /api/platform/change-password", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "change-test@example.com";
  const OLD_PASSWORD = "oldpassword123!";
  const NEW_PASSWORD = "newpassword456!";
  const USERNAME = "change-test-agency";
  let userId: string;

  // The shared buildApp injects req.account = null, but change-password needs
  // a real signed-in account — so this suite resolves the session cookie /
  // Bearer sid like production's resolvePlatformAccount does.
  async function startAuthedServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(async (req: any, _res: any, next: any) => {
      const sid = getPlatformSessionId(req);
      req.account = sid ? await getPlatformSessionAccount(sid) : null;
      next();
    });
    app.use("/api", platformRouter);
    return new Promise((resolve) => {
      const s = app.listen(0, () => {
        resolve({ server: s, baseUrl: `http://127.0.0.1:${(s.address() as AddressInfo).port}` });
      });
    });
  }

  beforeEach(async () => {
    const ph = hashPassword(OLD_PASSWORD);
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: ph,
      role: "agency",
      status: "active",
      email: EMAIL,
    });
    const [company] = await db
      .insert(platformCompaniesTable)
      .values({ slug: USERNAME, role: "agency", status: "active", email: EMAIL })
      .returning({ id: platformCompaniesTable.id });
    const [user] = await db
      .insert(platformUsersTable)
      .values({ email: EMAIL, name: "Change Tester", passwordHash: ph, emailVerified: true })
      .returning({ id: platformUsersTable.id });
    userId = user.id;
    await db.insert(platformMembershipsTable).values({
      userId,
      companyId: company.id,
      companySlug: USERNAME,
      role: "owner",
    });
    ({ server, baseUrl } = await startAuthedServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
    vi.unstubAllGlobals();
  });

  async function loginAndGetSid(password = OLD_PASSWORD): Promise<string> {
    const res = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const m = /aio_sid=([^;]+)/.exec(setCookie);
    expect(m).not.toBeNull();
    return m![1];
  }

  async function changePassword(sid: string, body: Record<string, unknown>) {
    return fetch(`${baseUrl}/api/platform/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sid}` },
      body: JSON.stringify(body),
    });
  }

  it("changes the password, keeps the current session, and revokes the others", async () => {
    const otherSid = await loginAndGetSid();
    const currentSid = await loginAndGetSid();

    const res = await changePassword(currentSid, {
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Current session survives with the bumped version; the other is gone.
    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, USERNAME));
    expect(sessions.length).toBe(1);
    expect(sessions[0].sid).toBe(currentSid);
    expect(sessions[0].sid).not.toBe(otherSid);
    const [user] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, userId));
    expect(user.sessionVersion).toBe(1);
    expect(sessions[0].sessionVersion).toBe(1);

    // The surviving session still authenticates.
    const stillAuthed = await changePassword(currentSid, {
      currentPassword: NEW_PASSWORD,
      newPassword: "yetanotherpass789!",
    });
    expect(stillAuthed.status).toBe(200);

    // Old password no longer works; latest one does (email + legacy slug login).
    const oldLogin = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: OLD_PASSWORD }),
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: "yetanotherpass789!" }),
    });
    expect(newLogin.status).toBe(200);
    const slugLogin = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: "yetanotherpass789!" }),
    });
    expect(slugLogin.status).toBe(200);
  });

  it("rejects a wrong current password and leaves credentials untouched", async () => {
    const sid = await loginAndGetSid();
    const res = await changePassword(sid, {
      currentPassword: "not-the-password",
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);

    // Old password still works; session untouched.
    const login = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: OLD_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const [user] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, userId));
    expect(user.sessionVersion).toBe(0);
  });

  it("rejects a missing current password and a too-short new password", async () => {
    const sid = await loginAndGetSid();
    const missing = await changePassword(sid, { newPassword: NEW_PASSWORD });
    expect(missing.status).toBe(400);
    const short = await changePassword(sid, { currentPassword: OLD_PASSWORD, newPassword: "short" });
    expect(short.status).toBe(400);
  });

  it("also revokes legacy sessions (user_id = NULL) bound to the account slug", async () => {
    const sid = await loginAndGetSid();
    await db.insert(platformSessionsTable).values({
      sid: "legacy-change-session-sid",
      username: USERNAME,
      userId: null,
      sessionVersion: null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await changePassword(sid, {
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);

    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, USERNAME));
    expect(sessions.length).toBe(1);
    expect(sessions[0].sid).toBe(sid);
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/request-set-password — first-password flow for SSO accounts
// ---------------------------------------------------------------------------
describe("POST /api/platform/request-set-password", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "sso-setpw-test@example.com";
  const USERNAME = "sso-setpw-agency";
  const NEW_PASSWORD = "brandnewpass123!";
  let userId: string;

  // Uses the same real-session middleware as the change-password suite so
  // requirePlatformAuth actually checks the cookie/bearer token.
  async function startAuthedServer(): Promise<{ server: Server; baseUrl: string }> {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(async (req: any, _res: any, next: any) => {
      const sid = getPlatformSessionId(req);
      req.account = sid ? await getPlatformSessionAccount(sid) : null;
      next();
    });
    app.use("/api", platformRouter);
    return new Promise((resolve) => {
      const s = app.listen(0, () => {
        resolve({ server: s, baseUrl: `http://127.0.0.1:${(s.address() as AddressInfo).port}` });
      });
    });
  }

  beforeEach(async () => {
    passwordResetEmails.length = 0;
    // SSO-only user: passwordHash is NULL, googleId set.
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: hashPassword("placeholder-not-used"),
      role: "agency",
      status: "active",
      email: EMAIL,
    });
    const [company] = await db
      .insert(platformCompaniesTable)
      .values({ slug: USERNAME, role: "agency", status: "active", email: EMAIL })
      .returning({ id: platformCompaniesTable.id });
    const [user] = await db
      .insert(platformUsersTable)
      .values({
        email: EMAIL,
        name: "SSO User",
        passwordHash: null,      // <-- SSO-only: no password
        googleId: "google-sub-sso-test",
        emailVerified: true,
      })
      .returning({ id: platformUsersTable.id });
    userId = user.id;
    await db.insert(platformMembershipsTable).values({
      userId,
      companyId: company.id,
      companySlug: USERNAME,
      role: "owner",
    });
    ({ server, baseUrl } = await startAuthedServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
    vi.unstubAllGlobals();
  });

  // Create a real session for the SSO user (they're already signed in via OAuth).
  async function createSsoSession(): Promise<string> {
    const { createPlatformSession: cps, setPlatformCookie: spc } = await import("../lib/platform-auth");
    void spc; // unused — we just need the sid
    const sid = await cps(USERNAME, "127.0.0.1", userId, undefined);
    return sid;
  }

  it("issues a reset token and emails the session user's address (happy path)", async () => {
    const sid = await createSsoSession();
    const res = await fetch(`${baseUrl}/api/platform/request-set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sid}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Token row created.
    const { platformPasswordResetsTable: prt } = (await import("@workspace/db")) as any;
    const rows = await db.select().from(prt).where(eq(prt.userId, userId));
    expect(rows.length).toBe(1);
    expect(rows[0].usedAt).toBeNull();

    // Email sent to the session user's address.
    expect(passwordResetEmails.length).toBe(1);
    expect(passwordResetEmails[0].toEmail).toBe(EMAIL);
    expect(passwordResetEmails[0].resetUrl).toContain("reset_token=");
  });

  it("returns 409 when the account already has a password set", async () => {
    // Give the user a password hash.
    await db
      .update(platformUsersTable)
      .set({ passwordHash: hashPassword("already-has-one!") })
      .where(eq(platformUsersTable.id, userId));

    const sid = await createSsoSession();
    const res = await fetch(`${baseUrl}/api/platform/request-set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sid}` },
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/change.password/i);

    // No email sent.
    expect(passwordResetEmails.length).toBe(0);
  });

  it("returns 401 when called without a session", async () => {
    const res = await fetch(`${baseUrl}/api/platform/request-set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("end-to-end: SSO user requests link, uses reset token, can then log in with email+password", async () => {
    const sid = await createSsoSession();

    // Step 1: request the set-password link.
    const reqRes = await fetch(`${baseUrl}/api/platform/request-set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sid}` },
    });
    expect(reqRes.status).toBe(200);

    // Step 2: extract the issued token from the DB.
    const { platformPasswordResetsTable: prt } = (await import("@workspace/db")) as any;
    const rows = await db.select().from(prt).where(eq(prt.userId, userId));
    expect(rows.length).toBe(1);
    const token = rows[0].token as string;

    // Step 3: use the token via the existing reset-password endpoint.
    const resetRes = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: NEW_PASSWORD }),
    });
    expect(resetRes.status).toBe(200);
    expect(await resetRes.json()).toEqual({ ok: true });

    // Step 4: platform_users.passwordHash is now set.
    const [user] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, userId));
    expect(user.passwordHash).not.toBeNull();

    // Step 5: platform_accounts hash also synced (dual-write).
    const [account] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, USERNAME));
    expect(account.passwordHash).not.toBeNull();

    // Step 6: can now sign in with email + new password.
    const loginRes = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: EMAIL, password: NEW_PASSWORD }),
    });
    expect(loginRes.status).toBe(200);

    // Step 7: slug login also works.
    const slugLogin = await fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USERNAME, password: NEW_PASSWORD }),
    });
    expect(slugLogin.status).toBe(200);
  });
});

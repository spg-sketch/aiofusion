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

vi.mock("../lib/admin-events", () => ({ logAdminEvent: () => Promise.resolve() }));
vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
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
  return mock;
});
vi.mock("../lib/team-invites", () => ({
  getValidInvite: () => Promise.resolve(null),
  consumeInvite: () => Promise.resolve(false),
}));
vi.mock("../lib/mfa", () => ({
  getMfaState: () => Promise.resolve(null),
  getMfaEnabledSet: () => Promise.resolve(new Set()),
  saveMfaState: () => Promise.resolve(),
  clearMfaState: () => Promise.resolve(),
  generateTotpSecret: () => "TESTSECRET",
  verifyTotp: () => false,
  buildOtpauthUrl: () => "otpauth://totp/test",
  generateRecoveryCodes: () => [],
  hashRecoveryCode: (c: string) => c,
  consumeRecoveryCode: () => null,
  createMfaPendingToken: () => "mfatoken",
  verifyMfaPendingToken: () => null,
  TRUSTED_DEVICE_COOKIE: "aio_trusted_device",
  TRUSTED_DEVICE_TTL_MS: 2592000000,
  isTrustedDevice: () => Promise.resolve(false),
  addTrustedDevice: () => Promise.resolve({ cookieValue: "x" }),
  listTrustedDevices: () => Promise.resolve([]),
  revokeTrustedDevice: () => Promise.resolve(false),
  clearTrustedDevices: () => Promise.resolve(),
  verifyTrustedDeviceToken: () => null,
}));

import {
  db,
  platformAccountsTable,
  platformSessionsTable,
  platformUsersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/platform-auth";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// App + server helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => { req.account = null; next(); });
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

/** Parse Set-Cookie headers into a name→value map. */
function parseCookies(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  (headers.getSetCookie?.() ?? []).forEach((raw) => {
    const [pair] = raw.split(";");
    if (!pair) return;
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) return;
    result[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
  });
  return result;
}

// ---------------------------------------------------------------------------
// Fetch stub helpers
//
// We capture `realFetch` once at module level (before any vi.stubGlobal calls)
// so tests can route localhost calls to the real network and intercept only
// calls to external OAuth endpoints. This mirrors the approach in
// platform-login-signup.test.ts and avoids the spy-counting-own-calls problem.
// ---------------------------------------------------------------------------
const realFetch = globalThis.fetch;

/** Build a fetch stub for Google OAuth endpoints. */
function makeGoogleStub(opts: {
  tokenOk?: boolean;
  tokenError?: string;
  accessToken?: string;
  email?: string;
  googleId?: string;
  name?: string;
  /** If true, track whether the token endpoint was ever called. */
  trackTokenCalls?: { called: boolean };
}) {
  const {
    tokenOk = true,
    tokenError = "invalid_client",
    accessToken = "ya29.mock_access_token",
    email = "user@example.com",
    googleId = "google-id-123",
    name = "Test User",
    trackTokenCalls,
  } = opts;

  return (async (url: any, init?: any): Promise<Response> => {
    const u = typeof url === "string" ? url : url?.toString() ?? "";
    if (u.includes("oauth2.googleapis.com/token")) {
      if (trackTokenCalls) trackTokenCalls.called = true;
      if (!tokenOk) {
        return new Response(JSON.stringify({ error: tokenError }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ access_token: accessToken }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("googleapis.com/oauth2/v2/userinfo")) {
      return new Response(JSON.stringify({ id: googleId, email, name }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return realFetch(url, init);
  }) as typeof fetch;
}

/** Build a fetch stub for Microsoft OAuth endpoints. */
function makeMicrosoftStub(opts: {
  tokenOk?: boolean;
  tokenError?: string;
  accessToken?: string;
  email?: string;
  microsoftId?: string;
  displayName?: string;
  trackTokenCalls?: { called: boolean };
}) {
  const {
    tokenOk = true,
    tokenError = "invalid_client",
    accessToken = "ms_mock_access_token",
    email = "user@example.com",
    microsoftId = "ms-id-123",
    displayName = "Test User",
    trackTokenCalls,
  } = opts;

  return (async (url: any, init?: any): Promise<Response> => {
    const u = typeof url === "string" ? url : url?.toString() ?? "";
    if (u.includes("microsoftonline.com") && u.includes("token")) {
      if (trackTokenCalls) trackTokenCalls.called = true;
      if (!tokenOk) {
        return new Response(JSON.stringify({ error: tokenError }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ access_token: accessToken }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("graph.microsoft.com")) {
      return new Response(JSON.stringify({ id: microsoftId, displayName, mail: email, userPrincipalName: email }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return realFetch(url, init);
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Google OAuth callback tests
// ---------------------------------------------------------------------------

describe("Google GET callback — scanner / bot guard", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.NODE_ENV = "test";
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer(server);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("Outlook Safe Links bot UA: returns 200 empty body, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker }));

    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?code=abc&state=def`,
      { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (compatible; SafeLinks/1.0)" } },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(tracker.called).toBe(false);
  });

  it("Teams link-preview bot UA: returns 200 empty body, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker }));

    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?code=abc&state=def`,
      { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 MicrosoftTeams/1.0 preview" } },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(tracker.called).toBe(false);
  });

  it("regular browser UA with valid state: serves interstitial HTML form, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker }));

    const code = "4%2F0google_code_example";
    const state = "deadbeef1234abcd";
    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?code=${encodeURIComponent(code)}&state=${state}`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
          cookie: `aio_oauth_state=${state}`,
        },
      },
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<form');
    expect(body).toContain('method="POST"');
    expect(body).toContain(`value="${code}"`);
    expect(body).toContain(`value="${state}"`);
    expect(tracker.called).toBe(false);

    // State cookie must NOT be cleared by the GET (Max-Age=0 absent).
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const cleared = setCookies.find(
      (c) => c.startsWith("aio_oauth_state=") && c.includes("Max-Age=0"),
    );
    expect(cleared).toBeUndefined();
  });

  it("GET with mismatched state: redirects to invalid_state, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker }));

    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?code=abc&state=wrong`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 Chrome/120",
          cookie: "aio_oauth_state=correct",
        },
      },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth_msg=invalid_state");
    expect(tracker.called).toBe(false);
  });

  it("GET with no code: redirects to no_code, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker }));

    const state = "abc123";
    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?state=${state}`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 Chrome/120",
          cookie: `aio_oauth_state=${state}`,
        },
      },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth_msg=no_code");
    expect(tracker.called).toBe(false);
  });

  it("GET with provider error param: propagates error, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker }));

    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?error=access_denied`,
      { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 Chrome/120" } },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth_msg=access_denied");
    expect(tracker.called).toBe(false);
  });

  it("interstitial safely encodes HTML-special chars in code and state values", async () => {
    vi.stubGlobal("fetch", makeGoogleStub({}));

    const code = 'code"with<special>';
    const state = "state&value=x";
    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 Chrome/120",
          cookie: `aio_oauth_state=${encodeURIComponent(state)}`,
        },
      },
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    // Raw unencoded unsafe chars must not appear inside attribute values.
    expect(body).not.toContain('value="code"with');
    expect(body).not.toContain("<special>");
    // Encoded forms must be present.
    expect(body).toContain("&quot;");
    expect(body).toContain("&lt;");
  });
});

// ---------------------------------------------------------------------------

describe("Google POST callback — code redemption", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "google-oauth-post@example.com";
  const USERNAME = "google-oauth-post-agency";
  const STATE = "csrf_google_post_state";

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.NODE_ENV = "test";
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: hashPassword("unused"),
      role: "agency",
      status: "active",
      email: EMAIL,
    });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer(server);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
  });

  /** POST the code+state to the callback, mimicking the interstitial auto-submit. */
  async function postCallback(code: string, state: string, stateCookie = state) {
    return realFetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_oauth_state=${stateCookie}`,
      },
      body: new URLSearchParams({ code, state }).toString(),
    });
  }

  it("prefetch-then-real-request: scanner GET followed by browser POST succeeds", async () => {
    const code = "valid_google_code_scanner_test";

    // Step 1: scanner / bot prefetches — no token call, interstitial served.
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker, email: EMAIL }));
    const scannerRes = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback?code=${code}&state=${STATE}`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "SafeLinks/1.0",
          cookie: `aio_oauth_state=${STATE}`,
        },
      },
    );
    expect(scannerRes.status).toBe(200);
    expect(tracker.called).toBe(false);

    // Step 2: real browser submits interstitial form via POST.
    vi.stubGlobal("fetch", makeGoogleStub({ email: EMAIL }));
    const postRes = await postCallback(code, STATE);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_status=ok");
    const cookies = parseCookies(postRes.headers);
    expect(cookies["aio_sid"]).toBeTruthy();
  });

  it("code_already_used: invalid_grant from Google → redirects with code_already_used", async () => {
    vi.stubGlobal("fetch", makeGoogleStub({ tokenOk: false, tokenError: "invalid_grant" }));
    const postRes = await postCallback("already_redeemed_code", STATE);
    expect(postRes.status).toBe(302);
    const location = postRes.headers.get("location") ?? "";
    expect(location).toContain("oauth_status=error");
    expect(location).toContain("oauth_msg=code_already_used");
  });

  it("token_exchange_failed: other provider error → redirects with token_exchange_failed (not code_already_used)", async () => {
    vi.stubGlobal("fetch", makeGoogleStub({ tokenOk: false, tokenError: "invalid_client" }));
    const postRes = await postCallback("bad_code", STATE);
    expect(postRes.status).toBe(302);
    const location = postRes.headers.get("location") ?? "";
    expect(location).toContain("oauth_msg=token_exchange_failed");
    expect(location).not.toContain("code_already_used");
  });

  it("POST with mismatched state: redirects to invalid_state, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeGoogleStub({ trackTokenCalls: tracker }));

    const postRes = await postCallback("abc", "wrong_state", "correct_state");
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_msg=invalid_state");
    expect(tracker.called).toBe(false);
  });

  it("successful POST: sets aio_sid session cookie and redirects to oauth_status=ok", async () => {
    vi.stubGlobal("fetch", makeGoogleStub({ email: EMAIL }));
    const postRes = await postCallback("valid_code_direct", STATE);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_status=ok");
    const cookies = parseCookies(postRes.headers);
    expect(cookies["aio_sid"]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Microsoft OAuth callback tests
// ---------------------------------------------------------------------------

describe("Microsoft GET callback — scanner / bot guard", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-ms-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "test-ms-client-secret";
    process.env.NODE_ENV = "test";
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer(server);
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
  });

  it("Outlook Safe Links bot UA: returns 200 empty body, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeMicrosoftStub({ trackTokenCalls: tracker }));

    const res = await realFetch(
      `${baseUrl}/api/platform/auth/microsoft/callback?code=abc&state=login:def`,
      { redirect: "manual", headers: { "user-agent": "Microsoft Outlook SafeLinks" } },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
    expect(tracker.called).toBe(false);
  });

  it("regular browser with valid state: serves interstitial HTML form preserving action prefix", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeMicrosoftStub({ trackTokenCalls: tracker }));

    const code = "ms_auth_code_456";
    const state = "login:deadbeef5678";
    const res = await realFetch(
      `${baseUrl}/api/platform/auth/microsoft/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 Chrome/120",
          cookie: `aio_ms_state=${encodeURIComponent(state)}`,
        },
      },
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('<form');
    expect(body).toContain('method="POST"');
    expect(body).toContain(`value="${code}"`);
    // state preserves the action prefix so POST can extract action from it
    expect(body).toContain("login:");
    expect(tracker.called).toBe(false);

    // State cookie must NOT be cleared by GET
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const cleared = setCookies.find(
      (c) => c.startsWith("aio_ms_state=") && c.includes("Max-Age=0"),
    );
    expect(cleared).toBeUndefined();
  });

  it("GET with mismatched state: redirects to state_mismatch, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeMicrosoftStub({ trackTokenCalls: tracker }));

    const res = await realFetch(
      `${baseUrl}/api/platform/auth/microsoft/callback?code=abc&state=login:wrong`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "Mozilla/5.0 Chrome/120",
          cookie: "aio_ms_state=login:correct",
        },
      },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth_msg=state_mismatch");
    expect(tracker.called).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("Microsoft POST callback — code redemption", () => {
  let server: Server;
  let baseUrl: string;
  const EMAIL = "ms-oauth-post@example.com";
  const USERNAME = "ms-oauth-post-agency";
  const STATE = "login:csrf_ms_post_state";

  beforeEach(async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-ms-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "test-ms-client-secret";
    process.env.NODE_ENV = "test";
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: hashPassword("unused"),
      role: "agency",
      status: "active",
      email: EMAIL,
    });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer(server);
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
  });

  async function postMsCallback(code: string, state: string, stateCookie = state) {
    return realFetch(`${baseUrl}/api/platform/auth/microsoft/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_ms_state=${encodeURIComponent(stateCookie)}`,
      },
      body: new URLSearchParams({ code, state }).toString(),
    });
  }

  it("prefetch-then-real-request: Teams scanner GET + browser POST succeeds", async () => {
    const code = "ms_valid_code_scanner_test";

    // Step 1: Teams/Outlook scans the callback URL.
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeMicrosoftStub({ trackTokenCalls: tracker, email: EMAIL }));
    const scannerRes = await realFetch(
      `${baseUrl}/api/platform/auth/microsoft/callback?code=${code}&state=${encodeURIComponent(STATE)}`,
      {
        redirect: "manual",
        headers: {
          "user-agent": "Microsoft Teams link preview bot",
          cookie: `aio_ms_state=${encodeURIComponent(STATE)}`,
        },
      },
    );
    expect(scannerRes.status).toBe(200);
    expect(tracker.called).toBe(false);

    // Step 2: real browser submits the interstitial form via POST.
    vi.stubGlobal("fetch", makeMicrosoftStub({ email: EMAIL }));
    const postRes = await postMsCallback(code, STATE);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_status=ok");
    const cookies = parseCookies(postRes.headers);
    expect(cookies["aio_sid"]).toBeTruthy();
  });

  it("code_already_used: invalid_grant from Microsoft → redirects with code_already_used", async () => {
    vi.stubGlobal("fetch", makeMicrosoftStub({ tokenOk: false, tokenError: "invalid_grant" }));
    const postRes = await postMsCallback("already_used_ms_code", STATE);
    expect(postRes.status).toBe(302);
    const location = postRes.headers.get("location") ?? "";
    expect(location).toContain("oauth_status=error");
    expect(location).toContain("oauth_msg=code_already_used");
  });

  it("token_exchange_failed: non-invalid_grant error → token_exchange_failed (not code_already_used)", async () => {
    vi.stubGlobal("fetch", makeMicrosoftStub({ tokenOk: false, tokenError: "invalid_client" }));
    const postRes = await postMsCallback("bad_ms_code", STATE);
    expect(postRes.status).toBe(302);
    const location = postRes.headers.get("location") ?? "";
    expect(location).toContain("oauth_msg=token_exchange_failed");
    expect(location).not.toContain("code_already_used");
  });

  it("POST with mismatched state: redirects to state_mismatch, token endpoint never called", async () => {
    const tracker = { called: false };
    vi.stubGlobal("fetch", makeMicrosoftStub({ trackTokenCalls: tracker }));

    const postRes = await postMsCallback("abc", "login:wrong_nonce", "login:correct_nonce");
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_msg=state_mismatch");
    expect(tracker.called).toBe(false);
  });

  it("successful POST: sets aio_sid session cookie and redirects to oauth_status=ok", async () => {
    vi.stubGlobal("fetch", makeMicrosoftStub({ email: EMAIL }));
    const postRes = await postMsCallback("valid_ms_code_direct", STATE);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_status=ok");
    const cookies = parseCookies(postRes.headers);
    expect(cookies["aio_sid"]).toBeTruthy();
  });
});

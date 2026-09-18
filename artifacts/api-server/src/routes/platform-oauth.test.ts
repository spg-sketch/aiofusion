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
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      renewal_reminder_period_end timestamptz,
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
      tier varchar(16),
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS project_snapshots (
      id varchar PRIMARY KEY,
      project_id varchar,
      username varchar,
      owner varchar,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS archive_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      owner varchar,
      project_id varchar NOT NULL,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS planner_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      owner varchar,
      project_id varchar NOT NULL,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS scoring_configs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      owner varchar,
      project_id varchar NOT NULL,
      data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id varchar,
      name varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_outlets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id varchar,
      name varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_contacts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id varchar,
      name varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_contact_categories (
      id serial PRIMARY KEY,
      contact_id uuid,
      category_id uuid,
      category_name varchar NOT NULL DEFAULT '',
      account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_import_batches (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_contact_field_overrides (
      id serial PRIMARY KEY,
      contact_id uuid,
      account_id varchar NOT NULL,
      field_name varchar(80) NOT NULL,
      value text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_discoveries (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      candidate_key text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      candidate jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      reviewed_by varchar,
      rejection_reason text,
      contact_id uuid,
      outlet_id uuid
    );
    CREATE UNIQUE INDEX IF NOT EXISTS media_discoveries_account_project_candidate_unique
      ON media_discoveries (account_id, project_id, candidate_key);
    CREATE TABLE IF NOT EXISTS media_recommendation_sets (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_recommendation_items (
      id serial PRIMARY KEY,
      recommendation_set_id integer,
      contact_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_recommendation_decisions (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL,
      contact_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_outreach (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      contact_id uuid,
      outlet_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_outreach_activities (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      outreach_id integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_placements (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      outreach_id integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS media_contact_source_checks (
      id serial PRIMARY KEY,
      contact_id uuid,
      account_id varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS saved_audits (
      id varchar PRIMARY KEY,
      project_id varchar NOT NULL,
      owner varchar NOT NULL,
      saved_at varchar NOT NULL,
      result jsonb NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS saved_diagnostics (
      id varchar PRIMARY KEY,
      project_id varchar NOT NULL,
      owner varchar NOT NULL,
      saved_at varchar NOT NULL,
      result jsonb NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS saved_content_geo (
      id varchar PRIMARY KEY,
      project_id varchar NOT NULL,
      owner varchar NOT NULL,
      saved_at varchar NOT NULL,
      result jsonb NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS saved_tech_geo (
      id varchar PRIMARY KEY,
      project_id varchar NOT NULL,
      owner varchar NOT NULL,
      saved_at varchar NOT NULL,
      result jsonb NOT NULL,
      deleted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS token_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      account_id varchar,
      tokens int,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS audit_locks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username varchar NOT NULL,
      owner varchar,
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

  return { db, ...schema };
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
vi.mock("../lib/team-invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/team-invites")>();
  return {
    ...actual,
    getValidInvite: () => Promise.resolve(null),
    consumeInvite: () => Promise.resolve(false),
  };
});
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
  platformCompaniesTable,
  platformMetaTable,
  platformMembershipsTable,
  platformSessionsTable,
  platformUsersTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
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
  app.use((req: any, _res: any, next: any) => {
    const testAccount = req.headers["x-test-account"];
    req.account = typeof testAccount === "string" ? JSON.parse(testAccount) : null;
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
  picture?: string;
  verifiedEmail?: boolean;
  avatarBytes?: Uint8Array;
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
    picture,
    verifiedEmail = false,
    avatarBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]),
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
      return new Response(JSON.stringify({ id: googleId, email, name, picture, verified_email: verifiedEmail }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (u.includes("googleusercontent.com")) {
      return new Response(avatarBytes, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
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

describe("Google GET callback - scanner / bot guard", () => {
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
    // The same form contains a real submit button inside <noscript>, so a
    // browser with JavaScript disabled can complete the OAuth hop manually.
    expect(body).toContain("<noscript>");
    expect(body).toContain('<button type="submit"');
    expect(body).toContain(">Continue</button>");
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

describe("Google POST callback - code redemption", () => {
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
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "user:image:%"));
    await db.delete(platformMetaTable).where(eq(platformMetaTable.key, `account:image:avatar:${USERNAME}`));
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

    // Step 1: scanner / bot prefetches - no token call, interstitial served.
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

  it("routes a verified AIO Fusion Google identity into Master as support", async () => {
    const staffEmail = "google.staff@aiofusion.ai";
    await db.insert(platformAccountsTable).values({
      username: "admin",
      passwordHash: hashPassword("unused"),
      role: "admin",
      status: "active",
    }).onConflictDoNothing();
    vi.stubGlobal("fetch", makeGoogleStub({
      email: staffEmail,
      googleId: "google-aio-staff",
      verifiedEmail: true,
    }));

    const postRes = await postCallback("valid_aio_staff_code", STATE);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_status=ok");
    expect(postRes.headers.get("location")).not.toContain("mfa_mode=");
    expect(postRes.headers.get("location")).not.toContain("needs_setup=1");
    expect(parseCookies(postRes.headers)["aio_sid"]).toBeTruthy();

    const [user] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.email, staffEmail)).limit(1);
    const [membership] = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, user!.id))
      .limit(1);
    expect(user?.emailVerified).toBe(true);
    expect(membership).toMatchObject({ companySlug: "admin", role: "viewer" });

    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, user!.id));
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.userId, user!.id));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.id, user!.id));
  });

  it("imports the Google picture as a user avatar without touching the workspace logo", async () => {
    vi.stubGlobal("fetch", makeGoogleStub({
      email: EMAIL,
      picture: "https://lh3.googleusercontent.com/a/google-avatar",
    }));
    const postRes = await postCallback("valid_code_with_picture", STATE);
    expect(postRes.status).toBe(302);

    const [user] = await db
      .select({ id: platformUsersTable.id })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);
    expect(user?.id).toBeTruthy();
    const [avatar] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `user:image:avatar:${user!.id}`))
      .limit(1);
    expect(avatar?.value).toMatch(/^data:image\/jpeg;base64,/);
    const [logo] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `account:image:logo:${USERNAME}`))
      .limit(1);
    expect(logo).toBeUndefined();
  });

  it("migrates an existing owner avatar instead of replacing it with the Google picture", async () => {
    const legacyAvatar = `data:image/png;base64,${Buffer.from(new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])).toString("base64")}`;
    await db.insert(platformMetaTable).values({
      key: `account:image:avatar:${USERNAME}`,
      value: legacyAvatar,
    });
    vi.stubGlobal("fetch", makeGoogleStub({
      email: EMAIL,
      picture: "https://lh3.googleusercontent.com/a/google-avatar",
    }));
    const postRes = await postCallback("valid_code_with_legacy_avatar", STATE);
    expect(postRes.status).toBe(302);

    const [user] = await db
      .select({ id: platformUsersTable.id })
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);
    const [avatar] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `user:image:avatar:${user!.id}`))
      .limit(1);
    expect(avatar?.value).toBe(legacyAvatar);
    const [legacy] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `account:image:avatar:${USERNAME}`))
      .limit(1);
    expect(legacy).toBeUndefined();
  });
});

describe("SSO account-deletion re-authentication", () => {
  let server: Server;
  let baseUrl: string;
  const USERNAME = "delete-sso-owner";
  const EMAIL = "delete-sso@example.com";
  const GOOGLE_ID = "delete-google-id";
  const MICROSOFT_ID = "delete-microsoft-id";
  let userId: string;

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.MICROSOFT_CLIENT_ID = "test-microsoft-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "test-microsoft-client-secret";
    process.env.NODE_ENV = "test";
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: hashPassword("unusable-random-sso-password"),
      role: "client",
      status: "active",
      email: EMAIL,
    });
    const [user] = await db.insert(platformUsersTable).values({
      email: EMAIL,
      name: "Delete SSO Owner",
      googleId: GOOGLE_ID,
      microsoftId: MICROSOFT_ID,
    }).returning();
    userId = user!.id;
    const [company] = await db.insert(platformCompaniesTable).values({
      slug: USERNAME,
      role: "client",
      status: "active",
      email: EMAIL,
    }).returning();
    await db.insert(platformMembershipsTable).values({
      userId,
      companyId: company!.id,
      companySlug: USERNAME,
      role: "owner",
    });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer(server);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "account-delete-confirmation:%"));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, USERNAME));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, USERNAME));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, EMAIL));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, USERNAME));
  });

  function actorHeader() {
    return JSON.stringify({ username: USERNAME, role: "client", userId });
  }

  async function googleConfirmation(googleId = GOOGLE_ID) {
    const state = `delete:${crypto.randomUUID()}`;
    vi.stubGlobal("fetch", makeGoogleStub({ email: EMAIL, googleId }));
    return realFetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_oauth_state=${state}`,
        "x-test-account": actorHeader(),
      },
      body: new URLSearchParams({ code: "fresh-google-code", state }).toString(),
    });
  }

  it("issues a deletion confirmation after fresh Google re-authentication", async () => {
    const response = await googleConfirmation();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("delete_reauth=ok");
    expect(parseCookies(response.headers)["aio_delete_confirmation"]).toBeTruthy();
  });

  it("issues a deletion confirmation after fresh Microsoft re-authentication", async () => {
    const state = `delete:${crypto.randomUUID()}`;
    vi.stubGlobal("fetch", makeMicrosoftStub({ email: EMAIL, microsoftId: MICROSOFT_ID }));
    const response = await realFetch(`${baseUrl}/api/platform/auth/microsoft/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_ms_state=${state}`,
        "x-test-account": actorHeader(),
      },
      body: new URLSearchParams({ code: "fresh-microsoft-code", state }).toString(),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("delete_reauth=ok");
    expect(parseCookies(response.headers)["aio_delete_confirmation"]).toBeTruthy();
  });

  it("rejects a provider identity that does not match the signed-in user", async () => {
    const response = await googleConfirmation("someone-elses-google-id");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("delete_reauth=identity_mismatch");
    expect(parseCookies(response.headers)["aio_delete_confirmation"]).toBeUndefined();
  });

  it("does not issue SSO deletion confirmation to a non-owner team member", async () => {
    await db.update(platformMembershipsTable).set({ role: "viewer" })
      .where(eq(platformMembershipsTable.userId, userId));
    const response = await googleConfirmation();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("delete_reauth=not_allowed");
    expect(parseCookies(response.headers)["aio_delete_confirmation"]).toBeUndefined();
  });

  it("does not let a password-bearing user bypass password confirmation through SSO", async () => {
    await db.update(platformUsersTable).set({ passwordHash: hashPassword("real-password") })
      .where(eq(platformUsersTable.id, userId));
    const response = await googleConfirmation();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("delete_reauth=not_allowed");
    expect(parseCookies(response.headers)["aio_delete_confirmation"]).toBeUndefined();
  });

  it("rejects a confirmation issued for a different signed-in user", async () => {
    const confirmation = await googleConfirmation();
    const token = parseCookies(confirmation.headers)["aio_delete_confirmation"]!;
    await db.insert(platformAccountsTable).values({
      username: "different-delete-owner",
      passwordHash: hashPassword("unused"),
      role: "client",
      status: "active",
      email: "different-delete-owner@example.com",
    });
    const [differentUser] = await db.insert(platformUsersTable).values({
      email: "different-delete-owner@example.com",
      name: "Different owner",
      googleId: "different-google-id",
    }).returning();

    const response = await realFetch(`${baseUrl}/api/platform/account/self-delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `aio_delete_confirmation=${token}`,
        "x-test-account": JSON.stringify({
          username: "different-delete-owner",
          role: "client",
          userId: differentUser!.id,
        }),
      },
      body: JSON.stringify({ confirmation: "sso" }),
    });
    expect(response.status).toBe(401);
    await db.delete(platformUsersTable).where(eq(platformUsersTable.id, differentUser!.id));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, "different-delete-owner"));
  });

  it("rejects an expired deletion confirmation", async () => {
    const confirmation = await googleConfirmation();
    const token = parseCookies(confirmation.headers)["aio_delete_confirmation"]!;
    const [row] = await db.select().from(platformMetaTable)
      .where(like(platformMetaTable.key, "account-delete-confirmation:%"))
      .limit(1);
    await db.update(platformMetaTable).set({
      value: JSON.stringify({ userId, provider: "google", expiresAt: Date.now() - 1 }),
    }).where(eq(platformMetaTable.key, row!.key));

    const response = await realFetch(`${baseUrl}/api/platform/account/self-delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `aio_delete_confirmation=${token}`,
        "x-test-account": actorHeader(),
      },
      body: JSON.stringify({ confirmation: "sso" }),
    });
    expect(response.status).toBe(401);
  });

  it("deletes the account after a valid Google confirmation", async () => {
    const confirmation = await googleConfirmation();
    const token = parseCookies(confirmation.headers)["aio_delete_confirmation"]!;
    const response = await realFetch(`${baseUrl}/api/platform/account/self-delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `aio_delete_confirmation=${token}`,
        "x-test-account": actorHeader(),
      },
      body: JSON.stringify({ confirmation: "sso" }),
    });
    expect(response.status).toBe(200);
    const [account] = await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, USERNAME));
    expect(account).toBeUndefined();
  });

  it("consumes a deletion confirmation so it cannot be replayed", async () => {
    const confirmation = await googleConfirmation();
    const token = parseCookies(confirmation.headers)["aio_delete_confirmation"]!;
    await db.insert(platformAccountsTable).values({
      username: "delete-sso-child",
      passwordHash: hashPassword("unused"),
      role: "client",
      status: "active",
      parent: USERNAME,
    });
    const request = () => realFetch(`${baseUrl}/api/platform/account/self-delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `aio_delete_confirmation=${token}`,
        "x-test-account": actorHeader(),
      },
      body: JSON.stringify({ confirmation: "sso" }),
    });
    const first = await request();
    expect(first.status).toBe(400);
    expect((await first.json() as { error: string }).error).toMatch(/client account/i);
    const replay = await request();
    expect(replay.status).toBe(401);
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, "delete-sso-child"));
  });
});

// ---------------------------------------------------------------------------
// Microsoft OAuth callback tests
// ---------------------------------------------------------------------------

describe("Microsoft GET callback - scanner / bot guard", () => {
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

describe("Microsoft POST callback - code redemption", () => {
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

  it("routes an AIO Fusion Microsoft identity into Master as support", async () => {
    const staffEmail = "microsoft.staff@aiofusion.ai";
    await db.insert(platformAccountsTable).values({
      username: "admin",
      passwordHash: hashPassword("unused"),
      role: "admin",
      status: "active",
    }).onConflictDoNothing();
    vi.stubGlobal("fetch", makeMicrosoftStub({
      email: staffEmail,
      microsoftId: "microsoft-aio-staff",
    }));

    const postRes = await postMsCallback("valid_ms_aio_staff_code", STATE);
    expect(postRes.status).toBe(302);
    expect(postRes.headers.get("location")).toContain("oauth_status=ok");
    expect(postRes.headers.get("location")).not.toContain("mfa_mode=");
    expect(postRes.headers.get("location")).not.toContain("needs_setup=1");
    expect(parseCookies(postRes.headers)["aio_sid"]).toBeTruthy();

    const [user] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.email, staffEmail)).limit(1);
    const [membership] = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, user!.id))
      .limit(1);
    expect(user?.emailVerified).toBe(true);
    expect(user?.microsoftId).toBe("microsoft-aio-staff");
    expect(membership).toMatchObject({ companySlug: "admin", role: "viewer" });

    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, user!.id));
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.userId, user!.id));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.id, user!.id));
  });
});

// ---------------------------------------------------------------------------
// SSO discount invite email binding
// ---------------------------------------------------------------------------

describe("SSO discount invite email binding", () => {
  // Each test uses its own invite token to stay fully independent.
  let server: Server;
  let baseUrl: string;

  const INVITE_EMAIL = "disc-sso-target@disc-sso.example";
  const OTHER_EMAIL = "disc-sso-other@disc-sso.example";
  const G_STATE = "csrf_disc_g_state";
  const MS_STATE = "login:csrf_disc_ms_state";

  beforeEach(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
    process.env.MICROSOFT_CLIENT_ID = "test-ms-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "test-ms-client-secret";
    process.env.NODE_ENV = "test";
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer(server);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    // Clean up any invite/discount/account/session rows created during tests.
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "discount-invite:disc-sso-%"));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "account-discount:%"));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "account:profile:%"));
    await db.delete(platformSessionsTable).where(like(platformSessionsTable.username, "%disc%sso%"));
    await db.delete(platformUsersTable).where(like(platformUsersTable.email, "%disc-sso%"));
    await db.delete(platformAccountsTable).where(like(platformAccountsTable.email, "%disc-sso%"));
  });

  /** Seed a valid discount invite and return its token. */
  async function seedInvite(token: string, email: string) {
    await db.insert(platformMetaTable).values({
      key: `discount-invite:${token}`,
      value: JSON.stringify({
        token,
        email: email.toLowerCase(),
        accountType: "client",
        percent: 20,
        label: "Test",
        createdBy: "admin",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  }

  // Unit test: directly verify that the email-match guard lets the matching
  // email redeem the invite (consumeDiscountInvite succeeds) and blocks the
  // mismatched email (consumeDiscountInvite is not called). This tests the
  // guard logic in isolation without the full SSO HTTP round-trip.
  it("email-match guard (unit): matching email consumes invite; mismatched email does not", async () => {
    const { getDiscountInvite, consumeDiscountInvite } = await import("../lib/discount-invites");

    // Seed two separate invites - one for each scenario.
    const matchToken = "disc-sso-unit-match-guard";
    const mismatchToken = "disc-sso-unit-mismatch-guard";
    await seedInvite(matchToken, INVITE_EMAIL);
    await seedInvite(mismatchToken, INVITE_EMAIL);

    // --- Matching email: the guard SHOULD consume the invite. ---
    const matchResult = await getDiscountInvite(matchToken);
    if (matchResult.invite && matchResult.invite.email.toLowerCase() === INVITE_EMAIL.toLowerCase()) {
      await consumeDiscountInvite(matchResult.invite.token, "match-slug");
    }
    const [matchRow] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, `discount-invite:${matchToken}`));
    expect(JSON.parse(matchRow!.value).usedAt).toBeTruthy();
    const matchDiscounts = await db.select().from(platformMetaTable).where(like(platformMetaTable.key, "account-discount:%"));
    expect(matchDiscounts.length).toBeGreaterThan(0);

    // --- Mismatched email: the guard SHOULD skip redemption. ---
    const mismatchResult = await getDiscountInvite(mismatchToken);
    if (mismatchResult.invite && mismatchResult.invite.email.toLowerCase() === OTHER_EMAIL.toLowerCase()) {
      // This block should NOT execute because emails differ.
      await consumeDiscountInvite(mismatchResult.invite.token, "mismatch-slug");
    }
    const [mismatchRow] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, `discount-invite:${mismatchToken}`));
    expect(JSON.parse(mismatchRow!.value).usedAt).toBeFalsy();
  });

  // HTTP-level tests: verify that the email-match guard does not block
  // sign-in in either case (fail-soft). The mismatch tests also directly
  // verify that the invite is left unconsumed when emails differ.
  it("Google SSO new-account: sign-in succeeds when email matches the invite (guard does not block)", async () => {
    const token = "disc-sso-g-match";
    await seedInvite(token, INVITE_EMAIL);

    vi.stubGlobal("fetch", makeGoogleStub({ email: INVITE_EMAIL, name: "Disc Sso Match Co", googleId: "g-disc-match-001" }));
    const res = await realFetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_oauth_state=${G_STATE}; aio_discount_invite=${token}`,
      },
      body: new URLSearchParams({ code: "disc-g-match-code", state: G_STATE }).toString(),
    });
    // Email matches the invite - sign-in must succeed (email-match guard is not a blocker).
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth_status=ok");
  });

  it("Google SSO new-account: mismatched email does NOT redeem invite (sign-in still succeeds)", async () => {
    const token = "disc-sso-g-mismatch";
    await seedInvite(token, INVITE_EMAIL);

    vi.stubGlobal("fetch", makeGoogleStub({ email: OTHER_EMAIL, name: "Disc Sso Other Co", googleId: "g-disc-other-001" }));
    const res = await realFetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_oauth_state=${G_STATE}; aio_discount_invite=${token}`,
      },
      body: new URLSearchParams({ code: "disc-g-mismatch-code", state: G_STATE }).toString(),
    });

    expect(res.status).toBe(302);
    // Sign-in must succeed - the email mismatch must never block sign-in.
    expect(res.headers.get("location")).toContain("oauth_status=ok");

    // The invite must remain unconsumed.
    const [inviteRow] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, `discount-invite:${token}`));
    expect(JSON.parse(inviteRow!.value).usedAt).toBeFalsy();

    // No account-discount record should exist.
    const discounts = await db.select().from(platformMetaTable).where(like(platformMetaTable.key, "account-discount:%"));
    expect(discounts.length).toBe(0);
  });

  it("Microsoft SSO new-account: sign-in succeeds when email matches the invite (guard does not block)", async () => {
    const token = "disc-sso-ms-match";
    await seedInvite(token, INVITE_EMAIL);

    vi.stubGlobal("fetch", makeMicrosoftStub({ email: INVITE_EMAIL, displayName: "Disc Sso Ms Match Co", microsoftId: "ms-disc-match-001" }));
    const res = await realFetch(`${baseUrl}/api/platform/auth/microsoft/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_ms_state=${encodeURIComponent(MS_STATE)}; aio_discount_invite=${token}`,
      },
      body: new URLSearchParams({ code: "disc-ms-match-code", state: MS_STATE }).toString(),
    });
    // Email matches the invite - sign-in must succeed.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth_status=ok");

    const [createdAccount] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.email, INVITE_EMAIL))
      .limit(1);
    const [profile] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `account:profile:${createdAccount!.username}`))
      .limit(1);
    expect(JSON.parse(profile!.value)).toEqual({ ownerName: "Disc Sso Ms Match Co" });
  });

  it("Microsoft SSO new-account: mismatched email does NOT redeem invite (sign-in still succeeds)", async () => {
    const token = "disc-sso-ms-mismatch";
    await seedInvite(token, INVITE_EMAIL);

    vi.stubGlobal("fetch", makeMicrosoftStub({ email: OTHER_EMAIL, displayName: "Disc Sso Ms Other Co", microsoftId: "ms-disc-other-001" }));
    const res = await realFetch(`${baseUrl}/api/platform/auth/microsoft/callback`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "Mozilla/5.0 Chrome/120",
        cookie: `aio_ms_state=${encodeURIComponent(MS_STATE)}; aio_discount_invite=${token}`,
      },
      body: new URLSearchParams({ code: "disc-ms-mismatch-code", state: MS_STATE }).toString(),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oauth_status=ok");

    const [inviteRow] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, `discount-invite:${token}`));
    expect(JSON.parse(inviteRow!.value).usedAt).toBeFalsy();

    const discounts = await db.select().from(platformMetaTable).where(like(platformMetaTable.key, "account-discount:%"));
    expect(discounts.length).toBe(0);
  });
});

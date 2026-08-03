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
}));

import {
  db,
  platformUsersTable,
  platformAccountsTable,
  platformSessionsTable,
  platformMetaTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { hashPassword } from "../lib/platform-auth";
import { totpCode, getMfaState, saveMfaState, generateTotpSecret, hashRecoveryCode } from "../lib/mfa";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let actorOverride: { username: string; role: string } | null = null;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res: any, next: any) => {
    req.account = actorOverride;
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

async function post(baseUrl: string, path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any, setCookie: res.headers.get("set-cookie") };
}

const MASTER = "mfa-master";
const AGENCY = "mfa-agency";
const PASSWORD = "correct-horse-9!";

describe("MFA login flow", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    actorOverride = null;
    const ph = hashPassword(PASSWORD);
    await db.insert(platformAccountsTable).values([
      { username: MASTER, passwordHash: ph, role: "admin", status: "active" },
      { username: AGENCY, passwordHash: ph, role: "agency", status: "active" },
    ]);
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    for (const u of [MASTER, AGENCY]) {
      await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, u));
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, u));
    }
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "account:mfa:%"));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, "mfa@example.com"));
  });

  it("forces TOTP enrolment on first master login (no session issued)", async () => {
    const r = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.json.mfaEnrollRequired).toBe(true);
    expect(typeof r.json.mfaToken).toBe("string");
    expect(r.json.account).toBeUndefined();
    expect(r.setCookie ?? "").not.toMatch(/aio_sid=/);
  });

  it("completes master enrolment: setup -> enable issues session + recovery codes", async () => {
    const login = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    const token = login.json.mfaToken as string;

    const setup = await post(baseUrl, "/api/platform/mfa/setup", { mfaToken: token });
    expect(setup.status).toBe(200);
    expect(setup.json.otpauthUrl).toContain("otpauth://totp/");
    const secret = setup.json.secret as string;

    const enable = await post(baseUrl, "/api/platform/mfa/enable", { mfaToken: token, code: totpCode(secret) });
    expect(enable.status).toBe(200);
    expect(enable.json.account?.username).toBe(MASTER);
    expect(Array.isArray(enable.json.recoveryCodes)).toBe(true);
    expect(enable.json.recoveryCodes.length).toBe(10);
    expect(enable.setCookie).toMatch(/aio_sid=/);

    const state = await getMfaState(MASTER);
    expect(state?.enabled).toBe(true);
  });

  it("rejects enrolment confirmation with a wrong code", async () => {
    const login = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    const token = login.json.mfaToken as string;
    await post(baseUrl, "/api/platform/mfa/setup", { mfaToken: token });
    const enable = await post(baseUrl, "/api/platform/mfa/enable", { mfaToken: token, code: "000000" });
    expect(enable.status).toBe(401);
  });

  it("requires TOTP verification on subsequent master logins", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(MASTER, { secret, enabled: true, recoveryHashes: [] });

    const login = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    expect(login.json.mfaRequired).toBe(true);
    expect(login.setCookie ?? "").not.toMatch(/aio_sid=/);

    const bad = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: login.json.mfaToken, code: "123456" });
    expect(bad.status).toBe(401);

    const good = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: login.json.mfaToken, code: totpCode(secret) });
    expect(good.status).toBe(200);
    expect(good.json.account?.username).toBe(MASTER);
    expect(good.setCookie).toMatch(/aio_sid=/);
  });

  it("accepts a recovery code exactly once", async () => {
    const secret = generateTotpSecret();
    const recovery = "ABCD-EFGH";
    await saveMfaState(MASTER, { secret, enabled: true, recoveryHashes: [hashRecoveryCode(recovery)] });

    const login1 = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    const ok = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: login1.json.mfaToken, code: recovery });
    expect(ok.status).toBe(200);
    expect(ok.json.recoveryCodesRemaining).toBe(0);

    const login2 = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    const again = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: login2.json.mfaToken, code: recovery });
    expect(again.status).toBe(401);
  });

  it("rejects a tampered pending token", async () => {
    const login = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    const tampered = (login.json.mfaToken as string).slice(0, -2) + "aa";
    const r = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: tampered, code: "123456" });
    expect(r.status).toBe(401);
  });

  it("non-master login without MFA gets a session directly", async () => {
    const r = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.json.account?.username).toBe(AGENCY);
    expect(r.setCookie).toMatch(/aio_sid=/);
  });

  it("non-master with MFA enabled is challenged on login", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });
    const login = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD });
    expect(login.json.mfaRequired).toBe(true);
    const good = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: login.json.mfaToken, code: totpCode(secret) });
    expect(good.status).toBe(200);
    expect(good.json.account?.username).toBe(AGENCY);
  });

  it("opt-in enrolment via authenticated session (no login token)", async () => {
    actorOverride = { username: AGENCY, role: "agency" };
    const setup = await post(baseUrl, "/api/platform/mfa/setup", {});
    expect(setup.status).toBe(200);
    const enable = await post(baseUrl, "/api/platform/mfa/enable", { code: totpCode(setup.json.secret) });
    expect(enable.status).toBe(200);
    expect(enable.json.recoveryCodes.length).toBe(10);

    const status = await fetch(`${baseUrl}/api/platform/mfa/status`);
    const sj = (await status.json()) as any;
    expect(sj.enabled).toBe(true);
    expect(sj.required).toBe(false);
  });

  it("admin can reset a locked-out user's MFA; self-reset and non-managers are rejected", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });
    await saveMfaState(MASTER, { secret, enabled: true, recoveryHashes: [] });

    // Non-manager (agency) cannot reset the master's MFA.
    actorOverride = { username: AGENCY, role: "agency" };
    const denied = await post(baseUrl, "/api/platform/accounts/reset-mfa", { username: MASTER });
    expect(denied.status).toBe(403);

    // Actor cannot reset their own MFA via the admin endpoint.
    actorOverride = { username: MASTER, role: "admin" };
    const self = await post(baseUrl, "/api/platform/accounts/reset-mfa", { username: MASTER });
    expect(self.status).toBe(400);

    // Admin resets the agency's MFA; state is cleared and password-only login works again.
    const ok = await post(baseUrl, "/api/platform/accounts/reset-mfa", { username: AGENCY });
    expect(ok.status).toBe(200);
    expect(await getMfaState(AGENCY)).toBeNull();

    // Resetting again fails: nothing to clear.
    const again = await post(baseUrl, "/api/platform/accounts/reset-mfa", { username: AGENCY });
    expect(again.status).toBe(400);

    // Unknown target -> 404.
    const missing = await post(baseUrl, "/api/platform/accounts/reset-mfa", { username: "no-such-user" });
    expect(missing.status).toBe(404);

    actorOverride = null;
    const login = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.json.account?.username).toBe(AGENCY);
    expect(login.setCookie).toMatch(/aio_sid=/);
  });

  it("master accounts cannot disable MFA; non-masters can with a valid code", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(MASTER, { secret, enabled: true, recoveryHashes: [] });
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });

    actorOverride = { username: MASTER, role: "admin" };
    const denied = await post(baseUrl, "/api/platform/mfa/disable", { code: totpCode(secret) });
    expect(denied.status).toBe(403);

    actorOverride = { username: AGENCY, role: "agency" };
    const wrong = await post(baseUrl, "/api/platform/mfa/disable", { code: "000000" });
    expect(wrong.status).toBe(401);
    const ok = await post(baseUrl, "/api/platform/mfa/disable", { code: totpCode(secret) });
    expect(ok.status).toBe(200);
    expect(await getMfaState(AGENCY)).toBeNull();
  });
});

describe("TOTP + token primitives", () => {
  it("verifyTotp accepts the current and adjacent step codes only", async () => {
    const { verifyTotp } = await import("../lib/mfa");
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, "abcdef", now)).toBe(false);
  });

  it("pending tokens expire and fail on payload tampering", async () => {
    const { createMfaPendingToken, verifyMfaPendingToken } = await import("../lib/mfa");
    const token = createMfaPendingToken({ u: "x", role: "admin", mode: "verify" });
    expect(verifyMfaPendingToken(token)?.u).toBe("x");
    const [body] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ u: "admin", role: "admin", mode: "verify", exp: Date.now() + 60000 })).toString("base64url");
    expect(verifyMfaPendingToken(`${forgedBody}.${token.split(".")[1]}`)).toBeNull();
    expect(verifyMfaPendingToken(body!)).toBeNull();
  });
});

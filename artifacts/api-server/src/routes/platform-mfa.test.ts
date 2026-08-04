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
const sendMfaAdminResetEmailMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const sendMfaChangedEmailMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("../lib/notify-email", () => ({
  getAppBaseUrl: () => "https://test.example.com",
  sendMfaAdminResetEmail: sendMfaAdminResetEmailMock,
  sendMfaChangedEmail: sendMfaChangedEmailMock,
  sendPasswordResetEmail: () => Promise.resolve(),
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
  platformMembershipsTable,
  platformAccountsTable,
  platformSessionsTable,
  platformMetaTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { hashPassword, ensurePlatformUser } from "../lib/platform-auth";
import { totpCode, getMfaState, saveMfaState, generateTotpSecret, hashRecoveryCode } from "../lib/mfa";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let actorOverride: { username: string; role: string } | null = null;

function buildApp() {
  const app = express();
  app.use(express.json());
  // URL-encoded body parsing needed for the OAuth POST callback interstitial.
  app.use(express.urlencoded({ extended: false }));
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

async function post(baseUrl: string, path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
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
      { username: AGENCY, passwordHash: ph, role: "agency", status: "active", email: "mfa-agency@example.com" },
    ]);
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    for (const u of [MASTER, AGENCY]) {
      await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, u));
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, u));
    }
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "account:mfa%"));
    for (const e of ["mfa@example.com", "mfa-owner@example.com", "mfa-member@example.com"]) {
      await db.delete(platformUsersTable).where(eq(platformUsersTable.email, e));
    }
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
    // The OAuth MFA handoff cookie is cleared server-side (single-use).
    expect(good.setCookie).toMatch(/aio_oauth_mfa_token=;/);
  });

  it("clears the OAuth MFA handoff cookie on verify failure and on enable", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(MASTER, { secret, enabled: true, recoveryHashes: [] });
    const login = await post(baseUrl, "/api/platform/login", { username: MASTER, password: PASSWORD });
    const bad = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: login.json.mfaToken, code: "000000" });
    expect(bad.status).toBe(401);
    expect(bad.setCookie).toMatch(/aio_oauth_mfa_token=;/);

    actorOverride = { username: AGENCY, role: "agency" };
    const setup = await post(baseUrl, "/api/platform/mfa/setup", {});
    const enable = await post(baseUrl, "/api/platform/mfa/enable", { code: totpCode(setup.json.secret) });
    expect(enable.status).toBe(200);
    expect(enable.setCookie).toMatch(/aio_oauth_mfa_token=;/);
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

    // Seed a workspace owner plus a LATER non-owner team member: the security
    // alert must go to the owner, never an arbitrary/latest member. Clear any
    // memberships left behind by earlier logins so the scenario is exact.
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, AGENCY));
    await ensurePlatformUser({ email: "mfa-owner@example.com", name: "Agency Owner", companyUsername: AGENCY, membershipRole: "owner", companyRole: "agency", companyStatus: "active" });
    await ensurePlatformUser({ email: "mfa-member@example.com", name: "Agency Member", companyUsername: AGENCY, membershipRole: "content", companyRole: "agency", companyStatus: "active" });

    // Admin resets the agency's MFA; state is cleared and password-only login works again.
    sendMfaAdminResetEmailMock.mockClear();
    const ok = await post(baseUrl, "/api/platform/accounts/reset-mfa", { username: AGENCY });
    expect(ok.status).toBe(200);
    expect(await getMfaState(AGENCY)).toBeNull();

    // The workspace owner gets a fire-and-forget security alert email — not
    // the more recently added non-owner member.
    await vi.waitFor(() => {
      expect(sendMfaAdminResetEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: "mfa-owner@example.com" }),
      );
    });
    expect(sendMfaAdminResetEmailMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "mfa-member@example.com" }),
    );

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

  it("GET /platform/accounts flags MFA-enabled accounts with mfaEnabled", async () => {
    const secret = generateTotpSecret();
    // Enabled MFA -> flagged; enrolment-started-but-unconfirmed -> not flagged.
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });
    await saveMfaState(MASTER, { secret, enabled: false, recoveryHashes: [] });

    actorOverride = { username: MASTER, role: "admin" };
    const res = await fetch(`${baseUrl}/api/platform/accounts`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { accounts: Array<{ username: string; mfaEnabled?: boolean }> };
    const byName = new Map(json.accounts.map((a) => [a.username.toLowerCase(), a]));
    expect(byName.get(AGENCY)?.mfaEnabled).toBe(true);
    expect(byName.get(MASTER)?.mfaEnabled).toBeUndefined();
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

  it("enable sends a security alert email to the workspace owner", async () => {
    // Seed a users row with an owner membership so recipient resolution works.
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, AGENCY));
    await ensurePlatformUser({ email: "mfa-owner@example.com", name: "Agency Owner", companyUsername: AGENCY, membershipRole: "owner", companyRole: "agency", companyStatus: "active" });

    actorOverride = { username: AGENCY, role: "agency" };
    sendMfaChangedEmailMock.mockClear();

    const setup = await post(baseUrl, "/api/platform/mfa/setup", {});
    expect(setup.status).toBe(200);
    const enable = await post(baseUrl, "/api/platform/mfa/enable", { code: totpCode(setup.json.secret) });
    expect(enable.status).toBe(200);

    await vi.waitFor(() => {
      expect(sendMfaChangedEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: "mfa-owner@example.com", enabled: true }),
      );
    });
  });

  it("disable sends a security alert email to the workspace owner", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });

    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, AGENCY));
    await ensurePlatformUser({ email: "mfa-owner@example.com", name: "Agency Owner", companyUsername: AGENCY, membershipRole: "owner", companyRole: "agency", companyStatus: "active" });

    actorOverride = { username: AGENCY, role: "agency" };
    sendMfaChangedEmailMock.mockClear();

    const ok = await post(baseUrl, "/api/platform/mfa/disable", { code: totpCode(secret) });
    expect(ok.status).toBe(200);

    await vi.waitFor(() => {
      expect(sendMfaChangedEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ toEmail: "mfa-owner@example.com", enabled: false }),
      );
    });
  });

  it("enable does NOT send email when code is wrong", async () => {
    actorOverride = { username: AGENCY, role: "agency" };
    sendMfaChangedEmailMock.mockClear();

    const setup = await post(baseUrl, "/api/platform/mfa/setup", {});
    expect(setup.status).toBe(200);
    const bad = await post(baseUrl, "/api/platform/mfa/enable", { code: "000000" });
    expect(bad.status).toBe(401);

    // Give async fire-and-forget a moment — it must not have fired.
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMfaChangedEmailMock).not.toHaveBeenCalled();
  });

  it("disable does NOT send email when code is wrong", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });

    actorOverride = { username: AGENCY, role: "agency" };
    sendMfaChangedEmailMock.mockClear();

    const bad = await post(baseUrl, "/api/platform/mfa/disable", { code: "000000" });
    expect(bad.status).toBe(401);

    await new Promise((r) => setTimeout(r, 50));
    expect(sendMfaChangedEmailMock).not.toHaveBeenCalled();
  });

  it("regenerates recovery codes with a valid TOTP; old codes stop working", async () => {
    const secret = generateTotpSecret();
    const oldCode = "ABCD-EFGH";
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [hashRecoveryCode(oldCode)] });

    actorOverride = { username: AGENCY, role: "agency" };
    // Recovery codes are not accepted as the confirmation code.
    const viaRecovery = await post(baseUrl, "/api/platform/mfa/recovery-codes", { code: oldCode });
    expect(viaRecovery.status).toBe(401);
    const wrong = await post(baseUrl, "/api/platform/mfa/recovery-codes", { code: "000000" });
    expect(wrong.status).toBe(401);

    const ok = await post(baseUrl, "/api/platform/mfa/recovery-codes", { code: totpCode(secret) });
    expect(ok.status).toBe(200);
    expect(ok.json.recoveryCodes.length).toBe(10);

    const state = await getMfaState(AGENCY);
    expect(state?.recoveryHashes.length).toBe(10);
    expect(state?.recoveryHashes).not.toContain(hashRecoveryCode(oldCode));
    expect(state?.recoveryHashes).toContain(hashRecoveryCode(ok.json.recoveryCodes[0]));
  });

  it("refuses regeneration when MFA is not enabled", async () => {
    actorOverride = { username: AGENCY, role: "agency" };
    const r = await post(baseUrl, "/api/platform/mfa/recovery-codes", { code: "000000" });
    expect(r.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Trusted devices ("remember this device for 30 days")
// ---------------------------------------------------------------------------

function extractTrustCookie(setCookie: string | null): string {
  const m = (setCookie ?? "").match(/aio_mfa_trust=([^;,\s]+)/);
  return m ? `aio_mfa_trust=${decodeURIComponent(m[1])}` : "";
}

describe("MFA trusted devices", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    actorOverride = null;
    const ph = hashPassword(PASSWORD);
    await db.insert(platformAccountsTable).values([
      { username: AGENCY, passwordHash: ph, role: "agency", status: "active" },
    ]);
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, AGENCY));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, AGENCY));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "account:mfa%"));
  });

  it("verify with trustDevice sets a signed cookie that skips the next challenge", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });

    const login1 = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD });
    expect(login1.json.mfaRequired).toBe(true);
    const verify = await post(baseUrl, "/api/platform/mfa/verify", {
      mfaToken: login1.json.mfaToken,
      code: totpCode(secret),
      trustDevice: true,
    });
    expect(verify.status).toBe(200);
    expect(verify.setCookie).toMatch(/aio_mfa_trust=/);
    expect(verify.setCookie).toMatch(/aio_sid=/);
    const trustCookie = extractTrustCookie(verify.setCookie);
    expect(trustCookie).not.toBe("");

    // Next login with the trusted-device cookie skips the challenge entirely.
    const login2 = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD }, trustCookie);
    expect(login2.status).toBe(200);
    expect(login2.json.mfaRequired).toBeUndefined();
    expect(login2.json.account?.username).toBe(AGENCY);
    expect(login2.setCookie).toMatch(/aio_sid=/);
  });

  it("does not set a trust cookie without the opt-in flag, and a forged cookie is ignored", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });

    const login1 = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD });
    const verify = await post(baseUrl, "/api/platform/mfa/verify", {
      mfaToken: login1.json.mfaToken,
      code: totpCode(secret),
    });
    expect(verify.status).toBe(200);
    expect(verify.setCookie ?? "").not.toMatch(/aio_mfa_trust=/);

    const forged = Buffer.from(JSON.stringify({ u: AGENCY, d: "fake", exp: Date.now() + 60000 })).toString("base64url");
    const login2 = await post(
      baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD },
      `aio_mfa_trust=${forged}.not-a-real-signature`,
    );
    expect(login2.json.mfaRequired).toBe(true);
  });

  it("trusted devices can be listed and revoked; revoked cookie requires a code again", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });

    const login1 = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD });
    const verify = await post(baseUrl, "/api/platform/mfa/verify", {
      mfaToken: login1.json.mfaToken,
      code: totpCode(secret),
      trustDevice: true,
    });
    const trustCookie = extractTrustCookie(verify.setCookie);

    actorOverride = { username: AGENCY, role: "agency" };
    const list = await fetch(`${baseUrl}/api/platform/mfa/trusted-devices`, { headers: { cookie: trustCookie } });
    const lj = (await list.json()) as any;
    expect(list.status).toBe(200);
    expect(lj.devices.length).toBe(1);
    expect(lj.devices[0].current).toBe(true);

    const del = await fetch(`${baseUrl}/api/platform/mfa/trusted-devices/${lj.devices[0].id}`, {
      method: "DELETE",
      headers: { cookie: trustCookie },
    });
    expect(del.status).toBe(200);

    // Revoking an unknown device 404s.
    const delAgain = await fetch(`${baseUrl}/api/platform/mfa/trusted-devices/${lj.devices[0].id}`, { method: "DELETE" });
    expect(delAgain.status).toBe(404);

    // The cookie is still validly signed but the device is off the list -> challenge again.
    actorOverride = null;
    const login2 = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD }, trustCookie);
    expect(login2.json.mfaRequired).toBe(true);
  });

  it("disabling MFA clears the trusted-device list", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });

    const login1 = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD });
    const verify = await post(baseUrl, "/api/platform/mfa/verify", {
      mfaToken: login1.json.mfaToken,
      code: totpCode(secret),
      trustDevice: true,
    });
    const trustCookie = extractTrustCookie(verify.setCookie);

    actorOverride = { username: AGENCY, role: "agency" };
    const off = await post(baseUrl, "/api/platform/mfa/disable", { code: totpCode(secret) });
    expect(off.status).toBe(200);

    const { listTrustedDevices } = await import("../lib/mfa");
    expect(await listTrustedDevices(AGENCY)).toEqual([]);

    // Re-enable MFA: the stale cookie must not skip the challenge.
    await saveMfaState(AGENCY, { secret, enabled: true, recoveryHashes: [] });
    actorOverride = null;
    const login2 = await post(baseUrl, "/api/platform/login", { username: AGENCY, password: PASSWORD }, trustCookie);
    expect(login2.json.mfaRequired).toBe(true);
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
  it("trusted-device tokens are device- and user-bound and expire", async () => {
    const { createTrustedDeviceToken, verifyTrustedDeviceToken } = await import("../lib/mfa");
    const good = createTrustedDeviceToken("someone", "device-1", Date.now() + 60_000);
    expect(verifyTrustedDeviceToken(good)?.u).toBe("someone");
    expect(verifyTrustedDeviceToken(good)?.d).toBe("device-1");

    const expired = createTrustedDeviceToken("someone", "device-1", Date.now() - 1_000);
    expect(verifyTrustedDeviceToken(expired)).toBeNull();

    const tampered = good.slice(0, -2) + "aa";
    expect(verifyTrustedDeviceToken(tampered)).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// OAuth SSO logins that need MFA: the pending token is handed over via a
// short-lived cookie (never a query param), keeping it out of the address
// bar, browser history, and proxy/access logs.
// ---------------------------------------------------------------------------

const GOOGLE_MASTER = "oauth-master";
const GOOGLE_AGENCY = "oauth-agency";
const MASTER_EMAIL = "oauth-master@example.com";
const AGENCY_EMAIL = "oauth-agency@example.com";
const STATE = "test-oauth-state";
const MFA_COOKIE = "aio_oauth_mfa_token";

describe("OAuth SSO MFA challenge handoff", () => {
  let server: Server;
  let baseUrl: string;

  const realFetch = globalThis.fetch;

  function stubGoogle(email: string) {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("googleapis.com/oauth2/v2/userinfo")) {
        return new Response(JSON.stringify({ id: `gid-${email}`, email, name: "OAuth Tester" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return realFetch(input, init);
    }) as typeof fetch;
  }

  // The GET callback now serves an interstitial; code redemption happens via POST.
  async function runCallback(): Promise<{ status: number; location: URL; setCookies: string[] }> {
    const res = await realFetch(
      `${baseUrl}/api/platform/auth/google/callback`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          cookie: `aio_oauth_state=${STATE}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ code: "abc", state: STATE }).toString(),
      },
    );
    const loc = res.headers.get("location") ?? "";
    return { status: res.status, location: new URL(loc, baseUrl), setCookies: res.headers.getSetCookie() };
  }

  function mfaCookieValue(setCookies: string[]): string | null {
    const c = setCookies.find((s) => s.startsWith(`${MFA_COOKIE}=`) && !s.startsWith(`${MFA_COOKIE}=;`));
    if (!c) return null;
    return decodeURIComponent(c.slice(MFA_COOKIE.length + 1).split(";")[0]!);
  }

  beforeEach(async () => {
    actorOverride = null;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    const ph = hashPassword(PASSWORD);
    await db.insert(platformAccountsTable).values([
      { username: GOOGLE_MASTER, passwordHash: ph, role: "admin", status: "active", email: MASTER_EMAIL },
      { username: GOOGLE_AGENCY, passwordHash: ph, role: "agency", status: "active", email: AGENCY_EMAIL },
    ]);
    // Seed platform_users + memberships so the callback resolves these
    // identities to the seeded workspaces instead of creating new accounts.
    await ensurePlatformUser({ email: MASTER_EMAIL, name: "OAuth Master", companyUsername: GOOGLE_MASTER, companyRole: "admin", companyStatus: "active" });
    await ensurePlatformUser({ email: AGENCY_EMAIL, name: "OAuth Agency", companyUsername: GOOGLE_AGENCY, companyRole: "agency", companyStatus: "active" });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await stopServer(server);
    for (const u of [GOOGLE_MASTER, GOOGLE_AGENCY]) {
      await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, u));
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, u));
    }
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, "account:mfa%"));
    for (const e of [MASTER_EMAIL, AGENCY_EMAIL]) {
      await db.delete(platformUsersTable).where(eq(platformUsersTable.email, e));
    }
  });

  it("hands a master SSO enrolment token over via cookie, never the URL", async () => {
    stubGoogle(MASTER_EMAIL);
    const r = await runCallback();
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.location.searchParams.get("oauth_status")).toBe("mfa");
    expect(r.location.searchParams.get("mfa_mode")).toBe("enroll");
    // The token must NOT appear in the redirect URL...
    expect(r.location.searchParams.get("mfa_token")).toBeNull();
    // ...it is delivered in a short-lived, non-httpOnly cookie instead.
    const token = mfaCookieValue(r.setCookies);
    expect(token).toBeTruthy();
    const mfaCookie = r.setCookies.find((s) => s.startsWith(`${MFA_COOKIE}=`))!;
    expect(mfaCookie).not.toMatch(/httponly/i);
    expect(mfaCookie).toMatch(/max-age=600/i);
    // The pending token is genuine and carries the right identity.
    const { verifyMfaPendingToken } = await import("../lib/mfa");
    expect(verifyMfaPendingToken(token!)?.u).toBe(GOOGLE_MASTER);
    // No session is issued at this point.
    expect(r.setCookies.join("; ")).not.toMatch(/aio_sid=/);
  });

  it("challenges an MFA-enabled non-master SSO login via cookie; token completes /mfa/verify", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(GOOGLE_AGENCY, { secret, enabled: true, recoveryHashes: [] });

    stubGoogle(AGENCY_EMAIL);
    const r = await runCallback();
    expect(r.location.searchParams.get("oauth_status")).toBe("mfa");
    expect(r.location.searchParams.get("mfa_mode")).toBe("verify");
    expect(r.location.searchParams.get("mfa_token")).toBeNull();
    const token = mfaCookieValue(r.setCookies);
    expect(token).toBeTruthy();
    expect(r.setCookies.join("; ")).not.toMatch(/aio_sid=/);

    const bad = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: token, code: "000000" });
    expect(bad.status).toBe(401);
    const good = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: token, code: totpCode(secret) });
    expect(good.status).toBe(200);
    expect(good.json.account?.username).toBe(GOOGLE_AGENCY);
    expect(good.setCookie).toMatch(/aio_sid=/);
  });

  it("challenges an MFA-enabled master with verify mode; cookie token completes login via /mfa/verify", async () => {
    const secret = generateTotpSecret();
    await saveMfaState(GOOGLE_MASTER, { secret, enabled: true, recoveryHashes: [] });
    stubGoogle(MASTER_EMAIL);
    const r = await runCallback();
    expect(r.location.searchParams.get("oauth_status")).toBe("mfa");
    expect(r.location.searchParams.get("mfa_mode")).toBe("verify");
    expect(r.location.searchParams.get("mfa_token")).toBeNull();
    const token = mfaCookieValue(r.setCookies);
    expect(token).toBeTruthy();

    const good = await post(baseUrl, "/api/platform/mfa/verify", { mfaToken: token, code: totpCode(secret) });
    expect(good.status).toBe(200);
    expect(good.json.account?.username).toBe(GOOGLE_MASTER);
    expect(good.setCookie).toMatch(/aio_sid=/);
  });

  it("issues a session directly for a non-master without MFA (no token cookie)", async () => {
    stubGoogle(AGENCY_EMAIL);
    const r = await runCallback();
    expect(r.location.searchParams.get("oauth_status")).toBe("ok");
    expect(mfaCookieValue(r.setCookies)).toBeNull();
    expect(r.setCookies.join("; ")).toMatch(/aio_sid=/);
  });
});

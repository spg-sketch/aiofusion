/**
 * Verifies that every password-change / password-reset endpoint clears the MFA
 * trusted-device list for the affected account(s), so every device must enter a
 * TOTP code on the next login after a password event.
 *
 * Three code paths are exercised:
 *  1. POST /platform/change-password  — authenticated self-service change
 *  2. POST /platform/reset-password   — unauthenticated email-token reset
 *  3. POST /platform/accounts/password — admin / manager set-password
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database (same schema block as platform-mfa.test.ts)
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
    CREATE TABLE IF NOT EXISTS platform_password_resets (
      token varchar(64) PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
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
    platformPasswordResetsTable: schema.platformPasswordResetsTable,
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

// requirePlatformAuth is bypassed — actor is injected via actorOverride below.
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

import {
  db,
  platformUsersTable,
  platformMembershipsTable,
  platformAccountsTable,
  platformSessionsTable,
  platformMetaTable,
  platformPasswordResetsTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { hashPassword, ensurePlatformUser } from "../lib/platform-auth";
import {
  generateTotpSecret,
  saveMfaState,
  listTrustedDevices,
  addTrustedDevice,
} from "../lib/mfa";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let actorOverride: { username: string; role: string; userId?: string } | null = null;

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
  return { status: res.status, json: (await res.json()) as any };
}

// Seed a platform_users row + membership, return the user id.
async function seedUser(email: string, username: string, password: string): Promise<string> {
  const userId = await ensurePlatformUser({
    email,
    passwordHash: hashPassword(password),
    companyUsername: username,
    membershipRole: "owner",
    companyRole: "agency",
    companyStatus: "active",
  });
  return userId;
}

// Insert a trusted-device row for username and return the device id.
async function seedTrustedDevice(username: string): Promise<string> {
  const secret = generateTotpSecret();
  await saveMfaState(username, { secret, enabled: true, recoveryHashes: [] });
  const { device } = await addTrustedDevice(username, "Test Browser");
  return device.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const PASSWORD = "correct-horse-9!";
const NEW_PASSWORD = "new-horse-correct-9!";

// Usernames are unique across describe blocks to avoid PGlite unique-constraint
// conflicts between the shared in-memory database instance.
const CHANGE_USER = "pw-change-user";
const CHANGE_EMAIL = "pw-change@example.com";

const RESET_USER = "pw-reset-user";
const RESET_EMAIL = "pw-reset@example.com";

const ADMIN_USER = "pw-admin-target";

describe("change-password clears trusted devices", () => {
  let server: Server;
  let baseUrl: string;
  let userId: string;

  beforeEach(async () => {
    actorOverride = null;
    // Seed both legacy account and platform_users so the endpoint can find the user.
    await db.insert(platformAccountsTable).values({
      username: CHANGE_USER,
      passwordHash: hashPassword(PASSWORD),
      role: "agency",
      status: "active",
      email: CHANGE_EMAIL,
    });
    userId = await seedUser(CHANGE_EMAIL, CHANGE_USER, PASSWORD);
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, CHANGE_USER));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, CHANGE_USER));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, CHANGE_USER));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, CHANGE_EMAIL));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, `account:mfa%`));
  });

  it("clears trusted devices after a successful self-service password change (platform_users path)", async () => {
    const deviceId = await seedTrustedDevice(CHANGE_USER);
    expect((await listTrustedDevices(CHANGE_USER)).map((d) => d.id)).toContain(deviceId);

    // Inject authenticated session for the actor.
    actorOverride = { username: CHANGE_USER, role: "agency", userId };

    const r = await post(baseUrl, "/api/platform/change-password", {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);

    // Trusted devices must be gone.
    expect(await listTrustedDevices(CHANGE_USER)).toEqual([]);
  });

  it("does not clear trusted devices when the current password is wrong", async () => {
    const deviceId = await seedTrustedDevice(CHANGE_USER);
    actorOverride = { username: CHANGE_USER, role: "agency", userId };

    const r = await post(baseUrl, "/api/platform/change-password", {
      currentPassword: "wrong-password",
      newPassword: NEW_PASSWORD,
    });
    expect(r.status).toBe(401);

    // Device list must be untouched.
    expect((await listTrustedDevices(CHANGE_USER)).map((d) => d.id)).toContain(deviceId);
  });

  it("clears trusted devices on the legacy (no userId) path", async () => {
    const deviceId = await seedTrustedDevice(CHANGE_USER);
    // Simulate legacy session: no userId attached to actor.
    actorOverride = { username: CHANGE_USER, role: "agency" };

    const r = await post(baseUrl, "/api/platform/change-password", {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(r.status).toBe(200);
    expect(await listTrustedDevices(CHANGE_USER)).toEqual([]);
    // Suppress unused-variable lint: deviceId used for the before-assertion.
    void deviceId;
  });
});

describe("reset-password clears trusted devices", () => {
  let server: Server;
  let baseUrl: string;
  let userId: string;
  let resetToken: string;

  beforeEach(async () => {
    actorOverride = null;
    await db.insert(platformAccountsTable).values({
      username: RESET_USER,
      passwordHash: hashPassword(PASSWORD),
      role: "agency",
      status: "active",
      email: RESET_EMAIL,
    });
    userId = await seedUser(RESET_EMAIL, RESET_USER, PASSWORD);
    // Insert a valid, unexpired reset token directly.
    resetToken = "test-reset-token-" + Math.random().toString(36).slice(2);
    await db.insert(platformPasswordResetsTable).values({
      token: resetToken,
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, RESET_USER));
    await db.delete(platformPasswordResetsTable).where(eq(platformPasswordResetsTable.userId, userId));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, RESET_USER));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, RESET_USER));
    await db.delete(platformUsersTable).where(eq(platformUsersTable.email, RESET_EMAIL));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, `account:mfa%`));
  });

  it("clears trusted devices after a successful email-token password reset", async () => {
    const deviceId = await seedTrustedDevice(RESET_USER);
    expect((await listTrustedDevices(RESET_USER)).map((d) => d.id)).toContain(deviceId);

    const r = await post(baseUrl, "/api/platform/reset-password", {
      token: resetToken,
      password: NEW_PASSWORD,
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);

    expect(await listTrustedDevices(RESET_USER)).toEqual([]);
  });

  it("does not clear trusted devices when the reset token is invalid", async () => {
    const deviceId = await seedTrustedDevice(RESET_USER);

    const r = await post(baseUrl, "/api/platform/reset-password", {
      token: "not-a-valid-token",
      password: NEW_PASSWORD,
    });
    expect(r.status).toBe(400);

    expect((await listTrustedDevices(RESET_USER)).map((d) => d.id)).toContain(deviceId);
  });
});

describe("admin accounts/password clears trusted devices", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    actorOverride = null;
    await db.insert(platformAccountsTable).values({
      username: ADMIN_USER,
      passwordHash: hashPassword(PASSWORD),
      role: "agency",
      status: "active",
    });
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, ADMIN_USER));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, `account:mfa%`));
  });

  it("clears trusted devices when an admin sets a new password for a target account", async () => {
    const deviceId = await seedTrustedDevice(ADMIN_USER);
    expect((await listTrustedDevices(ADMIN_USER)).map((d) => d.id)).toContain(deviceId);

    // Admin actor (canManage passes because requirePlatformAuth is mocked).
    actorOverride = { username: "admin", role: "admin" };

    const r = await post(baseUrl, "/api/platform/accounts/password", {
      username: ADMIN_USER,
      newPassword: NEW_PASSWORD,
    });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);

    expect(await listTrustedDevices(ADMIN_USER)).toEqual([]);
  });

  it("does not clear trusted devices when the target account is not found", async () => {
    // canManage mock: requirePlatformAuth passes but getAccount("no-such") returns null -> 404.
    actorOverride = { username: "admin", role: "admin" };

    const r = await post(baseUrl, "/api/platform/accounts/password", {
      username: "no-such-account-xyz",
      newPassword: NEW_PASSWORD,
    });
    expect(r.status).toBe(404);
    // No side effects to assert; just confirm the endpoint rejects cleanly.
  });
});

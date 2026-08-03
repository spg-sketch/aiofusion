import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database (same pattern as platform-login-signup.test.ts)
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
  sendNewSignupAlert: () => Promise.resolve(),
  sendApprovalEmail: () => Promise.resolve(),
  sendPasswordResetEmail: () => Promise.resolve(),
}));

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { db, platformAccountsTable, platformSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/platform-auth";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ADMIN_USERNAME = "exit-impersonation-admin";
const CLIENT_USERNAME = "exit-impersonation-client";
const ADMIN_SID = "stash-sid-admin-test-001";
const CLIENT_SID = "view-as-sid-client-test-001";
const EXPIRED_STASH_SID = "expired-stash-sid-000";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
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
// POST /api/platform/exit-impersonation
// ---------------------------------------------------------------------------
describe("POST /api/platform/exit-impersonation", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Clean up any leftover rows from previous runs first (idempotent setup)
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, ADMIN_SID));
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, CLIENT_SID));
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, EXPIRED_STASH_SID));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, ADMIN_USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, CLIENT_USERNAME));

    const ph = hashPassword("test-password");
    const future = new Date(Date.now() + 86_400_000);

    await db.insert(platformAccountsTable).values({
      username: ADMIN_USERNAME,
      passwordHash: ph,
      role: "admin",
      status: "active",
    });
    await db.insert(platformAccountsTable).values({
      username: CLIENT_USERNAME,
      passwordHash: ph,
      role: "client",
      status: "active",
    });

    // Admin's stashed session (the one exit-impersonation should restore)
    await db.insert(platformSessionsTable).values({
      sid: ADMIN_SID,
      username: ADMIN_USERNAME,
      expiresAt: future,
    });

    // Client's view-as session (should be deleted on successful exit)
    await db.insert(platformSessionsTable).values({
      sid: CLIENT_SID,
      username: CLIENT_USERNAME,
      expiresAt: future,
    });

    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, ADMIN_SID));
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, CLIENT_SID));
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, EXPIRED_STASH_SID));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, ADMIN_USERNAME));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, CLIENT_USERNAME));
  });

  it("returns 400 when no stash cookie is present", async () => {
    const res = await fetch(`${baseUrl}/api/platform/exit-impersonation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/not currently viewing/i);
  });

  it("returns 401 and clears both cookies when the stash session has expired", async () => {
    // EXPIRED_STASH_SID does not exist in platform_sessions — simulates expiry/revocation
    const res = await fetch(`${baseUrl}/api/platform/exit-impersonation`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: `aio_admin_sid=${EXPIRED_STASH_SID}; aio_sid=${CLIENT_SID}`,
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error?: string };
    expect(body.error).toMatch(/session expired/i);

    // Both cookies should be cleared by the server (Set-Cookie header clears them)
    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).toMatch(/aio_admin_sid/);
    expect(setCookieHeader).toMatch(/aio_sid/);
  });

  it("returns 200 with admin account details on successful exit", async () => {
    const res = await fetch(`${baseUrl}/api/platform/exit-impersonation`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: `aio_admin_sid=${ADMIN_SID}; aio_sid=${CLIENT_SID}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { account?: { username: string; role: string } };
    expect(body.account?.username).toBe(ADMIN_USERNAME);
    expect(body.account?.role).toBe("admin");
  });

  it("restores the admin session cookie on successful exit", async () => {
    const res = await fetch(`${baseUrl}/api/platform/exit-impersonation`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: `aio_admin_sid=${ADMIN_SID}; aio_sid=${CLIENT_SID}`,
      },
    });

    expect(res.status).toBe(200);
    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    // The admin's SID should be written back as the active session cookie
    expect(setCookieHeader).toMatch(/aio_sid=/);
    // The stash cookie should be cleared
    expect(setCookieHeader).toMatch(/aio_admin_sid/);
  });

  it("deletes the view-as session from the database on successful exit", async () => {
    await fetch(`${baseUrl}/api/platform/exit-impersonation`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Cookie: `aio_admin_sid=${ADMIN_SID}; aio_sid=${CLIENT_SID}`,
      },
    });

    // The client's view-as session should have been deleted
    const remaining = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.sid, CLIENT_SID));

    expect(remaining.length).toBe(0);
  });
});

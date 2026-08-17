import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// Hoisted captures -- must be above all vi.mock calls
// ---------------------------------------------------------------------------
const clientAccountCreatedCalls = vi.hoisted(
  () =>
    [] as Array<{
      toEmail: string;
      contactName: string;
      companyName: string;
      agencyName: string;
      username: string;
      loginUrl: string;
      setPasswordUrl?: string;
    }>,
);

const accessChangedCalls = vi.hoisted(
  () =>
    [] as Array<{
      toEmail: string;
      contactName: string;
      companyName: string;
      agencyName: string;
      action: "revoked" | "restored";
    }>,
);

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
      billing_address varchar(512),
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
    CREATE TABLE IF NOT EXISTS platform_invitations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token varchar(64) NOT NULL UNIQUE,
      company_slug varchar(64) NOT NULL,
      company_id uuid NOT NULL,
      invited_email varchar(255) NOT NULL,
      role varchar NOT NULL DEFAULT 'member',
      invited_name varchar(128),
      position varchar(128),
      invited_by_user_id uuid,
      invited_by_username varchar(64),
      expires_at timestamptz NOT NULL,
      accepted_at timestamptz,
      reminder_sent_at timestamptz,
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
    platformInvitationsTable: schema.platformInvitationsTable,
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

// requirePlatformAuth injects req.account from the x-test-account header
vi.mock("../middleware/platform-auth", () => {
  const inject = (req: any, _res: unknown, next: () => void) => {
    try {
      const raw = req.headers["x-test-account"];
      req.account = raw ? JSON.parse(raw as string) : null;
    } catch {
      req.account = null;
    }
    next();
  };
  return {
    requirePlatformAuth: inject,
    // Used app-wide for routes like /platform/me that read req.account
    // without requiring auth.
    resolvePlatformAccount: inject,
  };
});

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
  mock.sendClientAccountCreatedEmail = (opts: (typeof clientAccountCreatedCalls)[number]) => {
    clientAccountCreatedCalls.push(opts);
    return Promise.resolve();
  };
  mock.sendClientAccessChangedEmail = (opts: (typeof accessChangedCalls)[number]) => {
    accessChangedCalls.push(opts);
    return Promise.resolve();
  };
  return mock;
});

import {
  db,
  platformUsersTable,
  platformAccountsTable,
  platformMembershipsTable,
  platformCompaniesTable,
  platformMetaTable,
  platformSessionsTable,
  platformPasswordResetsTable,
} from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/platform-auth";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import platformRouter from "./platform";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(resolvePlatformAccount as never);
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

/** Wait briefly for fire-and-forget async tasks to settle. */
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 80));
}

const AGENCY = "ca-agency";
const OTHER_AGENCY = "ca-other-agency";
const CLIENT = "ca-client";
const CONTACT_EMAIL = "ca-contact@example.com";
const MANAGED_KEY = `account:managed:${CLIENT}`;
const INITIAL_PASSWORD = "InitialPass123";

describe("POST /api/platform/accounts/access", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    clientAccountCreatedCalls.length = 0;
    accessChangedCalls.length = 0;

    // Parents are seeded with the legacy "user" role: grant/set-password only
    // remain available to non-partner parents. Clients under a real "agency"
    // (Agency/Partner) parent are permanently managed - covered by the
    // "agency partner clients" describe block below.
    await db.insert(platformAccountsTable).values([
      { username: AGENCY, passwordHash: hashPassword("agencypass1"), role: "user", status: "active" },
      { username: OTHER_AGENCY, passwordHash: hashPassword("agencypass2"), role: "user", status: "active" },
      {
        username: CLIENT,
        passwordHash: hashPassword(INITIAL_PASSWORD),
        role: "client",
        parent: AGENCY,
        status: "active",
        email: CONTACT_EMAIL,
      },
    ]);

    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);

    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, CLIENT));
    const [contactUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    if (contactUser) {
      await db.delete(platformPasswordResetsTable).where(eq(platformPasswordResetsTable.userId, contactUser.id));
      await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, contactUser.id));
      await db.delete(platformUsersTable).where(eq(platformUsersTable.id, contactUser.id));
    }
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, CLIENT));
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, `%${CLIENT}%`));
    for (const u of [CLIENT, AGENCY, OTHER_AGENCY]) {
      await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, u));
    }
  });

  async function callAccess(body: Record<string, unknown>, actor = AGENCY) {
    return fetch(`${baseUrl}/api/platform/accounts/access`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify({ username: actor, role: "agency", userId: null }),
      },
      body: JSON.stringify(body),
    });
  }

  async function setManagedFlag() {
    await db
      .insert(platformMetaTable)
      .values({ key: MANAGED_KEY, value: "true" })
      .onConflictDoUpdate({ target: platformMetaTable.key, set: { value: "true" } });
  }

  async function managedFlagExists(): Promise<boolean> {
    const rows = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, MANAGED_KEY));
    return rows.length > 0;
  }

  // -------------------------------------------------------------------------
  // Last sign-in exposure (GET /platform/accounts)
  // -------------------------------------------------------------------------
  it("GET /platform/accounts includes lastSignInAt for accounts with a live session and omits it otherwise", async () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    await db.insert(platformSessionsTable).values({
      sid: "ca-last-signin-sid",
      username: CLIENT,
      createdAt,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await fetch(`${baseUrl}/api/platform/accounts`, {
      headers: { "x-test-account": JSON.stringify({ username: AGENCY, role: "agency", userId: null }) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accounts: Array<{ username: string; lastSignInAt?: string }> };
    const client = body.accounts.find((a) => a.username === CLIENT);
    expect(client).toBeDefined();
    expect(client!.lastSignInAt).toBeDefined();
    expect(Math.abs(new Date(client!.lastSignInAt!).getTime() - createdAt.getTime())).toBeLessThan(2000);
    const agency = body.accounts.find((a) => a.username === AGENCY);
    expect(agency).toBeDefined();
    expect(agency!.lastSignInAt).toBeUndefined();
  });

  it("GET /platform/accounts omits lastSignInAt when the account's only sessions have expired", async () => {
    await db.insert(platformSessionsTable).values({
      sid: "ca-expired-sid",
      username: CLIENT,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // expired an hour ago
    });

    const res = await fetch(`${baseUrl}/api/platform/accounts`, {
      headers: { "x-test-account": JSON.stringify({ username: AGENCY, role: "agency", userId: null }) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accounts: Array<{ username: string; lastSignInAt?: string }> };
    const client = body.accounts.find((a) => a.username === CLIENT);
    expect(client).toBeDefined();
    expect(client!.lastSignInAt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Grant via email
  // -------------------------------------------------------------------------
  it("grant (email): creates the user, issues a 7-day token, emails the set-password link, clears the managed flag", async () => {
    await setManagedFlag();

    const res = await callAccess({ username: CLIENT, action: "grant" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; emailSent?: boolean };
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(true);

    await flushAsync();

    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    expect(userRow).toBeDefined();

    const [tokenRow] = await db
      .select()
      .from(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, userRow!.id))
      .limit(1);
    expect(tokenRow).toBeDefined();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiresIn = tokenRow!.expiresAt.getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(sevenDaysMs - 10_000);
    expect(expiresIn).toBeLessThanOrEqual(sevenDaysMs + 10_000);

    expect(clientAccountCreatedCalls.length).toBe(1);
    expect(clientAccountCreatedCalls[0]!.toEmail).toBe(CONTACT_EMAIL);
    expect(clientAccountCreatedCalls[0]!.setPasswordUrl).toContain(`reset_token=${tokenRow!.token}`);
    expect(clientAccountCreatedCalls[0]!.setPasswordUrl).toContain("welcome=1");

    expect(await managedFlagExists()).toBe(false);
  });

  it("grant (email): issues a token even for an existing user whose only membership is this client account", async () => {
    await setManagedFlag();
    // Existing user whose sole membership is the client account (e.g. access
    // was granted before and later revoked).
    await db.insert(platformUsersTable).values({
      email: CONTACT_EMAIL,
      name: "Existing Contact",
      passwordHash: hashPassword("scrambled-old"),
    });
    const [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    await db.insert(platformCompaniesTable).values({ slug: CLIENT, role: "client" });
    const [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, CLIENT))
      .limit(1);
    await db.insert(platformMembershipsTable).values({
      userId: u!.id,
      companyId: co!.id,
      companySlug: CLIENT,
      role: "owner",
    });

    const res = await callAccess({ username: CLIENT, action: "grant" });
    expect(res.status).toBe(200);
    await flushAsync();

    const tokens = await db
      .select()
      .from(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, u!.id));
    expect(tokens.length).toBe(1);
    expect(clientAccountCreatedCalls.length).toBe(1);
    expect(clientAccountCreatedCalls[0]!.setPasswordUrl).toContain(`reset_token=${tokens[0]!.token}`);
  });

  // -------------------------------------------------------------------------
  // Grant via direct password
  // -------------------------------------------------------------------------
  it("grant (password): sets the password directly, clears the managed flag, sends no email", async () => {
    await setManagedFlag();

    const res = await callAccess({ username: CLIENT, action: "grant", password: "ClientChosen99" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; emailSent?: boolean };
    expect(body.emailSent).toBe(false);

    await flushAsync();

    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, CLIENT))
      .limit(1);
    expect(verifyPassword("ClientChosen99", acct!.passwordHash)).toBe(true);
    expect(await managedFlagExists()).toBe(false);
    expect(clientAccountCreatedCalls.length).toBe(0);
    // Courtesy "access restored" notice goes to the key contact.
    expect(accessChangedCalls.length).toBe(1);
    expect(accessChangedCalls[0]!.toEmail).toBe(CONTACT_EMAIL);
    expect(accessChangedCalls[0]!.action).toBe("restored");
  });

  it("grant (password): rejects passwords shorter than 8 characters", async () => {
    const res = await callAccess({ username: CLIENT, action: "grant", password: "short" });
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Revoke
  // -------------------------------------------------------------------------
  it("revoke: scrambles the password, deletes sessions and reset tokens, sets the managed flag", async () => {
    // Seed a user + membership + a pending reset token + an active session.
    await db.insert(platformUsersTable).values({
      email: CONTACT_EMAIL,
      name: "Contact",
      passwordHash: hashPassword(INITIAL_PASSWORD),
    });
    const [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    await db.insert(platformCompaniesTable).values({ slug: CLIENT, role: "client" });
    const [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, CLIENT))
      .limit(1);
    await db.insert(platformMembershipsTable).values({
      userId: u!.id,
      companyId: co!.id,
      companySlug: CLIENT,
      role: "owner",
    });
    await db.insert(platformPasswordResetsTable).values({
      token: "pending-welcome-token-revoke",
      userId: u!.id,
      expiresAt: new Date(Date.now() + 86400000),
    });
    await db.insert(platformSessionsTable).values({
      sid: "revoke-test-sid",
      username: CLIENT,
      userId: u!.id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // The fresh session above trips the recent-sign-in warning first.
    const warned = await callAccess({ username: CLIENT, action: "revoke" });
    expect(warned.status).toBe(409);
    const warnedBody = (await warned.json()) as { requiresConfirmation?: boolean; lastSignInAt?: string };
    expect(warnedBody.requiresConfirmation).toBe(true);
    expect(typeof warnedBody.lastSignInAt).toBe("string");
    // Nothing destructive happened yet.
    expect(await managedFlagExists()).toBe(false);

    const res = await callAccess({ username: CLIENT, action: "revoke", confirmRecentSignIn: true });
    expect(res.status).toBe(200);

    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, CLIENT))
      .limit(1);
    expect(verifyPassword(INITIAL_PASSWORD, acct!.passwordHash)).toBe(false);

    const [userAfter] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, u!.id))
      .limit(1);
    expect(verifyPassword(INITIAL_PASSWORD, userAfter!.passwordHash ?? "")).toBe(false);
    expect(userAfter!.sessionVersion).toBeGreaterThan(0);

    const sessions = await db
      .select()
      .from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, CLIENT));
    expect(sessions.length).toBe(0);

    const tokens = await db
      .select()
      .from(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, u!.id));
    expect(tokens.length).toBe(0);

    expect(await managedFlagExists()).toBe(true);

    // Courtesy/security notice goes to the key contact.
    await flushAsync();
    expect(accessChangedCalls.length).toBe(1);
    expect(accessChangedCalls[0]!.toEmail).toBe(CONTACT_EMAIL);
    expect(accessChangedCalls[0]!.action).toBe("revoked");
  });

  it("mark-managed: sets the managed flag and scrambles credentials (backfill for pre-flag managed accounts)", async () => {
    // Pre-existing managed account: no users row, no flag - just an account
    // with a random password that was never shared with the client.
    expect(await managedFlagExists()).toBe(false);

    const res = await callAccess({ username: CLIENT, action: "mark-managed" });
    expect(res.status).toBe(200);

    expect(await managedFlagExists()).toBe(true);
    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, CLIENT))
      .limit(1);
    expect(verifyPassword(INITIAL_PASSWORD, acct!.passwordHash)).toBe(false);
  });

  it("mark-managed: warns with 409 + lastSignInAt when the client signed in recently, proceeds with confirmRecentSignIn", async () => {
    await db.insert(platformSessionsTable).values({
      sid: "mark-managed-recent-sid",
      username: CLIENT,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const warned = await callAccess({ username: CLIENT, action: "mark-managed" });
    expect(warned.status).toBe(409);
    const body = (await warned.json()) as { requiresConfirmation?: boolean; lastSignInAt?: string };
    expect(body.requiresConfirmation).toBe(true);
    expect(typeof body.lastSignInAt).toBe("string");
    // The warning must not have changed anything.
    expect(await managedFlagExists()).toBe(false);
    const [acctBefore] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, CLIENT))
      .limit(1);
    expect(verifyPassword(INITIAL_PASSWORD, acctBefore!.passwordHash)).toBe(true);

    const confirmed = await callAccess({ username: CLIENT, action: "mark-managed", confirmRecentSignIn: true });
    expect(confirmed.status).toBe(200);
    expect(await managedFlagExists()).toBe(true);
  });

  it("mark-managed: no warning when the last sign-in is outside the recent window", async () => {
    // A session created 60 days ago - long outside the 30-day window.
    await db.insert(platformSessionsTable).values({
      sid: "mark-managed-old-sid",
      username: CLIENT,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await callAccess({ username: CLIENT, action: "mark-managed" });
    expect(res.status).toBe(200);
    expect(await managedFlagExists()).toBe(true);
  });

  it("rejects unknown actions", async () => {
    const res = await callAccess({ username: CLIENT, action: "toggle" });
    expect(res.status).toBe(400);
  });

  it("revoke: leaves platform_users untouched when the human belongs to other workspaces too", async () => {
    await db.insert(platformUsersTable).values({
      email: CONTACT_EMAIL,
      name: "Multi Workspace Human",
      passwordHash: hashPassword(INITIAL_PASSWORD),
    });
    const [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    await db.insert(platformCompaniesTable).values([
      { slug: CLIENT, role: "client" },
      { slug: `${CLIENT}-other`, role: "client" },
    ]);
    const cos = await db.select().from(platformCompaniesTable);
    for (const co of cos.filter((c) => c.slug.startsWith(CLIENT))) {
      await db.insert(platformMembershipsTable).values({
        userId: u!.id,
        companyId: co.id,
        companySlug: co.slug,
        role: "owner",
      });
    }

    const res = await callAccess({ username: CLIENT, action: "revoke" });
    expect(res.status).toBe(200);

    const [userAfter] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, u!.id))
      .limit(1);
    // Their cross-workspace credential must still verify.
    expect(verifyPassword(INITIAL_PASSWORD, userAfter!.passwordHash ?? "")).toBe(true);

    // Cleanup the extra company + membership.
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, `${CLIENT}-other`));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, `${CLIENT}-other`));
  });

  // -------------------------------------------------------------------------
  // Authorization boundaries
  // -------------------------------------------------------------------------
  it("returns 403 when the target is outside the caller's subtree", async () => {
    const res = await callAccess({ username: CLIENT, action: "grant" }, OTHER_AGENCY);
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-client target", async () => {
    // Nest a sub-agency under the caller so canManage passes but role check fails.
    await db.insert(platformAccountsTable).values({
      username: "ca-sub-agency",
      passwordHash: hashPassword("subagencypass1"),
      role: "agency",
      parent: AGENCY,
      status: "active",
    });
    const res = await callAccess({ username: "ca-sub-agency", action: "revoke" });
    expect(res.status).toBe(400);
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, "ca-sub-agency"));
  });

  it("returns 403 for viewer/billing/member team members of the agency", async () => {
    for (const memRole of ["viewer", "billing", "member"]) {
      const res = await fetch(`${baseUrl}/api/platform/accounts/access`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-account": JSON.stringify({ username: AGENCY, role: "agency", membershipRole: memRole, userId: null }),
        },
        body: JSON.stringify({ username: CLIENT, action: "revoke" }),
      });
      expect(res.status).toBe(403);
    }
    // Team admins are allowed.
    const adminRes = await fetch(`${baseUrl}/api/platform/accounts/access`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify({ username: AGENCY, role: "agency", membershipRole: "admin", userId: null }),
      },
      body: JSON.stringify({ username: CLIENT, action: "revoke" }),
    });
    expect(adminRes.status).toBe(200);
  });

  it("grant (email): refuses with 409 when the contact email belongs to a user with other workspaces", async () => {
    await setManagedFlag();
    await db.insert(platformUsersTable).values({
      email: CONTACT_EMAIL,
      passwordHash: hashPassword("their-own-pass"),
    });
    const [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    await db.insert(platformCompaniesTable).values({ slug: "some-unrelated-co", role: "agency" });
    const [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "some-unrelated-co"))
      .limit(1);
    await db.insert(platformMembershipsTable).values({
      userId: u!.id,
      companyId: co!.id,
      companySlug: "some-unrelated-co",
      role: "owner",
    });

    const res = await callAccess({ username: CLIENT, action: "grant" });
    expect(res.status).toBe(409);
    // Access must NOT have been enabled and no email sent.
    expect(await managedFlagExists()).toBe(true);
    expect(clientAccountCreatedCalls.length).toBe(0);
    // Their unrelated credential is untouched.
    const [after] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, u!.id))
      .limit(1);
    expect(verifyPassword("their-own-pass", after!.passwordHash ?? "")).toBe(true);

    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, "some-unrelated-co"));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "some-unrelated-co"));
  });

  it("returns 400 for an unknown action", async () => {
    const res = await callAccess({ username: CLIENT, action: "toggle" });
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Login enforcement: the managed flag must block every sign-in path
  // -------------------------------------------------------------------------
  async function callLogin(username: string, password: string) {
    return fetch(`${baseUrl}/api/platform/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  }

  it("login: a managed account is rejected even with the correct password (slug + email identifiers)", async () => {
    await setManagedFlag();

    const bySlug = await callLogin(CLIENT, INITIAL_PASSWORD);
    expect(bySlug.status).toBe(403);
    const body = (await bySlug.json()) as { error?: string };
    expect(body.error).toMatch(/managed by your agency/i);

    // Email identifier resolves via platform_users - the slug login above may
    // already have back-filled user/company/membership rows via
    // ensurePlatformUser, so upsert rather than insert.
    let [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    if (!u) {
      [u] = await db
        .insert(platformUsersTable)
        .values({ email: CONTACT_EMAIL, passwordHash: hashPassword(INITIAL_PASSWORD) })
        .returning();
    } else {
      await db
        .update(platformUsersTable)
        .set({ passwordHash: hashPassword(INITIAL_PASSWORD) })
        .where(eq(platformUsersTable.id, u.id));
    }
    let [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, CLIENT))
      .limit(1);
    if (!co) {
      [co] = await db
        .insert(platformCompaniesTable)
        .values({ slug: CLIENT, role: "client" })
        .returning();
    }
    const existingMem = await db
      .select()
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, u!.id));
    if (!existingMem.some((m) => m.companySlug === CLIENT)) {
      await db.insert(platformMembershipsTable).values({
        userId: u!.id,
        companyId: co!.id,
        companySlug: CLIENT,
        role: "owner",
      });
    }

    const byEmail = await callLogin(CONTACT_EMAIL, INITIAL_PASSWORD);
    expect(byEmail.status).toBe(403);
  });

  it("login: after revoke the client cannot sign in; after re-grant with a password they can again", async () => {
    // Sanity: login works before revoke.
    const before = await callLogin(CLIENT, INITIAL_PASSWORD);
    expect(before.status).toBe(200);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, CLIENT));

    const revoke = await callAccess({ username: CLIENT, action: "revoke" });
    expect(revoke.status).toBe(200);

    // Old password is dead AND the managed flag blocks the path outright.
    const after = await callLogin(CLIENT, INITIAL_PASSWORD);
    expect([401, 403]).toContain(after.status);

    // Re-grant with a fresh password restores sign-in.
    const grant = await callAccess({ username: CLIENT, action: "grant", password: "FreshPass123" });
    expect(grant.status).toBe(200);
    const restored = await callLogin(CLIENT, "FreshPass123");
    expect(restored.status).toBe(200);
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, CLIENT));
  });

  it("login: a multi-workspace human keeps signing in to their OTHER workspace after the client one is revoked", async () => {
    // Human belongs to the managed client AND a second, unmanaged workspace.
    await db.insert(platformUsersTable).values({
      email: CONTACT_EMAIL,
      passwordHash: hashPassword(INITIAL_PASSWORD),
    });
    const [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    await db.insert(platformAccountsTable).values({
      username: `${CLIENT}-other`,
      passwordHash: hashPassword("otherpass123"),
      role: "client",
      status: "active",
    });
    await db.insert(platformCompaniesTable).values([
      { slug: `${CLIENT}-other`, role: "client" },
      { slug: CLIENT, role: "client" },
    ]);
    const cos = await db.select().from(platformCompaniesTable);
    // Insert the OTHER membership first, the managed one second (most recent =
    // primary) so the fallback logic is actually exercised.
    const otherCo = cos.find((c) => c.slug === `${CLIENT}-other`)!;
    const clientCo = cos.find((c) => c.slug === CLIENT)!;
    await db.insert(platformMembershipsTable).values({
      userId: u!.id, companyId: otherCo.id, companySlug: otherCo.slug, role: "owner",
      createdAt: new Date(Date.now() - 60_000),
    });
    await db.insert(platformMembershipsTable).values({
      userId: u!.id, companyId: clientCo.id, companySlug: CLIENT, role: "owner",
    });

    const revoke = await callAccess({ username: CLIENT, action: "revoke" });
    expect(revoke.status).toBe(200);

    // Their password is untouched and email login lands in the other workspace.
    const res = await callLogin(CONTACT_EMAIL, INITIAL_PASSWORD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { account?: { username?: string } };
    expect(body.account?.username).toBe(`${CLIENT}-other`);

    // Cleanup extra rows.
    await db.delete(platformSessionsTable).where(eq(platformSessionsTable.username, `${CLIENT}-other`));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, `${CLIENT}-other`));
    await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, `${CLIENT}-other`));
    await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, `${CLIENT}-other`));
  });

  it("switch-workspace: a multi-workspace human cannot switch into a managed client workspace", async () => {
    await setManagedFlag();
    await db.insert(platformUsersTable).values({
      email: CONTACT_EMAIL,
      passwordHash: hashPassword(INITIAL_PASSWORD),
    });
    const [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    await db.insert(platformCompaniesTable).values({ slug: CLIENT, role: "client", status: "active" });
    const [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, CLIENT))
      .limit(1);
    await db.insert(platformMembershipsTable).values({
      userId: u!.id,
      companyId: co!.id,
      companySlug: CLIENT,
      role: "owner",
    });

    const res = await fetch(`${baseUrl}/api/platform/switch-workspace`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify({ username: "some-other-workspace", role: "client", userId: u!.id }),
      },
      body: JSON.stringify({ companyId: co!.id }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/managed by your agency/i);
  });
});

// ---------------------------------------------------------------------------
// Agency partner clients: permanently managed. Clients whose PARENT account
// has role "agency" (Agency/Partner) can never be given sign-in access, never
// have a password set by their parent, and are always created as managed
// regardless of what the request body says.
// ---------------------------------------------------------------------------
describe("agency partner clients are permanently managed", () => {
  let server: Server;
  let baseUrl: string;

  const PARTNER = "ap-partner";
  const PARTNER_CLIENT = "ap-client";
  const PARTNER_CONTACT = "ap-contact@example.com";

  beforeEach(async () => {
    clientAccountCreatedCalls.length = 0;
    await db.insert(platformAccountsTable).values([
      { username: PARTNER, passwordHash: hashPassword("partnerpass1"), role: "agency", status: "active" },
      {
        username: PARTNER_CLIENT,
        passwordHash: hashPassword("ClientPass123"),
        role: "client",
        parent: PARTNER,
        status: "active",
        email: PARTNER_CONTACT,
      },
    ]);
    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);
    const [contactUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, PARTNER_CONTACT))
      .limit(1);
    if (contactUser) {
      await db.delete(platformPasswordResetsTable).where(eq(platformPasswordResetsTable.userId, contactUser.id));
      await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, contactUser.id));
      await db.delete(platformUsersTable).where(eq(platformUsersTable.id, contactUser.id));
    }
    await db.delete(platformMetaTable).where(like(platformMetaTable.key, `%ap-%`));
    await db.delete(platformCompaniesTable).where(like(platformCompaniesTable.slug, "ap-%"));
    await db.delete(platformAccountsTable).where(like(platformAccountsTable.username, "ap-%"));
  });

  const partnerHeaders = {
    "content-type": "application/json",
    "x-test-account": JSON.stringify({ username: PARTNER, role: "agency", userId: null }),
  };

  it("access grant (email and password) is refused with a clear error", async () => {
    for (const body of [
      { username: PARTNER_CLIENT, action: "grant" },
      { username: PARTNER_CLIENT, action: "grant", password: "FreshPass123" },
    ]) {
      const res = await fetch(`${baseUrl}/api/platform/accounts/access`, {
        method: "POST",
        headers: partnerHeaders,
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error?: string };
      expect(json.error).toMatch(/managed by your agency/i);
    }
    // No welcome email may have been sent.
    await flushAsync();
    expect(clientAccountCreatedCalls.length).toBe(0);
  });

  it("revoke and mark-managed remain available as a clean-up path", async () => {
    const res = await fetch(`${baseUrl}/api/platform/accounts/access`, {
      method: "POST",
      headers: partnerHeaders,
      body: JSON.stringify({ username: PARTNER_CLIENT, action: "mark-managed", confirmRecentSignIn: true }),
    });
    expect(res.status).toBe(200);
  });

  it("the parent cannot set a password on the client account", async () => {
    const res = await fetch(`${baseUrl}/api/platform/accounts/password`, {
      method: "POST",
      headers: partnerHeaders,
      body: JSON.stringify({ username: PARTNER_CLIENT, newPassword: "NewPass12345" }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/managed by your agency/i);
    // Old password hash is untouched.
    const [row] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, PARTNER_CLIENT))
      .limit(1);
    expect(verifyPassword("ClientPass123", row!.passwordHash)).toBe(true);
  });

  it("creation by an agency partner is always managed - even without the managed flag, and with a contact email", async () => {
    const res = await fetch(`${baseUrl}/api/platform/accounts`, {
      method: "POST",
      headers: partnerHeaders,
      body: JSON.stringify({
        username: "ap-new-client",
        role: "client",
        contactEmail: "ap-new-contact@example.com",
        contactName: "New Contact",
        displayName: "AP New Client",
        // NOTE: no password and no managed flag - the server must still
        // create the account as managed with a random password.
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; username: string; welcomeLinkCreated?: boolean };
    expect(body.ok).toBe(true);
    // Managed flag persisted.
    const [flag] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `account:managed:${body.username}`))
      .limit(1);
    expect(flag?.value).toBe("true");
    // No welcome email, no set-password link.
    expect(body.welcomeLinkCreated).toBeUndefined();
    await flushAsync();
    expect(clientAccountCreatedCalls.length).toBe(0);
  });

  it("creation by an agency partner discards a caller-supplied password (direct API call)", async () => {
    const supplied = "AttackerChosenPass123";
    const res = await fetch(`${baseUrl}/api/platform/accounts`, {
      method: "POST",
      headers: partnerHeaders,
      body: JSON.stringify({
        username: "ap-pw-client",
        role: "client",
        password: supplied,
        displayName: "AP PW Client",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; username: string; welcomeLinkCreated?: boolean };
    expect(body.ok).toBe(true);
    // Server must have replaced the supplied password with a random one.
    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, body.username))
      .limit(1);
    expect(verifyPassword(supplied, acct!.passwordHash)).toBe(false);
    // Still managed, no welcome link.
    const [flag] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `account:managed:${body.username}`))
      .limit(1);
    expect(flag?.value).toBe("true");
    expect(body.welcomeLinkCreated).toBeUndefined();
  });

  it("accounts/password: a client session cannot set a password for ITSELF either", async () => {
    const res = await fetch(`${baseUrl}/api/platform/accounts/password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify({ username: PARTNER_CLIENT, role: "client", userId: null }),
      },
      body: JSON.stringify({ username: PARTNER_CLIENT, newPassword: "SelfMintedPass123" }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error?: string }).error).toMatch(/managed by your agency/i);
    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, PARTNER_CLIENT))
      .limit(1);
    expect(verifyPassword("SelfMintedPass123", acct!.passwordHash)).toBe(false);
  });

  it("change-password: a leftover client session cannot mint its own password", async () => {
    const res = await fetch(`${baseUrl}/api/platform/change-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify({ username: PARTNER_CLIENT, role: "client", userId: null }),
      },
      body: JSON.stringify({ currentPassword: "ClientPass123", newPassword: "SneakyPass123" }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error?: string }).error).toMatch(/managed by your agency/i);
  });

  it("request-set-password: an SSO session on a partner client gets no set-password link", async () => {
    await db.insert(platformUsersTable).values({ email: PARTNER_CONTACT, passwordHash: null });
    const res = await fetch(`${baseUrl}/api/platform/request-set-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify({ username: PARTNER_CLIENT, role: "client", userId: null }),
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error?: string }).error).toMatch(/managed by your agency/i);
  });

  it("reset-password: refused when the human's only workspace is a partner client", async () => {
    const [u] = await db
      .insert(platformUsersTable)
      .values({ email: PARTNER_CONTACT, passwordHash: hashPassword("OldPass12345") })
      .returning();
    const [co] = await db
      .insert(platformCompaniesTable)
      .values({ slug: PARTNER_CLIENT, role: "client" })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: u!.id,
      companyId: co!.id,
      companySlug: PARTNER_CLIENT,
      role: "owner",
    });
    await db.insert(platformPasswordResetsTable).values({
      token: "ap-reset-token",
      userId: u!.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "ap-reset-token", password: "NewPass12345" }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error?: string }).error).toMatch(/managed by your agency/i);

    // Neither credential store has been touched.
    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, PARTNER_CLIENT))
      .limit(1);
    expect(verifyPassword("ClientPass123", acct!.passwordHash)).toBe(true);
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, u!.id))
      .limit(1);
    expect(verifyPassword("OldPass12345", userRow!.passwordHash!)).toBe(true);
  });

  it("GET /platform/me reports agencyManagedClient=true for the client and false for the parent", async () => {
    const asClient = await fetch(`${baseUrl}/api/platform/me`, {
      headers: { "x-test-account": JSON.stringify({ username: PARTNER_CLIENT, role: "client", userId: null }) },
    });
    expect(asClient.status).toBe(200);
    expect(((await asClient.json()) as { agencyManagedClient?: boolean }).agencyManagedClient).toBe(true);

    const asPartner = await fetch(`${baseUrl}/api/platform/me`, {
      headers: { "x-test-account": JSON.stringify({ username: PARTNER, role: "agency", userId: null }) },
    });
    expect(asPartner.status).toBe(200);
    expect(((await asPartner.json()) as { agencyManagedClient?: boolean }).agencyManagedClient).toBe(false);
  });
});

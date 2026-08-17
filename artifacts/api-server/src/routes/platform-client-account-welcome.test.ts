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
  // Spy: capture sendClientAccountCreatedEmail calls.
  mock.sendClientAccountCreatedEmail = (opts: (typeof clientAccountCreatedCalls)[number]) => {
    clientAccountCreatedCalls.push(opts);
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
  platformPasswordResetsTable,
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

/** Wait briefly for fire-and-forget async tasks to settle. */
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 80));
}

// ---------------------------------------------------------------------------
// POST /api/platform/accounts -- welcome token issuance
// ---------------------------------------------------------------------------
describe("POST /api/platform/accounts -- welcome token for new client contact", () => {
  let server: Server;
  let baseUrl: string;

  const AGENCY_USERNAME = "wt-agency";
  const CLIENT_USERNAME = "wt-client";
  const CONTACT_EMAIL = "contact@newclient.example.com";
  const CONTACT_NAME = "Alice Contact";
  const AGENCY_PASSWORD = "agencypass1";

  beforeEach(async () => {
    clientAccountCreatedCalls.length = 0;

    // Seed the account that will create the sub-account. Role "user" (legacy
    // agency): the welcome-email flow only applies to non-partner parents -
    // an "agency" (Agency/Partner) actor always creates managed clients with
    // no welcome email (covered in platform-client-access.test.ts).
    const ph = hashPassword(AGENCY_PASSWORD);
    await db.insert(platformAccountsTable).values({
      username: AGENCY_USERNAME,
      passwordHash: ph,
      role: "user",
      status: "active",
    });

    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);

    // Tear down all rows created during the test.
    // Delete in FK-safe order: memberships → users, then companies, then accounts.
    const [contactUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    if (contactUser) {
      await db
        .delete(platformPasswordResetsTable)
        .where(eq(platformPasswordResetsTable.userId, contactUser.id));
      await db
        .delete(platformMembershipsTable)
        .where(eq(platformMembershipsTable.userId, contactUser.id));
      await db
        .delete(platformUsersTable)
        .where(eq(platformUsersTable.id, contactUser.id));
    }
    await db
      .delete(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, CLIENT_USERNAME));
    await db
      .delete(platformAccountsTable)
      .where(eq(platformAccountsTable.username, CLIENT_USERNAME));
    await db
      .delete(platformAccountsTable)
      .where(eq(platformAccountsTable.username, AGENCY_USERNAME));
  });

  async function createClientAccount(body: Record<string, unknown>) {
    return fetch(`${baseUrl}/api/platform/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-account": JSON.stringify({
          username: AGENCY_USERNAME,
          role: "user",
          userId: null,
        }),
      },
      body: JSON.stringify(body),
    });
  }

  // ---------------------------------------------------------------------------
  // Case 1: creation with contactEmail issues platform_users + 7-day token + email URL
  // ---------------------------------------------------------------------------
  it("creates a platform_users row, a 7-day reset token, and sends the set-password URL", async () => {
    const res = await createClientAccount({
      username: CLIENT_USERNAME,
      password: "ClientPass123",
      role: "client",
      contactEmail: CONTACT_EMAIL,
      contactName: CONTACT_NAME,
      displayName: "New Client Co",
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; username: string };
    expect(body.ok).toBe(true);

    await flushAsync();

    // platform_users row must exist for the contact email.
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    expect(userRow).toBeDefined();
    expect(userRow!.name).toBe(CONTACT_NAME);

    // A platform_password_resets token must exist for this user.
    const [tokenRow] = await db
      .select()
      .from(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, userRow!.id))
      .limit(1);
    expect(tokenRow).toBeDefined();
    expect(tokenRow!.usedAt).toBeNull();

    // Token must expire ≈ 7 days from now (within 10 s tolerance).
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiresIn = tokenRow!.expiresAt.getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(sevenDaysMs - 10_000);
    expect(expiresIn).toBeLessThanOrEqual(sevenDaysMs + 10_000);

    // Email was sent with a setPasswordUrl containing reset_token and welcome=1.
    expect(clientAccountCreatedCalls.length).toBe(1);
    const call = clientAccountCreatedCalls[0]!;
    expect(call.toEmail).toBe(CONTACT_EMAIL);
    expect(call.setPasswordUrl).toContain(`reset_token=${tokenRow!.token}`);
    expect(call.setPasswordUrl).toContain("welcome=1");
    expect(call.setPasswordUrl).toContain("https://test.example.com");
  });

  // ---------------------------------------------------------------------------
  // Case 2: creation without contactEmail -- no token, no set-password URL
  // ---------------------------------------------------------------------------
  it("issues no token and no set-password URL when contactEmail is absent", async () => {
    const res = await createClientAccount({
      username: CLIENT_USERNAME,
      password: "ClientPass123",
      role: "client",
      // no contactEmail
    });

    expect(res.status).toBe(200);
    await flushAsync();

    // No platform_users row for the contact email exists (none was provided).
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    expect(userRow).toBeUndefined();

    // No email at all.
    expect(clientAccountCreatedCalls.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Case 3: contactEmail already exists -- no token, email sent without set-password URL
  // ---------------------------------------------------------------------------
  it("skips token issuance when contactEmail already has a platform_users row", async () => {
    // Pre-create a platform_users row for the contact email (simulates an
    // existing AIO Fusion user).
    await db.insert(platformUsersTable).values({
      email: CONTACT_EMAIL,
      name: "Existing User",
      passwordHash: hashPassword("existingpass1"),
    });

    const res = await createClientAccount({
      username: CLIENT_USERNAME,
      password: "ClientPass123",
      role: "client",
      contactEmail: CONTACT_EMAIL,
      contactName: CONTACT_NAME,
      displayName: "New Client Co",
    });

    expect(res.status).toBe(200);
    await flushAsync();

    // No token must have been issued.
    const [existingUser] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, CONTACT_EMAIL))
      .limit(1);
    const tokens = await db
      .select()
      .from(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, existingUser!.id));
    expect(tokens.length).toBe(0);

    // Email was sent, but WITHOUT a set-password URL.
    expect(clientAccountCreatedCalls.length).toBe(1);
    const call = clientAccountCreatedCalls[0]!;
    expect(call.toEmail).toBe(CONTACT_EMAIL);
    expect(call.setPasswordUrl).toBeUndefined();
    // loginUrl still present as fallback.
    expect(call.loginUrl).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// POST /api/platform/reset-password -- welcome token dual-write + expiry + single-use
// ---------------------------------------------------------------------------
describe("POST /api/platform/reset-password -- welcome token consume", () => {
  let server: Server;
  let baseUrl: string;

  const USERNAME = "wt-consume-client";
  const EMAIL = "consume-contact@example.com";
  const INITIAL_PH = hashPassword("initial-password");

  let userId: string;

  beforeEach(async () => {
    // Seed platform_users for the contact.
    await db.insert(platformUsersTable).values({
      email: EMAIL,
      name: "Consume User",
      passwordHash: INITIAL_PH,
    });
    const [u] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.email, EMAIL))
      .limit(1);
    userId = u!.id;

    // Seed legacy platform_accounts row (required for dual-write sync).
    await db.insert(platformAccountsTable).values({
      username: USERNAME,
      passwordHash: INITIAL_PH,
      role: "client",
      status: "active",
      email: EMAIL,
    });

    // Seed the platform_companies + membership so the dual-write path works.
    await db.insert(platformCompaniesTable).values({ slug: USERNAME, role: "client" });
    const [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, USERNAME))
      .limit(1);
    await db.insert(platformMembershipsTable).values({
      userId,
      companyId: co!.id,
      companySlug: USERNAME,
      role: "owner",
    });

    ({ server, baseUrl } = await startServer());
  });

  afterEach(async () => {
    await stopServer(server);

    await db
      .delete(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.userId, userId));
    await db
      .delete(platformMembershipsTable)
      .where(eq(platformMembershipsTable.companySlug, USERNAME));
    await db
      .delete(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, USERNAME));
    await db
      .delete(platformUsersTable)
      .where(eq(platformUsersTable.id, userId));
    await db
      .delete(platformAccountsTable)
      .where(eq(platformAccountsTable.username, USERNAME));
  });

  async function seedWelcomeToken(expiresAt: Date): Promise<string> {
    const token = `welcome-test-token-${Math.random().toString(36).slice(2)}`;
    await db.insert(platformPasswordResetsTable).values({ token, userId, expiresAt });
    return token;
  }

  // ---------------------------------------------------------------------------
  // Case 4: token consume dual-writes both password stores
  // ---------------------------------------------------------------------------
  it("consumes the welcome token and syncs the new password to both credential stores", async () => {
    const token = await seedWelcomeToken(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const newPassword = "BrandNewPass99";

    const res = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: newPassword }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    // Token must now be marked used.
    const [tokenRow] = await db
      .select()
      .from(platformPasswordResetsTable)
      .where(eq(platformPasswordResetsTable.token, token))
      .limit(1);
    expect(tokenRow!.usedAt).not.toBeNull();

    // platform_users password hash must have changed.
    const [userRow] = await db
      .select()
      .from(platformUsersTable)
      .where(eq(platformUsersTable.id, userId))
      .limit(1);
    expect(userRow!.passwordHash).not.toBe(INITIAL_PH);

    // Legacy platform_accounts must also be updated (dual-write).
    const [acctRow] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, USERNAME))
      .limit(1);
    expect(acctRow!.passwordHash).not.toBe(INITIAL_PH);
    expect(acctRow!.passwordHash).toBe(userRow!.passwordHash);
  });

  // ---------------------------------------------------------------------------
  // Case 5: expired token returns 400
  // ---------------------------------------------------------------------------
  it("returns 400 for an expired welcome token", async () => {
    const token = await seedWelcomeToken(new Date(Date.now() - 1000)); // already expired

    const res = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "BrandNewPass99" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid|expired/i);
  });

  // ---------------------------------------------------------------------------
  // Case 6: single-use -- second consume returns 400
  // ---------------------------------------------------------------------------
  it("rejects a second use of the same token (single-use enforcement)", async () => {
    const token = await seedWelcomeToken(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const res1 = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "FirstNewPass99" }),
    });
    expect(res1.status).toBe(200);

    const res2 = await fetch(`${baseUrl}/api/platform/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "SecondAttempt99" }),
    });
    expect(res2.status).toBe(400);
    const body = await res2.json() as { error: string };
    expect(body.error).toMatch(/invalid|expired/i);
  });
});

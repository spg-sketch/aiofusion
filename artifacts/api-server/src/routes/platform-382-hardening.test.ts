import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database (same harness as the other route tests)
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
    contactSubmissionsTable: schema.contactSubmissionsTable,
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
vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: any, res: any, next: () => void) => {
    try {
      const raw = req.headers["x-test-account"];
      req.account = raw ? JSON.parse(raw as string) : null;
    } catch {
      req.account = null;
    }
    if (!req.account) { res.status(401).json({ error: "Sign in required" }); return; }
    next();
  },
  resolvePlatformAccount: (_req: any, _res: any, next: () => void) => next(),
  blockReadOnlyMembers: (_req: any, _res: any, next: () => void) => next(),
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
  platformAccountsTable,
  platformCompaniesTable,
  platformMetaTable,
  platformSessionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/platform-auth";
import platformRouter from "./platform";
import adminRouter from "./admin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", platformRouter);
  app.use("/api", adminRouter);
  return app;
}

async function withServer(fn: (base: string) => Promise<void>) {
  const app = buildApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const acctHeader = (account: Record<string, unknown>) => ({
  "x-test-account": JSON.stringify(account),
  "Content-Type": "application/json",
});

async function seedAccount(username: string, opts: { role?: string; parent?: string | null; password?: string; status?: string } = {}) {
  const password = opts.password ?? "correct-horse-9";
  await db.insert(platformAccountsTable).values({
    username,
    passwordHash: hashPassword(password),
    role: opts.role ?? "client",
    parent: opts.parent ?? null,
    status: opts.status ?? "active",
  }).onConflictDoNothing();
  await db.insert(platformCompaniesTable).values({
    slug: username,
    role: opts.role === "admin" ? "agency" : (opts.role ?? "client"),
    status: opts.status ?? "active",
  }).onConflictDoNothing();
  return password;
}

beforeEach(async () => {
  await db.delete(platformSessionsTable);
  await db.delete(platformMetaTable);
  await db.delete(platformAccountsTable);
  await db.delete(platformCompaniesTable);
});

// ---------------------------------------------------------------------------
// Progressive login lockout
// ---------------------------------------------------------------------------
describe("progressive login lockout", () => {
  it("locks an identifier after 5 failed attempts and clears on success", async () => {
    await seedAccount("lockme", { password: "right-password-1" });
    await withServer(async (base) => {
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${base}/api/platform/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "lockme", password: "wrong-password" }),
        });
        expect(res.status).toBe(401);
      }
      // 6th attempt - even with the RIGHT password - is locked out.
      const locked = await fetch(`${base}/api/platform/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "lockme", password: "right-password-1" }),
      });
      expect(locked.status).toBe(429);
      const body = await locked.json() as Record<string, any>;
      expect(body.error).toMatch(/try again in/i);
      expect(locked.headers.get("retry-after")).toBeTruthy();
    });
  });

  it("does not reveal whether the account exists", async () => {
    await withServer(async (base) => {
      for (let i = 0; i < 5; i++) {
        await fetch(`${base}/api/platform/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "no-such-account", password: "x".repeat(10) }),
        });
      }
      const locked = await fetch(`${base}/api/platform/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "no-such-account", password: "x".repeat(10) }),
      });
      expect(locked.status).toBe(429);
    });
  });

  it("a successful login clears the failure counter", async () => {
    await seedAccount("clearme", { password: "right-password-2" });
    await withServer(async (base) => {
      for (let i = 0; i < 4; i++) {
        await fetch(`${base}/api/platform/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "clearme", password: "wrong" }),
        });
      }
      const ok = await fetch(`${base}/api/platform/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "clearme", password: "right-password-2" }),
      });
      expect(ok.status).toBe(200);
      const [row] = await db.select().from(platformMetaTable)
        .where(eq(platformMetaTable.key, "login-lockout:clearme"));
      expect(row).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Impersonation guardrails
// ---------------------------------------------------------------------------
describe("impersonation guardrails", () => {
  async function seedStashSession(adminUsername: string): Promise<string> {
    const sid = "stash-sid-test-1234567890";
    await db.insert(platformSessionsTable).values({
      sid,
      username: adminUsername,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return sid;
  }

  it("blocks change-password while impersonating", async () => {
    await seedAccount("masteradmin", { role: "admin" });
    await seedAccount("victim", { role: "client" });
    const sid = await seedStashSession("masteradmin");
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/platform/change-password`, {
        method: "POST",
        headers: {
          ...acctHeader({ username: "victim", role: "client" }),
          Cookie: `aio_admin_sid=${sid}`,
        },
        body: JSON.stringify({ currentPassword: "correct-horse-9", newPassword: "new-password-123" }),
      });
      expect(res.status).toBe(403);
      const body = await res.json() as Record<string, any>;
      expect(body.error).toMatch(/viewing another account/i);
    });
  });

  it("blocks self-delete while impersonating", async () => {
    await seedAccount("masteradmin", { role: "admin" });
    await seedAccount("victim2", { role: "client" });
    const sid = await seedStashSession("masteradmin");
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/platform/account/self-delete`, {
        method: "POST",
        headers: {
          ...acctHeader({ username: "victim2", role: "client" }),
          Cookie: `aio_admin_sid=${sid}`,
        },
        body: JSON.stringify({ password: "correct-horse-9" }),
      });
      expect(res.status).toBe(403);
    });
  });

  it("allows change-password when the stash cookie is stale (no live session)", async () => {
    await seedAccount("solo", { role: "client", password: "old-password-99" });
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/platform/change-password`, {
        method: "POST",
        headers: {
          ...acctHeader({ username: "solo", role: "client" }),
          Cookie: "aio_admin_sid=expired-or-bogus-sid",
        },
        body: JSON.stringify({ currentPassword: "old-password-99", newPassword: "new-password-123" }),
      });
      expect(res.status).not.toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// Agency suspension cascade
// ---------------------------------------------------------------------------
describe("agency suspension cascade", () => {
  it("blocking an agency suspends its descendants; unblocking restores only cascaded ones", async () => {
    await seedAccount("bigagency", { role: "agency" });
    await seedAccount("client-a", { role: "client", parent: "bigagency" });
    await seedAccount("client-b", { role: "client", parent: "bigagency" });
    // client-b was ALREADY suspended individually before the cascade.
    await db.update(platformAccountsTable).set({ status: "suspended" })
      .where(eq(platformAccountsTable.username, "client-b"));
    await withServer(async (base) => {
      const block = await fetch(`${base}/api/admin/account/bigagency/block`, {
        method: "PATCH",
        headers: acctHeader({ username: "master", role: "admin" }),
        body: JSON.stringify({ action: "block" }),
      });
      expect(block.status).toBe(200);
      const blockJson = await block.json() as Record<string, any>;
      expect(blockJson.cascaded).toContain("client-a");
      expect(blockJson.cascaded).not.toContain("client-b");
      const [a] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "client-a"));
      expect(a.status).toBe("suspended");
      // Cascaded client gets the neutral login message.
      const login = await fetch(`${base}/api/platform/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "client-a", password: "correct-horse-9" }),
      });
      expect(login.status).toBe(403);
      const loginJson = await login.json() as Record<string, any>;
      expect(loginJson.error).toMatch(/currently unavailable/i);
      expect(loginJson.error).not.toMatch(/suspended/i);
      // Unblock: client-a restored, client-b stays suspended.
      const unblock = await fetch(`${base}/api/admin/account/bigagency/block`, {
        method: "PATCH",
        headers: acctHeader({ username: "master", role: "admin" }),
        body: JSON.stringify({ action: "unblock" }),
      });
      expect(unblock.status).toBe(200);
      const [a2] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "client-a"));
      const [b2] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "client-b"));
      expect(a2.status).toBe("active");
      expect(b2.status).toBe("suspended");
      // Flag cleaned up.
      const [flag] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, "suspended-via:client-a"));
      expect(flag).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Free-access flag + master sub-roles
// ---------------------------------------------------------------------------
describe("free access flag and master sub-roles", () => {
  it("master owner can toggle free access", async () => {
    await seedAccount("freebie", { role: "client" });
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/admin/account/freebie/free-access`, {
        method: "PATCH",
        headers: acctHeader({ username: "master", role: "admin" }),
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(200);
      const [co] = await db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "freebie"));
      expect(co.freeAccess).toBe(true);
    });
  });

  it("technical and support master members cannot flag, block, or delete", async () => {
    await seedAccount("target", { role: "client" });
    await withServer(async (base) => {
      for (const membershipRole of ["admin", "viewer"]) {
        const actor = { username: "master", role: "admin", membershipRole };
        const flag = await fetch(`${base}/api/admin/account/target/free-access`, {
          method: "PATCH",
          headers: acctHeader(actor),
          body: JSON.stringify({ enabled: true }),
        });
        expect(flag.status).toBe(403);
        const block = await fetch(`${base}/api/admin/account/target/block`, {
          method: "PATCH",
          headers: acctHeader(actor),
          body: JSON.stringify({ action: "block" }),
        });
        expect(block.status).toBe(403);
        const del = await fetch(`${base}/api/platform/accounts/delete`, {
          method: "POST",
          headers: acctHeader(actor),
          body: JSON.stringify({ username: "target" }),
        });
        expect(del.status).toBe(403);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Review regressions: further bypass paths closed
// ---------------------------------------------------------------------------
describe("review regressions", () => {
  it("blocks admin password reset of another account while impersonating", async () => {
    await seedAccount("masteradmin", { role: "admin" });
    await seedAccount("victim3", { role: "client" });
    const sid = "stash-sid-regression-1";
    await db.insert(platformSessionsTable).values({
      sid,
      username: "masteradmin",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/platform/accounts/password`, {
        method: "POST",
        headers: {
          ...acctHeader({ username: "victim3", role: "client" }),
          Cookie: `aio_admin_sid=${sid}`,
        },
        body: JSON.stringify({ username: "victim3", newPassword: "sneaky-password-1" }),
      });
      expect(res.status).toBe(403);
    });
  });

  it("restricted master members cannot create accounts, reset passwords, or reset MFA", async () => {
    await seedAccount("target2", { role: "client" });
    await withServer(async (base) => {
      for (const membershipRole of ["admin", "viewer"]) {
        const actor = { username: "master", role: "admin", membershipRole };
        const create = await fetch(`${base}/api/platform/accounts`, {
          method: "POST",
          headers: acctHeader(actor),
          body: JSON.stringify({ username: "newclient", password: "some-password-1" }),
        });
        expect(create.status).toBe(403);
        const pw = await fetch(`${base}/api/platform/accounts/password`, {
          method: "POST",
          headers: acctHeader(actor),
          body: JSON.stringify({ username: "target2", newPassword: "some-password-2" }),
        });
        expect(pw.status).toBe(403);
        const mfa = await fetch(`${base}/api/platform/accounts/reset-mfa`, {
          method: "POST",
          headers: acctHeader(actor),
          body: JSON.stringify({ username: "target2" }),
        });
        expect(mfa.status).toBe(403);
      }
    });
  });

  it("the master account and yourself cannot be blocked", async () => {
    await seedAccount("masterroot", { role: "admin" });
    await withServer(async (base) => {
      const self = await fetch(`${base}/api/admin/account/masterroot/block`, {
        method: "PATCH",
        headers: acctHeader({ username: "masterroot", role: "admin" }),
        body: JSON.stringify({ action: "block" }),
      });
      expect(self.status).toBe(400);
      await seedAccount("otheradmin", { role: "admin" });
      const other = await fetch(`${base}/api/admin/account/otheradmin/block`, {
        method: "PATCH",
        headers: acctHeader({ username: "masterroot", role: "admin" }),
        body: JSON.stringify({ action: "block" }),
      });
      expect(other.status).toBe(400);
    });
  });

  it("an explicit block survives a parent unblock (cascade flag cleared)", async () => {
    await seedAccount("agency2", { role: "agency" });
    await seedAccount("child-c", { role: "client", parent: "agency2" });
    await withServer(async (base) => {
      const headers = acctHeader({ username: "master", role: "admin" });
      // Cascade-suspend via the parent, then explicitly block the child.
      await fetch(`${base}/api/admin/account/agency2/block`, {
        method: "PATCH", headers, body: JSON.stringify({ action: "block" }),
      });
      await fetch(`${base}/api/admin/account/child-c/block`, {
        method: "PATCH", headers, body: JSON.stringify({ action: "block" }),
      });
      // Unblocking the parent must NOT restore the explicitly blocked child.
      await fetch(`${base}/api/admin/account/agency2/block`, {
        method: "PATCH", headers, body: JSON.stringify({ action: "unblock" }),
      });
      const [c] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "child-c"));
      expect(c.status).toBe("suspended");
    });
  });

  it("a viewer member of an agency cannot edit a managed client's billing details", async () => {
    await seedAccount("agency3", { role: "agency" });
    await seedAccount("managed-client", { role: "client", parent: "agency3" });
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/platform/billing-details`, {
        method: "POST",
        headers: acctHeader({ username: "agency3", role: "agency", membershipRole: "viewer" }),
        body: JSON.stringify({ username: "managed-client", billingEmail: "x@y.com" }),
      });
      expect(res.status).toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// Billing details
// ---------------------------------------------------------------------------
describe("billing details", () => {
  it("owner can save and read billing email + VAT", async () => {
    await seedAccount("billco", { role: "client" });
    await withServer(async (base) => {
      const save = await fetch(`${base}/api/platform/billing-details`, {
        method: "POST",
        headers: acctHeader({ username: "billco", role: "client", membershipRole: "owner" }),
        body: JSON.stringify({ billingEmail: "Accounts@BillCo.com", vatNumber: "gb123456789" }),
      });
      expect(save.status).toBe(200);
      const read = await fetch(`${base}/api/platform/billing-details`, {
        headers: acctHeader({ username: "billco", role: "client", membershipRole: "billing" }),
      });
      expect(read.status).toBe(200);
      const json = await read.json() as Record<string, any>;
      expect(json.billingEmail).toBe("accounts@billco.com");
      expect(json.vatNumber).toBe("GB123456789");
    });
  });

  it("viewer and content members cannot access billing details", async () => {
    await seedAccount("billco2", { role: "client" });
    await withServer(async (base) => {
      for (const membershipRole of ["viewer", "content"]) {
        const read = await fetch(`${base}/api/platform/billing-details`, {
          headers: acctHeader({ username: "billco2", role: "client", membershipRole }),
        });
        expect(read.status).toBe(403);
        const save = await fetch(`${base}/api/platform/billing-details`, {
          method: "POST",
          headers: acctHeader({ username: "billco2", role: "client", membershipRole }),
          body: JSON.stringify({ billingEmail: "x@y.com" }),
        });
        expect(save.status).toBe(403);
      }
    });
  });

  it("rejects an invalid billing email", async () => {
    await seedAccount("billco3", { role: "client" });
    await withServer(async (base) => {
      const save = await fetch(`${base}/api/platform/billing-details`, {
        method: "POST",
        headers: acctHeader({ username: "billco3", role: "client" }),
        body: JSON.stringify({ billingEmail: "not-an-email" }),
      });
      expect(save.status).toBe(400);
    });
  });
});

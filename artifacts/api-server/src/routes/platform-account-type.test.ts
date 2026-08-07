import { describe, it, expect, beforeAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// In-memory PGlite-backed DB for the platform route (no network required).
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await client.exec(`
    CREATE TABLE IF NOT EXISTS platform_accounts (
      username varchar PRIMARY KEY,
      password_hash text NOT NULL DEFAULT '',
      role varchar NOT NULL DEFAULT 'agency',
      parent varchar,
      max_seats integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      email varchar,
      website varchar,
      status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS platform_companies (
      id varchar PRIMARY KEY,
      slug varchar(64) NOT NULL UNIQUE REFERENCES platform_accounts(username) ON DELETE CASCADE,
      role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar(64),
      max_seats integer,
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
    CREATE TABLE IF NOT EXISTS platform_sessions (
      id varchar PRIMARY KEY,
      username varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
      ip_hint varchar,
      user_id uuid,
      active_company_id uuid,
      session_version integer NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS platform_memberships (
      id serial PRIMARY KEY,
      user_id uuid NOT NULL,
      company_id uuid,
      company_slug varchar NOT NULL,
      role varchar NOT NULL DEFAULT 'owner'
    );
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
    CREATE TABLE IF NOT EXISTS platform_meta (
      key varchar PRIMARY KEY,
      value text NOT NULL DEFAULT ''
    );
  `);

  return { db, ...schema };
});

import { db, platformAccountsTable, platformCompaniesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import platformRouter from "./platform";

// ─── helpers ────────────────────────────────────────────────────────────────

async function seed(
  username: string,
  role: "agency" | "client" | "admin",
  setupComplete = true,
  parent?: string,
) {
  await db
    .insert(platformAccountsTable)
    .values({ username, passwordHash: "", role, status: "active", ...(parent ? { parent } : {}) })
    .onConflictDoUpdate({ target: platformAccountsTable.username, set: { role } });
  await db
    .insert(platformCompaniesTable)
    .values({ id: username, slug: username, role, setupComplete })
    .onConflictDoUpdate({ target: platformCompaniesTable.id, set: { role, setupComplete } });
}

function makeApp(accountOverride?: {
  username: string;
  role: string;
  membershipRole?: string | null;
}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // Inject a fake account into req so requirePlatformAuth passes.
  app.use((req, _res, next) => {
    if (accountOverride) {
      (req as any).account = accountOverride;
    }
    next();
  });
  app.use("/api", platformRouter);
  return app;
}

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express(); // dummy - real servers created per-test
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  base = `http://localhost:${port}`;
  server.close();
});

// ─── tests ──────────────────────────────────────────────────────────────────

describe("POST /api/platform/settings/account-type", () => {
  it("returns 400 for invalid accountType", async () => {
    await seed("acme", "agency");
    const app = makeApp({ username: "acme", role: "agency", membershipRole: null });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "banana" }),
    });
    srv.close();
    expect(res.status).toBe(400);
    const json = await res.json() as { error?: string };
    expect(json.error).toMatch(/agency|client/i);
  });

  it("returns 403 for admin role accounts", async () => {
    await seed("superadmin", "admin");
    const app = makeApp({ username: "superadmin", role: "admin", membershipRole: null });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "client" }),
    });
    srv.close();
    expect(res.status).toBe(403);
  });

  it("returns 403 for non-owner membership roles", async () => {
    await seed("beta-agency", "agency");
    for (const memRole of ["admin", "billing", "content", "viewer"] as const) {
      const app = makeApp({ username: "beta-agency", role: "agency", membershipRole: memRole });
      const srv = app.listen(0);
      await new Promise<void>((r) => srv.once("listening", r));
      const { port } = srv.address() as AddressInfo;
      const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType: "client" }),
      });
      srv.close();
      expect(res.status, `expected 403 for membershipRole=${memRole}`).toBe(403);
    }
  });

  it("returns 400 when switching agency→client while sub-accounts exist", async () => {
    await seed("parent-agency", "agency");
    await seed("child-client", "client", true, "parent-agency");
    const app = makeApp({ username: "parent-agency", role: "agency", membershipRole: null });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "client" }),
    });
    srv.close();
    expect(res.status).toBe(400);
    const json = await res.json() as { error?: string };
    expect(json.error).toMatch(/sub-account/i);
  });

  it("switches agency→client: updates both tables, leaves setupComplete unchanged", async () => {
    await seed("agency-switching", "agency", true);
    const app = makeApp({ username: "agency-switching", role: "agency", membershipRole: null });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "client" }),
    });
    srv.close();
    expect(res.status).toBe(200);
    const json = await res.json() as { ok?: boolean; role?: string };
    expect(json.ok).toBe(true);
    expect(json.role).toBe("client");

    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, "agency-switching"));
    expect(acct?.role).toBe("client");

    const [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "agency-switching"));
    expect(co?.role).toBe("client");
    // setupComplete must not have been touched
    expect(co?.setupComplete).toBe(true);
  });

  it("switches client→agency: updates both tables, leaves setupComplete unchanged", async () => {
    await seed("client-switching", "client", true);
    const app = makeApp({ username: "client-switching", role: "client", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "agency" }),
    });
    srv.close();
    expect(res.status).toBe(200);
    const json = await res.json() as { ok?: boolean; role?: string };
    expect(json.ok).toBe(true);
    expect(json.role).toBe("agency");

    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, "client-switching"));
    expect(acct?.role).toBe("agency");

    const [co] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "client-switching"));
    expect(co?.role).toBe("agency");
    expect(co?.setupComplete).toBe(true);
  });

  it("works for legacy owner session (membershipRole=null)", async () => {
    await seed("legacy-owner", "agency", true);
    const app = makeApp({ username: "legacy-owner", role: "agency", membershipRole: null });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "client" }),
    });
    srv.close();
    expect(res.status).toBe(200);
  });

  it("works for explicit owner membershipRole", async () => {
    await seed("explicit-owner", "client", true);
    const app = makeApp({ username: "explicit-owner", role: "client", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/settings/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "agency" }),
    });
    srv.close();
    expect(res.status).toBe(200);
  });
});

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
      id varchar PRIMARY KEY DEFAULT (gen_random_uuid()::text),
      slug varchar(64) NOT NULL UNIQUE REFERENCES platform_accounts(username) ON DELETE CASCADE,
      role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar(64),
      max_seats integer,
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
      beta_trial_started_at timestamptz,
      beta_trial_ends_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_sessions (
      sid varchar PRIMARY KEY,
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
      company_id varchar,
      company_slug varchar NOT NULL,
      role varchar NOT NULL DEFAULT 'owner',
      project_access text,
      position varchar(128),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_invitations (
      token varchar PRIMARY KEY,
      email varchar NOT NULL,
      company_id varchar NOT NULL,
      company_slug varchar NOT NULL,
      role varchar NOT NULL DEFAULT 'viewer',
      project_access text,
      invited_name varchar(128),
      position varchar(128),
      invited_by_user_id uuid,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      revoked_at timestamptz,
      declined_at timestamptz,
      reminder_sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
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
    CREATE TABLE IF NOT EXISTS projects (
      id varchar PRIMARY KEY,
      name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}',
      intake jsonb,
      logo text,
      owner varchar,
      tier varchar(16),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
  `);

  return { db, ...schema };
});

// Spy on the notify-email helpers without losing the rest of the module.
vi.mock("../lib/notify-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/notify-email")>();
  return { ...actual, sendAccountTypeChangedEmail: vi.fn(async () => {}) };
});

import {
  db,
  platformAccountsTable,
  platformCompaniesTable,
  platformInvitationsTable,
  platformMembershipsTable,
  platformMetaTable,
  platformSessionsTable,
  projectsTable,
  platformUsersTable,
} from "@workspace/db";
import { sendAccountTypeChangedEmail } from "../lib/notify-email";
import {
  assignAddonToNewProjectUnlocked,
  getProjectAddons,
  handleSubscriptionDeleted,
} from "../lib/billing";
import { eq, sql } from "drizzle-orm";
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

async function seedAgencyOverClientCapacity(username: string) {
  await seed(username, "agency", true);
  const users = await db
    .insert(platformUsersTable)
    .values([
      { email: `member-one@${username}.test`, passwordHash: "" },
      { email: `member-two@${username}.test`, passwordHash: "" },
      { email: `member-three@${username}.test`, passwordHash: "" },
    ])
    .returning();
  await db.insert(platformMembershipsTable).values([
    { userId: users[0]!.id, companyId: username, companySlug: username, role: "content", projectAccess: JSON.stringify(["project-one"]) },
    { userId: users[1]!.id, companyId: username, companySlug: username, role: "content", projectAccess: JSON.stringify(["project-two"]) },
    { userId: users[2]!.id, companyId: username, companySlug: username, role: "content", projectAccess: JSON.stringify(["project-three"]) },
  ]);
  await db.insert(platformInvitationsTable).values({
    token: `pending-${username}`,
    email: `pending@${username}.test`,
    companyId: username,
    companySlug: username,
    role: "content",
    projectAccess: JSON.stringify(["project-four"]),
    expiresAt: new Date(Date.now() + 60_000),
  });
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
  it("keeps a legacy null setup flag exempt from guided onboarding", async () => {
    await db.insert(platformAccountsTable).values({
      username: "legacy-login",
      passwordHash: "",
      role: "user",
      status: "active",
    });
    await db.insert(platformCompaniesTable).values({
      id: "legacy-login",
      slug: "legacy-login",
      role: "user",
      setupComplete: null,
    });
    const app = makeApp({ username: "legacy-login", role: "user", membershipRole: null });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/me`);
    srv.close();
    expect(res.status).toBe(200);
    const json = await res.json() as { setupComplete?: boolean | null };
    expect(json.setupComplete).toBeNull();
  });

  it("prevents a team member from completing an owner’s account-type setup", async () => {
    await db.insert(platformAccountsTable).values({
      username: "untyped-with-member",
      passwordHash: "",
      role: "user",
      status: "active",
    });
    await db.insert(platformCompaniesTable).values({
      id: "untyped-with-member",
      slug: "untyped-with-member",
      role: "user",
      setupComplete: false,
    });
    const app = makeApp({ username: "untyped-with-member", role: "user", membershipRole: "viewer" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/setup/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "agency" }),
    });
    srv.close();
    expect(res.status).toBe(403);
  });

  it("lets a fresh signup complete setup when its default role is already agency", async () => {
    await seed("fresh-signup", "agency", false);
    const app = makeApp({ username: "fresh-signup", role: "agency", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/setup/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "client" }),
    });
    srv.close();

    expect(res.status).toBe(200);
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "fresh-signup"))
      .limit(1);
    expect(company?.role).toBe("client");
    expect(company?.setupComplete).toBe(false);
    const [checkpoint] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "account:onboarding:v1:fresh-signup"))
      .limit(1);
    expect(JSON.parse(checkpoint?.value ?? "{}")).toEqual({ step: "workspace_basics" });

    const resumedServer = app.listen(0);
    await new Promise<void>((r) => resumedServer.once("listening", r));
    const resumedPort = (resumedServer.address() as AddressInfo).port;
    const basics = await fetch(`http://localhost:${resumedPort}/api/platform/onboarding/workspace-basics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Fresh Company", website: "fresh.example" }),
    });
    expect(basics.status).toBe(200);
    expect(await basics.json()).toMatchObject({ state: { step: "access" } });
    const paid = await fetch(`http://localhost:${resumedPort}/api/platform/onboarding/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice: "paid" }),
    });
    resumedServer.close();
    expect(paid.status).toBe(200);
    expect(await paid.json()).toMatchObject({ state: { step: "billing", accessChoice: "paid" } });
  });

  it("recovers beta and paid activation when their checkpoint write was interrupted", async () => {
    await seed("recover-beta", "agency", false);
    await seed("recover-paid", "client", false);
    await db.insert(platformMetaTable).values([
      { key: "account:onboarding:v1:recover-beta", value: JSON.stringify({ step: "access" }) },
      { key: "account:onboarding:v1:recover-paid", value: JSON.stringify({ step: "billing", accessChoice: "paid" }) },
    ]);
    await db.execute(`UPDATE platform_companies SET beta_trial_started_at = now(), beta_trial_ends_at = now() + interval '60 days' WHERE slug = 'recover-beta'`);
    await db.update(platformCompaniesTable).set({ subscriptionStatus: "active", plan: "inhouse" }).where(eq(platformCompaniesTable.slug, "recover-paid"));
    for (const account of [
      { username: "recover-beta", role: "agency" },
      { username: "recover-paid", role: "client" },
    ]) {
      const app = makeApp({ ...account, membershipRole: "owner" });
      const srv = app.listen(0);
      await new Promise<void>((r) => srv.once("listening", r));
      const res = await fetch(`http://localhost:${(srv.address() as AddressInfo).port}/api/platform/onboarding`);
      srv.close();
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ state: { step: "first_project" } });
    }
  });

  it("finishes onboarding without forcing a project after beta or paid access is active", async () => {
    await seed("finish-beta", "agency", false);
    await seed("finish-paid", "client", false);
    await seed("finish-unfunded", "client", false);
    await db.insert(platformMetaTable).values([
      { key: "account:onboarding:v1:finish-beta", value: JSON.stringify({ step: "first_project", accessChoice: "beta" }) },
      { key: "account:onboarding:v1:finish-paid", value: JSON.stringify({ step: "first_project", accessChoice: "paid" }) },
      { key: "account:onboarding:v1:finish-unfunded", value: JSON.stringify({ step: "first_project", accessChoice: "paid" }) },
    ]);
    await db.execute(`UPDATE platform_companies SET beta_trial_started_at = now(), beta_trial_ends_at = now() + interval '60 days' WHERE slug = 'finish-beta'`);
    await db.update(platformCompaniesTable).set({ subscriptionStatus: "active", plan: "inhouse" }).where(eq(platformCompaniesTable.slug, "finish-paid"));

    for (const account of [
      { username: "finish-beta", role: "agency" },
      { username: "finish-paid", role: "client" },
    ]) {
      const app = makeApp({ ...account, membershipRole: "owner" });
      const srv = app.listen(0);
      await new Promise<void>((resolve) => srv.once("listening", resolve));
      const res = await fetch(`http://localhost:${(srv.address() as AddressInfo).port}/api/platform/onboarding/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      srv.close();
      expect(res.status).toBe(200);
      const [company] = await db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, account.username));
      expect(company?.setupComplete).toBe(true);
    }

    const unfundedApp = makeApp({ username: "finish-unfunded", role: "client", membershipRole: "owner" });
    const unfundedSrv = unfundedApp.listen(0);
    await new Promise<void>((resolve) => unfundedSrv.once("listening", resolve));
    const unfunded = await fetch(`http://localhost:${(unfundedSrv.address() as AddressInfo).port}/api/platform/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    unfundedSrv.close();
    expect(unfunded.status).toBe(409);
  });

  it("completes only after a durable owned first project and exempts established, member, and admin sessions", async () => {
    await seed("durable-first", "agency", false);
    await db.insert(platformMetaTable).values({ key: "account:onboarding:v1:durable-first", value: JSON.stringify({ step: "first_project" }) });
    await db.insert(projectsTable).values({ id: "durable-project", name: "Durable", data: {}, owner: "durable-first" });
    const completeApp = makeApp({ username: "durable-first", role: "agency", membershipRole: "owner" });
    const completeSrv = completeApp.listen(0);
    await new Promise<void>((r) => completeSrv.once("listening", r));
    const complete = await fetch(`http://localhost:${(completeSrv.address() as AddressInfo).port}/api/platform/onboarding/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: "durable-project" }),
    });
    completeSrv.close();
    expect(complete.status).toBe(200);
    const [finished] = await db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "durable-first"));
    expect(finished?.setupComplete).toBe(true);

    await seed("established", "agency", true);
    await seed("member-workspace", "agency", false);
    await seed("admin-workspace", "admin", false);
    for (const account of [
      { username: "established", role: "agency", membershipRole: "owner" },
      { username: "member-workspace", role: "agency", membershipRole: "viewer" },
      { username: "admin-workspace", role: "admin", membershipRole: "owner" },
    ]) {
      const app = makeApp(account);
      const srv = app.listen(0);
      await new Promise<void>((r) => srv.once("listening", r));
      const res = await fetch(`http://localhost:${(srv.address() as AddressInfo).port}/api/platform/onboarding`);
      srv.close();
      expect(res.status).toBe(409);
    }
  });

  it("still rejects the setup endpoint after setup is complete", async () => {
    await seed("configured-signup", "agency", true);
    const app = makeApp({ username: "configured-signup", role: "agency", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/setup/account-type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountType: "client" }),
    });
    srv.close();

    expect(res.status).toBe(409);
  });

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

  it("rejects an agency→client settings change that would exceed the client seat cap", async () => {
    await seedAgencyOverClientCapacity("over-cap-settings");
    const app = makeApp({ username: "over-cap-settings", role: "agency", membershipRole: "owner" });
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
    expect((await res.json() as { limitReached?: boolean }).limitReached).toBe(true);
    const [account] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "over-cap-settings"));
    const [company] = await db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "over-cap-settings"));
    expect(account?.role).toBe("agency");
    expect(company?.role).toBe("agency");
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

  it("lets a legacy 'user' role account pick a type for the first time", async () => {
    await db.insert(platformAccountsTable).values({ username: "legacy-untyped", passwordHash: "", role: "user", status: "active" });
    await db.insert(platformCompaniesTable).values({ id: "legacy-untyped", slug: "legacy-untyped", role: "user" });
    const app = makeApp({ username: "legacy-untyped", role: "user", membershipRole: null });
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
    const [acct] = await db
      .select()
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, "legacy-untyped"));
    expect(acct?.role).toBe("agency");
  });

  it("emails the owner when the type actually changes (self-service, email resolved from DB)", async () => {
    vi.mocked(sendAccountTypeChangedEmail).mockClear();
    await seed("emailed-agency", "agency", true);
    // The session account does NOT carry an email in production - the route
    // must resolve it from the accounts table itself.
    await db
      .update(platformAccountsTable)
      .set({ email: "owner@emailed.test" })
      .where(eq(platformAccountsTable.username, "emailed-agency"));
    const app = makeApp({ username: "emailed-agency", role: "agency", membershipRole: null });
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
    expect(sendAccountTypeChangedEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendAccountTypeChangedEmail).mock.calls[0][0]).toMatchObject({
      toEmail: "owner@emailed.test",
      previousType: "agency",
      newType: "client",
      changedByAdmin: false,
    });
  });

  it("emails the owner when an admin changes their account type", async () => {
    vi.mocked(sendAccountTypeChangedEmail).mockClear();
    await seed("admin-actor", "admin");
    await db.insert(platformAccountsTable).values({ username: "target-agency", passwordHash: "", role: "agency", status: "active", email: "owner@target.test" });
    await db.insert(platformCompaniesTable).values({ id: "target-agency", slug: "target-agency", role: "agency" });
    // membershipRole must be undefined or "owner" - a master account with a
    // null membershipRole is treated as a restricted support subrole.
    const app = makeApp({ username: "admin-actor", role: "admin", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/accounts/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "target-agency", role: "client" }),
    });
    srv.close();
    expect(res.status).toBe(200);
    expect(sendAccountTypeChangedEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendAccountTypeChangedEmail).mock.calls[0][0]).toMatchObject({
      toEmail: "owner@target.test",
      previousType: "agency",
      newType: "client",
      changedByAdmin: true,
    });
  });

  it("does not allow an ordinary company to be promoted to a Master workspace", async () => {
    await seed("master-boundary-actor", "admin");
    await seed("blue-halo", "agency");
    const app = makeApp({ username: "master-boundary-actor", role: "admin", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/accounts/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "blue-halo", role: "admin" }),
    });
    srv.close();

    expect(res.status).toBe(400);
    const [account] = await db
      .select({ role: platformAccountsTable.role })
      .from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, "blue-halo"));
    expect(account?.role).toBe("agency");
  });

  it("does not promote non-owners when an admin changes an account type", async () => {
    await seed("admin-role-actor", "admin");
    await db.insert(platformAccountsTable).values({
      username: "admin-role-target",
      passwordHash: "",
      role: "agency",
      status: "active",
    });
    await db.insert(platformCompaniesTable).values({
      id: "admin-role-target",
      slug: "admin-role-target",
      role: "agency",
      setupComplete: true,
    });
    const [owner] = await db
      .insert(platformUsersTable)
      .values({ email: "owner@admin-role-target.test", passwordHash: "" })
      .returning();
    const [viewer] = await db
      .insert(platformUsersTable)
      .values({ email: "viewer@admin-role-target.test", passwordHash: "" })
      .returning();
    await db.insert(platformMembershipsTable).values([
      { userId: owner!.id, companyId: "admin-role-target", companySlug: "admin-role-target", role: "owner" },
      { userId: viewer!.id, companyId: "admin-role-target", companySlug: "admin-role-target", role: "viewer" },
    ]);

    const app = makeApp({ username: "admin-role-actor", role: "admin", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/accounts/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin-role-target", role: "client" }),
    });
    srv.close();
    expect(res.status).toBe(200);
    const memberships = await db
      .select({ userId: platformMembershipsTable.userId, role: platformMembershipsTable.role })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.companySlug, "admin-role-target"));
    expect(memberships.find((m) => m.userId === owner!.id)?.role).toBe("owner");
    expect(memberships.find((m) => m.userId === viewer!.id)?.role).toBe("content");
  });

  it("rejects an admin agency→client change that would exceed the client seat cap", async () => {
    await seed("over-cap-admin-actor", "admin");
    await seedAgencyOverClientCapacity("over-cap-admin-target");
    const app = makeApp({ username: "over-cap-admin-actor", role: "admin", membershipRole: "owner" });
    const srv = app.listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const res = await fetch(`http://localhost:${port}/api/platform/accounts/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "over-cap-admin-target", role: "client" }),
    });
    srv.close();
    expect(res.status).toBe(400);
    expect((await res.json() as { limitReached?: boolean }).limitReached).toBe(true);
    const [account] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "over-cap-admin-target"));
    const [company] = await db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "over-cap-admin-target"));
    expect(account?.role).toBe("agency");
    expect(company?.role).toBe("agency");
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

  it("automatically normalizes roles that conflict with the new account type", async () => {
    await seed("switch-and-sweep", "agency", true);
    const [member] = await db
      .insert(platformUsersTable)
      .values({ email: "legacy-billing@sweep.test", passwordHash: "" })
      .returning();
    await db.insert(platformMembershipsTable).values({
      userId: member!.id,
      companyId: "switch-and-sweep",
      companySlug: "switch-and-sweep",
      role: "billing",
      projectAccess: JSON.stringify(["legacy-project"]),
    });
    const app = makeApp({ username: "switch-and-sweep", role: "agency", membershipRole: null });
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
    const [membership] = await db
      .select({ role: platformMembershipsTable.role, projectAccess: platformMembershipsTable.projectAccess })
      .from(platformMembershipsTable)
      .where(eq(platformMembershipsTable.userId, member!.id));
    expect(membership?.role).toBe("content");
    expect(membership?.projectAccess).toBeNull();
  });
});

describe("package capacity at account boundaries", () => {
  async function request(
    actor: { username: string; role: string },
    path: string,
    body: Record<string, unknown>,
  ) {
    const srv = makeApp(actor).listen(0);
    await new Promise<void>((r) => srv.once("listening", r));
    const { port } = srv.address() as AddressInfo;
    const response = await fetch(`http://localhost:${port}/api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json() as Record<string, unknown>;
    await new Promise<void>((resolve) => srv.close(() => resolve()));
    return { status: response.status, json };
  }

  async function seedFreeAgency(username: string) {
    await seed(username, "agency");
    await db.update(platformCompaniesTable)
      .set({ freeAccess: true, plan: "agency" })
      .where(eq(platformCompaniesTable.slug, username));
  }

  it("serializes concurrent auto-username retries and creates one complete account", async () => {
    await seedFreeAgency("capacity-create-agency");
    const body = {
      username: "capacity-brand",
      role: "client",
      autoUsername: true,
      creationRequestKey: "capacity-create-request-0001",
      displayName: "Capacity Brand",
    };
    const [first, retry] = await Promise.all([
      request({ username: "capacity-create-agency", role: "agency" }, "/platform/accounts", body),
      request({ username: "capacity-create-agency", role: "agency" }, "/platform/accounts", body),
    ]);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(first.json.username).toBe(retry.json.username);

    const username = String(first.json.username);
    const accounts = await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, username));
    const companies = await db.select().from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, username));
    const managed = await db.select().from(platformMetaTable)
      .where(eq(platformMetaTable.key, `account:managed:${username}`));
    expect(accounts).toHaveLength(1);
    expect(companies).toHaveLength(1);
    expect(companies[0]?.parentSlug).toBe("capacity-create-agency");
    expect(managed).toHaveLength(1);
  });

  it("counts empty clients as reservations and rejects the concurrent fourth create", async () => {
    await seedFreeAgency("capacity-race-agency");
    const calls = Array.from({ length: 4 }, (_, index) =>
      request(
        { username: "capacity-race-agency", role: "agency" },
        "/platform/accounts",
        {
          username: `capacity-race-client-${index}`,
          role: "client",
          autoUsername: true,
          creationRequestKey: `capacity-race-request-${index.toString().padStart(4, "0")}`,
        },
      ));
    const results = await Promise.all(calls);
    expect(results.filter((result) => result.status === 200)).toHaveLength(3);
    expect(results.filter((result) => result.status === 403)).toHaveLength(1);
  });

  it("blocks restoring an empty client when all package units are reserved", async () => {
    await seedFreeAgency("capacity-restore-agency");
    for (const suffix of ["one", "two", "three", "archived"]) {
      await seed(`capacity-restore-${suffix}`, "client", true, "capacity-restore-agency");
    }
    await db.insert(platformMetaTable).values({
      key: "account:archived:capacity-restore-archived",
      value: "true",
    });

    const result = await request(
      { username: "capacity-restore-agency", role: "agency" },
      "/platform/accounts/archive",
      { username: "capacity-restore-archived", archive: false },
    );
    expect(result.status).toBe(403);
    expect(result.json.limitReached).toBe(true);
    const archived = await db.select().from(platformMetaTable)
      .where(eq(platformMetaTable.key, "account:archived:capacity-restore-archived"));
    expect(archived).toHaveLength(1);
  });

  it("keeps repeated restores idempotent and gives Master an explicit capacity exception", async () => {
    await seedFreeAgency("capacity-idempotent-restore-agency");
    for (const suffix of ["one", "two", "three", "master-restore"]) {
      await seed(
        `capacity-idempotent-${suffix}`,
        "client",
        true,
        "capacity-idempotent-restore-agency",
      );
    }
    // Repeating restore for an already-active empty client has zero marginal
    // cost even though the package is full.
    const repeated = await request(
      { username: "capacity-idempotent-restore-agency", role: "agency" },
      "/platform/accounts/archive",
      { username: "capacity-idempotent-one", archive: false },
    );
    expect(repeated.status).toBe(200);

    await db.insert(platformMetaTable).values({
      key: "account:archived:capacity-idempotent-master-restore",
      value: "true",
    });
    const masterRestore = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/archive",
      { username: "capacity-idempotent-master-restore", archive: false },
    );
    expect(masterRestore.status).toBe(200);
    const archived = await db.select().from(platformMetaTable)
      .where(eq(platformMetaTable.key, "account:archived:capacity-idempotent-master-restore"));
    expect(archived).toHaveLength(0);
  });

  it("enforces destination capacity and preserves both hierarchy tables on a rejected transfer", async () => {
    await seedFreeAgency("capacity-source-agency");
    await seedFreeAgency("capacity-full-agency");
    await seed("capacity-moving-client", "client", true, "capacity-source-agency");
    for (const suffix of ["a", "b", "c"]) {
      await seed(`capacity-full-${suffix}`, "client", true, "capacity-full-agency");
    }
    await db.insert(projectsTable).values({
      id: "capacity-moving-project",
      name: "Moving",
      owner: "capacity-moving-client",
    });

    const result = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/reparent",
      { username: "capacity-moving-client", newParent: "capacity-full-agency" },
    );
    expect(result.status).toBe(403);
    const [account] = await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, "capacity-moving-client"));
    const [company] = await db.select().from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "capacity-moving-client"));
    expect(account?.parent).toBe("capacity-source-agency");
    expect(company?.parentSlug).not.toBe("capacity-full-agency");
  });

  it("moves a project-bearing client into available capacity and revokes its sessions", async () => {
    await seedFreeAgency("capacity-move-source");
    await seedFreeAgency("capacity-move-destination");
    await seed("capacity-move-client", "client", true, "capacity-move-source");
    for (const suffix of ["a", "b"]) {
      await seed(`capacity-move-existing-${suffix}`, "client", true, "capacity-move-destination");
    }
    await db.insert(projectsTable).values({
      id: "capacity-move-project",
      name: "Moving",
      owner: "capacity-move-client",
    });
    await db.insert(platformSessionsTable).values({
      sid: "capacity-move-session",
      username: "capacity-move-client",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/reparent",
      { username: "capacity-move-client", newParent: "capacity-move-destination" },
    );
    expect(result.status).toBe(200);
    const [account] = await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, "capacity-move-client"));
    const [company] = await db.select().from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "capacity-move-client"));
    const sessions = await db.select().from(platformSessionsTable)
      .where(eq(platformSessionsTable.username, "capacity-move-client"));
    const managed = await db.select().from(platformMetaTable)
      .where(eq(platformMetaTable.key, "account:managed:capacity-move-client"));
    expect(account?.parent).toBe("capacity-move-destination");
    expect(company?.parentSlug).toBe("capacity-move-destination");
    expect(sessions).toHaveLength(0);
    expect(managed).toHaveLength(1);
  });

  it("releases a departing project client's purchased slot for replacement and cancellation", async () => {
    const agency = "capacity-paid-move-source";
    await seed(agency, "agency");
    await db.update(platformCompaniesTable).set({
      plan: "agency",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_capacity_paid_move",
      stripeSubscriptionId: "sub_capacity_paid_move_main",
    }).where(eq(platformCompaniesTable.slug, agency));
    for (const suffix of ["one", "two", "three", "departing"]) {
      await seed(`capacity-paid-${suffix}`, "client", true, agency);
      await db.update(platformCompaniesTable)
        .set({ parentSlug: agency })
        .where(eq(platformCompaniesTable.slug, `capacity-paid-${suffix}`));
    }
    await db.insert(projectsTable).values({
      id: "capacity-paid-departing-project",
      name: "Departing",
      owner: "capacity-paid-departing",
      tier: "standard",
    });
    await db.insert(platformMetaTable).values({
      key: `projectAddons:${agency}`,
      value: JSON.stringify([{
        subscriptionId: "sub_capacity_paid_original_addon",
        tier: "standard",
        projectId: "capacity-paid-departing-project",
        ownerSlug: "capacity-paid-departing",
        grantsCapacity: true,
        purchasedAt: new Date().toISOString(),
      }]),
    });

    const moved = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/reparent",
      { username: "capacity-paid-departing", newParent: "" },
    );
    expect(moved.status).toBe(200);
    expect(await getProjectAddons(agency)).toMatchObject([{
      subscriptionId: "sub_capacity_paid_original_addon",
      projectId: null,
      ownerSlug: null,
    }]);

    const replacement = await request(
      { username: agency, role: "agency" },
      "/platform/accounts",
      {
        username: "capacity-paid-replacement",
        role: "client",
        autoUsername: true,
        idempotencyKey: "capacity-paid-replacement-request",
      },
    );
    expect(replacement.status).toBe(200);
    await db.insert(projectsTable).values({
      id: "capacity-paid-replacement-project",
      name: "Replacement",
      owner: "capacity-paid-replacement",
    });
    await assignAddonToNewProjectUnlocked(agency, "capacity-paid-replacement-project");
    expect(await getProjectAddons(agency)).toMatchObject([{
      subscriptionId: "sub_capacity_paid_original_addon",
      tier: "standard",
      projectId: "capacity-paid-replacement-project",
      ownerSlug: "capacity-paid-replacement",
    }]);
    const [funded] = await db.select().from(projectsTable)
      .where(eq(projectsTable.id, "capacity-paid-replacement-project"));
    expect(funded?.tier).toBe("standard");

    await handleSubscriptionDeleted({
      id: "evt_capacity_paid_original_cancel",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_capacity_paid_original_addon",
          customer: "cus_capacity_paid_move",
          metadata: { kind: "project-addon" },
        },
      },
    } as any);
    const [retired] = await db.select().from(projectsTable)
      .where(eq(projectsTable.id, "capacity-paid-replacement-project"));
    expect(retired?.deletedAt).not.toBeNull();
    expect(retired?.tier).toBeNull();
  });

  it("restores source add-on bindings when the hierarchy transaction rolls back", async () => {
    const source = "capacity-rollback-source";
    const destination = "capacity-rollback-destination";
    const client = "capacity-rollback-client";
    const project = "capacity-rollback-project";
    await seed(source, "agency");
    await seedFreeAgency(destination);
    await db.update(platformCompaniesTable).set({
      plan: "agency",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_capacity_rollback",
      stripeSubscriptionId: "sub_capacity_rollback_main",
    }).where(eq(platformCompaniesTable.slug, source));
    await seed(client, "client", true, source);
    await db.update(platformCompaniesTable).set({ parentSlug: source })
      .where(eq(platformCompaniesTable.slug, client));
    await db.insert(projectsTable).values({ id: project, name: "Rollback", owner: client, tier: "max" });
    await db.insert(platformMetaTable).values({
      key: `projectAddons:${source}`,
      value: JSON.stringify([{
        subscriptionId: "sub_capacity_rollback_addon",
        tier: "max",
        projectId: project,
        ownerSlug: client,
        grantsCapacity: true,
        purchasedAt: new Date().toISOString(),
      }]),
    });
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION fail_capacity_reparent() RETURNS trigger AS $$
      BEGIN
        IF OLD.slug = 'capacity-rollback-client' THEN
          RAISE EXCEPTION 'injected reparent failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.execute(sql`
      CREATE TRIGGER capacity_reparent_failure
      BEFORE UPDATE ON platform_companies
      FOR EACH ROW EXECUTE FUNCTION fail_capacity_reparent()
    `);
    try {
      const result = await request(
        { username: "admin", role: "admin" },
        "/platform/accounts/reparent",
        { username: client, newParent: destination },
      );
      expect(result.status).toBe(500);
      const [account] = await db.select().from(platformAccountsTable)
        .where(eq(platformAccountsTable.username, client));
      expect(account?.parent).toBe(source);
      expect(await getProjectAddons(source)).toMatchObject([{
        subscriptionId: "sub_capacity_rollback_addon",
        tier: "max",
        projectId: project,
        ownerSlug: client,
      }]);
      const [restoredProject] = await db.select().from(projectsTable)
        .where(eq(projectsTable.id, project));
      expect(restoredProject?.tier).toBe("max");
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS capacity_reparent_failure ON platform_companies`);
      await db.execute(sql`DROP FUNCTION IF EXISTS fail_capacity_reparent()`);
    }
  });

  it("binds the destination's unassigned premium slot immediately and cancellation retires the moved project", async () => {
    const source = "capacity-destination-bind-source";
    const destination = "capacity-destination-bind-target";
    const client = "capacity-destination-bind-client";
    const project = "capacity-destination-bind-project";
    await seedFreeAgency(source);
    await seed(destination, "agency");
    await db.update(platformCompaniesTable).set({
      plan: "agency",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_capacity_destination_bind",
      stripeSubscriptionId: "sub_capacity_destination_bind_main",
    }).where(eq(platformCompaniesTable.slug, destination));
    for (const suffix of ["one", "two", "three"]) {
      await seed(`capacity-destination-existing-${suffix}`, "client", true, destination);
      await db.update(platformCompaniesTable).set({ parentSlug: destination })
        .where(eq(platformCompaniesTable.slug, `capacity-destination-existing-${suffix}`));
    }
    await seed(client, "client", true, source);
    await db.update(platformCompaniesTable).set({ parentSlug: source })
      .where(eq(platformCompaniesTable.slug, client));
    await db.insert(projectsTable).values({ id: project, name: "Destination bind", owner: client });
    await db.insert(platformMetaTable).values({
      key: `projectAddons:${destination}`,
      value: JSON.stringify([{
        subscriptionId: "sub_capacity_destination_premium",
        tier: "premium",
        projectId: null,
        ownerSlug: null,
        grantsCapacity: true,
        purchasedAt: new Date().toISOString(),
      }]),
    });

    const moved = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/reparent",
      { username: client, newParent: destination },
    );
    expect(moved.status).toBe(200);
    expect(await getProjectAddons(destination)).toMatchObject([{
      subscriptionId: "sub_capacity_destination_premium",
      tier: "premium",
      projectId: project,
      ownerSlug: client,
    }]);
    const [funded] = await db.select().from(projectsTable).where(eq(projectsTable.id, project));
    expect(funded?.tier).toBe("premium");

    await handleSubscriptionDeleted({
      id: "evt_capacity_destination_premium_cancel",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_capacity_destination_premium",
          customer: "cus_capacity_destination_bind",
          metadata: { kind: "project-addon" },
        },
      },
    } as any);
    const [retired] = await db.select().from(projectsTable).where(eq(projectsTable.id, project));
    expect(retired?.deletedAt).not.toBeNull();
    expect(retired?.tier).toBeNull();
  });

  it("rolls back both billing roots and hierarchy when destination add-on persistence fails, then retries cleanly", async () => {
    const source = "capacity-destination-fail-source";
    const destination = "capacity-destination-fail-target";
    const client = "capacity-destination-fail-client";
    const project = "capacity-destination-fail-project";
    for (const agency of [source, destination]) {
      await seed(agency, "agency");
      await db.update(platformCompaniesTable).set({
        plan: "agency",
        subscriptionStatus: "active",
        stripeCustomerId: `cus_${agency}`,
        stripeSubscriptionId: `sub_${agency}_main`,
      }).where(eq(platformCompaniesTable.slug, agency));
      for (const suffix of ["one", "two", "three"]) {
        await seed(`${agency}-${suffix}`, "client", true, agency);
        await db.update(platformCompaniesTable).set({ parentSlug: agency })
          .where(eq(platformCompaniesTable.slug, `${agency}-${suffix}`));
      }
    }
    await seed(client, "client", true, source);
    await db.update(platformCompaniesTable).set({ parentSlug: source })
      .where(eq(platformCompaniesTable.slug, client));
    await db.insert(projectsTable).values({
      id: project,
      name: "Destination failure",
      owner: client,
      tier: "standard",
    });
    const sourceAddonValue = JSON.stringify([{
      subscriptionId: "sub_capacity_destination_fail_source",
      tier: "standard",
      projectId: project,
      ownerSlug: client,
      grantsCapacity: true,
      purchasedAt: new Date().toISOString(),
    }]);
    const destinationAddonValue = JSON.stringify([{
      subscriptionId: "sub_capacity_destination_fail_premium",
      tier: "premium",
      projectId: null,
      ownerSlug: null,
      grantsCapacity: true,
      purchasedAt: new Date().toISOString(),
    }]);
    await db.insert(platformMetaTable).values([
      { key: `projectAddons:${source}`, value: sourceAddonValue },
      { key: `projectAddons:${destination}`, value: destinationAddonValue },
    ]);
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION fail_destination_addon_write() RETURNS trigger AS $$
      BEGIN
        IF NEW.key = 'projectAddons:capacity-destination-fail-target'
          AND NEW.value LIKE '%capacity-destination-fail-client%' THEN
          RAISE EXCEPTION 'injected destination add-on failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.execute(sql`
      CREATE TRIGGER destination_addon_write_failure
      BEFORE UPDATE ON platform_meta
      FOR EACH ROW EXECUTE FUNCTION fail_destination_addon_write()
    `);
    try {
      const failed = await request(
        { username: "admin", role: "admin" },
        "/platform/accounts/reparent",
        { username: client, newParent: destination },
      );
      expect(failed.status).toBe(500);
      const [failedAccount] = await db.select().from(platformAccountsTable)
        .where(eq(platformAccountsTable.username, client));
      const [failedCompany] = await db.select().from(platformCompaniesTable)
        .where(eq(platformCompaniesTable.slug, client));
      expect(failedAccount?.parent).toBe(source);
      expect(failedCompany?.parentSlug).toBe(source);
      expect(await getProjectAddons(source)).toEqual(JSON.parse(sourceAddonValue));
      expect(await getProjectAddons(destination)).toEqual(JSON.parse(destinationAddonValue));
      const [restoredProject] = await db.select().from(projectsTable).where(eq(projectsTable.id, project));
      expect(restoredProject?.tier).toBe("standard");
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS destination_addon_write_failure ON platform_meta`);
      await db.execute(sql`DROP FUNCTION IF EXISTS fail_destination_addon_write()`);
    }

    const retry = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/reparent",
      { username: client, newParent: destination },
    );
    expect(retry.status).toBe(200);
    const [movedAccount] = await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, client));
    expect(movedAccount?.parent).toBe(destination);
    expect(await getProjectAddons(source)).toMatchObject([{
      subscriptionId: "sub_capacity_destination_fail_source",
      projectId: null,
      ownerSlug: null,
    }]);
    expect(await getProjectAddons(destination)).toMatchObject([{
      subscriptionId: "sub_capacity_destination_fail_premium",
      projectId: project,
      ownerSlug: client,
      tier: "premium",
    }]);
    const [fundedProject] = await db.select().from(projectsTable).where(eq(projectsTable.id, project));
    expect(fundedProject?.tier).toBe("premium");
  });

  it("keeps managed clients as leaves across role and reparent operations", async () => {
    await seedFreeAgency("capacity-boundary-agency");
    await seed("capacity-boundary-client", "client", true, "capacity-boundary-agency");
    const roleChange = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/role",
      { username: "capacity-boundary-client", role: "agency" },
    );
    expect(roleChange.status).toBe(400);

    await seed("capacity-parent-with-child", "agency");
    await seed("capacity-child", "client", true, "capacity-parent-with-child");
    const clientChange = await request(
      { username: "admin", role: "admin" },
      "/platform/accounts/role",
      { username: "capacity-parent-with-child", role: "client" },
    );
    expect(clientChange.status).toBe(409);
  });
});

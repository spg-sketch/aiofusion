import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE platform_accounts (username varchar PRIMARY KEY, password_hash text NOT NULL DEFAULT '',
      role varchar NOT NULL DEFAULT 'agency', parent varchar, max_seats integer, created_at timestamptz DEFAULT now(),
      email varchar, website varchar, status varchar NOT NULL DEFAULT 'active');
    CREATE TABLE platform_companies (id varchar PRIMARY KEY, slug varchar UNIQUE NOT NULL, role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar, max_seats integer, email varchar, billing_email varchar, key_account_holder_email varchar,
      vat_number varchar, billing_address varchar, billing_address_version integer, website varchar, display_name varchar,
      free_access boolean DEFAULT false, status varchar NOT NULL DEFAULT 'active', setup_complete boolean,
      stripe_customer_id text, stripe_subscription_id text, plan varchar, billing_frequency varchar,
      subscription_status varchar, current_period_end timestamptz, beta_trial_started_at timestamptz,
      beta_trial_ends_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE platform_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar UNIQUE, name varchar,
      password_hash text, google_id varchar UNIQUE, microsoft_id varchar UNIQUE, session_version integer DEFAULT 0,
      email_verified boolean, created_at timestamptz DEFAULT now());
    CREATE TABLE platform_memberships (id serial PRIMARY KEY, user_id uuid NOT NULL, company_id varchar,
      company_slug varchar NOT NULL, role varchar NOT NULL DEFAULT 'owner', project_access text, position varchar,
      created_at timestamptz DEFAULT now());
    CREATE TABLE platform_sessions (id varchar PRIMARY KEY, username varchar NOT NULL, user_id uuid,
      active_company_id uuid, session_version integer DEFAULT 1, created_at timestamptz DEFAULT now(),
      expires_at timestamptz DEFAULT now(), ip_hint varchar);
    CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL DEFAULT '');
    CREATE TABLE projects (id varchar PRIMARY KEY, name varchar NOT NULL DEFAULT '', data jsonb DEFAULT '{}',
      intake jsonb, logo text, owner varchar, tier varchar, updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE project_snapshots (id serial PRIMARY KEY, project_id varchar NOT NULL, name varchar DEFAULT '',
      data jsonb DEFAULT '{}', intake jsonb, logo text, owner varchar, reason varchar DEFAULT '',
      created_at timestamptz DEFAULT now());
    CREATE TABLE archive_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner varchar);
    CREATE TABLE planner_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner varchar);
    CREATE TABLE scoring_configs (owner varchar PRIMARY KEY, config jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
    CREATE TABLE token_usage (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id varchar);
    CREATE TABLE audit_locks (project_id varchar NOT NULL, audit_type varchar NOT NULL, owner varchar DEFAULT '',
      last_run_at timestamptz DEFAULT now(), PRIMARY KEY(project_id, audit_type));
    CREATE TABLE saved_audits (id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL,
      saved_at varchar NOT NULL, result jsonb NOT NULL, deleted_at timestamptz);
    CREATE TABLE saved_diagnostics (id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL,
      saved_at varchar NOT NULL, result jsonb NOT NULL, deleted_at timestamptz);
    CREATE TABLE saved_content_geo (id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL,
      saved_at varchar NOT NULL, result jsonb NOT NULL, deleted_at timestamptz);
    CREATE TABLE saved_tech_geo (id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL,
      saved_at varchar NOT NULL, result jsonb NOT NULL, deleted_at timestamptz);
    CREATE TABLE platform_invitations (token varchar PRIMARY KEY, email varchar, company_id varchar, company_slug varchar,
      role varchar DEFAULT 'viewer', project_access text, invited_name varchar, position varchar, invited_by_user_id uuid,
      expires_at timestamptz DEFAULT now(), used_at timestamptz, revoked_at timestamptz, declined_at timestamptz,
      reminder_sent_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE media_categories (id serial PRIMARY KEY, name text, account_id varchar);
    CREATE TABLE media_outlets (id serial PRIMARY KEY, name text, category text DEFAULT '', website text DEFAULT '',
      description text DEFAULT '', country text DEFAULT '', reach_band text DEFAULT '', account_id varchar,
      created_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE media_contacts (id serial PRIMARY KEY, outlet_id integer, first_name text DEFAULT '', last_name text DEFAULT '',
      role text DEFAULT '', email text DEFAULT '', phone text DEFAULT '', notes text DEFAULT '', mobile text DEFAULT '',
      linkedin_url text DEFAULT '', twitter_handle text DEFAULT '', beats text[] DEFAULT '{}', sectors text[] DEFAULT '{}',
      geography text DEFAULT '', language text DEFAULT '', seniority text DEFAULT '', editorial_status text DEFAULT '',
      source_url text DEFAULT '', source_ref text DEFAULT '', publication_reach text DEFAULT '', publication_authority text DEFAULT '',
      journalist_authority text DEFAULT '', confidence text DEFAULT '', review_notes text DEFAULT '', provenance jsonb DEFAULT '{}',
      last_verified_at timestamptz, updated_at timestamptz DEFAULT now(), account_id varchar, created_at timestamptz DEFAULT now(),
      deleted_at timestamptz);
    CREATE TABLE media_contact_categories (id serial PRIMARY KEY, contact_id integer, category_id integer, account_id varchar);
    CREATE TABLE media_contact_field_overrides (id serial PRIMARY KEY, contact_id integer, account_id varchar);
    CREATE TABLE media_import_batches (id serial PRIMARY KEY, account_id varchar);
    CREATE TABLE media_recommendation_sets (id serial PRIMARY KEY, account_id varchar, project_id varchar, story_key varchar,
      criteria jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE media_recommendation_items (id serial PRIMARY KEY, recommendation_set_id integer, contact_id integer,
      score integer DEFAULT 0, reasons jsonb DEFAULT '[]', rank integer DEFAULT 0, created_at timestamptz DEFAULT now());
    CREATE TABLE media_recommendation_decisions (id serial PRIMARY KEY, account_id varchar, project_id varchar,
      story_key varchar, contact_id integer);
    CREATE TABLE admin_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id varchar, actor_username varchar,
      action varchar, target_id varchar, target_type varchar, metadata jsonb, created_at timestamptz DEFAULT now());
  `);
  return { db, ...schema };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/admin-events", () => ({ logAdminEvent: () => Promise.resolve() }));

import {
  db,
  platformAccountsTable,
  platformCompaniesTable,
  platformUsersTable,
  platformMembershipsTable,
  projectsTable,
  platformMetaTable,
  mediaOutletsTable,
  mediaContactsTable,
  mediaRecommendationSetsTable,
  mediaRecommendationItemsTable,
  savedAuditsTable,
  savedDiagnosticsTable,
  savedContentGeoTable,
  savedTechGeoTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/platform-auth";
import router from "./platform";

type Actor = { username: string; role: string; userId?: string; membershipRole?: string | null };

function appFor(actor: Actor) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, _res, next) => { (req as any).account = actor; next(); });
  app.use("/api", router);
  return app;
}

async function request(actor: Actor, target: string) {
  const server = appFor(actor).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const response = await fetch(
    `http://127.0.0.1:${port}/api/platform/admin/accounts/${target}/reset-staging-test`,
    { method: "POST" },
  );
  server.close();
  return response;
}

async function requestMe(actor: Actor) {
  const server = appFor(actor).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/platform/me`);
  server.close();
  return response;
}

async function seed(target: string, opts: { stripe?: boolean; googleOnly?: boolean } = {}) {
  process.env.STAGING_SIGNUP_TEST_EMAIL = `${target}@test.invalid`;
  await db.insert(platformAccountsTable).values({
    username: target,
    passwordHash: opts.googleOnly ? "" : hashPassword("original"),
    role: "agency",
    status: "active",
  });
  await db.insert(platformCompaniesTable).values({
    id: target,
    slug: target,
    role: "agency",
    setupComplete: true,
    ...(opts.stripe ? { stripeCustomerId: "cus_test" } : {}),
  });
  const [user] = await db.insert(platformUsersTable).values({
    email: `${target}@test.invalid`,
    name: "Owner",
    passwordHash: opts.googleOnly ? null : hashPassword("original"),
    googleId: opts.googleOnly ? `google-${target}` : null,
    emailVerified: true,
  }).returning();
  await db.insert(platformMembershipsTable).values({
    userId: user!.id,
    companyId: target,
    companySlug: target,
    role: "owner",
  });
  return user!.id;
}

beforeEach(() => { process.env.DEPLOYMENT_ENV = "staging"; });

describe("staging reusable signup reset", () => {
  it("denies the capability and reset in production", async () => {
    await seed("production-target");
    process.env.DEPLOYMENT_ENV = "production";
    const app = appFor({ username: "admin", role: "admin", membershipRole: "owner" });
    app.get("/api/platform/admin/staging-test-reset", (req, res, next) => next());
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    expect((await fetch(`${base}/api/platform/admin/staging-test-reset`)).status).toBe(404);
    expect((await fetch(`${base}/api/platform/admin/accounts/production-target/reset-staging-test`, { method: "POST" })).status).toBe(404);
    server.close();
  });

  it("denies a non-admin actor", async () => {
    await seed("non-admin-target");
    expect((await request(
      { username: "non-admin", role: "agency", membershipRole: "owner" },
      "non-admin-target",
    )).status).toBe(403);
  });

  it("rejects every account except the configured reusable signup identity", async () => {
    await seed("configured-target");
    await seed("wrong-target");
    process.env.STAGING_SIGNUP_TEST_EMAIL = "configured-target@test.invalid";
    await db.insert(projectsTable).values({
      id: "wrong-target-project",
      owner: "wrong-target",
      name: "Keep",
      data: {},
    });
    const response = await request(
      { username: "admin", role: "admin", membershipRole: "owner" },
      "wrong-target",
    );
    expect(response.status).toBe(403);
    expect((await db.select().from(projectsTable)
      .where(eq(projectsTable.owner, "wrong-target"))).length).toBe(1);
  });

  it("resets a dedicated password account while preserving identity and onboarding state", async () => {
    const userId = await seed("reusable");
    const [before] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.id, userId));
    await db.update(platformAccountsTable)
      .set({ website: "https://old-company.test" })
      .where(eq(platformAccountsTable.username, "reusable"));
    await db.update(platformCompaniesTable)
      .set({ displayName: "Old Company", website: "https://old-company.test" })
      .where(eq(platformCompaniesTable.slug, "reusable"));
    await db.insert(projectsTable).values({ id: "reusable-project", owner: "reusable", name: "Old", data: {} });
    await db.insert(savedAuditsTable).values({
      id: "audit-1", projectId: "reusable-project", owner: "reusable", savedAt: "now", result: {},
    });
    await db.insert(savedDiagnosticsTable).values({
      id: "diagnostic-1", projectId: "reusable-project", owner: "reusable", savedAt: "now", result: {},
    });
    await db.insert(savedContentGeoTable).values({
      id: "content-geo-1", projectId: "reusable-project", owner: "reusable", savedAt: "now", result: {},
    });
    await db.insert(savedTechGeoTable).values({
      id: "tech-geo-1", projectId: "reusable-project", owner: "reusable", savedAt: "now", result: {},
    });
    await db.insert(platformMetaTable).values({
      key: "account:onboarding:v1:reusable",
      value: JSON.stringify({ step: "first_project" }),
    });
    const response = await request({ username: "admin", role: "admin", membershipRole: "owner" }, "reusable");
    expect(response.status).toBe(200);
    const result = await response.json() as { deletedProjectCount: number };
    expect(result.deletedProjectCount).toBe(1);
    const [account] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "reusable"));
    const [company] = await db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "reusable"));
    const [checkpoint] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, "account:onboarding:v1:reusable"));
    const [after] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.id, userId));
    expect(account?.passwordHash).toBeTruthy();
    expect(account?.website).toBeNull();
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(company?.setupComplete).toBe(false);
    expect(company?.displayName).toBeNull();
    expect(company?.website).toBeNull();
    expect(JSON.parse(checkpoint!.value)).toEqual({ step: "account_type" });
    const [projectTombstone] = await db.select().from(projectsTable)
      .where(eq(projectsTable.owner, "reusable"));
    expect(projectTombstone?.deletedAt).toBeTruthy();
    expect(projectTombstone?.data).toEqual({});
    expect(projectTombstone?.intake).toBeNull();
    expect((await db.select().from(savedAuditsTable)
      .where(eq(savedAuditsTable.owner, "reusable"))).length).toBe(0);
    expect((await db.select().from(savedDiagnosticsTable)
      .where(eq(savedDiagnosticsTable.owner, "reusable"))).length).toBe(0);
    expect((await db.select().from(savedContentGeoTable)
      .where(eq(savedContentGeoTable.owner, "reusable"))).length).toBe(0);
    expect((await db.select().from(savedTechGeoTable)
      .where(eq(savedTechGeoTable.owner, "reusable"))).length).toBe(0);

    const meResponse = await requestMe({
      username: "reusable",
      role: "agency",
      userId,
      membershipRole: "owner",
    });
    expect(meResponse.status).toBe(200);
    const me = await meResponse.json() as {
      setupComplete: boolean;
      onboarding: { step: string } | null;
      accountProfile: { displayName: string | null; website: string | null };
      sessionIdentity: { companyName: string };
    };
    expect(me.setupComplete).toBe(false);
    expect(me.onboarding).toEqual({ step: "account_type" });
    expect(me.accountProfile).toEqual({
      displayName: null,
      website: null,
      workspaceNameNeedsReview: false,
    });
    expect(me.sessionIdentity.companyName).toBe("reusable");
  });

  it("resets a dedicated Google-only account while preserving its sign-in identity", async () => {
    const userId = await seed("google-reusable", { googleOnly: true });
    const [before] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.id, userId));
    const response = await request(
      { username: "admin", role: "admin", membershipRole: "owner" },
      "google-reusable",
    );
    expect(response.status).toBe(200);
    const [after] = await db.select().from(platformUsersTable).where(eq(platformUsersTable.id, userId));
    const [company] = await db.select().from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "google-reusable"));
    expect(after?.googleId).toBe(before?.googleId);
    expect(after?.passwordHash).toBeNull();
    expect(company?.setupComplete).toBe(false);
  });

  it("rejects Stripe-linked and shared-identity accounts before deletion", async () => {
    await seed("stripe-target", { stripe: true });
    expect((await request(
      { username: "admin", role: "admin", membershipRole: "owner" },
      "stripe-target",
    )).status).toBe(400);
    const sharedOwner = await seed("shared-target");
    await db.insert(projectsTable).values({ id: "shared-project", owner: "shared-target", name: "Keep", data: {} });
    const [sharedUser] = await db.insert(platformUsersTable)
      .values({ email: "other@test.invalid", passwordHash: hashPassword("x") }).returning();
    await db.insert(platformMembershipsTable).values([
      { userId: sharedUser!.id, companyId: "other", companySlug: "other", role: "owner" },
      { userId: sharedOwner, companyId: "other", companySlug: "other", role: "viewer" },
    ]);
    expect((await request(
      { username: "admin", role: "admin", membershipRole: "owner" },
      "shared-target",
    )).status).toBe(400);
    expect((await db.select().from(projectsTable).where(eq(projectsTable.owner, "shared-target"))).length).toBe(1);
  });

  it("returns 409 for shared media without partially deleting projects", async () => {
    await seed("media-target");
    await db.insert(projectsTable).values({ id: "media-project", owner: "media-target", name: "Keep", data: {} });
    const [outlet] = await db.insert(mediaOutletsTable)
      .values({ name: "Outlet", accountId: "media-target" }).returning();
    const [contact] = await db.insert(mediaContactsTable)
      .values({ outletId: outlet!.id, accountId: "media-target" }).returning();
    const [set] = await db.insert(mediaRecommendationSetsTable)
      .values({ accountId: "other", projectId: "other-project", storyKey: "story" }).returning();
    await db.insert(mediaRecommendationItemsTable).values({
      recommendationSetId: set!.id,
      contactId: contact!.id,
      score: 1,
      rank: 1,
    });
    const response = await request(
      { username: "admin", role: "admin", membershipRole: "owner" },
      "media-target",
    );
    expect(response.status).toBe(409);
    expect((await db.select().from(projectsTable).where(eq(projectsTable.owner, "media-target"))).length).toBe(1);
    expect((await db.select().from(platformAccountsTable)
      .where(eq(platformAccountsTable.username, "media-target"))).length).toBe(1);
  });
});
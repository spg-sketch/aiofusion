import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database mock (billing-relevant tables only)
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
      stripe_customer_id text,
      stripe_subscription_id text,
      plan varchar(16),
      billing_frequency varchar(16),
      subscription_status varchar(16),
      current_period_end timestamptz,
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
      name varchar NOT NULL DEFAULT '',
      data jsonb NOT NULL DEFAULT '{}',
      intake jsonb,
      logo text,
      owner varchar,
      tier varchar(16),
      deleted_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS token_usage (
      id                 serial PRIMARY KEY,
      account_id         varchar(200) NOT NULL,
      operation          varchar(80) NOT NULL,
      model              varchar(80) NOT NULL,
      input_tokens       integer NOT NULL DEFAULT 0,
      output_tokens      integer NOT NULL DEFAULT 0,
      cost_gbp_estimate  numeric(10,6),
      project_id         varchar(200),
      created_at         timestamptz NOT NULL DEFAULT now()
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
    tokenUsageTable: schema.tokenUsageTable,
  };
});

// Pass-through rate limiter
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

// Capture billing emails; auto-wrap everything else as a no-op.
const sentEmails = vi.hoisted(() => [] as Array<{ kind: string; toEmail: string }>);
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
  mock.sendPaymentFailedEmail = (opts: { toEmail: string }) => {
    sentEmails.push({ kind: "payment_failed", toEmail: opts.toEmail });
    return Promise.resolve();
  };
  mock.sendSubscriptionCancelledEmail = (opts: { toEmail: string }) => {
    sentEmails.push({ kind: "cancelled", toEmail: opts.toEmail });
    return Promise.resolve();
  };
  return mock;
});

// Stripe client mock - checkout tests only need session creation.
const stripeCalls = vi.hoisted(() => ({ sessions: [] as unknown[] }));
vi.mock("../lib/stripe-client", () => ({
  stripeConfigured: () => true,
  getStripeCredentials: () => Promise.resolve({ secretKey: "sk_test_x", webhookSecret: "whsec_x" }),
  getUncachableStripeClient: () =>
    Promise.resolve({
      prices: {
        list: () => Promise.resolve({ data: [{ id: "price_mock_1" }] }),
        create: () => Promise.resolve({ id: "price_mock_created" }),
      },
      products: {
        search: () => Promise.resolve({ data: [{ id: "prod_mock" }] }),
        create: () => Promise.resolve({ id: "prod_mock_created" }),
      },
      customers: {
        create: () => Promise.resolve({ id: "cus_mock_1" }),
      },
      checkout: {
        sessions: {
          create: (params: unknown) => {
            stripeCalls.sessions.push(params);
            return Promise.resolve({ url: "https://checkout.stripe.com/test-session" });
          },
        },
      },
    }),
  getStripeSync: () => Promise.reject(new Error("not used in tests")),
}));

import { db, platformAccountsTable, platformCompaniesTable, platformUsersTable, platformMembershipsTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { hashPassword, createPlatformSession, PLATFORM_COOKIE } from "../lib/platform-auth";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import billingRouter from "./billing";
import {
  handleStripeEvent,
  claimStripeEvent,
  getProjectActionLimit,
  getBillingState,
} from "../lib/billing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; sid?: string } = {},
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(opts.sid ? { cookie: `${PLATFORM_COOKIE}=${opts.sid}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function seedWorkspace(
  slug: string,
  email: string,
  opts: { accountRole?: string; parent?: string | null; membershipRole?: string } = {},
) {
  await db.insert(platformAccountsTable).values({
    username: slug,
    passwordHash: hashPassword("owner-password-1"),
    role: opts.accountRole ?? "agency",
    parent: opts.parent ?? null,
    status: "active",
    email,
  });
  const [company] = await db
    .insert(platformCompaniesTable)
    .values({
      slug,
      role: opts.accountRole ?? "agency",
      parentSlug: opts.parent ?? null,
      status: "active",
      displayName: `${slug} Ltd`,
      setupComplete: true,
      email,
    })
    .returning();
  const [user] = await db
    .insert(platformUsersTable)
    .values({ email, passwordHash: hashPassword("owner-password-1"), emailVerified: true })
    .returning();
  await db.insert(platformMembershipsTable).values({
    userId: user!.id,
    companyId: company!.id,
    companySlug: slug,
    role: opts.membershipRole ?? "owner",
  });
  const sid = await createPlatformSession(slug, null, user!.id, company!.id);
  return { company: company!, user: user!, sid };
}

function fakeEvent(id: string, type: string, object: Record<string, unknown>): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(resolvePlatformAccount);
  app.use("/api", billingRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// Webhook business handlers
// ---------------------------------------------------------------------------
describe("stripe webhook handlers", () => {
  it("claimStripeEvent is idempotent per event id", async () => {
    expect(await claimStripeEvent("evt_claim_1")).toBe(true);
    expect(await claimStripeEvent("evt_claim_1")).toBe(false);
    expect(await claimStripeEvent("evt_claim_2")).toBe(true);
  });

  it("checkout.session.completed activates the subscription; duplicates are skipped", async () => {
    await seedWorkspace("hooks-agency", "owner@hooks.test");

    const evt = fakeEvent("evt_checkout_1", "checkout.session.completed", {
      mode: "subscription",
      customer: "cus_hooks_1",
      subscription: "sub_hooks_1",
      metadata: { slug: "hooks-agency", plan: "agency", frequency: "annual" },
    });
    await handleStripeEvent(evt);

    let state = await getBillingState("hooks-agency");
    expect(state?.status).toBe("active");
    expect(state?.plan).toBe("agency");
    expect(state?.frequency).toBe("annual");
    expect(state?.stripeCustomerId).toBe("cus_hooks_1");
    expect(state?.includedProjects).toBe(3);

    // Replayed event must not clobber later state.
    await db
      .update(platformCompaniesTable)
      .set({ subscriptionStatus: "cancelled" })
      .where(eq(platformCompaniesTable.slug, "hooks-agency"));
    await handleStripeEvent(evt);
    state = await getBillingState("hooks-agency");
    expect(state?.status).toBe("cancelled");
  });

  it("invoice.payment_failed marks past_due and emails the billing contact", async () => {
    await seedWorkspace("dunning-co", "owner@dunning.test");
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_dunning", subscriptionStatus: "active", billingEmail: "bills@dunning.test" })
      .where(eq(platformCompaniesTable.slug, "dunning-co"));

    await handleStripeEvent(
      fakeEvent("evt_fail_1", "invoice.payment_failed", { customer: "cus_dunning", amount_due: 115000 }),
    );

    const state = await getBillingState("dunning-co");
    expect(state?.status).toBe("past_due");
    expect(sentEmails).toContainEqual({ kind: "payment_failed", toEmail: "bills@dunning.test" });
  });

  it("customer.subscription.deleted marks cancelled and emails", async () => {
    await seedWorkspace("gone-co", "owner@gone.test");
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_gone", subscriptionStatus: "active" })
      .where(eq(platformCompaniesTable.slug, "gone-co"));

    await handleStripeEvent(
      fakeEvent("evt_del_1", "customer.subscription.deleted", { customer: "cus_gone" }),
    );

    const state = await getBillingState("gone-co");
    expect(state?.status).toBe("cancelled");
    expect(sentEmails).toContainEqual({ kind: "cancelled", toEmail: "owner@gone.test" });
  });

  it("invoice.payment_succeeded reactivates and rolls the period end", async () => {
    await seedWorkspace("renew-co", "owner@renew.test");
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_renew", subscriptionStatus: "past_due" })
      .where(eq(platformCompaniesTable.slug, "renew-co"));

    const periodEnd = Math.floor(Date.now() / 1000) + 90 * 86400;
    await handleStripeEvent(
      fakeEvent("evt_ok_1", "invoice.payment_succeeded", {
        customer: "cus_renew",
        lines: { data: [{ period: { end: periodEnd } }] },
      }),
    );

    const state = await getBillingState("renew-co");
    expect(state?.status).toBe("active");
    expect(state?.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
  });
});

// ---------------------------------------------------------------------------
// Per-project action limits
// ---------------------------------------------------------------------------
describe("getProjectActionLimit", () => {
  it("unsubscribed accounts keep the legacy flat 50 limit", async () => {
    await seedWorkspace("legacy-co", "owner@legacy.test", { accountRole: "client" });
    expect(await getProjectActionLimit("legacy-co")).toBe(50);
  });

  it("subscribed accounts get Premium 75 for included projects and tier limits for add-ons", async () => {
    await seedWorkspace("tiered-co", "owner@tiered.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({ subscriptionStatus: "active", plan: "inhouse" })
      .where(eq(platformCompaniesTable.slug, "tiered-co"));
    await db.insert(projectsTable).values([
      { id: "tiered-included", name: "Included", data: {}, owner: "tiered-co" },
      { id: "tiered-max", name: "Max add-on", data: {}, owner: "tiered-co", tier: "max" },
      { id: "tiered-std", name: "Standard add-on", data: {}, owner: "tiered-co", tier: "standard" },
    ]);

    expect(await getProjectActionLimit("tiered-co", "tiered-included")).toBe(75);
    expect(await getProjectActionLimit("tiered-co", "tiered-max")).toBe(150);
    expect(await getProjectActionLimit("tiered-co", "tiered-std")).toBe(50);
    expect(await getProjectActionLimit("tiered-co")).toBe(75);
  });

  it("sub-accounts of a subscribed agency inherit the agency's subscription", async () => {
    await seedWorkspace("parent-agency", "owner@parent.test");
    await db
      .update(platformCompaniesTable)
      .set({ subscriptionStatus: "active", plan: "agency" })
      .where(eq(platformCompaniesTable.slug, "parent-agency"));
    await seedWorkspace("child-client", "owner@child.test", { accountRole: "client", parent: "parent-agency" });

    expect(await getProjectActionLimit("child-client")).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Billing routes
// ---------------------------------------------------------------------------
describe("billing routes", () => {
  it("requires authentication", async () => {
    const res = await api("/api/platform/billing/subscription");
    expect(res.status).toBe(401);
  });

  it("returns subscription state + the applicable plan catalogue", async () => {
    const { sid } = await seedWorkspace("route-agency", "owner@route.test");
    const res = await api("/api/platform/billing/subscription", { sid });
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("none");
    expect(res.json.applicablePlan).toBe("agency");
    expect(res.json.includedProjects).toBe(3);
    expect(res.json.prices.annual.yearlyTotal).toBe(500000);
    expect(res.json.prices.quarterly.perQuarter).toBe(143750);
  });

  it("direct clients get the In-House plan", async () => {
    const { sid } = await seedWorkspace("route-client", "owner@routeclient.test", { accountRole: "client" });
    const res = await api("/api/platform/billing/subscription", { sid });
    expect(res.status).toBe(200);
    expect(res.json.applicablePlan).toBe("inhouse");
    expect(res.json.includedProjects).toBe(1);
    expect(res.json.prices.annual.yearlyTotal).toBe(400000);
  });

  it("blocks agency-managed partner clients from all billing routes", async () => {
    await seedWorkspace("managing-agency", "owner@magency.test");
    const { sid } = await seedWorkspace("managed-client", "owner@mclient.test", {
      accountRole: "client",
      parent: "managing-agency",
    });
    expect((await api("/api/platform/billing/subscription", { sid })).status).toBe(403);
    expect((await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } })).status).toBe(403);
  });

  it("blocks viewer/content members from billing routes", async () => {
    const { sid } = await seedWorkspace("member-co", "viewer@member.test", { membershipRole: "viewer" });
    expect((await api("/api/platform/billing/subscription", { sid })).status).toBe(403);
    expect((await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } })).status).toBe(403);
  });

  it("creates a checkout session and rejects a second subscription", async () => {
    const { sid } = await seedWorkspace("buyer-co", "owner@buyer.test", { accountRole: "client" });

    const bad = await api("/api/platform/billing/checkout", { sid, body: { frequency: "monthly" } });
    expect(bad.status).toBe(400);

    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "quarterly" } });
    expect(res.status).toBe(200);
    expect(res.json.url).toBe("https://checkout.stripe.com/test-session");
    const params = stripeCalls.sessions[0] as any;
    expect(params.mode).toBe("subscription");
    expect(params.metadata.slug).toBe("buyer-co");
    expect(params.metadata.plan).toBe("inhouse");
    expect(params.metadata.frequency).toBe("quarterly");
    expect(params.success_url).toContain("checkout=success");

    // Customer id persisted for webhook correlation.
    const state = await getBillingState("buyer-co");
    expect(state?.stripeCustomerId).toBe("cus_mock_1");

    await db
      .update(platformCompaniesTable)
      .set({ subscriptionStatus: "active" })
      .where(eq(platformCompaniesTable.slug, "buyer-co"));
    const again = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(again.status).toBe(409);
  });
});

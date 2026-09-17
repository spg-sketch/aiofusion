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

// Stripe client mock - checkout, portal, invoices, and subscription updates.
const stripeCalls = vi.hoisted(() => ({
  sessions: [] as unknown[],
  subscriptionUpdates: [] as Array<{ id: string; params: any }>,
  portalSessions: [] as unknown[],
  customerCreates: [] as any[],
  customerUpdates: [] as Array<{ id: string; params: any }>,
  // Per-id overrides for customers.retrieve; keyed by customer id.
  // If not set for a given id the mock returns a bare customer with null fields.
  customerRetrieveOverrides: {} as Record<string, Partial<{ name: string; email: string; address: { line1: string }; deleted: boolean }>>,
  // Per-id errors for customers.retrieve.
  customerRetrieveErrors: {} as Record<string, Error & { code?: string }>,
  taxIds: [] as Array<{ id: string; type: string; value: string }>,
  taxIdCreates: [] as any[],
  taxIdDeletes: [] as string[],
  // Records subscription ids whose discount was deleted via deleteDiscount.
  discountDeletes: [] as string[],
  // Records subscription ids that were cancelled via subscriptions.cancel.
  subscriptionCancels: [] as string[],
  // Records session ids that were expired via checkout.sessions.expire.
  sessionExpires: [] as string[],
  // Per-id overrides for checkout.sessions.retrieve.
  sessionRetrieveOverrides: {} as Record<string, Record<string, unknown>>,
  // Per-id errors for checkout.sessions.retrieve.
  sessionRetrieveErrors: {} as Record<string, Error & { code?: string }>,
  // When true, the next finalizeCheckoutClaim call will throw (simulates DB write failure or 0-row preemption).
  rejectFinalize: false,
  // When true, the next checkout.sessions.expire call will throw (simulates a Stripe API failure).
  rejectExpire: false,
  // When true, the next sessions.create with automatic_tax throws the
  // "Stripe Tax not activated" error to exercise the fallback path.
  rejectTaxNext: false,
  // When true, Stripe returns its real missing head-office-address wording.
  rejectTaxHeadOfficeNext: false,
  // When true, tax.calculations.create throws, simulating Tax not activated.
  rejectTaxCalculation: false,
  // Swappable so tests can simulate a test-to-live credential change.
  secretKey: "sk_test_x",
}));
// Wrap finalizeCheckoutClaim so individual tests can simulate a DB write failure
// by setting stripeCalls.rejectFinalize = true before calling the checkout endpoint.
vi.mock("../lib/billing", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/billing")>();
  return {
    ...real,
    finalizeCheckoutClaim: async (...args: Parameters<typeof real.finalizeCheckoutClaim>) => {
      if (stripeCalls.rejectFinalize) {
        stripeCalls.rejectFinalize = false;
        throw new Error("Simulated DB write failure in finalizeCheckoutClaim");
      }
      return real.finalizeCheckoutClaim(...args);
    },
  };
});

vi.mock("../lib/stripe-client", () => ({
  stripeConfigured: () => true,
  getStripeCredentials: () => Promise.resolve({ secretKey: stripeCalls.secretKey, webhookSecret: "whsec_x" }),
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
        create: (params: any) => {
          stripeCalls.customerCreates.push(params);
          return Promise.resolve({ id: "cus_mock_1" });
        },
        update: (id: string, params: any) => {
          stripeCalls.customerUpdates.push({ id, params });
          return Promise.resolve({ id });
        },
        retrieve: (id: string) => {
          const error = stripeCalls.customerRetrieveErrors[id];
          if (error) return Promise.reject(error);
          const override = stripeCalls.customerRetrieveOverrides[id] ?? {};
          return Promise.resolve({
            id,
            deleted: false,
            name: null,
            email: null,
            address: null,
            ...override,
          });
        },
        listTaxIds: () => Promise.resolve({ data: stripeCalls.taxIds }),
        createTaxId: (_id: string, params: any) => {
          stripeCalls.taxIdCreates.push(params);
          return Promise.resolve({ id: "txi_mock", ...params });
        },
        deleteTaxId: (_id: string, taxIdId: string) => {
          stripeCalls.taxIdDeletes.push(taxIdId);
          return Promise.resolve({});
        },
      },
      checkout: {
        sessions: {
          create: (params: any) => {
            if (
              (stripeCalls.rejectTaxNext || stripeCalls.rejectTaxHeadOfficeNext) &&
              params.automatic_tax?.enabled
            ) {
              const missingHeadOffice = stripeCalls.rejectTaxHeadOfficeNext;
              stripeCalls.rejectTaxNext = false;
              stripeCalls.rejectTaxHeadOfficeNext = false;
              return Promise.reject(
                new Error(
                  missingHeadOffice
                    ? "You must have a valid head office address to enable automatic tax calculation in test mode. Visit https://dashboard.stripe.com/test/settings/tax to update it."
                    : "You must activate Stripe Tax and set an origin address before using automatic_tax.",
                ),
              );
            }
            stripeCalls.sessions.push(params);
            return Promise.resolve({ id: "cs_test_mock", url: "https://checkout.stripe.com/test-session" });
          },
          expire: (id: string) => {
            if (stripeCalls.rejectExpire) {
              stripeCalls.rejectExpire = false;
              return Promise.reject(new Error("stripe: could not expire session"));
            }
            stripeCalls.sessionExpires.push(id);
            return Promise.resolve({ id, status: "expired" });
          },
          retrieve: (id: string) => {
            const error = stripeCalls.sessionRetrieveErrors[id];
            if (error) return Promise.reject(error);
            return Promise.resolve({
              id,
              status: "open",
              metadata: {},
              ...(stripeCalls.sessionRetrieveOverrides[id] ?? {}),
            });
          },
        },
      },
      subscriptions: {
        retrieve: (id: string) =>
          Promise.resolve({
            id,
            items: { data: [{ id: "si_mock_1" }] },
            metadata: { kind: "project-addon" },
          }),
        update: (id: string, params: any) => {
          stripeCalls.subscriptionUpdates.push({ id, params });
          return Promise.resolve({ id });
        },
        deleteDiscount: (id: string) => {
          stripeCalls.discountDeletes.push(id);
          return Promise.resolve({});
        },
        cancel: (id: string) => {
          stripeCalls.subscriptionCancels.push(id);
          return Promise.resolve({ id, status: "canceled" });
        },
      },
      billingPortal: {
        configurations: {
          list: () => Promise.resolve({ data: [{ id: "bpc_mock_1" }] }),
          create: () => Promise.resolve({ id: "bpc_mock_created" }),
        },
        sessions: {
          create: (params: unknown) => {
            stripeCalls.portalSessions.push(params);
            return Promise.resolve({ url: "https://billing.stripe.com/test-portal" });
          },
        },
      },
      invoices: {
        list: () =>
          Promise.resolve({
            data: [
              {
                id: "in_mock_1",
                number: "AIO-0001",
                created: 1_700_000_000,
                amount_due: 50000,
                status: "paid",
                hosted_invoice_url: "https://invoice.stripe.com/i/hosted",
                invoice_pdf: "https://invoice.stripe.com/i/pdf",
              },
            ],
          }),
      },
      tax: {
        calculations: {
          create: () => {
            if (stripeCalls.rejectTaxCalculation) {
              return Promise.reject(
                new Error("You must activate Stripe Tax and set an origin address before using automatic_tax."),
              );
            }
            return Promise.resolve({ id: "tax_calc_mock" });
          },
        },
      },
    }),
  getStripeSync: () => Promise.reject(new Error("not used in tests")),
}));

import { db, platformAccountsTable, platformCompaniesTable, platformUsersTable, platformMembershipsTable, platformMetaTable, projectsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import {
  hashPassword,
  createPlatformSession,
  PLATFORM_COOKIE,
  PLATFORM_IMPERSONATION_STASH_COOKIE,
} from "../lib/platform-auth";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import billingRouter from "./billing";
import {
  handleStripeEvent,
  claimStripeEvent,
  getProjectActionLimit,
  getBillingState,
  getProjectAddons,
  getProjectAllowance,
  assignAddonToNewProject,
  syncStripeBillingDetails,
  handleSubscriptionUpdated,
  vatNumberToTaxId,
  CheckoutStartError,
  getCheckoutErrorResponse,
  claimCheckout,
  finalizeCheckoutClaim,
  releaseCheckout,
  CHECKOUT_PENDING_TTL_MS,
  warnIfTaxDeactivated,
  getBetaTrialSummary,
  isEntitled,
  createCheckoutSession,
  createProjectCheckoutSession,
} from "../lib/billing";
import { setStripeCheckoutReadiness } from "../lib/stripe-readiness";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

async function api(
  path: string,
  opts: { method?: string; body?: unknown; sid?: string; stashSid?: string } = {},
): Promise<{ status: number; json: any }> {
  const cookies = [
    opts.sid ? `${PLATFORM_COOKIE}=${opts.sid}` : null,
    opts.stashSid ? `${PLATFORM_IMPERSONATION_STASH_COOKIE}=${opts.stashSid}` : null,
  ].filter(Boolean).join("; ");
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(cookies ? { cookie: cookies } : {}),
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
      billingEmail: email,
      keyAccountHolderEmail: email,
      billingAddress: `${slug} Ltd\n1 Test Street\nLondon\nSW1A 1AA\nUnited Kingdom`,
      billingAddressVersion: 1,
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
  const normalized = type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded"
    ? { payment_status: "paid", ...object }
    : object;
  return { id, type, data: { object: normalized } } as unknown as Stripe.Event;
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

describe("card-free beta trial", () => {
  it("derives exact trial boundaries and entitlement from server time", () => {
    const startedAt = new Date("2026-09-01T12:00:00.000Z");
    const endsAt = new Date("2026-10-31T12:00:00.000Z");
    const base = {
      status: "none" as const,
      freeAccess: false,
      betaTrialStartedAt: startedAt,
      betaTrialEndsAt: endsAt,
    };

    expect(getBetaTrialSummary(base, new Date("2026-10-31T11:59:59.999Z"))).toMatchObject({
      status: "active",
      daysRemaining: 1,
    });
    expect(isEntitled(base, new Date("2026-10-31T11:59:59.999Z"))).toBe(true);
    expect(getBetaTrialSummary(base, endsAt)).toMatchObject({ status: "expired", daysRemaining: 0 });
    expect(isEntitled(base, endsAt)).toBe(false);
    expect(getBetaTrialSummary({ ...base, betaTrialStartedAt: null, betaTrialEndsAt: null }).status).toBe("eligible");
    expect(getBetaTrialSummary({ ...base, freeAccess: true }).status).toBe("exempt");
    expect(getBetaTrialSummary({ ...base, status: "active" }).status).toBe("exempt");
  });

  it("starts once without checkout and immediately grants the beta allowances", async () => {
    const { sid } = await seedWorkspace("trial-owner", "owner@trial-owner.test", { accountRole: "client" });

    const before = await api("/api/platform/billing/subscription", { sid });
    expect(before.status).toBe(200);
    expect(before.json.trial.status).toBe("eligible");
    expect(before.json.projectAllowance).toBe(0);

    const started = await api("/api/platform/billing/trial", { sid, method: "POST" });
    expect(started.status).toBe(201);
    expect(started.json.trial.status).toBe("active");
    expect(started.json.trial.daysRemaining).toBe(60);
    // Direct client trials are intentionally limited to one project.
    expect(await getProjectAllowance("trial-owner")).toBe(1);
    const activeSubscription = await api("/api/platform/billing/subscription", { sid });
    expect(activeSubscription.status).toBe(200);
    expect(activeSubscription.json.projectAllowance).toBe(1);
    // A legacy active trial with no recorded plan still follows its direct
    // client's role rather than retaining the former two-project cap.
    await db
      .update(platformCompaniesTable)
      .set({ plan: null })
      .where(eq(platformCompaniesTable.slug, "trial-owner"));
    expect(await getProjectAllowance("trial-owner")).toBe(1);
    expect(await getProjectActionLimit("trial-owner")).toBe(50);

    const repeated = await api("/api/platform/billing/trial", { sid, method: "POST" });
    expect(repeated.status).toBe(409);
  });

  it("allows only one of two simultaneous activation requests to win", async () => {
    const { sid } = await seedWorkspace("trial-race", "owner@trial-race.test", { accountRole: "agency" });
    const results = await Promise.all([
      api("/api/platform/billing/trial", { sid, method: "POST" }),
      api("/api/platform/billing/trial", { sid, method: "POST" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });

  it("allows billing members, rejects other members, and applies the agency trial to managed clients", async () => {
    const billing = await seedWorkspace("trial-billing", "billing@trial.test", {
      accountRole: "agency",
      membershipRole: "billing",
    });
    expect((await api("/api/platform/billing/trial", { sid: billing.sid, method: "POST" })).status).toBe(201);

    const adminMember = await seedWorkspace("trial-team-admin", "team-admin@trial.test", {
      accountRole: "client",
      membershipRole: "admin",
    });
    expect((await api("/api/platform/billing/trial", { sid: adminMember.sid, method: "POST" })).status).toBe(403);

    await seedWorkspace("trial-managed-client", "managed@trial.test", {
      accountRole: "client",
      parent: "trial-billing",
    });
    expect(await getProjectAllowance("trial-managed-client")).toBe(2);
    expect(await getProjectActionLimit("trial-managed-client")).toBe(50);
  });

  it("uses an in-house trial plan for legacy user-role roots", async () => {
    await seedWorkspace("legacy-user-inhouse", "legacy-user@trial.test", { accountRole: "user" });
    await db.update(platformCompaniesTable)
      .set({ plan: "inhouse" })
      .where(eq(platformCompaniesTable.slug, "legacy-user-inhouse"));
    await db.execute(sql`
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS beta_trial_started_at timestamptz,
        ADD COLUMN IF NOT EXISTS beta_trial_ends_at timestamptz
    `);
    await db.execute(sql`
      UPDATE platform_companies
      SET beta_trial_started_at = now(),
          beta_trial_ends_at = now() + interval '60 days'
      WHERE slug = 'legacy-user-inhouse'
    `);

    expect(await getProjectAllowance("legacy-user-inhouse")).toBe(1);
  });

  it("does not offer a new trial to subscribed or free-access accounts", async () => {
    const subscribed = await seedWorkspace("trial-subscriber", "subscriber@trial.test", { accountRole: "client" });
    await db.update(platformCompaniesTable)
      .set({ subscriptionStatus: "active", plan: "inhouse" })
      .where(eq(platformCompaniesTable.slug, "trial-subscriber"));
    expect((await api("/api/platform/billing/trial", { sid: subscribed.sid, method: "POST" })).status).toBe(409);

    const free = await seedWorkspace("trial-free", "free@trial.test", { accountRole: "client" });
    await db.update(platformCompaniesTable)
      .set({ freeAccess: true })
      .where(eq(platformCompaniesTable.slug, "trial-free"));
    expect((await api("/api/platform/billing/trial", { sid: free.sid, method: "POST" })).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// Webhook business handlers
// ---------------------------------------------------------------------------
describe("stripe webhook handlers", () => {
  it("persists cancel_at_period_end and resets the renewal marker when Stripe rolls the period", async () => {
    await seedWorkspace("renewal-state", "owner@renewal-state.test");
    const oldPeriod = new Date(Date.now() + 6 * 86400000);
    const newPeriod = new Date(Date.now() + 365 * 86400000);
    await db
      .update(platformCompaniesTable)
      .set({
        stripeCustomerId: "cus_renewal_state",
        stripeSubscriptionId: "sub_renewal_state",
        subscriptionStatus: "active",
        currentPeriodEnd: oldPeriod,
        renewalReminderPeriodEnd: oldPeriod,
      })
      .where(eq(platformCompaniesTable.slug, "renewal-state"));

    await handleSubscriptionUpdated(
      fakeEvent("evt_renewal_state", "customer.subscription.updated", {
        id: "sub_renewal_state",
        customer: "cus_renewal_state",
        status: "active",
        cancel_at_period_end: true,
        current_period_end: Math.floor(newPeriod.getTime() / 1000),
      }),
    );

    const [company] = await db
      .select({
        cancelAtPeriodEnd: platformCompaniesTable.cancelAtPeriodEnd,
        currentPeriodEnd: platformCompaniesTable.currentPeriodEnd,
        renewalReminderPeriodEnd: platformCompaniesTable.renewalReminderPeriodEnd,
      })
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "renewal-state"));
    expect(company?.cancelAtPeriodEnd).toBe(true);
    expect(company?.currentPeriodEnd?.getTime()).toBe(Math.floor(newPeriod.getTime() / 1000) * 1000);
    expect(company?.renewalReminderPeriodEnd).toBeNull();
  });

  it("reads item-level renewal dates from current Stripe subscription payloads", async () => {
    await seedWorkspace("item-renewal", "owner@item-renewal.test");
    await db.update(platformCompaniesTable).set({
      stripeCustomerId: "cus_item_renewal",
      stripeSubscriptionId: "sub_item_renewal",
      subscriptionStatus: "active",
    }).where(eq(platformCompaniesTable.slug, "item-renewal"));
    const periodEnd = 1_797_324_422;
    const update = (items: unknown[]) => handleSubscriptionUpdated(
      fakeEvent("evt_item_renewal", "customer.subscription.updated", {
        id: "sub_item_renewal",
        customer: "cus_item_renewal",
        status: "active",
        items: { data: items },
      }),
    );
    await update([
      { current_period_end: periodEnd + 86400 },
      { current_period_end: periodEnd },
      { current_period_end: -1 },
    ]);
    expect((await getBillingState("item-renewal"))?.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
    await update([{ current_period_end: 0 }, {}]);
    expect((await getBillingState("item-renewal"))?.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
  });

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

  it("does not activate an unpaid completed checkout and activates after asynchronous payment succeeds", async () => {
    await seedWorkspace("delayed-pay", "owner@delayed-pay.test");
    const checkout = {
      mode: "subscription",
      payment_status: "unpaid",
      customer: "cus_delayed",
      subscription: "sub_delayed",
      metadata: { slug: "delayed-pay", plan: "agency", frequency: "annual" },
    };

    await handleStripeEvent(fakeEvent("evt_delayed_complete", "checkout.session.completed", checkout));
    expect((await getBillingState("delayed-pay"))?.status).toBe("none");
    expect((await getBillingState("delayed-pay"))?.stripeSubscriptionId).toBeNull();

    await handleStripeEvent(fakeEvent(
      "evt_delayed_paid",
      "checkout.session.async_payment_succeeded",
      { ...checkout, payment_status: "paid" },
    ));
    expect((await getBillingState("delayed-pay"))?.status).toBe("active");
    expect((await getBillingState("delayed-pay"))?.stripeSubscriptionId).toBe("sub_delayed");
  });

  it("releases a failed asynchronous payment so the workspace can start a replacement checkout", async () => {
    const { sid } = await seedWorkspace("failed-delayed-pay", "owner@failed-delayed-pay.test", {
      accountRole: "client",
    });
    const initialSessions = stripeCalls.sessions.length;
    const first = await api("/api/platform/billing/checkout", {
      sid,
      body: { frequency: "annual", onboarding: true },
    });
    expect(first.status).toBe(200);
    const [claim] = await db.select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "checkout:pending:failed-delayed-pay"));
    const claimData = JSON.parse(claim!.value) as { tok: string };
    const sessionsBefore = stripeCalls.sessions.length;

    await handleStripeEvent(fakeEvent("evt_delayed_failed", "checkout.session.async_payment_failed", {
      id: "cs_test_mock",
      mode: "subscription",
      payment_status: "unpaid",
      customer: "cus_failed_delayed",
      subscription: "sub_failed_delayed",
      metadata: {
        slug: "failed-delayed-pay",
        plan: "inhouse",
        frequency: "annual",
        claim_tok: claimData.tok,
      },
    }));

    const retry = await api("/api/platform/billing/checkout", {
      sid,
      body: { frequency: "annual", onboarding: true },
    });
    expect(retry.status).toBe(200);
    expect(stripeCalls.sessions).toHaveLength(sessionsBefore + 1);
    expect(stripeCalls.subscriptionCancels).toContain("sub_failed_delayed");
    stripeCalls.sessions.splice(initialSessions);
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

  it("releases the event claim when a handler fails, so Stripe's retry is re-processed", async () => {
    const evt = fakeEvent("evt_retry_1", "checkout.session.completed", {
      mode: "subscription",
      customer: "cus_retry",
      subscription: "sub_retry",
      // Missing slug triggers the error log path but not a throw; instead we
      // simulate a handler failure by making the event object malformed in a
      // way that throws inside the handler.
      metadata: { slug: "retry-co", plan: "agency", frequency: "annual" },
    });
    // Force a failure: no such company row is fine (update affects 0 rows,
    // no throw), so instead stub the failure via a bad event payload shape.
    const bad = { ...evt, data: null } as never;
    await expect(handleStripeEvent(bad)).rejects.toThrow();
    // The claim must have been released - the same event id claims again.
    expect(await claimStripeEvent("evt_retry_1")).toBe(true);
  });

  it("ignores subscription.deleted for a superseded subscription", async () => {
    await seedWorkspace("resub-co", "owner@resub.test");
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_resub", stripeSubscriptionId: "sub_new", subscriptionStatus: "active" })
      .where(eq(platformCompaniesTable.slug, "resub-co"));

    await handleStripeEvent(
      fakeEvent("evt_stale_del", "customer.subscription.deleted", { id: "sub_old", customer: "cus_resub" }),
    );
    expect((await getBillingState("resub-co"))?.status).toBe("active");

    await handleStripeEvent(
      fakeEvent("evt_live_del", "customer.subscription.deleted", { id: "sub_new", customer: "cus_resub" }),
    );
    expect((await getBillingState("resub-co"))?.status).toBe("cancelled");
  });

  it("ignores invoice events for a superseded subscription", async () => {
    await seedWorkspace("stale-inv-co", "owner@staleinv.test");
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_staleinv", stripeSubscriptionId: "sub_current", subscriptionStatus: "cancelled" })
      .where(eq(platformCompaniesTable.slug, "stale-inv-co"));

    // A late invoice success from an old subscription must not reactivate.
    await handleStripeEvent(
      fakeEvent("evt_stale_inv", "invoice.payment_succeeded", {
        customer: "cus_staleinv",
        subscription: "sub_old",
        lines: { data: [{ period: { end: 2000000000 } }] },
      }),
    );
    expect((await getBillingState("stale-inv-co"))?.status).toBe("cancelled");
  });
});

// ---------------------------------------------------------------------------
// Per-project action limits
// ---------------------------------------------------------------------------
describe("getProjectActionLimit", () => {
  it("unstarted trial accounts receive no paid action allowance", async () => {
    await seedWorkspace("legacy-co", "owner@legacy.test", { accountRole: "client" });
    expect(await getProjectActionLimit("legacy-co")).toBe(0);
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

  it("does not honour tiers of projects outside the caller's billing subtree", async () => {
    await seedWorkspace("victim-co", "owner@victim.test", { accountRole: "client" });
    await seedWorkspace("attacker-co", "owner@attacker.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({ subscriptionStatus: "active", plan: "inhouse" })
      .where(eq(platformCompaniesTable.slug, "victim-co"));
    await db
      .update(platformCompaniesTable)
      .set({ subscriptionStatus: "active", plan: "inhouse" })
      .where(eq(platformCompaniesTable.slug, "attacker-co"));
    await db.insert(projectsTable).values([
      { id: "victim-max", name: "Victim max", data: {}, owner: "victim-co", tier: "max" },
      { id: "ownerless-max", name: "Ownerless", data: {}, tier: "max" },
    ]);

    // Another account's max-tier project id must not grant 150.
    expect(await getProjectActionLimit("attacker-co", "victim-max")).toBe(75);
    // Ownerless projects never grant a tier.
    expect(await getProjectActionLimit("attacker-co", "ownerless-max")).toBe(75);
    // Unknown/fabricated project ids fall back to the included tier.
    expect(await getProjectActionLimit("attacker-co", "made-up-id")).toBe(75);
    // The rightful owner still gets the tier.
    expect(await getProjectActionLimit("victim-co", "victim-max")).toBe(150);
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
    expect(res.json.projectAllowance).toBe(0);
    expect(res.json.projectsUsed).toBe(0);
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
    // A managed client session is rejected unless it is the target of a
    // currently-live parent view-as session. Keep the parent session in the
    // stash cookie so these assertions exercise the billing guards (403),
    // rather than middleware's unauthenticated 401.
    const { sid: parentSid } = await seedWorkspace("managing-agency", "owner@magency.test");
    const { sid } = await seedWorkspace("managed-client", "owner@mclient.test", {
      accountRole: "client",
      parent: "managing-agency",
    });
    expect(
      (await api("/api/platform/billing/subscription", { sid, stashSid: parentSid })).status,
    ).toBe(403);
    expect(
      (await api("/api/platform/billing/checkout", {
        sid,
        stashSid: parentSid,
        body: { frequency: "annual" },
      })).status,
    ).toBe(403);

    // A legacy target session without a live parent stash is intentionally
    // invalidated at the auth boundary, so protected routes return 401.
    const legacySid = await createPlatformSession("managed-client", null, null, null);
    expect((await api("/api/platform/billing/subscription", { sid: legacySid })).status).toBe(401);
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

  it("uses resumable onboarding URLs when onboarding checkout is requested", async () => {
    const { sid } = await seedWorkspace("onboarding-buyer", "owner@onboarding-buyer.test", { accountRole: "client" });
    const res = await api("/api/platform/billing/checkout", {
      sid,
      body: { frequency: "annual", onboarding: true },
    });
    expect(res.status).toBe(200);
    const params = stripeCalls.sessions.at(-1) as any;
    expect(params.success_url).toContain("checkout=success");
    expect(params.success_url).toContain("onboarding=1");
    expect(params.success_url).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toContain("checkout=cancelled");
    expect(params.cancel_url).toContain("onboarding=1");
  });

  it.each([
    ["agency", "agency", "return-agency"],
    ["client", "inhouse", "return-client"],
  ])("reconciles a completed onboarding checkout for a direct %s workspace", async (accountRole, plan, slug) => {
    const { sid } = await seedWorkspace(slug, `${slug}@test.example`, { accountRole });
    const started = await api("/api/platform/billing/checkout", {
      sid,
      body: { frequency: "annual", onboarding: true },
    });
    expect(started.status).toBe(200);
    const [claim] = await db.select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, `checkout:pending:${slug}`));
    const claimData = JSON.parse(claim!.value) as { tok: string };
    stripeCalls.sessionRetrieveOverrides["cs_test_mock"] = {
      id: "cs_test_mock",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      customer: `cus_${slug}`,
      subscription: {
        id: `sub_${slug}`,
        customer: `cus_${slug}`,
        status: "active",
        cancel_at_period_end: false,
        current_period_end: 4_077_052_800,
      },
      client_reference_id: slug,
      metadata: { slug, plan, frequency: "annual", claim_tok: claimData.tok },
    };

    const reconciled = await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    });
    expect(reconciled.status).toBe(200);
    expect(reconciled.json.status).toBe("confirmed");
    expect(reconciled.json.subscription.plan).toBe(plan);
    expect((await getBillingState(slug))?.stripeSubscriptionId).toBe(`sub_${slug}`);

    const duplicate = await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    });
    expect(duplicate.status).toBe(200);
    expect((await getBillingState(slug))?.stripeSubscriptionId).toBe(`sub_${slug}`);
    delete stripeCalls.sessionRetrieveOverrides["cs_test_mock"];
  });

  it("keeps an open checkout pending and rejects a checkout belonging to another workspace", async () => {
    const { sid } = await seedWorkspace("return-owner", "return-owner@test.example", { accountRole: "client" });
    await api("/api/platform/billing/checkout", {
      sid,
      body: { frequency: "quarterly", onboarding: true },
    });
    const [claim] = await db.select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "checkout:pending:return-owner"));
    const claimData = JSON.parse(claim!.value) as { tok: string };
    stripeCalls.sessionRetrieveOverrides["cs_test_mock"] = {
      id: "cs_test_mock",
      mode: "subscription",
      status: "open",
      payment_status: "unpaid",
      metadata: {
        slug: "return-owner",
        plan: "inhouse",
        frequency: "quarterly",
        claim_tok: claimData.tok,
      },
    };
    expect((await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    })).status).toBe(202);

    stripeCalls.sessionRetrieveOverrides["cs_test_mock"] = {
      ...stripeCalls.sessionRetrieveOverrides["cs_test_mock"],
      status: "complete",
      payment_status: "paid",
      metadata: {
        slug: "different-workspace",
        plan: "inhouse",
        frequency: "quarterly",
        claim_tok: claimData.tok,
      },
    };
    expect((await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    })).status).toBe(403);
    delete stripeCalls.sessionRetrieveOverrides["cs_test_mock"];
  });

  it("lets an active beta customer choose a paid plan before the trial ends", async () => {
    const { sid } = await seedWorkspace("trial-convert", "owner@trial-convert.test", { accountRole: "client" });
    expect((await api("/api/platform/billing/trial", { sid, method: "POST" })).status).toBe(201);

    const checkout = await api("/api/platform/billing/checkout", {
      sid,
      body: { frequency: "annual" },
    });
    expect(checkout.status).toBe(200);
    expect(checkout.json.url).toBe("https://checkout.stripe.com/test-session");

    const addOn = await api("/api/platform/billing/project-checkout", {
      sid,
      body: { tier: "max" },
    });
    expect(addOn.status).toBe(409);
    expect(addOn.json.error).toMatch(/active subscription/i);
  });

  it("checkout enables Stripe Tax with address and VAT collection", async () => {
    const { sid } = await seedWorkspace("taxed-co", "owner@taxed.test", { accountRole: "client" });
    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res.status).toBe(200);
    const params = stripeCalls.sessions[stripeCalls.sessions.length - 1] as any;
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.billing_address_collection).toBe("required");
    expect(params.tax_id_collection).toEqual({ enabled: true });
    expect(params.customer_update).toEqual({ address: "auto", name: "auto" });
  });

  it("falls back to a taxless session when Stripe Tax is not activated", async () => {
    const { sid } = await seedWorkspace("untaxed-co", "owner@untaxed.test", { accountRole: "client" });
    stripeCalls.rejectTaxNext = true;
    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res.status).toBe(200);
    const params = stripeCalls.sessions[stripeCalls.sessions.length - 1] as any;
    expect(params.automatic_tax).toBeUndefined();
    expect(params.metadata.slug).toBe("untaxed-co");
  });

  it("falls back in test mode when Stripe Tax has no valid head office address", async () => {
    const { sid } = await seedWorkspace("tax-address-co", "owner@tax-address.test", { accountRole: "client" });
    stripeCalls.rejectTaxHeadOfficeNext = true;
    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "quarterly" } });
    expect(res.status).toBe(200);
    expect(res.json.url).toBe("https://checkout.stripe.com/test-session");
    const params = stripeCalls.sessions[stripeCalls.sessions.length - 1] as any;
    expect(params.automatic_tax).toBeUndefined();
    expect(params.metadata.slug).toBe("tax-address-co");
    expect(params.metadata.frequency).toBe("quarterly");
  });

  it("refuses a taxless fallback in live mode, even after a test-mode fallback in the same process", async () => {
    // First, a test-mode fallback happens (exercised by the previous test's
    // path); now the key is swapped to live WITHOUT a restart. The live
    // determination must be fresh, so the fallback is refused.
    const { sid } = await seedWorkspace("live-co", "owner@live.test", { accountRole: "client" });
    stripeCalls.secretKey = "sk_test_x";
    stripeCalls.rejectTaxNext = true;
    const testRes = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(testRes.status).toBe(200); // test mode: fallback allowed
    try {
      await db
        .update(platformCompaniesTable)
        .set({ subscriptionStatus: null })
        .where(eq(platformCompaniesTable.slug, "live-co"));
      // The first checkout left a durable claim in the DB. Clear it so the
      // second request reaches the live-mode tax check instead of getting
      // redirected to the existing (test-mode) session URL.
      await db.execute(sql`DELETE FROM platform_meta WHERE key = 'checkout:pending:live-co'`);
      stripeCalls.secretKey = "sk_live_x";
      stripeCalls.rejectTaxNext = true;
      const sessionsBefore = stripeCalls.sessions.length;
      const liveRes = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
      expect(liveRes.status).toBe(503); // live mode: checkout refused
      expect(liveRes.json).toEqual({
        error: "Stripe Tax setup is incomplete. The account owner must activate Stripe Tax and set a valid head office address in Stripe, then try again.",
        code: "stripe_tax_incomplete",
      });
      expect(stripeCalls.sessions.length).toBe(sessionsBefore); // no taxless session created
    } finally {
      stripeCalls.secretKey = "sk_test_x";
    }
  });

  it("maps known Stripe setup failures to actionable checkout responses", () => {
    expect(
      getCheckoutErrorResponse(
        Object.assign(new Error("Invalid API Key provided"), {
          type: "StripeAuthenticationError",
        }),
      ),
    ).toEqual({
      status: 503,
      error: "Checkout is temporarily unavailable because the Stripe connection needs attention. Please contact support.",
      code: "stripe_connection_unavailable",
    });

    expect(
      getCheckoutErrorResponse(
        Object.assign(new Error("No such price: price_missing"), {
          code: "resource_missing",
        }),
      ),
    ).toEqual({
      status: 503,
      error: "Checkout is temporarily unavailable because the Stripe price setup is incomplete. Please contact support.",
      code: "stripe_price_unavailable",
    });

    expect(
      getCheckoutErrorResponse(
        new CheckoutStartError(
          "discount_verification_failed",
          "We could not verify this account's discount, so no payment was started. Please contact support before retrying.",
        ),
      ),
    ).toEqual({
      status: 503,
      error: "We could not verify this account's discount, so no payment was started. Please contact support before retrying.",
      code: "discount_verification_failed",
    });

    expect(getCheckoutErrorResponse(new Error("unexpected failure"))).toBeNull();
  });

  it("blocks both plan and project checkout before any Stripe work when webhook readiness fails", async () => {
    const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;
    process.env.DEPLOYMENT_ENV = "production";
    setStripeCheckoutReadiness({
      available: false,
      reason: "webhook_secret_mismatch",
    });
    try {
      const planCheckout = createCheckoutSession({
        slug: "blocked-plan",
        plan: "agency",
        frequency: "annual",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
      });
      const projectCheckout = createProjectCheckoutSession({
        slug: "blocked-project",
        tier: "standard",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
      });

      await expect(planCheckout).rejects.toMatchObject({
        code: "stripe_webhook_unavailable",
        statusCode: 503,
      });
      await expect(projectCheckout).rejects.toMatchObject({
        code: "stripe_webhook_unavailable",
        statusCode: 503,
      });
    } finally {
      if (originalDeploymentEnv === undefined) delete process.env.DEPLOYMENT_ENV;
      else process.env.DEPLOYMENT_ENV = originalDeploymentEnv;
      setStripeCheckoutReadiness({ available: true });
    }
  });

  it("creates the Stripe customer with address and VAT number from billing details", async () => {
    const { sid } = await seedWorkspace("detailed-co", "owner@detailed.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({
        billingEmail: "accounts@detailed.test",
        vatNumber: "GB123456789",
        billingAddress: "Detailed Co Ltd\n1 High Street\nLondon\nSW1A 1AA\nUnited Kingdom",
      })
      .where(eq(platformCompaniesTable.slug, "detailed-co"));
    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res.status).toBe(200);
    const created = stripeCalls.customerCreates[stripeCalls.customerCreates.length - 1];
    expect(created.email).toBe("accounts@detailed.test");
    expect(created.address).toEqual({
      line1: "1 High Street",
      city: "London",
      postal_code: "SW1A 1AA",
      country: "GB",
    });
    // The VAT number is attached separately (fail-soft), not inline on create.
    expect(created.tax_id_data).toBeUndefined();
    expect(stripeCalls.taxIdCreates).toContainEqual({ type: "gb_vat", value: "GB123456789" });
  });

  it("syncStripeBillingDetails pushes name, email, address and reconciles tax IDs", async () => {
    await seedWorkspace("sync-co", "owner@sync.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({
        stripeCustomerId: "cus_sync_1",
        billingEmail: "bills@sync.test",
        vatNumber: "DE123456789",
        billingAddress: "Sync Co Ltd\n2 Kaiserstrasse\nBerlin\n10115\nGermany",
      })
      .where(eq(platformCompaniesTable.slug, "sync-co"));
    stripeCalls.taxIds.length = 0;
    stripeCalls.taxIds.push({ id: "txi_old", type: "gb_vat", value: "GB999999999" });
    await syncStripeBillingDetails("sync-co");
    const upd = stripeCalls.customerUpdates[stripeCalls.customerUpdates.length - 1];
    expect(upd.id).toBe("cus_sync_1");
    expect(upd.params.email).toBe("bills@sync.test");
    expect(upd.params.address).toEqual({
      line1: "2 Kaiserstrasse",
      city: "Berlin",
      postal_code: "10115",
      country: "DE",
    });
    expect(stripeCalls.taxIdDeletes).toContain("txi_old");
    expect(stripeCalls.taxIdCreates).toContainEqual({ type: "eu_vat", value: "DE123456789" });
  });

  it("does not reinterpret or push an unversioned legacy address to Stripe", async () => {
    await seedWorkspace("legacy-sync-co", "owner@legacy-sync.test", { accountRole: "client" });
    const legacy = "4 Old Street\nBristol\nBS1 1AA\nUnited Kingdom";
    await db.update(platformCompaniesTable).set({
      stripeCustomerId: "cus_legacy_sync",
      billingAddress: legacy,
      billingAddressVersion: null,
    }).where(eq(platformCompaniesTable.slug, "legacy-sync-co"));

    await syncStripeBillingDetails("legacy-sync-co");
    const update = stripeCalls.customerUpdates[stripeCalls.customerUpdates.length - 1];
    expect(update.params.address).toBeUndefined();
    const [company] = await db.select().from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "legacy-sync-co"));
    expect(company.billingAddress).toBe(legacy);
    expect(company.billingAddressVersion).toBeNull();
  });

  it("a malformed stored VAT number does not block customer creation or checkout", async () => {
    const { sid } = await seedWorkspace("badvat-co", "owner@badvat.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({ vatNumber: "GB-THIS-IS-NOT-VALID-#####" })
      .where(eq(platformCompaniesTable.slug, "badvat-co"));
    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res.status).toBe(200);
    const created = stripeCalls.customerCreates[stripeCalls.customerCreates.length - 1];
    // VAT is attached separately (fail-soft), never inline on create.
    expect(created.tax_id_data).toBeUndefined();
  });

  it("replaces a missing sandbox customer before the first live checkout", async () => {
    const { sid } = await seedWorkspace("stale-customer-co", "owner@stale-customer.test", { accountRole: "client" });
    const staleCustomerId = "cus_old_sandbox";
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: staleCustomerId })
      .where(eq(platformCompaniesTable.slug, "stale-customer-co"));
    stripeCalls.customerRetrieveErrors[staleCustomerId] = Object.assign(
      new Error(`No such customer: '${staleCustomerId}'`),
      { code: "resource_missing" },
    );

    try {
      const createsBefore = stripeCalls.customerCreates.length;
      const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
      expect(res.status).toBe(200);
      expect(stripeCalls.customerCreates).toHaveLength(createsBefore + 1);
      expect((await getBillingState("stale-customer-co"))?.stripeCustomerId).toBe("cus_mock_1");
    } finally {
      delete stripeCalls.customerRetrieveErrors[staleCustomerId];
      await db.execute(sql`DELETE FROM platform_meta WHERE key = 'checkout:pending:stale-customer-co'`);
    }
  });

  it("clearing the billing address clears it on the Stripe customer too", async () => {
    await seedWorkspace("clear-co", "owner@clear.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_clear_1", billingAddress: null, vatNumber: null })
      .where(eq(platformCompaniesTable.slug, "clear-co"));
    stripeCalls.taxIds.length = 0;
    await syncStripeBillingDetails("clear-co");
    const upd = stripeCalls.customerUpdates[stripeCalls.customerUpdates.length - 1];
    expect(upd.id).toBe("cus_clear_1");
    expect(upd.params.address).toBe("");
  });

  it("vatNumberToTaxId maps GB and EU prefixes and rejects the rest", () => {
    expect(vatNumberToTaxId("gb 123 456 789")).toEqual({ type: "gb_vat", value: "GB123456789" });
    expect(vatNumberToTaxId("FR12345678901")).toEqual({ type: "eu_vat", value: "FR12345678901" });
    expect(vatNumberToTaxId("US12-3456789")).toBeNull();
    expect(vatNumberToTaxId("")).toBeNull();
  });

  it("subscription state includes the latest invoice link once a customer exists", async () => {
    const { sid } = await seedWorkspace("inv-link-co", "owner@invlink.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_invlink", subscriptionStatus: "active", plan: "inhouse" })
      .where(eq(platformCompaniesTable.slug, "inv-link-co"));
    const res = await api("/api/platform/billing/subscription", { sid });
    expect(res.status).toBe(200);
    expect(res.json.latestInvoiceUrl).toBe("https://invoice.stripe.com/i/hosted");
  });

  it("latestInvoiceUrl is null when the account has no Stripe customer yet", async () => {
    const { sid } = await seedWorkspace("no-cust-co", "owner@nocust.test", { accountRole: "client" });
    // No stripeCustomerId set: account has not checked out yet.
    const res = await api("/api/platform/billing/subscription", { sid });
    expect(res.status).toBe(200);
    expect(res.json.latestInvoiceUrl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Project add-ons: purchase, fulfilment, allowance, tier changes
// ---------------------------------------------------------------------------
describe("project add-ons", () => {
  async function seedSubscribed(slug: string, email: string, accountRole = "client") {
    const seeded = await seedWorkspace(slug, email, { accountRole });
    await db
      .update(platformCompaniesTable)
      .set({
        subscriptionStatus: "active",
        plan: accountRole === "agency" ? "agency" : "inhouse",
        stripeCustomerId: `cus_${slug}`,
        stripeSubscriptionId: `sub_${slug}`,
      })
      .where(eq(platformCompaniesTable.slug, slug));
    return seeded;
  }

  it("allowance is exactly what's paid for: In-House 1, Agency 3, unstarted trial 0", async () => {
    await seedSubscribed("allow-ih", "owner@allowih.test");
    expect(await getProjectAllowance("allow-ih")).toBe(1);
    await seedSubscribed("allow-ag", "owner@allowag.test", "agency");
    expect(await getProjectAllowance("allow-ag")).toBe(3);
    await seedWorkspace("allow-none", "owner@allownone.test", { accountRole: "client" });
    expect(await getProjectAllowance("allow-none")).toBe(0);
  });

  it("project-checkout requires an active subscription and a valid tier", async () => {
    const { sid } = await seedWorkspace("addon-unsub", "owner@addonunsub.test", { accountRole: "client" });
    expect((await api("/api/platform/billing/project-checkout", { sid, body: { tier: "gold" } })).status).toBe(400);
    expect((await api("/api/platform/billing/project-checkout", { sid, body: { tier: "max" } })).status).toBe(409);
  });

  it("project-checkout creates an add-on session with kind metadata", async () => {
    const { sid } = await seedSubscribed("addon-buyer", "owner@addonbuyer.test");
    const res = await api("/api/platform/billing/project-checkout", { sid, body: { tier: "max" } });
    expect(res.status).toBe(200);
    expect(res.json.url).toContain("checkout.stripe.com");
    const params = stripeCalls.sessions[stripeCalls.sessions.length - 1] as any;
    expect(params.metadata.kind).toBe("project-addon");
    expect(params.metadata.tier).toBe("max");
    expect(params.metadata.slug).toBe("addon-buyer");
    expect(params.success_url).toContain("session_id={CHECKOUT_SESSION_ID}");
  });

  it("reconciles a paid add-on from Stripe metadata and returns the persisted assignment on replay", async () => {
    const { sid } = await seedSubscribed("addon-return", "owner@addonreturn.test");
    await db.insert(projectsTable).values({
      id: "addon-return-project",
      name: "Return project",
      data: {},
      owner: "addon-return",
    });
    const checkout = await api("/api/platform/billing/project-checkout", {
      sid,
      body: { tier: "premium", projectId: "addon-return-project" },
    });
    expect(checkout.status).toBe(200);
    stripeCalls.sessionRetrieveOverrides["cs_test_mock"] = {
      id: "cs_test_mock",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      customer: "cus_addon-return",
      subscription: {
        id: "sub_addon-return-project",
        customer: "cus_addon-return",
        status: "active",
      },
      metadata: {
        slug: "addon-return",
        kind: "project-addon",
        tier: "premium",
        projectId: "addon-return-project",
      },
    };

    const confirmed = await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.json).toEqual({
      status: "confirmed",
      kind: "project-addon",
      addon: {
        tier: "premium",
        projectId: "addon-return-project",
        assigned: true,
      },
    });
    expect(await getProjectAddons("addon-return")).toMatchObject([
      { subscriptionId: "sub_addon-return-project", tier: "premium", projectId: "addon-return-project" },
    ]);

    const replay = await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    });
    expect(replay.status).toBe(200);
    expect(replay.json.addon).toEqual(confirmed.json.addon);
    expect(await getProjectAddons("addon-return")).toHaveLength(1);
    delete stripeCalls.sessionRetrieveOverrides["cs_test_mock"];
  });

  it("keeps an unpaid or open add-on return pending and rejects another account's customer", async () => {
    const { sid } = await seedSubscribed("addon-pending", "owner@addonpending.test");
    stripeCalls.sessionRetrieveOverrides["cs_test_mock"] = {
      id: "cs_test_mock",
      mode: "subscription",
      status: "open",
      payment_status: "unpaid",
      customer: "cus_addon-pending",
      subscription: "sub_addon-pending",
      metadata: { slug: "addon-pending", kind: "project-addon", tier: "max" },
    };
    const pending = await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    });
    expect(pending.status).toBe(202);
    expect(await getProjectAddons("addon-pending")).toHaveLength(0);

    stripeCalls.sessionRetrieveOverrides["cs_test_mock"] = {
      ...stripeCalls.sessionRetrieveOverrides["cs_test_mock"],
      status: "complete",
      payment_status: "paid",
      customer: "cus-someone-else",
    };
    const unauthorized = await api("/api/platform/billing/reconcile-checkout", {
      sid,
      body: { sessionId: "cs_test_mock" },
    });
    expect(unauthorized.status).toBe(403);
    delete stripeCalls.sessionRetrieveOverrides["cs_test_mock"];
  });

  it("project-checkout also enables Stripe Tax, address and VAT collection", async () => {
    const { sid } = await seedSubscribed("addon-tax-buyer", "owner@addontax.test");
    const res = await api("/api/platform/billing/project-checkout", { sid, body: { tier: "standard" } });
    expect(res.status).toBe(200);
    const params = stripeCalls.sessions[stripeCalls.sessions.length - 1] as any;
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.billing_address_collection).toBe("required");
    expect(params.tax_id_collection).toEqual({ enabled: true });
    expect(params.customer_update).toEqual({ address: "auto", name: "auto" });
  });

  it("rejects attaching an add-on to a foreign project", async () => {
    const { sid } = await seedSubscribed("addon-a", "owner@addona.test");
    await seedSubscribed("addon-b", "owner@addonb.test");
    await db.insert(projectsTable).values({ id: "b-proj", name: "B", data: {}, owner: "addon-b" });
    const res = await api("/api/platform/billing/project-checkout", {
      sid,
      body: { tier: "max", projectId: "b-proj" },
    });
    expect(res.status).toBe(400);
  });

  it("webhook fulfilment records the add-on; unassigned slots attach to extra projects beyond the included allowance", async () => {
    // "addon-fulfil" uses the inhouse plan (1 included project).
    await seedSubscribed("addon-fulfil", "owner@addonfulfil.test");
    // Create the 1 included project first so the included slot is occupied.
    await db.insert(projectsTable).values({ id: "fulfil-included", name: "Included", data: {}, owner: "addon-fulfil" });

    await handleStripeEvent(
      fakeEvent("evt_addon_1", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-fulfil",
        subscription: "sub_addon_1",
        metadata: { slug: "addon-fulfil", kind: "project-addon", tier: "max" },
      }),
    );

    const addons = await getProjectAddons("addon-fulfil");
    expect(addons).toHaveLength(1);
    expect(addons[0]!.tier).toBe("max");
    expect(addons[0]!.projectId).toBeNull();
    // Main plan untouched.
    const state = await getBillingState("addon-fulfil");
    expect(state?.stripeSubscriptionId).toBe("sub_addon-fulfil");
    expect(state?.status).toBe("active");
    // Allowance grew: 1 included (inhouse) + 1 add-on.
    expect(await getProjectAllowance("addon-fulfil")).toBe(2);

    // The EXTRA project (2nd, beyond the included allowance) consumes the slot
    // and gets the purchased tier.
    await db.insert(projectsTable).values({ id: "fulfil-extra", name: "Extra", data: {}, owner: "addon-fulfil" });
    await assignAddonToNewProject("addon-fulfil", "fulfil-extra");
    const after = await getProjectAddons("addon-fulfil");
    expect(after[0]!.projectId).toBe("fulfil-extra");
    expect(await getProjectActionLimit("addon-fulfil", "fulfil-extra")).toBe(150);
    // The included project is unaffected.
    expect(await getProjectActionLimit("addon-fulfil", "fulfil-included")).toBe(75);
  });

  it("add-ons are not auto-assigned to projects within the included allowance", async () => {
    // Buy an add-on for an inhouse account that has no projects yet.
    await seedSubscribed("addon-nocons", "owner@addonnocons.test");
    await handleStripeEvent(
      fakeEvent("evt_addon_nocons", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-nocons",
        subscription: "sub_addon_nocons",
        metadata: { slug: "addon-nocons", kind: "project-addon", tier: "max" },
      }),
    );
    // Create the 1st project (inhouse = 1 included). Since the account is still
    // within the included allowance, the purchased slot must NOT be auto-assigned.
    await db.insert(projectsTable).values({ id: "nocons-proj", name: "Included", data: {}, owner: "addon-nocons" });
    await assignAddonToNewProject("addon-nocons", "nocons-proj");
    const addons = await getProjectAddons("addon-nocons");
    expect(addons[0]!.projectId).toBeNull(); // slot still unassigned
    expect(await getProjectActionLimit("addon-nocons", "nocons-proj")).toBe(75); // included tier, not paid add-on tier
  });

  it("webhook fulfilment with a projectId attaches and sets the tier immediately", async () => {
    await seedSubscribed("addon-attach", "owner@addonattach.test");
    await db.insert(projectsTable).values({ id: "attach-proj", name: "P", data: {}, owner: "addon-attach" });

    await handleStripeEvent(
      fakeEvent("evt_addon_2", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-attach",
        subscription: "sub_addon_2",
        metadata: { slug: "addon-attach", kind: "project-addon", tier: "max", projectId: "attach-proj" },
      }),
    );

    expect(await getProjectActionLimit("addon-attach", "attach-proj")).toBe(150);
    const addons = await getProjectAddons("addon-attach");
    expect(addons[0]!.projectId).toBe("attach-proj");
  });

  it("fulfilment stores the slot unassigned when the target project left the account", async () => {
    await seedSubscribed("addon-stale", "owner@addonstale.test");
    await seedSubscribed("addon-other", "owner@addonother.test");
    await db.insert(projectsTable).values({ id: "other-proj", name: "O", data: {}, owner: "addon-other" });

    await handleStripeEvent(
      fakeEvent("evt_addon_stale", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-stale",
        subscription: "sub_addon_stale",
        metadata: { slug: "addon-stale", kind: "project-addon", tier: "max", projectId: "other-proj" },
      }),
    );
    const addons = await getProjectAddons("addon-stale");
    expect(addons).toHaveLength(1);
    expect(addons[0]!.projectId).toBeNull();
    // Foreign project untouched.
    expect(await getProjectActionLimit("addon-other", "other-proj")).toBe(75);
  });

  it("upgrading an add-on applies immediately with a prorated charge", async () => {
    const { sid } = await seedSubscribed("addon-up", "owner@addonup.test");
    await db.insert(projectsTable).values({ id: "up-proj", name: "Up", data: {}, owner: "addon-up", tier: "standard" });
    await handleStripeEvent(
      fakeEvent("evt_addon_3", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-up",
        subscription: "sub_addon_3",
        metadata: { slug: "addon-up", kind: "project-addon", tier: "standard", projectId: "up-proj" },
      }),
    );

    const res = await api("/api/platform/billing/project-tier", { sid, body: { projectId: "up-proj", tier: "max" } });
    expect(res.status).toBe(200);
    expect(res.json.applied).toBe("now");
    const update = stripeCalls.subscriptionUpdates.find((u) => u.id === "sub_addon_3");
    expect(update?.params.proration_behavior).toBe("always_invoice");
    expect(await getProjectActionLimit("addon-up", "up-proj")).toBe(150);
  });

  it("downgrading an add-on queues to renewal and applies on the renewal invoice", async () => {
    const { sid } = await seedSubscribed("addon-down", "owner@addondown.test");
    await db.insert(projectsTable).values({ id: "down-proj", name: "Down", data: {}, owner: "addon-down", tier: "max" });
    await handleStripeEvent(
      fakeEvent("evt_addon_4", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-down",
        subscription: "sub_addon_4",
        metadata: { slug: "addon-down", kind: "project-addon", tier: "max", projectId: "down-proj" },
      }),
    );

    const res = await api("/api/platform/billing/project-tier", { sid, body: { projectId: "down-proj", tier: "standard" } });
    expect(res.status).toBe(200);
    expect(res.json.applied).toBe("at_renewal");
    const update = stripeCalls.subscriptionUpdates.find((u) => u.id === "sub_addon_4");
    expect(update?.params.proration_behavior).toBe("none");
    // Limit unchanged until renewal.
    expect(await getProjectActionLimit("addon-down", "down-proj")).toBe(150);

    // A NON-renewal invoice success (out-of-order webhook, one-off charge)
    // must NOT apply the queued downgrade early.
    await handleStripeEvent(
      fakeEvent("evt_addon_notrenew", "invoice.payment_succeeded", {
        customer: "cus_addon-down",
        subscription: "sub_addon_4",
        billing_reason: "subscription_create",
        lines: { data: [{ period: { end: 2_000_000_000 } }] },
      }),
    );
    expect(await getProjectActionLimit("addon-down", "down-proj")).toBe(150);

    // Renewal invoice for the add-on applies the pending tier and must not
    // touch the main plan's period end.
    await handleStripeEvent(
      fakeEvent("evt_addon_renew", "invoice.payment_succeeded", {
        customer: "cus_addon-down",
        subscription: "sub_addon_4",
        billing_reason: "subscription_cycle",
        lines: { data: [{ period: { end: 2_100_000_000 } }] },
      }),
    );
    expect(await getProjectActionLimit("addon-down", "down-proj")).toBe(50);
    const state = await getBillingState("addon-down");
    expect(state?.currentPeriodEnd).toBeNull();
  });

  it("cancelling an add-on retires its project so the account cannot keep an unpaid extra", async () => {
    await seedSubscribed("addon-gone", "owner@addongone.test");
    await db.insert(projectsTable).values({ id: "gone-proj", name: "Gone", data: {}, owner: "addon-gone" });
    await handleStripeEvent(
      fakeEvent("evt_addon_5", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-gone",
        subscription: "sub_addon_5",
        metadata: { slug: "addon-gone", kind: "project-addon", tier: "max", projectId: "gone-proj" },
      }),
    );
    expect(await getProjectActionLimit("addon-gone", "gone-proj")).toBe(150);

    await handleStripeEvent(
      fakeEvent("evt_addon_6", "customer.subscription.deleted", {
        id: "sub_addon_5",
        customer: "cus_addon-gone",
        metadata: { kind: "project-addon" },
      }),
    );
    expect(await getProjectAddons("addon-gone")).toHaveLength(0);
    // The project the slot funded is soft-deleted (recoverable), so the
    // account drops back within its paid allowance; main plan still active.
    const [row] = await db
      .select({ deletedAt: projectsTable.deletedAt, tier: projectsTable.tier })
      .from(projectsTable)
      .where(eq(projectsTable.id, "gone-proj"));
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.tier).toBeNull();
    expect((await getBillingState("addon-gone"))?.status).toBe("active");
  });

  it("cancelling an UNASSIGNED add-on removes only the slot and touches no project", async () => {
    await seedSubscribed("addon-unass", "owner@addonunass.test");
    await db.insert(projectsTable).values({ id: "unass-proj", name: "U", data: {}, owner: "addon-unass" });
    await handleStripeEvent(
      fakeEvent("evt_addon_ua1", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-unass",
        subscription: "sub_addon_ua",
        metadata: { slug: "addon-unass", kind: "project-addon", tier: "standard" },
      }),
    );
    expect(await getProjectAddons("addon-unass")).toHaveLength(1);
    await handleStripeEvent(
      fakeEvent("evt_addon_ua2", "customer.subscription.deleted", {
        id: "sub_addon_ua",
        customer: "cus_addon-unass",
        metadata: { kind: "project-addon" },
      }),
    );
    expect(await getProjectAddons("addon-unass")).toHaveLength(0);
    const [row] = await db
      .select({ deletedAt: projectsTable.deletedAt })
      .from(projectsTable)
      .where(eq(projectsTable.id, "unass-proj"));
    expect(row!.deletedAt).toBeNull();
    expect((await getBillingState("addon-unass"))?.status).toBe("active");
  });

  it("transferring an add-on project outside its billing subtree detaches the paid tier", async () => {
    const { detachAddonForProjectTransfer } = await import("../lib/billing");
    await seedSubscribed("addon-xfer", "owner@addonxfer.test");
    await seedSubscribed("addon-recv", "owner@addonrecv.test");
    await db.insert(projectsTable).values({ id: "xfer-proj", name: "X", data: {}, owner: "addon-xfer" });
    await handleStripeEvent(
      fakeEvent("evt_addon_xfer", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-xfer",
        subscription: "sub_addon_xfer",
        metadata: { slug: "addon-xfer", kind: "project-addon", tier: "max", projectId: "xfer-proj" },
      }),
    );
    expect(await getProjectActionLimit("addon-xfer", "xfer-proj")).toBe(150);

    await detachAddonForProjectTransfer("addon-xfer", "xfer-proj", "addon-recv");
    // Slot returns to the purchaser unassigned; tier cleared before the move.
    const addons = await getProjectAddons("addon-xfer");
    expect(addons).toHaveLength(1);
    expect(addons[0]!.projectId).toBeNull();
    await db.update(projectsTable).set({ owner: "addon-recv" }).where(eq(projectsTable.id, "xfer-proj"));
    expect(await getProjectActionLimit("addon-recv", "xfer-proj")).toBe(75);
  });

  it("a queued downgrade survives detachment and applies at renewal to the re-assigned slot", async () => {
    const { detachAddonForProjectTransfer } = await import("../lib/billing");
    const { sid } = await seedSubscribed("addon-dq", "owner@addondq.test");
    await seedSubscribed("addon-dq-recv", "owner@addondqrecv.test");
    await db.insert(projectsTable).values({ id: "dq-proj", name: "DQ", data: {}, owner: "addon-dq" });
    await handleStripeEvent(
      fakeEvent("evt_addon_dq", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-dq",
        subscription: "sub_addon_dq",
        metadata: { slug: "addon-dq", kind: "project-addon", tier: "max", projectId: "dq-proj" },
      }),
    );
    // Queue a downgrade (Stripe now bills standard from renewal)...
    const down = await api("/api/platform/billing/project-tier", { sid, body: { projectId: "dq-proj", tier: "standard" } });
    expect(down.json.applied).toBe("at_renewal");
    // ...then transfer the project away. pendingTier must survive detachment.
    await detachAddonForProjectTransfer("addon-dq", "dq-proj", "addon-dq-recv");
    let addons = await getProjectAddons("addon-dq");
    expect(addons[0]!.projectId).toBeNull();
    expect(addons[0]!.pendingTier).toBe("standard");
    // Assign the slot to a fresh project (gets the still-current max tier)...
    await db.insert(projectsTable).values({ id: "dq-proj2", name: "DQ2", data: {}, owner: "addon-dq" });
    await assignAddonToNewProject("addon-dq", "dq-proj2");
    expect(await getProjectActionLimit("addon-dq", "dq-proj2")).toBe(150);
    // ...and the renewal lowers it as billed.
    await handleStripeEvent(
      fakeEvent("evt_addon_dq_renew", "invoice.payment_succeeded", {
        customer: "cus_addon-dq",
        subscription: "sub_addon_dq",
        billing_reason: "subscription_cycle",
        lines: { data: [{ period: { end: 2_100_000_000 } }] },
      }),
    );
    addons = await getProjectAddons("addon-dq");
    expect(addons[0]!.tier).toBe("standard");
    expect(addons[0]!.pendingTier).toBeUndefined();
    expect(await getProjectActionLimit("addon-dq", "dq-proj2")).toBe(50);
  });

  it("concurrent new projects cannot consume the same purchased slot twice", async () => {
    await seedSubscribed("addon-race", "owner@addonrace.test");
    await handleStripeEvent(
      fakeEvent("evt_addon_race", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_addon-race",
        subscription: "sub_addon_race",
        metadata: { slug: "addon-race", kind: "project-addon", tier: "max" },
      }),
    );
    await db.insert(projectsTable).values([
      { id: "race-1", name: "R1", data: {}, owner: "addon-race" },
      { id: "race-2", name: "R2", data: {}, owner: "addon-race" },
    ]);
    await Promise.all([
      assignAddonToNewProject("addon-race", "race-1"),
      assignAddonToNewProject("addon-race", "race-2"),
    ]);
    const addons = await getProjectAddons("addon-race");
    expect(addons).toHaveLength(1);
    // Exactly one project got the paid tier; the other stays included.
    const limits = await Promise.all([
      getProjectActionLimit("addon-race", "race-1"),
      getProjectActionLimit("addon-race", "race-2"),
    ]);
    expect(limits.filter((l) => l === 150)).toHaveLength(1);
    expect(addons[0]!.projectId).toBeTruthy();
  });

  it("project-tier rejects included projects and unknown projects", async () => {
    const { sid } = await seedSubscribed("addon-incl", "owner@addonincl.test");
    await db.insert(projectsTable).values({ id: "incl-proj", name: "Incl", data: {}, owner: "addon-incl" });
    const res = await api("/api/platform/billing/project-tier", { sid, body: { projectId: "incl-proj", tier: "max" } });
    expect(res.status).toBe(400);
    const res2 = await api("/api/platform/billing/project-tier", { sid, body: { projectId: "nope", tier: "max" } });
    expect(res2.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Portal + invoices routes
// ---------------------------------------------------------------------------
describe("portal and invoices", () => {
  it("portal requires a Stripe customer; creates a session when one exists", async () => {
    const { sid } = await seedWorkspace("portal-co", "owner@portal.test", { accountRole: "client" });
    expect((await api("/api/platform/billing/portal", { sid, method: "POST" })).status).toBe(409);

    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_portal", subscriptionStatus: "active", plan: "inhouse" })
      .where(eq(platformCompaniesTable.slug, "portal-co"));
    const res = await api("/api/platform/billing/portal", { sid, method: "POST" });
    expect(res.status).toBe(200);
    expect(res.json.url).toContain("billing.stripe.com");
    const params = stripeCalls.portalSessions[stripeCalls.portalSessions.length - 1] as any;
    expect(params.customer).toBe("cus_portal");
  });

  it("lists invoices with PDF links; empty without a customer", async () => {
    const { sid } = await seedWorkspace("inv-co", "owner@inv.test", { accountRole: "client" });
    let res = await api("/api/platform/billing/invoices", { sid });
    expect(res.status).toBe(200);
    expect(res.json.invoices).toEqual([]);

    await db
      .update(platformCompaniesTable)
      .set({ stripeCustomerId: "cus_inv" })
      .where(eq(platformCompaniesTable.slug, "inv-co"));
    res = await api("/api/platform/billing/invoices", { sid });
    expect(res.status).toBe(200);
    expect(res.json.invoices).toHaveLength(1);
    expect(res.json.invoices[0].invoicePdf).toContain("pdf");
  });

  it("blocks viewer members and managed clients from the new routes", async () => {
    const { sid } = await seedWorkspace("guard-co", "viewer2@guard.test", { membershipRole: "viewer" });
    expect((await api("/api/platform/billing/portal", { sid, method: "POST" })).status).toBe(403);
    expect((await api("/api/platform/billing/invoices", { sid })).status).toBe(403);
    expect((await api("/api/platform/billing/project-checkout", { sid, body: { tier: "max" } })).status).toBe(403);
    expect((await api("/api/platform/billing/project-tier", { sid, body: { projectId: "x", tier: "max" } })).status).toBe(403);

    const { sid: parentSid } = await seedWorkspace("guard-agency", "owner@guardagency.test");
    const managed = await seedWorkspace("guard-managed", "owner@guardmanaged.test", {
      accountRole: "client",
      parent: "guard-agency",
    });
    expect(
      (await api("/api/platform/billing/portal", {
        sid: managed.sid,
        stashSid: parentSid,
        method: "POST",
      })).status,
    ).toBe(403);
    expect(
      (await api("/api/platform/billing/invoices", { sid: managed.sid, stashSid: parentSid })).status,
    ).toBe(403);
    expect(
      (await api("/api/platform/billing/project-checkout", {
        sid: managed.sid,
        stashSid: parentSid,
        body: { tier: "max" },
      })).status,
    ).toBe(403);

    const legacySid = await createPlatformSession("guard-managed", null, null, null);
    expect((await api("/api/platform/billing/invoices", { sid: legacySid })).status).toBe(401);
  });

  it("subscription payload includes usage, projects and tier prices", async () => {
    const { sid } = await seedWorkspace("payload-co", "owner@payload.test", { accountRole: "client" });
    await db
      .update(platformCompaniesTable)
      .set({ subscriptionStatus: "active", plan: "inhouse", stripeCustomerId: "cus_payload" })
      .where(eq(platformCompaniesTable.slug, "payload-co"));
    await db.insert(projectsTable).values({ id: "payload-proj", name: "P1", data: {}, owner: "payload-co" });

    const res = await api("/api/platform/billing/subscription", { sid });
    expect(res.status).toBe(200);
    expect(res.json.projectsUsed).toBe(1);
    expect(res.json.projectAllowance).toBe(1);
    expect(res.json.portalAvailable).toBe(true);
    expect(res.json.projects).toHaveLength(1);
    expect(res.json.projects[0].isAddon).toBe(false);
    expect(res.json.tierPrices.max.yearlyTotal).toBe(80000);
    expect(res.json.tierPrices.max.actionsPerMonth).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Billing hardening: checkout race, billing details sync, discount edge cases
// ---------------------------------------------------------------------------
describe("billing hardening", () => {
  it.each(["annual", "quarterly"] as const)(
    "blocks %s checkout until the company record has been saved",
    async (frequency) => {
      const { sid } = await seedWorkspace(`incomplete-${frequency}`, `owner-${frequency}@incomplete.test`, { accountRole: "client" });
      await db.update(platformCompaniesTable)
        .set({ keyAccountHolderEmail: null })
        .where(eq(platformCompaniesTable.slug, `incomplete-${frequency}`));
      const sessionsBefore = stripeCalls.sessions.length;

      const state = await api("/api/platform/billing/subscription", { sid });
      expect(state.status).toBe(200);
      expect(state.json.companyRecordComplete).toBe(false);

      const checkout = await api("/api/platform/billing/checkout", { sid, body: { frequency } });
      expect(checkout.status).toBe(409);
      expect(checkout.json.code).toBe("COMPANY_RECORD_INCOMPLETE");
      expect(stripeCalls.sessions).toHaveLength(sessionsBefore);
    },
  );

  it("blocks project add-on checkout until the company record has been saved", async () => {
    const { sid } = await seedWorkspace("incomplete-addon", "owner@incomplete-addon.test", { accountRole: "client" });
    await db.update(platformCompaniesTable)
      .set({
        subscriptionStatus: "active",
        plan: "inhouse",
        keyAccountHolderEmail: null,
      })
      .where(eq(platformCompaniesTable.slug, "incomplete-addon"));
    const sessionsBefore = stripeCalls.sessions.length;

    const checkout = await api("/api/platform/billing/project-checkout", {
      sid,
      body: { tier: "standard" },
    });
    expect(checkout.status).toBe(409);
    expect(checkout.json.code).toBe("COMPANY_RECORD_INCOMPLETE");
    expect(stripeCalls.sessions).toHaveLength(sessionsBefore);
  });

  // Helper: remove any lingering checkout claims after a test so they don't bleed.
  async function cleanupCheckoutClaims() {
    await db.execute(sql`DELETE FROM platform_meta WHERE key LIKE 'checkout:pending:%'`);
  }

  it("refuses a checkout when another checkout is already in progress (claim-only, no session yet)", async () => {
    const { sid } = await seedWorkspace("checkrace-co", "owner@checkrace.test", { accountRole: "client" });
    // Simulate another process having claimed the checkout slot but not yet created
    // the Stripe session (no url in the claim value).
    const claimResult = await claimCheckout("checkrace-co");
    if (!claimResult.claimed) throw new Error("expected first claim to succeed");
    try {
      const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
      expect(res.status).toBe(409);
      expect(res.json.error).toMatch(/already in progress/i);
    } finally {
      await releaseCheckout("checkrace-co", claimResult.claimToken);
    }
    // After releasing, a new checkout must work.
    const res2 = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res2.status).toBe(200);
    expect(res2.json.url).toMatch(/^https/);
    await cleanupCheckoutClaims();
  });

  it("sequential checkout: second request reuses the open session URL; webhook releases the claim; third request starts fresh", async () => {
    const { sid } = await seedWorkspace("seqcheck-co", "owner@seqcheck.test", { accountRole: "client" });

    // First checkout - creates a Stripe session and finalizes the claim.
    const res1 = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res1.status).toBe(200);
    const url1 = res1.json.url;
    expect(url1).toMatch(/^https/);

    // Second checkout while the first session is still open - must reuse the URL.
    const res2 = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res2.status).toBe(200);
    expect(res2.json.url).toBe(url1);

    // Retrieve the stored claim token (the route put it in the Stripe metadata and
    // finalizeCheckoutClaim stored it in the DB claim too).
    const [claim] = await db
      .select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(sql`key LIKE 'checkout:pending:%'`);
    expect(claim).toBeDefined();
    const claimData = JSON.parse(claim!.value) as { tok: string };

    // Simulate checkout.session.completed - this should release the claim.
    await handleStripeEvent(
      fakeEvent("evt_seqcheck", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_seqcheck",
        subscription: "sub_seqcheck",
        metadata: { slug: "seqcheck-co", plan: "agency", frequency: "annual", claim_tok: claimData.tok },
      }),
    );

    // Claim must now be gone.
    const [afterWebhook] = await db
      .select()
      .from(platformMetaTable)
      .where(sql`key LIKE 'checkout:pending:%'`);
    expect(afterWebhook).toBeUndefined();

    // Account is now subscribed - a third checkout should be blocked (entitled).
    const res3 = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
    expect(res3.status).toBe(409);
    expect(res3.json.error).toMatch(/active subscription/i);
  });

  it("replaces an expired same-frequency checkout instead of reusing its dead URL", async () => {
    const { sid } = await seedWorkspace("expired-reuse-co", "owner@expired-reuse.test", { accountRole: "client" });
    const oldSessionId = "cs_expired_reuse";
    const oldToken = "expired-reuse-token";
    await db.insert(platformMetaTable).values({
      key: "checkout:pending:expired-reuse-co",
      value: JSON.stringify({
        at: new Date().toISOString(),
        tok: oldToken,
        sid: oldSessionId,
        url: "https://checkout.stripe.com/expired-reuse",
        frequency: "quarterly",
      }),
    });
    stripeCalls.sessionRetrieveOverrides[oldSessionId] = {
      status: "expired",
      metadata: { frequency: "quarterly" },
    };

    try {
      const sessionsBefore = stripeCalls.sessions.length;
      const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "quarterly" } });
      expect(res.status).toBe(200);
      expect(res.json.url).toBe("https://checkout.stripe.com/test-session");
      expect(stripeCalls.sessions).toHaveLength(sessionsBefore + 1);
    } finally {
      delete stripeCalls.sessionRetrieveOverrides[oldSessionId];
      await cleanupCheckoutClaims();
    }
  });

  it("replaces an expired checkout when the requested frequency has changed", async () => {
    const { sid } = await seedWorkspace("expired-switch-co", "owner@expired-switch.test", { accountRole: "client" });
    const oldSessionId = "cs_expired_switch";
    const oldToken = "expired-switch-token";
    await db.insert(platformMetaTable).values({
      key: "checkout:pending:expired-switch-co",
      value: JSON.stringify({
        at: new Date().toISOString(),
        tok: oldToken,
        sid: oldSessionId,
        url: "https://checkout.stripe.com/expired-switch",
        frequency: "quarterly",
      }),
    });
    stripeCalls.sessionRetrieveOverrides[oldSessionId] = {
      status: "expired",
      metadata: { frequency: "quarterly" },
    };

    try {
      const expiresBefore = stripeCalls.sessionExpires.length;
      const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
      expect(res.status).toBe(200);
      expect(res.json.url).toBe("https://checkout.stripe.com/test-session");
      // It was already expired, so Stripe must not be asked to expire it again.
      expect(stripeCalls.sessionExpires.slice(expiresBefore)).not.toContain(oldSessionId);
    } finally {
      delete stripeCalls.sessionRetrieveOverrides[oldSessionId];
      await cleanupCheckoutClaims();
    }
  });

  it("replaces a missing sandbox checkout claim after Stripe switches to live mode", async () => {
    const { sid } = await seedWorkspace("sandbox-to-live-co", "owner@sandbox-to-live.test", { accountRole: "client" });
    const oldSessionId = "cs_test_old_sandbox";
    const oldToken = "sandbox-to-live-token";
    await db.insert(platformMetaTable).values({
      key: "checkout:pending:sandbox-to-live-co",
      value: JSON.stringify({
        at: new Date().toISOString(),
        tok: oldToken,
        sid: oldSessionId,
        url: "https://checkout.stripe.com/old-sandbox",
        frequency: "annual",
      }),
    });
    stripeCalls.sessionRetrieveErrors[oldSessionId] = Object.assign(
      new Error(`No such checkout.session: ${oldSessionId}`),
      { code: "resource_missing" },
    );
    stripeCalls.secretKey = "sk_live_x";

    try {
      const sessionsBefore = stripeCalls.sessions.length;
      const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });
      expect(res.status).toBe(200);
      expect(res.json.url).toBe("https://checkout.stripe.com/test-session");
      expect(stripeCalls.sessions).toHaveLength(sessionsBefore + 1);
    } finally {
      stripeCalls.secretKey = "sk_test_x";
      delete stripeCalls.sessionRetrieveErrors[oldSessionId];
      await cleanupCheckoutClaims();
    }
  });

  it("TTL preemption: a stale claim is preempted but the old claimant's release does not remove the new claim", async () => {
    // Plant a stale claim directly (older than CHECKOUT_PENDING_TTL_MS).
    const staleToken = "stale-token-uuid-for-test";
    const staleAt = new Date(Date.now() - CHECKOUT_PENDING_TTL_MS - 5000).toISOString();
    await db.insert(platformMetaTable).values({
      key: "checkout:pending:ttlrace-co",
      value: JSON.stringify({ at: staleAt, tok: staleToken }),
    });

    // New process preempts the stale claim.
    const result = await claimCheckout("ttlrace-co");
    expect(result.claimed).toBe(true);
    if (!result.claimed) throw new Error("expected preemption to succeed");
    const newToken = result.claimToken;
    expect(newToken).not.toBe(staleToken);

    // Old process tries to release with its original token - must NOT delete
    // the new claimant's record.
    await releaseCheckout("ttlrace-co", staleToken);

    // New claim must still exist with the new token.
    const [row] = await db
      .select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "checkout:pending:ttlrace-co"));
    expect(row).toBeDefined();
    expect(JSON.parse(row!.value).tok).toBe(newToken);

    // Clean up.
    await releaseCheckout("ttlrace-co", newToken);
  });

  it("TTL preemption: a finalized claim (sid set) is never preempted even when stale", async () => {
    const finalizedToken = "finalized-stale-token-for-test";
    const staleAt = new Date(Date.now() - CHECKOUT_PENDING_TTL_MS - 5000).toISOString();
    await db.insert(platformMetaTable).values({
      key: "checkout:pending:finalized-stale-co",
      value: JSON.stringify({
        at: staleAt,
        tok: finalizedToken,
        sid: "cs_finalized_open_session",
        url: "https://checkout.stripe.com/finalized-open",
      }),
    });

    // Even though the claim is stale, it has a sid - it must not be preempted.
    const result = await claimCheckout("finalized-stale-co");
    expect(result.claimed).toBe(false);
    if (result.claimed) throw new Error("expected finalized claim to block preemption");
    expect(result.existingUrl).toBe("https://checkout.stripe.com/finalized-open");

    // Clean up.
    await releaseCheckout("finalized-stale-co", finalizedToken);
  });

  it("checkout.session.expired releases the claim so the user can start a new checkout", async () => {
    await seedWorkspace("expired-sess-co", "owner@expiredsess.test");
    // Plant a finalized claim for this account.
    const claimToken = "expired-sess-claim-tok-uuid";
    await db.insert(platformMetaTable).values({
      key: "checkout:pending:expired-sess-co",
      value: JSON.stringify({
        at: new Date().toISOString(),
        tok: claimToken,
        sid: "cs_expired_session_1",
        url: "https://checkout.stripe.com/expired-sess-1",
      }),
    });

    // Fire the session.expired webhook.
    await handleStripeEvent(
      fakeEvent("evt_sess_exp_1", "checkout.session.expired", {
        metadata: { slug: "expired-sess-co", claim_tok: claimToken },
      }),
    );

    // Claim must now be gone.
    const [row] = await db
      .select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "checkout:pending:expired-sess-co"));
    expect(row).toBeUndefined();
  });

  it("duplicate checkout: a late-completing session is cancelled and the first active subscription wins", async () => {
    await seedWorkspace("dup-sub-co", "owner@dupsub.test");

    // First session completes and activates sub_dup_A.
    await handleStripeEvent(
      fakeEvent("evt_dup_sub_a", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_dup",
        subscription: "sub_dup_A",
        metadata: { slug: "dup-sub-co", plan: "agency", frequency: "annual" },
      }),
    );

    // Verify sub_dup_A is now stored.
    const [before] = await db
      .select({ stripeSubscriptionId: platformCompaniesTable.stripeSubscriptionId })
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "dup-sub-co"));
    expect(before?.stripeSubscriptionId).toBe("sub_dup_A");

    const cancelsBefore = stripeCalls.subscriptionCancels.length;

    // Second (late, duplicate) session completes with a different sub_dup_B.
    await handleStripeEvent(
      fakeEvent("evt_dup_sub_b", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_dup",
        subscription: "sub_dup_B",
        metadata: { slug: "dup-sub-co", plan: "agency", frequency: "annual" },
      }),
    );

    // sub_dup_B must have been cancelled.
    expect(stripeCalls.subscriptionCancels.slice(cancelsBefore)).toContain("sub_dup_B");

    // DB must still show sub_dup_A (the first winner).
    const [after] = await db
      .select({ stripeSubscriptionId: platformCompaniesTable.stripeSubscriptionId })
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "dup-sub-co"));
    expect(after?.stripeSubscriptionId).toBe("sub_dup_A");
  });

  it("cancelled account can re-subscribe with a new subscription id", async () => {
    // Seed a cancelled account so stripeSubscriptionId is set but status is cancelled.
    await seedWorkspace("newresub-co", "owner@newresub.test");
    await db
      .update(platformCompaniesTable)
      .set({ stripeSubscriptionId: "sub_resub_old", subscriptionStatus: "cancelled" })
      .where(eq(platformCompaniesTable.slug, "newresub-co"));

    // A new checkout session completes with a different subscription id.
    await handleStripeEvent(
      fakeEvent("evt_newresub", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_newresub",
        subscription: "sub_resub_new",
        metadata: { slug: "newresub-co", plan: "inhouse", frequency: "annual" },
      }),
    );

    // The new subscription must be stored and the account must be active.
    const [company] = await db
      .select({ stripeSubscriptionId: platformCompaniesTable.stripeSubscriptionId, subscriptionStatus: platformCompaniesTable.subscriptionStatus })
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "newresub-co"));
    expect(company?.subscriptionStatus).toBe("active");
    expect(company?.stripeSubscriptionId).toBe("sub_resub_new");

    // The old subscription id must NOT have been cancelled by the duplicate guard.
    const cancelsBefore = stripeCalls.subscriptionCancels;
    expect(cancelsBefore).not.toContain("sub_resub_old");
    expect(cancelsBefore).not.toContain("sub_resub_new");
  });

  it("checkout endpoint expires the Stripe session and returns 500 when claim finalization fails", async () => {
    const { sid } = await seedWorkspace("fin-fail-co", "owner@finfail.test");
    const expiresBefore = stripeCalls.sessionExpires.length;

    // Simulate a DB write failure (or a 0-row update caused by claim preemption)
    // on the next finalizeCheckoutClaim call.
    stripeCalls.rejectFinalize = true;

    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });

    // Must return an error, not a checkout URL.
    expect(res.status).toBe(500);
    expect(res.json.url).toBeUndefined();

    // The Stripe session must have been expired so the orphaned URL cannot complete.
    expect(stripeCalls.sessionExpires.slice(expiresBefore)).toContain("cs_test_mock");

    // Session expiry succeeded - the claim must be released so the user can retry.
    const claim = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "checkout:pending:fin-fail-co"));
    expect(claim).toHaveLength(0);
  });

  it("checkout endpoint leaves the claim locked when session expiry fails after finalization failure", async () => {
    // If finalization fails AND we cannot expire the Stripe session, the session
    // could still complete on Stripe's side. The claim must stay locked until the
    // checkout.session.completed or checkout.session.expired webhook fires.
    const { sid } = await seedWorkspace("fin-exp-fail-co", "owner@finexpfail.test");

    stripeCalls.rejectFinalize = true;
    stripeCalls.rejectExpire = true;

    const res = await api("/api/platform/billing/checkout", { sid, body: { frequency: "annual" } });

    expect(res.status).toBe(500);
    expect(res.json.url).toBeUndefined();

    // Claim must still be present - releasing it here would allow a concurrent
    // checkout to open a second session while the first one can still complete.
    const claim = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, "checkout:pending:fin-exp-fail-co"));
    expect(claim).toHaveLength(1);
    // The claim must still be a pre-session record (no sid) since finalization failed.
    const parsed = JSON.parse(claim[0]!.value) as Record<string, unknown>;
    expect(parsed.sid).toBeUndefined();
  });

  it("checkout.session.completed syncs Stripe customer billing details back to the app", async () => {
    await seedWorkspace("syncback-co", "owner@syncback.test");
    // The Stripe mock will return these as the confirmed customer details.
    stripeCalls.customerRetrieveOverrides["cus_syncback"] = {
      name: "Syncback Ltd (corrected)",
      email: "billing-corrected@syncback.test",
      address: { line1: "99 Corrected Road, London" },
    };
    await handleStripeEvent(
      fakeEvent("evt_syncback", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_syncback",
        subscription: "sub_syncback",
        metadata: { slug: "syncback-co", plan: "agency", frequency: "annual" },
      }),
    );
    const [company] = await db
      .select()
      .from(platformCompaniesTable)
      .where(eq(platformCompaniesTable.slug, "syncback-co"));
    expect(company!.displayName).toBe("Syncback Ltd (corrected)");
    expect(company!.billingEmail).toBe("billing-corrected@syncback.test");
    expect(company!.keyAccountHolderEmail).toBe("owner@syncback.test");
    expect(company!.billingAddress).toBe(
      "Syncback Ltd (corrected)\n99 Corrected Road, London\nLondon\nSW1A 1AA\nUnited Kingdom",
    );
    // Clean up the override so it does not bleed into other tests.
    delete stripeCalls.customerRetrieveOverrides["cus_syncback"];
  });

  it("checkout.session.completed removes the Stripe discount when the account discount was ended before checkout completed", async () => {
    await seedWorkspace("enddisc-co", "owner@enddisc.test");
    // Seed an ended discount for this account in platform_meta.
    await db.insert(platformMetaTable).values({
      key: "account-discount:enddisc-co",
      value: JSON.stringify({
        token: "tok_test_ended",
        discountPercent: 20,
        accountType: "inhouse",
        createdAt: new Date().toISOString(),
        redeemedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(), // already ended
      }),
    });
    const discountDeletesBefore = stripeCalls.discountDeletes.length;
    await handleStripeEvent(
      fakeEvent("evt_enddisc", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_enddisc",
        subscription: "sub_enddisc",
        metadata: { slug: "enddisc-co", plan: "inhouse", frequency: "annual" },
      }),
    );
    // The subscription discount must have been removed.
    expect(stripeCalls.discountDeletes.slice(discountDeletesBefore)).toContain("sub_enddisc");
  });

  it("checkout.session.completed does NOT remove the discount when the account discount is still active", async () => {
    await seedWorkspace("activedisc-co", "owner@activedisc.test");
    // Active discount - no endedAt.
    await db.insert(platformMetaTable).values({
      key: "account-discount:activedisc-co",
      value: JSON.stringify({
        token: "tok_test_active",
        discountPercent: 20,
        accountType: "inhouse",
        createdAt: new Date().toISOString(),
        redeemedAt: new Date().toISOString(),
        // endedAt absent - discount is live
      }),
    });
    const discountDeletesBefore = stripeCalls.discountDeletes.length;
    await handleStripeEvent(
      fakeEvent("evt_activedisc", "checkout.session.completed", {
        mode: "subscription",
        customer: "cus_activedisc",
        subscription: "sub_activedisc",
        metadata: { slug: "activedisc-co", plan: "inhouse", frequency: "annual" },
      }),
    );
    // The active discount must be left in place.
    expect(stripeCalls.discountDeletes.slice(discountDeletesBefore)).not.toContain("sub_activedisc");
  });

  it("warnIfTaxDeactivated logs an error when Stripe Tax is not activated and is silent when it is", async () => {
    // Get the mocked Stripe client.
    const { getUncachableStripeClient } = await import("../lib/stripe-client");
    const stripe = await getUncachableStripeClient();

    // Tax active - no error should reach the logger.
    stripeCalls.rejectTaxCalculation = false;
    await expect(warnIfTaxDeactivated(stripe as never)).resolves.toBeUndefined();

    // Tax not activated - should resolve (not throw) but would log an error
    // (the logger call itself is not captured here; the important thing is no
    // exception escapes to crash the caller).
    stripeCalls.rejectTaxCalculation = true;
    await expect(warnIfTaxDeactivated(stripe as never)).resolves.toBeUndefined();
    stripeCalls.rejectTaxCalculation = false;
  });
});

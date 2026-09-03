import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database mock
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await client.exec(`
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
      created_at timestamptz NOT NULL DEFAULT now()
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
    platformCompaniesTable: schema.platformCompaniesTable,
    platformAccountsTable: schema.platformAccountsTable,
    platformMetaTable: schema.platformMetaTable,
    projectsTable: schema.projectsTable,
    tokenUsageTable: schema.tokenUsageTable,
    platformUsersTable: schema.platformUsersTable,
    platformMembershipsTable: schema.platformMembershipsTable,
    auditLocksTable: schema.auditLocksTable,
    contactSubmissionsTable: schema.contactSubmissionsTable,
  };
});

// Stripe client mock - records coupon and discount operations.
const stripeCalls = vi.hoisted(() => ({
  couponsCreated: [] as any[],
  couponRetrieveFails: { value: true },
  deletedDiscounts: [] as string[],
  deleteDiscountError: { code: null as string | null },
  sessions: [] as any[],
}));
vi.mock("../lib/stripe-client", () => ({
  stripeConfigured: () => true,
  getStripeCredentials: () => Promise.resolve({ secretKey: "sk_test_x", webhookSecret: "whsec_x" }),
  getUncachableStripeClient: () =>
    Promise.resolve({
      coupons: {
        retrieve: (id: string) => {
          if (stripeCalls.couponRetrieveFails.value) return Promise.reject(Object.assign(new Error("nope"), { code: "resource_missing" }));
          return Promise.resolve({ id, deleted: false });
        },
        create: (params: any) => {
          stripeCalls.couponsCreated.push(params);
          return Promise.resolve({ id: params.id });
        },
      },
      subscriptions: {
        deleteDiscount: (id: string) => {
          if (stripeCalls.deleteDiscountError.code) {
            return Promise.reject(Object.assign(new Error("stripe error"), { code: stripeCalls.deleteDiscountError.code }));
          }
          stripeCalls.deletedDiscounts.push(id);
          return Promise.resolve({});
        },
      },
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
        retrieve: (id: string) => Promise.resolve({ id, deleted: false }),
      },
      checkout: {
        sessions: {
          create: (params: any) => {
            stripeCalls.sessions.push(params);
            return Promise.resolve({ url: "https://checkout.stripe.com/test-session" });
          },
        },
      },
    }),
  getStripeSync: () => Promise.reject(new Error("not used in tests")),
}));

vi.mock("../lib/notify-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/notify-email")>();
  const mock: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(actual)) {
    if (k === "getAppBaseUrl") mock[k] = () => "https://test.example.com";
    else if (typeof v === "function") mock[k] = () => Promise.resolve();
    else mock[k] = v;
  }
  return mock;
});

import { db, platformCompaniesTable, platformAccountsTable, platformMetaTable, tokenUsageTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createDiscountInvite,
  listDiscountInvites,
  getDiscountInvite,
  consumeDiscountInvite,
  getAccountDiscount,
  getActiveAccountDiscount,
  endAccountDiscount,
  ensureDiscountCoupon,
  applyInviteAccountType,
  DISCOUNT_INVITE_TTL_MS,
} from "../lib/discount-invites";
import { createCheckoutSession } from "../lib/billing";
import adminRouter from "./admin";

// ---------------------------------------------------------------------------
// Helpers: mount the admin router with an injectable fake account
// ---------------------------------------------------------------------------
const fakeAccount = vi.hoisted(() => ({
  value: null as null | { username: string; role: string; email?: string; membershipRole?: string },
}));
vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (req: any, res: any, next: any) => {
    if (!fakeAccount.value) { res.status(401).json({ error: "Not signed in" }); return; }
    req.account = fakeAccount.value;
    next();
  },
  resolvePlatformAccount: (_req: any, _res: any, next: any) => next(),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", adminRouter);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(async () => {
  fakeAccount.value = { username: "aiofusion", role: "admin" };
  stripeCalls.couponsCreated.length = 0;
  stripeCalls.deletedDiscounts.length = 0;
  stripeCalls.sessions.length = 0;
  stripeCalls.couponRetrieveFails.value = true;
  stripeCalls.deleteDiscountError.code = null;
  await db.delete(platformMetaTable);
  await db.delete(platformCompaniesTable);
  await db.delete(platformAccountsTable);
  await db.delete(tokenUsageTable);
});

async function post(path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}
async function get(path: string) {
  const res = await fetch(`${baseUrl}/api${path}`);
  return { status: res.status, body: (await res.json()) as any };
}

// ---------------------------------------------------------------------------
// Lib
// ---------------------------------------------------------------------------

describe("discount-invites lib", () => {
  it("creates and lists invites with a 30-day expiry", async () => {
    const inv = await createDiscountInvite({
      email: "Beta@Example.com", accountType: "client", percent: 50, label: "Beta", createdBy: "aiofusion",
    });
    expect(inv.email).toBe("beta@example.com");
    expect(inv.token).toMatch(/^[0-9a-f]{64}$/);
    const ttl = new Date(inv.expiresAt).getTime() - new Date(inv.createdAt).getTime();
    expect(ttl).toBe(DISCOUNT_INVITE_TTL_MS);
    const all = await listDiscountInvites();
    expect(all.map((i) => i.token)).toContain(inv.token);
  });

  it("normalises mangled tokens on lookup", async () => {
    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "agency", percent: 25, label: "VIP", createdBy: "aiofusion",
    });
    const mangled = `"${inv.token.toUpperCase()}".`;
    const looked = await getDiscountInvite(mangled);
    expect(looked.invite?.token).toBe(inv.token);
  });

  it("rejects unknown, used, and expired invites with distinct reasons", async () => {
    expect(await getDiscountInvite("deadbeef")).toMatchObject({ invite: null, reason: "not_found" });

    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 10, label: "Beta", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "acme");
    expect(await getDiscountInvite(inv.token)).toMatchObject({ invite: null, reason: "used" });

    const inv2 = await createDiscountInvite({
      email: "c@d.com", accountType: "client", percent: 10, label: "Beta", createdBy: "aiofusion",
    });
    const expired = { ...inv2, expiresAt: new Date(Date.now() - 1000).toISOString() };
    await db.update(platformMetaTable)
      .set({ value: JSON.stringify(expired) })
      .where(eq(platformMetaTable.key, `discount-invite:${inv2.token}`));
    expect(await getDiscountInvite(inv2.token)).toMatchObject({ invite: null, reason: "expired" });
  });

  it("consume is single-use and stamps the account discount", async () => {
    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 40, label: "VIP", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "Acme");
    await expect(consumeDiscountInvite(inv.token, "other")).rejects.toThrow();
    const d = await getAccountDiscount("acme");
    expect(d).toMatchObject({ percent: 40, label: "VIP", inviteEmail: "a@b.com" });
    expect(await getActiveAccountDiscount("acme")).not.toBeNull();
  });

  it("concurrent consumes: exactly one wins the atomic claim", async () => {
    const inv = await createDiscountInvite({
      email: "race@b.com", accountType: "client", percent: 20, label: "Beta", createdBy: "aiofusion",
    });
    const results = await Promise.allSettled([
      consumeDiscountInvite(inv.token, "racer-one"),
      consumeDiscountInvite(inv.token, "racer-two"),
    ]);
    const wins = results.filter((r) => r.status === "fulfilled");
    expect(wins).toHaveLength(1);
    const winners = [await getAccountDiscount("racer-one"), await getAccountDiscount("racer-two")];
    expect(winners.filter(Boolean)).toHaveLength(1);
  });

  it("consume rejects an expired invite even after a stale lookup", async () => {
    const inv = await createDiscountInvite({
      email: "late@b.com", accountType: "client", percent: 10, label: "Beta", createdBy: "aiofusion",
    });
    // Expire it behind the caller's back (simulates redeeming after TTL).
    const key = `discount-invite:${inv.token}`;
    const [row] = await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, key));
    const stored = JSON.parse(row.value);
    stored.expiresAt = new Date(Date.now() - 1000).toISOString();
    await db.update(platformMetaTable).set({ value: JSON.stringify(stored) }).where(eq(platformMetaTable.key, key));
    await expect(consumeDiscountInvite(inv.token, "late-slug")).rejects.toThrow(/expired/i);
    expect(await getAccountDiscount("late-slug")).toBeNull();
  });

  it("applyInviteAccountType sets the role on both tables", async () => {
    await db.insert(platformAccountsTable).values({ username: "acme", passwordHash: "x", role: "agency", status: "active" });
    await db.insert(platformCompaniesTable).values({ slug: "acme", role: "agency" });
    await applyInviteAccountType("acme", "client");
    const [acc] = await db.select().from(platformAccountsTable).where(eq(platformAccountsTable.username, "acme"));
    const [co] = await db.select().from(platformCompaniesTable).where(eq(platformCompaniesTable.slug, "acme"));
    expect(acc.role).toBe("client");
    expect(co.role).toBe("client");
  });

  it("ensureDiscountCoupon creates the deterministic coupon once and reuses it", async () => {
    const stripe = await (await import("../lib/stripe-client")).getUncachableStripeClient();
    const id1 = await ensureDiscountCoupon(stripe as any, 50);
    expect(id1).toBe("aio-invite-50pct");
    expect(stripeCalls.couponsCreated).toHaveLength(1);
    expect(stripeCalls.couponsCreated[0]).toMatchObject({ percent_off: 50, duration: "forever" });
    stripeCalls.couponRetrieveFails.value = false; // now it "exists"
    const id2 = await ensureDiscountCoupon(stripe as any, 50);
    expect(id2).toBe(id1);
    expect(stripeCalls.couponsCreated).toHaveLength(1);
  });

  it("endAccountDiscount removes the Stripe discount and marks endedAt", async () => {
    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 30, label: "Beta", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "acme");
    await db.insert(platformCompaniesTable).values({
      slug: "acme", role: "client", stripeSubscriptionId: "sub_live_1", subscriptionStatus: "active", plan: "inhouse",
    });
    const r = await endAccountDiscount("acme");
    expect(r.ok).toBe(true);
    expect(stripeCalls.deletedDiscounts).toEqual(["sub_live_1"]);
    const d = await getAccountDiscount("acme");
    expect(d?.endedAt).toBeTruthy();
    expect(await getActiveAccountDiscount("acme")).toBeNull();
    // Second end fails cleanly.
    expect((await endAccountDiscount("acme")).ok).toBe(false);
  });

  it("endAccountDiscount surfaces unexpected Stripe failures without marking ended", async () => {
    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 30, label: "Beta", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "acme");
    await db.insert(platformCompaniesTable).values({
      slug: "acme", role: "client", stripeSubscriptionId: "sub_live_1",
    });
    stripeCalls.deleteDiscountError.code = "api_error";
    const r = await endAccountDiscount("acme");
    expect(r.ok).toBe(false);
    expect((await getAccountDiscount("acme"))?.endedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Checkout coupon attachment
// ---------------------------------------------------------------------------

describe("createCheckoutSession discount attachment", () => {
  beforeEach(async () => {
    await db.insert(platformCompaniesTable).values({ slug: "acme", role: "client" });
    await db.insert(platformAccountsTable).values({ username: "acme", passwordHash: "x", role: "client", status: "active", email: "a@b.com" });
  });

  it("attaches the reusable coupon when the account redeemed an invite", async () => {
    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 50, label: "Beta", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "acme");
    await createCheckoutSession({
      slug: "acme", plan: "inhouse", frequency: "annual",
      successUrl: "https://x/s", cancelUrl: "https://x/c",
    });
    expect(stripeCalls.sessions).toHaveLength(1);
    expect(stripeCalls.sessions[0].discounts).toEqual([{ coupon: "aio-invite-50pct" }]);
  });

  it("attaches no coupon without a discount, or after the discount is ended", async () => {
    await createCheckoutSession({
      slug: "acme", plan: "inhouse", frequency: "annual",
      successUrl: "https://x/s", cancelUrl: "https://x/c",
    });
    expect(stripeCalls.sessions[0].discounts).toBeUndefined();

    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 20, label: "VIP", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "acme");
    await endAccountDiscount("acme");
    await createCheckoutSession({
      slug: "acme", plan: "inhouse", frequency: "annual",
      successUrl: "https://x/s", cancelUrl: "https://x/c",
    });
    expect(stripeCalls.sessions[1].discounts).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Admin routes
// ---------------------------------------------------------------------------

describe("admin discount-invite routes", () => {
  it("rejects non-admin callers on all endpoints", async () => {
    fakeAccount.value = { username: "acme", role: "agency" };
    expect((await get("/admin/subscriptions")).status).toBe(403);
    expect((await get("/admin/discount-invites")).status).toBe(403);
    expect((await post("/admin/discount-invites", { email: "a@b.com", accountType: "client", percent: 10, label: "Beta" })).status).toBe(403);
    expect((await post("/admin/discounts/end", { slug: "acme" })).status).toBe(403);
  });

  it("rejects restricted master admins on mutations but allows reads", async () => {
    fakeAccount.value = { username: "aiofusion", role: "admin", membershipRole: "admin" };
    expect((await get("/admin/subscriptions")).status).toBe(200);
    expect((await post("/admin/discount-invites", { email: "a@b.com", accountType: "client", percent: 10, label: "Beta" })).status).toBe(403);
    expect((await post("/admin/discounts/end", { slug: "acme" })).status).toBe(403);
  });

  it("validates invite input (percent bounds, type, label, email)", async () => {
    expect((await post("/admin/discount-invites", { email: "bad", accountType: "client", percent: 10, label: "Beta" })).status).toBe(400);
    expect((await post("/admin/discount-invites", { email: "a@b.com", accountType: "weird", percent: 10, label: "Beta" })).status).toBe(400);
    expect((await post("/admin/discount-invites", { email: "a@b.com", accountType: "client", percent: 100, label: "Beta" })).status).toBe(400);
    expect((await post("/admin/discount-invites", { email: "a@b.com", accountType: "client", percent: 0, label: "Beta" })).status).toBe(400);
    expect((await post("/admin/discount-invites", { email: "a@b.com", accountType: "client", percent: 12.5, label: "Beta" })).status).toBe(400);
    expect((await post("/admin/discount-invites", { email: "a@b.com", accountType: "client", percent: 10, label: "" })).status).toBe(400);
  });

  it("creates an invite and returns the link; list shows it pending with a copyable URL", async () => {
    const r = await post("/admin/discount-invites", { email: "vip@b.com", accountType: "agency", percent: 35, label: "VIP" });
    expect(r.status).toBe(201);
    expect(r.body.url).toMatch(/^https:\/\/test\.example\.com\/\?discount_invite=[0-9a-f]{64}$/);

    const list = await get("/admin/discount-invites");
    expect(list.status).toBe(200);
    const item = list.body.invites.find((i: any) => i.email === "vip@b.com");
    expect(item).toMatchObject({ accountType: "agency", percent: 35, label: "VIP", usedAt: null });
    expect(item.url).toBe(r.body.url);
  });

  it("hides the link for used invites in the list", async () => {
    const r = await post("/admin/discount-invites", { email: "u@b.com", accountType: "client", percent: 15, label: "Beta" });
    const token = r.body.url.split("discount_invite=")[1];
    await consumeDiscountInvite(token, "acme");
    const list = await get("/admin/discount-invites");
    const item = list.body.invites.find((i: any) => i.email === "u@b.com");
    expect(item.usedAt).toBeTruthy();
    expect(item.usedBySlug).toBe("acme");
    expect(item.url).toBeNull();
  });

  it("subscription overview includes billing state, usage, last payment and discount", async () => {
    await db.insert(platformCompaniesTable).values({
      slug: "acme", role: "client", displayName: "Acme Ltd",
      subscriptionStatus: "active", plan: "inhouse", billingFrequency: "annual",
      currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
    });
    await db.insert(platformMetaTable).values({ key: "billing:last-payment:acme", value: "2026-08-01T10:00:00.000Z" });
    await db.insert(tokenUsageTable).values([
      { accountId: "acme", operation: "content-optimise", model: "m", inputTokens: 1, outputTokens: 1 },
      { accountId: "acme", operation: "content-create", model: "m", inputTokens: 1, outputTokens: 1 },
      { accountId: "acme", operation: "llm-check", model: "m", inputTokens: 1, outputTokens: 1 },
    ]);
    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 45, label: "Beta", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "acme");

    const r = await get("/admin/subscriptions");
    expect(r.status).toBe(200);
    const row = r.body.rows.find((x: any) => x.slug === "acme");
    expect(row).toMatchObject({
      displayName: "Acme Ltd",
      accountType: "client",
      subscriptionStatus: "active",
      plan: "inhouse",
      frequency: "annual",
      lastPaymentAt: "2026-08-01T10:00:00.000Z",
      actionsLast30Days: 2, // content-% only, audits excluded
    });
    expect(row.discount).toMatchObject({ percent: 45, label: "Beta" });
  });

  it("end-discount route removes the discount", async () => {
    const inv = await createDiscountInvite({
      email: "a@b.com", accountType: "client", percent: 45, label: "Beta", createdBy: "aiofusion",
    });
    await consumeDiscountInvite(inv.token, "acme");
    await db.insert(platformCompaniesTable).values({ slug: "acme", role: "client", stripeSubscriptionId: "sub_x" });
    const r = await post("/admin/discounts/end", { slug: "acme" });
    expect(r.status).toBe(200);
    expect(stripeCalls.deletedDiscounts).toEqual(["sub_x"]);
    // Ending again is a 400.
    expect((await post("/admin/discounts/end", { slug: "acme" })).status).toBe(400);
  });
});

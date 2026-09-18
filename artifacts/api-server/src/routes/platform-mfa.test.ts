import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE,
      name varchar(128), password_hash text, google_id varchar(255) UNIQUE,
      microsoft_id varchar(255) UNIQUE, session_version integer NOT NULL DEFAULT 0,
      email_verified boolean, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug varchar(64) NOT NULL UNIQUE,
      role varchar NOT NULL DEFAULT 'agency', parent_slug varchar(64), max_seats int,
      email varchar(255), billing_email varchar(255), key_account_holder_email varchar(255),
      vat_number varchar(64), billing_address varchar(512), billing_address_version integer,
      website varchar(512), display_name varchar(128), free_access boolean NOT NULL DEFAULT false,
      status varchar NOT NULL DEFAULT 'active', setup_complete boolean, stripe_customer_id text,
      stripe_subscription_id text, plan varchar(16), billing_frequency varchar(16),
      subscription_status varchar(16), current_period_end timestamptz,
      cancel_at_period_end boolean NOT NULL DEFAULT false, renewal_reminder_period_end timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE platform_memberships (
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      company_id uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
      company_slug varchar(64) NOT NULL, role varchar NOT NULL DEFAULT 'owner',
      project_access text, position varchar(128), created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, company_id)
    );
    CREATE TABLE platform_accounts (
      username varchar PRIMARY KEY, password_hash text NOT NULL, role varchar NOT NULL DEFAULT 'user',
      parent varchar, max_seats int, created_at timestamptz NOT NULL DEFAULT now(),
      email varchar, website varchar, status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL);
    CREATE TABLE admin_events (
      id serial PRIMARY KEY, actor_id varchar(200) NOT NULL DEFAULT '', actor_username varchar(200) NOT NULL,
      action varchar(100) NOT NULL, target_id varchar(300), target_type varchar(100), metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE platform_sessions (
      sid varchar PRIMARY KEY, username varchar NOT NULL, user_id uuid, active_company_id uuid,
      session_version integer, created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL, ip_hint varchar
    );
    CREATE TABLE platform_password_resets (
      token varchar(64) PRIMARY KEY, user_id uuid NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz
    );
    CREATE TABLE platform_email_verifications (
      token varchar(64) PRIMARY KEY, user_id uuid NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz
    );
    CREATE TABLE platform_invitations (
      token varchar(64) PRIMARY KEY, email varchar(255) NOT NULL, company_id uuid NOT NULL,
      company_slug varchar(64) NOT NULL, role varchar NOT NULL DEFAULT 'viewer',
      project_access text, invited_name varchar(128), position varchar(128),
      invited_by_user_id uuid, expires_at timestamptz NOT NULL, used_at timestamptz,
      revoked_at timestamptz, declined_at timestamptz, reminder_sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return { db: drizzle(client, { schema }), ...schema };
});
vi.mock("../middleware/rate-limit", () => ({
  loginLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/admin-events", () => ({ logAdminEvent: vi.fn(async () => {}) }));
const notice = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../lib/notify-email", async (original) => {
  const actual = await original<typeof import("../lib/notify-email")>();
  return Object.fromEntries(Object.entries(actual).map(([key, value]) => [
    key, key === "getAppBaseUrl" ? () => "https://example.test"
      : key === "sendMfaChangedEmail" || key === "sendNewTrustedDeviceEmail" || key === "sendMfaLegacyRecoveryEmail" ? notice
        : typeof value === "function" ? vi.fn(async () => {}) : value,
  ]));
});
import {
  db, platformUsersTable, platformCompaniesTable, platformMembershipsTable,
  platformAccountsTable, platformMetaTable, platformSessionsTable, platformInvitationsTable,
  adminEventsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  hashPassword, createPlatformSession, getPlatformSessionAccount,
} from "../lib/platform-auth";
import {
  getMfaState, saveMfaState, mfaSubject, totpCode, verifyTotp,
  generateTotpSecret, hashRecoveryCode, resetPersonalMfa, addTrustedDevice,
  listTrustedDevices, getMfaGeneration, createMfaPendingToken, validateMfaPendingToken,
  recordMfaSession, getPersonalMfaStatus, mfaKey,
  verifyMfaPendingToken, legacyRecoveryAuthorizationKey, migrationApprovalKey, trustedKey,
} from "../lib/mfa";
import {
  inspectLegacyMfaMigration, approvePersonalMfaRecovery, migrateAttributableLegacyMfa,
} from "../lib/mfa-migration";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import platformRouter from "./platform";
import teamRouter from "./team";
import { issueGoogleLegacyRecovery, LEGACY_RECOVERY_TTL_MS } from "../lib/mfa-legacy-recovery";

let server: Server;
let baseUrl: string;
let companyId: string;
let people: Array<{ id: string; email: string | null }>;
const password = "Only-disposable-test-password-1!";
const subject = (index: number) => mfaSubject({ username: "admin", userId: people[index].id });

async function request(path: string, body?: unknown, cookie?: string, method?: string) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as any, cookies: response.headers.getSetCookie() };
}
const login = (index: number, cookie?: string) => request("/platform/login", { username: people[index].email, password }, cookie);
const cookieNamed = (cookies: string[], name: string) => cookies.find(value => value.startsWith(`${name}=`))?.split(";")[0] ?? "";
async function enroll(index: number) {
  const challenge = await login(index);
  const setup = await request("/platform/mfa/setup", { mfaToken: challenge.json.mfaToken });
  const enabled = await request("/platform/mfa/enable", { mfaToken: challenge.json.mfaToken, code: totpCode(setup.json.secret) });
  expect(enabled.status).toBe(200);
  return { secret: setup.json.secret as string, codes: enabled.json.recoveryCodes as string[], cookie: cookieNamed(enabled.cookies, "aio_sid") };
}
async function masterViewerInvite(mode: "enroll" | "verify") {
  await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[2].id));
  const token = `disposable-invite-${mode}`;
  await db.insert(platformInvitationsTable).values({
    token, email: people[2].email!, companyId, companySlug: "admin", role: "viewer",
    expiresAt: new Date(Date.now() + 60_000),
  });
  const secret = mode === "verify" ? generateTotpSecret() : undefined;
  if (secret) await saveMfaState(subject(2), { secret, enabled: true, recoveryHashes: [] });
  return { token, secret };
}
async function finishInviteChallenge(token: string, secret?: string) {
  expect((await request("/platform/me")).json.account).toBeNull();
  expect(await db.select().from(platformSessionsTable)).toHaveLength(0);
  expect((await validateMfaPendingToken(token))?.uid).toBe(people[2].id);
  const setupSecret = secret ?? (await request("/platform/mfa/setup", { mfaToken: token })).json.secret;
  const result = await request(`/platform/mfa/${secret ? "verify" : "enable"}`, {
    mfaToken: token, code: totpCode(setupSecret),
  });
  expect(result.status).toBe(200);
  const cookie = cookieNamed(result.cookies, "aio_sid");
  expect(cookie).not.toBe("");
  const me = await request("/platform/me", undefined, cookie);
  expect(me.status).toBe(200);
  expect(me.json.account).toMatchObject({ userId: people[2].id, username: "admin", membershipRole: "viewer" });
  expect((await db.select().from(platformInvitationsTable))[0]?.usedAt).toBeTruthy();
}
beforeAll(async () => {
  const app = express();
  app.use(express.json(), express.urlencoded({ extended: false }), cookieParser(), resolvePlatformAccount);
  app.use("/api", platformRouter, teamRouter);
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  for (const table of [adminEventsTable, platformInvitationsTable, platformSessionsTable, platformMetaTable, platformMembershipsTable, platformUsersTable, platformCompaniesTable, platformAccountsTable]) await db.delete(table);
  notice.mockClear();
  await db.insert(platformAccountsTable).values({ username: "admin", passwordHash: hashPassword(password), role: "admin", status: "active" });
  const [company] = await db.insert(platformCompaniesTable).values({ slug: "admin", role: "admin", status: "active", setupComplete: true }).returning();
  companyId = company.id;
  people = await db.insert(platformUsersTable).values([
    { email: "owner-one@example.test", name: "Owner One", passwordHash: hashPassword(password), emailVerified: true },
    { email: "owner-two@example.test", name: "Owner Two", passwordHash: hashPassword(password), emailVerified: true },
    { email: "viewer@example.test", name: "Viewer", passwordHash: hashPassword(password), emailVerified: true },
  ]).returning();
  await db.insert(platformMembershipsTable).values(people.map((person, index) => ({
    userId: person.id, companyId, companySlug: "admin", role: index === 2 ? "viewer" : "owner",
  })));
});

describe("staging Google and legacy TOTP individual recovery", () => {
  let legacySecret: string;
  const recoverPath = "/platform/mfa/legacy-recovery";
  const proof = (index = 0) => ({
    provider: "google" as const, googleId: `existing-google-${index}`,
    email: people[index].email!, emailVerified: true,
  });
  const issue = (index = 0) => issueGoogleLegacyRecovery(proof(index));
  const status = (recoveryToken: unknown) => request(`${recoverPath}/status`, { recoveryToken });
  const recover = (recoveryToken: unknown, code = totpCode(legacySecret)) => request(recoverPath, { recoveryToken, code });
  const meta = async (key: string, value = "true") => db.insert(platformMetaTable).values({ key, value });
  const signRecovery = (payload: Record<string, unknown>) => {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${crypto.createHmac("sha256", process.env.SESSION_SECRET!)
      .update(`staging-master-google-legacy-recovery:v1:${body}`).digest("base64url")}`;
  };
  async function oauth(index = 0, verified = true, extraCookie = "", state = "fresh-state") {
    vi.stubEnv("GOOGLE_CLIENT_ID", "disposable-google-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "disposable-google-secret");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "fixture-only" }));
      if (url.includes("googleapis.com/oauth2/v2/userinfo")) return new Response(JSON.stringify({
        id: proof(index).googleId, email: proof(index).email, verified_email: verified, name: "Disposable Owner",
      }));
      return originalFetch(input, init);
    }));
    const result = await originalFetch(`${baseUrl}/api/platform/auth/google/callback`, {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/json", cookie: `aio_oauth_state=${state};${extraCookie}` },
      body: JSON.stringify({ code: "fresh-provider-code", state }),
    });
    const cookie = cookieNamed(result.headers.getSetCookie(), "aio_oauth_mfa_token");
    return {
      location: result.headers.get("location"), cookies: result.headers.getSetCookie(),
      token: cookie ? decodeURIComponent(cookie.slice("aio_oauth_mfa_token=".length)) : "",
    };
  }
  beforeEach(async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    vi.stubEnv("SESSION_SECRET", "disposable-recovery-signature-secret-not-a-real-secret");
    legacySecret = generateTotpSecret();
    await saveMfaState("legacy:admin", { secret: legacySecret, enabled: true, recoveryHashes: [hashRecoveryCode("ABCD-EFGH")] });
    for (let index = 0; index < people.length; index++) {
      await db.update(platformUsersTable).set({ googleId: proof(index).googleId }).where(eq(platformUsersTable.id, people[index].id));
    }
  });

  it("hands off fresh Google proof, authorises only that Owner, then requires NEW setup and personal login", async () => {
    const roster = await db.select().from(platformMembershipsTable);
    const company = await db.select().from(platformCompaniesTable);
    const accounts = await db.select().from(platformAccountsTable);
    const legacy = await getMfaState("legacy:admin");
    await meta(trustedKey("legacy:admin"), JSON.stringify([{ id: "shared-trust-must-stay" }]));
    const otherSecret = generateTotpSecret();
    await saveMfaState(subject(1), { secret: otherSecret, enabled: true, recoveryHashes: [] });
    const otherState = await getMfaState(subject(1));
    const staleToken = createMfaPendingToken({ u: "admin", uid: people[0].id, cid: companyId, role: "admin", mode: "enroll", g: 0 });
    const staleSession = await createPlatformSession("admin", undefined, people[0].id, companyId);
    const handoff = await oauth();
    expect(handoff.location).toContain("?oauth_status=mfa&mfa_mode=recover");
    expect(cookieNamed(handoff.cookies, "aio_sid")).toBe("");
    expect(handoff.cookies.join(";")).toContain("Max-Age=300");
    expect(verifyMfaPendingToken(handoff.token)).toBeNull();
    expect((await status(handoff.token)).json).toEqual({ email: people[0].email });
    for (const route of ["setup", "enable", "verify"]) {
      const denied = await request(`/platform/mfa/${route}`, { mfaToken: handoff.token, code: totpCode(legacySecret) });
      expect(denied.status).not.toBe(200);
    }
    const recovered = await request(recoverPath, {
      recoveryToken: handoff.token, code: totpCode(legacySecret),
      userId: people[1].id, email: people[1].email, username: "another-workspace",
    });
    expect(recovered.status).toBe(200);
    expect(recovered.json).toMatchObject({ mfaEnrollRequired: true, email: people[0].email });
    expect(cookieNamed(recovered.cookies, "aio_sid")).toBe("");
    expect(await getMfaState(subject(0))).toBeNull();
    expect(await db.select().from(platformSessionsTable)).toHaveLength(0);
    expect(await getPlatformSessionAccount(staleSession)).toBeNull();
    expect(await validateMfaPendingToken(staleToken)).toBeNull();
    expect(await getMfaGeneration(subject(0))).toBe(1);
    expect(await getMfaGeneration(subject(1))).toBe(0);
    expect(notice).toHaveBeenCalledWith({ toEmail: people[0].email, toName: "Owner One" });
    expect(await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, migrationApprovalKey(people[0].id)))).toHaveLength(0);
    expect((await status(handoff.token)).status).toBe(403);
    expect((await recover(handoff.token)).status).toBe(403);
    const setup = await request("/platform/mfa/setup", { mfaToken: recovered.json.mfaToken });
    expect(setup.status).toBe(200);
    expect(setup.json.secret).not.toBe(legacySecret);
    expect(setup.json.secret).not.toBe(otherSecret);
    const enabled = await request("/platform/mfa/enable", {
      mfaToken: recovered.json.mfaToken, code: totpCode(setup.json.secret),
    });
    expect(enabled.status).toBe(200);
    expect(enabled.json.recoveryCodes).toHaveLength(10);
    expect(cookieNamed(enabled.cookies, "aio_sid")).not.toBe("");
    const challenge = await login(0);
    expect(challenge.json.mfaRequired).toBe(true);
    const loggedIn = await request("/platform/mfa/verify", { mfaToken: challenge.json.mfaToken, code: totpCode(setup.json.secret) });
    expect(loggedIn.status).toBe(200);
    expect(await getPlatformSessionAccount(cookieNamed(loggedIn.cookies, "aio_sid").slice(8))).toMatchObject({ userId: people[0].id, membershipRole: "owner" });
    expect(await getMfaState("legacy:admin")).toEqual(legacy);
    expect(await getMfaState(subject(1))).toEqual(otherState);
    expect(await db.select().from(platformMembershipsTable)).toEqual(roster);
    expect(await db.select().from(platformCompaniesTable)).toEqual(company);
    expect(await db.select().from(platformAccountsTable)).toEqual(accounts);
    expect(await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, trustedKey("legacy:admin"))))
      .toMatchObject([{ value: JSON.stringify([{ id: "shared-trust-must-stay" }]) }]);
    const audits = await db.select().from(adminEventsTable);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: people[0].id, targetId: people[0].id, action: "mfa_legacy_individual_recovery" });
    expect(JSON.stringify(audits)).not.toContain(legacySecret);
    expect(JSON.stringify(audits)).not.toContain(handoff.token);
  });

  it("rejects bad, expired, oversized-lifetime, forged-nonce, stale and wrong-purpose tokens", async () => {
    const token = (await issue())!;
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    const now = Date.now();
    const invalid = [
      "", `${token}x`, token.slice(2), "not-a-token",
      signRecovery({ ...payload, iat: now - LEGACY_RECOVERY_TTL_MS - 1000, exp: now - 1 }),
      signRecovery({ ...payload, iat: now + 5000, exp: now + 6000 }),
      signRecovery({ ...payload, exp: payload.iat + LEGACY_RECOVERY_TTL_MS + 1 }),
      signRecovery({ ...payload, jti: crypto.randomUUID() }),
      signRecovery({ ...payload, uid: people[1].id }),
      signRecovery({ ...payload, purpose: "verify" }),
      createMfaPendingToken({ u: "admin", uid: people[0].id, cid: companyId, role: "admin", mode: "enroll", g: 0 }),
    ];
    for (const bad of invalid) {
      expect((await status(bad)).status).toBe(403);
      expect((await recover(bad)).status).toBe(403);
    }
    await db.update(platformUsersTable).set({ sessionVersion: 1 }).where(eq(platformUsersTable.id, people[0].id));
    expect((await recover(token)).status).toBe(403);
    expect(await getMfaState(subject(0))).toBeNull();
    expect(await db.select().from(adminEventsTable)).toHaveLength(0);
  });

  it.each([
    "viewer", "deleted", "demoted", "revoked", "unverified", "null-verified", "google-unbound", "google-changed",
    "email-changed", "account-suspended", "account-pending", "company-suspended", "managed", "archived",
    "other-workspace", "wrong-company", "wrong-account-role", "wrong-company-role", "agency-parent",
    "legacy-disabled", "legacy-deleted", "personal-enabled", "personal-pending", "approved", "recovery-marker", "revocation-marker",
  ])("rechecks %s live after issuance, without changing any recovery state", async condition => {
    const token = (await issue())!;
    if (condition === "viewer" || condition === "demoted") await db.update(platformMembershipsTable).set({ role: "viewer" }).where(eq(platformMembershipsTable.userId, people[0].id));
    if (condition === "deleted") await db.delete(platformUsersTable).where(eq(platformUsersTable.id, people[0].id));
    if (condition === "revoked") await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[0].id));
    if (condition === "unverified" || condition === "null-verified") await db.update(platformUsersTable).set({ emailVerified: condition === "unverified" ? false : null }).where(eq(platformUsersTable.id, people[0].id));
    if (condition === "google-unbound" || condition === "google-changed") await db.update(platformUsersTable).set({ googleId: condition === "google-unbound" ? null : "other-google" }).where(eq(platformUsersTable.id, people[0].id));
    if (condition === "email-changed") await db.update(platformUsersTable).set({ email: "different@example.test" }).where(eq(platformUsersTable.id, people[0].id));
    if (condition === "account-suspended" || condition === "account-pending") await db.update(platformAccountsTable).set({ status: condition === "account-suspended" ? "suspended" : "pending_approval" });
    if (condition === "company-suspended") await db.update(platformCompaniesTable).set({ status: "suspended" });
    if (condition === "managed" || condition === "archived") await meta(`account:${condition}:admin`);
    if (condition === "other-workspace") await db.update(platformMembershipsTable).set({ companySlug: "other" }).where(eq(platformMembershipsTable.userId, people[0].id));
    if (condition === "wrong-company") {
      const [other] = await db.insert(platformCompaniesTable).values({ slug: "other" }).returning();
      await db.update(platformMembershipsTable).set({ companyId: other.id }).where(eq(platformMembershipsTable.userId, people[0].id));
    }
    if (condition === "wrong-account-role") await db.update(platformAccountsTable).set({ role: "agency" });
    if (condition === "wrong-company-role") await db.update(platformCompaniesTable).set({ role: "agency" });
    if (condition === "agency-parent") await db.update(platformAccountsTable).set({ parent: "agency" });
    if (condition === "legacy-disabled") await saveMfaState("legacy:admin", { secret: legacySecret, enabled: false, recoveryHashes: [] });
    if (condition === "legacy-deleted") await db.delete(platformMetaTable).where(eq(platformMetaTable.key, mfaKey("legacy:admin")));
    if (condition.startsWith("personal-")) await saveMfaState(subject(0), { secret: generateTotpSecret(), enabled: condition === "personal-enabled", recoveryHashes: [] });
    if (condition === "approved") await meta(migrationApprovalKey(people[0].id));
    if (condition === "recovery-marker") await meta(legacyRecoveryAuthorizationKey(people[0].id));
    if (condition === "revocation-marker") await meta(`master-membership-revoked:${companyId}:${people[0].id}`);
    const before = await db.select().from(platformMetaTable);
    expect((await status(token)).status).toBe(403);
    expect((await recover(token)).status).toBe(403);
    expect(await issue()).toBeNull();
    expect(await db.select().from(platformMetaTable)).toEqual(before);
    expect(await db.select().from(adminEventsTable)).toHaveLength(0);
    expect(await db.select().from(platformSessionsTable)).toHaveLength(0);
  });

  it("never starts recovery for viewers, unverified Google email, copied email, unbound ID or non-Google proof", async () => {
    expect(await issue(2)).toBeNull();
    expect(await issueGoogleLegacyRecovery({ ...proof(), emailVerified: false })).toBeNull();
    expect(await issueGoogleLegacyRecovery({ ...proof(), googleId: "attacker-google" })).toBeNull();
    expect(await issueGoogleLegacyRecovery({ ...proof(), email: people[1].email! })).toBeNull();
    expect(await issueGoogleLegacyRecovery({ ...proof(), provider: "microsoft" } as any)).toBeNull();
    expect(await issueGoogleLegacyRecovery({ ...proof(), provider: "password" } as any)).toBeNull();
    const unverified = await oauth(0, false);
    expect(unverified.location).not.toContain("mfa_mode=recover");
    expect(unverified.token).toBe("");
    expect((await login(0)).json.code).toBe("MFA_MIGRATION_REQUIRED");
    expect(await db.select().from(platformSessionsTable)).toHaveLength(0);
  });

  it.each(["production", "development", ""])("disables issuance and token use outside staging (%s)", async environment => {
    const token = (await issue())!;
    vi.stubEnv("DEPLOYMENT_ENV", environment);
    expect(await issue()).toBeNull();
    expect((await status(token)).status).toBe(403);
    expect((await recover(token)).status).toBe(403);
    expect(await db.select().from(platformSessionsTable)).toHaveLength(0);
  });

  it("commits invalid-code lockout across fresh OAuth tokens; rejects legacy recovery codes", async () => {
    let token = (await issue())!;
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await recover(token, "ABCD-EFGH")).status).toBe(400);
      token = (await issue())!;
    }
    expect((await recover(token)).status).toBe(429);
    expect(await getMfaState(subject(0))).toBeNull();
    expect(await db.select().from(adminEventsTable)).toHaveLength(0);
  });

  it("does not grant personal enrollment on a different deployment or after a security change", async () => {
    const recovered = await recover(await issue());
    expect(recovered.status).toBe(200);
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    expect(await validateMfaPendingToken(recovered.json.mfaToken)).toBeNull();
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    await db.update(platformUsersTable).set({ sessionVersion: 2 }).where(eq(platformUsersTable.id, people[0].id));
    expect((await request("/platform/mfa/setup", { mfaToken: recovered.json.mfaToken })).status).not.toBe(200);
    expect(await getMfaState(subject(0))).toBeNull();
    expect(await db.select().from(platformSessionsTable)).toHaveLength(0);
  });

  it("excludes Google invitation, link and delete-reauth flows from recovery", async () => {
    const invited = await oauth(0, true, " aio_invite=invalid-disposable-invite");
    expect(invited.location).toContain("invite_invalid");
    expect(invited.token).toBe("");
    const linked = await oauth(0, true, " aio_oauth_link=admin");
    expect(linked.location).toContain("link_google=error");
    expect(linked.token).toBe("");
    const deletion = await oauth(0, true, "", "delete:fresh-state");
    expect(deletion.location).toContain("delete_reauth=not_allowed");
    expect(deletion.token).toBe("");
    expect(await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, legacyRecoveryAuthorizationKey(people[0].id)))).toHaveLength(0);
  });

  it("rejects recovery endpoints and Google handoff during live impersonation", async () => {
    const token = (await issue())!;
    const enrolledSecret = generateTotpSecret();
    await saveMfaState(subject(1), { secret: enrolledSecret, enabled: true, recoveryHashes: [] });
    const sid = await createPlatformSession("admin", undefined, people[1].id, companyId);
    await recordMfaSession(sid, subject(1), 0);
    const cookie = `aio_admin_sid=${sid}`;
    expect((await request(`${recoverPath}/status`, { recoveryToken: token }, cookie)).status).toBe(403);
    expect((await request(recoverPath, { recoveryToken: token, code: totpCode(legacySecret) }, cookie)).status).toBe(403);
    const handoff = await oauth(0, true, ` ${cookie}`);
    expect(handoff.location).not.toContain("mfa_mode=recover");
    expect(handoff.token).toBe("");
    expect(await getMfaState(subject(0))).toBeNull();
  });

  it("serializes same-token and different-token retries and consumes the shared timestep across Owners", async () => {
    const [first, retry, other] = await Promise.all([issue(), issue(), issue(1)]);
    const code = totpCode(legacySecret);
    const results = await Promise.all([recover(first, code), recover(first, code), recover(retry, code)]);
    expect(results.filter(result => result.status === 200)).toHaveLength(1);
    expect((await recover(other, code)).status).toBe(400);
    expect(await getMfaGeneration(subject(0))).toBe(1);
    expect(await getMfaGeneration(subject(1))).toBe(0);
    expect(await getMfaState(subject(0))).toBeNull();
    expect(await getMfaState(subject(1))).toBeNull();
    expect(await db.select().from(adminEventsTable)).toHaveLength(1);
    expect(await db.select().from(platformMembershipsTable)).toHaveLength(3);
  });

  it("allows only one concurrent Owner per shared code, leaving the losing Owner untouched", async () => {
    const [first, other] = await Promise.all([issue(), issue(1)]);
    const code = totpCode(legacySecret);
    const results = await Promise.all([recover(first, code), recover(other, code)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 400]);
    const versions = await Promise.all([getMfaGeneration(subject(0)), getMfaGeneration(subject(1))]);
    expect(versions.sort()).toEqual([0, 1]);
    expect(await db.select().from(adminEventsTable)).toHaveLength(1);
    expect(await getMfaState("legacy:admin")).toMatchObject({ secret: legacySecret, enabled: true });
  });
});

describe("personal Master MFA", () => {
  it("requires independent enrollment for two Owners and a Viewer, preserving roster and roles", async () => {
    const secrets = new Set<string>();
    for (let index = 0; index < people.length; index++) {
      const challenge = await login(index);
      expect(challenge.json.mfaEnrollRequired).toBe(true);
      expect(cookieNamed(challenge.cookies, "aio_sid")).toBe("");
      const result = await enroll(index);
      secrets.add(result.secret);
      expect(result.codes).toHaveLength(10);
      expect((await request("/platform/mfa/status", undefined, result.cookie)).json).toMatchObject({
        enabled: true, required: true, email: people[index].email,
      });
    }
    expect(secrets.size).toBe(3);
    expect((await db.select().from(platformMembershipsTable)).map(row => row.role).sort()).toEqual(["owner", "owner", "viewer"]);
  });

  it("never accepts another person's recovery code, trust cookie or secret", async () => {
    const a = await enroll(0);
    const b = await enroll(1);
    const challenge = await login(1);
    expect((await request("/platform/mfa/verify", { mfaToken: challenge.json.mfaToken, code: a.codes[0] })).status).toBe(401);
    const trust = await addTrustedDevice(subject(0), "Owner one's browser");
    expect((await login(1, `aio_mfa_trust=${trust.cookieValue}`)).json.mfaRequired).toBe(true);
    expect((await request("/platform/mfa/disable", { code: totpCode(b.secret) }, b.cookie)).status).toBe(403);
    expect((await getMfaState(subject(0)))?.secret).toBe(a.secret);
  });

  it("consumes a recovery code only once even under concurrent requests", async () => {
    const enrolled = await enroll(0);
    const a = await login(0);
    const b = await login(0);
    const results = await Promise.all([a, b].map(challenge => request("/platform/mfa/verify", {
      mfaToken: challenge.json.mfaToken, code: enrolled.codes[0],
    })));
    expect(results.filter(result => result.status === 200)).toHaveLength(1);
    expect((await getMfaState(subject(0)))?.recoveryHashes).toHaveLength(9);
  });

  it("concurrent setup cannot replace an active factor or return recovery codes twice", async () => {
    const challenge = await login(0);
    const setups = await Promise.all([1, 2].map(() => request("/platform/mfa/setup", { mfaToken: challenge.json.mfaToken })));
    expect(setups[0].json.secret).toBe(setups[1].json.secret);
    const attempts = await Promise.all([1, 2].map(() => request("/platform/mfa/enable", {
      mfaToken: challenge.json.mfaToken, code: totpCode(setups[0].json.secret),
    })));
    expect(attempts.filter(result => result.status === 200)).toHaveLength(1);
    expect((await getMfaState(subject(0)))?.secret).toBe(setups[0].json.secret);
    expect((await request("/platform/mfa/setup", { mfaToken: challenge.json.mfaToken })).status).not.toBe(200);
  });

  it("reset invalidates only target sessions, trust and pending challenges and forces fresh enrollment", async () => {
    const a = await enroll(0);
    const b = await enroll(1);
    const old = await login(1);
    await addTrustedDevice(subject(0), "A");
    await addTrustedDevice(subject(1), "B");
    await resetPersonalMfa(people[1].id);
    expect((await request("/platform/mfa/status", undefined, a.cookie)).status).toBe(200);
    expect((await request("/platform/mfa/status", undefined, b.cookie)).status).toBe(401);
    expect((await request("/platform/mfa/verify", { mfaToken: old.json.mfaToken, code: totpCode(b.secret) })).status).toBe(401);
    expect(await listTrustedDevices(subject(1))).toHaveLength(0);
    expect(await listTrustedDevices(subject(0))).toHaveLength(1);
    expect((await login(1)).json.mfaEnrollRequired).toBe(true);
  });

  it("denies stale pre-MFA sessions, workspace switching and revoked pending memberships", async () => {
    const sid = await createPlatformSession("admin", null, people[2].id, companyId);
    expect(await getPlatformSessionAccount(sid)).toBeNull();
    expect((await request("/platform/switch-workspace", { companyId }, `aio_sid=${sid}`)).status).toBe(401);
    const challenge = await login(2);
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[2].id));
    expect((await request("/platform/mfa/setup", { mfaToken: challenge.json.mfaToken })).status).not.toBe(200);
    expect((await login(2)).status).not.toBe(200);
    expect((await request("/platform/login", { username: "admin", password })).status).not.toBe(200);
  });

  it("security notices name the affected verified human, not the earliest Owner", async () => {
    await enroll(2);
    await vi.waitFor(() => expect(notice).toHaveBeenCalledWith(expect.objectContaining({ toEmail: people[2].email, enabled: true })));
    expect(notice).not.toHaveBeenCalledWith(expect.objectContaining({ toEmail: people[0].email }));
  });

  it("malformed personal security state fails closed", async () => {
    await db.insert(platformMetaTable).values({ key: mfaKey(subject(0)), value: "not-json" });
    const result = await login(0);
    expect(result.status).toBe(500);
    expect(cookieNamed(result.cookies, "aio_sid")).toBe("");
  });

  it("a password change revokes only that person's pending challenges and trusted browsers", async () => {
    const a = await enroll(0);
    const b = await enroll(1);
    const staleChallenge = await login(0);
    await addTrustedDevice(subject(0), "A's browser");
    await addTrustedDevice(subject(1), "B's browser");
    const changed = await request("/platform/change-password", {
      currentPassword: password, newPassword: "Disposable-replacement-password-2!",
    }, a.cookie);
    expect(changed.status).toBe(200);
    expect(await listTrustedDevices(subject(0))).toHaveLength(0);
    expect(await listTrustedDevices(subject(1))).toHaveLength(1);
    expect((await request("/platform/mfa/status", undefined, a.cookie)).status).toBe(200);
    expect((await request("/platform/mfa/status", undefined, b.cookie)).status).toBe(200);
    expect((await request("/platform/mfa/verify", { mfaToken: staleChallenge.json.mfaToken, code: totpCode(a.secret) })).status).toBe(401);
  });

  it("ordinary people retain opt-in MFA and can regenerate or disable only their own factor", async () => {
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[2].id));
    await db.insert(platformAccountsTable).values({ username: "optional", role: "agency", status: "active", passwordHash: "unused" });
    const [company] = await db.insert(platformCompaniesTable).values({ slug: "optional", role: "agency", status: "active" }).returning();
    await db.insert(platformMembershipsTable).values({ userId: people[2].id, companyId: company.id, companySlug: "optional", role: "viewer" });
    const signedIn = await login(2);
    const cookie = cookieNamed(signedIn.cookies, "aio_sid");
    expect(cookie).not.toBe("");
    const setup = await request("/platform/mfa/setup", {}, cookie);
    const enabled = await request("/platform/mfa/enable", { code: totpCode(setup.json.secret) }, cookie);
    expect(enabled.status).toBe(200);
    expect((await request("/platform/mfa/setup", {}, cookie)).status).toBe(409);
    const regenerated = await request("/platform/mfa/recovery-codes", { code: totpCode(setup.json.secret) }, cookie);
    expect(regenerated.status).toBe(200);
    expect((await getMfaState(subject(2)))?.recoveryHashes).not.toContain(hashRecoveryCode(enabled.json.recoveryCodes[0]));
    expect((await request("/platform/mfa/disable", { code: regenerated.json.recoveryCodes[0] }, cookie)).status).toBe(200);
    expect(await getMfaState(subject(2))).toBeNull();
    expect(await getMfaState(subject(0))).toBeNull();
  });

  it("MFA stays mandatory in a second workspace and assurance survives a legitimate switch", async () => {
    await db.insert(platformAccountsTable).values({ username: "agency", role: "agency", passwordHash: "unused", status: "active" });
    const [other] = await db.insert(platformCompaniesTable).values({ slug: "agency", role: "agency", status: "active", setupComplete: true }).returning();
    await db.insert(platformMembershipsTable).values({ userId: people[2].id, companyId: other.id, companySlug: "agency", role: "viewer" });
    const enrolled = await enroll(2);
    const switched = await request("/platform/switch-workspace", { companyId }, enrolled.cookie);
    expect(switched.status).toBe(200);
    expect((await request("/platform/mfa/status", undefined, cookieNamed(switched.cookies, "aio_sid"))).json.required).toBe(true);
  });
});

describe("conservative legacy migration", () => {
  it("quarantines a shared factor; explicit approval affects only one verified person and retries are safe", async () => {
    const legacy = { secret: generateTotpSecret(), enabled: true, recoveryHashes: [] };
    await saveMfaState("legacy:admin", legacy);
    expect((await inspectLegacyMfaMigration("admin")).classification).toBe("ambiguous-personal-recovery-required");
    expect((await login(0)).json.code).toBe("MFA_MIGRATION_REQUIRED");
    await approvePersonalMfaRecovery(people[0].id, "disposable-reviewed-recovery");
    const enrolled = await enroll(0);
    await approvePersonalMfaRecovery(people[0].id, "retry");
    expect((await getMfaState(subject(0)))?.secret).toBe(enrolled.secret);
    expect((await getMfaState("legacy:admin"))?.secret).toBe(legacy.secret);
    expect((await login(1)).json.code).toBe("MFA_MIGRATION_REQUIRED");
    expect((await getPersonalMfaStatus(people[1].id)).migrationRequired).toBe(true);
  });

  it("moves a uniquely attributable factor only after existing proof, without cloning trust", async () => {
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[1].id));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[2].id));
    const secret = generateTotpSecret();
    await saveMfaState("legacy:admin", { secret, enabled: true, recoveryHashes: [] });
    await addTrustedDevice("legacy:admin", "Old shared browser");
    await expect(migrateAttributableLegacyMfa("admin", people[0].id, "invalid")).rejects.toThrow();
    await migrateAttributableLegacyMfa("admin", people[0].id, totpCode(secret));
    await migrateAttributableLegacyMfa("admin", people[0].id, totpCode(secret));
    expect((await getMfaState(subject(0)))?.secret).toBe(secret);
    expect(await getMfaState("legacy:admin")).toBeNull();
    expect(await listTrustedDevices(subject(0))).toEqual([]);
  });
});

describe("signed personal challenges", () => {
  it("binds pending tokens to current generation and rejects tampering", async () => {
    const token = createMfaPendingToken({ u: "admin", uid: people[0].id, cid: companyId, role: "admin", mode: "enroll", g: 0 });
    expect(await validateMfaPendingToken(token)).not.toBeNull();
    expect(await validateMfaPendingToken(`${token}broken`)).toBeNull();
    await resetPersonalMfa(people[0].id);
    expect(await validateMfaPendingToken(token)).toBeNull();
  });
  it("verifies current and adjacent TOTP steps but not unrelated codes", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, "invalid", now)).toBe(false);
  });
});

describe.each(["google", "microsoft"] as const)("personal %s OAuth MFA", provider => {
  async function callback(index: number, inviteToken?: string) {
    vi.stubEnv("GOOGLE_CLIENT_ID", "disposable-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "disposable-secret");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "disposable-client");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "disposable-secret");
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return realFetch(input, init);
      if (url.includes("/token")) return new Response(JSON.stringify({ access_token: "disposable-token" }));
      if (url.includes("userinfo")) return new Response(JSON.stringify({
        id: `google-${index}`, email: people[index].email, name: `Person ${index}`, verified_email: true,
      }));
      if (url.includes("graph.microsoft.com")) return new Response(JSON.stringify({
        id: `microsoft-${index}`, mail: people[index].email, displayName: `Person ${index}`,
      }));
      throw new Error("Unexpected external request in disposable OAuth test");
    });
    const state = provider === "google" ? "disposable-state" : "login:disposable-state";
    return realFetch(`${baseUrl}/api/platform/auth/${provider}/callback`, {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: `${provider === "google" ? "aio_oauth_state" : "aio_ms_state"}=${state}${inviteToken ? `; aio_invite=${inviteToken}` : ""}` },
      body: new URLSearchParams({ state, code: "disposable-code" }).toString(),
    });
  }
  if (provider === "microsoft") it("cannot start staging legacy recovery through a fresh Microsoft callback", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "staging");
    await saveMfaState("legacy:admin", { secret: generateTotpSecret(), enabled: true, recoveryHashes: [] });
    await db.update(platformUsersTable).set({ googleId: "bound-google", microsoftId: "microsoft-0" }).where(eq(platformUsersTable.id, people[0].id));
    const response = await callback(0);
    expect(response.headers.get("location")).toContain("oauth_status=mfa_recovery_required");
    expect(cookieNamed(response.headers.getSetCookie(), "aio_oauth_mfa_token")).toBe("");
    expect(cookieNamed(response.headers.getSetCookie(), "aio_sid")).toBe("");
    expect(await getMfaState(subject(0))).toBeNull();
  });
  it.each(["enroll", "verify"] as const)("invited Master Viewer completes personal %s before receiving a usable session", async mode => {
    const invite = await masterViewerInvite(mode);
    const response = await callback(2, invite.token);
    expect(response.headers.get("location")).toContain(`oauth_status=mfa&mfa_mode=${mode}`);
    expect(cookieNamed(response.headers.getSetCookie(), "aio_sid")).toBe("");
    const token = decodeURIComponent(cookieNamed(response.headers.getSetCookie(), "aio_oauth_mfa_token").split("=").slice(1).join("="));
    await finishInviteChallenge(token, invite.secret);
  });
  it("requires a Viewer to enroll independently without exposing its token in the redirect", async () => {
    const response = await callback(2);
    expect(response.headers.get("location")).toContain("oauth_status=mfa&mfa_mode=enroll");
    const cookie = cookieNamed(response.headers.getSetCookie(), "aio_oauth_mfa_token");
    const token = decodeURIComponent(cookie.split("=").slice(1).join("="));
    expect(token).not.toBe("");
    expect(response.headers.get("location")).not.toContain(token);
    expect(cookieNamed(response.headers.getSetCookie(), "aio_sid")).toBe("");
    const payload = await validateMfaPendingToken(token);
    expect(payload?.uid).toBe(people[2].id);
    const setup = await request("/platform/mfa/setup", { mfaToken: token });
    const enabled = await request("/platform/mfa/enable", { mfaToken: token, code: totpCode(setup.json.secret) });
    expect(enabled.status).toBe(200);
  });
  it("requires the same personal factor as password and cannot restore revoked membership", async () => {
    const enrolled = await enroll(1);
    const response = await callback(1);
    expect(response.headers.get("location")).toContain("mfa_mode=verify");
    const token = decodeURIComponent(cookieNamed(response.headers.getSetCookie(), "aio_oauth_mfa_token").split("=").slice(1).join("="));
    expect((await request("/platform/mfa/verify", { mfaToken: token, code: totpCode(enrolled.secret) })).status).toBe(200);
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[1].id));
    vi.unstubAllGlobals();
    const revoked = await callback(1);
    expect(cookieNamed(revoked.headers.getSetCookie(), "aio_sid")).toBe("");
    expect(cookieNamed(revoked.headers.getSetCookie(), "aio_oauth_mfa_token")).toBe("");
    expect(await db.select().from(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[1].id))).toEqual([]);
  });
});

describe("password invitation personal MFA", () => {
  it.each(["enroll", "verify"] as const)("invited Master Viewer completes personal %s before receiving a usable session", async mode => {
    const invite = await masterViewerInvite(mode);
    const response = await request("/platform/invite/accept", { token: invite.token, password });
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      [mode === "verify" ? "mfaRequired" : "mfaEnrollRequired"]: true, email: people[2].email,
    });
    expect(response.json.account).toBeUndefined();
    expect(cookieNamed(response.cookies, "aio_sid")).toBe("");
    await finishInviteChallenge(response.json.mfaToken, invite.secret);
  });
});

describe("isolated legacy email compatibility", () => {
  it("retains the legacy factor without automatically creating a named identity or membership", async () => {
    await db.insert(platformAccountsTable).values({
      username: "legacy-email", email: "legacy@example.test", role: "agency", passwordHash: hashPassword(password),
    });
    const secret = generateTotpSecret();
    await saveMfaState("legacy:legacy-email", { secret, enabled: true, recoveryHashes: [] });
    const challenge = await request("/platform/login", { username: "legacy@example.test", password });
    expect(challenge.json.mfaRequired).toBe(true);
    expect((await validateMfaPendingToken(challenge.json.mfaToken))?.uid).toBeUndefined();
    const verified = await request("/platform/mfa/verify", { mfaToken: challenge.json.mfaToken, code: totpCode(secret) });
    expect(verified.status).toBe(200);
    expect((await request("/platform/me", undefined, cookieNamed(verified.cookies, "aio_sid"))).json.account.username).toBe("legacy-email");
    expect(await db.select().from(platformUsersTable)).toHaveLength(3);
    expect(await db.select().from(platformMembershipsTable)).toHaveLength(3);
  });
  it("never allows a legacy slug to bypass a named roster or revive a revoked identity", async () => {
    await db.insert(platformAccountsTable).values({ username: "named", role: "agency", passwordHash: hashPassword(password) });
    const [company] = await db.insert(platformCompaniesTable).values({ slug: "named", role: "agency" }).returning();
    await db.insert(platformMembershipsTable).values({ userId: people[2].id, companyId: company.id, companySlug: "named", role: "viewer" });
    const blocked = await request("/platform/login", { username: "named", password });
    expect(blocked.status).not.toBe(200);
    expect(cookieNamed(blocked.cookies, "aio_sid")).toBe("");
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.companySlug, "named"));
    await db.update(platformAccountsTable).set({ email: people[2].email }).where(eq(platformAccountsTable.username, "named"));
    const revoked = await request("/platform/login", { username: "named", password });
    expect(revoked.status).not.toBe(200);
    expect(cookieNamed(revoked.cookies, "aio_sid")).toBe("");
  });
});
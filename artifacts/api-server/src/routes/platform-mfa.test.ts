import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import cookieParser from "cookie-parser";

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
      : key === "sendMfaChangedEmail" || key === "sendNewTrustedDeviceEmail" ? notice
        : typeof value === "function" ? vi.fn(async () => {}) : value,
  ]));
});
import {
  db, platformUsersTable, platformCompaniesTable, platformMembershipsTable,
  platformAccountsTable, platformMetaTable, platformSessionsTable, platformInvitationsTable,
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
} from "../lib/mfa";
import {
  inspectLegacyMfaMigration, approvePersonalMfaRecovery, migrateAttributableLegacyMfa,
} from "../lib/mfa-migration";
import { resolvePlatformAccount } from "../middleware/platform-auth";
import platformRouter from "./platform";
import teamRouter from "./team";

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
  for (const table of [platformInvitationsTable, platformSessionsTable, platformMetaTable, platformMembershipsTable, platformUsersTable, platformCompaniesTable, platformAccountsTable]) await db.delete(table);
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
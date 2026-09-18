import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE,
      name varchar(128), password_hash text, google_id varchar(255), microsoft_id varchar(255),
      session_version integer NOT NULL DEFAULT 0, email_verified boolean,
      created_at timestamptz NOT NULL DEFAULT now()
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
    CREATE TABLE platform_accounts (
      username varchar PRIMARY KEY, password_hash text NOT NULL, role varchar NOT NULL,
      parent varchar, max_seats int, created_at timestamptz NOT NULL DEFAULT now(),
      email varchar, website varchar, status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE platform_memberships (
      user_id uuid NOT NULL REFERENCES platform_users(id), company_id uuid NOT NULL REFERENCES platform_companies(id),
      company_slug varchar(64) NOT NULL, role varchar NOT NULL, project_access text, position varchar(128),
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, company_id)
    );
    CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL);
    CREATE TABLE platform_sessions (
      sid varchar PRIMARY KEY, username varchar NOT NULL, user_id uuid, active_company_id uuid,
      session_version integer, created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL, ip_hint varchar
    );
    CREATE TABLE platform_invitations (
      token varchar(64) PRIMARY KEY, email varchar(255) NOT NULL, company_id uuid NOT NULL,
      company_slug varchar(64) NOT NULL, role varchar NOT NULL DEFAULT 'viewer', project_access text,
      invited_name varchar(128), position varchar(128), invited_by_user_id uuid,
      expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz,
      declined_at timestamptz, reminder_sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE admin_events (
      id serial PRIMARY KEY, actor_id varchar, actor_username varchar, action varchar,
      target_id varchar, target_type varchar, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return { db: drizzle(client, { schema }), ...schema };
});
vi.mock("../middleware/rate-limit", () => ({
  loginLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const notice = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../lib/notify-email", () => ({
  sendMfaAdminResetEmail: notice,
  sendTeamInviteEmail: vi.fn(),
  sendTeamRoleDowngradedEmail: vi.fn(),
  getAppBaseUrl: () => "https://example.test",
}));
vi.mock("../lib/platform-auth", async (original) => ({
  ...await original<typeof import("../lib/platform-auth")>(),
  isImpersonatedRequest: async (req: express.Request) => !!req.cookies?.aio_admin_sid,
}));

import {
  db, platformAccountsTable, platformCompaniesTable, platformUsersTable,
  platformMembershipsTable, platformMetaTable, platformSessionsTable, adminEventsTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  mfaSubject, saveMfaState, getMfaState, addTrustedDevice, listTrustedDevices,
  getMfaGeneration, migrationApprovalKey,
} from "../lib/mfa";
import { approvePersonalMfaRecovery } from "../lib/mfa-migration";
import teamRouter from "./team";

let server: Server;
let baseUrl: string;
let actor: { username: string; role: "admin"; userId?: string; membershipRole?: "owner" | "viewer" | "admin"; activeCompanyId?: string };
let companyId: string;
let people: Array<{ id: string; email: string | null }>;

async function call(path: string, body?: unknown, impersonated = false) {
  const response = await fetch(`${baseUrl}/api/platform/team${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(impersonated ? { cookie: "aio_admin_sid=test-support-session" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() as any };
}
async function reset(index = 1, overrides: Record<string, unknown> = {}, impersonated = false) {
  return call(`/members/${people[index]!.id}/reset-mfa`, {
    confirmationEmail: people[index]!.email, identityVerified: true, ...overrides,
  }, impersonated);
}

beforeAll(async () => {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use((req, _res, next) => { req.account = actor; next(); });
  app.use("/api", teamRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(async () => {
  for (const table of [adminEventsTable, platformSessionsTable, platformMetaTable, platformMembershipsTable, platformUsersTable, platformCompaniesTable, platformAccountsTable]) {
    await db.delete(table);
  }
  notice.mockClear();
  await db.insert(platformAccountsTable).values({ username: "admin", role: "admin", status: "active", passwordHash: "unused-test-hash" });
  const [company] = await db.insert(platformCompaniesTable).values({ slug: "admin", role: "admin", status: "active" }).returning();
  companyId = company!.id;
  people = await db.insert(platformUsersTable).values([
    { email: "owner-one@example.test", name: "Owner One", emailVerified: true },
    { email: "owner-two@example.test", name: "Owner Two", emailVerified: true },
    { email: "viewer@example.test", name: "Viewer", emailVerified: true },
  ]).returning();
  for (const [index, person] of people.entries()) {
    await db.insert(platformMembershipsTable).values({
      userId: person.id, companyId, companySlug: "admin", role: index === 2 ? "viewer" : "owner",
    });
    await saveMfaState(mfaSubject({ userId: person.id, username: "admin" }), {
      secret: `JBSWY3DPEHPK3PX${index + 2}`, enabled: true, recoveryHashes: [],
    });
    await addTrustedDevice(mfaSubject({ userId: person.id, username: "admin" }), `Browser ${index}`);
    await db.insert(platformSessionsTable).values({
      sid: `test-person-${index}`, username: "admin", userId: person.id, activeCompanyId: companyId,
      sessionVersion: 0, expiresAt: new Date(Date.now() + 60_000),
    });
  }
  actor = { username: "admin", role: "admin", userId: people[0]!.id, membershipRole: "owner", activeCompanyId: companyId };
});

describe("named Master member MFA recovery", () => {
  it("reports separate member status and only allows resetting other verified humans", async () => {
    const result = await call("");
    expect(result.status).toBe(200);
    expect(result.json.canResetMemberMfa).toBe(true);
    expect(result.json.members).toHaveLength(3);
    for (const member of result.json.members) {
      expect(member.mfaStatus).toBe("enabled");
      expect(member.canResetMfa).toBe(member.userId !== actor.userId);
    }
    expect(JSON.stringify(result.json)).not.toContain("JBSWY3");
  });

  it.each([1, 2])("resets only target %i and preserves all identities, roles and other sessions", async (targetIndex) => {
    const result = await reset(targetIndex);
    expect(result.status).toBe(200);
    expect(result.json.requiresReenrollment).toBe(true);
    for (const [index, person] of people.entries()) {
      const subject = mfaSubject({ userId: person.id, username: "admin" });
      expect(!!(await getMfaState(subject))?.enabled).toBe(index !== targetIndex);
      expect((await listTrustedDevices(subject)).length).toBe(index === targetIndex ? 0 : 1);
      const sessions = await db.select().from(platformSessionsTable).where(eq(platformSessionsTable.userId, person.id));
      expect(sessions.length).toBe(index === targetIndex ? 0 : 1);
    }
    const members = await db.select().from(platformMembershipsTable);
    expect(members).toHaveLength(3);
    expect(members.filter((m) => m.role === "owner")).toHaveLength(2);
    expect(members.filter((m) => m.role === "viewer")).toHaveLength(1);
    expect(notice).toHaveBeenCalledExactlyOnceWith({
      toEmail: people[targetIndex]!.email, toName: targetIndex === 1 ? "Owner Two" : "Viewer", requiresReenrollment: true,
    });
    const [audit] = await db.select().from(adminEventsTable);
    expect(audit).toMatchObject({ actorId: people[0]!.id, targetId: people[targetIndex]!.id, targetType: "user", action: "mfa_admin_reset" });
    expect(JSON.stringify(audit)).not.toMatch(/JBSWY|recoveryHashes|cookieValue/);
  });

  it("rejects self-reset, missing identity verification, wrong email and support impersonation", async () => {
    expect((await reset(0)).status).toBe(400);
    expect((await reset(1, { identityVerified: false })).status).toBe(400);
    expect((await reset(1, { confirmationEmail: people[2]!.email })).status).toBe(400);
    expect((await reset(1, {}, true)).status).toBe(403);
    expect(notice).not.toHaveBeenCalled();
    expect(await db.select().from(adminEventsTable)).toHaveLength(0);
  });

  it("rejects stale Owner permission, removed membership, legacy actors and restricted support", async () => {
    await db.update(platformMembershipsTable).set({ role: "viewer" })
      .where(and(eq(platformMembershipsTable.userId, actor.userId!), eq(platformMembershipsTable.companyId, companyId)));
    expect((await reset()).status).toBe(403);
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, actor.userId!));
    expect((await reset()).status).toBe(403);
    actor = { username: "admin", role: "admin" };
    expect((await reset()).status).toBe(403);
    actor = { username: "admin", role: "admin", userId: people[1]!.id, membershipRole: "admin" };
    expect((await reset(2)).status).toBe(403);
    expect(notice).not.toHaveBeenCalled();
  });

  it("requires a current member and current verified email, not a stale confirmation", async () => {
    await db.update(platformUsersTable).set({ emailVerified: false }).where(eq(platformUsersTable.id, people[1]!.id));
    expect((await reset()).status).toBe(409);
    await db.update(platformUsersTable).set({ emailVerified: true, email: "changed@example.test" }).where(eq(platformUsersTable.id, people[1]!.id));
    expect((await reset()).status).toBe(400);
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[1]!.id));
    expect((await reset()).status).toBe(404);
    expect(notice).not.toHaveBeenCalled();
  });
});

describe("reviewed personal MFA migration recovery", () => {
  const approvalReference = "disposable-staging-review-326";
  const authorization = () => ({ operatorUserId: people[0]!.id });
  const subject = (index: number) => mfaSubject({ userId: people[index]!.id, username: "admin" });

  it("serializes concurrent approvals and retry never resets a subsequently enrolled factor", async () => {
    const initialGeneration = await getMfaGeneration(subject(1));
    await Promise.all([
      approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization()),
      approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization()),
    ]);
    expect(await getMfaGeneration(subject(1))).toBe(initialGeneration + 1);
    expect(await getMfaState(subject(1))).toBeNull();
    const freshFactor = { secret: "JBSWY3DPEHPK3PXP", enabled: true, recoveryHashes: ["new-personal-recovery-hash"] };
    await saveMfaState(subject(1), freshFactor);
    const { device } = await addTrustedDevice(subject(1), "New personal browser");
    await db.insert(platformSessionsTable).values({
      sid: "post-recovery-session", username: "admin", userId: people[1]!.id, activeCompanyId: companyId,
      sessionVersion: initialGeneration + 1, expiresAt: new Date(Date.now() + 60_000),
    });
    await Promise.all([
      approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization()),
      approvePersonalMfaRecovery(people[1]!.id, "later-retry-same-reviewed-person", authorization()),
    ]);
    expect(await getMfaGeneration(subject(1))).toBe(initialGeneration + 1);
    expect(await getMfaState(subject(1))).toMatchObject(freshFactor);
    expect((await listTrustedDevices(subject(1))).map((d) => d.id)).toContain(device.id);
    expect(await db.select().from(platformSessionsTable).where(eq(platformSessionsTable.sid, "post-recovery-session"))).toHaveLength(1);
    expect(await db.select().from(adminEventsTable)).toHaveLength(1);
  });

  it.each(["demoted", "removed", "unverified"] as const)("rejects a %s operator without mutating the target", async (revocation) => {
    const before = await getMfaState(subject(1));
    if (revocation === "demoted") {
      await db.update(platformMembershipsTable).set({ role: "viewer" }).where(eq(platformMembershipsTable.userId, people[0]!.id));
    } else if (revocation === "removed") {
      await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[0]!.id));
    } else {
      await db.update(platformUsersTable).set({ emailVerified: false }).where(eq(platformUsersTable.id, people[0]!.id));
    }
    await expect(approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization()))
      .rejects.toThrow("current verified named Master Owner");
    expect(await getMfaState(subject(1))).toEqual(before);
    expect(await getMfaGeneration(subject(1))).toBe(0);
    expect(await db.select().from(adminEventsTable)).toHaveLength(0);
    expect(await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, migrationApprovalKey(people[1]!.id)))).toHaveLength(0);
  });

  it("rechecks operator authority even on an otherwise idempotent approved retry", async () => {
    await approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization());
    const freshFactor = { secret: "JBSWY3DPEHPK3PXP", enabled: true, recoveryHashes: [] };
    await saveMfaState(subject(1), freshFactor);
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[0]!.id));
    await expect(approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization()))
      .rejects.toThrow("current verified named Master Owner");
    expect(await getMfaState(subject(1))).toMatchObject(freshFactor);
    expect(await getMfaGeneration(subject(1))).toBe(1);
    expect(await db.select().from(adminEventsTable)).toHaveLength(1);
  });

  it("does not revive a target without live membership", async () => {
    const before = await getMfaState(subject(1));
    await db.delete(platformMembershipsTable).where(eq(platformMembershipsTable.userId, people[1]!.id));
    await expect(approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization()))
      .rejects.toThrow("live verified member");
    expect(await getMfaState(subject(1))).toEqual(before);
    expect(await getMfaGeneration(subject(1))).toBe(0);
    expect(await db.select().from(adminEventsTable)).toHaveLength(0);
  });

  it("records the reviewed actor and target while partial recovery preserves others and legacy state", async () => {
    await saveMfaState("legacy:admin", { secret: "JBSWY3DPEHPK3PXP", enabled: true, recoveryHashes: ["legacy-proof-hash"] });
    const legacyBefore = await getMfaState("legacy:admin");
    const othersBefore = await Promise.all([0, 2].map(async (index) => ({
      state: await getMfaState(subject(index)),
      devices: await listTrustedDevices(subject(index)),
      generation: await getMfaGeneration(subject(index)),
    })));
    await approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization());
    await approvePersonalMfaRecovery(people[1]!.id, approvalReference, authorization());
    for (const [position, index] of [0, 2].entries()) {
      expect(await getMfaState(subject(index))).toEqual(othersBefore[position]!.state);
      expect(await listTrustedDevices(subject(index))).toEqual(othersBefore[position]!.devices);
      expect(await getMfaGeneration(subject(index))).toBe(othersBefore[position]!.generation);
      expect(await db.select().from(platformSessionsTable).where(eq(platformSessionsTable.userId, people[index]!.id))).toHaveLength(1);
    }
    expect(await getMfaState("legacy:admin")).toEqual(legacyBefore);
    expect(await getMfaState(subject(1))).toBeNull();
    expect(await listTrustedDevices(subject(1))).toEqual([]);
    expect(await db.select().from(platformSessionsTable).where(eq(platformSessionsTable.userId, people[1]!.id))).toHaveLength(0);
    const audits = await db.select().from(adminEventsTable);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: people[0]!.id, actorUsername: "admin", targetId: people[1]!.id,
      targetType: "user", action: "mfa_personal_recovery_approved", metadata: { approvalReference },
    });
    expect(JSON.stringify(audits)).not.toMatch(/JBSWY|legacy-proof-hash|recoveryHashes|cookieValue/);
    expect(await db.select().from(platformMembershipsTable)).toHaveLength(3);
  });
});
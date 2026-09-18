import { db, platformMetaTable, platformMembershipsTable, platformUsersTable, platformSessionsTable, adminEventsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type MfaDb, getMfaState, mfaKey, trustedKey, migrationApprovalKey,
  verifyTotp, consumeRecoveryCode, resetPersonalMfa,
  validateMfaIdentity,
} from "./mfa";

export interface MfaMigrationAuthorization { operatorUserId: string; approvalReference?: string }
async function checkMigrationAuthorization(tx: MfaDb, targetUserId: string, authorization?: MfaMigrationAuthorization) {
  await tx.execute(sql`SELECT user_id FROM platform_memberships WHERE user_id = ${targetUserId} FOR UPDATE`);
  const [target] = await tx.select().from(platformUsersTable).where(eq(platformUsersTable.id, targetUserId)).limit(1);
  const memberships = await tx.select().from(platformMembershipsTable).where(eq(platformMembershipsTable.userId, targetUserId));
  if (!target || target.emailVerified !== true || !memberships.length) throw new Error("Recovery requires a live verified member");
  let hasLiveMembership = false;
  for (const membership of memberships) {
    try {
      await validateMfaIdentity({ username: membership.companySlug, userId: targetUserId, activeCompanyId: membership.companyId }, tx);
      hasLiveMembership = true;
    } catch { /* another live membership may authorize this human */ }
  }
  if (!hasLiveMembership) throw new Error("Recovery cannot revive a retired identity");
  if (!authorization) return;
  await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${authorization.operatorUserId} FOR UPDATE`);
  await tx.execute(sql`SELECT user_id FROM platform_memberships WHERE user_id = ${authorization.operatorUserId} AND company_slug = 'admin' FOR UPDATE`);
  const [operator] = await tx.select().from(platformUsersTable).where(eq(platformUsersTable.id, authorization.operatorUserId)).limit(1);
  const [owner] = await tx.select().from(platformMembershipsTable).where(and(
    eq(platformMembershipsTable.userId, authorization.operatorUserId), eq(platformMembershipsTable.companySlug, "admin"),
    eq(platformMembershipsTable.role, "owner"),
  )).limit(1);
  if (!operator || operator.emailVerified !== true || !owner) throw new Error("A current verified named Master Owner must authorize migration");
  await validateMfaIdentity({ username: "admin", userId: operator.id, activeCompanyId: owner.companyId }, tx);
}

async function auditMigration(tx: MfaDb, userId: string, action: string, authorization?: MfaMigrationAuthorization, approvalReference?: string) {
  if (!authorization) return;
  await tx.insert(adminEventsTable).values({
    actorId: authorization.operatorUserId, actorUsername: "admin", action, targetId: userId, targetType: "user",
    metadata: { approvalReference: approvalReference ?? authorization.approvalReference ?? "existing-factor-proof" },
  });
}

/** Read-only rollout preflight. No secret, recovery hash or trust record leaves
 * this boundary. Attribution needs exactly one member, not the "first owner". */
export async function inspectLegacyMfaMigration(username: string, tx: MfaDb = db) {
  const slug = username.trim().toLowerCase();
  const state = await getMfaState(`legacy:${slug}`, tx);
  const members = await tx.select({
    userId: platformMembershipsTable.userId, role: platformMembershipsTable.role,
    email: platformUsersTable.email, emailVerified: platformUsersTable.emailVerified,
  }).from(platformMembershipsTable).innerJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
    .where(eq(platformMembershipsTable.companySlug, slug));
  return {
    username: slug, legacyEnabled: state?.enabled === true,
    classification: !state?.enabled ? "no-enabled-factor" as const : members.length === 0
      ? "legacy-only" as const : members.length === 1 && members[0].role === "owner"
        ? "attributable-proof-required" as const : "ambiguous-personal-recovery-required" as const,
    members,
  };
}

/** Explicit operator-assisted move. Existing-factor proof is mandatory and the
 * old factor is moved, NEVER cloned. Shared cases must use personal recovery. */
export async function migrateAttributableLegacyMfa(username: string, userId: string, code: string, authorization?: MfaMigrationAuthorization): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${userId} FOR UPDATE`);
    const slug = username.trim().toLowerCase();
    await tx.execute(sql`SELECT id FROM platform_companies WHERE slug = ${slug} FOR UPDATE`);
    await checkMigrationAuthorization(tx, userId, authorization);
    const report = await inspectLegacyMfaMigration(slug, tx);
    const existing = await getMfaState(`user:${userId}`, tx);
    if (existing?.enabled && !report.legacyEnabled) return; // retry after successful move
    if (existing || report.classification !== "attributable-proof-required" || report.members[0]?.userId !== userId
      || report.members[0].emailVerified !== true) throw new Error("Legacy attribution requires verified individual recovery");
    const legacy = (await getMfaState(`legacy:${slug}`, tx))!;
    const recovery = consumeRecoveryCode(legacy, code);
    if (!verifyTotp(legacy.secret, code) && recovery === null) throw new Error("Existing-factor proof was not valid");
    await tx.insert(platformMetaTable).values({
      key: mfaKey(`user:${userId}`),
      value: JSON.stringify({ ...legacy, recoveryHashes: recovery ?? legacy.recoveryHashes, updatedAt: new Date().toISOString() }),
    });
    await tx.delete(platformMetaTable).where(inArray(platformMetaTable.key, [mfaKey(`legacy:${slug}`), trustedKey(`legacy:${slug}`)]));
    await tx.update(platformUsersTable).set({ sessionVersion: sql`${platformUsersTable.sessionVersion} + 1` }).where(eq(platformUsersTable.id, userId));
    await tx.delete(platformSessionsTable).where(eq(platformSessionsTable.userId, userId));
    await tx.insert(platformMetaTable).values({ key: migrationApprovalKey(userId), value: "proof-verified-move" }).onConflictDoNothing();
    await auditMigration(tx, userId, "mfa_legacy_factor_migrated", authorization);
  });
}

/** Offline recovery requires independently verified approval recorded by the
 * operator. Calling this is an actual reset; dry-run callers use inspection. */
export async function approvePersonalMfaRecovery(userId: string, approvalReference: string, authorization?: MfaMigrationAuthorization): Promise<void> {
  if (!approvalReference.trim()) throw new Error("A verified recovery approval reference is required");
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM platform_users WHERE id = ${userId} FOR UPDATE`);
    await checkMigrationAuthorization(tx, userId, authorization);
    const [user] = await tx.select().from(platformUsersTable).where(eq(platformUsersTable.id, userId)).limit(1);
    if (!user || user.emailVerified !== true) throw new Error("Recovery requires a verified human identity");
    const [prior] = await tx.select().from(platformMetaTable).where(eq(platformMetaTable.key, migrationApprovalKey(userId))).limit(1);
    if (prior) return; // idempotent: retry must not reset a newly enrolled factor
    await resetPersonalMfa(userId, tx);
    await tx.update(platformMetaTable).set({ value: JSON.stringify({ approvalReference, approvedAt: new Date().toISOString() }) })
      .where(eq(platformMetaTable.key, migrationApprovalKey(userId)));
    await auditMigration(tx, userId, "mfa_personal_recovery_approved", authorization, approvalReference);
  });
}
import {
  db,
  platformInvitationsTable,
  platformMembershipsTable,
  platformUsersTable,
  platformMetaTable,
  platformCompaniesTable,
  type PlatformInvitationRow,
} from "@workspace/db";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { normalizeMembershipRole, type MembershipRole } from "./platform-auth";
import { logger } from "./logger";

// Team invitations: single-use tokens that let an Agency/Partner owner/admin
// bring a colleague into their workspace with a pre-assigned membership role
// and project access. Consumed either via password set-up or via Google /
// Microsoft SSO on the invite landing page.

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_TEAM_SEATS = 3;

// Roles an invitee may be given. "owner" is deliberately excluded — ownership
// is transferred through the existing owner-reassignment path, not via invite.
export const INVITABLE_ROLES: MembershipRole[] = ["admin", "billing", "content", "viewer"];

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  billing: "Billing",
  content: "Content staff",
  viewer: "Viewer",
};

const teamSeatsKey = (slug: string) => `account:team-seats:${slug.toLowerCase()}`;

// The configurable per-account team seat limit (default 3). Stored in
// platform_meta so no schema change is needed and master admins can adjust it.
export async function getTeamSeatLimit(companySlug: string): Promise<number> {
  try {
    const [row] = await db
      .select()
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, teamSeatsKey(companySlug)))
      .limit(1);
    const n = row ? Number.parseInt(row.value, 10) : NaN;
    if (Number.isInteger(n) && n > 0) return n;
  } catch { /* fall through to default */ }
  return DEFAULT_TEAM_SEATS;
}

export async function setTeamSeatLimit(companySlug: string, seats: number): Promise<void> {
  const value = String(seats);
  await db
    .insert(platformMetaTable)
    .values({ key: teamSeatsKey(companySlug), value })
    .onConflictDoUpdate({ target: platformMetaTable.key, set: { value } });
}

// Count seats in use: active memberships + pending (unexpired, unused,
// unrevoked) invitations.
export async function countSeatsUsed(companyId: string): Promise<{ members: number; pendingInvites: number }> {
  const [memberRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.companyId, companyId));
  const [inviteRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(platformInvitationsTable)
    .where(
      and(
        eq(platformInvitationsTable.companyId, companyId),
        isNull(platformInvitationsTable.usedAt),
        isNull(platformInvitationsTable.revokedAt),
        gt(platformInvitationsTable.expiresAt, new Date()),
      ),
    );
  return { members: memberRow?.count ?? 0, pendingInvites: inviteRow?.count ?? 0 };
}

// Load an invitation that is still valid (unused, unrevoked, unexpired).
export async function getValidInvite(token: string): Promise<PlatformInvitationRow | null> {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(platformInvitationsTable)
    .where(eq(platformInvitationsTable.token, token))
    .limit(1);
  if (!row) return null;
  if (row.usedAt || row.revokedAt || row.expiresAt < new Date()) return null;
  // The company must still exist and be active.
  const [company] = await db
    .select({ status: platformCompaniesTable.status })
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.id, row.companyId))
    .limit(1);
  if (!company || company.status !== "active") return null;
  return row;
}

// Consume an invitation for a resolved platform user: mark the token used
// (atomically — a second concurrent accept loses) and create the membership
// with the invite's role and project access.
//
// Returns false when the token was already consumed/revoked in the meantime.
export async function consumeInvite(
  invite: PlatformInvitationRow,
  userId: string,
): Promise<boolean> {
  // Atomic single-use claim: only the request that flips used_at from NULL wins.
  const claimed = await db
    .update(platformInvitationsTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(platformInvitationsTable.token, invite.token),
        isNull(platformInvitationsTable.usedAt),
        isNull(platformInvitationsTable.revokedAt),
      ),
    )
    .returning({ token: platformInvitationsTable.token });
  if (claimed.length === 0) return false;

  const role = normalizeMembershipRole(invite.role);
  await db
    .insert(platformMembershipsTable)
    .values({
      userId,
      companyId: invite.companyId,
      companySlug: invite.companySlug,
      role,
      projectAccess: invite.projectAccess ?? null,
    })
    .onConflictDoUpdate({
      target: [platformMembershipsTable.userId, platformMembershipsTable.companyId],
      set: { role, projectAccess: invite.projectAccess ?? null },
    });

  // Invited users have proven control of the invited email address by opening
  // the single-use link, so mark them verified (only upgrades false → true).
  try {
    await db
      .update(platformUsersTable)
      .set({ emailVerified: true })
      .where(eq(platformUsersTable.id, userId));
  } catch (err) {
    logger.warn({ err }, "consumeInvite: failed to mark email verified (non-fatal)");
  }

  return true;
}

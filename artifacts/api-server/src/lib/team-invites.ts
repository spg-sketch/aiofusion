import {
  db,
  platformInvitationsTable,
  platformMembershipsTable,
  platformUsersTable,
  platformMetaTable,
  platformCompaniesTable,
  platformInviteLinkFailuresTable,
  type PlatformInvitationRow,
} from "@workspace/db";
import { and, eq, isNull, isNotNull, gt, sql } from "drizzle-orm";
import { normalizeMembershipRole, parseProjectAccess, type MembershipRole } from "./platform-auth";
import { logger } from "./logger";

// Structural type that covers both the real `db` instance and a Drizzle
// transaction object (they share the same query builder interface at runtime).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_TEAM_SEATS = 3;

// Agency/Partner workspaces run two seat pools: account-level seats (members
// with no project restriction, e.g. someone handling billing) and a separate
// pool of up to this many seats per project for staff allocated to work on
// that particular project.
export const PROJECT_TEAM_SEATS = 3;

// Roles an invitee may be given. "owner" is deliberately excluded - ownership
// is transferred through the existing owner-reassignment path, not via invite.
export const INVITABLE_ROLES: MembershipRole[] = ["admin", "billing", "content", "viewer"];

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  billing: "Billing",
  content: "Content Team Member",
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
//
// Pass a Drizzle transaction as `dbOrTx` to run this query inside an existing
// transaction (e.g. for atomic seat-cap enforcement).
export async function countSeatsUsed(
  companyId: string,
  dbOrTx: DbOrTx = db,
): Promise<{ members: number; pendingInvites: number }> {
  const [memberRow] = await dbOrTx
    .select({ count: sql<number>`count(*)::int` })
    .from(platformMembershipsTable)
    .where(eq(platformMembershipsTable.companyId, companyId));
  const [inviteRow] = await dbOrTx
    .select({ count: sql<number>`count(*)::int` })
    .from(platformInvitationsTable)
    .where(
      and(
        eq(platformInvitationsTable.companyId, companyId),
        isNull(platformInvitationsTable.usedAt),
        isNull(platformInvitationsTable.revokedAt),
        isNull(platformInvitationsTable.declinedAt),
        gt(platformInvitationsTable.expiresAt, new Date()),
      ),
    );
  return { members: memberRow?.count ?? 0, pendingInvites: inviteRow?.count ?? 0 };
}

export function normalizeInviteToken(raw: string): string {
  if (!raw) return "";
  let t = String(raw).trim();
  for (let i = 0; i < 2; i++) {
    try {
      const dec = decodeURIComponent(t);
      if (dec === t) break;
      t = dec;
    } catch {
      break;
    }
  }
  t = t.trim().replace(/^["'<([{]+/, "").replace(/["'>)\]}.,;:!?]+$/, "");
  const m = t.match(/[0-9a-f]{64}/i);
  return m ? m[0].toLowerCase() : t;
}

// Account-pool seats on an Agency/Partner workspace: memberships and pending
// invites with NO project restriction (project_access IS NULL). Project-scoped
// members sit in the per-project pool instead and do not consume these seats.
export async function countAccountPoolSeats(
  companyId: string,
  dbOrTx: DbOrTx = db,
): Promise<{ members: number; pendingInvites: number }> {
  const [memberRow] = await dbOrTx
    .select({ count: sql<number>`count(*)::int` })
    .from(platformMembershipsTable)
    .where(
      and(
        eq(platformMembershipsTable.companyId, companyId),
        isNull(platformMembershipsTable.projectAccess),
      ),
    );
  const [inviteRow] = await dbOrTx
    .select({ count: sql<number>`count(*)::int` })
    .from(platformInvitationsTable)
    .where(
      and(
        eq(platformInvitationsTable.companyId, companyId),
        isNull(platformInvitationsTable.projectAccess),
        isNull(platformInvitationsTable.usedAt),
        isNull(platformInvitationsTable.revokedAt),
        isNull(platformInvitationsTable.declinedAt),
        gt(platformInvitationsTable.expiresAt, new Date()),
      ),
    );
  return { members: memberRow?.count ?? 0, pendingInvites: inviteRow?.count ?? 0 };
}

export type ProjectSeatHolder = {
  // Display label for "who holds this seat" messages: name, else email.
  label: string;
  // Set for existing members; null for pending invites.
  userId: string | null;
  // Set for pending invites; null for existing members.
  inviteToken: string | null;
};

// Lightweight COUNT-only version of the per-project seat check - no JOINs.
// Use inside transactions (where a LEFT JOIN may deadlock on some PGlite builds)
// when only the seat count is needed, not the holder labels.
//
// Returns the number of seats currently held for `projectId`.
export async function countProjectSeatHolders(
  companyId: string,
  projectId: string,
  dbOrTx: DbOrTx = db,
): Promise<number> {
  // IMPORTANT: we can't use `sql` tagged templates with JSONB @> inside PGlite
  // reliably across all versions, so we do a full-table scan + JS filter.  The
  // tables are small (per-company) so the overhead is negligible.
  const memberRows = await dbOrTx
    .select({
      projectAccess: platformMembershipsTable.projectAccess,
    })
    .from(platformMembershipsTable)
    .where(
      and(
        eq(platformMembershipsTable.companyId, companyId),
        isNotNull(platformMembershipsTable.projectAccess),
      ),
    );
  const memberCount = memberRows.filter((r: { projectAccess: string | null }) =>
    (parseProjectAccess(r.projectAccess) ?? []).includes(projectId),
  ).length;

  const inviteRows = await dbOrTx
    .select({
      projectAccess: platformInvitationsTable.projectAccess,
    })
    .from(platformInvitationsTable)
    .where(
      and(
        eq(platformInvitationsTable.companyId, companyId),
        isNotNull(platformInvitationsTable.projectAccess),
        isNull(platformInvitationsTable.usedAt),
        isNull(platformInvitationsTable.revokedAt),
        isNull(platformInvitationsTable.declinedAt),
        gt(platformInvitationsTable.expiresAt, new Date()),
      ),
    );
  const inviteCount = inviteRows.filter((r: { projectAccess: string | null }) =>
    (parseProjectAccess(r.projectAccess) ?? []).includes(projectId),
  ).length;

  return memberCount + inviteCount;
}

// Per-project seat holders on an Agency/Partner workspace: every member or
// pending invite whose projectAccess lists a project holds one seat in EACH
// listed project.
//
// Pass a Drizzle transaction as `dbOrTx` to run this query inside an existing
// transaction (e.g. for atomic seat-cap enforcement).
export async function getProjectSeatHolders(
  companyId: string,
  dbOrTx: DbOrTx = db,
): Promise<Map<string, ProjectSeatHolder[]>> {
  const holders = new Map<string, ProjectSeatHolder[]>();
  const add = (projectIds: string[] | null, holder: ProjectSeatHolder) => {
    for (const id of projectIds ?? []) {
      const list = holders.get(id) ?? [];
      list.push(holder);
      holders.set(id, list);
    }
  };

  const memberRows = await dbOrTx
    .select({
      userId: platformMembershipsTable.userId,
      projectAccess: platformMembershipsTable.projectAccess,
      name: platformUsersTable.name,
      email: platformUsersTable.email,
    })
    .from(platformMembershipsTable)
    .leftJoin(platformUsersTable, eq(platformMembershipsTable.userId, platformUsersTable.id))
    .where(
      and(
        eq(platformMembershipsTable.companyId, companyId),
        isNotNull(platformMembershipsTable.projectAccess),
      ),
    );
  for (const m of memberRows) {
    add(parseProjectAccess(m.projectAccess), {
      label: m.name || m.email || "a team member",
      userId: m.userId,
      inviteToken: null,
    });
  }

  const inviteRows = await dbOrTx
    .select({
      token: platformInvitationsTable.token,
      email: platformInvitationsTable.email,
      invitedName: platformInvitationsTable.invitedName,
      projectAccess: platformInvitationsTable.projectAccess,
    })
    .from(platformInvitationsTable)
    .where(
      and(
        eq(platformInvitationsTable.companyId, companyId),
        isNotNull(platformInvitationsTable.projectAccess),
        isNull(platformInvitationsTable.usedAt),
        isNull(platformInvitationsTable.revokedAt),
        isNull(platformInvitationsTable.declinedAt),
        gt(platformInvitationsTable.expiresAt, new Date()),
      ),
    );
  for (const i of inviteRows) {
    add(parseProjectAccess(i.projectAccess), {
      label: i.invitedName || i.email,
      userId: null,
      inviteToken: i.token,
    });
  }

  return holders;
}

// Load an invitation that is still valid (unused, unrevoked, not declined,
// unexpired).
export async function getValidInvite(rawToken: string): Promise<PlatformInvitationRow | null> {
  const token = normalizeInviteToken(rawToken);
  if (!token) return null;
  const [row] = await db
    .select()
    .from(platformInvitationsTable)
    .where(eq(platformInvitationsTable.token, token))
    .limit(1);
  if (!row) return null;
  if (row.usedAt || row.revokedAt || row.declinedAt || row.expiresAt < new Date()) return null;
  // The company must still exist and be active.
  const [company] = await db
    .select({ status: platformCompaniesTable.status })
    .from(platformCompaniesTable)
    .where(eq(platformCompaniesTable.id, row.companyId))
    .limit(1);
  if (!company || company.status !== "active") return null;
  return row;
}

// Why a specific invite link is not usable. "unknown" covers tokens that
// don't match any invitation (including tokens replaced by a re-sent
// invitation, since each resend overwrites the token in place). "replaced"
// means the token belongs to a revoked invite whose email has a newer pending
// invitation - the recipient should open their latest email instead.
export type InviteInvalidReason = "unknown" | "used" | "revoked" | "declined" | "replaced" | "expired" | "inactive";

export const INVITE_INVALID_MESSAGES: Record<InviteInvalidReason, string> = {
  unknown:
    "This invitation link isn't valid. If the invitation was re-sent, only the link in the newest email works - older links stop working.",
  used: "This invitation has already been used. If that was you, just sign in with your email and password.",
  revoked: "This invitation was withdrawn. Ask your team admin to send a new one.",
  declined: "You've already declined this invitation. Ask your team admin to send a new one if that has changed.",
  replaced:
    "This link was replaced by a newer invitation. Please open the most recent invitation email - only the newest link works.",
  expired: "This invitation has expired - links last 7 days. Ask your team admin to re-send it.",
  inactive: "This workspace is no longer active, so the invitation can't be accepted.",
};

// Explain why getValidInvite() returned null for this token, and log the
// specific failure so support can diagnose reports of "invalid" invite links.
export async function getInviteInvalidReason(rawToken: string): Promise<InviteInvalidReason> {
  const token = normalizeInviteToken(rawToken);
  const tokenPrefix = token.slice(0, 8);
  if (!token) {
    logger.warn({ tokenPrefix }, "invite lookup failed: empty token");
    return "unknown";
  }
  const [row] = await db
    .select()
    .from(platformInvitationsTable)
    .where(eq(platformInvitationsTable.token, token))
    .limit(1);
  let reason: InviteInvalidReason;
  if (!row) {
    reason = "unknown";
  } else if (row.usedAt) {
    reason = "used";
  } else if (row.declinedAt) {
    reason = "declined";
  } else if (row.revokedAt) {
    // A revoked invite whose email now has a fresh pending invitation in the
    // same workspace was effectively replaced - point the user at the new one.
    const [newer] = await db
      .select({ token: platformInvitationsTable.token })
      .from(platformInvitationsTable)
      .where(
        and(
          eq(platformInvitationsTable.companyId, row.companyId),
          eq(platformInvitationsTable.email, row.email),
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
          isNull(platformInvitationsTable.declinedAt),
          gt(platformInvitationsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
    reason = newer ? "replaced" : "revoked";
  } else if (row.expiresAt < new Date()) {
    reason = "expired";
  } else {
    reason = "inactive";
  }
  logger.warn(
    {
      reason,
      tokenPrefix,
      rawTokenDiffers: normalizeInviteToken(rawToken) !== String(rawToken ?? ""),
      email: row?.email,
      companySlug: row?.companySlug,
    },
    "invite lookup failed",
  );
  // Best-effort only: a failed lookup must always keep its original user-facing
  // result even if the support diagnostic store is temporarily unavailable.
  try {
    await db.insert(platformInviteLinkFailuresTable).values({
      tokenPrefix,
      email: row?.email ?? null,
      companySlug: row?.companySlug ?? null,
      reason,
    });
  } catch (err) {
    logger.debug({ err, reason, tokenPrefix }, "invite failure log unavailable");
  }
  return reason;
}

// Consume an invitation for a resolved platform user: mark the token used
// (atomically - a second concurrent accept loses) and create the membership
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
        isNull(platformInvitationsTable.declinedAt),
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
      position: invite.position ?? null,
    })
    .onConflictDoUpdate({
      target: [platformMembershipsTable.userId, platformMembershipsTable.companyId],
      set: { role, projectAccess: invite.projectAccess ?? null, position: invite.position ?? null },
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

export type DbOrTx = typeof db | any;

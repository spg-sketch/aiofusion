import { db, platformInvitationsTable, platformCompaniesTable, platformUsersTable } from "@workspace/db";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { logger } from "./logger";
import { normalizeMembershipRole } from "./platform-auth";
import { MEMBERSHIP_ROLE_LABELS } from "./team-invites";
import { sendInviteReminderEmail, getAppBaseUrl } from "./notify-email";

// Any unsent reminder for an invite expiring within the next 25 hours is eligible.
// There is no lower bound - a failed send keeps reminder_sent_at NULL so the
// next hourly sweep retries until the invite actually expires.
const REMINDER_WINDOW_MS = 25 * 60 * 60 * 1000;

/**
 * Scan platform_invitations for pending invites that expire within the next
 * 25 hours and have not yet had a reminder sent, then send one reminder email
 * each and stamp reminder_sent_at.
 *
 * At-most-once delivery under concurrent sweeps is guaranteed by an atomic
 * claim: each candidate is claimed with
 *   UPDATE … SET reminder_sent_at = now() WHERE token = $1 AND reminder_sent_at IS NULL
 * before the email is attempted.  If the email send fails the claim is rolled
 * back (reminder_sent_at = NULL) so a later sweep retries.
 */
export async function sendInviteReminders(): Promise<void> {
  const now = new Date();
  const high = new Date(Date.now() + REMINDER_WINDOW_MS);

  // Find all qualifying invites in one query (join company + optional inviter).
  let rows: Array<{
    token: string;
    email: string;
    role: string;
    companyId: string;
    companySlug: string;
    invitedByUserId: string | null;
    expiresAt: Date;
    companyDisplayName: string | null;
    inviterName: string | null;
    inviterEmail: string | null;
  }>;

  try {
    const raw = await db
      .select({
        token:              platformInvitationsTable.token,
        email:              platformInvitationsTable.email,
        role:               platformInvitationsTable.role,
        companyId:          platformInvitationsTable.companyId,
        companySlug:        platformInvitationsTable.companySlug,
        invitedByUserId:    platformInvitationsTable.invitedByUserId,
        expiresAt:          platformInvitationsTable.expiresAt,
        companyDisplayName: platformCompaniesTable.displayName,
      })
      .from(platformInvitationsTable)
      .innerJoin(
        platformCompaniesTable,
        eq(platformInvitationsTable.companyId, platformCompaniesTable.id),
      )
      .where(
        and(
          isNull(platformInvitationsTable.usedAt),
          isNull(platformInvitationsTable.revokedAt),
          isNull(platformInvitationsTable.reminderSentAt),
          gt(platformInvitationsTable.expiresAt, now),       // not yet expired
          lte(platformInvitationsTable.expiresAt, high),     // within 25 h window
          eq(platformCompaniesTable.status, "active"),
        ),
      );

    // For each row that has an invitedByUserId, look up the inviter's name.
    const inviterIds = [...new Set(raw.map((r) => r.invitedByUserId).filter((id): id is string => id != null))];
    const inviterMap = new Map<string, { name: string | null; email: string | null }>();
    if (inviterIds.length > 0) {
      const inviterRows = await db
        .select({ id: platformUsersTable.id, name: platformUsersTable.name, email: platformUsersTable.email })
        .from(platformUsersTable)
        .where(
          inviterIds.length === 1
            ? eq(platformUsersTable.id, inviterIds[0]!)
            : eq(platformUsersTable.id, inviterIds[0]!), // fallback; loop below handles multi
        );
      for (const ir of inviterRows) {
        inviterMap.set(ir.id, { name: ir.name, email: ir.email });
      }
      // Fetch remaining inviters individually (avoiding a complex IN clause in drizzle without sql``)
      for (const id of inviterIds.slice(1)) {
        const [ir] = await db
          .select({ id: platformUsersTable.id, name: platformUsersTable.name, email: platformUsersTable.email })
          .from(platformUsersTable)
          .where(eq(platformUsersTable.id, id))
          .limit(1);
        if (ir) inviterMap.set(ir.id, { name: ir.name, email: ir.email });
      }
    }

    rows = raw.map((r) => {
      const inv = r.invitedByUserId ? inviterMap.get(r.invitedByUserId) : null;
      return {
        ...r,
        inviterName:  inv?.name  ?? null,
        inviterEmail: inv?.email ?? null,
      };
    });
  } catch (err) {
    logger.error({ err }, "invite-reminders: failed to query invites (non-fatal)");
    return;
  }

  if (rows.length === 0) return;

  logger.info({ count: rows.length }, "invite-reminders: sending reminder(s)");

  for (const row of rows) {
    // ── Atomic claim ────────────────────────────────────────────────────────
    // Stamp reminder_sent_at NOW before attempting the send.  Any concurrent
    // sweep that reads the same candidate will see the stamp and skip it.
    // If the send fails we roll the stamp back to NULL so a later sweep retries.
    let claimed: { token: string }[];
    try {
      claimed = await db
        .update(platformInvitationsTable)
        .set({ reminderSentAt: new Date() })
        .where(
          and(
            eq(platformInvitationsTable.token, row.token),
            isNull(platformInvitationsTable.reminderSentAt),
          ),
        )
        .returning({ token: platformInvitationsTable.token });
    } catch (err) {
      logger.warn({ err, token: row.token }, "invite-reminders: failed to claim invite - skipping");
      continue;
    }

    if (claimed.length === 0) {
      // Another concurrent sweep already claimed this invite.
      logger.debug({ token: row.token }, "invite-reminders: invite already claimed by another sweep - skipping");
      continue;
    }

    // ── Send ────────────────────────────────────────────────────────────────
    const role = normalizeMembershipRole(row.role);
    const roleLabel = MEMBERSHIP_ROLE_LABELS[role];
    const companyName = row.companyDisplayName || row.companySlug;
    const inviterName = row.inviterName || row.inviterEmail || companyName;
    const inviteUrl   = `${getAppBaseUrl()}/?invite=${row.token}`;

    try {
      const delivered = await sendInviteReminderEmail({
        toEmail:     row.email,
        companyName,
        inviterName,
        roleLabel,
        inviteUrl,
        expiresAt:   row.expiresAt,
      });

      if (delivered) {
        logger.info({ token: row.token, email: row.email }, "invite-reminders: reminder sent and stamped");
      } else {
        // Resend not configured - roll back the claim so the invite is retried
        // once the API key is set.
        await db
          .update(platformInvitationsTable)
          .set({ reminderSentAt: null })
          .where(eq(platformInvitationsTable.token, row.token));
        logger.warn({ token: row.token, email: row.email }, "invite-reminders: reminder skipped (Resend not configured) - claim rolled back, will retry");
      }
    } catch (err) {
      // Provider error - roll back the claim so the invite is retried.
      try {
        await db
          .update(platformInvitationsTable)
          .set({ reminderSentAt: null })
          .where(eq(platformInvitationsTable.token, row.token));
      } catch (rollbackErr) {
        logger.error({ rollbackErr, token: row.token }, "invite-reminders: failed to roll back claim after send error");
      }
      logger.warn({ err, token: row.token, email: row.email }, "invite-reminders: failed to send reminder - claim rolled back, will retry");
    }
  }
}

import { db, platformCompaniesTable } from "@workspace/db";
import { and, eq, gt, isNull, isNotNull, lte, ne, or } from "drizzle-orm";
import { logger } from "./logger";
import { sendSubscriptionRenewalReminderEmail } from "./notify-email";

export const RENEWAL_REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type RenewalCandidate = {
  slug: string;
  email: string | null;
  billingEmail: string | null;
  displayName: string | null;
  currentPeriodEnd: Date;
};

/**
 * Send one renewal notice per subscription period.
 *
 * The marker is claimed before the provider call with an UPDATE ... RETURNING
 * predicate. This is safe when several API processes run the hourly sweep at
 * once. Known non-delivery outcomes roll the marker back so a later sweep can
 * retry; a successful provider call leaves the period marker in place.
 */
export async function sendSubscriptionRenewalReminders(now = new Date()): Promise<void> {
  const high = new Date(now.getTime() + RENEWAL_REMINDER_WINDOW_MS);
  let rows: RenewalCandidate[];

  try {
    rows = await db
      .select({
        slug: platformCompaniesTable.slug,
        email: platformCompaniesTable.email,
        billingEmail: platformCompaniesTable.billingEmail,
        displayName: platformCompaniesTable.displayName,
        currentPeriodEnd: platformCompaniesTable.currentPeriodEnd,
      })
      .from(platformCompaniesTable)
      .where(
        and(
          eq(platformCompaniesTable.subscriptionStatus, "active"),
          eq(platformCompaniesTable.cancelAtPeriodEnd, false),
          isNotNull(platformCompaniesTable.currentPeriodEnd),
          gt(platformCompaniesTable.currentPeriodEnd, now),
          lte(platformCompaniesTable.currentPeriodEnd, high),
          // A period marker is deliberately compared to the current period,
          // not merely checked for NULL. This makes the sweep self-healing if
          // a webhook's period-reset write was delayed or lost.
          or(
            isNull(platformCompaniesTable.renewalReminderPeriodEnd),
            ne(platformCompaniesTable.renewalReminderPeriodEnd, platformCompaniesTable.currentPeriodEnd),
          ),
        ),
      ) as RenewalCandidate[];
  } catch (err) {
    logger.error({ err }, "subscription-reminders: failed to query subscriptions (non-fatal)");
    return;
  }

  for (const row of rows) {
    if (!row.currentPeriodEnd) continue;
    const recipient = row.billingEmail || row.email;
    if (!recipient) {
      logger.warn({ slug: row.slug }, "subscription-reminders: no billing email - skipping");
      continue;
    }

    let claimed: Array<{ slug: string }>;
    try {
      claimed = await db
        .update(platformCompaniesTable)
        .set({ renewalReminderPeriodEnd: row.currentPeriodEnd })
        .where(
          and(
            eq(platformCompaniesTable.slug, row.slug),
            eq(platformCompaniesTable.subscriptionStatus, "active"),
            eq(platformCompaniesTable.cancelAtPeriodEnd, false),
            eq(platformCompaniesTable.currentPeriodEnd, row.currentPeriodEnd),
            or(
              isNull(platformCompaniesTable.renewalReminderPeriodEnd),
              ne(platformCompaniesTable.renewalReminderPeriodEnd, row.currentPeriodEnd),
            ),
          ),
        )
        .returning({ slug: platformCompaniesTable.slug });
    } catch (err) {
      logger.warn({ err, slug: row.slug }, "subscription-reminders: failed to claim subscription - skipping");
      continue;
    }
    if (claimed.length === 0) continue;

    try {
      const delivered = await sendSubscriptionRenewalReminderEmail({
        toEmail: recipient,
        companyName: row.displayName || row.slug,
        renewalAt: row.currentPeriodEnd,
      });
      if (delivered) {
        logger.info({ slug: row.slug, email: recipient }, "subscription-reminders: reminder sent and stamped");
        continue;
      }
      await rollbackClaim(row.slug, row.currentPeriodEnd);
      logger.warn({ slug: row.slug }, "subscription-reminders: provider unavailable - claim rolled back");
    } catch (err) {
      await rollbackClaim(row.slug, row.currentPeriodEnd);
      logger.warn({ err, slug: row.slug }, "subscription-reminders: send failed - claim rolled back, will retry");
    }
  }
}

async function rollbackClaim(slug: string, periodEnd: Date): Promise<void> {
  try {
    await db
      .update(platformCompaniesTable)
      .set({ renewalReminderPeriodEnd: null })
      .where(
        and(
          eq(platformCompaniesTable.slug, slug),
          eq(platformCompaniesTable.currentPeriodEnd, periodEnd),
          eq(platformCompaniesTable.renewalReminderPeriodEnd, periodEnd),
        ),
      );
  } catch (err) {
    logger.error({ err, slug }, "subscription-reminders: failed to roll back claim");
  }
}
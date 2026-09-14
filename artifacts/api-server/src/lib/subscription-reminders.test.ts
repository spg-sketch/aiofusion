import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE platform_companies (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug varchar(64) NOT NULL UNIQUE,
      email varchar(255),
      billing_email varchar(255),
      display_name varchar(128),
      subscription_status varchar(16),
      current_period_end timestamptz,
      cancel_at_period_end boolean NOT NULL DEFAULT false,
      renewal_reminder_period_end timestamptz
    );
  `);
  return { db, platformCompaniesTable: schema.platformCompaniesTable };
});

const sendReminder = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("./notify-email", () => ({
  sendSubscriptionRenewalReminderEmail: (...args: unknown[]) => sendReminder(...args),
}));

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendSubscriptionRenewalReminders } from "./subscription-reminders";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2027-01-01T00:00:00.000Z");

async function seed(
  slug: string,
  periodEnd: Date | null,
  opts: { status?: string; cancelAtPeriodEnd?: boolean; marker?: Date | null } = {},
): Promise<void> {
  await db.execute(sql`
    INSERT INTO platform_companies
      (slug, email, display_name, subscription_status, current_period_end,
       cancel_at_period_end, renewal_reminder_period_end)
    VALUES
      (${slug}, ${`${slug}@example.test`}, ${`${slug} Ltd`}, ${opts.status ?? "active"},
       ${periodEnd}, ${opts.cancelAtPeriodEnd ?? false}, ${opts.marker ?? null})
  `);
}

async function marker(slug: string): Promise<Date | null> {
  const result = await db.execute(sql`
    SELECT renewal_reminder_period_end FROM platform_companies WHERE slug = ${slug}
  `);
  const value = (result as unknown as { rows: Array<{ renewal_reminder_period_end: Date | string | null }> }).rows[0]
    ?.renewal_reminder_period_end;
  return value ? new Date(value) : null;
}

describe("sendSubscriptionRenewalReminders", () => {
  beforeEach(async () => {
    sendReminder.mockReset().mockResolvedValue(true);
    await db.execute(sql`DELETE FROM platform_companies`);
  });

  it("uses a seven-day window and excludes null or past periods", async () => {
    await seed("in-window", new Date(now.getTime() + 7 * DAY));
    await seed("too-early", new Date(now.getTime() + 8 * DAY));
    await seed("past", new Date(now.getTime() - DAY));
    await seed("no-period", null);

    await sendSubscriptionRenewalReminders(now);

    expect(sendReminder).toHaveBeenCalledOnce();
    expect(await marker("in-window")).not.toBeNull();
  });

  it("excludes cancelled, past_due, and scheduled-cancellation subscriptions", async () => {
    await seed("cancelled", new Date(now.getTime() + 6 * DAY), { status: "cancelled" });
    await seed("past-due", new Date(now.getTime() + 6 * DAY), { status: "past_due" });
    await seed("scheduled", new Date(now.getTime() + 6 * DAY), { cancelAtPeriodEnd: true });

    await sendSubscriptionRenewalReminders(now);

    expect(sendReminder).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent sweeps with the atomic claim", async () => {
    await seed("race", new Date(now.getTime() + 6 * DAY));
    sendReminder.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return true;
    });

    await Promise.all([
      sendSubscriptionRenewalReminders(now),
      sendSubscriptionRenewalReminders(now),
    ]);

    expect(sendReminder).toHaveBeenCalledOnce();
  });

  it("rolls back a failed claim and retries on a later sweep", async () => {
    await seed("retry", new Date(now.getTime() + 6 * DAY));
    sendReminder.mockRejectedValueOnce(new Error("provider timeout"));

    await sendSubscriptionRenewalReminders(now);
    expect(await marker("retry")).toBeNull();

    await sendSubscriptionRenewalReminders(now);
    expect(sendReminder).toHaveBeenCalledTimes(2);
    expect(await marker("retry")).not.toBeNull();
  });

  it("sends again after the period identity changes", async () => {
    const firstPeriod = new Date(now.getTime() + 6 * DAY);
    const secondPeriod = new Date(now.getTime() + 7 * DAY);
    await seed("period-reset", firstPeriod);
    await sendSubscriptionRenewalReminders(now);
    expect(sendReminder).toHaveBeenCalledOnce();

    await db.execute(sql`
      UPDATE platform_companies
      SET current_period_end = ${secondPeriod}
      WHERE slug = 'period-reset'
    `);
    await sendSubscriptionRenewalReminders(now);

    expect(sendReminder).toHaveBeenCalledTimes(2);
    expect((await marker("period-reset"))?.getTime()).toBe(secondPeriod.getTime());
  });
});
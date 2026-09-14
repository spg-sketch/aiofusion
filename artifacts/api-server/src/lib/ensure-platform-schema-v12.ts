import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Renewal reminders need both the Stripe cancellation state and a marker tied
// to one specific period. Both additions are idempotent for rolling deploys.
export async function ensurePlatformSchemaV12(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS renewal_reminder_period_end timestamptz
    `);
    logger.info("platform schema v12 (renewal reminder state) ensured");
  } catch (err) {
    logger.error({ err }, "Failed to ensure platform schema v12");
    throw err;
  }
}
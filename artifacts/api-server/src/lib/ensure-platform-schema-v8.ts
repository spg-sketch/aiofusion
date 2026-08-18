import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent schema additions for Stripe billing (schema v8):
//
//   platform_companies - stripe_customer_id      (text, nullable)
//                      - stripe_subscription_id  (text, nullable)
//                      - plan                    (varchar(16): inhouse|agency)
//                      - billing_frequency       (varchar(16): annual|quarterly)
//                      - subscription_status     (varchar(16): none|active|past_due|cancelled)
//                      - current_period_end      (timestamptz)
//   projects           - tier                    (varchar(16): standard|premium|max)
//
// Subscriptions attach only to top-level accounts. NULL everywhere means the
// account has never subscribed - existing (Beta) accounts keep working
// exactly as before.
//
// Uses ADD COLUMN IF NOT EXISTS so this is safe to run on every restart.
export async function ensurePlatformSchemaV8(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS stripe_customer_id text,
        ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
        ADD COLUMN IF NOT EXISTS plan varchar(16),
        ADD COLUMN IF NOT EXISTS billing_frequency varchar(16),
        ADD COLUMN IF NOT EXISTS subscription_status varchar(16),
        ADD COLUMN IF NOT EXISTS current_period_end timestamptz
    `);
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS tier varchar(16)
    `);
    logger.info("platform schema v8 (Stripe billing columns) ensured");
  } catch (err) {
    logger.error({ err }, "Failed to ensure platform schema v8");
    throw err;
  }
}

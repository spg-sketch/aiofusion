import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent schema additions for the v5 invite-reminder feature.
//
//   platform_invitations — reminder_sent_at (timestamptz, nullable)
//     Set once the 24h-before-expiry reminder email has been dispatched.
//     NULL = reminder not yet sent. Prevents duplicate reminder sends when
//     the hourly sweep runs again over the same invite.
//
// Uses ADD COLUMN IF NOT EXISTS so this is safe to run on every server restart.
// A failure here is non-fatal.
export async function ensurePlatformSchemaV5(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_invitations
        ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz
    `);
    logger.info("ensurePlatformSchemaV5: reminder_sent_at column ready");
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV5: failed to apply schema additions");
  }
}

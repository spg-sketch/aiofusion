import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Dedicated operational contact for company/account-management communication.
// It is intentionally not reused as a login identity or Stripe invoice email.
export async function ensurePlatformSchemaV10(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS key_account_holder_email varchar(255);
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS billing_address_version integer
    `);
    logger.info("platform schema v10 (key account holder contact and structured billing address marker) ensured");
  } catch (err) {
    logger.error({ err }, "Failed to ensure platform schema v10");
    throw err;
  }
}
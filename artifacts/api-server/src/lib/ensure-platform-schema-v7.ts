import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent schema addition for billing details:
//
//   platform_companies - billing_address (varchar(512), nullable)
//     Free-form postal address shown on invoices, edited alongside the
//     billing email and VAT number on the Billing details card.
//
// Uses ADD COLUMN IF NOT EXISTS so this is safe to run on every server restart.
// A failure here is non-fatal.
export async function ensurePlatformSchemaV7(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS billing_address varchar(512)
    `);
    logger.info("ensurePlatformSchemaV7: billing_address column ready");
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV7: failed to apply schema additions");
  }
}

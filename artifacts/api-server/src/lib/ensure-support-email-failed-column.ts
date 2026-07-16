import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureSupportEmailFailedColumn(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE support_tickets
        ADD COLUMN IF NOT EXISTS email_failed boolean NOT NULL DEFAULT false
    `);
    logger.info("ensureSupportEmailFailedColumn: column ready");
  } catch (err) {
    logger.error({ err }, "ensureSupportEmailFailedColumn: failed");
  }
}

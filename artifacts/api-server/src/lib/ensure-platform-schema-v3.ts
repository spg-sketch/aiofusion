import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent schema additions for the v3 platform login/signup overhaul.
//
//   platform_users - email_verified (null=legacy, false=unverified, true=verified)
//   platform_companies - setup_complete (null=legacy, false=needs setup, true=done)
//   platform_email_verifications - new table for single-use email verify tokens
//
// All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so they are safe
// to run on every server restart. A failure here is non-fatal.
export async function ensurePlatformSchemaV3(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_users
        ADD COLUMN IF NOT EXISTS email_verified boolean
    `);

    await db.execute(sql`
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS setup_complete boolean
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_email_verifications (
        token        varchar(64) PRIMARY KEY,
        user_id      uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
        expires_at   timestamptz NOT NULL,
        used_at      timestamptz
      )
    `);

    logger.info("ensurePlatformSchemaV3: columns and table ready");
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV3: failed to apply schema additions");
  }
}

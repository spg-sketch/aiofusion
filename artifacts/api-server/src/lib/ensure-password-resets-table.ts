import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent creation of the platform_password_resets table (single-use
// password reset tokens, 1-hour expiry). Safe to run on every server restart.
export async function ensurePasswordResetsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_password_resets (
        token        varchar(64) PRIMARY KEY,
        user_id      uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
        expires_at   timestamptz NOT NULL,
        used_at      timestamptz
      )
    `);
    logger.info("ensurePasswordResetsTable: table ready");
  } catch (err) {
    logger.error({ err }, "ensurePasswordResetsTable: failed to create table");
  }
}

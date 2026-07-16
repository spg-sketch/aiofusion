import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureContactSubmissionsTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id           serial PRIMARY KEY,
        type         varchar(32)  NOT NULL,
        name         varchar(128) NOT NULL,
        email        varchar(256) NOT NULL,
        company      varchar(128) NOT NULL DEFAULT '',
        subject      varchar(256) NOT NULL DEFAULT '',
        message      text         NOT NULL DEFAULT '',
        email_failed varchar(8)   NOT NULL DEFAULT 'false',
        created_at   timestamptz  NOT NULL DEFAULT now()
      )
    `);
  } catch (err: unknown) {
    logger.error({ err }, "Failed to ensure contact_submissions table");
  }
}

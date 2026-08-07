import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent column additions for the v2 platform schema.
//
// Adds columns introduced in the login/accounts overhaul:
//   platform_users - session_version (fast revocation), microsoft_id (Entra ID SSO)
//   platform_sessions - session_version (carries the version at issue time)
//   platform_companies - free_access, billing_email, vat_number, display_name
//
// All statements use ADD COLUMN IF NOT EXISTS so they are safe to run on every
// server restart. A failure here is non-fatal: the server continues with the
// previous schema. New features that depend on these columns simply won't
// activate until the columns exist.
export async function ensurePlatformSchemaV2(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_users
        ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS microsoft_id varchar(255) UNIQUE
    `);

    await db.execute(sql`
      ALTER TABLE platform_sessions
        ADD COLUMN IF NOT EXISTS session_version integer
    `);

    await db.execute(sql`
      ALTER TABLE platform_companies
        ADD COLUMN IF NOT EXISTS free_access boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS billing_email varchar(255),
        ADD COLUMN IF NOT EXISTS vat_number varchar(64),
        ADD COLUMN IF NOT EXISTS display_name varchar(128)
    `);

    logger.info("ensurePlatformSchemaV2: columns ready");
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV2: failed to apply schema additions");
  }
}

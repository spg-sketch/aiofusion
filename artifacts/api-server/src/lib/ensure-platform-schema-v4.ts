import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent schema additions for the v4 team-invitations feature.
//
//   platform_memberships - project_access (NULL = all projects; JSON array of
//                          project ids for content/viewer members)
//   platform_invitations - new table for single-use team invite tokens
//
// All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so they are safe
// to run on every server restart. A failure here is non-fatal.
export async function ensurePlatformSchemaV4(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_memberships
        ADD COLUMN IF NOT EXISTS project_access text
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_invitations (
        token               varchar(64) PRIMARY KEY,
        email               varchar(255) NOT NULL,
        company_id          uuid NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
        company_slug        varchar(64) NOT NULL,
        role                varchar NOT NULL DEFAULT 'viewer',
        project_access      text,
        invited_by_user_id  uuid,
        expires_at          timestamptz NOT NULL,
        used_at             timestamptz,
        revoked_at          timestamptz,
        created_at          timestamptz NOT NULL DEFAULT now()
      )
    `);

    logger.info("ensurePlatformSchemaV4: columns and table ready");
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV4: failed to apply schema additions");
  }
}

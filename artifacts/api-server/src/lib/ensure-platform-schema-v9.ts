import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent schema additions for durable team-invite outcomes:
//   - declined_at preserves an explicit decline for the inviter to see
//   - a partial unique index prevents duplicate live invites per workspace/email
//   - invite-link failures give support a small, safe diagnostic trail
export async function ensurePlatformSchemaV9(): Promise<void> {
  // Keep the failure log available even if a legacy data issue needs manual
  // attention before the uniqueness index can be created.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS platform_invite_link_failures (
        id serial PRIMARY KEY,
        token_prefix varchar(8) NOT NULL,
        email varchar(255),
        company_slug varchar(64),
        reason varchar(32) NOT NULL,
        attempted_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS platform_invite_link_failures_attempted_at_idx
        ON platform_invite_link_failures (attempted_at DESC)
    `);
    await db.execute(sql`
      ALTER TABLE platform_invitations
        ADD COLUMN IF NOT EXISTS declined_at timestamptz
    `);
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV9: failed to prepare invite diagnostics or decline state");
    throw err;
  }

  try {
    // Older deployments could have created more than one active invitation
    // before the database guard existed. Preserve the newest live invitation
    // and revoke earlier duplicates so the invariant can be introduced without
    // leaving an account with two usable links.
    await db.execute(sql`
      WITH ranked_live_invites AS (
        SELECT token,
          row_number() OVER (
            PARTITION BY company_id, email
            ORDER BY created_at DESC, token DESC
          ) AS row_number
        FROM platform_invitations
        WHERE used_at IS NULL AND revoked_at IS NULL AND declined_at IS NULL
      )
      UPDATE platform_invitations AS invitation
      SET revoked_at = now()
      FROM ranked_live_invites AS ranked
      WHERE invitation.token = ranked.token AND ranked.row_number > 1
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS platform_invitations_one_live_email_idx
        ON platform_invitations (company_id, email)
        WHERE used_at IS NULL AND revoked_at IS NULL AND declined_at IS NULL
    `);
    logger.info("ensurePlatformSchemaV9: invite decline, duplicate guard, and failure log ready");
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV9: failed to establish the live-invite uniqueness invariant");
    throw err;
  }
}
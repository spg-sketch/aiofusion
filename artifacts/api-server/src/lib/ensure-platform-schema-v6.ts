import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Idempotent schema additions for the v6 team-member profile feature.
//
//   platform_memberships - position (varchar(128), nullable)
//     The member's job title within this workspace.
//   platform_invitations - invited_name, position (varchar(128), nullable)
//     Full name and job title entered by the inviter; applied when the
//     invitation is accepted.
//
// Uses ADD COLUMN IF NOT EXISTS so this is safe to run on every server restart.
// A failure here is non-fatal.
export async function ensurePlatformSchemaV6(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE platform_memberships
        ADD COLUMN IF NOT EXISTS position varchar(128)
    `);
    await db.execute(sql`
      ALTER TABLE platform_invitations
        ADD COLUMN IF NOT EXISTS invited_name varchar(128)
    `);
    await db.execute(sql`
      ALTER TABLE platform_invitations
        ADD COLUMN IF NOT EXISTS position varchar(128)
    `);
    logger.info("ensurePlatformSchemaV6: member name/position columns ready");
  } catch (err) {
    logger.error({ err }, "ensurePlatformSchemaV6: failed to apply schema additions");
  }
}

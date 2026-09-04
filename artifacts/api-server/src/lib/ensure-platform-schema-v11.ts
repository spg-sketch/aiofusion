import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensurePlatformSchemaV11(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE platform_companies
      ADD COLUMN IF NOT EXISTS beta_trial_started_at timestamptz,
      ADD COLUMN IF NOT EXISTS beta_trial_ends_at timestamptz
  `);
  logger.info("platform schema v11 (card-free beta trial columns) ensured");
}
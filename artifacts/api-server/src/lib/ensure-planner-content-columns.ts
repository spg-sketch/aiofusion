import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensurePlannerContentColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE planner_items
        ADD COLUMN IF NOT EXISTS headline    text,
        ADD COLUMN IF NOT EXISTS standfirst  text,
        ADD COLUMN IF NOT EXISTS body_copy   text,
        ADD COLUMN IF NOT EXISTS action_notes text
    `);
    logger.info("ensurePlannerContentColumns: columns ready");
  } catch (err) {
    logger.error({ err }, "ensurePlannerContentColumns: failed");
  }
}

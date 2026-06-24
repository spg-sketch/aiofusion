import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureAuditLocksTable(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_locks (
        project_id varchar NOT NULL,
        audit_type varchar NOT NULL,
        owner varchar NOT NULL DEFAULT '',
        last_run_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, audit_type)
      )
    `);
  } catch (err: any) {
    logger.error({ err }, "Failed to ensure audit_locks table");
  }
}

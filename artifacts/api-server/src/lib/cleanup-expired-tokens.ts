import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

// Grace period before physically deleting expired/used token rows. Keeping
// rows briefly after expiry/use preserves a short debugging window while
// still preventing unbounded table growth.
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Periodic sweep of single-use token tables. Deletes rows that are either
// past their expiry or already consumed, once the grace period has elapsed.
// Valid (unexpired, unused) links are never touched. Safe to run on every
// server restart and on a schedule; tables may not exist yet on first boot
// (they are created by other ensure-* jobs), so each delete fails soft.
export async function cleanupExpiredTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);
  for (const table of ["platform_password_resets", "platform_email_verifications"]) {
    try {
      const result = await db.execute(sql`
        DELETE FROM ${sql.raw(table)}
        WHERE expires_at < ${cutoff} OR used_at < ${cutoff}
      `);
      const deleted = (result as unknown as { rowCount?: number }).rowCount ?? 0;
      if (deleted > 0) {
        logger.info({ table, deleted }, "cleanupExpiredTokens: removed stale token rows");
      }
    } catch (err) {
      logger.warn({ err, table }, "cleanupExpiredTokens: sweep failed (non-fatal)");
    }
  }
}

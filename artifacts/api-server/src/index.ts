import app from "./app";
import { logger } from "./lib/logger";
import { ensureDefaultAdmin, backfillPlatformUsers } from "./lib/platform-auth";
import { ensureAuditLocksTable } from "./lib/ensure-audit-locks-table";
import { ensureSavedAuditTables } from "./lib/ensure-saved-audit-tables";
import { pruneExpiredSessions } from "./lib/auth";
import { db, platformAccountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Make sure the platform is never locked out: seed the default admin login if
  // no admin account exists yet.
  ensureDefaultAdmin().catch((err) => {
    logger.error({ err }, "Failed to ensure default admin account");
  });

  // Backfill platform_users rows for every existing platform_accounts row.
  // Idempotent — gated by a platform_meta flag, safe to call on every restart.
  backfillPlatformUsers().catch((err) => {
    logger.error({ err }, "Failed to backfill platform users (non-fatal)");
  });

  ensureAuditLocksTable().catch((err) => {
    logger.error({ err }, "Failed to ensure audit_locks table");
  });

  ensureSavedAuditTables().catch((err) => {
    logger.error({ err }, "Failed to ensure saved audit tables");
  });

  pruneExpiredSessions().catch((err) => {
    logger.error({ err }, "Failed to prune expired sessions on startup");
  });

  // One-time data migration: move the 'patrick' demo account under the
  // 'aiodemo' (AIO Demonstration) agency so it can share the demo projects.
  // Safe to run repeatedly — it only fires when the parent is still 'admin'.
  db.update(platformAccountsTable)
    .set({ parent: "aiodemo" })
    .where(and(
      eq(platformAccountsTable.username, "patrick"),
      eq(platformAccountsTable.parent, "admin"),
    ))
    .catch((err) => {
      logger.warn({ err }, "Failed to reparent 'patrick' to 'aiodemo' (non-fatal)");
    });

  setInterval(() => {
    pruneExpiredSessions().catch((err) => {
      logger.error({ err }, "Failed to prune expired sessions (scheduled)");
    });
  }, PRUNE_INTERVAL_MS).unref();
});

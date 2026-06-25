import app from "./app";
import { logger } from "./lib/logger";
import { ensureDefaultAdmin } from "./lib/platform-auth";
import { ensureAuditLocksTable } from "./lib/ensure-audit-locks-table";
import { pruneExpiredSessions } from "./lib/auth";

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

  ensureAuditLocksTable().catch((err) => {
    logger.error({ err }, "Failed to ensure audit_locks table");
  });

  pruneExpiredSessions().catch((err) => {
    logger.error({ err }, "Failed to prune expired sessions on startup");
  });

  setInterval(() => {
    pruneExpiredSessions().catch((err) => {
      logger.error({ err }, "Failed to prune expired sessions (scheduled)");
    });
  }, PRUNE_INTERVAL_MS).unref();
});

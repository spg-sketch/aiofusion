import app from "./app";
import { logger } from "./lib/logger";
import { features } from "./lib/features";
import { ensureDefaultAdmin, backfillPlatformUsers } from "./lib/platform-auth";
import { ensureAuditLocksTable } from "./lib/ensure-audit-locks-table";
import { ensureSavedAuditTables } from "./lib/ensure-saved-audit-tables";
import { ensurePlatformCompanyCascade } from "./lib/ensure-platform-company-cascade";
import { ensurePlannerContentColumns } from "./lib/ensure-planner-content-columns";
import { ensureSupportEmailFailedColumn } from "./lib/ensure-support-email-failed-column";
import { ensureContactSubmissionsTable } from "./lib/ensure-contact-submissions-table";
import { ensurePlatformSchemaV2 } from "./lib/ensure-platform-schema-v2";
import { pruneExpiredSessions } from "./lib/auth";
import { seedSupportFaq } from "./lib/seed-support-faq";
import { db, platformAccountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Staging isolation guard
// ---------------------------------------------------------------------------
// If DEPLOYMENT_ENV (or NODE_ENV as a fallback) is "staging", verify that
// DATABASE_URL does not contain any of the substrings listed in
// PRODUCTION_DB_IDENTIFIERS (comma-separated hostnames / db names).  If it
// does, we refuse to boot so that a misconfigured secret can never silently
// contaminate production data.
// ---------------------------------------------------------------------------
const deploymentEnv = (
  process.env["DEPLOYMENT_ENV"] ??
  process.env["NODE_ENV"] ??
  ""
).toLowerCase().trim();

if (deploymentEnv === "staging") {
  const dbUrl = process.env["DATABASE_URL"] ?? "";
  const rawIdentifiers = process.env["PRODUCTION_DB_IDENTIFIERS"] ?? "";
  const productionIdentifiers = rawIdentifiers
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (productionIdentifiers.length === 0) {
    logger.error(
      "FATAL: DEPLOYMENT_ENV=staging but PRODUCTION_DB_IDENTIFIERS is not set. " +
        "Set PRODUCTION_DB_IDENTIFIERS to the production DB hostname or name " +
        "(comma-separated) so the isolation guard can verify this deployment is " +
        "not connected to the production database.",
    );
    process.exit(1);
  }

  for (const identifier of productionIdentifiers) {
    if (dbUrl.includes(identifier)) {
      logger.error(
        { identifier },
        "FATAL: Staging deployment is pointed at the production database. " +
          "Update DATABASE_URL to the staging database and redeploy.",
      );
      process.exit(1);
    }
  }

  logger.info(
    { identifiersChecked: productionIdentifiers.length },
    "Staging isolation check passed — DATABASE_URL does not reference production.",
  );
}

// ---------------------------------------------------------------------------

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

  const activeFlags = Object.entries(features)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  logger.info({ port, activeFeatureFlags: activeFlags }, "Server listening");

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

  ensurePlatformCompanyCascade().catch((err) => {
    logger.error({ err }, "Failed to ensure platform_companies cascade FK");
  });

  ensurePlannerContentColumns().catch((err) => {
    logger.error({ err }, "Failed to ensure planner content columns");
  });

  ensureSupportEmailFailedColumn().catch((err) => {
    logger.error({ err }, "Failed to ensure support tickets email_failed column");
  });

  ensureContactSubmissionsTable().catch((err) => {
    logger.error({ err }, "Failed to ensure contact_submissions table");
  });

  ensurePlatformSchemaV2().catch((err) => {
    logger.error({ err }, "Failed to apply platform schema v2 additions");
  });

  pruneExpiredSessions().catch((err) => {
    logger.error({ err }, "Failed to prune expired sessions on startup");
  });

  seedSupportFaq().catch((err) => {
    logger.error({ err }, "Failed to seed support FAQ (non-fatal)");
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

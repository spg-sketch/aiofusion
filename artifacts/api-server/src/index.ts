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
import { ensurePlatformSchemaV3 } from "./lib/ensure-platform-schema-v3";
import { ensurePasswordResetsTable } from "./lib/ensure-password-resets-table";
import { cleanupExpiredTokens } from "./lib/cleanup-expired-tokens";
import { pruneExpiredSessions } from "./lib/auth";
import { seedSupportFaq } from "./lib/seed-support-faq";
import { db, platformAccountsTable, platformCompaniesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { ensurePlatformSchemaV4 } from "./lib/ensure-platform-schema-v4";
import { ensurePlatformSchemaV5 } from "./lib/ensure-platform-schema-v5";
import { ensurePlatformSchemaV6 } from "./lib/ensure-platform-schema-v6";
import { ensurePlatformSchemaV7 } from "./lib/ensure-platform-schema-v7";
import { ensurePlatformSchemaV8 } from "./lib/ensure-platform-schema-v8";
import { initStripe } from "./lib/stripe-init";
import { sendInviteReminders } from "./lib/invite-reminders";
import { checkMicrosoftOAuthCredentials } from "./lib/microsoft-oauth-health";
import { ensurePlatformSchemaV9 } from "./lib/ensure-platform-schema-v9";
import { ensurePlatformSchemaV10 } from "./lib/ensure-platform-schema-v10";

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MICROSOFT_HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000;

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
    "Staging isolation check passed - DATABASE_URL does not reference production.",
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

// Schema migrations that request handlers depend on (membership columns,
// invitations table, ...) must be complete before the server accepts traffic - 
// otherwise a request arriving during rollout can hit a missing column/table.
// Each step is idempotent; a failure is logged and startup continues so a
// transient DB hiccup can't hard-lock deploys of otherwise-healthy code.
async function runStartupMigrations(): Promise<void> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["audit_locks table", ensureAuditLocksTable],
    ["saved audit tables", ensureSavedAuditTables],
    ["platform_companies cascade FK", ensurePlatformCompanyCascade],
    ["planner content columns", ensurePlannerContentColumns],
    ["support tickets email_failed column", ensureSupportEmailFailedColumn],
    ["contact_submissions table", ensureContactSubmissionsTable],
    ["platform schema v2 additions", ensurePlatformSchemaV2],
    ["platform schema v3 additions", ensurePlatformSchemaV3],
    ["platform schema v4 additions", ensurePlatformSchemaV4],
    ["platform schema v5 additions", ensurePlatformSchemaV5],
    ["platform schema v6 additions", ensurePlatformSchemaV6],
    ["platform schema v7 additions", ensurePlatformSchemaV7],
    ["platform schema v8 additions", ensurePlatformSchemaV8],
    ["platform schema v9 additions", ensurePlatformSchemaV9],
    ["platform schema v10 additions", ensurePlatformSchemaV10],
    ["platform_password_resets table", ensurePasswordResetsTable],
  ];
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (err) {
      logger.error({ err }, `Failed to ensure ${label}`);
    }
  }
}

// Block the port until the schema is ready so no request can race the DDL.
await runStartupMigrations();

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
  // Idempotent - gated by a platform_meta flag, safe to call on every restart.
  backfillPlatformUsers().catch((err) => {
    logger.error({ err }, "Failed to backfill platform users (non-fatal)");
  });

  pruneExpiredSessions().catch((err) => {
    logger.error({ err }, "Failed to prune expired sessions on startup");
  });

  cleanupExpiredTokens().catch((err) => {
    logger.error({ err }, "Failed to clean up expired token rows on startup");
  });

  seedSupportFaq().catch((err) => {
    logger.error({ err }, "Failed to seed support FAQ (non-fatal)");
  });

  // Stripe: create the stripe schema, register the managed webhook and
  // backfill data. Fail-soft - the platform must boot even if Stripe is
  // temporarily unreachable (Beta accounts don't depend on it).
  initStripe().catch((err) => {
    logger.error({ err }, "Failed to initialise Stripe (non-fatal)");
  });

  // One-time data migration: move the 'patrick' demo account under the
  // 'aiodemo' (AIO Demonstration) agency so it can share the demo projects.
  // Safe to run repeatedly - it only fires when the parent is still 'admin'.
  db.update(platformAccountsTable)
    .set({ parent: "aiodemo" })
    .where(and(
      eq(platformAccountsTable.username, "patrick"),
      eq(platformAccountsTable.parent, "admin"),
    ))
    .catch((err) => {
      logger.warn({ err }, "Failed to reparent 'patrick' to 'aiodemo' (non-fatal)");
    });

  // One-time repair: 'bluhalo-1' (Abbe Wheeler) was orphaned during the
  // legacy localStorage migration - its parent link was empty, making it
  // invisible to the workspace owner. Restore it to the correct parent
  // 'bluhalo'. Safe to run repeatedly - the WHERE guard means it only
  // fires when the parent is still null.
  Promise.all([
    db.update(platformAccountsTable)
      .set({ parent: "bluhalo" })
      .where(and(
        eq(platformAccountsTable.username, "bluhalo-1"),
        isNull(platformAccountsTable.parent),
      )),
    db.update(platformCompaniesTable)
      .set({ parentSlug: "bluhalo" })
      .where(and(
        eq(platformCompaniesTable.slug, "bluhalo-1"),
        isNull(platformCompaniesTable.parentSlug),
      )),
  ]).catch((err) => {
    logger.warn({ err }, "Failed to repair orphaned 'bluhalo-1' account (non-fatal)");
  });

  // Startup orphan check: log any client-role accounts with no parent so
  // an operator can spot and fix them quickly. Visibility is hierarchy-based,
  // so a parentless client is invisible to every non-admin user.
  db.select({ username: platformAccountsTable.username })
    .from(platformAccountsTable)
    .where(and(
      eq(platformAccountsTable.role, "client"),
      isNull(platformAccountsTable.parent),
    ))
    .then((rows) => {
      if (rows.length > 0) {
        logger.warn(
          { orphans: rows.map((r) => r.username) },
          "platform: client accounts with no parent detected - they are invisible to non-admin users. Use the reparent endpoint to fix them.",
        );
      }
    })
    .catch((err) => {
      logger.warn({ err }, "Failed to check for orphaned client accounts (non-fatal)");
    });

  setInterval(() => {
    pruneExpiredSessions().catch((err) => {
      logger.error({ err }, "Failed to prune expired sessions (scheduled)");
    });
    cleanupExpiredTokens().catch((err) => {
      logger.error({ err }, "Failed to clean up expired token rows (scheduled)");
    });
  }, PRUNE_INTERVAL_MS).unref();

  // Hourly sweep: send a reminder email to invitees whose invite expires in ~24 h.
  const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  sendInviteReminders().catch((err) => {
    logger.error({ err }, "Failed to run invite reminder sweep on startup");
  });
  setInterval(() => {
    sendInviteReminders().catch((err) => {
      logger.error({ err }, "Failed to run invite reminder sweep (scheduled)");
    });
  }, REMINDER_INTERVAL_MS).unref();

  // Microsoft credentials are external configuration and can expire or be
  // rotated while this process remains online. Check once at startup and
  // periodically so a broken SSO provider is visible in server logs before a
  // user reports a failed sign-in.
  checkMicrosoftOAuthCredentials().catch((err) => {
    logger.error({ err }, "Microsoft OAuth credential health check crashed");
  });
  setInterval(() => {
    checkMicrosoftOAuthCredentials().catch((err) => {
      logger.error({ err }, "Microsoft OAuth credential health check crashed");
    });
  }, MICROSOFT_HEALTH_INTERVAL_MS).unref();
});

import app from "./app";
import { logger } from "./lib/logger";
import { features } from "./lib/features";
import { ensureDefaultAdmin, backfillPlatformUsers } from "./lib/platform-auth";
import { ensureAuditLocksTable } from "./lib/ensure-audit-locks-table";
import {
  ensureAuditRunClaimsTable,
  failExhaustedAuditRuns,
  reclaimRecoverableAuditRuns,
  releaseOwnedAuditRunLeases,
} from "./lib/audit-run-claims";
import { ensureMediaDiscoveryRunsTable } from "./lib/media-discovery-runs";
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
import { db, pool, platformAccountsTable, platformCompaniesTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { ensurePlatformSchemaV4 } from "./lib/ensure-platform-schema-v4";
import { ensurePlatformSchemaV5 } from "./lib/ensure-platform-schema-v5";
import { ensurePlatformSchemaV6 } from "./lib/ensure-platform-schema-v6";
import { ensurePlatformSchemaV7 } from "./lib/ensure-platform-schema-v7";
import { ensurePlatformSchemaV8 } from "./lib/ensure-platform-schema-v8";
import { initStripe } from "./lib/stripe-init";
import { sendInviteReminders } from "./lib/invite-reminders";
import { sendSubscriptionRenewalReminders } from "./lib/subscription-reminders";
import { checkMicrosoftOAuthCredentials } from "./lib/microsoft-oauth-health";
import { ensurePlatformSchemaV9 } from "./lib/ensure-platform-schema-v9";
import { ensurePlatformSchemaV10 } from "./lib/ensure-platform-schema-v10";
import { ensurePlatformSchemaV11 } from "./lib/ensure-platform-schema-v11";
import { ensurePlatformSchemaV12 } from "./lib/ensure-platform-schema-v12";
import { repairKnownWorkspaceNames } from "./lib/repair-known-workspace-names";
import { assertCanonicalDomainIsSafeForDeployment } from "./lib/app-url";
import { ensureInsightsSchema } from "./lib/ensure-insights-schema";
import { seedInsights } from "./lib/seed-insights";
import { ensureMediaSchema } from "./lib/ensure-media-schema";
import { ensureTokenUsageSequence } from "./lib/ensure-token-usage-sequence";
import { MEDIA_REVERIFICATION_INTERVAL_MS, runMediaSourceReverification } from "./lib/media-source-reverification";
import {
  markRuntimeReady,
  markRuntimeDraining,
  runRequiredPrerequisites,
  runTrackedJob,
  scheduleNonOverlappingJob,
  shutdownRuntime,
  type ScheduledJob,
} from "./lib/runtime-lifecycle";
import { resumeVisibilityAuditRun } from "./routes/llm-check";
import { resumeWebsiteAuditRun } from "./routes/diagnostic";

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MICROSOFT_HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const AUDIT_RECOVERY_INTERVAL_MS = 30_000;

async function recoverDurableAudits(): Promise<void> {
  await failExhaustedAuditRuns();
  const runs = await reclaimRecoverableAuditRuns(2);
  await Promise.all(runs.map((run) => {
    if (run.auditType === "visibility") return resumeVisibilityAuditRun(run);
    if (run.auditType === "website") return resumeWebsiteAuditRun(run);
    return Promise.resolve();
  }));
}

// ---------------------------------------------------------------------------
// Published database target guard
// ---------------------------------------------------------------------------
// bootstrap.ts binds DATABASE_URL to this project's main published
// database before this module (and @workspace/db) loads. Verify the explicit
// target here rather than relying on host/name substring heuristics.
// ---------------------------------------------------------------------------
const deploymentEnv = (
  process.env["DEPLOYMENT_ENV"] ??
  process.env["NODE_ENV"] ??
  ""
).toLowerCase().trim();

// Reject cross-environment canonical domains before accepting any traffic.
// This protects generated email links and OAuth callbacks even when deployment
// secrets have accidentally been copied between production and staging.
assertCanonicalDomainIsSafeForDeployment();

if (deploymentEnv === "staging" || deploymentEnv === "production") {
  const dbUrl = process.env["DATABASE_URL"] ?? "";
  const betaDbUrl = process.env["BETA_DATABASE_URL"]?.trim() ?? "";
  const mainDbUrl = process.env["PRODUCTION_DATABASE_URL"]?.trim() ?? "";

  if (!mainDbUrl || dbUrl !== mainDbUrl) {
    logger.error(
      "FATAL: Published DATABASE_URL is not bound to the verified main database. " +
        "Start the production bundle through bootstrap.ts and verify the main secret.",
    );
    process.exit(1);
  }

  if (betaDbUrl && dbUrl === betaDbUrl) {
    logger.error(
      "FATAL: Published main database target equals the beta database. " +
        "Correct the protected database secrets before publishing.",
    );
    process.exit(1);
  }

  logger.info("Published main database target confirmed");
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
// Each step is idempotent. Any failure aborts startup because handlers depend
// on all of these tables and columns being present.
async function runStartupMigrations(): Promise<void> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["audit_locks table", ensureAuditLocksTable],
    ["audit_runs table", ensureAuditRunClaimsTable],
    ["media_discovery_runs table", ensureMediaDiscoveryRunsTable],
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
    ["platform schema v11 additions", ensurePlatformSchemaV11],
    ["platform schema v12 additions", ensurePlatformSchemaV12],
    ["platform_password_resets table", ensurePasswordResetsTable],
    ["Insights editorial schema", ensureInsightsSchema],
    ["media contacts and recommendations schema", ensureMediaSchema],
    ["usage accounting ID counter readiness", ensureTokenUsageSequence],
  ];
  await runRequiredPrerequisites(steps);
}

// Block the port until the schema is ready so no request can race the DDL.
try {
  await runStartupMigrations();
} catch (err) {
  logger.fatal({ err }, "API startup aborted before listening");
  await pool.end().catch((closeErr) => {
    logger.error({ err: closeErr }, "Failed to close database pool after startup failure");
  });
  process.exitCode = 1;
  throw err;
}

const jobs: ScheduledJob[] = [];
const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const activeFlags = Object.entries(features)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  logger.info({ port, activeFeatureFlags: activeFlags }, "Server listening");
  markRuntimeReady();

  // Make sure the platform is never locked out: seed the default admin login if
  // no admin account exists yet.
  jobs.push(runTrackedJob("ensure default admin account", ensureDefaultAdmin));

  // Backfill platform_users rows for every existing platform_accounts row.
  // Idempotent - gated by a platform_meta flag, safe to call on every restart.
  jobs.push(runTrackedJob("backfill platform users", backfillPlatformUsers));
  jobs.push(runTrackedJob("repair known workspace names", repairKnownWorkspaceNames));
  jobs.push(runTrackedJob("seed support FAQ", seedSupportFaq));
  jobs.push(runTrackedJob("seed Insights stories", seedInsights));
  jobs.push(scheduleNonOverlappingJob(
    "durable audit recovery sweep",
    recoverDurableAudits,
    AUDIT_RECOVERY_INTERVAL_MS,
  ));
  jobs.push(scheduleNonOverlappingJob(
    "media source reverification sweep",
    runMediaSourceReverification,
    MEDIA_REVERIFICATION_INTERVAL_MS,
  ));

  // Stripe: create the stripe schema, register the managed webhook and
  // backfill data. Fail-soft - the platform must boot even if Stripe is
  // temporarily unreachable (Beta accounts don't depend on it).
  jobs.push(runTrackedJob("initialise Stripe", initStripe));

  // One-time data migration: move the 'patrick' demo account under the
  // 'aiodemo' (AIO Demonstration) agency so it can share the demo projects.
  // Safe to run repeatedly - it only fires when the parent is still 'admin'.
  jobs.push(runTrackedJob("repair patrick parent", () =>
    db.update(platformAccountsTable)
      .set({ parent: "aiodemo" })
      .where(and(
        eq(platformAccountsTable.username, "patrick"),
        eq(platformAccountsTable.parent, "admin"),
      )),
  ));

  // One-time repair: 'bluhalo-1' (Abbe Wheeler) was orphaned during the
  // legacy localStorage migration - its parent link was empty, making it
  // invisible to the workspace owner. Restore it to the correct parent
  // 'bluhalo'. Safe to run repeatedly - the WHERE guard means it only
  // fires when the parent is still null.
  jobs.push(runTrackedJob("repair orphaned bluhalo account", () => Promise.all([
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
  ])));

  // Startup orphan check: log any client-role accounts with no parent so
  // an operator can spot and fix them quickly. Visibility is hierarchy-based,
  // so a parentless client is invisible to every non-admin user.
  jobs.push(runTrackedJob("check orphaned client accounts", async () => {
    const rows = await db.select({ username: platformAccountsTable.username })
      .from(platformAccountsTable)
      .where(and(
        eq(platformAccountsTable.role, "client"),
        isNull(platformAccountsTable.parent),
      ));
    if (rows.length > 0) {
      logger.warn(
        { orphans: rows.map((r) => r.username) },
        "platform: client accounts with no parent detected - they are invisible to non-admin users. Use the reparent endpoint to fix them.",
      );
    }
  }));

  jobs.push(scheduleNonOverlappingJob("expired session and token cleanup", async () => {
    await pruneExpiredSessions();
    await cleanupExpiredTokens();
  }, PRUNE_INTERVAL_MS));

  // Hourly sweep: send a reminder email to invitees whose invite expires in ~24 h.
  const REMINDER_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  jobs.push(scheduleNonOverlappingJob(
    "invite reminder sweep",
    sendInviteReminders,
    REMINDER_INTERVAL_MS,
  ));

  // Renewal reminders are intentionally fail-soft: a provider or database
  // outage must not affect request handling, and the next hourly sweep retries
  // any claim whose email was not delivered.
  jobs.push(scheduleNonOverlappingJob(
    "subscription renewal reminder sweep",
    sendSubscriptionRenewalReminders,
    REMINDER_INTERVAL_MS,
  ));

  // Microsoft credentials are external configuration and can expire or be
  // rotated while this process remains online. Check once at startup and
  // periodically so a broken SSO provider is visible in server logs before a
  // user reports a failed sign-in.
  jobs.push(scheduleNonOverlappingJob(
    "Microsoft OAuth credential health check",
    checkMicrosoftOAuthCredentials,
    MICROSOFT_HEALTH_INTERVAL_MS,
  ));
});

const shutdownTimeoutMs = Number(process.env["SHUTDOWN_TIMEOUT_MS"] ?? 10_000);
let shutdownStarted = false;

async function handleShutdown(signal: NodeJS.Signals): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  markRuntimeDraining();
  logger.info({ signal }, "Shutdown started");
  try {
    await releaseOwnedAuditRunLeases();
    const result = await shutdownRuntime({
      server,
      jobs,
      closeResources: () => pool.end(),
      timeoutMs: shutdownTimeoutMs,
    });
    logger.info({ signal, result }, "Shutdown finished");
    process.exit(result === "drained" ? 0 : 1);
  } catch (err) {
    logger.error({ err, signal }, "Shutdown failed");
    server.closeAllConnections?.();
    process.exit(1);
  }
}

process.once("SIGTERM", () => void handleShutdown("SIGTERM"));
process.once("SIGINT", () => void handleShutdown("SIGINT"));

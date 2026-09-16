#!/usr/bin/env tsx
/**
 * Apply the narrowly scoped Task 290 Insights CMS content migration.
 *
 * The command must be explicit:
 *   pnpm --filter @workspace/api-server run migrate:insights:task-290 -- --dry-run
 *   pnpm --filter @workspace/api-server run migrate:insights:task-290 -- --apply
 *
 * `--dry-run` only reads published rows. `--apply` is the only mode that
 * updates rows, and production additionally requires
 * CMS_MIGRATION_ALLOW_PRODUCTION=1.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, insightArticlesTable, type InsightArticleRow } from "@workspace/db";
import {
  planInsightMigration,
  TASK_290_CHANGES,
  TASK_290_MIGRATION_ID,
  type InsightMigrationUpdate,
} from "../src/lib/insights-content-migration";

type Mode = "dry-run" | "apply";

interface Options {
  mode: Mode;
  allowProduction: boolean;
}

interface MigrationReport {
  migrationId: string;
  mode: Mode;
  eligibleRows: number;
  rowsWithUpdates: number;
  matchedChanges: number;
  skippedChanges: number;
  updates: Array<{
    articleId: string;
    fields: string[];
  }>;
}

const TARGET_IDS = [...new Set(TASK_290_CHANGES.map((change) => change.articleId))];

function usage(): string {
  return [
    "Usage:",
    "  pnpm --filter @workspace/api-server run migrate:insights:task-290 -- --dry-run",
    "  pnpm --filter @workspace/api-server run migrate:insights:task-290 -- --apply",
    "",
    "Options:",
    "  --dry-run             Inspect matching published rows without writing.",
    "  --apply               Apply exact old-to-new field changes.",
    "  --allow-production    Required with --apply in production.",
  ].join("\n");
}

export function parseOptions(argv: string[]): Options {
  let mode: Mode | undefined;
  let allowProduction = false;
  for (const argument of argv) {
    if (argument === "--") {
      // pnpm/npm commonly leaves the command separator in argv.
      continue;
    } else if (argument === "--dry-run") {
      if (mode) throw new Error("Choose exactly one of --dry-run or --apply.\n\n" + usage());
      mode = "dry-run";
    } else if (argument === "--apply") {
      if (mode) throw new Error("Choose exactly one of --dry-run or --apply.\n\n" + usage());
      mode = "apply";
    } else if (argument === "--allow-production") {
      allowProduction = true;
    } else if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}\n\n${usage()}`);
    }
  }
  if (!mode) {
    throw new Error("An explicit --dry-run or --apply mode is required.\n\n" + usage());
  }
  return { mode, allowProduction };
}

function assertApplyEnvironment(options: Options): void {
  if (options.mode !== "apply") return;
  const environment = (
    process.env["DEPLOYMENT_ENV"] ??
    process.env["NODE_ENV"] ??
    ""
  ).trim().toLowerCase();
  if (
    (environment === "production" || environment === "prod") &&
    !options.allowProduction &&
    process.env["CMS_MIGRATION_ALLOW_PRODUCTION"] !== "1"
  ) {
    throw new Error(
      "Refusing Task 290 CMS writes in production without --allow-production " +
      "or CMS_MIGRATION_ALLOW_PRODUCTION=1.",
    );
  }
}

function changedFields(update: InsightMigrationUpdate): string[] {
  return Object.keys(update).sort();
}

function reportForRows(rows: InsightArticleRow[], mode: Mode): MigrationReport {
  const reports = rows.map(planInsightMigration);
  const updates = reports
    .filter((report) => Object.keys(report.updates).length > 0)
    .map((report) => ({
      articleId: report.articleId,
      fields: changedFields(report.updates),
    }));
  return {
    migrationId: TASK_290_MIGRATION_ID,
    mode,
    eligibleRows: reports.filter((report) => report.eligible).length,
    rowsWithUpdates: updates.length,
    matchedChanges: reports.reduce((total, report) => total + report.matchedChanges, 0),
    skippedChanges: reports.reduce((total, report) => total + report.skippedChanges, 0),
    updates,
  };
}

async function readRows(
  database: typeof db,
  lockRows = false,
): Promise<InsightArticleRow[]> {
  const query = database
    .select()
    .from(insightArticlesTable)
    .where(and(
      eq(insightArticlesTable.status, "published"),
      inArray(insightArticlesTable.id, TARGET_IDS),
    ));
  return (lockRows ? query.for("update") : query) as Promise<InsightArticleRow[]>;
}

async function applyRows(database: typeof db, rows: InsightArticleRow[]): Promise<void> {
  for (const row of rows) {
    const update = planInsightMigration(row).updates;
    if (Object.keys(update).length === 0) continue;
    await database
      .update(insightArticlesTable)
      .set({ ...update, updatedAt: new Date() })
      .where(and(
        eq(insightArticlesTable.id, row.id),
        eq(insightArticlesTable.status, "published"),
      ));
  }
}

export async function runTask290Migration(options: Options): Promise<MigrationReport> {
  assertApplyEnvironment(options);
  if (options.mode === "dry-run") {
    const rows = await readRows(db);
    return reportForRows(rows, options.mode);
  }

  return db.transaction(async (transaction) => {
    await transaction.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${TASK_290_MIGRATION_ID}))
    `);
    // Hold row locks from the guarded read through each update. This
    // serializes the migration with CMS edits that use normal PostgreSQL row
    // locks, so an editor cannot change a row between our read and write.
    const rows = await readRows(transaction as unknown as typeof db, true);
    const report = reportForRows(rows, options.mode);
    await applyRows(transaction as unknown as typeof db, rows);
    return report;
  });
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const report = await runTask290Migration(options);
  console.log(JSON.stringify(report, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

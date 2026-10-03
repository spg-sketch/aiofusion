import { eq, like } from "drizzle-orm";
import { howtoMigrationLedgerTable } from "@workspace/db";

// A separate explicit editorial operation, never part of seed/startup migration.
export const HOWTO_REVIEW_BATCH = "howto-editorial-review-v1";
export const HOWTO_REVIEW_PREFIX = `${HOWTO_REVIEW_BATCH}:`;

const identity = (value: string) => {
  const url = new URL(value);
  return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
};

export function assertDraftBatchTarget(target: unknown, env = process.env): void {
  if (target !== "development" && target !== "staging") {
    throw new Error("An explicit development or staging target is required.");
  }
  const actual = env.DEPLOYMENT_ENV ||
    (env.NODE_ENV === "development" && !env.REPLIT_DEPLOYMENT ? "development" : "");
  if (actual !== target || !env.DATABASE_URL) {
    throw new Error("Draft batch target does not match the running nonproduction service.");
  }
  const database = identity(env.DATABASE_URL);
  if (env.PRODUCTION_DATABASE_URL && database === identity(env.PRODUCTION_DATABASE_URL)) {
    throw new Error("Draft batches cannot write to the production database.");
  }
  if (target === "development") {
    for (const key of ["BETA_DATABASE_URL", "STAGING_TIER_VERIFICATION_DATABASE_URL"]) {
      if (env[key] && database === identity(env[key]!)) {
        throw new Error("Development draft batches cannot use a protected deployed database.");
      }
    }
  }
}

export async function completedDraftBatchIds(database: any): Promise<string[]> {
  const rows = await database.select({ id: howtoMigrationLedgerTable.id })
    .from(howtoMigrationLedgerTable).where(like(howtoMigrationLedgerTable.id, `${HOWTO_REVIEW_PREFIX}%`));
  return rows.map((row: { id: string }) => row.id.slice(HOWTO_REVIEW_PREFIX.length)).sort();
}

export async function draftBatchCompleted(tx: any, id: string): Promise<boolean> {
  const [row] = await tx.select({ id: howtoMigrationLedgerTable.id })
    .from(howtoMigrationLedgerTable).where(eq(howtoMigrationLedgerTable.id, `${HOWTO_REVIEW_PREFIX}${id}`)).limit(1);
  return Boolean(row);
}

export async function recordDraftBatchCompleted(tx: any, id: string): Promise<void> {
  await tx.insert(howtoMigrationLedgerTable).values({ id: `${HOWTO_REVIEW_PREFIX}${id}` });
}
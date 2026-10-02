import { eq, sql } from "drizzle-orm";
import {
  howtoEntriesTable,
  howtoMigrationLedgerTable,
} from "@workspace/db";
import { HOWTO_INITIAL_SEEDS } from "./howto-seeds";

export const HOWTO_SEED_MIGRATION_ID = "howto-initial-guides-v1";

function hasMissingRelationCode(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const nested = current as { code?: unknown; cause?: unknown; originalError?: unknown };
    if (nested.code === "42P01") return true;
    current = nested.cause ?? nested.originalError;
  }
  return false;
}

export async function applyHowtoSeedMigration(database: any): Promise<{ applied: boolean; seeded: number }> {
  try {
    return await database.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${HOWTO_SEED_MIGRATION_ID}))`);
      const [ledger] = await tx.select().from(howtoMigrationLedgerTable)
        .where(eq(howtoMigrationLedgerTable.id, HOWTO_SEED_MIGRATION_ID)).limit(1);
      if (ledger) return { applied: false, seeded: 0 };
      const publishedAt = new Date();
      for (const seed of HOWTO_INITIAL_SEEDS) {
        await tx.insert(howtoEntriesTable).values({
          ...seed,
          publishedAt: seed.status === "published" ? publishedAt : null,
        }).onConflictDoNothing({
          target: howtoEntriesTable.id,
        });
      }
      await tx.insert(howtoMigrationLedgerTable).values({ id: HOWTO_SEED_MIGRATION_ID })
        .onConflictDoNothing({ target: howtoMigrationLedgerTable.id });
      return { applied: true, seeded: HOWTO_INITIAL_SEEDS.length };
    });
  } catch (error) {
    if (hasMissingRelationCode(error)) {
      throw new Error(
        "How-to tables are missing. Run `pnpm --filter @workspace/db run push` in development, " +
        "or publish so Replit applies the Drizzle schema, then rerun the How-to data migration.",
      );
    }
    throw error;
  }
}
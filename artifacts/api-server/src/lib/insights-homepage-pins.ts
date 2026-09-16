import { eq, sql } from "drizzle-orm";
import { db, platformMetaTable } from "@workspace/db";

export const HOMEPAGE_PINNED_INSIGHTS_KEY = "insights:homepage:pinned";
export const MAX_HOMEPAGE_PINNED_INSIGHTS = 3;

export class HomepagePinLimitError extends Error {
  constructor() {
    super(
      "The homepage can feature up to 3 published stories. Unfeature another story first.",
    );
    this.name = "HomepagePinLimitError";
  }
}

/**
 * Parse the singleton value defensively. Older or manually edited metadata
 * should never make the public Insights endpoint fail, and duplicate IDs
 * should not consume homepage slots.
 */
export function parseHomepagePinnedIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(
      parsed.filter((item): item is string => typeof item === "string" && item.length > 0),
    )].slice(0, MAX_HOMEPAGE_PINNED_INSIGHTS);
  } catch {
    return [];
  }
}

export function addOrRemoveHomepagePin(
  pinnedIds: string[],
  articleId: string,
  shouldPin: boolean,
): string[] {
  const withoutArticle = pinnedIds.filter((id) => id !== articleId);
  if (!shouldPin) return withoutArticle;
  if (pinnedIds.includes(articleId)) return pinnedIds;
  if (withoutArticle.length >= MAX_HOMEPAGE_PINNED_INSIGHTS) {
    throw new HomepagePinLimitError();
  }
  return [...withoutArticle, articleId];
}

type QueryExecutor = Pick<typeof db, "select" | "insert" | "execute">;

export async function lockHomepagePins(executor: Pick<typeof db, "execute">): Promise<void> {
  // PostgreSQL advisory transaction locks work across all API instances and do
  // not require adding a lock column/table. PGlite does not implement this
  // PostgreSQL function, so the route tests exercise the same transaction
  // without the production-only lock.
  if (process.env.NODE_ENV !== "test") {
    await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${HOMEPAGE_PINNED_INSIGHTS_KEY}))`);
  }
}

export async function readHomepagePinnedIds(executor: QueryExecutor = db): Promise<string[]> {
  const [row] = await executor
    .select({ value: platformMetaTable.value })
    .from(platformMetaTable)
    .where(eq(platformMetaTable.key, HOMEPAGE_PINNED_INSIGHTS_KEY))
    .limit(1);
  return parseHomepagePinnedIds(row?.value);
}

export async function writeHomepagePinnedIds(
  executor: Pick<typeof db, "insert">,
  pinnedIds: string[],
): Promise<void> {
  await executor
    .insert(platformMetaTable)
    .values({
      key: HOMEPAGE_PINNED_INSIGHTS_KEY,
      value: JSON.stringify([...new Set(pinnedIds)].slice(0, MAX_HOMEPAGE_PINNED_INSIGHTS)),
    })
    .onConflictDoUpdate({
      target: platformMetaTable.key,
      set: { value: JSON.stringify([...new Set(pinnedIds)].slice(0, MAX_HOMEPAGE_PINNED_INSIGHTS)) },
    });
}
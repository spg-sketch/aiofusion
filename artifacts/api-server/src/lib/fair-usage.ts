import { db, tokenUsageTable, platformMetaTable } from "@workspace/db";
import { and, gte, lt, sql, eq, inArray } from "drizzle-orm";
import { logger } from "./logger";
import { sendSpikeAlert, sendQuotaBreachAlert } from "./notify-email";

export const DEFAULT_FAIR_USAGE_LIMIT = 50;
export const SPIKE_RATIO_THRESHOLD = 3;

// Default monthly GBP cap per account. Can be overridden per-account by an
// admin via platform_meta key `spendLimit:monthly:gbp:{slug}`.
// Set to null to disable the cap system-wide (not recommended).
export const DEFAULT_MONTHLY_SPEND_LIMIT_GBP = 50;

// Cooldown: only send one spike email per account per hour (in-process)
const spikeCooldown = new Map<string, number>();
const SPIKE_COOLDOWN_MS = 60 * 60 * 1000;

// Cooldown: only send one quota-breach email per account per hour (in-process)
const quotaCooldown = new Map<string, number>();

// Cooldown: only send one spend-limit email per account per calendar month (in-process)
const spendLimitCooldown = new Map<string, number>();
const SPEND_LIMIT_COOLDOWN_MS = 60 * 60 * 1000; // at most once per hour per account

// Operations that count toward the per-project fair usage quota (50/project/month).
// Audits (llm-check%) have their own 21-day lock and are NOT counted here.
// LLM queries (section 1.6, llm-queries) also have a 21-day lock and are excluded.
// Coverage-search is content-AI and counts toward the 50.
const OPERATION_FILTER = sql`(
  ${tokenUsageTable.operation} LIKE 'content-%'
)`;

async function getFairUsageMultiplier(accountId: string): Promise<number> {
  try {
    const key = `fairUsage:multiplier:${accountId.toLowerCase()}`;
    const rows = await db
      .select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, key))
      .limit(1);
    if (rows.length > 0) {
      const v = parseFloat(rows[0].value);
      if (isFinite(v) && v > 0) return v;
    }
  } catch {
    // Non-fatal - fall through to default
  }
  return 1;
}

// Returns the per-account monthly GBP spend limit. Returns null if the account
// has no limit (i.e. it has been explicitly removed by an admin).
export async function getMonthlySpendLimitGbp(accountId: string): Promise<number | null> {
  try {
    const key = `spendLimit:monthly:gbp:${accountId.toLowerCase()}`;
    const rows = await db
      .select({ value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(eq(platformMetaTable.key, key))
      .limit(1);
    if (rows.length > 0) {
      const v = parseFloat(rows[0].value);
      // "0" stored explicitly means "no limit" for this account
      if (rows[0].value === "0") return null;
      if (isFinite(v) && v > 0) return v;
    }
  } catch {
    // Non-fatal - fall through to default
  }
  return DEFAULT_MONTHLY_SPEND_LIMIT_GBP;
}

export async function checkFairUsage(accountId: string, projectId?: string | null): Promise<{
  allowed: boolean;
  callCount: number;
  limit: number;
}> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // When a projectId is supplied enforce the 50-action limit per project;
    // fall back to per-account when no projectId is available (e.g. legacy calls).
    const baseConditions = [
      eq(tokenUsageTable.accountId, accountId),
      gte(tokenUsageTable.createdAt, thirtyDaysAgo),
      OPERATION_FILTER,
    ];
    const whereClause = projectId
      ? and(...baseConditions, eq(tokenUsageTable.projectId, projectId))
      : and(...baseConditions);
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tokenUsageTable)
      .where(whereClause);

    const callCount = result[0]?.count ?? 0;
    const multiplier = await getFairUsageMultiplier(accountId);
    const limit = Math.round(DEFAULT_FAIR_USAGE_LIMIT * multiplier);
    const allowed = callCount < limit;

    if (!allowed) {
      logger.warn(
        { accountId, projectId, callCount, limit, multiplier },
        "fair-usage: project over 30-day action limit - returning 429",
      );
      // Send breach email at most once per hour per account
      const lastSent = quotaCooldown.get(accountId) ?? 0;
      if (Date.now() - lastSent >= SPIKE_COOLDOWN_MS) {
        quotaCooldown.set(accountId, Date.now());
        void sendQuotaBreachAlert({ slug: accountId, callCount, limit });
      }
    }

    return { allowed, callCount, limit };
  } catch (err) {
    logger.warn({ err, accountId, projectId }, "fair-usage: checkFairUsage DB error - allowing through");
    return { allowed: true, callCount: 0, limit: DEFAULT_FAIR_USAGE_LIMIT };
  }
}

// Checks whether the account has exceeded its monthly GBP spending limit for
// the current calendar month. Returns the spend and limit for display purposes.
// When limitGbp is null the account has no cap and is always allowed.
export async function checkMonthlySpendLimit(accountId: string): Promise<{
  allowed: boolean;
  spentGbp: number;
  limitGbp: number | null;
}> {
  try {
    const limitGbp = await getMonthlySpendLimitGbp(accountId);
    if (limitGbp === null) {
      // Explicitly unlimited - skip the DB query
      return { allowed: true, spentGbp: 0, limitGbp: null };
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

    const result = await db
      .select({
        spent: sql<string>`coalesce(sum(${tokenUsageTable.costGbpEstimate}::numeric), 0)::text`,
      })
      .from(tokenUsageTable)
      .where(
        and(
          eq(tokenUsageTable.accountId, accountId),
          gte(tokenUsageTable.createdAt, monthStart),
        ),
      );

    const spentGbp = parseFloat(result[0]?.spent ?? "0");
    const allowed = spentGbp < limitGbp;

    if (!allowed) {
      logger.warn(
        { accountId, spentGbp: spentGbp.toFixed(4), limitGbp },
        "fair-usage: account over monthly GBP spend limit - returning 429",
      );
      const lastSent = spendLimitCooldown.get(accountId) ?? 0;
      if (Date.now() - lastSent >= SPEND_LIMIT_COOLDOWN_MS) {
        spendLimitCooldown.set(accountId, Date.now());
        void sendQuotaBreachAlert({
          slug: accountId,
          callCount: Math.round(spentGbp * 100),
          limit: Math.round(limitGbp * 100),
        });
      }
    }

    return { allowed, spentGbp, limitGbp };
  } catch (err) {
    logger.warn({ err, accountId }, "fair-usage: checkMonthlySpendLimit DB error - allowing through");
    return { allowed: true, spentGbp: 0, limitGbp: DEFAULT_MONTHLY_SPEND_LIMIT_GBP };
  }
}

export async function detectAndLogSpike(accountId: string): Promise<void> {
  const lastSent = spikeCooldown.get(accountId) ?? 0;
  if (Date.now() - lastSent < SPIKE_COOLDOWN_MS) return;

  try {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const [last7Row, prior7Row] = await Promise.all([
      db
        .select({ cost: sql<string>`coalesce(sum(${tokenUsageTable.costGbpEstimate}::numeric), 0)::text` })
        .from(tokenUsageTable)
        .where(
          and(
            eq(tokenUsageTable.accountId, accountId),
            gte(tokenUsageTable.createdAt, sevenDaysAgo),
            OPERATION_FILTER,
          ),
        ),
      db
        .select({ cost: sql<string>`coalesce(sum(${tokenUsageTable.costGbpEstimate}::numeric), 0)::text` })
        .from(tokenUsageTable)
        .where(
          and(
            eq(tokenUsageTable.accountId, accountId),
            gte(tokenUsageTable.createdAt, fourteenDaysAgo),
            lt(tokenUsageTable.createdAt, sevenDaysAgo),
            OPERATION_FILTER,
          ),
        ),
    ]);

    const last7Cost = parseFloat(last7Row[0]?.cost ?? "0");
    const prior7Cost = parseFloat(prior7Row[0]?.cost ?? "0");

    // Need at least £0.01 spend in the last 7 days and a meaningful prior baseline
    if (prior7Cost < 0.001 || last7Cost < 0.01) return;

    const ratio = last7Cost / prior7Cost;
    if (ratio >= SPIKE_RATIO_THRESHOLD) {
      logger.warn(
        { accountId, last7Cost: last7Cost.toFixed(4), prior7Cost: prior7Cost.toFixed(4), ratio: ratio.toFixed(2) },
        "fair-usage: spend spike detected",
      );
      spikeCooldown.set(accountId, Date.now());
      void sendSpikeAlert({ slug: accountId, last7Cost, prior7Cost, ratio });
    }
  } catch (err) {
    logger.warn({ err, accountId }, "fair-usage: detectAndLogSpike DB error (non-fatal)");
  }
}

export interface AccountSpikeInfo {
  last7Cost: number;
  prior7Cost: number;
  ratio: number;
  flagged: boolean;
}

export async function computeSpikeFlagsForAccounts(
  slugs: string[],
): Promise<Record<string, AccountSpikeInfo>> {
  if (slugs.length === 0) return {};
  try {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const [last7Rows, prior7Rows] = await Promise.all([
      db
        .select({
          accountId: tokenUsageTable.accountId,
          cost: sql<string>`coalesce(sum(${tokenUsageTable.costGbpEstimate}::numeric), 0)::text`,
        })
        .from(tokenUsageTable)
        .where(
          and(
            gte(tokenUsageTable.createdAt, sevenDaysAgo),
            OPERATION_FILTER,
          ),
        )
        .groupBy(tokenUsageTable.accountId),
      db
        .select({
          accountId: tokenUsageTable.accountId,
          cost: sql<string>`coalesce(sum(${tokenUsageTable.costGbpEstimate}::numeric), 0)::text`,
        })
        .from(tokenUsageTable)
        .where(
          and(
            gte(tokenUsageTable.createdAt, fourteenDaysAgo),
            lt(tokenUsageTable.createdAt, sevenDaysAgo),
            OPERATION_FILTER,
          ),
        )
        .groupBy(tokenUsageTable.accountId),
    ]);

    const last7Map = new Map(last7Rows.map((r) => [r.accountId, parseFloat(r.cost ?? "0")]));
    const prior7Map = new Map(prior7Rows.map((r) => [r.accountId, parseFloat(r.cost ?? "0")]));

    const result: Record<string, AccountSpikeInfo> = {};
    const allAccounts = new Set([...last7Map.keys(), ...prior7Map.keys()]);
    for (const slug of allAccounts) {
      const last7Cost = last7Map.get(slug) ?? 0;
      const prior7Cost = prior7Map.get(slug) ?? 0;
      const ratio = prior7Cost > 0.001 ? last7Cost / prior7Cost : 0;
      result[slug] = {
        last7Cost,
        prior7Cost,
        ratio,
        flagged: prior7Cost > 0.001 && last7Cost >= 0.01 && ratio >= SPIKE_RATIO_THRESHOLD,
      };
    }
    return result;
  } catch (err) {
    logger.warn({ err }, "fair-usage: computeSpikeFlagsForAccounts DB error (non-fatal)");
    return {};
  }
}

export async function getThirtyDayCostByAccount(): Promise<Record<string, number>> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        accountId: tokenUsageTable.accountId,
        cost: sql<string>`round(sum(${tokenUsageTable.costGbpEstimate}::numeric), 6)::text`,
      })
      .from(tokenUsageTable)
      .where(gte(tokenUsageTable.createdAt, thirtyDaysAgo))
      .groupBy(tokenUsageTable.accountId);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.accountId] = parseFloat(row.cost ?? "0");
    }
    return result;
  } catch (err) {
    logger.warn({ err }, "fair-usage: getThirtyDayCostByAccount DB error (non-fatal)");
    return {};
  }
}

// Returns the current calendar-month GBP spend per account (all operations,
// not just those in OPERATION_FILTER - this is for billing visibility).
export async function getCurrentMonthSpendByAccount(): Promise<Record<string, number>> {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const rows = await db
      .select({
        accountId: tokenUsageTable.accountId,
        cost: sql<string>`round(sum(${tokenUsageTable.costGbpEstimate}::numeric), 6)::text`,
      })
      .from(tokenUsageTable)
      .where(gte(tokenUsageTable.createdAt, monthStart))
      .groupBy(tokenUsageTable.accountId);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.accountId] = parseFloat(row.cost ?? "0");
    }
    return result;
  } catch (err) {
    logger.warn({ err }, "fair-usage: getCurrentMonthSpendByAccount DB error (non-fatal)");
    return {};
  }
}

// Batch-reads per-account monthly GBP spend limits from platform_meta.
// Accounts not in the table get the system default; accounts with value "0"
// get null (no limit).
export async function getSpendLimitsByAccount(
  slugs: string[],
): Promise<Record<string, number | null>> {
  if (slugs.length === 0) return {};
  try {
    const keys = slugs.map((s) => `spendLimit:monthly:gbp:${s.toLowerCase()}`);
    const rows = await db
      .select({ key: platformMetaTable.key, value: platformMetaTable.value })
      .from(platformMetaTable)
      .where(inArray(platformMetaTable.key, keys));

    const bySlug: Record<string, number | null> = {};
    for (const row of rows) {
      const slug = row.key.replace("spendLimit:monthly:gbp:", "");
      bySlug[slug] = row.value === "0" ? null : parseFloat(row.value);
    }

    const result: Record<string, number | null> = {};
    for (const slug of slugs) {
      result[slug] = slug in bySlug ? bySlug[slug] : DEFAULT_MONTHLY_SPEND_LIMIT_GBP;
    }
    return result;
  } catch (err) {
    logger.warn({ err }, "fair-usage: getSpendLimitsByAccount DB error (non-fatal)");
    return Object.fromEntries(slugs.map((s) => [s, DEFAULT_MONTHLY_SPEND_LIMIT_GBP]));
  }
}

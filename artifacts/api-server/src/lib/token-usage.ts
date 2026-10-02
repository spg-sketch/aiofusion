import { db, tokenUsageTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { logger } from "./logger";

// GBP cost per 1M tokens. USD/GBP at ~1.27.
// Claude Sonnet pricing confirmed from Anthropic; GPT-5 is estimated - update
// once Replit publishes the exact rate.
const COST_PER_M: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 2.37, output: 11.81 },
  "claude-sonnet-4-6": { input: 2.37, output: 11.81 },
  "gpt-5": { input: 7.87, output: 31.50 },
  // OpenAI published USD price: $0.75 / $4.50 per 1M tokens, converted at
  // an approximate 1.27 USD/GBP. This is an estimated GBP cost, not a billed rate.
  "gpt-5.4-mini": { input: 0.59, output: 3.54 },
};

export function estimateCostGbp(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_PER_M[model] ?? { input: 5.0, output: 20.0 };
  return (inputTokens / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output;
}

// Conservative reservation envelope for a journalist-coverage Responses call:
// 10k prompt tokens, 3k output tokens, and ten web-search calls reserved.
// The model-token prices above use the existing estimated USD/GBP conversion.
// The £0.02 per web-search call is a deliberately conservative internal
// allowance carried over from media discovery, not a guaranteed provider tariff.
// The current SDK/API does not expose a hard web-search-call cap, so this is a
// conservative reservation envelope, not a claim that the provider is capped.
// Successful responses replace the envelope with reported tokens and tool
// calls; failed/unknown responses retain the reservation instead.
export const JOURNALIST_COVERAGE_RESERVED_INPUT_TOKENS = 10_000;
export const JOURNALIST_COVERAGE_RESERVED_OUTPUT_TOKENS = 3_000;
export const JOURNALIST_COVERAGE_RESERVED_WEB_SEARCH_CALLS = 10;
export const CONSERVATIVE_WEB_SEARCH_COST_GBP = 0.02;
export const JOURNALIST_COVERAGE_CALL_RESERVE_GBP =
  estimateCostGbp(
    "gpt-5.4-mini",
    JOURNALIST_COVERAGE_RESERVED_INPUT_TOKENS,
    JOURNALIST_COVERAGE_RESERVED_OUTPUT_TOKENS,
  ) + JOURNALIST_COVERAGE_RESERVED_WEB_SEARCH_CALLS * CONSERVATIVE_WEB_SEARCH_COST_GBP;

export class MonthlySpendCapReservationError extends Error {
  constructor() {
    super("Monthly spending limit reached.");
    this.name = "MonthlySpendCapReservationError";
  }
}

export class CoverageAccountingError extends Error {
  constructor(cause: unknown) {
    super("Coverage usage accounting could not be confirmed.", { cause });
    this.name = "CoverageAccountingError";
  }
}

/** Keep SQL, bound parameters, detail text and customer identifiers out of logs. */
export function safeCoverageAccountingDiagnostic(error: unknown): {
  code?: string; table?: string; column?: string; constraint?: string;
} {
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    const value = current as Record<string, unknown>;
    if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code)) {
      const safeIdentifier = (field: unknown) => typeof field === "string" && /^[a-zA-Z0-9_]{1,100}$/.test(field) ? field : undefined;
      return { code: value.code, table: safeIdentifier(value.table), column: safeIdentifier(value.column), constraint: safeIdentifier(value.constraint) };
    }
    current = value.cause;
  }
  return {};
}

const usageReservationQueues = new Map<string, Promise<void>>();

async function withUsageReservationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = usageReservationQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  usageReservationQueues.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (usageReservationQueues.get(key) === current) usageReservationQueues.delete(key);
  }
}

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function reserveJournalistCoverageUsage(input: {
  accountId: string;
  projectId?: string | null;
  limitGbp: number | null;
}): Promise<number> {
  const [reservationId] = await reserveJournalistCoverageUsageBatch({ ...input, callCount: 1 });
  if (reservationId === undefined) throw new Error("Could not persist journalist coverage usage reservation.");
  return reservationId;
}

export async function reserveJournalistCoverageUsageBatch(input: {
  accountId: string;
  projectId?: string | null;
  limitGbp: number | null;
  callCount: number;
}): Promise<number[]> {
  if (!Number.isInteger(input.callCount) || input.callCount < 0 || input.callCount > 5) {
    throw new Error("Invalid journalist coverage reservation batch size.");
  }
  if (input.callCount === 0) return [];
  const reserveGbp = JOURNALIST_COVERAGE_CALL_RESERVE_GBP;
  const batchReserveGbp = reserveGbp * input.callCount;
  const monthStart = monthStartUtc();
  const lockKey = `${input.accountId.toLowerCase()}:${monthStart.toISOString().slice(0, 7)}`;
  return withUsageReservationLock(lockKey, () => db.transaction(async (tx) => {
    // The in-process queue handles tests and same-process callers. PostgreSQL's
    // advisory lock extends the account/month reservation guarantee across
    // server workers.
    if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage-reservation:${lockKey}`}))`);
    }
    const [usage] = await tx.select({
      spent: sql<string>`coalesce(sum(${tokenUsageTable.costGbpEstimate}::numeric), 0)::text`,
    }).from(tokenUsageTable).where(and(
      eq(tokenUsageTable.accountId, input.accountId),
      gte(tokenUsageTable.createdAt, monthStart),
    ));
    const spentGbp = Number(usage?.spent ?? 0);
    if (input.limitGbp !== null && spentGbp + batchReserveGbp > input.limitGbp) {
      throw new MonthlySpendCapReservationError();
    }
    const reservationIds: number[] = [];
    for (let index = 0; index < input.callCount; index += 1) {
      const [reservation] = await tx.insert(tokenUsageTable).values({
        accountId: input.accountId,
        operation: "media-recommendations-enrich",
        model: "gpt-5.4-mini",
        inputTokens: 0,
        outputTokens: 0,
        costGbpEstimate: reserveGbp.toFixed(6),
        projectId: input.projectId ?? null,
      }).returning({ id: tokenUsageTable.id });
      if (!reservation) throw new Error("Could not persist journalist coverage usage reservation.");
      reservationIds.push(reservation.id);
    }
    return reservationIds;
  })).catch((cause: unknown) => {
    if (cause instanceof MonthlySpendCapReservationError) throw cause;
    throw new CoverageAccountingError(cause);
  });
}

export async function releaseJournalistCoverageUsage(input: {
  reservationId: number;
  accountId: string;
}): Promise<void> {
  try {
  const [released] = await db.delete(tokenUsageTable).where(and(
    eq(tokenUsageTable.id, input.reservationId),
    eq(tokenUsageTable.accountId, input.accountId),
    eq(tokenUsageTable.operation, "media-recommendations-enrich"),
  )).returning({ id: tokenUsageTable.id });
  if (!released) throw new Error("Could not release unused journalist coverage usage reservation.");
  } catch (cause) {
    throw new CoverageAccountingError(cause);
  }
}

export async function settleJournalistCoverageUsage(input: {
  reservationId: number;
  accountId: string;
  projectId?: string | null;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
}): Promise<void> {
  try {
  const inputTokens = Math.max(0, Math.floor(input.inputTokens));
  const outputTokens = Math.max(0, Math.floor(input.outputTokens));
  const webSearchCalls = Math.max(0, Math.floor(input.webSearchCalls));
  const costGbp = estimateCostGbp("gpt-5.4-mini", inputTokens, outputTokens)
    + webSearchCalls * CONSERVATIVE_WEB_SEARCH_COST_GBP;
  const [settled] = await db.update(tokenUsageTable).set({
    inputTokens,
    outputTokens,
    costGbpEstimate: costGbp.toFixed(6),
  }).where(and(
    eq(tokenUsageTable.id, input.reservationId),
    eq(tokenUsageTable.accountId, input.accountId),
    eq(tokenUsageTable.operation, "media-recommendations-enrich"),
  )).returning({ id: tokenUsageTable.id });
  if (!settled) throw new Error("Could not settle journalist coverage usage reservation.");
  if (costGbp > JOURNALIST_COVERAGE_CALL_RESERVE_GBP) {
    logger.error({
      accountId: input.accountId,
      projectId: input.projectId,
      reservationId: input.reservationId,
      costGbp,
      reservedGbp: JOURNALIST_COVERAGE_CALL_RESERVE_GBP,
    }, "Journalist coverage usage exceeded its conservative reservation");
  }
  } catch (cause) {
    throw new CoverageAccountingError(cause);
  }
}

export async function logTokenUsage(
  accountId: string,
  operation: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  projectId?: string | null,
  additionalCostGbp = 0,
): Promise<void> {
  try {
    const costGbpEstimate = estimateCostGbp(model, inputTokens, outputTokens) + Math.max(0, additionalCostGbp);
    await db.insert(tokenUsageTable).values({
      accountId,
      operation,
      model,
      inputTokens,
      outputTokens,
      costGbpEstimate: costGbpEstimate.toFixed(6),
      projectId: projectId ?? null,
    });
  } catch (err) {
    logger.warn(
      { err, accountId, operation },
      "logTokenUsage: failed to write token record (non-fatal)",
    );
  }
}

import { db, tokenUsageTable } from "@workspace/db";
import { logger } from "./logger";

// GBP cost per 1M tokens. USD/GBP at ~1.27.
// Claude Sonnet pricing confirmed from Anthropic; GPT-5 is estimated - update
// once Replit publishes the exact rate.
const COST_PER_M: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 2.37, output: 11.81 },
  "claude-sonnet-4-6": { input: 2.37, output: 11.81 },
  "gpt-5": { input: 7.87, output: 31.50 },
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

export async function logTokenUsage(
  accountId: string,
  operation: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  projectId?: string | null,
): Promise<void> {
  try {
    const costGbpEstimate = estimateCostGbp(model, inputTokens, outputTokens);
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

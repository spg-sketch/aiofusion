const MAX_RETRYABLE_ERROR_DEPTH = 4;

/**
 * Network failures and upstream throttling/server errors can be transient.
 * Do not retry validation/SSRF failures or successful fetches whose contents
 * do not support the candidate.
 */
export function isRetryableMediaDiscoveryFetchError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_RETRYABLE_ERROR_DEPTH && current; depth += 1) {
    const value = current instanceof Error
      ? `${current.name} ${current.message}`
      : String(current);
    if (/\b(?:429|500|502|503|504)\b|timed?\s*out|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|socket|fetch failed|network/i.test(value)) {
      return true;
    }
    current = current instanceof Error ? current.cause : null;
  }
  return false;
}

export async function fetchMediaDiscoverySourceWithRetry<T>(
  fetchSource: () => Promise<T>,
  onRetry?: () => void,
): Promise<{ value: T; attempts: number }> {
  try {
    return { value: await fetchSource(), attempts: 1 };
  } catch (error) {
    if (!isRetryableMediaDiscoveryFetchError(error)) throw error;
    onRetry?.();
    return { value: await fetchSource(), attempts: 2 };
  }
}

/** Keep diagnostic durations finite and bounded even if the clock shifts. */
export function boundedMediaDiscoveryDurationMs(startedAt: number, endedAt = Date.now()): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.max(0, Math.min(300_000, Math.round(endedAt - startedAt)));
}
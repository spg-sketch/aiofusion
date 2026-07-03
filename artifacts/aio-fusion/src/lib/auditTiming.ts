export type AuditOperationType = "visibility" | "website" | "draft" | "content-draft" | "content-optimise";

const DEFAULTS: Record<AuditOperationType, number> = {
  visibility: 300,
  website: 120,
  draft: 60,
  "content-draft": 75,
  "content-optimise": 40,
};

const HISTORY_SIZE = 5;

const OVERTIME_RATIO_THRESHOLD = 0.2;
const OVERTIME_MIN_SECONDS = 15;

function storageKey(type: AuditOperationType): string {
  return `aio.auditTiming.${type}`;
}

function loadHistory(type: AuditOperationType): number[] {
  try {
    const raw = localStorage.getItem(storageKey(type));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record the actual elapsed time for a completed audit.
 *
 * When an audit ran significantly over its estimate (>20% and >15 s), the
 * actual duration is recorded with double weight so the rolling average
 * catches up to reality faster.
 *
 * @param type        The audit type key.
 * @param elapsedMs   Wall-clock milliseconds from start to finish.
 * @param estimatedMs The estimate that was shown at the start (optional).
 *                    Supply this so overtime weighting can be applied.
 */
export function recordAuditDuration(
  type: AuditOperationType,
  elapsedMs: number,
  estimatedMs?: number,
): void {
  if (elapsedMs <= 0) return;
  const history = loadHistory(type);
  history.push(elapsedMs);

  if (estimatedMs && estimatedMs > 0) {
    const overMs = elapsedMs - estimatedMs;
    const overRatio = overMs / estimatedMs;
    const significantOvertime =
      overRatio > OVERTIME_RATIO_THRESHOLD &&
      overMs > OVERTIME_MIN_SECONDS * 1000;

    if (significantOvertime) {
      history.push(elapsedMs);
    }
  }

  const trimmed = history.slice(-HISTORY_SIZE);
  try {
    localStorage.setItem(storageKey(type), JSON.stringify(trimmed));
  } catch {
  }
}

export function getAuditDurationSeconds(type: AuditOperationType): number {
  const history = loadHistory(type);
  if (history.length === 0) return DEFAULTS[type];
  const avgMs = history.reduce((sum, ms) => sum + ms, 0) / history.length;
  return Math.max(10, Math.round(avgMs / 1000));
}

/**
 * Returns the number of recorded audit samples for this type.
 * Returns 0 when no history exists yet.
 */
export function getAuditSampleCount(type: AuditOperationType): number {
  return loadHistory(type).length;
}

/**
 * Returns a human-readable hint like "Usually takes ~4 min" based on past
 * audit runs, or null when no history exists yet.
 */
export function getTypicalDurationHint(type: AuditOperationType): string | null {
  const history = loadHistory(type);
  if (history.length === 0) return null;
  const avgMs = history.reduce((sum, ms) => sum + ms, 0) / history.length;
  const seconds = Math.max(10, Math.round(avgMs / 1000));
  if (seconds < 60) return `Usually takes ~${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `Usually takes ~${mins} min`;
}

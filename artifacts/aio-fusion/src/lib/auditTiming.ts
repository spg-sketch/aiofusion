export type AuditOperationType = "visibility" | "website" | "draft";

const DEFAULTS: Record<AuditOperationType, number> = {
  visibility: 300,
  website: 120,
  draft: 60,
};

const HISTORY_SIZE = 5;

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

export function recordAuditDuration(type: AuditOperationType, elapsedMs: number): void {
  if (elapsedMs <= 0) return;
  const history = loadHistory(type);
  history.push(elapsedMs);
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

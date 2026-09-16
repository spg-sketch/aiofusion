const durations: Record<string, number[]> = {};

export function recordAuditDuration(
  kind: string,
  durationMs: number,
  _typicalMs?: number,
): void {
  durations[kind] = [...(durations[kind] ?? []), durationMs].slice(-10);
}

export function getAuditDurationSeconds(kind: string): number {
  const latest = durations[kind]?.at(-1);
  return latest ? Math.max(1, Math.round(latest / 1000)) : 30;
}

export function getAuditSampleCount(kind: string): number {
  return durations[kind]?.length ?? 0;
}

export function getTypicalDurationHint(kind: string): string | null {
  const latest = durations[kind]?.at(-1);
  return latest ? `Usually about ${Math.max(1, Math.round(latest / 1000))} seconds` : null;
}
export type CycleHistory = { cycle: number; history: { date: string; score: number }[] };
const cycleKey = (clientId: string) => `aio.cycle.${clientId}`;
export function loadCycle(clientId: string): CycleHistory {
  try {
    const raw = localStorage.getItem(cycleKey(clientId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { cycle: 0, history: [] };
}
export function recordCycle(clientId: string, score: number): CycleHistory {
  const cur = loadCycle(clientId);
  const next: CycleHistory = {
    cycle: cur.cycle + 1,
    history: [...cur.history, { date: new Date().toISOString(), score }].slice(-12),
  };
  localStorage.setItem(cycleKey(clientId), JSON.stringify(next));
  return next;
}

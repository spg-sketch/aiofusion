/**
 * Synthetic support-query algorithm benchmark (not an HTTP handler benchmark).
 *
 * This deliberately uses a delayed, serialized mock database rather than a
 * configured database connection. It has a fixed fixture and no secrets, so
 * baseline and optimized query algorithms are directly comparable without
 * touching a real database. Reported timings are synthetic algorithm timings,
 * not observed support endpoint latency.
 *
 * Usage:
 *   pnpm exec tsx artifacts/api-server/scripts/support-query-benchmark.ts baseline
 *   pnpm exec tsx artifacts/api-server/scripts/support-query-benchmark.ts optimized
 */

type Ticket = {
  accountUsername: string;
  status: "open" | "in_progress" | "closed";
};

type BenchmarkResult = {
  label: "synthetic";
  measurement: "algorithm-simulation";
  strategy: "baseline" | "optimized";
  fixture: { tickets: number; uniqueUsers: number; delayMs: number };
  list: { medianMs: number; p95Ms: number; queryCount: number; rowsReturned: number };
  summary: { medianMs: number; p95Ms: number; queryCount: number; rowsReturned: number };
};

const strategyArg = process.argv[2];
if (strategyArg !== "baseline" && strategyArg !== "optimized") {
  throw new Error("Pass exactly one strategy: baseline or optimized");
}
const strategy = strategyArg;
const DELAY_MS = 4;
const RUNS = 7;

function makeFixture(): { tickets: Ticket[]; profiles: Map<string, string> } {
  const tickets: Ticket[] = [];
  const profiles = new Map<string, string>();
  for (let userIndex = 0; userIndex < 80; userIndex += 1) {
    const username = `user-${userIndex}`;
    profiles.set(username, `User ${userIndex}`);
    for (let ticketIndex = 0; ticketIndex < 3; ticketIndex += 1) {
      tickets.push({
        accountUsername: username,
        status: ticketIndex === 0 ? "open" : ticketIndex === 1 ? "in_progress" : "closed",
      });
    }
  }
  return { tickets, profiles };
}

/**
 * A single-connection-style delayed DB mock. Concurrent calls are queued so
 * an N+1 query pattern is visible in wall-clock timings, not just query count.
 */
class DelayedMockDb {
  queryCount = 0;
  rowsReturned = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly tickets: Ticket[],
    private readonly profiles: Map<string, string>,
  ) {}

  private async query<T>(rowsReturned: number, operation: () => T): Promise<T> {
    this.queryCount += 1;
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    this.rowsReturned += rowsReturned;
    const result = operation();
    release();
    return result;
  }

  selectTickets(): Promise<Ticket[]> {
    return this.query(this.tickets.length, () => [...this.tickets]);
  }

  selectProfile(username: string): Promise<string | undefined> {
    return this.query(this.profiles.has(username) ? 1 : 0, () => this.profiles.get(username));
  }

  selectProfiles(usernames: string[]): Promise<Map<string, string>> {
    return this.query(usernames.filter((username) => this.profiles.has(username)).length, () => {
      const result = new Map<string, string>();
      for (const username of usernames) {
        const displayName = this.profiles.get(username);
        if (displayName) result.set(username, displayName);
      }
      return result;
    });
  }

  countOutstanding(): Promise<number> {
    return this.query(1, () =>
      this.tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress")
        .length,
    );
  }

  selectOutstandingRows(): Promise<Ticket[]> {
    const rows = this.tickets.filter(
      (ticket) => ticket.status === "open" || ticket.status === "in_progress",
    );
    return this.query(rows.length, () => rows);
  }
}

async function runList(db: DelayedMockDb): Promise<void> {
  const tickets = await db.selectTickets();
  const usernames = [...new Set(tickets.map((ticket) => ticket.accountUsername))];
  if (strategy === "baseline") {
    await Promise.all(usernames.map((username) => db.selectProfile(username)));
  } else {
    await db.selectProfiles(usernames);
  }
}

async function runSummary(db: DelayedMockDb): Promise<void> {
  if (strategy === "baseline") {
    await db.selectOutstandingRows();
  } else {
    await db.countOutstanding();
  }
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

async function measure(operation: (db: DelayedMockDb) => Promise<void>) {
  const timings: number[] = [];
  let queryCount = 0;
  let rowsReturned = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const { tickets, profiles } = makeFixture();
    const db = new DelayedMockDb(tickets, profiles);
    const started = performance.now();
    await operation(db);
    timings.push(performance.now() - started);
    queryCount += db.queryCount;
    rowsReturned += db.rowsReturned;
  }
  return {
    medianMs: Number((percentile(timings, 0.5)).toFixed(2)),
    p95Ms: Number((percentile(timings, 0.95)).toFixed(2)),
    queryCount: queryCount / RUNS,
    rowsReturned: rowsReturned / RUNS,
  };
}

const { tickets, profiles } = makeFixture();
const list = await measure((db) => runList(db));
const summary = await measure((db) => runSummary(db));
const result: BenchmarkResult = {
  label: "synthetic",
  measurement: "algorithm-simulation",
  strategy,
  fixture: { tickets: tickets.length, uniqueUsers: profiles.size, delayMs: DELAY_MS },
  list,
  summary,
};
console.log(JSON.stringify(result));
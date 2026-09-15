import type { Server } from "node:http";
import { logger } from "./logger";

export type RuntimeState = "starting" | "ready" | "draining";

let runtimeState: RuntimeState = "starting";

export function getRuntimeState(): RuntimeState {
  return runtimeState;
}

export function markRuntimeReady(): void {
  runtimeState = "ready";
}

export function markRuntimeDraining(): void {
  runtimeState = "draining";
}

export function resetRuntimeStateForTests(): void {
  runtimeState = "starting";
}

export async function runRequiredPrerequisites(
  steps: ReadonlyArray<readonly [string, () => Promise<unknown>]>,
): Promise<void> {
  for (const [label, step] of steps) {
    try {
      await step();
    } catch (err) {
      logger.fatal({ err, prerequisite: label }, "Required startup prerequisite failed");
      throw new Error(`Required startup prerequisite failed: ${label}`, { cause: err });
    }
  }
}

export interface ScheduledJob {
  stop(): void;
  wait(): Promise<void>;
}

export function runTrackedJob(
  label: string,
  job: () => Promise<unknown>,
): ScheduledJob {
  let stopped = false;
  const active = Promise.resolve()
    .then(() => stopped ? undefined : job())
    .catch((err) => logger.error({ err, job: label }, "Background startup job failed"))
    .then(() => undefined);
  return {
    stop() {
      stopped = true;
    },
    async wait() {
      await active;
    },
  };
}

export function scheduleNonOverlappingJob(
  label: string,
  job: () => Promise<unknown>,
  intervalMs: number,
  runImmediately = true,
): ScheduledJob {
  let stopped = false;
  let active: Promise<void> | undefined;

  const run = () => {
    if (stopped || active) return;
    active = job()
      .catch((err) => logger.error({ err, job: label }, "Scheduled job failed"))
      .then(() => undefined)
      .finally(() => {
        active = undefined;
      });
  };

  const timer = setInterval(run, intervalMs);
  timer.unref();
  if (runImmediately) run();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    async wait() {
      await active;
    },
  };
}

interface ShutdownOptions {
  server: Server;
  jobs: ScheduledJob[];
  closeResources: () => Promise<unknown>;
  timeoutMs: number;
  forceCleanupTimeoutMs?: number;
}

export async function shutdownRuntime({
  server,
  jobs,
  closeResources,
  timeoutMs,
  forceCleanupTimeoutMs = 1_000,
}: ShutdownOptions): Promise<"drained" | "timed-out"> {
  markRuntimeDraining();
  for (const job of jobs) job.stop();
  let resourceClose: Promise<unknown> | undefined;
  const closeOwnedResources = () => {
    resourceClose ??= closeResources();
    return resourceClose;
  };

  const drain = Promise.all([
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
    ...jobs.map((job) => job.wait()),
  ])
    .then(() => closeOwnedResources())
    .then(() => "drained" as const)
    .catch((err) => {
      logger.error({ err }, "Graceful shutdown drain failed");
      return "failed" as const;
    });

  let timeout: NodeJS.Timeout | undefined;
  const result = await Promise.race([
    drain,
    new Promise<"timed-out">((resolve) => {
      timeout = setTimeout(() => resolve("timed-out"), timeoutMs);
      timeout.unref();
    }),
  ]);
  if (timeout) clearTimeout(timeout);

  if (result !== "drained") {
    server.closeAllConnections?.();
    logger.error(
      { timeoutMs, reason: result },
      "Graceful shutdown did not complete; forced connections closed",
    );
    let cleanupTimeout: NodeJS.Timeout | undefined;
    await Promise.race([
      closeOwnedResources().catch((err) => {
        logger.error({ err }, "Owned resource cleanup failed after shutdown timeout");
      }),
      new Promise<void>((resolve) => {
        cleanupTimeout = setTimeout(resolve, forceCleanupTimeoutMs);
        cleanupTimeout.unref();
      }),
    ]);
    if (cleanupTimeout) clearTimeout(cleanupTimeout);
  }
  return result === "drained" ? "drained" : "timed-out";
}
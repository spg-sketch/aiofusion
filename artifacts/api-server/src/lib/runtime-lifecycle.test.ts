import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeState,
  markRuntimeReady,
  resetRuntimeStateForTests,
  runRequiredPrerequisites,
  scheduleNonOverlappingJob,
  shutdownRuntime,
} from "./runtime-lifecycle";

afterEach(() => {
  vi.useRealTimers();
  resetRuntimeStateForTests();
});

describe("runtime lifecycle", () => {
  it("aborts required prerequisites at the first failure", async () => {
    const later = vi.fn();
    await expect(runRequiredPrerequisites([
      ["first", async () => undefined],
      ["broken schema", async () => { throw new Error("database unavailable"); }],
      ["later", later],
    ])).rejects.toThrow("Required startup prerequisite failed: broken schema");
    expect(later).not.toHaveBeenCalled();
  });

  it("prevents scheduled work from overlapping and stops future runs", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const job = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const scheduled = scheduleNonOverlappingJob("test", job, 100, true);
    await vi.advanceTimersByTimeAsync(300);
    expect(job).toHaveBeenCalledTimes(1);
    scheduled.stop();
    finish();
    await scheduled.wait();
    await vi.advanceTimersByTimeAsync(300);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it("transitions out of ready and drains the server and resources", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    markRuntimeReady();
    const closeResources = vi.fn(async () => undefined);
    const result = await shutdownRuntime({ server, jobs: [], closeResources, timeoutMs: 100 });
    expect(result).toBe("drained");
    expect(getRuntimeState()).toBe("draining");
    expect(closeResources).toHaveBeenCalledOnce();
    expect(server.listening).toBe(false);
  });

  it("bounds cleanup and force-closes connections on timeout", async () => {
    vi.useFakeTimers();
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const closeAll = vi.spyOn(server, "closeAllConnections");
    const closeResources = vi.fn(async () => undefined);
    const shutdown = shutdownRuntime({
      server,
      jobs: [{ stop: vi.fn(), wait: () => new Promise<void>(() => undefined) }],
      closeResources,
      timeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(50);
    await expect(shutdown).resolves.toBe("timed-out");
    expect(closeAll).toHaveBeenCalledOnce();
    expect(closeResources).toHaveBeenCalledOnce();
  });
});
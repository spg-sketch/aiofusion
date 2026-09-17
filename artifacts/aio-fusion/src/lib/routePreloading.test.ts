import { afterEach, describe, expect, it, vi } from "vitest";
import { preloadRoute, scheduleIdlePreloads } from "./routePreloading";

afterEach(() => {
  vi.useRealTimers();
});

describe("route chunk preloading", () => {
  it("starts a route only once when hover and navigation both request it", async () => {
    const load = vi.fn(async () => ({ default: {} }));

    preloadRoute(load);
    preloadRoute(load);
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("gives foreground work a head start and queues one resolved chunk per idle turn", async () => {
    vi.useFakeTimers();
    const first = vi.fn(async () => ({}));
    const second = vi.fn(async () => ({}));

    scheduleIdlePreloads([first, second], window);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(first).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not start a second download while the first import is still pending", async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const first = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const second = vi.fn(async () => ({}));
    scheduleIdlePreloads([first, second], window);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    resolve();
    await vi.advanceTimersByTimeAsync(250);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not continue an old context queue after its pending import completes", async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const first = () => new Promise<void>((done) => { resolve = done; });
    const second = vi.fn(async () => ({}));
    const cancel = scheduleIdlePreloads([first, second], window);
    await vi.advanceTimersByTimeAsync(1250);
    cancel();
    resolve();
    await vi.runAllTimersAsync();
    expect(second).not.toHaveBeenCalled();
  });

  it("allows navigation to retry a failed preload", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    await preloadRoute(load);
    await preloadRoute(load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("cancels pending context preloads after navigation", () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => ({}));

    const cancel = scheduleIdlePreloads([load], window);
    cancel();
    vi.runAllTimers();

    expect(load).not.toHaveBeenCalled();
  });
});
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

  it("queues one chunk per idle turn instead of eagerly loading every route", () => {
    vi.useFakeTimers();
    const first = vi.fn(async () => ({}));
    const second = vi.fn(async () => ({}));

    scheduleIdlePreloads([first, second], window);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(second).toHaveBeenCalledTimes(1);
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
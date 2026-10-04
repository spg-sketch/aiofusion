import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_SEARCH_TIMEOUT_MS, EventSearchTimeoutError, withEventSearchDeadline } from "./event-search-deadline";

describe("event search deadline", () => {
  afterEach(() => vi.useRealTimers());

  it("returns completed research and clears its deadline", async () => {
    vi.useFakeTimers();
    const result = await withEventSearchDeadline(async () => ["verified event"]);
    expect(result).toEqual(["verified event"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails visibly and aborts work even when the provider never settles", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = withEventSearchDeadline(async (value) => {
      signal = value;
      return await new Promise(() => {});
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(EventSearchTimeoutError);
    await vi.advanceTimersByTimeAsync(EVENT_SEARCH_TIMEOUT_MS);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves ordinary errors without automatic retries", async () => {
    const work = vi.fn(async () => { throw new Error("Provider unavailable"); });
    await expect(withEventSearchDeadline(work)).rejects.toThrow("Provider unavailable");
    expect(work).toHaveBeenCalledOnce();
  });
});
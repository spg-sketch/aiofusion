import { describe, expect, it, vi } from "vitest";
import {
  boundedMediaDiscoveryDurationMs,
  fetchMediaDiscoverySourceWithRetry,
  isRetryableMediaDiscoveryFetchError,
} from "./media-discovery-reliability";

describe("media discovery reliability helpers", () => {
  it("retries one transient fetch failure and reports the bounded attempt count", async () => {
    const fetchSource = vi.fn()
      .mockRejectedValueOnce(new Error("Site request timed out"))
      .mockResolvedValueOnce({ text: "public evidence" });
    const onRetry = vi.fn();

    await expect(fetchMediaDiscoverySourceWithRetry(fetchSource, onRetry)).resolves.toEqual({
      value: { text: "public evidence" },
      attempts: 2,
    });
    expect(fetchSource).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-transient source failures or successful pages lacking evidence", async () => {
    const invalidUrl = new Error("URL resolves to a private IP address");
    expect(isRetryableMediaDiscoveryFetchError(invalidUrl)).toBe(false);
    const fetchSource = vi.fn().mockRejectedValue(invalidUrl);
    await expect(fetchMediaDiscoverySourceWithRetry(fetchSource)).rejects.toBe(invalidUrl);
    expect(fetchSource).toHaveBeenCalledTimes(1);

    const fetchedPage = await fetchMediaDiscoverySourceWithRetry(async () => ({ text: "unrelated page" }));
    expect(fetchedPage).toEqual({ value: { text: "unrelated page" }, attempts: 1 });
  });

  it("recognises nested transient network errors and bounds diagnostic timings", () => {
    const error = new Error("request failed", { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
    expect(isRetryableMediaDiscoveryFetchError(error)).toBe(true);
    expect(boundedMediaDiscoveryDurationMs(100, 175)).toBe(75);
    expect(boundedMediaDiscoveryDurationMs(175, 100)).toBe(0);
    expect(boundedMediaDiscoveryDurationMs(0, 400_000)).toBe(300_000);
  });
});
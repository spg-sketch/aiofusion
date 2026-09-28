import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTENT_AI_TIMEOUT_MS, streamContent } from "./contentAi";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("content AI stream", () => {
  it("returns the final result even if the transport does not close", async () => {
    const progress = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: progress\ndata: {"chars":42}\n\nevent: result\ndata: {"bodyCopy":"Pitch text"}\n\n',
        ));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      headers: { "content-type": "text/event-stream" },
    })));
    await expect(streamContent("/api/content/generate", {}, progress))
      .resolves.toMatchObject({ bodyCopy: "Pitch text" });
    expect(progress).toHaveBeenCalledWith(42);
  });

  it("stops at the deadline even when the transport ignores abort", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    }));
    const request = streamContent("/api/content/generate", {});
    const failure = expect(request).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(CONTENT_AI_TIMEOUT_MS);
    await failure;
    expect(signal?.aborted).toBe(true);
  });

  it("checks elapsed wall time when the browser tab regains focus", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const request = streamContent("/api/content/generate", {});
    const failure = expect(request).rejects.toThrow(/timed out/);
    vi.setSystemTime(Date.now() + CONTENT_AI_TIMEOUT_MS + 1);
    window.dispatchEvent(new Event("focus"));
    await failure;
  });
});
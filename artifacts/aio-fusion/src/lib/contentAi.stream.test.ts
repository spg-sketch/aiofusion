// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTENT_AI_TIMEOUT_MS, streamContent } from "./contentAi";

const event = (kind: string, value: unknown) => `event: ${kind}\ndata: ${JSON.stringify(value)}\n\n`;
const response = (body: ReadableStream<Uint8Array>) => new Response(body, {
  headers: { "content-type": "text/event-stream" },
});
const encoded = (text: string) => new TextEncoder().encode(text);

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("content stream", () => {
  it("returns a complete result across chunks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoded(event("progress", { chars: 40 })));
        controller.enqueue(encoded(event("result", { headline: "News", bodyCopy: "Editable pitch" })));
        controller.close();
      },
    }))));
    const progress = vi.fn();
    expect(await streamContent("/api/content/generate", {}, progress)).toMatchObject({ bodyCopy: "Editable pitch" });
    expect(progress).toHaveBeenCalledWith(40);
  });

  it("fails an incomplete or malformed stream without applying a result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(new ReadableStream({
      start(controller) { controller.enqueue(encoded('event: result\ndata: {"bodyCopy": invalid}\n\n')); controller.close(); },
    }))));
    await expect(streamContent("/api/content/generate", {})).rejects.toThrow(/ended before it finished/);
  });

  it("stops waiting for a stalled read and ignores a late result", async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => response(new ReadableStream({
      pull: () => new Promise(() => {}),
    }))));
    const pending = streamContent("/api/content/generate", {}, progress);
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(CONTENT_AI_TIMEOUT_MS + 1);
    await assertion;
    expect(progress).not.toHaveBeenCalled();
  });

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
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { extractJson, GEN_MAX_TOKENS, streamModelText } from "./content-ai";

describe("content generation output", () => {
  it("reads a complete pitch, including literal line breaks in body copy", () => {
    expect(extractJson('{"headline":"Synthetic news","standfirst":"A short lead","bodyCopy":"First\nSecond","changeLog":[],"supportingData":[]}')?.bodyCopy)
      .toBe("First\nSecond");
    expect(GEN_MAX_TOKENS["Article Media Pitch"]).toBeGreaterThan(2000);
  });

  it("rejects malformed and truncated output rather than treating it as a draft", () => {
    expect(extractJson('{"headline":"Incomplete","bodyCopy":"cut off')).toBeNull();
    expect(extractJson('{"headline": broken}')).toBeNull();
  });

  it("returns the provider stop reason for a complete stream", async () => {
    const handlers: Record<string, (delta: string) => void> = {};
    const stream = {
      on: vi.fn((event: string, handler: (delta: string) => void) => { handlers[event] = handler; }),
      finalMessage: vi.fn(async () => {
        handlers.text('{"headline":"Done","standfirst":"Lead","bodyCopy":"Pitch"}');
        return { usage: { input_tokens: 10, output_tokens: 20 }, stop_reason: "end_turn" };
      }),
      abort: vi.fn(),
    };
    const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, write: vi.fn() });
    const result = await streamModelText(res as never, { messages: { stream: () => stream } } as never, "synthetic");
    expect(result.stopReason).toBe("end_turn");
    expect(result.text).toContain("Pitch");
    expect(stream.abort).not.toHaveBeenCalled();
  });

  it("settles a stalled provider even if abort does not settle finalMessage", async () => {
    vi.useFakeTimers();
    try {
      const stream = {
        on: vi.fn(),
        finalMessage: () => new Promise(() => {}),
        abort: vi.fn(),
      };
      const promise = streamModelText(Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, write: vi.fn() }) as never,
        { messages: { stream: () => stream } } as never, "synthetic");
      const assertion = expect(promise).rejects.toMatchObject({ isTimeout: true });
      await vi.advanceTimersByTimeAsync(90_000);
      await assertion;
      expect(stream.abort).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops model work on a disconnected browser without delivering a late result", async () => {
    const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, write: vi.fn() });
    let finish!: (value: unknown) => void;
    const stream = { on: vi.fn(), finalMessage: () => new Promise((resolve) => { finish = resolve; }), abort: vi.fn() };
    const promise = streamModelText(res as never, { messages: { stream: () => stream } } as never, "synthetic");
    const assertion = expect(promise).rejects.toMatchObject({ isDisconnect: true });
    res.destroyed = true;
    res.emit("close");
    await assertion;
    finish({ stop_reason: "end_turn", usage: {} });
    expect(stream.abort).toHaveBeenCalledOnce();
    expect(res.write).not.toHaveBeenCalled();
  });
});
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createConcurrencyGuard } from "./concurrency-guard";

function response() {
  const emitter = new EventEmitter() as EventEmitter & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  emitter.status = vi.fn(() => emitter);
  emitter.json = vi.fn(() => emitter);
  return emitter;
}

describe("createConcurrencyGuard", () => {
  it("keeps a held background job counted after its HTTP response finishes", () => {
    const guard = createConcurrencyGuard(1);
    const firstRequest: Record<string, unknown> = {};
    const firstResponse = response();
    guard(firstRequest as any, firstResponse as any, vi.fn());
    const release = (firstRequest as any).holdConcurrencyGuard();
    firstResponse.emit("finish");

    const blockedResponse = response();
    const blockedNext = vi.fn();
    guard({} as any, blockedResponse as any, blockedNext);
    expect(blockedResponse.status).toHaveBeenCalledWith(503);
    expect(blockedNext).not.toHaveBeenCalled();

    release();
    const nextResponse = response();
    const next = vi.fn();
    guard({} as any, nextResponse as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
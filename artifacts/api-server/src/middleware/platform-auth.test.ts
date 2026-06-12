import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requirePlatformAuth } from "./platform-auth";

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = vi.fn((payload: unknown) => {
    res.body = payload;
    return res;
  }) as unknown as Response["json"];
  return res;
}

describe("requirePlatformAuth (session enforcement)", () => {
  it("rejects a request with no signed-in account (401)", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();
    requirePlatformAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("passes through when an account is attached", () => {
    const req = { account: { username: "agency", role: "user" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requirePlatformAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "./require-auth";

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

function makeReq(isAuthed: boolean): Request {
  return {
    isAuthenticated: () => isAuthed,
    user: isAuthed ? { id: "user-1" } : undefined,
  } as unknown as Request;
}

describe("requireAuth (session expiry enforcement)", () => {
  it("passes through when the user is authenticated", () => {
    const req = makeReq(true);
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });

  it("returns 401 when no user is attached (unauthenticated request)", () => {
    const req = makeReq(false);
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toMatch(/sign in/i);
  });

  it("returns 401 when the session has expired (authMiddleware clears user on expire)", () => {
    const req = {
      isAuthenticated: () => false,
      user: undefined,
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("authMiddleware + requireAuth integration: expired session is rejected", () => {
  const getSessionMock = vi.hoisted(() => vi.fn());
  const clearSessionMock = vi.hoisted(() => vi.fn());

  vi.mock("../lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("../lib/auth")>();
    return {
      ...original,
      getSession: getSessionMock,
      clearSession: clearSessionMock,
      getOidcConfig: vi.fn(),
    };
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the cookie and leaves req.user unset when getSession returns null (expired)", async () => {
    getSessionMock.mockResolvedValue(null);
    clearSessionMock.mockResolvedValue(undefined);

    const { authMiddleware } = await import("../middlewares/authMiddleware");

    const req = {
      headers: {},
      cookies: { sid: "expired-session-id" },
    } as unknown as Request;
    const res = mockRes();
    res.clearCookie = vi.fn() as unknown as Response["clearCookie"];
    const next = vi.fn();

    await authMiddleware(req, res, next as NextFunction);

    expect(getSessionMock).toHaveBeenCalledWith("expired-session-id");
    expect(clearSessionMock).toHaveBeenCalled();
    expect((req as unknown as { user?: unknown }).user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();

    const nextReq = req as unknown as { isAuthenticated: () => boolean };
    expect(nextReq.isAuthenticated()).toBe(false);
  });

  it("rejects an expired session end-to-end through requireAuth after authMiddleware clears it", async () => {
    getSessionMock.mockResolvedValue(null);
    clearSessionMock.mockResolvedValue(undefined);

    const { authMiddleware } = await import("../middlewares/authMiddleware");

    const req = {
      headers: {},
      cookies: { sid: "stale-sid" },
    } as unknown as Request;
    const res = mockRes();
    res.clearCookie = vi.fn() as unknown as Response["clearCookie"];
    const next = vi.fn();

    await authMiddleware(req, res, next as NextFunction);

    const res2 = mockRes();
    const next2 = vi.fn();
    requireAuth(req, res2, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(401);
  });
});

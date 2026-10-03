import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  exchange: vi.fn(),
  createSession: vi.fn(),
  returning: vi.fn(),
}));

// Exercise the real HTTP routes without contacting an identity provider or DB.
vi.mock("openid-client", () => ({
  randomState: () => "test-state",
  randomNonce: () => "test-nonce",
  randomPKCECodeVerifier: () => "test-verifier",
  calculatePKCECodeChallenge: async () => "test-challenge",
  buildAuthorizationUrl: () => new URL("https://provider.invalid/authorize"),
  buildEndSessionUrl: () => new URL("https://provider.invalid/logout"),
  authorizationCodeGrant: fake.exchange,
}));
vi.mock("../lib/auth", () => ({
  clearSession: vi.fn(),
  getOidcConfig: async () => ({}),
  getSessionId: () => undefined,
  createSession: fake.createSession,
  deleteSession: vi.fn(),
  SESSION_COOKIE: "test_session",
  SESSION_TTL: 60_000,
  ISSUER_URL: "https://provider.invalid",
}));
vi.mock("@workspace/db", () => ({
  usersTable: {},
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: fake.returning }),
      }),
    }),
  },
}));

import authRouter from "./auth";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.use("/api", authRouter);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing HTTP test port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.exchange.mockResolvedValue({
    claims: () => ({ sub: "test-user", exp: 2_000_000_000 }),
    access_token: "synthetic-access-token",
    expiresIn: () => 3600,
  });
  fake.returning.mockResolvedValue([{
    id: "test-user",
    email: null,
    firstName: null,
    lastName: null,
    profileImageUrl: null,
  }]);
  fake.createSession.mockResolvedValue("synthetic-session");
});

describe("sign-in return-path HTTP boundaries", () => {
  it.each([
    ["/library?project=42#saved", "/library?project=42#saved"],
    ["/\\example.invalid", "/"],
    ["//example.invalid", "/"],
    ["/\t/example.invalid", "/"],
  ])("validates the destination before storing its login cookie: %j", async (input, expected) => {
    const response = await fetch(`${baseUrl}/api/login?returnTo=${encodeURIComponent(input)}`, {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://provider.invalid/authorize");
    const returnCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith("return_to="));
    expect(returnCookie).toBeDefined();
    expect(decodeURIComponent(returnCookie!.split(";")[0].slice("return_to=".length))).toBe(expected);
    expect(fake.exchange).not.toHaveBeenCalled();
  });

  it.each([
    ["/library?project=42#saved", "/library?project=42#saved"],
    ["/\\example.invalid", "/"],
    ["//example.invalid", "/"],
    ["/\n/example.invalid", "/"],
  ])("revalidates the cookie at callback, preserving the session: %j", async (input, expected) => {
    const response = await fetch(`${baseUrl}/api/callback?code=synthetic-code&state=test-state`, {
      redirect: "manual",
      headers: {
        cookie: `code_verifier=test-verifier; nonce=test-nonce; state=test-state; return_to=${encodeURIComponent(input)}`,
      },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(expected);
    expect(new URL(response.headers.get("location")!, baseUrl).origin).toBe(baseUrl);
    expect(fake.exchange).toHaveBeenCalledOnce();
    expect(fake.createSession).toHaveBeenCalledOnce();
    expect(response.headers.getSetCookie().some((cookie) => cookie.startsWith("test_session="))).toBe(true);
  });

  it("preserves the missing-state recovery redirect without exchanging a code", async () => {
    const response = await fetch(`${baseUrl}/api/callback?code=synthetic-code`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/api/login");
    expect(fake.exchange).not.toHaveBeenCalled();
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("preserves the provider logout redirect", async () => {
    const response = await fetch(`${baseUrl}/api/logout`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://provider.invalid/logout");
  });
});
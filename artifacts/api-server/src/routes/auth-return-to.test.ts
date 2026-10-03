import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  exchange: vi.fn(),
  createSession: vi.fn(),
  returning: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  buildEndSessionUrl: vi.fn(),
}));

// Exercise the real HTTP routes without contacting an identity provider or DB.
vi.mock("openid-client", () => ({
  randomState: () => "test-state",
  randomNonce: () => "test-nonce",
  randomPKCECodeVerifier: () => "test-verifier",
  calculatePKCECodeChallenge: async () => "test-challenge",
  buildAuthorizationUrl: fake.buildAuthorizationUrl,
  buildEndSessionUrl: fake.buildEndSessionUrl,
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
  app.set("trust proxy", 1);
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
  vi.stubEnv("DEPLOYMENT_ENV", "staging");
  vi.stubEnv("CANONICAL_DOMAIN", "staging.aiofusion.ai");
  vi.stubEnv("REPLIT_DOMAINS", "preview.example.replit.app");
  fake.buildAuthorizationUrl.mockReturnValue(new URL("https://provider.invalid/authorize"));
  fake.buildEndSessionUrl.mockReturnValue(new URL("https://provider.invalid/logout"));
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

afterEach(() => vi.unstubAllEnvs());

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

describe("configured OIDC callback and logout origins", () => {
  const hostileHeaders: Record<string, string>[] = [
    {},
    { "x-forwarded-host": "attacker.invalid" },
    { "x-forwarded-host": "aiofusion.ai@attacker.invalid" },
    { "x-forwarded-proto": "http" },
    { host: "attacker.invalid", "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "javascript" },
  ];

  describe.each([
    ["production", "aiofusion.ai", "https://aiofusion.ai"],
    ["staging", "staging.aiofusion.ai", "https://staging.aiofusion.ai"],
    ["staging", "aiofusion.ai", "https://staging.aiofusion.ai"],
    ["development", "", "https://preview.example.replit.app"],
  ])("%s deployment with canonical value %s", (environment, canonical, expectedOrigin) => {
    it.each(hostileHeaders)("ignores request-origin headers: %j", async (headers) => {
      vi.stubEnv("DEPLOYMENT_ENV", environment);
      vi.stubEnv("CANONICAL_DOMAIN", canonical);

      const login = await fetch(`${baseUrl}/api/login`, { redirect: "manual", headers });
      expect(login.status).toBe(302);
      expect(login.headers.get("location")).toBe("https://provider.invalid/authorize");
      expect(fake.buildAuthorizationUrl).toHaveBeenCalledWith({}, expect.objectContaining({
        redirect_uri: `${expectedOrigin}/api/callback`,
        code_challenge_method: "S256",
        state: "test-state",
        nonce: "test-nonce",
      }));

      const callback = await fetch(`${baseUrl}/api/callback?code=synthetic-code&state=test-state`, {
        redirect: "manual",
        headers: {
          ...headers,
          cookie: "code_verifier=test-verifier; nonce=test-nonce; state=test-state; return_to=%2Flibrary",
        },
      });
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe("/library");
      expect(fake.exchange).toHaveBeenCalledOnce();
      const exchangeUrl = fake.exchange.mock.calls[0][1] as URL;
      expect(exchangeUrl.origin).toBe(expectedOrigin);
      expect(exchangeUrl.pathname).toBe("/api/callback");
      expect(exchangeUrl.searchParams.get("code")).toBe("synthetic-code");
      expect(exchangeUrl.searchParams.get("state")).toBe("test-state");
      expect(fake.createSession).toHaveBeenCalledOnce();

      const logout = await fetch(`${baseUrl}/api/logout`, { redirect: "manual", headers });
      expect(logout.status).toBe(302);
      expect(logout.headers.get("location")).toBe("https://provider.invalid/logout");
      expect(fake.buildEndSessionUrl).toHaveBeenCalledWith({}, expect.objectContaining({
        post_logout_redirect_uri: expectedOrigin,
      }));
    });
  });
});
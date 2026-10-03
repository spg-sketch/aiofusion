import express from "express";
import { request, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceProductionHost } from "./production-host";

let server: Server;
let port: number;

beforeAll(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(enforceProductionHost);
  app.use((_req, res) => res.json({ continued: true }));
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test HTTP port");
  port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
beforeEach(() => vi.stubEnv("DEPLOYMENT_ENV", "production"));
afterEach(() => vi.unstubAllEnvs());

// fetch() would normalize the target before sending it and hide the malformed
// asterisk-form request accepted by Node's HTTP parser.
function rawRequest(
  target: string,
  method = "GET",
  headers: Record<string, string> = {},
): Promise<{ status: number; location: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path: target,
      method,
      headers: { host: "www.aiofusion.ai", ...headers },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({
        status: res.statusCode!,
        location: res.headers.location,
        body,
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("production canonical-host boundary", () => {
  it.each([
    "/",
    "/library?project=42",
    "//attacker.invalid/path",
    "/\\attacker.invalid",
    "/%2f%2fattacker.invalid",
    "/%5cattacker.invalid",
    "/library?next=https://attacker.invalid",
  ])("preserves origin-form navigation on the canonical origin: %j", async (target) => {
    const response = await rawRequest(target);
    expect(response.status).toBe(308);
    expect(response.location).toBe(`https://aiofusion.ai${target}`);
    expect(new URL(response.location!).origin).toBe("https://aiofusion.ai");
  });

  it.each([
    ["http://attacker.invalid/library?project=42", "/library?project=42"],
    ["https://attacker.invalid/library?project=42", "/library?project=42"],
    ["http://attacker.invalid//other.invalid/path", "//other.invalid/path"],
  ])("uses only the path/query of an absolute HTTP target: %j", async (target, path) => {
    const response = await rawRequest(target);
    expect(response.status).toBe(308);
    expect(response.location).toBe(`https://aiofusion.ai${path}`);
    expect(new URL(response.location!).origin).toBe("https://aiofusion.ai");
  });

  it.each(["*", "*@attacker.invalid", "*@attacker.invalid/path"])(
    "rejects non-origin/non-HTTP request targets instead of redirecting: %j", async (target) => {
      const response = await rawRequest(target);
      expect(response.status).toBe(400);
      expect(response.location).toBeUndefined();
    },
  );

  it("keeps HEAD navigation working without a response body", async () => {
    const response = await rawRequest("/library?project=42", "HEAD");
    expect(response.status).toBe(308);
    expect(response.location).toBe("https://aiofusion.ai/library?project=42");
    expect(response.body).toBe("");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "never redirects a mutating/API method on the www alias: %s", async (method) => {
      const response = await rawRequest("/api/platform/me", method);
      expect(response.status).toBe(421);
      expect(response.location).toBeUndefined();
    },
  );

  it.each(["staging.aiofusion.ai", "attacker.invalid"])(
    "retains the production block for another hostname: %s", async (host) => {
      const response = await rawRequest("/api/platform/me", "GET", {
        host,
        "x-forwarded-host": "aiofusion.ai",
      });
      expect(response.status).toBe(421);
      expect(response.location).toBeUndefined();
    },
  );

  it.each(["aiofusion.ai", "AIOFUSION.AI:443", "aiofusion.ai."])(
    "allows the existing canonical hostname variants: %s", async (host) => {
      const response = await rawRequest("/api/platform/me", "GET", { host });
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ continued: true });
    },
  );

  it("ignores forged forwarded headers when redirecting the www alias", async () => {
    const response = await rawRequest("/library", "GET", {
      "x-forwarded-host": "attacker.invalid",
      "x-forwarded-proto": "http",
    });
    expect(response.status).toBe(308);
    expect(response.location).toBe("https://aiofusion.ai/library");
  });

  it("preserves the health-check exception on other hostnames", async () => {
    const response = await rawRequest("/api/healthz", "GET", { host: "staging.aiofusion.ai" });
    expect(response.status).toBe(200);
  });

  it.each(["development", "staging"])("leaves the %s host policy unchanged", async (environment) => {
    vi.stubEnv("DEPLOYMENT_ENV", environment);
    const response = await rawRequest("/library", "GET", { host: "preview.example.replit.app" });
    expect(response.status).toBe(200);
    expect(response.location).toBeUndefined();
  });
});
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "./app";
import {
  markRuntimeDraining,
  markRuntimeReady,
  resetRuntimeStateForTests,
} from "./lib/runtime-lifecycle";
import { addRequestReference } from "./lib/request-reference";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  resetRuntimeStateForTests();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("API lifecycle responses", () => {
  it("reports ready only after startup and unavailable while draining", async () => {
    expect((await fetch(`${baseUrl}/api/healthz`)).status).toBe(503);
    markRuntimeReady();
    expect((await fetch(`${baseUrl}/api/healthz`)).status).toBe(200);
    markRuntimeDraining();
    const draining = await fetch(`${baseUrl}/api/healthz`);
    expect(draining.status).toBe(503);
    expect(await draining.json()).toMatchObject({ state: "draining" });
  });

  it("reports only a valid verified release revision", async () => {
    markRuntimeReady();
    const originalRevision = process.env["RELEASE_GIT_REVISION"];
    try {
      process.env["RELEASE_GIT_REVISION"] = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
      const published = await fetch(`${baseUrl}/api/healthz`);
      expect(await published.json()).toMatchObject({
        status: "ok",
        releaseRevision: "abcdef0123456789abcdef0123456789abcdef01",
      });

      process.env["RELEASE_GIT_REVISION"] = "not-safe-to-expose";
      const invalid = await fetch(`${baseUrl}/api/healthz`);
      expect(await invalid.json()).not.toHaveProperty("releaseRevision");
    } finally {
      if (originalRevision === undefined) {
        delete process.env["RELEASE_GIT_REVISION"];
      } else {
        process.env["RELEASE_GIT_REVISION"] = originalRevision;
      }
    }
  });

  it("returns the same safe request reference as the response header", async () => {
    markRuntimeReady();
    const response = await fetch(`${baseUrl}/api/healthz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const body = await response.json() as { requestId: string };
    expect(response.status).toBe(500);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  it("adds the request reference to caught JSON 500 responses", () => {
    expect(addRequestReference(
      { error: "Webhook processing error" },
      500,
      "safe-reference",
    )).toEqual({
      error: "Webhook processing error",
      requestId: "safe-reference",
    });
  });
});
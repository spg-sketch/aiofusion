import express from "express";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const captured = vi.hoisted(() => ({
  calls: vi.fn(async () => ({
    content: [{ type: "text", text: '{"descriptor":"Fixture description"}' }],
    usage: { input_tokens: 1, output_tokens: 1 },
  })),
  quota: vi.fn(async () => ({ allowed: false, spentGbp: 1, limitGbp: 0 })),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class { messages = { create: captured.calls }; },
}));
vi.mock("@workspace/db", async () => ({ ...await import("@workspace/db/schema"), db: {} }));
vi.mock("../lib/safe-fetch", () => ({
  fetchSiteContent: async () => ({ url: "https://fixture.invalid", title: "Fixture", description: "",
    text: "Synthetic fixture content. ".repeat(10) }),
}));
vi.mock("../lib/fair-usage", () => ({ checkMonthlySpendLimit: captured.quota }));
vi.mock("../lib/token-usage", () => ({ logTokenUsage: vi.fn(async () => {}) }));
import aiAssistRouter from "./ai-assist";

let server: Server, base: string;
beforeAll(async () => {
  vi.stubEnv("AI_INTEGRATIONS_ANTHROPIC_BASE_URL", "https://provider.invalid");
  vi.stubEnv("AI_INTEGRATIONS_ANTHROPIC_API_KEY", "synthetic-unused-provider-key");
  const app = express();
  app.use(express.json());
  app.use("/api", aiAssistRouter);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  vi.unstubAllEnvs();
});
it("characterises anonymous provider invocation without a spend-cap check (captured SDK, no paid call)", async () => {
  const response = await fetch(`${base}/api/ai-assist/draft-field`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://fixture.invalid", fieldId: "1.1" }),
  });
  expect(response.status).toBe(200);
  expect((await response.json() as { draft: string }).draft).toBe("Fixture description");
  expect(captured.calls).toHaveBeenCalledOnce();
  expect(captured.quota).not.toHaveBeenCalled();
});
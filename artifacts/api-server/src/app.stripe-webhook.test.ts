import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const webhook = vi.hoisted(() => ({
  handled: vi.fn(),
  mirrored: vi.fn(),
}));

vi.mock("./routes", async () => {
  const { Router } = await import("express");
  return { default: Router() };
});
vi.mock("pino-http", () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./middleware/rate-limit", () => ({
  generalLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./middlewares/authMiddleware", () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./middleware/platform-auth", () => ({
  resolvePlatformAccount: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./middleware/csp", () => ({
  cspMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("./lib/billing", () => ({
  getWebhookSecret: () => Promise.resolve("whsec_http_route_test"),
  handleStripeEvent: webhook.handled,
}));
vi.mock("./lib/stripe-client", () => {
  const stripe = new Stripe("sk_test_http_route");
  return {
    getUncachableStripeClient: () => Promise.resolve(stripe),
    getStripeSync: () =>
      Promise.resolve({
        processWebhook: webhook.mirrored,
      }),
  };
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: app } = await import("./app");
  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  webhook.handled.mockClear();
  webhook.mirrored.mockClear();
});

async function sendWebhook(body: string, signature?: string) {
  return fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  });
}

describe("Stripe raw-body HTTP webhook route", () => {
  it("verifies a valid signed raw event and dispatches business handling", async () => {
    const body = JSON.stringify({
      id: "evt_http_valid",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_http_valid" } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: "whsec_http_route_test",
    });

    const response = await sendWebhook(body, signature);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(webhook.handled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "evt_http_valid", type: "customer.subscription.updated" }),
    );
    expect(webhook.mirrored).toHaveBeenCalledWith(Buffer.from(body), signature);
  });

  it("rejects an invalid signature while preserving the malformed body as raw bytes", async () => {
    const malformedJson = '{"id":';
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: malformedJson,
      secret: "whsec_wrong_secret",
    });

    const response = await sendWebhook(malformedJson, signature);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid signature" });
    expect(webhook.handled).toHaveBeenCalledTimes(0);
  });

  it("rejects a missing signature before attempting JSON parsing or business handling", async () => {
    const response = await sendWebhook('{"id":');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid webhook request" });
    expect(webhook.handled).toHaveBeenCalledTimes(0);
  });
});
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeStripeWebhookReadinessProbe,
  getStripeCheckoutReadiness,
  setStripeCheckoutReadiness,
  startStripeWebhookReadinessProbe,
} from "./lib/stripe-readiness";

const webhook = vi.hoisted(() => ({
  handled: vi.fn(),
  mirrored: vi.fn(),
  syncSecret: vi.fn(),
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
    getStripeSync: (options?: { webhookSecret?: string }) => {
      webhook.syncSecret(options?.webhookSecret);
      return Promise.resolve({
        processWebhook: webhook.mirrored,
      });
    },
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
  webhook.handled.mockReset();
  webhook.mirrored.mockReset();
  webhook.syncSecret.mockReset();
  vi.stubEnv("DEPLOYMENT_ENV", "staging");
  setStripeCheckoutReadiness({ available: false, reason: "webhook_secret_mismatch" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  setStripeCheckoutReadiness({ available: false, reason: "webhook_validation_pending" });
});

// Node's fetch replaces a caller-supplied Host with the URL hostname, so use
// http.request to test the exact host seen by production middleware.
async function requestWithHost(
  path: string,
  host: string,
  body?: string,
  signature?: string,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        host,
        ...(body === undefined ? {} : {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        }),
        ...(signature ? { "stripe-signature": signature } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve(new Response(
        Buffer.concat(chunks).toString("utf8"),
        { status: response.statusCode },
      )));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function sendWebhook(body: string, signature?: string, host?: string) {
  return requestWithHost(
    "/api/stripe/webhook",
    host ?? (process.env.DEPLOYMENT_ENV === "production" ? "aiofusion.ai" : new URL(baseUrl).host),
    body,
    signature,
  );
}

describe("Stripe raw-body HTTP webhook route", () => {
  it("blocks production API and webhook requests on the former staging hosts", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    for (const host of ["staging.aiofusion.ai", "aio-fusion-staging.replit.app"]) {
      const response = await requestWithHost("/api/billing/checkout", host);
      expect(response.status).toBe(421);
      const webhookResponse = await sendWebhook('{"id":"evt_old_host"}', "signature", host);
      expect(webhookResponse.status).toBe(421);
    }
    expect(webhook.handled).not.toHaveBeenCalled();
    expect(webhook.mirrored).not.toHaveBeenCalled();
    expect((await requestWithHost(
      "/api/healthz",
      "aio-fusion-staging.replit.app",
    )).status).not.toBe(421);
  });

  it("accepts both production hostnames for API routing", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    for (const host of ["aiofusion.ai", "www.aiofusion.ai"]) {
      expect((await requestWithHost("/api/billing/checkout", host)).status).not.toBe(421);
    }
  });

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
    expect(webhook.syncSecret).toHaveBeenCalledWith("whsec_http_route_test");
    expect(getStripeCheckoutReadiness()).toEqual({ available: true });
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
    expect(getStripeCheckoutReadiness().available).toBe(false);
  });

  it("rejects a missing signature before attempting JSON parsing or business handling", async () => {
    const response = await sendWebhook('{"id":');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid webhook request" });
    expect(webhook.handled).toHaveBeenCalledTimes(0);
    expect(getStripeCheckoutReadiness().available).toBe(false);
  });

  async function deliver(type = "invoice.paid", object: unknown = { id: "in_recovery" }) {
    const body = JSON.stringify({ id: "evt_recovery", type, data: { object } });
    return sendWebhook(body, Stripe.webhooks.generateTestHeaderString({
      payload: body, secret: "whsec_http_route_test",
    }));
  }

  it("keeps checkout closed when signed business processing fails, then recovers on retry", async () => {
    webhook.handled.mockRejectedValueOnce(new Error("business transaction failed"));
    expect((await deliver()).status).toBe(500);
    expect(getStripeCheckoutReadiness().available).toBe(false);
    expect(webhook.mirrored).not.toHaveBeenCalled();
    expect((await deliver()).status).toBe(200);
    expect(getStripeCheckoutReadiness().available).toBe(true);
  });

  it("does not resolve a tagged readiness probe before successful business handling", async () => {
    const probe = startStripeWebhookReadinessProbe();
    webhook.handled.mockRejectedValueOnce(new Error("business transaction failed"));
    try {
      const object = { metadata: { aio_webhook_readiness_probe: probe.probeId } };
      expect((await deliver("customer.created", object)).status).toBe(500);
      probe.cancel();
      expect(await probe.verified).toBe(false);
      expect(getStripeCheckoutReadiness().available).toBe(false);
    } finally {
      probe.cancel();
    }
  });

  it("keeps a missing stripe.accounts mirror fail-soft and restores checkout", async () => {
    webhook.mirrored.mockRejectedValueOnce(
      Object.assign(new Error('relation "stripe.accounts" does not exist'), { code: "42P01" }),
    );
    expect((await deliver()).status).toBe(200);
    expect(webhook.handled).toHaveBeenCalledOnce();
    expect(getStripeCheckoutReadiness().available).toBe(true);
  });

  it("does not let a late startup timeout overwrite successful staging recovery", async () => {
    setStripeCheckoutReadiness({ available: false, reason: "webhook_validation_pending" });
    expect((await deliver()).status).toBe(200);
    expect(completeStripeWebhookReadinessProbe(false)).toBe(true);
    expect(getStripeCheckoutReadiness().available).toBe(true);
  });

  it("leaves checkout unavailable when the startup timeout has no successful delivery", () => {
    expect(completeStripeWebhookReadinessProbe(false)).toBe(false);
    expect(getStripeCheckoutReadiness()).toEqual({
      available: false, reason: "webhook_secret_mismatch",
    });
  });

  it("retains production's tagged startup probe requirement", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    expect((await deliver()).status).toBe(200);
    expect(getStripeCheckoutReadiness().available).toBe(false);
    const probe = startStripeWebhookReadinessProbe();
    try {
      expect((await deliver("customer.created", {
        metadata: { aio_webhook_readiness_probe: probe.probeId },
      })).status).toBe(200);
      expect(completeStripeWebhookReadinessProbe(await probe.verified)).toBe(true);
    } finally {
      probe.cancel();
    }
  });
});
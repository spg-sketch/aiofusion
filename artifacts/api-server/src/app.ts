import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { generalLimiter } from "./middleware/rate-limit";
import { authMiddleware } from "./middlewares/authMiddleware";
import { resolvePlatformAccount } from "./middleware/platform-auth";
import { cspMiddleware } from "./middleware/csp";

const app: Express = express();

app.set("trust proxy", 1);

function buildAllowedOrigins(): string[] {
  const origins: string[] = [];
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) {
    origins.push(`https://${replitDomain}`);
  }
  const explicitOrigin = process.env.ALLOWED_ORIGIN;
  if (explicitOrigin) {
    origins.push(...explicitOrigin.split(",").map((o) => o.trim()).filter(Boolean));
  }
  return origins;
}

const allowedOrigins = buildAllowedOrigins();

if (allowedOrigins.length === 0) {
  logger.warn("No CORS origin allowlist configured (REPLIT_DEV_DOMAIN / ALLOWED_ORIGIN). Cross-origin browser requests will be denied.");
}

const corsOptionsDelegate: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  const requestOrigin = req.headers.origin;

  let allowed = false;
  if (!requestOrigin) {
    // Non-browser or same-origin requests without an Origin header.
    allowed = true;
  } else {
    // Always allow the app to call its own API (same-origin). This covers the
    // deployed app, whose own domain is not in the static allowlist.
    try {
      if (req.headers.host && new URL(requestOrigin).host === req.headers.host) {
        allowed = true;
      }
    } catch {
      /* malformed Origin header - treat as not allowed */
    }
    if (!allowed && allowedOrigins.includes(requestOrigin)) {
      allowed = true;
    }
  }

  if (allowed) {
    callback(null, {
      origin: true,
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    });
  } else {
    callback(new Error("CORS: origin not allowed"));
  }
};

app.use(cspMiddleware);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors(corsOptionsDelegate));
app.use(cookieParser());

// Stripe webhook - registered BEFORE express.json() because signature
// verification needs the raw request body. Events are verified against the
// connection's webhook secret, dispatched to the billing business handlers
// (idempotent), then mirrored into the stripe schema by stripe-replit-sync.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"];
    if (!signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Invalid webhook request" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0]! : signature;
    try {
      const { getUncachableStripeClient, getStripeSync } = await import("./lib/stripe-client");
      const { handleStripeEvent, getWebhookSecret } = await import("./lib/billing");
      const webhookSecret = await getWebhookSecret();
      if (!webhookSecret) {
        logger.error("stripe webhook: no webhook secret configured yet");
        res.status(500).json({ error: "Webhook not configured" });
        return;
      }
      const stripe = await getUncachableStripeClient();
      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      await handleStripeEvent(event);

      // Mirror into the stripe schema tables (fail-soft - business state above
      // is the source of truth for entitlements).
      try {
        const sync = await getStripeSync();
        await sync.processWebhook(req.body, sig);
      } catch (err) {
        logger.warn({ err }, "stripe webhook: stripe-replit-sync mirror failed (non-fatal)");
      }

      res.status(200).json({ received: true });
    } catch (err) {
      logger.error({ err }, "stripe webhook: processing failed");
      res.status(400).json({ error: "Webhook processing error" });
    }
  },
);
// Logos are stored as data URLs and the intake blob can be sizeable, so the
// project store needs more headroom than the default 1mb.
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(authMiddleware);
app.use(resolvePlatformAccount);

app.use("/api", generalLimiter, router);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith("CORS")) {
    res.status(403).json({ error: "Forbidden: origin not allowed" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

export default app;

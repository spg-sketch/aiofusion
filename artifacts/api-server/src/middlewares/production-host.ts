import type { RequestHandler } from "express";
import { PRODUCTION_CANONICAL_HOST } from "../lib/app-url";

function canonicalRedirectTarget(requestTarget: string): string | undefined {
  if (/[\u0000-\u001f\u007f]/.test(requestTarget)) return undefined;

  let path = requestTarget;
  try {
    // Origin-form paths are preserved. Absolute-form HTTP requests contribute
    // only their path/query, never their authority or credentials.
    if (!path.startsWith("/")) {
      if (!/^https?:\/\//i.test(path)) return undefined;
      const absolute = new URL(path);
      path = `${absolute.pathname}${absolute.search}${absolute.hash}`;
    }

    const origin = `https://${PRODUCTION_CANONICAL_HOST}`;
    // Concatenate after the fixed origin: resolving a // or /\ path against
    // a base URL would instead allow the request to replace its authority.
    const target = `${origin}${path}`;
    return new URL(target).origin === origin ? target : undefined;
  } catch {
    return undefined;
  }
}

// A former staging hostname can remain reachable after a domain cutover.
// Production account/checkout APIs must only be served on the canonical host.
export const enforceProductionHost: RequestHandler = (req, res, next) => {
  if (
    process.env.DEPLOYMENT_ENV?.toLowerCase().trim() !== "production" ||
    req.path === "/api/healthz"
  ) {
    next();
    return;
  }

  const host = req.get("host")?.toLowerCase().replace(/:443$/, "").replace(/\.$/, "");
  if (host === `www.${PRODUCTION_CANONICAL_HOST}`) {
    if (req.method === "GET" || req.method === "HEAD") {
      const target = canonicalRedirectTarget(req.originalUrl);
      if (!target) {
        res.status(400).json({ error: "Invalid request target." });
        return;
      }
      res.redirect(308, target);
    } else {
      res.status(421).json({ error: "Use the production domain for API requests." });
    }
    return;
  }
  if (host === PRODUCTION_CANONICAL_HOST) {
    next();
    return;
  }
  res.status(421).json({ error: "Use the production domain for API requests." });
};
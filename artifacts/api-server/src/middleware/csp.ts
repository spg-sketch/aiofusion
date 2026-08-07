import type { Request, Response, NextFunction } from "express";

/**
 * Content Security Policy middleware.
 *
 * Applies a single CSP header to every response. Update this file
 * whenever a new external origin needs to be trusted — all policy
 * changes live here.
 *
 * Current external browser-facing origins:
 *   - fonts.googleapis.com  — Google Fonts stylesheet
 *   - fonts.gstatic.com     — Google Fonts file delivery
 *
 * All AI/API calls (Anthropic, OpenAI, Google PageSpeed) are made
 * server-side and do not appear in the browser CSP.
 */
function buildCspHeader(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  if (isDev) {
    // Allow Vite HMR websocket connections. In Replit the dev domain is the
    // same host, so 'self' already covers wss:// on the same origin, but we
    // add explicit ws/wss schemes as a safety net for local dev tooling.
    directives["connect-src"].push("ws:", "wss:");
  }

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");
}

const isDev = process.env.NODE_ENV !== "production";
const cspHeaderValue = buildCspHeader(isDev);

/**
 * CSP header for responses that must run a specific inline script (e.g. the
 * OAuth interstitial's auto-submit form). Identical to the global policy but
 * with a per-response nonce added to script-src. The caller must put the same
 * nonce on the <script> tag.
 */
export function cspHeaderWithScriptNonce(nonce: string): string {
  return cspHeaderValue.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`);
}

export function cspMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Content-Security-Policy", cspHeaderValue);
  next();
}

/**
 * Canonical base-URL helper shared by email templates, OAuth callbacks, and
 * other server-side code that needs to build absolute links.
 *
 * Priority order:
 *  1. CANONICAL_DOMAIN env var  -  the production or staging custom domain
 *     ("aiofusion.ai", "staging.aiofusion.ai").
 *  2. REPLIT_DOMAINS  -  the Replit-assigned dev/preview domain; comma-separated,
 *     first entry wins.
 *  3. Hard-coded production fallback ("https://aiofusion.ai").
 */
import { logger } from "./logger";

export const PRODUCTION_CANONICAL_HOST = "aiofusion.ai";
export const STAGING_CANONICAL_HOST = "staging.aiofusion.ai";

/**
 * Return only a hostname from a CANONICAL_DOMAIN value. Schemes and paths from
 * legacy values are intentionally discarded so they cannot alter generated
 * origins. Ports, credentials, and invalid hostnames are rejected.
 */
export function normalizeCanonicalDomain(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (
      !url.hostname ||
      url.port ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" && url.protocol !== "http:")
    ) {
      return undefined;
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    // The former www host must never become the public production origin.
    return hostname === `www.${PRODUCTION_CANONICAL_HOST}`
      ? PRODUCTION_CANONICAL_HOST
      : hostname;
  } catch {
    return undefined;
  }
}

export function isStagingDeployment(): boolean {
  return process.env.DEPLOYMENT_ENV?.toLowerCase().trim() === "staging";
}

export function isStagingCanonicalHost(host: string): boolean {
  return host === STAGING_CANONICAL_HOST || host.endsWith(`.${STAGING_CANONICAL_HOST}`);
}

export function getDeployedAppOrigin(): string | undefined {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.toLowerCase().trim();
  if (deploymentEnv === "staging") return `https://${STAGING_CANONICAL_HOST}`;
  if (deploymentEnv === "production") return `https://${PRODUCTION_CANONICAL_HOST}`;
  return undefined;
}

/**
 * Fail startup rather than allowing a production deployment to emit links to
 * staging, or staging to emit links to production.
 */
export function assertCanonicalDomainIsSafeForDeployment(): void {
  const deploymentEnv = process.env.DEPLOYMENT_ENV?.toLowerCase().trim();
  const nodeEnv = process.env.NODE_ENV?.toLowerCase().trim();
  const rawCanonical = process.env.CANONICAL_DOMAIN?.trim();
  const canonical = normalizeCanonicalDomain(rawCanonical);

  if (
    (nodeEnv === "production" || nodeEnv === "staging") &&
    deploymentEnv !== "production" &&
    deploymentEnv !== "staging"
  ) {
    throw new Error(
      "FATAL: deployed NODE_ENV requires DEPLOYMENT_ENV to be explicitly set " +
        'to "production" or "staging".',
    );
  }

  // Preview, development, and test environments may continue to use a Replit
  // domain and do not require deployment canonical settings.
  if (deploymentEnv !== "production" && deploymentEnv !== "staging") return;

  if (rawCanonical && !canonical) {
    throw new Error(
      `FATAL: ${deploymentEnv} deployment has an invalid CANONICAL_DOMAIN value.`,
    );
  }

  const requiredHost =
    deploymentEnv === "staging" ? STAGING_CANONICAL_HOST : PRODUCTION_CANONICAL_HOST;
  if (canonical !== requiredHost) {
    throw new Error(
      `FATAL: ${deploymentEnv} deployment requires CANONICAL_DOMAIN to normalize ` +
        `exactly to "${requiredHost}" (received "${canonical ?? "unset"}").`,
    );
  }
}

export function getAppBaseUrl(): string {
  const isStaging = isStagingDeployment();
  const canonical = normalizeCanonicalDomain(process.env.CANONICAL_DOMAIN);

  // Staging links must always remain on the isolated staging hostname. This is
  // deliberately independent of copied production secrets and Replit domains.
  if (isStaging) {
    if (canonical && canonical !== STAGING_CANONICAL_HOST) {
      logger.warn(
        { canonical },
        "Ignoring non-staging CANONICAL_DOMAIN on staging deployment",
      );
    }
    return `https://${STAGING_CANONICAL_HOST}`;
  }
  if (canonical) return `https://${canonical}`;

  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const first = normalizeCanonicalDomain(replitDomains.split(",")[0]);
    if (first) return `https://${first}`;
  }

  // Last-resort fallback. Reaching this on a non-production environment means
  // emailed links (invites, resets) will point at the live site and their
  // tokens will never resolve - log loudly so it can be diagnosed.
  logger.warn(
    { deploymentEnv: process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV ?? null },
    "getAppBaseUrl: CANONICAL_DOMAIN and REPLIT_DOMAINS both unset - falling back to the hardcoded production domain; emailed links may point at the wrong environment",
  );
  return `https://${PRODUCTION_CANONICAL_HOST}`;
}

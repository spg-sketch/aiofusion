/**
 * Canonical base-URL helper shared by email templates, OAuth callbacks, and
 * other server-side code that needs to build absolute links.
 *
 * Priority order:
 *  1. CANONICAL_DOMAIN env var  -  the production or staging custom domain
 *     ("www.aiofusion.ai", "staging.aiofusion.ai").
 *     On a staging deployment (DEPLOYMENT_ENV=staging) a CANONICAL_DOMAIN that
 *     does not contain the word "staging" is silently ignored so that prod
 *     secrets copied to staging cannot accidentally make emails link to live.
 *  2. REPLIT_DOMAINS  -  the Replit-assigned dev/preview domain; comma-separated,
 *     first entry wins.
 *  3. Hard-coded production fallback ("https://www.aiofusion.ai").
 */
export function getAppBaseUrl(): string {
  const isStaging =
    (process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV) === "staging";

  let canonical = process.env.CANONICAL_DOMAIN?.trim();
  if (isStaging && canonical && !canonical.includes("staging")) {
    // Prod CANONICAL_DOMAIN was copied to staging  -  ignore it so links don't
    // point at the live site.
    canonical = undefined;
  }
  if (canonical) return `https://${canonical}`;

  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const first = replitDomains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }

  return "https://www.aiofusion.ai";
}

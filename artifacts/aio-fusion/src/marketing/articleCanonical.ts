const FIRST_PARTY_HOSTS = new Set([
  "aiofusion.ai",
  "www.aiofusion.ai",
  "staging.aiofusion.ai",
]);

/**
 * CMS article URLs can outlive the deployment where they were first published.
 * Keep external source canonicals, but move our own articles to this build's
 * configured origin without changing the stored CMS record.
 */
export function articleCanonicalUrl(
  canonicalUrl: string | null,
  slug: string,
  siteOrigin: string,
): string {
  const origin = siteOrigin.replace(/\/+$/, "");
  if (canonicalUrl) {
    try {
      const url = new URL(canonicalUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return FIRST_PARTY_HOSTS.has(url.hostname.toLowerCase())
          ? `${origin}${url.pathname}${url.search}${url.hash}`
          : canonicalUrl;
      }
    } catch {
      // An invalid CMS value must not become a broken canonical link.
    }
  }
  return `${origin}/insights/${encodeURIComponent(slug)}`;
}
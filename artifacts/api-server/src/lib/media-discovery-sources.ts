/**
 * Structured answers can have no inline citation annotations even when the
 * search tool consulted the returned source pages. Only provider-owned
 * metadata is evidence here, never URLs written into the model's answer.
 */
export function mediaDiscoverySourceUrls(output: unknown): string[] {
  if (!Array.isArray(output)) return [];
  const urls = new Set<string>();
  const object = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;

  const addUrl = (value: unknown, unwrap = true): void => {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return;
    try {
      const parsed = new URL(value);
      if (parsed.username || parsed.password) return;
      urls.add(value);
      // Preserve the proxy's original public-page reference as well as its
      // wrapper. Actual downloads still go through the SSRF-safe fetcher.
      if (unwrap && parsed.hostname === "please.untaint.us") {
        addUrl(parsed.searchParams.get("url"), false);
      }
    } catch { /* Malformed provider metadata is not evidence. */ }
  };

  for (const value of output) {
    const item = object(value);
    if (!item) continue;
    if (item.type === "web_search_call" && item.status === "completed") {
      const action = object(item.action);
      if (action?.type === "search" && Array.isArray(action.sources)) {
        for (const source of action.sources) {
          const entry = object(source);
          if (entry?.type === "url") addUrl(entry.url);
        }
      } else if (action?.type === "open_page" || action?.type === "find_in_page") {
        addUrl(action.url);
      }
    } else if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        const content = object(part);
        if (!Array.isArray(content?.annotations)) continue;
        for (const annotation of content.annotations) {
          const entry = object(annotation);
          if (entry?.type === "url_citation") addUrl(entry.url);
        }
      }
    }
  }
  return [...urls];
}
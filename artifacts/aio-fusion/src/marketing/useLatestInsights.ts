import { useEffect, useState } from "react";
import type { PublicInsight } from "./InsightsPage";
import { HIDDEN_PUBLIC_INSIGHT_SLUGS } from "./pageMeta";

const hiddenSlugs = new Set<string>(HIDDEN_PUBLIC_INSIGHT_SLUGS);

export function latestPublishedInsights(rows: PublicInsight[]): PublicInsight[] {
  const date = (value: string | null) => {
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const published = rows
    .filter((article) => article.status === "published" && !hiddenSlugs.has(article.slug))
    .map((article, index) => ({ article, index }));
  const newestFirst = (a: typeof published[number], b: typeof published[number]) =>
    date(b.article.datePublished) - date(a.article.datePublished) || a.index - b.index;
  const pinned = published.filter(({ article }) => article.pinned).sort(newestFirst);
  const unpinned = published.filter(({ article }) => !article.pinned).sort(newestFirst);
  return [...pinned, ...unpinned].slice(0, 3).map(({ article }) => article);
}

export function useLatestInsights() {
  const [articles, setArticles] = useState(() =>
    latestPublishedInsights(globalThis.__AIO_PRERENDER_INSIGHTS__ ?? []),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
        const response = await fetch(`${base}/api/insights`, {
          signal: request.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to load latest articles");
        const rows: PublicInsight[] = await response.json();
        if (!Array.isArray(rows)) throw new Error("Invalid articles response");
        if (!request.signal.aborted) {
          setArticles(latestPublishedInsights(rows));
          setError(false);
        }
      } catch {
        if (!request.signal.aborted) setError(true);
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", load);
    };
  }, []);

  return { articles, loading, error };
}
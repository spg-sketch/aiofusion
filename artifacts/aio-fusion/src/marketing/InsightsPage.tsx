import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BookOpen } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { ARTICLE_META, HIDDEN_PUBLIC_INSIGHT_SLUGS, PAGE_META, type ArticleMeta } from "./pageMeta";
import { articleCanonicalUrl } from "./articleCanonical";
import { vars } from "./vars";
import ArticleDetailView from "./ArticleDetailView";
import { NEW_ARTICLES, type Article, type ArticleSection } from "./articles-data";

export type PublicInsight = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  externalUrl: string | null;
  datePublished: string | null;
  dateModified: string | null;
  body: ArticleSection[];
  coverImageUrl: string | null;
  coverImageAlt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  focusKeyphrase: string | null;
  canonicalUrl: string | null;
  status: string;
  pinned: boolean;
};

declare global {
  var __AIO_PRERENDER_INSIGHTS__: PublicInsight[] | undefined;
}

const hiddenPublicInsightSlugs = new Set<string>(HIDDEN_PUBLIC_INSIGHT_SLUGS);

export const FALLBACK_INSIGHTS: PublicInsight[] = [
  ...NEW_ARTICLES.map((article) => ({
    id: article.id,
    slug: article.id,
    title: article.title,
    excerpt: article.excerpt,
    tag: article.tag,
    externalUrl: null,
    datePublished: article.datePublished ?? null,
    dateModified: article.dateModified ?? null,
    body: article.sections,
    coverImageUrl: `/images/insights/${article.imgSrc}.webp`,
    coverImageAlt: article.title,
    seoTitle: ARTICLE_META[article.id]?.title ?? `${article.title} | AIO Fusion`,
    seoDescription: ARTICLE_META[article.id]?.description ?? article.excerpt,
    focusKeyphrase: article.tag === "Guidance" ? "AIO Fusion guidance" : "AI visibility",
    canonicalUrl: `https://aiofusion.ai/insights/${article.id}`,
    status: "published",
    pinned: false,
  })),
  {
    id: "ext-guide",
    slug: "ext-guide",
    title: "A Marketer's Guide to Winning AI Authority in 2026",
    excerpt: "What is AIO? And is PR really the new SEO? Explore AI's impact on marketing.",
    tag: "Guide",
    externalUrl: "https://simpaticopraiauthorityguide.carrd.co/",
    datePublished: "2026-07-15",
    dateModified: "2026-08-07",
    body: [],
    coverImageUrl: "/images/insights/blog-tile-1.webp",
    coverImageAlt: "A Marketer's Guide to Winning AI Authority in 2026",
    seoTitle: "A Marketer's Guide to Winning AI Authority in 2026",
    seoDescription: "What is AIO? And is PR really the new SEO?",
    focusKeyphrase: "AI authority",
    canonicalUrl: "https://simpaticopraiauthorityguide.carrd.co/",
    status: "published",
    pinned: false,
  },
].filter((article) => !hiddenPublicInsightSlugs.has(article.slug));

function publicInsights(rows: PublicInsight[]): PublicInsight[] {
  return rows.filter((article) => !hiddenPublicInsightSlugs.has(article.slug));
}

function initialInsights(): PublicInsight[] {
  return globalThis.__AIO_PRERENDER_INSIGHTS__ !== undefined
    ? publicInsights(globalThis.__AIO_PRERENDER_INSIGHTS__)
    : FALLBACK_INSIGHTS;
}

function apiPath(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/+$/, "")}/api${path}`;
}

export function articleMeta(article: PublicInsight, canonicalBase = `https://${import.meta.env.VITE_CANONICAL_DOMAIN || "aiofusion.ai"}`): ArticleMeta {
  const canonical = articleCanonicalUrl(
    article.canonicalUrl,
    article.slug,
    canonicalBase,
  );
  return {
    articleTitle: article.title,
    excerpt: article.excerpt,
    title: article.seoTitle || article.title,
    description: article.seoDescription || article.excerpt,
    canonical,
    ogTitle: article.title,
    ogDescription: article.excerpt,
    ogType: "article",
    datePublished: article.datePublished || undefined,
    dateModified: article.dateModified || undefined,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.excerpt,
      mainEntityOfPage: canonical,
      image: article.coverImageUrl || undefined,
      author: { "@type": "Organization", name: "AIO Fusion" },
      publisher: { "@type": "Organization", name: "AIO Fusion" },
    },
  };
}

export default function InsightsPage(props: {
  onLogin: () => void;
  onBack: () => void;
  onNavigate: (v: string) => void;
  isAuthed?: boolean;
  initialFilter?: string | null;
  onClearFilter?: () => void;
  openArticleId?: string | null;
  onOpenArticle?: (id: string) => void;
  onCloseArticle?: () => void;
}) {
  const {
    initialFilter,
    onClearFilter,
    openArticleId: controlledArticleId,
    onOpenArticle,
    onCloseArticle,
    ...marketingProps
  } = props;
  const [articles, setArticles] = useState<PublicInsight[]>(initialInsights);
  const [activeTag, setActiveTag] = useState<string | null>(initialFilter ?? null);
  const openArticleId = controlledArticleId ?? null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath("/insights"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load Insights");
        return response.json() as Promise<PublicInsight[]>;
      })
      .then((rows) => {
        if (rows.length) setArticles(publicInsights(rows));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const allTags = useMemo(() => Array.from(new Set(articles.map((article) => article.tag))), [articles]);
  const visible = activeTag ? articles.filter((article) => article.tag === activeTag) : articles;
  const isGuidance = activeTag === "Guidance";
  const openArticle = openArticleId ? articles.find((article) => article.slug === openArticleId) : undefined;

  if (openArticle && !openArticle.externalUrl) {
    const article: Article = {
      id: openArticle.id,
      title: openArticle.title,
      tag: openArticle.tag,
      excerpt: openArticle.excerpt,
      datePublished: openArticle.datePublished || undefined,
      dateModified: openArticle.dateModified || undefined,
      imgSrc: openArticle.coverImageUrl || "",
      sections: openArticle.body,
    };
    return (
      <MarketingPage title={openArticle.title} showTitle={false} {...marketingProps}>
        <PageHead meta={articleMeta(openArticle)} />
        <ArticleDetailView
          article={article}
          onBack={() => {
            onCloseArticle?.();
            window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
          }}
          coverImg={openArticle.coverImageUrl || ""}
          coverAlt={openArticle.coverImageAlt}
        />
      </MarketingPage>
    );
  }

  return (
    <MarketingPage
      title={isGuidance ? "Guidance" : "Insights"}
      eyebrow={<><BookOpen size={12} /> {isGuidance ? "How-to library" : "Library"}</> as never}
      {...marketingProps}
    >
      <PageHead meta={PAGE_META.insights} />
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: vars.g500 }}>
        {isGuidance
          ? "How-to articles and videos for using the AIO Fusion platform: set-up, Authority Reports, Optimiser, Media Research and more."
          : "Practical thinking on generative engine optimisation (GEO), AI visibility, and the future of PR and marketing. Filter to Guidance for platform how-to content."}
      </p>
      {!isGuidance && (
        <p className="text-[14px] font-light leading-[1.8] mb-6" style={{ color: vars.g500 }}>
          New to GEO? Explore our practical articles on AI visibility and measurement.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <button
          type="button"
          onClick={() => { setActiveTag(null); onClearFilter?.(); }}
          className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
          style={{ background: activeTag === null ? vars.navy : "transparent", color: activeTag === null ? "white" : vars.g500, border: `1px solid ${activeTag === null ? vars.navy : vars.g200}` }}
        >
          All
        </button>
        {allTags.map((tag) => (
          <button
            type="button"
            key={tag}
            onClick={() => setActiveTag(tag)}
            className="text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
            style={{ background: activeTag === tag ? vars.navy : "transparent", color: activeTag === tag ? "white" : vars.g500, border: `1px solid ${activeTag === tag ? vars.navy : vars.g200}` }}
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-6">
        {visible.map((article) => (
          <a
            key={article.id}
            href={article.externalUrl || `${import.meta.env.BASE_URL}insights/${article.slug}`}
            {...(article.externalUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={article.externalUrl ? undefined : (event) => {
              event.preventDefault();
              onOpenArticle?.(article.slug);
              window.scrollTo(0, 0);
            }}
            className="group block rounded-2xl overflow-hidden bg-white transition-all hover:shadow-xl hover:-translate-y-1"
            style={{ border: `1px solid ${vars.g200}` }}
          >
            <div className="aspect-[16/10] overflow-hidden" style={{ background: vars.navy }}>
              {article.coverImageUrl && (
                <img
                  src={article.coverImageUrl}
                  alt={article.coverImageAlt}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              )}
            </div>
            <div className="p-6">
              <span className="inline-block text-[10px] font-bold uppercase tracking-[0.16em] mb-3 px-2 py-0.5 rounded" style={{ background: `${vars.accent}18`, color: vars.accent }}>{article.tag}</span>
              <h2 className="text-[18px] font-semibold mb-2 leading-snug" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{article.title}</h2>
              <p className="text-[13px] font-light leading-[1.7]" style={{ color: vars.g500 }}>{article.excerpt}</p>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold mt-4" style={{ color: vars.accent }}>Read <ArrowUpRight size={12} /></span>
            </div>
          </a>
        ))}
      </div>
    </MarketingPage>
  );
}

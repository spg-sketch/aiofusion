/**
 * Pre-render entry point.
 *
 * Compiled by `vite build --config vite.ssr.config.ts` into
 * `dist/ssr/prerender-entry.js` and then executed with `node`.
 *
 * Reads `dist/public/index.html` as a shell template, renders each public
 * marketing route to static HTML, injects the markup + per-page head tags,
 * and writes:
 *   dist/public/index.html              (landing page in-place)
 *   dist/public/admin/index.html        (authenticated CMS app shell)
 *   dist/public/<route>/index.html      (one per public route)
 *   dist/public/insights/<id>/index.html (one per complete article)
 *   dist/public/sitemap.xml
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import LandingPageC from "./marketing/LandingPage";
import ForInhousePage from "./marketing/ForInhousePage";
import ForAgenciesPage from "./marketing/ForAgenciesPage";
import ForAgentsPage from "./marketing/ForAgentsPage";
import InsightsPage from "./marketing/InsightsPage";
import AboutPage from "./marketing/AboutPage";
import ContactPage from "./marketing/ContactPage";
import PricingPage from "./marketing/PricingPage";
import TrustSecurityPage from "./marketing/TrustSecurityPage";
import PrivacyPolicyPage from "./marketing/PrivacyPolicyPage";
import JournalistPrivacyPage from "./marketing/JournalistPrivacyPage";
import TermsConditionsPage from "./marketing/TermsConditionsPage";

import {
  PAGE_META,
  ARTICLE_META,
  PUBLIC_PAGE_DEFINITIONS,
  PUBLIC_ROUTES,
  ARTICLE_SLUGS,
  structuredDataFor,
} from "./marketing/pageMeta";
import type { PageMeta, ArticleMeta } from "./marketing/pageMeta";
import type { PublicInsight } from "./marketing/InsightsPage";
import { serializeJsonLdForHtml } from "./marketing/safeJsonLd";

// ---------------------------------------------------------------------------
// No-op handlers passed to all marketing components
// ---------------------------------------------------------------------------
const noop = () => {};
const commonProps = { onLogin: noop, onBack: noop, onNavigate: noop, isAuthed: false };

// ---------------------------------------------------------------------------
// Build the component tree for each route
// ---------------------------------------------------------------------------
function buildElement(route: string, articleId?: string): React.ReactElement | null {
  switch (route) {
    case "":
      return createElement(LandingPageC, { onLogin: noop, onNavigate: noop, isAuthed: false });
    case "for-inhouse":
      return createElement(ForInhousePage, commonProps);
    case "for-agencies":
      return createElement(ForAgenciesPage, commonProps);
    case "for-agents":
      return createElement(ForAgentsPage, commonProps);
    case "insights":
      return createElement(InsightsPage, {
        ...commonProps,
        initialFilter: null,
        openArticleId: articleId ?? null,
        onOpenArticle: noop,
        onCloseArticle: noop,
        onClearFilter: noop,
      });
    case "about":
      return createElement(AboutPage, commonProps);
    case "contact":
      return createElement(ContactPage, commonProps);
    case "pricing":
      return createElement(PricingPage, { onLogin: noop, onNavigate: noop, isAuthed: false });
    case "trust-security":
      return createElement(TrustSecurityPage, commonProps);
    case "privacy-policy":
      return createElement(PrivacyPolicyPage, commonProps);
    case "journalist-privacy":
      return createElement(JournalistPrivacyPage, commonProps);
    case "terms-conditions":
      return createElement(TermsConditionsPage, commonProps);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Build the <head> additions for a given PageMeta
// ---------------------------------------------------------------------------
const OG_IMAGE = "https://aiofusion.ai/opengraph.jpg";

function buildHeadTags(meta: PageMeta): string {
  const ogTitle = meta.ogTitle ?? meta.title;
  const ogDesc = meta.ogDescription ?? meta.description;
  const ogType = meta.ogType ?? "website";
  const structuredData = structuredDataFor(meta);
  const ldJson = structuredData ? serializeJsonLdForHtml(structuredData) : null;

  return `
  <title>${escHtml(meta.title)}</title>
  <meta name="description" content="${escAttr(meta.description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escAttr(meta.canonical)}" />
  <meta property="og:title" content="${escAttr(ogTitle)}" />
  <meta property="og:description" content="${escAttr(ogDesc)}" />
  <meta property="og:type" content="${escAttr(ogType)}" />
  <meta property="og:locale" content="en_GB" />
  <meta property="og:url" content="${escAttr(meta.canonical)}" />
  <meta property="og:image" content="${escAttr(OG_IMAGE)}" />
  <meta property="og:site_name" content="AIO Fusion" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escAttr(ogDesc)}" />
  <meta name="twitter:image" content="${escAttr(OG_IMAGE)}" />${ldJson ? `\n  <script type="application/ld+json">${ldJson}</script>` : ""}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Inject rendered markup + head tags into the shell template
// ---------------------------------------------------------------------------
function injectIntoTemplate(
  template: string,
  bodyHtml: string,
  headTags: string,
): string {
  // Replace default title/meta block, then inject body
  let out = template;

  // Remove/replace the default <title> tag
  out = out.replace(/<title>[^<]*<\/title>/, "");
  // Remove default description
  out = out.replace(/<meta\s+name="description"[^>]*>/i, "");
  // Remove default canonical
  out = out.replace(/<link\s+rel="canonical"[^>]*>/i, "");
  // Remove default OG/Twitter meta tags
  out = out.replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, "");
  out = out.replace(/<meta\s+name="twitter:[^"]*"[^>]*>/gi, "");

  // Inject per-page head tags before </head>
  out = out.replace("</head>", `${headTags}\n  </head>`);

  // Inject rendered body into root div
  out = out.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);

  return out;
}

// ---------------------------------------------------------------------------
// Sitemap generation
// ---------------------------------------------------------------------------
function buildSitemap(lastmod: string, articleSlugs: string[]): string {
  const configuredDomain = process.env.CANONICAL_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const BASE = configuredDomain ? `https://${configuredDomain}` : "https://aiofusion.ai";
  const urls: string[] = [];

  for (const { slug, priority } of PUBLIC_ROUTES) {
    const loc = slug === "" ? `${BASE}/` : `${BASE}/${slug}`;
    urls.push(
      `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`,
    );
  }

  for (const articleSlug of articleSlugs) {
    urls.push(
      `  <url>\n    <loc>${BASE}/insights/${articleSlug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>0.8</priority>\n  </url>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
// Main prerender logic
// ---------------------------------------------------------------------------
export interface PrerenderOptions {
  /** Override the build output directory for a controlled local fixture. */
  distPublic?: string;
  /** Use a known snapshot instead of making a network request. */
  publishedInsights?: PublicInsight[];
  /** Set to null to guarantee that a test never performs an API lookup. */
  canonicalDomain?: string | null;
  /** Keep generated dates deterministic in regression tests. */
  lastmod?: string;
}

export interface PrerenderResult {
  routesWritten: number;
  errors: number;
  articleSlugs: string[];
}

export async function runPrerender(options: PrerenderOptions = {}): Promise<PrerenderResult> {
  const distPublic = options.distPublic ?? path.join(process.cwd(), "dist/public");
  const templatePath = path.join(distPublic, "index.html");

  if (!fs.existsSync(templatePath)) {
    throw new Error("❌  dist/public/index.html not found - run vite build first");
  }

  const template = fs.readFileSync(templatePath, "utf-8");
  const lastmod = options.lastmod ?? new Date().toISOString().slice(0, 10);

  let publishedInsights: PublicInsight[] = [];
  const configuredDomain = (Object.prototype.hasOwnProperty.call(options, "canonicalDomain")
    ? options.canonicalDomain
    : process.env.CANONICAL_DOMAIN)
    ?.replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const hasControlledSnapshot = Object.prototype.hasOwnProperty.call(options, "publishedInsights");
  if (hasControlledSnapshot) {
    publishedInsights = options.publishedInsights ?? [];
    globalThis.__AIO_PRERENDER_INSIGHTS__ = publishedInsights;
  } else {
    delete globalThis.__AIO_PRERENDER_INSIGHTS__;
    if (configuredDomain) {
      try {
        const response = await fetch(`https://${configuredDomain}/api/insights`, {
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          publishedInsights = await response.json() as PublicInsight[];
          globalThis.__AIO_PRERENDER_INSIGHTS__ = publishedInsights;
          console.log(`  ✓  Loaded ${publishedInsights.length} published Insights stories`);
        }
      } catch {
        console.warn("  !  Published Insights API unavailable; using the checked-in SEO snapshot");
      }
    }
  }

  const articleSlugs = publishedInsights.length
    ? publishedInsights.filter((article) => !article.externalUrl && article.body.length > 0).map((article) => article.slug)
    : ARTICLE_SLUGS;

  let ok = 0;
  let errors = 0;

  // Helper to write a pre-rendered file
  function writeRoute(outPath: string, html: string): void {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, "utf-8");
    console.log(`  ✓  ${outPath.replace(distPublic, "")}`);
    ok++;
  }

  // Assert the emitted HTML is a real pre-rendered page, not the empty shell.
  // A silently-shell-only page is the exact "search engines see nothing" failure
  // this guard exists to prevent, so treat as fatal SEO regression.
  function assertRealPage(slug: string, html: string, meta: PageMeta | ArticleMeta): void {
    const label = slug === "" ? "landing" : slug;
    if (html.includes('<div id="root"></div>')) {
      console.error(`  ✗  Route "${label}" produced shell-only HTML (empty #root)`);
      errors++;
      return;
    }
    if (!html.includes("<title>") || html.includes("<title></title>")) {
      console.error(`  ✗  Route "${label}" is missing a <title>`);
      errors++;
      return;
    }
    if (!html.includes(`href="${meta.canonical}"`)) {
      console.error(`  ✗  Route "${label}" is missing its canonical link (${meta.canonical})`);
      errors++;
      return;
    }
    if (!html.includes('name="robots" content="index, follow"')) {
      console.error(`  ✗  Route "${label}" is missing the robots index,follow tag`);
      errors++;
    }
  }

  // Render every canonical public route. Never skip a definition because of
  // missing metadata or a missing component: both are fatal SEO regressions.
  // The static deployment has no history fallback, so authenticated deep links
  // also need a concrete app-shell file. React takes over routing after load.
  writeRoute(path.join(distPublic, "admin", "index.html"), template);

  for (const { view, slug } of PUBLIC_PAGE_DEFINITIONS) {
    const meta: PageMeta = PAGE_META[view];
    if (!meta) {
      console.error(`  ✗  No page metadata for "${view}"`);
      errors++;
      continue;
    }

    const el = buildElement(view === "landing" ? "" : view);
    if (!el) {
      console.error(`  ✗  No component for public route "${view}"`);
      errors++;
      continue;
    }

    let bodyHtml = "";
    try {
      bodyHtml = renderToStaticMarkup(el);
    } catch (err) {
      console.error(`  ✗  Error rendering public route "${view}":`, err);
      errors++;
      continue;
    }

    const finalHtml = injectIntoTemplate(template, bodyHtml, buildHeadTags(meta));
    assertRealPage(slug, finalHtml, meta);

    if (slug === "") {
      // Landing page overwrites the shell index.html in-place
      writeRoute(path.join(distPublic, "index.html"), finalHtml);
    } else {
      writeRoute(path.join(distPublic, slug, "index.html"), finalHtml);
    }
  }

  // Render each complete article
  for (const articleSlug of articleSlugs) {
    const published = publishedInsights.find((article) => article.slug === articleSlug);
    const meta: ArticleMeta | undefined = published ? {
      articleTitle: published.title,
      excerpt: published.excerpt,
      title: published.seoTitle || published.title,
      description: published.seoDescription || published.excerpt,
      canonical: published.canonicalUrl || `https://${configuredDomain || "aiofusion.ai"}/insights/${published.slug}`,
      ogTitle: published.title,
      ogDescription: published.excerpt,
      ogType: "article",
      datePublished: published.datePublished || undefined,
      dateModified: published.dateModified || published.datePublished || undefined,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: published.title,
        description: published.excerpt,
        image: published.coverImageUrl || undefined,
        mainEntityOfPage: published.canonicalUrl || undefined,
        author: { "@type": "Organization", name: "AIO Fusion" },
        publisher: { "@type": "Organization", name: "AIO Fusion" },
      },
    } : ARTICLE_META[articleSlug];
    if (!meta) {
      console.error(`  ✗  No article metadata for "${articleSlug}"`);
      errors++;
      continue;
    }

    const el = buildElement("insights", articleSlug);
    if (!el) {
      console.error(`  ✗  No component for article "${articleSlug}"`);
      errors++;
      continue;
    }

    let bodyHtml = "";
    try {
      bodyHtml = renderToStaticMarkup(el);
    } catch (err) {
      console.error(`  ✗  Error rendering article "${articleSlug}":`, err);
      errors++;
      continue;
    }

    const finalHtml = injectIntoTemplate(template, bodyHtml, buildHeadTags(meta));
    assertRealPage(`insights/${articleSlug}`, finalHtml, meta);
    const escapedArticleTitle = escHtml(meta.articleTitle);
    if (!finalHtml.includes(escapedArticleTitle)) {
      console.error(`  ✗  Article "${articleSlug}" is missing its unique visible title`);
      errors++;
    }
    if (!finalHtml.includes("<article") && !finalHtml.includes("article-body")) {
      console.error(`  ✗  Article "${articleSlug}" is missing its article body`);
      errors++;
    }
    if (!finalHtml.includes('aria-label="Breadcrumb"')) {
      console.error(`  ✗  Article "${articleSlug}" is missing visible breadcrumbs`);
      errors++;
    }
    if (!finalHtml.includes("Continue exploring AI visibility")) {
      console.error(`  ✗  Article "${articleSlug}" is missing related-reading links`);
      errors++;
    }
    writeRoute(path.join(distPublic, "insights", articleSlug, "index.html"), finalHtml);
  }

  // Write sitemap.xml
  const sitemapPath = path.join(distPublic, "sitemap.xml");
  fs.writeFileSync(sitemapPath, buildSitemap(lastmod, articleSlugs), "utf-8");
  console.log(`  ✓  /sitemap.xml  (${PUBLIC_ROUTES.length + articleSlugs.length} URLs, lastmod ${lastmod})`);

  // Summary
  if (errors > 0) {
    throw new Error(`Prerender completed with ${errors} error(s). ${ok} route(s) written.`);
  }
  console.log(`\nPrerender complete - ${ok} routes written, sitemap updated.`);
  return { routesWritten: ok, errors, articleSlugs };
}

const runningAsScript = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (runningAsScript) {
  try {
    await runPrerender();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

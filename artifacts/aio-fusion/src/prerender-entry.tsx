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
 *   dist/public/<route>/index.html      (one per public route)
 *   dist/public/insights/<id>/index.html (one per complete article)
 *   dist/public/sitemap.xml
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "node:fs";
import path from "node:path";

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
import TermsConditionsPage from "./marketing/TermsConditionsPage";

import { PAGE_META, ARTICLE_META, PUBLIC_ROUTES, ARTICLE_SLUGS } from "./marketing/pageMeta";
import type { PageMeta, ArticleMeta } from "./marketing/pageMeta";

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
  const ldJson = meta.jsonLd ? JSON.stringify(meta.jsonLd) : null;

  return `
  <title>${escHtml(meta.title)}</title>
  <meta name="description" content="${escAttr(meta.description)}" />
  <link rel="canonical" href="${escAttr(meta.canonical)}" />
  <meta property="og:title" content="${escAttr(ogTitle)}" />
  <meta property="og:description" content="${escAttr(ogDesc)}" />
  <meta property="og:type" content="${escAttr(ogType)}" />
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
function buildSitemap(lastmod: string): string {
  const BASE = "https://aiofusion.ai";
  const urls: string[] = [];

  for (const { slug, priority } of PUBLIC_ROUTES) {
    const loc = slug === "" ? `${BASE}/` : `${BASE}/${slug}`;
    urls.push(
      `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`,
    );
  }

  for (const articleSlug of ARTICLE_SLUGS) {
    urls.push(
      `  <url>\n    <loc>${BASE}/insights/${articleSlug}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>0.8</priority>\n  </url>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// ---------------------------------------------------------------------------
// Main prerender logic
// ---------------------------------------------------------------------------
const distPublic = path.join(process.cwd(), "dist/public");
const templatePath = path.join(distPublic, "index.html");

if (!fs.existsSync(templatePath)) {
  console.error("❌  dist/public/index.html not found - run vite build first");
  process.exit(1);
}

const template = fs.readFileSync(templatePath, "utf-8");
const lastmod = new Date().toISOString().slice(0, 10);

let ok = 0;
let errors = 0;

// Helper to write a pre-rendered file
function writeRoute(outPath: string, html: string): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf-8");
  console.log(`  ✓  ${outPath.replace(distPublic, "")}`);
  ok++;
}

// Render each top-level route
for (const { slug } of PUBLIC_ROUTES) {
  const metaKey = slug === "" ? "landing" : slug;
  const meta = PAGE_META[metaKey];
  if (!meta) {
    console.warn(`  ⚠  No pageMeta for route "${metaKey}" - skipping`);
    continue;
  }

  const el = buildElement(slug);
  if (!el) {
    console.warn(`  ⚠  No component for route "${slug}" - skipping`);
    continue;
  }

  let bodyHtml = "";
  try {
    bodyHtml = renderToStaticMarkup(el);
  } catch (err) {
    console.error(`  ✗  Error rendering "${slug}":`, err);
    errors++;
    continue;
  }

  const finalHtml = injectIntoTemplate(template, bodyHtml, buildHeadTags(meta));

  if (slug === "") {
    // Landing page overwrites the shell index.html in-place
    writeRoute(path.join(distPublic, "index.html"), finalHtml);
  } else {
    writeRoute(path.join(distPublic, slug, "index.html"), finalHtml);
  }
}

// Render each complete article
for (const articleSlug of ARTICLE_SLUGS) {
  const meta: ArticleMeta = ARTICLE_META[articleSlug];
  if (!meta) continue;

  const el = buildElement("insights", articleSlug);
  if (!el) continue;

  let bodyHtml = "";
  try {
    bodyHtml = renderToStaticMarkup(el);
  } catch (err) {
    console.error(`  ✗  Error rendering article "${articleSlug}":`, err);
    errors++;
    continue;
  }

  const finalHtml = injectIntoTemplate(template, bodyHtml, buildHeadTags(meta));
  writeRoute(path.join(distPublic, "insights", articleSlug, "index.html"), finalHtml);
}

// Write sitemap.xml
const sitemapPath = path.join(distPublic, "sitemap.xml");
fs.writeFileSync(sitemapPath, buildSitemap(lastmod), "utf-8");
console.log(`  ✓  /sitemap.xml  (${PUBLIC_ROUTES.length + ARTICLE_SLUGS.length} URLs, lastmod ${lastmod})`);

// Summary
if (errors > 0) {
  console.error(`\nPrerender completed with ${errors} error(s). ${ok} route(s) written.`);
  process.exit(1);
} else {
  console.log(`\nPrerender complete - ${ok} routes written, sitemap updated.`);
}

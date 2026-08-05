# AIO Fusion — SEO Audit & Pre-render Implementation

**Date:** July 2025  
**Scope:** Public marketing pages — build-time pre-rendering, head management, structural HTML fixes, sitemap, robots.txt.

---

## Baseline Findings (before this task)

| Issue | Pages | Severity |
|---|---|---|
| `<title>AIO Fusion Demo` in index.html — "Demo" is a production title | All | **Critical** |
| No per-page `<title>` or `<meta name="description">` | All | **Critical** |
| No Open Graph or Twitter Card tags | All | **High** |
| No canonical URL tags | All | **High** |
| No JSON-LD structured data | All | **High** |
| Crawlers receive an empty `<div id="root">` (JavaScript required) | All public | **High** |
| `sitemap.xml` listed only `/` with no `<lastmod>` | — | **High** |
| All nav and footer links were `<button onClick>` — not crawlable anchor elements | All | **High** |
| No `<nav>` landmark wrapping the main navigation | All | Medium |
| `robots.txt` allowed everything including `/api/` (unnecessary crawl waste) | — | Medium |
| Article thumbnail images had `alt="" aria-hidden="true"` — decorative, acceptable | Insights | Low |

---

## What Was Implemented

### 1. Head management (`src/marketing/PageHead.tsx` + `src/marketing/pageMeta.ts`)

- `pageMeta.ts` — central record of per-page metadata: `title`, `description`, `canonical`, OG type, JSON-LD. Covers all 11 public routes and all 6 complete insights articles.
- `PageHead.tsx` — React component that fires a `useEffect` to imperatively set `document.title`, `<meta>` tags, `<link rel="canonical">`, OG/Twitter tags, and an `application/ld+json` script when a user navigates client-side within the SPA. Returns `null` — no DOM.

Each marketing component (`LandingPage`, `AboutPage`, `ContactPage`, `ForInhousePage`, `ForAgenciesPage`, `InsightsPage`, `PricingPage`, `TrustSecurityPage`, `PrivacyPolicyPage`, `TermsConditionsPage`, `ForAgentsPage`) now renders `<PageHead>` with its own metadata.

**JSON-LD placement by page type:**

| Route | Schema |
|---|---|
| `/` | `Organization` + `WebSite` |
| `/about` | `Organization` with founders |
| `/pricing` | `WebPage` |
| `/for-inhouse`, `/for-agencies` | `Service` |
| `/insights/<article>` | `Article` with publisher, headline, image |
| All others | None (no JSON-LD where no genuine content fits) |

### 2. `index.html` defaults

Replaced `<title>AIO Fusion Demo</title>` with the correct production title. Added default Open Graph, Twitter Card, and canonical tags so the SPA shell has sensible values even when no per-route HTML file is served.

### 3. Pre-render build step

**How it works:**

1. `vite build` (existing) → `dist/public/` (client SPA + hashed assets)
2. `vite build --config vite.ssr.config.ts` → `dist/ssr/prerender-entry.js` (Node-compatible ESM bundle)
3. `node dist/ssr/prerender-entry.js` → per-route HTML files + `dist/public/sitemap.xml`

**What is pre-rendered:**

| Output path | Route |
|---|---|
| `dist/public/index.html` | `/` (landing page replaces the SPA shell in-place) |
| `dist/public/about/index.html` | `/about` |
| `dist/public/contact/index.html` | `/contact` |
| `dist/public/for-inhouse/index.html` | `/for-inhouse` |
| `dist/public/for-agencies/index.html` | `/for-agencies` |
| `dist/public/for-agents/index.html` | `/for-agents` |
| `dist/public/insights/index.html` | `/insights` |
| `dist/public/pricing/index.html` | `/pricing` |
| `dist/public/trust-security/index.html` | `/trust-security` |
| `dist/public/privacy-policy/index.html` | `/privacy-policy` |
| `dist/public/terms-conditions/index.html` | `/terms-conditions` |
| `dist/public/insights/pr-professionals-not-threat/index.html` | + 5 more articles |

Each file contains:
- Fully rendered component markup in `<div id="root">` (via `renderToStaticMarkup`)
- Per-page `<title>`, `<meta name="description">`, `<link rel="canonical">`
- Full Open Graph + Twitter Card tags with shared `opengraph.jpg`
- JSON-LD where applicable
- The client SPA's `<script type="module">` tag — React mounts and takes over on load

**SSR obstacles handled:**

- `window`/`document`/`localStorage` not available in Node → stub globals prepended to the SSR bundle via a Rollup `renderChunk` plugin in `vite.ssr.config.ts`
- Image imports (`.png`, `.jpg`) not meaningful in Node → a Vite plugin replaces them with `export default ""` in the SSR build
- `import.meta.env.BASE_URL` used in nav/logo hrefs → set to `"/"` via `define` in `vite.ssr.config.ts`
- The App.tsx/LlmCheckPage circular import → avoided entirely; the prerender entry imports only the marketing components directly

**Note on the for-agents page:** The for-agents content was previously inline JSX in App.tsx. It has been extracted to `src/marketing/ForAgentsPage.tsx` to make it importable by the prerender entry. App.tsx now imports it lazily.

**Static host precedence:** The production serving configuration in `artifact.toml` is `serve = "static"` with a catch-all rewrite `/* → /index.html`. Replit's static server (like all standard static hosts) serves exact file matches before applying rewrite rules — `dist/public/about/index.html` will be served for `/about` rather than falling through to the rewrite. This is a standard guarantee of static file servers and was verified locally by serving `dist/public` with a plain HTTP server. If Replit's behaviour differs from this standard, the fallback is to add explicit per-route rewrites in `artifact.toml`.

**Platform authentication paths:** Authenticated platform routes (`/platform`, `/dashboard`, etc.) are not real URL paths — they are view states within the SPA, all served from the root `index.html` via the catch-all rewrite. No path-based disallow is possible or needed. The auth check is server-enforced.

### 4. `sitemap.xml` — build-time generated

Generated by the prerender script at `dist/public/sitemap.xml`. Contains 17 URLs:
- 11 public pages (priority 1.0 → 0.4 by importance)
- 6 complete insights articles (priority 0.8)

`<lastmod>` is set to the build date (ISO format). The 6 stub articles (`earned-media`, `geo-signals`, `seo-aio`, etc.) are **excluded** — they have no article content in `articles-data.ts` and would produce blank article views.

### 5. `robots.txt` — updated

Added `Disallow: /api/` for all user agents (including the explicit AI crawlers) to prevent crawl budget waste on API endpoints. All existing AI crawler allowances and `llms.txt`/`agents.md` references are preserved.

### 6. Structural fixes — nav/footer `<button>` → `<a href>`

Updated `MarketingPage.tsx`, `LandingPage.tsx`, and `PricingPage.tsx`:

- All nav link `<button onClick={() => onNavigate(v)}>` converted to `<a href="/{v}" onClick={(e) => { e.preventDefault(); onNavigate(v); }}>`. The `href` uses `import.meta.env.BASE_URL` as the prefix so it works correctly in any deployment path.
- Footer links converted the same way.
- `<nav aria-label="Main navigation">` landmark added to all three nav bars.
- `<nav aria-label="Footer navigation">` landmark added to all three footers.
- Logo button (`<button onClick={onBack}>`) converted to `<a href="/">` in `MarketingPage`.
- Insights tiles in `LandingPage` now link directly to `${BASE_URL}insights/<slug>` for the two complete articles shown, giving crawlers real URLs instead of `#`.

Visuals are unchanged — the only difference is the element type (rendered as `<a>` instead of `<button>`) and the `href` attribute.

---

## What Was Not Changed

- The platform (authenticated) side of the app is untouched.
- No new copy was written. The for-agents page content was moved verbatim from App.tsx.
- The 6 stub articles remain as stubs; their content expansion is a separate task.
- No per-page OG images were generated — all pages share `public/opengraph.jpg`.
- Perplexity/Gemini/other LLM references were not added anywhere, consistent with the product scope (ChatGPT + Claude only).

---

## Verification Checklist

After `pnpm build` (which now runs prerender + sitemap automatically):

```bash
# Serve dist/public locally
npx serve dist/public -p 4173

# Check each route shows real HTML (not empty root div)
curl -s http://localhost:4173/ | grep -c "<h1"           # ≥ 1
curl -s http://localhost:4173/about | grep -c "<h1"      # ≥ 1
curl -s http://localhost:4173/contact | grep -c "<h1"    # ≥ 1
curl -s http://localhost:4173/pricing | grep -c "<h1"    # ≥ 1
curl -s http://localhost:4173/insights/pr-professionals-not-threat | grep -c "<h1"  # ≥ 1

# Check unique titles
curl -s http://localhost:4173/ | grep "<title"
curl -s http://localhost:4173/about | grep "<title"
curl -s http://localhost:4173/insights/pr-professionals-not-threat | grep "<title"

# Validate sitemap
curl -s http://localhost:4173/sitemap.xml | grep "<loc>" | wc -l   # 17

# Check robots.txt
curl -s http://localhost:4173/robots.txt | grep "Disallow"
```

### Structured data testing
Use Google's Rich Results Test or schema.org validator with the pre-rendered HTML files.

---

## Open Decisions / Follow-up Recommendations

1. **Stub articles** — `earned-media`, `geo-signals`, `seo-aio`, `setup-guide`, `authority-report`, `optimiser-guide`, `media-research-guide` appear in the InsightsPage list but have no content in `articles-data.ts`. They should either get content (so they can be pre-rendered and added to the sitemap) or be removed from the list.

2. **Per-page OG images** — currently all pages share the same `opengraph.jpg`. Per-article social cards would improve click-through from social shares.

3. **datePublished in Article JSON-LD** — the Article schema has no `datePublished` because the articles have no explicit dates in the data. Adding dates to `articles-data.ts` would make the structured data richer.

4. **Hydration mode** — the prerender uses `renderToStaticMarkup` (no React hydration markers). React mounts fresh over the pre-rendered markup. For better performance, switching to `renderToString` with `hydrateRoot` on the client would eliminate the re-render on first load. This requires the client entry (`main.tsx`) to call `hydrateRoot` instead of `createRoot`. Not done here to avoid risk of hydration mismatches.

5. **Platform auth paths in robots.txt** — currently not disallowed because they are SPA view states, not real URL paths. If the platform is ever moved to a subdomain or a path prefix (`/app/*`), explicit disallow rules should be added.

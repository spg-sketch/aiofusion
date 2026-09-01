# AIO Fusion Technical SEO Audit

**Updated:** 27 August 2026  
**Scope:** Public marketing pages and complete Insights articles

For the search-intent map, Search Console setup, monthly reporting template and 30, 60 and 90-day programme, see [SEO-GROWTH-PLAN.md](./SEO-GROWTH-PLAN.md).

## Current implementation

| Area | Status |
|---|---|
| Public HTML | Build-time pre-rendered |
| Canonical routes | 24 |
| Sitemap URLs | 24 |
| Complete Insights articles | 13 |
| Unique titles and descriptions | Present for all canonical routes |
| Canonical links | Present for all canonical routes |
| Open Graph and Twitter cards | Present for all canonical routes |
| Structured data | Organization, WebSite, SoftwareApplication, CollectionPage, WebPage, Article and BreadcrumbList where appropriate |
| Article breadcrumbs | Visible and represented in structured data |
| Internal links | Crawlable anchors in navigation, article listings, commercial pages and related-reading sections |
| GA4 | Measurement ID `G-DTSDJVJN0Q` is retained in every generated HTML page |
| Robots | Public pages allowed; API routes disallowed; sitemap declared |
| Marketing images | WebP; below-fold tiles use native lazy loading |

## Route coverage

The build generates:

- 11 public pages: homepage, audience pages, pricing, Insights, company, contact and policy pages
- 13 complete Insights articles
- one generated sitemap containing all 25 canonical URLs, including the promo page

Article routes are not accepted merely because a title and canonical exist. The build also checks that every generated article contains its article body, visible breadcrumb and related-reading links.

## Metadata and schema

The shared metadata registry is the source of truth for browser head management and build-time HTML.

- Homepage: Organization, WebSite and SoftwareApplication
- Agency and in-house pages: SoftwareApplication
- Insights index: CollectionPage
- Pricing: WebPage
- About: Organization
- Articles: Article and BreadcrumbList

Structured data must describe visible page content. Article titles should stay aligned across article data, the visible H1, page metadata and Article schema.

## Content and internal linking

Commercial pages target separate reader needs:

- Homepage: generative engine optimisation platform
- Agency page: GEO software for PR agencies
- In-house page: AI visibility software for in-house PR and marketing
- Pricing: GEO software plans and project capacity

The initial GEO content cluster uses the SEO-to-AIO transition playbook as its pillar. Insights cards are anchors with article URLs, not JavaScript-only buttons. Article pages contain visible breadcrumb links and a contextual related-reading section.

Unsupported numerical performance claims have been removed. Product copy remains limited to ChatGPT and Claude and does not claim organic-search tracking.

## Performance baseline

Ten large marketing images were converted from PNG to WebP without changing their dimensions:

- Previous combined source size: approximately 12 MB
- Current combined source size: approximately 620 KB
- Generated hero image: approximately 23 KB
- Generated article and Insights images: approximately 29–104 KB each

The production build still contains some larger authenticated-application JavaScript chunks. They are not new in this SEO work, but future bundle work should avoid loading platform-only code on public routes where practical.

## Production status

At the time of this audit, `https://aiofusion.ai` still served the older client-rendered `AIO Fusion Demo` shell and a one-URL sitemap. The current 24-route SEO build must be published before the improvements become available to search crawlers.

After publication:

1. Confirm the homepage source contains its H1, canonical and structured data.
2. Confirm `/sitemap.xml` contains 24 canonical public URLs.
3. Inspect the four commercial pages and GEO pillar page in Search Console.
4. Confirm GA4 receives page views and successful enquiry events.
5. Record the first Search Console and Core Web Vitals baseline in `SEO-GROWTH-PLAN.md`.

## Validation

The normal production build runs the client build, SSR bundle and prerender script. It fails on missing route metadata, empty markup, missing canonical and robots tags, missing article content, missing article breadcrumbs, or missing article related links.

Use the current project test, typecheck and production build commands before publishing. Search Console indexing, ranking and field Core Web Vitals data require verified owner access and are never inferred from local builds.
# Public-copy regression audit

## Scope

This inventory covers the public AIO Fusion discovery surface only. The
regression tests in `src/marketing/public-copy.regression.test.tsx` pin the
homepage promise and presentation, the Standard In-House pricing tagline,
public audience/discovery copy, Insights card titles and links, article
identities, and the small set of factual B2B pullquotes that are intentionally
retained. `src/prerender-output.regression.test.ts` runs the actual prerender
entry against a temporary local shell and controlled published-content fixture;
it does not call a production URL.

The static pipeline remains:

1. `vite build --config vite.config.ts`
2. `vite build --config vite.ssr.config.ts`
3. `node dist/ssr/prerender-entry.js`

The prerender regression uses `runPrerender` with either no content snapshot
(the checked-in SEO snapshot is expected) or a local fixture (only complete,
non-external stories are expected to receive article routes). Both B2B slugs
are covered in both metadata and sitemap assertions.

## Intentional exclusions

The following are deliberately **not** part of this public-copy contract:

- Signed-in dashboard, onboarding, account, billing, admin, team, project,
  audit, planner, media database, and other internal product data.
- Internal prompts, generation instructions, feature flags, API payloads,
  account identifiers, workspace identifiers, user identifiers, or other
  non-public implementation identifiers.
- Research quotations, customer/source quotations, and claims that require
  editorial or legal source verification. The copy tests only preserve the
  approved factual B2B pullquotes; they do not assert research provenance.
- CMS seed records and publication workflow data. The API/CMS seed changes are
  coordinated separately; the local fixture tests only the shape and routing
  contract consumed by prerender.
- Production content, production API responses, and live-site fetches. Tests
  pass `canonicalDomain: null` and use temporary local output directories.

## Image findings

No image-copy or image-identity change was made in this regression-test task.
The visual inspection found no baked-in B2B text in
`blog-tile-1.webp`, `article-3-b2b-authority.webp`, or
`article-5-b2b-visibility.webp`. Existing public image paths remain the
contract: the homepage discovery cards retain their existing artwork, Insights
cards retain their CMS/fallback cover paths, and article routes continue to
render a cover image without changing an article ID or canonical URL.

Two separate, intentional out-of-scope flags remain:

- `opengraph.jpg` contains the existing baked heading “for PR and Marketing
  Professionals”. It contains no B2B wording, but the old baked copy is not
  changed by this public-copy task.
- `Simpatico_PR_B2B_AI_Authority_Guide_2026.pdf` is a third-party guide in the
  public directory and is unchanged. Its B2B wording is tracked separately
  from first-party public copy.

Image appearance and crop quality require a visual review; they are not
inferred from HTML copy assertions and no browser testing subagent was
launched.

## Review notes

- Article IDs and `/insights/<slug>` canonical URLs are pinned as an ordered
  list, including `battle-b2b-ai-authority` and
  `ai-changing-b2b-visibility`.
- B2B wording is allowed only in the three factual pullquotes explicitly
  listed by the test. Other public editorial copy is free to use the broader
  business/communications language supplied by the editorial change.
- The prerender test verifies title, description, canonical, robots, JSON-LD,
  visible article title/body, breadcrumbs, and sitemap membership for the
  controlled B2B routes.
---
name: AIO Fusion SEO pre-render pipeline
description: How public marketing pages get static pre-rendered HTML, sitemap, and per-page meta at build time
---

- Build for aio-fusion is 3 steps: `vite build` (client) → `vite build --config vite.ssr.config.ts` (SSR entry) → `node dist/ssr/prerender-entry.js` (writes per-route `<route>/index.html` + sitemap.xml into dist/public).
- Per-page metadata lives in `src/marketing/pageMeta.ts`; `PageHead.tsx` applies it client-side (useEffect) and the prerender bakes it into static head. Any new public route/article must be added there or it gets shell defaults.
- Uses `renderToStaticMarkup`; React mounts fresh over the markup (no hydrateRoot). Switching to hydration risks mismatch — deliberate choice.
- Only the 6 insights articles with bodies in `articles-data.ts` are pre-rendered/sitemapped; 6 more are stubs listed in InsightsPage with no content — adding bodies auto-includes them.
- Production static artifacts deliberately have no wildcard rewrite. Pre-rendered route files must be served directly, while unknown paths must remain 404s instead of soft-404ing to the homepage.
- **Why:** crawlers previously got an empty SPA shell; this keeps SSG without a framework migration.
- **How to apply:** when adding public pages/articles, update pageMeta.ts and confirm the prerender route list picks them up; keep robots.txt `Disallow: /api/` and AI-crawler allowances intact.


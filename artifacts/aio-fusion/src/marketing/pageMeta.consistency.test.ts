// Guard for task: future page changes must not silently break the
// search-engine HTML. The prerender build renders exactly what PUBLIC_ROUTES
// lists, so a new public page added to App routing but not to pageMeta would
// silently ship as an empty JS shell to crawlers. These tests fail the suite
// the moment the three sources of truth drift apart:
//   1. App's canonical public URL map (VIEW_TO_SLUG, re-declared here)
//   2. PUBLIC_ROUTES (drives prerender + sitemap)
//   3. PAGE_META (drives titles/canonicals) and ARTICLE_META
import { describe, it, expect } from "vitest";
import { PAGE_META, ARTICLE_META, PUBLIC_ROUTES, ARTICLE_SLUGS } from "./pageMeta";

// Canonical public views of the app. Keep in sync with VIEW_TO_SLUG in
// App.tsx - if you add a public page there, this list (and pageMeta) must be
// updated, which is exactly the reminder this test exists to give.
const EXPECTED_PUBLIC_SLUGS = [
  "", // landing
  "about",
  "contact",
  "insights",
  "pricing",
  "for-inhouse",
  "for-agencies",
  "for-agents",
  "trust-security",
  "privacy-policy",
  "terms-conditions",
];

const metaKey = (slug: string) => (slug === "" ? "landing" : slug);

describe("public page / prerender consistency", () => {
  it("every expected public page is in PUBLIC_ROUTES (so it gets prerendered + sitemapped)", () => {
    const routeSlugs = PUBLIC_ROUTES.map((r) => r.slug);
    for (const slug of EXPECTED_PUBLIC_SLUGS) {
      expect(routeSlugs, `route "${slug || "landing"}" missing from PUBLIC_ROUTES in pageMeta.ts`).toContain(slug);
    }
  });

  it("PUBLIC_ROUTES has no unknown or duplicate entries", () => {
    const routeSlugs = PUBLIC_ROUTES.map((r) => r.slug);
    expect(new Set(routeSlugs).size, "duplicate slug in PUBLIC_ROUTES").toBe(routeSlugs.length);
    for (const slug of routeSlugs) {
      expect(EXPECTED_PUBLIC_SLUGS, `PUBLIC_ROUTES entry "${slug}" is not a known public page - update EXPECTED_PUBLIC_SLUGS and App routing together`).toContain(slug);
    }
  });

  it("every PUBLIC_ROUTES entry has complete PAGE_META", () => {
    for (const { slug } of PUBLIC_ROUTES) {
      const meta = PAGE_META[metaKey(slug)];
      expect(meta, `PAGE_META missing for "${metaKey(slug)}"`).toBeTruthy();
      expect(meta.title.trim()).not.toBe("");
      expect(meta.description.trim()).not.toBe("");
      expect(meta.canonical).toMatch(/^https:\/\/aiofusion\.ai(\/|$)/);
    }
  });

  it("every article has complete metadata and a matching /insights canonical", () => {
    expect(ARTICLE_SLUGS.length).toBeGreaterThan(0);
    for (const slug of ARTICLE_SLUGS) {
      const meta = ARTICLE_META[slug];
      expect(meta, `ARTICLE_META missing for "${slug}"`).toBeTruthy();
      expect(meta.title.trim()).not.toBe("");
      expect(meta.description.trim()).not.toBe("");
      expect(meta.articleTitle.trim()).not.toBe("");
      expect(meta.canonical).toBe(`https://aiofusion.ai/insights/${slug}`);
    }
  });

  it("PAGE_META has no orphan entries that never get prerendered", () => {
    const routeKeys = new Set(PUBLIC_ROUTES.map((r) => metaKey(r.slug)));
    for (const key of Object.keys(PAGE_META)) {
      expect(routeKeys.has(key), `PAGE_META entry "${key}" has no PUBLIC_ROUTES entry - it will never be prerendered`).toBe(true);
    }
  });
});

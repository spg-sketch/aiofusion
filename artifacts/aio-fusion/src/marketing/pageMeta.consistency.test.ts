// Guard for future page changes: the canonical public route registry drives the
// SPA URLs, prerender build and sitemap. PAGE_META is TypeScript-exhaustive for
// every PublicView; these runtime checks keep route slugs and article metadata
// complete as well.
import { describe, it, expect } from "vitest";
import {
  PAGE_META,
  ARTICLE_META,
  PUBLIC_PAGE_DEFINITIONS,
  PUBLIC_ROUTES,
  ARTICLE_SLUGS,
  structuredDataFor,
} from "./pageMeta";

describe("public page / prerender consistency", () => {
  it("derives sitemap routes from every canonical public-page definition", () => {
    expect(PUBLIC_ROUTES).toEqual(
      PUBLIC_PAGE_DEFINITIONS.map(({ slug, priority }) => ({ slug, priority })),
    );
  });

  it("has no duplicate canonical route slugs", () => {
    const routeSlugs = PUBLIC_PAGE_DEFINITIONS.map(({ slug }) => slug);
    expect(new Set(routeSlugs).size, "duplicate slug in PUBLIC_PAGE_DEFINITIONS").toBe(routeSlugs.length);
  });

  it("every canonical public page has complete metadata", () => {
    for (const { view, slug } of PUBLIC_PAGE_DEFINITIONS) {
      const meta = PAGE_META[view];
      expect(meta, `PAGE_META missing for "${view}"`).toBeTruthy();
      expect(meta.title.trim()).not.toBe("");
      expect(meta.description.trim()).not.toBe("");
      expect(meta.canonical).toBe(
        slug === "" ? "https://aiofusion.ai/" : `https://aiofusion.ai/${slug}`,
      );
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
      const schemas = structuredDataFor(meta);
      expect(Array.isArray(schemas)).toBe(true);
      expect((schemas as Array<Record<string, unknown>>).some((schema) => schema["@type"] === "Article")).toBe(true);
      expect((schemas as Array<Record<string, unknown>>).some((schema) => schema["@type"] === "BreadcrumbList")).toBe(true);
    }
  });

  it("the homepage describes the organisation, website and software product", () => {
    const schemas = structuredDataFor(PAGE_META.landing);
    expect(Array.isArray(schemas)).toBe(true);
    const types = (schemas as Array<Record<string, unknown>>).map((schema) => schema["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication"]));
  });

  it("PAGE_META has no orphan entries that never get prerendered", () => {
    const routeKeys = new Set(PUBLIC_PAGE_DEFINITIONS.map(({ view }) => view));
    for (const key of Object.keys(PAGE_META)) {
      expect(routeKeys.has(key), `PAGE_META entry "${key}" has no PUBLIC_ROUTES entry - it will never be prerendered`).toBe(true);
    }
  });
});

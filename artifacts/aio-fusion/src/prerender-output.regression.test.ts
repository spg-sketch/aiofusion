import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ARTICLE_META, ARTICLE_SLUGS } from "./marketing/pageMeta";
import { runPrerender } from "./prerender-entry";
import type { PublicInsight } from "./marketing/InsightsPage";

const temporaryDirectories: string[] = [];

function makeOutputFixture(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aio-fusion-prerender-"));
  temporaryDirectories.push(directory);
  fs.writeFileSync(
    path.join(directory, "index.html"),
    [
      "<!doctype html>",
      "<html><head><title>default</title>",
      '<meta name="description" content="default" />',
      '<link rel="canonical" href="https://aiofusion.ai/" />',
      '<meta property="og:title" content="default" />',
      '<meta name="twitter:title" content="default" />',
      "</head><body><div id=\"root\"></div></body></html>",
    ].join(""),
    "utf8",
  );
  return directory;
}

function publishedFixture(slug: string, title: string, excerpt: string): PublicInsight {
  return {
    id: slug,
    slug,
    title,
    excerpt,
    tag: "Article",
    externalUrl: null,
    datePublished: "2026-08-07",
    dateModified: "2026-08-08",
    body: [{ type: "paragraph", text: `Controlled fixture body for ${slug}.` }],
    coverImageUrl: "/images/insights/article-3-b2b-authority.webp",
    coverImageAlt: `${title} cover`,
    seoTitle: `${title} | AIO Fusion`,
    seoDescription: excerpt,
    focusKeyphrase: "AI visibility",
    canonicalUrl: `https://aiofusion.ai/insights/${slug}`,
    status: "published",
    pinned: false,
  };
}

function readRoute(directory: string, slug: string): string {
  if (slug === "sitemap.xml") {
    return fs.readFileSync(path.join(directory, slug), "utf8");
  }
  return fs.readFileSync(path.join(directory, ...slug.split("/"), "index.html"), "utf8");
}

afterEach(() => {
  delete globalThis.__AIO_PRERENDER_INSIGHTS__;
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("controlled prerender output", () => {
  it("uses the checked-in article snapshot when no published-content snapshot is supplied", async () => {
    const directory = makeOutputFixture();
    const result = await runPrerender({
      distPublic: directory,
      canonicalDomain: null,
      lastmod: "2026-08-08",
    });

    expect(result.articleSlugs).toEqual(ARTICLE_SLUGS);
    expect(result.errors).toBe(0);
    const battleHtml = readRoute(directory, "insights/battle-b2b-ai-authority");
    const changingHtml = readRoute(directory, "insights/ai-changing-b2b-visibility");

    for (const [slug, html] of [
      ["battle-b2b-ai-authority", battleHtml],
      ["ai-changing-b2b-visibility", changingHtml],
    ] as const) {
      expect(html).not.toContain('<div id="root"></div>');
      expect(html).toContain(`<title>${ARTICLE_META[slug].title}</title>`);
      expect(html).toContain(`href="${ARTICLE_META[slug].canonical}"`);
      expect(html).toContain('name="robots" content="index, follow"');
      expect(html).toContain('type="application/ld+json"');
      expect(html).toContain('aria-label="Breadcrumb"');
    }
    expect(readRoute(directory, "sitemap.xml")).toContain(
      "https://aiofusion.ai/insights/battle-b2b-ai-authority",
    );
    expect(readRoute(directory, "sitemap.xml")).toContain(
      "https://aiofusion.ai/insights/ai-changing-b2b-visibility",
    );
  });

  it("renders only complete local published stories and their generated Article metadata", async () => {
    const directory = makeOutputFixture();
    const fixture = [
      publishedFixture(
        "battle-b2b-ai-authority",
        "A controlled B2B authority story",
        "A local fixture excerpt for the B2B authority route.",
      ),
      publishedFixture(
        "ai-changing-b2b-visibility",
        "A controlled visibility story",
        "A local fixture excerpt for the visibility route.",
      ),
      {
        ...publishedFixture(
          "external-guide",
          "External guide",
          "This external story must not get a local article route.",
        ),
        externalUrl: "https://example.test/external-guide",
        body: [],
      },
    ];

    const result = await runPrerender({
      distPublic: directory,
      canonicalDomain: null,
      publishedInsights: fixture,
      lastmod: "2026-08-08",
    });

    expect(result.articleSlugs).toEqual([
      "battle-b2b-ai-authority",
      "ai-changing-b2b-visibility",
    ]);
    expect(result.errors).toBe(0);

    for (const [slug, title, excerpt] of [
      [
        "battle-b2b-ai-authority",
        "A controlled B2B authority story",
        "A local fixture excerpt for the B2B authority route.",
      ],
      [
        "ai-changing-b2b-visibility",
        "A controlled visibility story",
        "A local fixture excerpt for the visibility route.",
      ],
    ] as const) {
      const html = readRoute(directory, `insights/${slug}`);
      expect(html).toContain(`<title>${title} | AIO Fusion</title>`);
      expect(html).toContain(`name="description" content="${excerpt}"`);
      expect(html).toContain(`href="https://aiofusion.ai/insights/${slug}"`);
      expect(html).toContain(`<h1`);
      expect(html).toContain(title);
      expect(html).toContain(excerpt);
      expect(html).toContain('"@type":"Article"');
    }

    const sitemap = readRoute(directory, "sitemap.xml");
    expect(sitemap).toContain("https://aiofusion.ai/insights/battle-b2b-ai-authority");
    expect(sitemap).toContain("https://aiofusion.ai/insights/ai-changing-b2b-visibility");
    expect(sitemap).not.toContain("https://aiofusion.ai/insights/external-guide");
    expect(sitemap).not.toContain(
      "https://aiofusion.ai/insights/pr-professionals-not-threat",
    );
  });
});
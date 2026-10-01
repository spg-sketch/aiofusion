import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARTICLE_META,
  ARTICLE_SLUGS,
  HIDDEN_PUBLIC_INSIGHT_SLUGS,
} from "./marketing/pageMeta";
import { runPrerender } from "./prerender-entry";
import type { PublicInsight } from "./marketing/InsightsPage";
import { articleMeta } from "./marketing/InsightsPage";
import { structuredDataFor } from "./marketing/pageMeta";

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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete globalThis.__AIO_PRERENDER_INSIGHTS__;
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("controlled prerender output", () => {
  it("marks page schema for client ownership and keeps CMS dates and breadcrumb identical to client metadata", async () => {
    const directory = makeOutputFixture();
    const story = publishedFixture("verified-date-fixture", "Verified article date", "Controlled date evidence.");
    const undated = {
      ...publishedFixture("legacy-undated-fixture", "Legacy undated article", "No invented publication date."),
      datePublished: null,
      dateModified: null,
    };
    await runPrerender({
      distPublic: directory,
      canonicalDomain: null,
      lastmod: "2026-10-01",
      publishedInsights: [story, undated],
    });
    for (const article of [story, undated]) {
      const html = readRoute(directory, `insights/${article.slug}`);
      const scripts = [...html.matchAll(/<script type="application\/ld\+json" data-pagehead-managed>(.*?)<\/script>/gs)];
      expect(scripts).toHaveLength(1);
      const schema = JSON.parse(scripts[0][1]);
      expect(schema).toEqual(JSON.parse(JSON.stringify(structuredDataFor(articleMeta(article)))));
      expect(schema[1].itemListElement.at(-1).name).toBe(article.title);
      if (article.datePublished) {
        expect(html).toContain(`<time dateTime="${article.datePublished}">`);
        expect(html).toContain(`<time dateTime="${article.dateModified}">`);
        expect(schema[0].datePublished).toBe(article.datePublished);
        expect(schema[0].dateModified).toBe(article.dateModified);
      } else {
        expect(html).not.toContain("<time");
        expect(schema[0]).not.toHaveProperty("datePublished");
        expect(schema[0]).not.toHaveProperty("dateModified");
      }
    }
  });

  it("keeps static HTML for non-self-canonical CMS stories but excludes them from the sitemap", async () => {
    const directory = makeOutputFixture();
    const fixture = [
      publishedFixture("self-canonical-story", "Self canonical", "Original story."),
      {
        ...publishedFixture("external-canonical-story", "Syndicated story", "A republished story."),
        canonicalUrl: "https://publisher.example/original?edition=1&language=en",
      },
      {
        ...publishedFixture("local-duplicate", "Local duplicate", "Another local copy."),
        canonicalUrl: "https://staging.aiofusion.ai/insights/self-canonical-story",
      },
    ];
    const result = await runPrerender({
      distPublic: directory,
      canonicalDomain: "staging.aiofusion.ai",
      publishedInsights: fixture,
    });

    expect(result.articleSlugs).toEqual(fixture.map((article) => article.slug));
    expect(result.errors).toBe(0);
    const syndicatedHtml = readRoute(directory, "insights/external-canonical-story");
    expect(syndicatedHtml).toContain(
      '<link rel="canonical" href="https://publisher.example/original?edition=1&amp;language=en"',
    );
    expect(syndicatedHtml).toContain("A republished story.");
    expect(readRoute(directory, "insights/local-duplicate")).toContain(
      '<link rel="canonical" href="https://staging.aiofusion.ai/insights/self-canonical-story"',
    );
    const sitemap = readRoute(directory, "sitemap.xml");
    expect(sitemap).toContain("<loc>https://staging.aiofusion.ai/insights/self-canonical-story</loc>");
    expect(sitemap).not.toContain("/insights/external-canonical-story");
    expect(sitemap).not.toContain("/insights/local-duplicate");
    expect(sitemap).not.toContain("publisher.example");
  });

  it("fetches CMS-only routes and renders every valid body block", async () => {
    const directory = makeOutputFixture();
    const article: PublicInsight = {
      ...publishedFixture("new-cms-only-story", "New CMS story", "Fresh editorial content."),
      body: [
        { type: "heading", text: "CMS heading" },
        { type: "subheading", text: "CMS subheading" },
        { type: "paragraph", text: "Fresh editorial content." },
        { type: "pullquote", text: "A CMS quote." },
        { type: "stat", text: "42% CMS statistic" },
        { type: "list", items: ["First CMS list item", "Second CMS list item"] },
        { type: "image", mediaId: "valid-media-reference", url: null },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [article],
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runPrerender({
      distPublic: directory,
      canonicalDomain: "cms.example",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://cms.example/api/insights", {
      signal: expect.any(AbortSignal),
    });
    expect(result.articleSlugs).toEqual([article.slug]);
    const html = readRoute(directory, `insights/${article.slug}`);
    for (const content of [
      "CMS heading",
      "CMS subheading",
      "Fresh editorial content.",
      "A CMS quote.",
      "42% CMS statistic",
      "First CMS list item",
      "Second CMS list item",
    ]) {
      expect(html).toContain(content);
    }
    expect(readRoute(directory, "sitemap.xml")).toContain(
      "<loc>https://cms.example/insights/new-cms-only-story</loc>",
    );
  });

  it.each([
    ["HTTP failure", () => Promise.resolve({ ok: false, status: 503 })],
    ["unreachable API", () => Promise.reject(new Error("Network unavailable"))],
    ["timeout", () => Promise.reject(new DOMException("Timed out", "TimeoutError"))],
    ["invalid JSON", () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } })],
    ["invalid envelope", () => Promise.resolve({ ok: true, json: async () => ({ articles: [] }) })],
    ["invalid record", () => Promise.resolve({ ok: true, json: async () => [{ slug: "incomplete-record" }] })],
    ["duplicate slug", () => Promise.resolve({
      ok: true,
      json: async () => Array(2).fill(publishedFixture("duplicate", "Story", "Excerpt")),
    })],
  ])("fails before publishing any static files on %s", async (_label, fetchImplementation) => {
    const directory = makeOutputFixture();
    const originalShell = readRoute(directory, "");
    vi.stubGlobal("fetch", vi.fn(fetchImplementation));
    await expect(runPrerender({
      distPublic: directory,
      canonicalDomain: "cms.example",
    })).rejects.toThrow("refusing to publish stale article coverage");
    expect(fs.readdirSync(directory)).toEqual(["index.html"]);
    expect(readRoute(directory, "")).toBe(originalShell);
    expect(globalThis.__AIO_PRERENDER_INSIGHTS__).toBeUndefined();
  });

  it.each([
    ["heading", { type: "heading" }],
    ["subheading", { type: "subheading" }],
    ["paragraph", { type: "paragraph" }],
    ["pullquote", { type: "pullquote" }],
    ["stat", { type: "stat" }],
    ["list", { type: "list" }],
    ["image", { type: "image", url: null }],
    ["unknown", { type: "unknown" }],
  ])("rejects malformed %s body blocks before writing any static files", async (_label, block) => {
    const directory = makeOutputFixture();
    const originalShell = readRoute(directory, "");
    const article = {
      ...publishedFixture("malformed-body", "Malformed story", "Invalid body fixture."),
      body: [block],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [article],
    }));

    await expect(runPrerender({
      distPublic: directory,
      canonicalDomain: "cms.example",
    })).rejects.toThrow("refusing to publish stale article coverage");
    expect(fs.readdirSync(directory)).toEqual(["index.html"]);
    expect(readRoute(directory, "")).toBe(originalShell);
    expect(globalThis.__AIO_PRERENDER_INSIGHTS__).toBeUndefined();
  });

  it("requires the CMS even when no canonical domain is configured", async () => {
    const directory = makeOutputFixture();
    vi.stubEnv("CANONICAL_DOMAIN", "");
    const fetchMock = vi.fn().mockRejectedValue(new Error("Unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(runPrerender({ distPublic: directory })).rejects.toThrow(
      "https://aiofusion.ai/api/insights",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fs.readdirSync(directory)).toEqual(["index.html"]);
  });

  it.each(["API", "controlled snapshot"])("uses an empty %s snapshot without resurrecting checked-in stories", async (source) => {
    const directory = makeOutputFixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const result = await runPrerender({
      distPublic: directory,
      canonicalDomain: "cms.example",
      ...(source === "controlled snapshot" ? { publishedInsights: [] } : {}),
    });
    expect(result.articleSlugs).toEqual([]);
    expect(readRoute(directory, "sitemap.xml")).not.toContain("/insights/");
    expect(readRoute(directory, "insights")).not.toContain("battle-b2b-ai-authority");
    expect(fs.readdirSync(path.join(directory, "insights"))).toEqual(["index.html"]);
  });

  it("uses the checked-in article snapshot when no published-content snapshot is supplied", async () => {
    const directory = makeOutputFixture();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await runPrerender({
      distPublic: directory,
      canonicalDomain: null,
      lastmod: "2026-08-08",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.articleSlugs).toEqual(ARTICLE_SLUGS);
    expect(result.errors).toBe(0);
    for (const shellPath of ["admin/index.html", "platform/index.html", "project-hub/index.html", "404.html"]) {
      expect(fs.existsSync(path.join(directory, shellPath))).toBe(true);
    }
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

  it("renders only complete local published stories and excludes hidden and private routes from discovery", async () => {
    const directory = makeOutputFixture();
    const fixture = [
      publishedFixture(
        "battle-b2b-ai-authority",
        "A controlled B2B authority story",
        "A local fixture excerpt for the B2B authority route.",
      ),
      {
        ...publishedFixture(
          "ai-changing-b2b-visibility",
          "A controlled visibility story",
          "A local fixture excerpt for the visibility route.",
        ),
        canonicalUrl: "https://staging.aiofusion.ai/insights/ai-changing-b2b-visibility",
      },
      ...HIDDEN_PUBLIC_INSIGHT_SLUGS.map((slug) =>
        publishedFixture(slug, `Hidden ${slug}`, `This story is retained but not public: ${slug}.`),
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
      expect(html).toContain(`<h1`);
      expect(html).toContain(title);
      expect(html).toContain(excerpt);
      expect(html).toContain('"@type":"Article"');
    }

    const selfCanonicalHtml = readRoute(directory, "insights/battle-b2b-ai-authority");
    expect(selfCanonicalHtml).toContain(
      'href="https://aiofusion.ai/insights/battle-b2b-ai-authority"',
    );
    const changingHtml = readRoute(directory, "insights/ai-changing-b2b-visibility");
    expect(changingHtml).toContain(
      'href="https://aiofusion.ai/insights/ai-changing-b2b-visibility"',
    );
    const sitemap = readRoute(directory, "sitemap.xml");
    expect(sitemap).toContain("https://aiofusion.ai/insights/battle-b2b-ai-authority");
    expect(sitemap).toContain("https://aiofusion.ai/insights/ai-changing-b2b-visibility");
    expect(sitemap).not.toContain("https://aiofusion.ai/insights/external-guide");
    expect(sitemap).not.toContain(
      "https://aiofusion.ai/insights/pr-professionals-not-threat",
    );
    for (const slug of HIDDEN_PUBLIC_INSIGHT_SLUGS) {
      expect(result.articleSlugs).not.toContain(slug);
      expect(sitemap).not.toContain(`https://aiofusion.ai/insights/${slug}`);
      expect(fs.existsSync(path.join(directory, "insights", slug, "index.html"))).toBe(false);
    }
    const insightsIndex = readRoute(directory, "insights");
    for (const slug of HIDDEN_PUBLIC_INSIGHT_SLUGS) {
      expect(insightsIndex).not.toContain(`href="/insights/${slug}"`);
      expect(insightsIndex).not.toContain(`Hidden ${slug}`);
    }
  });
});
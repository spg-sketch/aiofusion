/**
 * PageHead - JSON-LD lifecycle tests
 *
 * Verifies that navigating from a page with JSON-LD to one without removes the
 * managed <script type="application/ld+json"> from <head> so stale schema
 * doesn't persist across client-side navigation.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { PageHead } from "./PageHead";
import { PAGE_META, ARTICLE_META, structuredDataFor } from "./pageMeta";
import { articleMeta, type PublicInsight } from "./InsightsPage";

const LD_SEL = 'script[type="application/ld+json"][data-pagehead-managed]';

afterEach(() => {
  cleanup();
  // Remove any managed ld+json scripts left by the test
  document.head
    .querySelectorAll(LD_SEL)
    .forEach((el) => el.remove());
});

describe("PageHead JSON-LD management", () => {
  it("adopts a direct-load script, updates it for another article, then replaces/removes it on non-article pages", () => {
    const first = ARTICLE_META["battle-b2b-ai-authority"];
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-pagehead-managed", "");
    script.textContent = JSON.stringify(structuredDataFor(first));
    document.head.appendChild(script);
    const { rerender } = render(<PageHead meta={first} />);
    expect(document.head.querySelectorAll(LD_SEL)).toHaveLength(1);
    expect(document.head.querySelector(LD_SEL)).toBe(script);

    const second = articleMeta({
      slug: "controlled-cms-story",
      title: "Controlled CMS story",
      excerpt: "Verified CMS metadata fixture.",
      seoTitle: "CMS Story | AIO Fusion",
      datePublished: "2026-09-01",
      dateModified: "2026-09-02T12:00:00.000Z",
      canonicalUrl: null,
      coverImageUrl: null,
    } as PublicInsight);
    rerender(<PageHead meta={second} />);
    expect(document.head.querySelectorAll(LD_SEL)).toHaveLength(1);
    const data = JSON.parse(script.textContent!);
    expect(data[0].headline).toBe(second.articleTitle);
    expect(data[0].datePublished).toBe(second.datePublished);
    expect(data[1].itemListElement.at(-1).name).toBe(second.articleTitle);
    expect(script.textContent).not.toContain(first.articleTitle);

    rerender(<PageHead meta={PAGE_META.pricing} />);
    expect(document.head.querySelector(LD_SEL)).toBe(script);
    expect(JSON.parse(script.textContent!)["@type"]).toBe("WebPage");
    expect(script.textContent).not.toContain("BreadcrumbList");
    rerender(<PageHead meta={PAGE_META.contact} />);
    expect(document.head.querySelector(LD_SEL)).toBeNull();
  });

  it("injects a ld+json script when meta has jsonLd", () => {
    render(<PageHead meta={PAGE_META["landing"]} />);
    const script = document.head.querySelector(LD_SEL);
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.textContent ?? "[]");
    // Landing has Organization, WebSite and SoftwareApplication schemas.
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((d: { "@type": string }) => d["@type"] === "Organization")).toBe(true);
    expect(data.some((d: { "@type": string }) => d["@type"] === "SoftwareApplication")).toBe(true);
  });

  it("removes the ld+json script when navigating landing → contact (no jsonLd)", () => {
    const { rerender } = render(<PageHead meta={PAGE_META["landing"]} />);
    expect(document.head.querySelector(LD_SEL)).not.toBeNull();

    act(() => {
      rerender(<PageHead meta={PAGE_META["contact"]} />);
    });

    expect(document.head.querySelector(LD_SEL)).toBeNull();
  });

  it("injects Article schema when rendering an article page", () => {
    const articleMeta = ARTICLE_META["pr-professionals-not-threat"];
    render(<PageHead meta={articleMeta} />);
    const script = document.head.querySelector(LD_SEL);
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.textContent ?? "{}");
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((d: { "@type": string }) => d["@type"] === "Article")).toBe(true);
    expect(data.some((d: { "@type": string }) => d["@type"] === "BreadcrumbList")).toBe(true);
  });

  it("removes Article schema when navigating article → pricing (pricing has WebPage schema)", () => {
    const articleMeta = ARTICLE_META["pr-professionals-not-threat"];
    const { rerender } = render(<PageHead meta={articleMeta} />);

    const before = document.head.querySelector(LD_SEL);
    expect(before).not.toBeNull();
    const beforeData = JSON.parse(before!.textContent ?? "[]");
    expect(beforeData.some((d: { "@type": string }) => d["@type"] === "Article")).toBe(true);

    act(() => {
      rerender(<PageHead meta={PAGE_META["pricing"]} />);
    });

    // Pricing has its own jsonLd (WebPage), so script should still exist but
    // content changes - Article schema must NOT be present.
    const after = document.head.querySelector(LD_SEL);
    expect(after).not.toBeNull();
    const data = JSON.parse(after!.textContent ?? "{}");
    expect(data["@type"]).toBe("WebPage");
  });

  it("replaces Article schema with CollectionPage schema when navigating to insights", () => {
    const articleMeta = ARTICLE_META["pr-professionals-not-threat"];
    const { rerender } = render(<PageHead meta={articleMeta} />);
    expect(document.head.querySelector(LD_SEL)).not.toBeNull();

    act(() => {
      rerender(<PageHead meta={PAGE_META["insights"]} />);
    });

    const after = document.head.querySelector(LD_SEL);
    expect(after).not.toBeNull();
    const data = JSON.parse(after!.textContent ?? "{}");
    expect(data["@type"]).toBe("CollectionPage");
  });
});

/**
 * PageHead — JSON-LD lifecycle tests
 *
 * Verifies that navigating from a page with JSON-LD to one without removes the
 * managed <script type="application/ld+json"> from <head> so stale schema
 * doesn't persist across client-side navigation.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { PageHead } from "./PageHead";
import { PAGE_META, ARTICLE_META } from "./pageMeta";

const LD_SEL = 'script[type="application/ld+json"][data-pagehead-managed]';

afterEach(() => {
  cleanup();
  // Remove any managed ld+json scripts left by the test
  document.head
    .querySelectorAll(LD_SEL)
    .forEach((el) => el.remove());
});

describe("PageHead JSON-LD management", () => {
  it("injects a ld+json script when meta has jsonLd", () => {
    render(<PageHead meta={PAGE_META["landing"]} />);
    const script = document.head.querySelector(LD_SEL);
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.textContent ?? "[]");
    // Landing has an array with Organization + WebSite
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((d: { "@type": string }) => d["@type"] === "Organization")).toBe(true);
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
    expect(data["@type"]).toBe("Article");
  });

  it("removes Article schema when navigating article → pricing (pricing has WebPage schema)", () => {
    const articleMeta = ARTICLE_META["pr-professionals-not-threat"];
    const { rerender } = render(<PageHead meta={articleMeta} />);

    const before = document.head.querySelector(LD_SEL);
    expect(before).not.toBeNull();
    expect(JSON.parse(before!.textContent ?? "{}")["@type"]).toBe("Article");

    act(() => {
      rerender(<PageHead meta={PAGE_META["pricing"]} />);
    });

    // Pricing has its own jsonLd (WebPage), so script should still exist but
    // content changes — Article schema must NOT be present.
    const after = document.head.querySelector(LD_SEL);
    expect(after).not.toBeNull();
    const data = JSON.parse(after!.textContent ?? "{}");
    expect(data["@type"]).toBe("WebPage");
    expect(data["@type"]).not.toBe("Article");
  });

  it("removes Article schema when navigating article → insights (insights has no jsonLd)", () => {
    const articleMeta = ARTICLE_META["pr-professionals-not-threat"];
    const { rerender } = render(<PageHead meta={articleMeta} />);
    expect(document.head.querySelector(LD_SEL)).not.toBeNull();

    act(() => {
      rerender(<PageHead meta={PAGE_META["insights"]} />);
    });

    expect(document.head.querySelector(LD_SEL)).toBeNull();
  });
});

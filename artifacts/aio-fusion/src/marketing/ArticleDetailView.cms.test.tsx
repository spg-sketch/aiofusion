import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ArticleDetailView from "./ArticleDetailView";

describe("CMS-created Insights article prerender", () => {
  it("renders a non-legacy slug with body markup and generic related reading", () => {
    const html = renderToStaticMarkup(
      <ArticleDetailView
        article={{
          id: "new-cms-story",
          title: "A new CMS story",
          tag: "Article",
          excerpt: "A crawler-readable summary.",
          datePublished: "2026-09-03T00:00:00.000Z",
          dateModified: "2026-09-04T00:00:00.000Z",
          imgSrc: "",
          sections: [
            { type: "heading", text: "A useful heading" },
            { type: "paragraph", text: "The complete published article body." },
            { type: "stat", text: "73%", caption: "of buyers use AI during supplier research" },
          ],
        }}
        coverImg="/images/insights/blog-tile-1.webp"
        coverAlt="A strategy team reviewing AI visibility data"
        onBack={() => {}}
      />,
    );

    expect(html).toContain("A new CMS story");
    expect(html).toContain("article-body");
    expect(html).toContain("The complete published article body.");
    expect(html).toContain("Continue exploring AI visibility");
    expect(html).toContain("Browse all AIO Fusion Insights");
    expect(html).toContain("3 September 2026");
    expect(html).toContain("4 September 2026");
    expect(html).toContain("73%");
    expect(html).toContain("of buyers use AI during supplier research");
    expect(html).toContain('alt="A strategy team reviewing AI visibility data"');
  });
});
// @vitest-environment jsdom
/**
 * Public-copy contract tests.
 *
 * These assertions intentionally use exact strings. Public copy is also a
 * discovery surface: a seemingly harmless wording change can alter the
 * homepage promise, cards shown to crawlers, or the URL/title pair indexed for
 * an Insight. Authenticated product copy is deliberately out of scope here.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import LandingPage from "./LandingPage";
import PricingPage from "./PricingPage";
import InsightsPage, { type PublicInsight } from "./InsightsPage";
import ForAgenciesPage from "./ForAgenciesPage";
import ForAgentsPage from "./ForAgentsPage";
import { ARTICLE_META, HIDDEN_PUBLIC_INSIGHT_SLUGS, PAGE_META } from "./pageMeta";
import { NEW_ARTICLES } from "./articles-data";

function documentFrom(markup: string): Document {
  return new DOMParser().parseFromString(markup, "text/html");
}

function textOf(element: Element | null): string {
  if (!element) return "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((breakElement) => breakElement.replaceWith(" "));
  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

const noop = () => {};
const marketingProps = { onLogin: noop, onBack: noop, onNavigate: noop, isAuthed: false };
afterEach(() => { globalThis.__AIO_PRERENDER_INSIGHTS__ = undefined; });

const EXPECTED_ARTICLE_IDS = [
  "pr-professionals-not-threat",
  "thought-leadership-engine-ai-visibility",
  "battle-b2b-ai-authority",
  "agentic-media-relations",
  "ai-changing-b2b-visibility",
  "ai-proves-pr-drives-sales",
] as const;

describe("public homepage and pricing copy", () => {
  it("includes the For Agents link in the homepage footer", () => {
    const doc = documentFrom(renderToStaticMarkup(<LandingPage {...marketingProps} />));
    const link = Array.from(doc.querySelectorAll("footer nav a")).find((anchor) => anchor.textContent === "For Agents");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toMatch(/\/for-agents$/);
  });
  it("keeps the homepage copy and renders the latest CMS discovery cards", () => {
    globalThis.__AIO_PRERENDER_INSIGHTS__ = [
      { id: "older", slug: "older", title: "Older CMS story", datePublished: "2026-01-01", status: "published", pinned: false },
      { id: "latest", slug: "latest", title: "Latest CMS story", datePublished: "2026-09-16", status: "published", pinned: false },
      { id: "second", slug: "second", title: "Second CMS story", datePublished: "2026-09-15", status: "published", pinned: false },
      { id: "external", slug: "external", title: "External CMS story", datePublished: "2026-09-14", status: "published", pinned: false, externalUrl: "https://example.com/guide" },
      { id: "draft", slug: "draft", title: "Draft CMS story", datePublished: "2026-09-17", status: "draft", pinned: false },
    ] as PublicInsight[];
    const doc = documentFrom(renderToStaticMarkup(<LandingPage {...marketingProps} />));
    const headings = [...doc.querySelectorAll("h2")].map((heading) => textOf(heading));
    const insightCards = [...doc.querySelectorAll("section a h3")].map((heading) => textOf(heading));

    expect(textOf(doc.querySelector("h1"))).toBe(
      "The AI Authority Platform for PR & Marketing Teams",
    );
    expect(textOf(doc.querySelector("h1")?.parentElement?.querySelector("p") ?? null)).toBe(
      "Support sales growth and measure your brand's visibility across AI search engines. AIO Fusion is built specifically for PR agencies and in-house communications teams to track, optimise, and report on generative engine performance.",
    );
    expect(headings).toContain("Cost-effective PR technology for the age of AI.");
    expect(insightCards).toEqual(["Latest CMS story", "Second CMS story", "External CMS story"]);
    expect(doc.querySelector('a[href$="insights/latest"]')).not.toBeNull();
    expect(
      [...doc.querySelectorAll("a")].some(
        (link) =>
          link.getAttribute("href") ===
          "https://example.com/guide" &&
          link.getAttribute("target") === "_blank" &&
          link.getAttribute("rel") === "noopener noreferrer",
      ),
    ).toBe(true);
  });

  it("keeps the exact Standard In-House pricing tagline", () => {
    const doc = documentFrom(renderToStaticMarkup(<PricingPage onLogin={noop} onNavigate={noop} />));
    expect(doc.body.textContent).toContain(
      "For in-house teams building AI authority for a single brand",
    );
    expect(doc.body.textContent).not.toContain(
      "For B2B and B2C in-house teams building AI authority for a single brand.",
    );
  });
});

describe("public metadata, discovery copy and article identity", () => {
  it("keeps crawler-facing page metadata explicit for the key public routes", () => {
    expect(PAGE_META.landing).toMatchObject({
      title: "AIO Fusion | GEO Platform for PR & Marketing Teams",
      description:
        "Track, score and grow your brand's visibility across AI search engines like ChatGPT and Claude. Built for PR agencies and in-house communications teams.",
      canonical: "https://aiofusion.ai/",
    });
    expect(PAGE_META.pricing).toMatchObject({
      title: "AIO Fusion Pricing | GEO Software Plans",
      description:
        "Transparent pricing for in-house teams and agencies. Annual plans with full platform access including AI Visibility Audit, Content Optimiser, and Comms Planner.",
      canonical: "https://aiofusion.ai/pricing",
    });
    expect(PAGE_META.insights).toMatchObject({
      title: "GEO Insights and AI Visibility Articles | AIO Fusion",
      description:
        "Expert articles on generative engine optimisation, AI visibility, PR for business audiences and the future of search. Written by PR and GEO practitioners.",
      canonical: "https://aiofusion.ai/insights",
    });
    expect(ARTICLE_META["battle-b2b-ai-authority"]).toMatchObject({
      articleTitle: "The battle for AI authority has begun",
      title: "The Battle for AI Authority | AIO Fusion",
      description:
        "Generative AI is becoming part of business research and supplier discovery. Learn why PR now shapes how brands are represented.",
      canonical: "https://aiofusion.ai/insights/battle-b2b-ai-authority",
    });
    expect(ARTICLE_META["ai-changing-b2b-visibility"]).toMatchObject({
      articleTitle: "AI Is Changing the Rules of Visibility: Here's What Actually Matters Now",
      title:
        "How AI Is Changing Brand Visibility | AIO Fusion",
      description:
        "AI-generated answers often rely on third-party sources when describing markets and suppliers. Learn what matters for visibility now.",
      canonical: "https://aiofusion.ai/insights/ai-changing-b2b-visibility",
    });
    expect(ARTICLE_META["ai-proves-pr-drives-sales"]).toMatchObject({
      articleTitle: "Will AI finally prove that PR drives sales through earned media awareness?",
      title:
        "Can AI Prove PR Drives Sales? | AIO Fusion",
      canonical: "https://aiofusion.ai/insights/ai-proves-pr-drives-sales",
    });
  });

  it("keeps the public Insights discovery cards and their URLs stable", () => {
    const doc = documentFrom(
      renderToStaticMarkup(<InsightsPage {...marketingProps} initialFilter={null} />),
    );
    const cards = [...doc.querySelectorAll("a")].filter((link) => link.querySelector("h2"));
    const cardByTitle = new Map(
      cards.map((card) => [textOf(card.querySelector("h2")), card]),
    );

    const externalGuide = cardByTitle.get("A Marketer's Guide to Winning AI Authority in 2026");
    expect(externalGuide).not.toBeNull();
    expect(textOf(externalGuide?.querySelector("p") ?? null)).toBe(
      "What is AIO? And is PR really the new SEO? Explore AI's impact on marketing.",
    );
    expect(externalGuide?.getAttribute("href")).toBe(
      "https://simpaticopraiauthorityguide.carrd.co/",
    );
    expect(externalGuide?.getAttribute("target")).toBe("_blank");

    for (const id of EXPECTED_ARTICLE_IDS) {
      const article = cardByTitle.get(NEW_ARTICLES.find((candidate) => candidate.id === id)?.title ?? "");
      expect(article, `missing public card for ${id}`).not.toBeUndefined();
      expect(article?.getAttribute("href")).toBe(`/insights/${id}`);
    }
  });

  it("keeps public audience discovery language out of the old B2B-only phrasing", () => {
    const agencies = documentFrom(
      renderToStaticMarkup(<ForAgenciesPage {...marketingProps} />),
    );
    const agents = documentFrom(
      renderToStaticMarkup(<ForAgentsPage {...marketingProps} />),
    );

    expect(agencies.body.textContent).toContain(
      "Our platform helps your team strengthen client services and harness the power of generative answer engines.",
    );
    expect(agencies.body.textContent).not.toContain(
      "Our B2B platform enhances your team and service performance",
    );
    expect(agents.body.textContent).toContain(
      "AIO Fusion is a GEO platform built for PR agencies and in-house communications teams.",
    );
    expect(agents.body.textContent).not.toContain(
      "AIO Fusion is a GEO platform built for PR agencies and B2B communications teams.",
    );
  });

  it("preserves every article ID and canonical URL, including B2B slugs", () => {
    const allIds = NEW_ARTICLES.map((article) => article.id);
    expect(allIds.filter((id) => !HIDDEN_PUBLIC_INSIGHT_SLUGS.includes(id as typeof HIDDEN_PUBLIC_INSIGHT_SLUGS[number]))).toEqual(EXPECTED_ARTICLE_IDS);
    expect(Object.keys(ARTICLE_META).sort()).toEqual([...allIds].sort());

    for (const id of allIds) {
      expect(ARTICLE_META[id].canonical).toBe(`https://aiofusion.ai/insights/${id}`);
    }
  });

  it("omits hidden stories from the checked-in Insights fallback while keeping other stories", () => {
    globalThis.__AIO_PRERENDER_INSIGHTS__ = undefined;
    const doc = documentFrom(
      renderToStaticMarkup(<InsightsPage {...marketingProps} />),
    );
    const links = Array.from(doc.querySelectorAll('a[href^="/insights/"]'));
    const hrefs = links.map((link) => link.getAttribute("href"));

    for (const slug of HIDDEN_PUBLIC_INSIGHT_SLUGS) {
      expect(hrefs).not.toContain(`/insights/${slug}`);
    }
    expect(hrefs).toContain("/insights/pr-professionals-not-threat");
    expect(hrefs).toContain("/insights/ai-proves-pr-drives-sales");
  });

  it("allows only the approved factual B2B pullquotes to retain B2B wording", () => {
    const allowed = [
      {
        id: "battle-b2b-ai-authority",
        text:
          "In most B2B categories, the AI authority race is still in its early stages. The window to establish a first-mover position is open, but it is closing.",
      },
      {
        id: "battle-b2b-ai-authority",
        text:
          "The battle for B2B AI authority is a communications battle. And the communications teams that understand this earliest will define the competitive landscape for years to come.",
      },
      {
        id: "ai-changing-b2b-visibility",
        text:
          "The structural reordering of B2B visibility has begun. The companies that recognise this, and act on it, will define who appears in AI-generated shortlists for years to come.",
      },
    ];
    const actual = NEW_ARTICLES.flatMap((article) =>
      article.sections
        .filter((section) => section.text?.includes("B2B"))
        .map((section) => ({ id: article.id, type: section.type, text: section.text })),
    );

    expect(actual.every((section) => section.type === "pullquote")).toBe(true);
    expect(actual.map(({ id, text }) => ({ id, text }))).toEqual(allowed);
  });
});
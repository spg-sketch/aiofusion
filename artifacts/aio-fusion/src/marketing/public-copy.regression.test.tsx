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
import { describe, expect, it } from "vitest";
import LandingPage from "./LandingPage";
import PricingPage from "./PricingPage";
import InsightsPage from "./InsightsPage";
import ForAgenciesPage from "./ForAgenciesPage";
import ForAgentsPage from "./ForAgentsPage";
import { ARTICLE_META, PAGE_META } from "./pageMeta";
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

const EXPECTED_ARTICLE_IDS = [
  "pr-professionals-not-threat",
  "thought-leadership-engine-ai-visibility",
  "battle-b2b-ai-authority",
  "agentic-media-relations",
  "ai-changing-b2b-visibility",
  "earned-media",
  "geo-signals",
  "seo-aio",
  "setup-guide",
  "authority-report",
  "optimiser-guide",
  "media-research-guide",
  "ai-proves-pr-drives-sales",
] as const;

describe("public homepage and pricing copy", () => {
  it("keeps the exact homepage headline, presentation and discovery cards", () => {
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
    expect(insightCards).toContain("A Marketer's Guide to Winning AI Authority in 2026");
    expect(insightCards).toContain("PR professionals should not see AI as a threat");
    expect(insightCards).toContain("Why thought leadership is the engine of AI visibility");
    expect(
      [...doc.querySelectorAll("a")].some(
        (link) =>
          link.getAttribute("href") ===
          "https://simpaticopraiauthorityguide.carrd.co/" &&
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
      title: "The battle for AI authority has begun | AIO Fusion Insights",
      description:
        "Generative AI is becoming part of business research and supplier discovery. Learn why PR now shapes how brands are represented.",
      canonical: "https://aiofusion.ai/insights/battle-b2b-ai-authority",
    });
    expect(ARTICLE_META["ai-changing-b2b-visibility"]).toMatchObject({
      articleTitle: "AI Is Changing the Rules of Visibility",
      title:
        "AI Is Changing the Rules of Visibility: Here's What Actually Matters Now | AIO Fusion Insights",
      description:
        "AI-generated answers often rely on third-party sources when describing markets and suppliers. Learn what matters for visibility now.",
      canonical: "https://aiofusion.ai/insights/ai-changing-b2b-visibility",
    });
    expect(ARTICLE_META["ai-proves-pr-drives-sales"]).toMatchObject({
      articleTitle: "Will AI finally prove that PR drives sales through earned media awareness?",
      title:
        "Will AI finally prove that PR drives sales through earned media awareness? | AIO Fusion Insights",
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
    expect(NEW_ARTICLES.map((article) => article.id)).toEqual(EXPECTED_ARTICLE_IDS);
    expect(Object.keys(ARTICLE_META)).toHaveLength(EXPECTED_ARTICLE_IDS.length);
    expect(Object.keys(ARTICLE_META)).toEqual(expect.arrayContaining([...EXPECTED_ARTICLE_IDS]));

    for (const id of EXPECTED_ARTICLE_IDS) {
      expect(ARTICLE_META[id].canonical).toBe(`https://aiofusion.ai/insights/${id}`);
    }
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
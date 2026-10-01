import { beforeEach, describe, expect, it, vi } from "vitest";
import seedRows from "../data/insights-seed.json";

const mocks = vi.hoisted(() => {
  const onConflictDoNothing = vi.fn();
  const values = vi.fn((_rows?: unknown) => ({ onConflictDoNothing }));
  return {
    insert: vi.fn(() => ({ values })),
    values,
    onConflictDoNothing,
  };
});

vi.mock("@workspace/db", () => ({
  db: { insert: mocks.insert },
  insightArticlesTable: {},
  insightMediaTable: {},
}));

import { seedInsights } from "./seed-insights";

type SeededArticle = {
  id: string;
  slug: string;
  title: string;
  body: unknown;
  seoTitle: string;
};

const SEO_TITLE_OVERRIDES: Record<string, string> = {
  "pr-professionals-not-threat":
    "PR Professionals and AI: Opportunity, Not Threat | AIO Fusion",
  "thought-leadership-engine-ai-visibility":
    "Thought Leadership and AI Visibility | AIO Fusion",
  "battle-b2b-ai-authority": "The Battle for AI Authority | AIO Fusion",
  "agentic-media-relations":
    "Agentic Media Relations: The Future of PR | AIO Fusion",
  "ai-changing-b2b-visibility": "How AI Is Changing Brand Visibility | AIO Fusion",
  "ai-proves-pr-drives-sales": "Can AI Prove PR Drives Sales? | AIO Fusion",
};

describe("seedInsights SEO titles", () => {
  beforeEach(() => {
    mocks.values.mockClear();
    mocks.onConflictDoNothing.mockClear();
    mocks.insert.mockClear();
  });

  it("seeds the six SEO overrides without changing displayed titles or article bodies", async () => {
    await seedInsights();

    const articleRows = mocks.values.mock.calls
      .map(([rows]) => rows)
      .find(
        (rows): rows is SeededArticle[] =>
          Array.isArray(rows) && rows.some((row) => row?.id === "pr-professionals-not-threat"),
      );

    expect(articleRows).toBeDefined();
    for (const [slug, seoTitle] of Object.entries(SEO_TITLE_OVERRIDES)) {
      const seedRow = seedRows.find((row) => row.slug === slug);
      const insertedRow = articleRows?.find((row) => row.slug === slug);

      expect(seedRow, slug).toBeDefined();
      expect(insertedRow, slug).toBeDefined();
      expect(insertedRow?.seoTitle, slug).toBe(seoTitle);
      expect(insertedRow?.seoTitle.length, slug).toBeLessThanOrEqual(65);
      expect(insertedRow?.title, slug).toBe(seedRow?.title);
      expect(insertedRow?.body, slug).toEqual(seedRow?.body);
    }
  });
});
import { describe, expect, it } from "vitest";
import currentSeedRows from "../data/insights-seed.json";
import type { InsightArticleRow, InsightBlock } from "@workspace/db";
import {
  applyInsightMigrationToRow,
  planInsightMigration,
  TASK_290_CHANGES,
  TASK_290_EXTERNAL_GUIDE_CHANGES,
  TASK_290_FIRST_PARTY_CHANGES,
} from "./insights-content-migration";
import preChangeFixture from "./fixtures/insights-task-290-pre-change.json";

function rowFor(id: string, status: string = "published"): InsightArticleRow {
  return {
    id,
    slug: `${id}-stable-slug`,
    title: "",
    excerpt: "",
    tag: "Article",
    externalUrl: id === "ext-guide" ? "https://example.test/guide" : null,
    datePublished: "2026-07-15",
    dateModified: "2026-08-07",
    body: [],
    coverMediaId: null,
    coverImageUrl: null,
    coverImageAlt: "",
    seoTitle: null,
    seoDescription: null,
    focusKeyphrase: null,
    canonicalUrl: `https://aiofusion.ai/insights/${id}`,
    status,
    createdAt: new Date("2026-07-15T00:00:00Z"),
    updatedAt: new Date("2026-07-15T00:00:00Z"),
    publishedAt: new Date("2026-07-15T00:00:00Z"),
  };
}

function oldRowFor(id: string): InsightArticleRow {
  const row = rowFor(id);
  const body: InsightBlock[] = [];
  for (const change of TASK_290_CHANGES.filter((item) => item.articleId === id)) {
    if (change.field === "body") {
      body[change.bodyIndex] = { type: "paragraph", text: change.from };
    } else {
      row[change.field] = change.from;
    }
  }
  row.body = body;
  return row;
}

type SeedFixtureRow = {
  id: string;
  slug: string;
  title: string;
  tag: string;
  excerpt: string;
  datePublished: string;
  dateModified: string;
  imgSrc: string;
  body: InsightBlock[];
  coverImageUrl: string;
};

const currentSeedById = new Map(
  (currentSeedRows as SeedFixtureRow[]).map((row) => [row.id, row]),
);

function rowFromSeedFixture(seedRow: SeedFixtureRow): InsightArticleRow {
  return {
    ...rowFor(seedRow.id),
    slug: seedRow.slug,
    title: seedRow.title,
    tag: seedRow.tag,
    excerpt: seedRow.excerpt,
    datePublished: seedRow.datePublished,
    dateModified: seedRow.dateModified,
    body: seedRow.body,
    coverMediaId: seedRow.imgSrc,
    coverImageUrl: seedRow.coverImageUrl,
    coverImageAlt: seedRow.title,
    seoTitle:
      seedRow.id === "ext-guide"
        ? seedRow.title
        : `${seedRow.title} | AIO Fusion`,
    seoDescription: seedRow.excerpt,
    focusKeyphrase:
      seedRow.id === "ext-guide"
        ? "B2B AI authority"
        : seedRow.tag === "Guidance"
          ? "AIO Fusion guidance"
          : "AI visibility",
  };
}

function currentExpectedRow(id: string): InsightArticleRow {
  if (id === "ext-guide") {
    return {
      ...rowFor("ext-guide"),
      title: "A Marketer's Guide to Winning AI Authority in 2026",
      excerpt: "What is AIO? And is PR really the new SEO? Explore AI's impact on marketing.",
      body: [],
      coverImageAlt: "A Marketer's Guide to Winning AI Authority in 2026",
      seoTitle: "A Marketer's Guide to Winning AI Authority in 2026",
      seoDescription: "What is AIO? And is PR really the new SEO?",
      focusKeyphrase: "AI authority",
    };
  }
  const seedRow = currentSeedById.get(id);
  if (!seedRow) throw new Error(`Missing current seed row for ${id}`);
  return rowFromSeedFixture(seedRow);
}

function relevantFields(row: InsightArticleRow) {
  return {
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    coverImageAlt: row.coverImageAlt,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    focusKeyphrase: row.focusKeyphrase,
  };
}

describe("Task 290 Insights CMS migration", () => {
  it("contains explicit first-party changes and only the six external-guide promo changes", () => {
    expect(TASK_290_FIRST_PARTY_CHANGES.length).toBeGreaterThan(0);
    expect(TASK_290_EXTERNAL_GUIDE_CHANGES.map((change) => change.field)).toEqual([
      "title",
      "excerpt",
      "coverImageAlt",
      "seoTitle",
      "seoDescription",
      "focusKeyphrase",
    ]);
    expect(TASK_290_EXTERNAL_GUIDE_CHANGES.every((change) => change.articleId === "ext-guide")).toBe(true);
  });

  it("is idempotent after applying every exact old value once", () => {
    const ids = [...new Set(TASK_290_CHANGES.map((change) => change.articleId))];
    for (const id of ids) {
      const original = oldRowFor(id);
      const firstPlan = planInsightMigration(original);
      expect(firstPlan.matchedChanges).toBe(
        TASK_290_CHANGES.filter((change) => change.articleId === id).length,
      );
      expect(Object.keys(firstPlan.updates).length).toBeGreaterThan(0);

      const migrated = applyInsightMigrationToRow(original);
      const secondPlan = planInsightMigration(migrated);
      expect(secondPlan.matchedChanges).toBe(0);
      expect(secondPlan.updates).toEqual({});
      expect(applyInsightMigrationToRow(migrated)).toEqual(migrated);
    }
  });

  it("updates matching fields without overwriting a custom editorial field", () => {
    const row = oldRowFor("ext-guide");
    row.title = "A separately approved custom guide title";
    row.seoDescription = "A separately approved custom guide description";
    const migrated = applyInsightMigrationToRow(row);

    expect(migrated.title).toBe("A separately approved custom guide title");
    expect(migrated.excerpt).toBe(
      "What is AIO? And is PR really the new SEO? Explore AI's impact on marketing.",
    );
    expect(migrated.seoDescription).toBe(
      "A separately approved custom guide description",
    );
    expect(migrated.slug).toBe(row.slug);
    expect(migrated.id).toBe("ext-guide");
    expect(migrated.externalUrl).toBe("https://example.test/guide");
  });

  it("does not change drafts, unknown IDs, quotations, or unlisted research sections", () => {
    const draft = oldRowFor("battle-b2b-ai-authority");
    draft.status = "draft";
    expect(applyInsightMigrationToRow(draft)).toEqual(draft);

    const unknown = oldRowFor("customer-created-story");
    unknown.title = "Custom story";
    expect(applyInsightMigrationToRow(unknown)).toEqual(unknown);

    const quoted = oldRowFor("battle-b2b-ai-authority");
    quoted.body[6] = {
      type: "pullquote",
      text: "In most B2B categories, the AI authority race is still in its early stages.",
    };
    const migrated = applyInsightMigrationToRow(quoted);
    expect((migrated.body[6] as { text: string }).text).toBe((quoted.body[6] as { text: string }).text);
  });

  it("migrates every actual pre-change seed row to the current checked-in seed", () => {
    const fixtureIds = preChangeFixture.map((row) => row.id).sort();
    const targetIds = [...new Set(TASK_290_CHANGES.map((change) => change.articleId))].sort();
    expect(fixtureIds).toEqual(targetIds);

    for (const fixtureRow of preChangeFixture as SeedFixtureRow[]) {
      const original = rowFromSeedFixture(fixtureRow);
      const plan = planInsightMigration(original);
      const migrated = applyInsightMigrationToRow(original);
      expect(plan.matchedChanges, fixtureRow.id).toBe(
        TASK_290_CHANGES.filter((change) => change.articleId === fixtureRow.id).length,
      );
      expect(plan.skippedChanges).toBe(0);
      expect(relevantFields(migrated)).toEqual(
        relevantFields(currentExpectedRow(fixtureRow.id)),
      );
    }
  });
});

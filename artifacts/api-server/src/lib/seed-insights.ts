import {
  db,
  insightArticlesTable,
  insightMediaTable,
  type InsightBlock,
} from "@workspace/db";
import seedRows from "../data/insights-seed.json";

type SeedRow = {
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

const STATIC_MEDIA = [
  "article-1-pr-ai",
  "article-2-thought-leadership",
  "article-3-b2b-authority",
  "article-4-agentic-media",
  "article-5-b2b-visibility",
  "article-6-pr-attribution",
  "blog-tile-1",
  "blog-tile-2",
  "blog-tile-3",
];

export async function seedInsights(): Promise<void> {
  const domain = (process.env["CANONICAL_DOMAIN"] || "aiofusion.ai")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  await db
    .insert(insightMediaTable)
    .values(STATIC_MEDIA.map((id) => ({
      id,
      fileName: `${id}.webp`,
      contentType: "image/webp",
      sizeBytes: "0",
      objectPath: null,
      publicUrl: `/images/insights/${id}.webp`,
      altText: "",
    })))
    .onConflictDoNothing();

  const rows = seedRows as SeedRow[];
  await db
    .insert(insightArticlesTable)
    .values(rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      tag: row.tag,
      datePublished: row.datePublished,
      dateModified: row.dateModified,
      body: row.body,
      coverMediaId: row.imgSrc,
      coverImageUrl: row.coverImageUrl,
      coverImageAlt: row.title,
      seoTitle: `${row.title} | AIO Fusion`,
      seoDescription: row.excerpt,
      focusKeyphrase: row.tag === "Guidance" ? "AIO Fusion guidance" : "AI visibility",
      canonicalUrl: `https://${domain}/insights/${row.slug}`,
      status: "published",
      publishedAt: new Date(`${row.datePublished}T00:00:00Z`),
    })))
    .onConflictDoNothing();

  await db
    .insert(insightArticlesTable)
    .values({
      id: "ext-guide",
      slug: "ext-guide",
      title: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026",
      excerpt: "What is AIO? And is PR really the new SEO? Cut through the hype around AI's impact on B2B marketing.",
      tag: "Guide",
      externalUrl: "https://simpaticopraiauthorityguide.carrd.co/",
      datePublished: "2026-07-15",
      dateModified: "2026-08-07",
      body: [],
      coverMediaId: "blog-tile-1",
      coverImageUrl: "/images/insights/blog-tile-1.webp",
      coverImageAlt: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026",
      seoTitle: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026",
      seoDescription: "What is AIO? And is PR really the new SEO? Cut through the hype around AI's impact on B2B marketing.",
      focusKeyphrase: "B2B AI authority",
      canonicalUrl: "https://simpaticopraiauthorityguide.carrd.co/",
      status: "published",
      publishedAt: new Date("2026-07-15T00:00:00Z"),
    })
    .onConflictDoNothing();
}
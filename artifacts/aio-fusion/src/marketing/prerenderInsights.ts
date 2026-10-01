import { z } from "zod";
import type { PublicInsight } from "./InsightsPage";

// Validate the entire build input before emitting any routes. A partial or
// malformed CMS response must never silently remove published article coverage.
const httpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
});
const articleSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  excerpt: z.string(),
  tag: z.string(),
  externalUrl: httpUrl.nullable(),
  datePublished: z.string().nullable(),
  dateModified: z.string().nullable(),
  body: z.array(z.union([
    z.object({
      type: z.enum(["heading", "subheading", "paragraph", "pullquote", "stat"]),
      text: z.string(),
    }),
    z.object({
      type: z.literal("list"),
      items: z.array(z.string()),
    }),
    z.object({
      type: z.literal("image"),
      mediaId: z.string().min(1),
      url: z.string().nullable().optional(),
      altText: z.string().optional(),
      caption: z.string().optional(),
    }),
  ])),
  coverImageUrl: z.string().nullable(),
  coverImageAlt: z.string(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  focusKeyphrase: z.string().nullable(),
  canonicalUrl: httpUrl.nullable(),
  status: z.literal("published"),
  pinned: z.boolean(),
});

export function validatePrerenderInsights(input: unknown): PublicInsight[] {
  const result = z.array(articleSchema).safeParse(input);
  if (!result.success) {
    throw new Error(`Invalid published Insights snapshot: ${result.error.message}`);
  }
  const slugs = new Set<string>();
  for (const article of result.data) {
    if (slugs.has(article.slug)) {
      throw new Error(`Invalid published Insights snapshot: duplicate slug "${article.slug}"`);
    }
    slugs.add(article.slug);
  }
  return result.data;
}

export async function fetchPrerenderInsights(siteOrigin: string): Promise<PublicInsight[]> {
  try {
    const response = await fetch(`${siteOrigin}/api/insights`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return validatePrerenderInsights(await response.json());
  } catch (error) {
    throw new Error(
      `Published Insights lookup failed at ${siteOrigin}/api/insights; refusing to publish stale article coverage. Check the CMS API and retry the build.`,
      { cause: error },
    );
  }
}
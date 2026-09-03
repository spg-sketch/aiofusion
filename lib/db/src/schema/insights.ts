import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export type InsightBlock =
  | { type: "paragraph" | "heading" | "subheading" | "pullquote" | "stat"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; mediaId: string; altText?: string; caption?: string };

export const insightMediaTable = pgTable("insight_media", {
  id: varchar("id").primaryKey(),
  fileName: varchar("file_name").notNull(),
  contentType: varchar("content_type").notNull(),
  sizeBytes: text("size_bytes").notNull(),
  objectPath: text("object_path"),
  publicUrl: text("public_url").notNull(),
  altText: text("alt_text").notNull().default(""),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insightArticlesTable = pgTable("insight_articles", {
  id: varchar("id").primaryKey(),
  slug: varchar("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  tag: varchar("tag").notNull().default("Article"),
  externalUrl: text("external_url"),
  datePublished: varchar("date_published"),
  dateModified: varchar("date_modified"),
  body: jsonb("body").$type<InsightBlock[]>().notNull().default([]),
  coverMediaId: varchar("cover_media_id"),
  coverImageUrl: text("cover_image_url"),
  coverImageAlt: text("cover_image_alt").notNull().default(""),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  focusKeyphrase: varchar("focus_keyphrase"),
  canonicalUrl: text("canonical_url"),
  status: varchar("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export type InsightMediaRow = typeof insightMediaTable.$inferSelect;
export type InsertInsightMedia = typeof insightMediaTable.$inferInsert;
export type InsightArticleRow = typeof insightArticlesTable.$inferSelect;
export type InsertInsightArticle = typeof insightArticlesTable.$inferInsert;
import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mediaCategoriesTable = pgTable("media_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  accountId: varchar("account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaOutletsTable = pgTable("media_outlets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  website: text("website").notNull().default(""),
  description: text("description").notNull().default(""),
  country: text("country").notNull().default(""),
  reachBand: text("reach_band").notNull().default(""),
  accountId: varchar("account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// accountId is nullable — admins can create global contacts (accountId = null)
// visible to all accounts, same as global outlets.
export const mediaContactsTable = pgTable("media_contacts", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").references(() => mediaOutletsTable.id),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  role: text("role").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // Enriched source fields. Keep the original CRUD columns above stable.
  mobile: text("mobile").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  twitterHandle: text("twitter_handle").notNull().default(""),
  beats: text("beats").array().notNull().default([]),
  sectors: text("sectors").array().notNull().default([]),
  geography: text("geography").notNull().default(""),
  language: text("language").notNull().default(""),
  seniority: text("seniority").notNull().default(""),
  editorialStatus: text("editorial_status").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  sourceRef: text("source_ref").notNull().default(""),
  publicationReach: text("publication_reach").notNull().default(""),
  publicationAuthority: text("publication_authority").notNull().default(""),
  journalistAuthority: text("journalist_authority").notNull().default(""),
  confidence: text("confidence").notNull().default(""),
  reviewNotes: text("review_notes").notNull().default(""),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  accountId: varchar("account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const mediaContactCategoriesTable = pgTable("media_contact_categories", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => mediaContactsTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => mediaCategoriesTable.id, { onDelete: "cascade" }),
  categoryName: text("category_name").notNull().default(""),
  accountId: varchar("account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("media_contact_categories_unique").on(table.contactId, table.categoryName)]);

export const mediaImportBatchesTable = pgTable("media_import_batches", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }),
  sourceFilename: text("source_filename").notNull().default(""),
  sourceHash: varchar("source_hash", { length: 64 }).notNull().default(""),
  sourceType: varchar("source_type", { length: 20 }).notNull().default("csv"),
  summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
  committedAt: timestamp("committed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("media_import_batches_idempotency").on(table.accountId, table.idempotencyKey)]);

export const mediaContactFieldOverridesTable = pgTable("media_contact_field_overrides", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => mediaContactsTable.id, { onDelete: "cascade" }),
  accountId: varchar("account_id").notNull(),
  fieldName: varchar("field_name", { length: 80 }).notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("media_contact_field_overrides_unique").on(table.contactId, table.accountId, table.fieldName)]);

export const mediaRecommendationSetsTable = pgTable("media_recommendation_sets", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").notNull(),
  projectId: varchar("project_id").notNull(),
  storyKey: varchar("story_key", { length: 200 }).notNull(),
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaRecommendationItemsTable = pgTable("media_recommendation_items", {
  id: serial("id").primaryKey(),
  recommendationSetId: integer("recommendation_set_id").notNull().references(() => mediaRecommendationSetsTable.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => mediaContactsTable.id),
  score: integer("score").notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  rank: integer("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("media_recommendation_items_unique").on(table.recommendationSetId, table.contactId)]);

export const mediaRecommendationDecisionsTable = pgTable("media_recommendation_decisions", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").notNull(),
  projectId: varchar("project_id").notNull(),
  storyKey: varchar("story_key", { length: 200 }).notNull(),
  contactId: integer("contact_id").notNull().references(() => mediaContactsTable.id),
  decision: varchar("decision", { length: 20 }).notNull(), // shortlisted | rejected | contacted
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("media_recommendation_decisions_unique").on(table.accountId, table.projectId, table.storyKey, table.contactId)]);

export type MediaCategoryRow = typeof mediaCategoriesTable.$inferSelect;
export type MediaOutletRow = typeof mediaOutletsTable.$inferSelect;
export type MediaContactRow = typeof mediaContactsTable.$inferSelect;
export const insertMediaContactSchema = createInsertSchema(mediaContactsTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertMediaContact = z.infer<typeof insertMediaContactSchema>;
export const insertMediaImportBatchSchema = createInsertSchema(mediaImportBatchesTable).omit({ id: true, createdAt: true });
export type InsertMediaImportBatch = z.infer<typeof insertMediaImportBatchSchema>;

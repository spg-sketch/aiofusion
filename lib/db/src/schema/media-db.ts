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
  sourceCheckClaimedAt: timestamp("source_check_claimed_at", { withTimezone: true }),
  sourceCheckClaimToken: varchar("source_check_claim_token", { length: 80 }),
  sourceCheckFailureCount: integer("source_check_failure_count").notNull().default(0),
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

export type MediaSourceCheckOutcome = "current" | "changed" | "unavailable";
export type MediaSourceDifference = {
  field: "role" | "email";
  kind: "changed" | "removed" | "added";
  storedValue: string;
  observedValue: string;
  supported: boolean;
};

export const mediaContactSourceChecksTable = pgTable("media_contact_source_checks", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => mediaContactsTable.id, { onDelete: "cascade" }),
  accountId: varchar("account_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  outcome: varchar("outcome", { length: 20 }).$type<MediaSourceCheckOutcome>().notNull(),
  errorCode: varchar("error_code", { length: 40 }),
  errorMessage: text("error_message").notNull().default(""),
  observedEvidence: jsonb("observed_evidence").$type<{
    nameFound: boolean;
    roleFound: boolean;
    emailFound: boolean;
    observedRole: string;
    observedEmails: string[];
    excerpt: string;
  }>().notNull().default({ nameFound: false, roleFound: false, emailFound: false, observedRole: "", observedEmails: [], excerpt: "" }),
  differences: jsonb("differences").$type<MediaSourceDifference[]>().notNull().default([]),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("media_contact_source_checks_latest").on(table.contactId, table.checkedAt)]);

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
  phraseAttributions: jsonb("phrase_attributions").$type<Array<{
    phraseId: string;
    phraseText: string;
    exactPhraseMatch: string;
    articleFit: string;
    publicationAuthorityContext: string;
    suggestedPlacementAngle: string;
  }>>().notNull().default([]),
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

export const mediaRecommendationFeedbackTable = pgTable("media_recommendation_feedback", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").notNull(),
  projectId: varchar("project_id").notNull(),
  storyKey: varchar("story_key", { length: 200 }).notNull(),
  contactId: integer("contact_id").notNull().references(() => mediaContactsTable.id, { onDelete: "cascade" }),
  signal: varchar("signal", { length: 12 }).notNull(), // more | less
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("media_recommendation_feedback_unique").on(table.accountId, table.projectId, table.storyKey, table.contactId)]);

export type MediaOutreachStatus = "planned" | "pitched" | "responded" | "accepted" | "declined" | "placed";
export type MediaPlacementVerification = "user_claimed" | "page_verified";

export const mediaOutreachTable = pgTable("media_outreach", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id").notNull(),
  projectId: varchar("project_id").notNull(),
  storyKey: varchar("story_key", { length: 200 }).notNull(),
  contactId: integer("contact_id").references(() => mediaContactsTable.id),
  outletId: integer("outlet_id").references(() => mediaOutletsTable.id),
  status: varchar("status", { length: 20 }).$type<MediaOutreachStatus>().notNull().default("planned"),
  articleSnapshot: jsonb("article_snapshot").$type<{ title: string }>().notNull().default({ title: "" }),
  contactSnapshot: jsonb("contact_snapshot").$type<{ name: string; role: string; email: string }>().notNull().default({ name: "", role: "", email: "" }),
  outletSnapshot: jsonb("outlet_snapshot").$type<{ name: string; website: string }>().notNull().default({ name: "", website: "" }),
  targetPhrases: jsonb("target_phrases").$type<Array<{ id: string; text: string; intentGroup: "discovery" | "shortlist" | "comparison" }>>().notNull().default([]),
  pitchDate: timestamp("pitch_date", { withTimezone: true }),
  responseDate: timestamp("response_date", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  responsibleTeamMember: text("responsible_team_member").notNull().default(""),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("media_outreach_story_contact_unique").on(table.accountId, table.projectId, table.storyKey, table.contactId)]);

export const mediaOutreachActivitiesTable = pgTable("media_outreach_activities", {
  id: serial("id").primaryKey(),
  outreachId: integer("outreach_id").notNull().references(() => mediaOutreachTable.id, { onDelete: "cascade" }),
  accountId: varchar("account_id").notNull(),
  projectId: varchar("project_id").notNull(),
  fromStatus: varchar("from_status", { length: 20 }).$type<MediaOutreachStatus>(),
  toStatus: varchar("to_status", { length: 20 }).$type<MediaOutreachStatus>().notNull(),
  note: text("note").notNull().default(""),
  actor: varchar("actor").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaPlacementsTable = pgTable("media_placements", {
  id: serial("id").primaryKey(),
  outreachId: integer("outreach_id").notNull().references(() => mediaOutreachTable.id, { onDelete: "cascade" }),
  accountId: varchar("account_id").notNull(),
  projectId: varchar("project_id").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  canonicalUrlKey: text("canonical_url_key").notNull(),
  publicationDate: timestamp("publication_date", { withTimezone: true }).notNull(),
  headline: text("headline").notNull(),
  supportingEvidence: text("supporting_evidence").notNull(),
  verification: varchar("verification", { length: 20 }).$type<MediaPlacementVerification>().notNull().default("user_claimed"),
  verifiedFacts: jsonb("verified_facts").$type<{ canonicalUrl?: string; publicationDate?: string; headline?: string; checkedAt?: string }>().notNull().default({}),
  verificationHistory: jsonb("verification_history").$type<Array<Record<string, unknown>>>().notNull().default([]),
  legacySourceRef: text("legacy_source_ref"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [uniqueIndex("media_placements_project_url_unique").on(table.accountId, table.projectId, table.canonicalUrlKey)]);

export type MediaCategoryRow = typeof mediaCategoriesTable.$inferSelect;
export type MediaOutletRow = typeof mediaOutletsTable.$inferSelect;
export type MediaContactRow = typeof mediaContactsTable.$inferSelect;
export type MediaContactSourceCheckRow = typeof mediaContactSourceChecksTable.$inferSelect;
export type MediaOutreachRow = typeof mediaOutreachTable.$inferSelect;
export type MediaPlacementRow = typeof mediaPlacementsTable.$inferSelect;
export const insertMediaContactSchema = createInsertSchema(mediaContactsTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertMediaContact = z.infer<typeof insertMediaContactSchema>;
export const insertMediaImportBatchSchema = createInsertSchema(mediaImportBatchesTable).omit({ id: true, createdAt: true });
export type InsertMediaImportBatch = z.infer<typeof insertMediaImportBatchSchema>;

import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Content Archive — press releases, articles, case studies and other content
// pieces created via the Content Optimiser or Creator. Replaces per-browser
// localStorage so every user on the same account sees the same archive.
//
//  - `id`          matches the client-generated "arch-{timestamp}" id so the
//                  one-time migration from localStorage is idempotent.
//  - `projectId`   scopes the item to the AIO Fusion project it belongs to.
//  - `owner`       is the lowercased platform account username; mirrors the
//                  pattern used by the projects table for fast ACL checks.
//  - `deletedAt`   is a soft delete so all sessions learn about removals.
export const archiveItemsTable = pgTable("archive_items", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull(),
  owner: varchar("owner").notNull(),
  title: varchar("title").notNull().default(""),
  contentType: varchar("content_type").notNull().default(""),
  spokesperson: varchar("spokesperson"),
  status: varchar("status").notNull().default("Draft"),
  tags: jsonb("tags").$type<string[]>().default([]),
  headline: text("headline"),
  standfirst: text("standfirst"),
  bodyCopy: text("body_copy"),
  body: text("body"),
  selectedMessages: jsonb("selected_messages").$type<string[]>(),
  mediaCats: jsonb("media_cats").$type<string[]>(),
  pubDate: varchar("pub_date"),
  releasedAt: varchar("released_at"),
  releaseChannel: varchar("release_channel"),
  source: varchar("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Comms Planner items — planned content pieces on the 12-week calendar.
// Replaces per-browser localStorage so the whole team shares the same plan.
export const plannerItemsTable = pgTable("planner_items", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull(),
  owner: varchar("owner").notNull(),
  title: varchar("title").notNull().default(""),
  contentType: varchar("content_type").notNull().default(""),
  spokesperson: varchar("spokesperson").notNull().default(""),
  keyMessage: varchar("key_message").notNull().default(""),
  audience: varchar("audience").notNull().default(""),
  channels: jsonb("channels").$type<string[]>().notNull().default([]),
  week: integer("week").notNull().default(1),
  status: varchar("status").notNull().default("Planned"),
  releaseDate: varchar("release_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Scoring configuration — per platform account. Stores the channel weights,
// content-type weights and status multipliers that drive the Comms Planner
// GEO score. Replaces localStorage so changing weights on one device applies
// everywhere for that account.
export const scoringConfigsTable = pgTable("scoring_configs", {
  owner: varchar("owner").primaryKey(),
  config: jsonb("config").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ArchiveItemRow = typeof archiveItemsTable.$inferSelect;
export type InsertArchiveItem = typeof archiveItemsTable.$inferInsert;
export type PlannerItemRow = typeof plannerItemsTable.$inferSelect;
export type InsertPlannerItem = typeof plannerItemsTable.$inferInsert;
export type ScoringConfigRow = typeof scoringConfigsTable.$inferSelect;

// Saved Earned Media audit results — one row per audit run per project.
// Replaces per-browser localStorage so every login on the same project sees
// the same audit history. `result` is the full LlmCheckResult JSON blob.
export const savedAuditsTable = pgTable("saved_audits", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull(),
  owner: varchar("owner").notNull(),
  savedAt: varchar("saved_at").notNull(),
  result: jsonb("result").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Saved Website/GEO diagnostic results — one row per diagnostic run per
// project. `result` is the full DiagnosticResult JSON blob.
export const savedDiagnosticsTable = pgTable("saved_diagnostics", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull(),
  owner: varchar("owner").notNull(),
  savedAt: varchar("saved_at").notNull(),
  result: jsonb("result").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type SavedAuditRow = typeof savedAuditsTable.$inferSelect;
export type SavedDiagnosticRow = typeof savedDiagnosticsTable.$inferSelect;

// Saved Content GEO scores — one row per scan per project.
// `result` holds the full SavedScored JSON blob { id, savedAt, score }.
export const savedContentGeoTable = pgTable("saved_content_geo", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull(),
  owner: varchar("owner").notNull(),
  savedAt: varchar("saved_at").notNull(),
  result: jsonb("result").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Saved Technical GEO scores — one row per scan per project.
// `result` holds the full SavedTechGeo JSON blob { id, savedAt, score, result }.
export const savedTechGeoTable = pgTable("saved_tech_geo", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull(),
  owner: varchar("owner").notNull(),
  savedAt: varchar("saved_at").notNull(),
  result: jsonb("result").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type SavedContentGeoRow = typeof savedContentGeoTable.$inferSelect;
export type SavedTechGeoRow = typeof savedTechGeoTable.$inferSelect;

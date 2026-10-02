import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export type HowtoInlineRun = { text: string; bold?: boolean; italic?: boolean; href?: string };
export type HowtoBlock =
  | { type: "heading" | "paragraph" | "tip"; runs: HowtoInlineRun[] }
  | { type: "step"; number: number; title: string; runs: HowtoInlineRun[] }
  | { type: "list"; items: string[] }
  | { type: "image"; mediaId: string; altText: string; caption?: string; url?: string | null }
  | { type: "video"; url: string; caption?: string };

export const howtoEntriesTable = pgTable("howto_entries", {
  id: varchar("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: varchar("type").notNull(),
  readTime: varchar("read_time").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  status: varchar("status").notNull().default("draft"),
  body: jsonb("body").$type<HowtoBlock[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const howtoMigrationLedgerTable = pgTable("howto_migration_ledger", {
  id: varchar("id").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HowtoEntryRow = typeof howtoEntriesTable.$inferSelect;
export type InsertHowtoEntry = typeof howtoEntriesTable.$inferInsert;
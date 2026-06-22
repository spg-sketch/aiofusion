import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Custom media categories added by an account on top of the built-in 110.
// account_id NULL means the row is a built-in/global standard category seeded
// by an admin; a non-null account_id means it is private to that account and
// its descendants.
export const mediaCategoriesTable = pgTable("media_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  accountId: varchar("account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Media outlets (publications). account_id NULL = global (admin-managed, visible
// to all accounts). Non-null = private to that account hierarchy.
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

// Journalist / media contacts linked to an outlet. account_id is always set to
// the account that created the contact; contacts are never global.
export const mediaContactsTable = pgTable("media_contacts", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").references(() => mediaOutletsTable.id),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  role: text("role").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  accountId: varchar("account_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type MediaCategoryRow = typeof mediaCategoriesTable.$inferSelect;
export type MediaOutletRow = typeof mediaOutletsTable.$inferSelect;
export type MediaContactRow = typeof mediaContactsTable.$inferSelect;

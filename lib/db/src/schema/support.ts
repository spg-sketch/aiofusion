import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// FAQ entries that power George (the AI support assistant). Each entry
// belongs to a named category and is ranked by display_order within it.
//
//  - `keywords`      comma-separated list of terms for full-text search.
//  - `isActive`      false entries are hidden from George but kept for history.
//  - `displayOrder`  controls sort within a category; lower = shown first.
export const supportFaqTable = pgTable("support_faq", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 128 }).notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  keywords: text("keywords").notNull().default(""),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Support tickets raised by users after George could not help. The server
// auto-attaches account_username, role, and project_id from the session.
//
//  - `status`         open | in_progress | resolved | closed
//  - `attachmentUrl`  optional uploaded file URL (screenshot etc.)
//  - `adminNotes`     internal note visible only to admins.
export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  accountUsername: varchar("account_username", { length: 64 }).notNull(),
  userRole: varchar("user_role", { length: 32 }).notNull().default("user"),
  projectId: varchar("project_id", { length: 128 }),
  category: varchar("category", { length: 64 }).notNull().default("General"),
  subject: varchar("subject", { length: 256 }).notNull(),
  description: text("description").notNull(),
  attachmentUrl: text("attachment_url"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  adminNotes: text("admin_notes"),
  hasAdminReply: boolean("has_admin_reply").notNull().default(false),
  userSeenReply: boolean("user_seen_reply").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Individual messages on a ticket thread (user replies and admin replies).
//
//  - `authorType`   "user" | "admin"
export const supportTicketMessagesTable = pgTable("support_ticket_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  authorType: varchar("author_type", { length: 16 }).notNull(),
  authorUsername: varchar("author_username", { length: 64 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SupportFaqRow = typeof supportFaqTable.$inferSelect;
export type InsertSupportFaq = typeof supportFaqTable.$inferInsert;

export type SupportTicketRow = typeof supportTicketsTable.$inferSelect;
export type InsertSupportTicket = typeof supportTicketsTable.$inferInsert;

export type SupportTicketMessageRow = typeof supportTicketMessagesTable.$inferSelect;
export type InsertSupportTicketMessage = typeof supportTicketMessagesTable.$inferInsert;

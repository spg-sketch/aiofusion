import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const contactSubmissionsTable = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 256 }).notNull(),
  company: varchar("company", { length: 128 }).notNull().default(""),
  subject: varchar("subject", { length: 256 }).notNull().default(""),
  message: text("message").notNull().default(""),
  emailFailed: varchar("email_failed", { length: 8 }).notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContactSubmissionRow = typeof contactSubmissionsTable.$inferSelect;
export type InsertContactSubmission = typeof contactSubmissionsTable.$inferInsert;

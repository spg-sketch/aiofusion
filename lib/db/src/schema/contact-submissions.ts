import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Stores every Book a Demo and General Enquiry submission from the marketing
// site so the team can track leads and mark follow-up status in the admin panel.
//
//  - `type`        "book-demo" | "enquiry"
//  - `status`      "pending" (default) | "actioned"
//  - `goal`        populated for book-demo submissions only
//  - `subject`     populated for enquiry submissions only
//  - `message`     populated for enquiry submissions only
//  - `emailFailed` "false" (default) | "true" — set to "true" when the
//                  post-save email dispatch fails so ops can identify and
//                  manually follow up with leads whose confirmation email
//                  was not sent.
export const contactSubmissionsTable = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  email: varchar("email", { length: 256 }).notNull(),
  company: varchar("company", { length: 128 }).notNull().default(""),
  goal: text("goal"),
  subject: varchar("subject", { length: 256 }),
  message: text("message"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  emailFailed: varchar("email_failed", { length: 8 }).notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ContactSubmissionRow = typeof contactSubmissionsTable.$inferSelect;
export type InsertContactSubmission = typeof contactSubmissionsTable.$inferInsert;

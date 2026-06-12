import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Shared project store. Projects (and their Set-Up / intake data) used to live
// only in each browser's localStorage, so the same login on a different device
// never saw the same projects. This table is the shared, server-side source of
// truth so one login sees every project everywhere.
//
//  - `data`   holds the lightweight project record shown in the hub (name,
//             sector, colour, owner, stats). Kept small so the hub list loads
//             quickly.
//  - `intake` holds the full Project Set-Up answers blob. Larger, so it is
//             fetched per project only when the Set-Up form is opened.
//  - `logo`   is the client logo data URL (can be large), kept in its own
//             column rather than inside `data`.
//  - `deletedAt` is a soft delete so other devices learn a project was removed
//             on their next sync instead of resurrecting it.
export const projectsTable = pgTable("projects", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull().default(""),
  data: jsonb("data").notNull().default({}),
  intake: jsonb("intake"),
  logo: text("logo"),
  // Lowercased username of the platform account that owns this project. Drives
  // server-side data isolation: an account only sees its own projects (plus its
  // sub-accounts'); an admin sees all. Nullable for legacy rows created before
  // ownership was enforced - those are treated as admin-only until backfilled.
  owner: varchar("owner"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type ProjectRow = typeof projectsTable.$inferSelect;
export type InsertProject = typeof projectsTable.$inferInsert;

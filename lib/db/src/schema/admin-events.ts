import { jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const adminEventsTable = pgTable("admin_events", {
  id: serial("id").primaryKey(),
  actorId: varchar("actor_id", { length: 200 }).notNull().default(""),
  actorUsername: varchar("actor_username", { length: 200 }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  targetId: varchar("target_id", { length: 300 }),
  targetType: varchar("target_type", { length: 100 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminEventRow = typeof adminEventsTable.$inferSelect;
export type InsertAdminEvent = typeof adminEventsTable.$inferInsert;

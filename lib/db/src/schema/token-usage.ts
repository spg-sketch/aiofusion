import { integer, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const tokenUsageTable = pgTable("token_usage", {
  id: serial("id").primaryKey(),
  accountId: varchar("account_id", { length: 200 }).notNull(),
  operation: varchar("operation", { length: 80 }).notNull(),
  model: varchar("model", { length: 80 }).notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costGbpEstimate: numeric("cost_gbp_estimate", { precision: 10, scale: 6 }),
  projectId: varchar("project_id", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TokenUsageRow = typeof tokenUsageTable.$inferSelect;
export type InsertTokenUsage = typeof tokenUsageTable.$inferInsert;

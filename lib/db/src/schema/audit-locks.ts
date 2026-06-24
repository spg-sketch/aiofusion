import { pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";

export const auditLocksTable = pgTable(
  "audit_locks",
  {
    projectId: varchar("project_id").notNull(),
    auditType: varchar("audit_type").notNull(),
    owner: varchar("owner").notNull().default(""),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.auditType] })],
);

export type AuditLockRow = typeof auditLocksTable.$inferSelect;

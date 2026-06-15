import { jsonb, pgTable, serial, text, timestamp, varchar, index } from "drizzle-orm/pg-core";

// Append-only backup history for projects. Every time a project's hub record or
// its Set-Up (intake) answers are saved, a full copy of the resulting row is
// written here. Nothing in this table is ever overwritten, so even a future bug
// or a bad save can always be rolled back to an earlier version. This is the
// concrete, in-our-control safety net against losing client data.
//
// Rows are deduped on write: an identical re-save does not add a new snapshot,
// so the history only ever grows by genuine changes.
export const projectSnapshotsTable = pgTable(
  "project_snapshots",
  {
    id: serial("id").primaryKey(),
    // The project this snapshot belongs to (projects.id). Not a hard FK so a
    // project row being removed can never cascade-delete its backups.
    projectId: varchar("project_id").notNull(),
    // A full copy of the project's state at snapshot time.
    name: varchar("name").notNull().default(""),
    data: jsonb("data").notNull().default({}),
    intake: jsonb("intake"),
    logo: text("logo"),
    owner: varchar("owner"),
    // Why the snapshot was taken: "intake", "upsert", "pre-restore", etc. Helps
    // a human pick the right version to restore.
    reason: varchar("reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_snapshots_project_idx").on(t.projectId, t.createdAt)],
);

export type ProjectSnapshotRow = typeof projectSnapshotsTable.$inferSelect;
export type InsertProjectSnapshot = typeof projectSnapshotsTable.$inferInsert;

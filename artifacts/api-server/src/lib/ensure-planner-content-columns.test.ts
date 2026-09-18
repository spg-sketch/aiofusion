import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  return {
    db,
    pool: { end: () => client.close() },
  };
});

import { db, pool } from "@workspace/db";
import { ensurePlannerContentColumns } from "./ensure-planner-content-columns";

describe("ensurePlannerContentColumns", () => {
  beforeAll(async () => {
    await db.execute(sql`CREATE TABLE archive_items (id varchar PRIMARY KEY)`);
    await db.execute(sql`CREATE TABLE planner_items (id varchar PRIMARY KEY)`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("adds lossless Creator fields to legacy content tables and is idempotent", async () => {
    await ensurePlannerContentColumns();
    await ensurePlannerContentColumns();

    const columns = await db.execute(sql<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name IN ('archive_items', 'planner_items')
        AND column_name IN ('pitch', 'spokesperson_linkedin')
      ORDER BY table_name, column_name
    `);

    expect(columns.rows).toEqual([
      { table_name: "archive_items", column_name: "pitch", data_type: "text", is_nullable: "YES" },
      { table_name: "archive_items", column_name: "spokesperson_linkedin", data_type: "text", is_nullable: "YES" },
      { table_name: "planner_items", column_name: "pitch", data_type: "text", is_nullable: "YES" },
      { table_name: "planner_items", column_name: "spokesperson_linkedin", data_type: "text", is_nullable: "YES" },
    ]);

    await db.execute(sql`
      INSERT INTO archive_items (id, pitch, spokesperson_linkedin)
      VALUES ('archive-1', 'News hook', 'https://www.linkedin.com/in/archive')
    `);
    await db.execute(sql`
      INSERT INTO planner_items (id, pitch, spokesperson_linkedin)
      VALUES ('planner-1', 'Planner hook', 'https://www.linkedin.com/in/planner')
    `);
    const values = await db.execute(sql<{ id: string; pitch: string; spokesperson_linkedin: string }>`
      SELECT id, pitch, spokesperson_linkedin FROM archive_items
      UNION ALL
      SELECT id, pitch, spokesperson_linkedin FROM planner_items
      ORDER BY id
    `);
    expect(values.rows).toEqual([
      { id: "archive-1", pitch: "News hook", spokesperson_linkedin: "https://www.linkedin.com/in/archive" },
      { id: "planner-1", pitch: "Planner hook", spokesperson_linkedin: "https://www.linkedin.com/in/planner" },
    ]);
  });
});
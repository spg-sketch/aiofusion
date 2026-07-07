import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureSavedAuditTables(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_audits (
        id          varchar PRIMARY KEY,
        project_id  varchar NOT NULL,
        owner       varchar NOT NULL,
        saved_at    varchar NOT NULL,
        result      jsonb NOT NULL,
        deleted_at  timestamptz
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_diagnostics (
        id          varchar PRIMARY KEY,
        project_id  varchar NOT NULL,
        owner       varchar NOT NULL,
        saved_at    varchar NOT NULL,
        result      jsonb NOT NULL,
        deleted_at  timestamptz
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_content_geo (
        id          varchar PRIMARY KEY,
        project_id  varchar NOT NULL,
        owner       varchar NOT NULL,
        saved_at    varchar NOT NULL,
        result      jsonb NOT NULL,
        deleted_at  timestamptz
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_tech_geo (
        id          varchar PRIMARY KEY,
        project_id  varchar NOT NULL,
        owner       varchar NOT NULL,
        saved_at    varchar NOT NULL,
        result      jsonb NOT NULL,
        deleted_at  timestamptz
      )
    `);
  } catch (err: unknown) {
    logger.error({ err }, "Failed to ensure saved audit tables");
  }
}

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// PGlite-backed in-memory database mock
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await client.exec(`
    CREATE TABLE IF NOT EXISTS platform_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) UNIQUE,
      name varchar(128),
      password_hash text,
      session_version integer NOT NULL DEFAULT 0,
      email_verified boolean,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS platform_password_resets (
      token varchar(64) PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS platform_email_verifications (
      token varchar(64) PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    );
  `);

  return { db };
});

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { cleanupExpiredTokens } from "./cleanup-expired-tokens";

const DAY = 24 * 60 * 60 * 1000;

async function seedUser(): Promise<string> {
  const res = await db.execute(sql`
    INSERT INTO platform_users (email) VALUES (${`u${Math.random()}@x.com`}) RETURNING id
  `);
  return (res as unknown as { rows: { id: string }[] }).rows[0].id;
}

async function insertToken(
  table: "platform_password_resets" | "platform_email_verifications",
  token: string,
  userId: string,
  expiresAt: Date,
  usedAt: Date | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO ${sql.raw(table)} (token, user_id, expires_at, used_at)
    VALUES (${token}, ${userId}::uuid, ${expiresAt}, ${usedAt})
  `);
}

async function tokens(table: string): Promise<string[]> {
  const res = await db.execute(sql`SELECT token FROM ${sql.raw(table)} ORDER BY token`);
  return (res as unknown as { rows: { token: string }[] }).rows.map((r) => r.token);
}

describe("cleanupExpiredTokens()", () => {
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM platform_password_resets`);
    await db.execute(sql`DELETE FROM platform_email_verifications`);
  });

  it("deletes rows expired or used beyond the 7-day grace period, keeps the rest", async () => {
    const userId = await seedUser();
    const now = Date.now();

    for (const table of ["platform_password_resets", "platform_email_verifications"] as const) {
      // Long-expired: should be deleted
      await insertToken(table, "old-expired", userId, new Date(now - 8 * DAY), null);
      // Long-used: should be deleted (even if expires_at is in the future)
      await insertToken(table, "old-used", userId, new Date(now + DAY), new Date(now - 8 * DAY));
      // Recently expired (within grace period): kept
      await insertToken(table, "recent-expired", userId, new Date(now - 1 * DAY), null);
      // Recently used: kept
      await insertToken(table, "recent-used", userId, new Date(now + DAY), new Date(now - 1 * DAY));
      // Still valid: kept
      await insertToken(table, "valid", userId, new Date(now + DAY), null);
    }

    await cleanupExpiredTokens();

    for (const table of ["platform_password_resets", "platform_email_verifications"] as const) {
      expect(await tokens(table)).toEqual(["recent-expired", "recent-used", "valid"]);
    }
  });

  it("is a no-op when tables are empty", async () => {
    await expect(cleanupExpiredTokens()).resolves.toBeUndefined();
    expect(await tokens("platform_password_resets")).toEqual([]);
  });
});

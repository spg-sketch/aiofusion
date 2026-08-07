import { describe, it, expect, beforeAll } from "vitest";

// A real (in-memory) Postgres engine so the timestamp comparison in
// `getSession()` and the bulk-delete in `pruneExpiredSessions()` run actual
// SQL - not a hand-rolled JS mock.  This proves that expired rows are rejected
// and deleted by the real drizzle query, not just by a mocked branch.
import { vi } from "vitest";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  await client.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid varchar PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);
  `);

  return { db, sessionsTable: schema.sessionsTable };
});

import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSession, pruneExpiredSessions, SESSION_TTL } from "./auth";

const SAMPLE_SESSION = {
  user: { id: "u1", email: "u@test.com", firstName: null, lastName: null, profileImageUrl: null },
  access_token: "tok",
};

describe("session expiry - DB-backed (PGlite)", () => {
  describe("getSession()", () => {
    it("returns session data for a valid (non-expired) session", async () => {
      const sid = "valid-sid";
      await db.insert(sessionsTable).values({
        sid,
        sess: SAMPLE_SESSION as unknown as Record<string, unknown>,
        expire: new Date(Date.now() + SESSION_TTL),
      });

      const result = await getSession(sid);

      expect(result).not.toBeNull();
      expect(result?.user?.id).toBe("u1");
    });

    it("returns null for an expired session (expire in the past)", async () => {
      const sid = "expired-sid";
      await db.insert(sessionsTable).values({
        sid,
        sess: SAMPLE_SESSION as unknown as Record<string, unknown>,
        expire: new Date(Date.now() - 1000),
      });

      const result = await getSession(sid);

      expect(result).toBeNull();
    });

    it("deletes the expired row from the DB so it cannot be fetched again", async () => {
      const sid = "auto-delete-sid";
      await db.insert(sessionsTable).values({
        sid,
        sess: SAMPLE_SESSION as unknown as Record<string, unknown>,
        expire: new Date(Date.now() - 1000),
      });

      await getSession(sid);

      const [row] = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.sid, sid));
      expect(row).toBeUndefined();
    });

    it("returns null for a completely unknown sid", async () => {
      const result = await getSession("nonexistent-sid");
      expect(result).toBeNull();
    });
  });

  describe("pruneExpiredSessions()", () => {
    beforeAll(async () => {
      await db.delete(sessionsTable);
    });

    it("removes expired rows while leaving valid ones intact", async () => {
      await db.insert(sessionsTable).values([
        {
          sid: "prune-expired-1",
          sess: SAMPLE_SESSION as unknown as Record<string, unknown>,
          expire: new Date(Date.now() - 2000),
        },
        {
          sid: "prune-expired-2",
          sess: SAMPLE_SESSION as unknown as Record<string, unknown>,
          expire: new Date(Date.now() - 1000),
        },
        {
          sid: "prune-keep-1",
          sess: SAMPLE_SESSION as unknown as Record<string, unknown>,
          expire: new Date(Date.now() + SESSION_TTL),
        },
      ]);

      await pruneExpiredSessions();

      const rows = await db.select().from(sessionsTable);
      const sids = rows.map((r) => r.sid);
      expect(sids).toContain("prune-keep-1");
      expect(sids).not.toContain("prune-expired-1");
      expect(sids).not.toContain("prune-expired-2");
    });

    it("is a no-op when all sessions are still valid", async () => {
      await db.delete(sessionsTable);
      await db.insert(sessionsTable).values({
        sid: "still-valid",
        sess: SAMPLE_SESSION as unknown as Record<string, unknown>,
        expire: new Date(Date.now() + SESSION_TTL),
      });

      await pruneExpiredSessions();

      const [row] = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.sid, "still-valid"));
      expect(row).toBeDefined();
    });
  });
});

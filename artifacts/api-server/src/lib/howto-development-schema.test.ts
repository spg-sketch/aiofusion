import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import { assertHowtoDevelopmentTarget, createHowtoDevelopmentTables } from "./howto-development-schema";

describe("safe How-to development setup", () => {
  const development = { DEPLOYMENT_ENV: "development", DATABASE_URL: "postgresql://localhost/development" };

  it("refuses unknown, published, production, beta, and protected target identities", () => {
    expect(() => assertHowtoDevelopmentTarget(development)).not.toThrow();
    for (const extra of [
      { DEPLOYMENT_ENV: undefined },
      { DEPLOYMENT_ENV: "staging" },
      { NODE_ENV: "production" },
      { REPLIT_DEPLOYMENT: "1" },
      { PRODUCTION_DATABASE_URL: "postgresql://different-user@localhost/development" },
      { BETA_DATABASE_URL: development.DATABASE_URL },
      { STAGING_TIER_VERIFICATION_DATABASE_URL: development.DATABASE_URL },
    ]) expect(() => assertHowtoDevelopmentTarget({ ...development, ...extra })).toThrow();
  });

  it("creates only the two How-to tables idempotently and preserves existing content and sequences", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE unrelated (id serial PRIMARY KEY, content text); INSERT INTO unrelated (content) VALUES ('preserved')");
      await createHowtoDevelopmentTables(db);
      await db.exec(`INSERT INTO howto_entries (id,title,description,type,read_time)
        VALUES ('saved','Saved title','Saved description','guide','5 minutes')`);
      await createHowtoDevelopmentTables(db);
      const saved = await db.query<{ title: string; body: unknown; status: string }>("SELECT title, body, status FROM howto_entries");
      expect(saved.rows).toEqual([{ title: "Saved title", body: [], status: "draft" }]);
      expect((await db.query("SELECT content FROM unrelated")).rows).toEqual([{ content: "preserved" }]);
      expect((await db.query("SELECT last_value FROM unrelated_id_seq")).rows).toEqual([{ last_value: 1 }]);
      expect((await db.query("SELECT count(*)::int AS total FROM howto_migration_ledger")).rows).toEqual([{ total: 0 }]);
    } finally {
      await db.close();
    }
  });

  it("rolls back and reports statement failures rather than proceeding to seed migration", async () => {
    const failure = new Error("DDL failed");
    const query = vi.fn().mockResolvedValue(undefined).mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => { throw failure; });
    await expect(createHowtoDevelopmentTables({ query })).rejects.toBe(failure);
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([
      "BEGIN", expect.stringContaining("CREATE TABLE IF NOT EXISTS public.howto_entries"), "ROLLBACK",
    ]);
  });
});
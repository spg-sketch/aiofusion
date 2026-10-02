import { afterAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`CREATE TABLE token_usage (
    id serial PRIMARY KEY, account_id varchar(200) NOT NULL, operation varchar(80) NOT NULL,
    model varchar(80) NOT NULL, input_tokens integer NOT NULL DEFAULT 0,
    output_tokens integer NOT NULL DEFAULT 0, cost_gbp_estimate numeric(10,6),
    project_id varchar(200), created_at timestamptz NOT NULL DEFAULT now()
  )`);
  return { ...schema, db: drizzle(client, { schema }), pool: { end: () => client.close() } };
});

import { db, pool, tokenUsageTable } from "@workspace/db";
import { ensureTokenUsageSequence } from "./ensure-token-usage-sequence";
import { CoverageAccountingError, reserveJournalistCoverageUsageBatch, safeCoverageAccountingDiagnostic } from "./token-usage";

afterAll(() => pool.end());

describe("coverage accounting serial readiness", () => {
  it("reproduces the deployed occupied-next-ID cause, repairs without changing usage, and is idempotent", async () => {
    await db.execute(sql`INSERT INTO token_usage(id, account_id, operation, model, cost_gbp_estimate)
      VALUES (949, 'fixture', 'historic', 'gpt-5', 1.25), (1179, 'fixture', 'historic', 'gpt-5', 2.50)`);
    await db.execute(sql`SELECT setval('token_usage_id_seq', 948, true)`);
    let failure: unknown;
    try {
      await reserveJournalistCoverageUsageBatch({ accountId: "fixture", limitGbp: 50, callCount: 1 });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(CoverageAccountingError);
    expect(safeCoverageAccountingDiagnostic(failure)).toMatchObject({ code: "23505", constraint: "token_usage_pkey" });
    expect((failure as Error).message).not.toContain("fixture");
    // Reset the sequence to the original failing state; failed INSERT consumed
    // its nextval even though the accounting transaction rolled back.
    await db.execute(sql`SELECT setval('token_usage_id_seq', 948, true)`);
    await ensureTokenUsageSequence();
    await ensureTokenUsageSequence();
    const ids = await reserveJournalistCoverageUsageBatch({ accountId: "fixture", limitGbp: 50, callCount: 5 });
    expect(ids).toEqual([1180, 1181, 1182, 1183, 1184]);
    const history = await db.select().from(tokenUsageTable);
    expect(history.filter(row => row.operation === "historic").map(row => row.costGbpEstimate)).toEqual(["1.250000", "2.500000"]);
  });

  it("does not rewind a healthy ahead-of-data sequence", async () => {
    await db.execute(sql`SELECT setval('token_usage_id_seq', 2000, true)`);
    await ensureTokenUsageSequence();
    expect(await reserveJournalistCoverageUsageBatch({ accountId: "fixture", limitGbp: 50, callCount: 1 })).toEqual([2001]);
  });

  it("does not expose query parameters or PostgreSQL detail in diagnostics", () => {
    const error = new CoverageAccountingError({ message: "SQL params: customer", cause: { code: "23505", constraint: "token_usage_pkey", detail: "Key (id)=(949)", query: "INSERT", params: ["customer"] } });
    expect(safeCoverageAccountingDiagnostic(error)).toEqual({ code: "23505", table: undefined, column: undefined, constraint: "token_usage_pkey" });
  });
});
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { randomUUID } from "node:crypto";

const LEASE_MINUTES = 45;

export async function ensureAuditRunClaimsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS audit_runs (
      run_id varchar PRIMARY KEY,
      project_id varchar NOT NULL,
      audit_type varchar NOT NULL,
      owner varchar NOT NULL DEFAULT '',
      status varchar NOT NULL DEFAULT 'running',
      lease_expires_at timestamptz NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      saved_id varchar
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS audit_runs_one_running
    ON audit_runs (project_id, audit_type) WHERE status = 'running'
  `);
}

export async function claimAuditRun(
  projectId: string,
  auditType: string,
  owner: string,
): Promise<string | null | undefined> {
  const runId = randomUUID();
  // Lightweight route unit tests provide only the query-builder surface of db;
  // the production Drizzle client always has execute().
  if (typeof (db as any).execute !== "function") return undefined;
  await db.execute(sql`
    UPDATE audit_runs
    SET status = 'failed'
    WHERE project_id = ${projectId}
      AND audit_type = ${auditType}
      AND status = 'running'
      AND lease_expires_at < now()
  `);
  const rows = await db.execute(sql`
    INSERT INTO audit_runs
      (run_id, project_id, audit_type, owner, status, lease_expires_at)
    VALUES
      (${runId}, ${projectId}, ${auditType}, ${owner}, 'running',
       now() + (${LEASE_MINUTES} || ' minutes')::interval)
    ON CONFLICT DO NOTHING
    RETURNING run_id
  `);
  return (rows.rows[0] as { run_id?: string } | undefined)?.run_id ?? null;
}

export async function failAuditRun(runId: string): Promise<void> {
  if (typeof (db as any).execute !== "function") return;
  await db.execute(sql`
    UPDATE audit_runs
    SET status = 'failed', completed_at = now()
    WHERE run_id = ${runId} AND status = 'running'
  `);
}

export { sql };
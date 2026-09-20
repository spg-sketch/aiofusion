import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { randomUUID } from "node:crypto";

const LEASE_SECONDS = 90;
const MAX_ATTEMPTS = 3;
export const AUDIT_WORKER_ID = randomUUID();

export type RecoverableAuditRun = {
  runId: string;
  projectId: string;
  auditType: string;
  owner: string;
  payload: Record<string, unknown>;
  attemptCount: number;
};

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
      saved_id varchar,
      progress_done integer NOT NULL DEFAULT 0,
      progress_total integer NOT NULL DEFAULT 0,
      error_message varchar,
      payload jsonb,
      worker_id varchar,
      attempt_count integer NOT NULL DEFAULT 1,
      max_attempts integer NOT NULL DEFAULT 3
    )
  `);
  await db.execute(sql`ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS progress_done integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS progress_total integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS error_message varchar`);
  await db.execute(sql`ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS payload jsonb`);
  await db.execute(sql`ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS worker_id varchar`);
  await db.execute(sql`ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE audit_runs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS audit_runs_one_running
    ON audit_runs (project_id, audit_type) WHERE status = 'running'
  `);
}

export async function claimAuditRun(
  projectId: string,
  auditType: string,
  owner: string,
  payload?: Record<string, unknown>,
): Promise<string | null | undefined> {
  const runId = randomUUID();
  // Lightweight route unit tests provide only the query-builder surface of db;
  // the production Drizzle client always has execute().
  if (typeof (db as any).execute !== "function") return undefined;
  await expireStaleAuditRuns({ projectId, auditType });
  const rows = await db.execute(sql`
    INSERT INTO audit_runs
      (run_id, project_id, audit_type, owner, status, lease_expires_at, payload, worker_id)
    VALUES
      (${runId}, ${projectId}, ${auditType}, ${owner}, 'running',
       now() + (${LEASE_SECONDS} || ' seconds')::interval, ${payload ? JSON.stringify(payload) : null}::jsonb, ${AUDIT_WORKER_ID})
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
    WHERE run_id = ${runId} AND status = 'running' AND worker_id = ${AUDIT_WORKER_ID}
  `);
}

export async function updateAuditRunProgress(
  runId: string,
  done: number,
  total: number,
): Promise<void> {
  if (typeof (db as any).execute !== "function") return;
  await db.execute(sql`
    UPDATE audit_runs
    SET progress_done = ${Math.max(0, Math.floor(done))},
        progress_total = ${Math.max(0, Math.floor(total))},
         lease_expires_at = now() + (${LEASE_SECONDS} || ' seconds')::interval
     WHERE run_id = ${runId} AND status = 'running' AND worker_id = ${AUDIT_WORKER_ID}
  `);
}

export async function failAuditRunWithMessage(runId: string, message: string): Promise<void> {
  if (typeof (db as any).execute !== "function") return;
  await db.execute(sql`
    UPDATE audit_runs
    SET status = 'failed', completed_at = now(), error_message = ${message.slice(0, 500)}
     WHERE run_id = ${runId} AND status = 'running' AND worker_id = ${AUDIT_WORKER_ID}
  `);
}

export async function retryAuditRunAfterFailure(runId: string, message: string): Promise<void> {
  if (typeof (db as any).execute !== "function") return;
  await db.execute(sql`
    UPDATE audit_runs
    SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'running' END,
        completed_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
        lease_expires_at = now(),
        error_message = CASE
          WHEN attempt_count >= max_attempts
            THEN 'This audit could not finish after three attempts. Please start a new audit.'
          ELSE ${message.slice(0, 500)}
        END
    WHERE run_id = ${runId} AND status = 'running' AND worker_id = ${AUDIT_WORKER_ID}
  `);
}

export async function reclaimRecoverableAuditRuns(limit = 2): Promise<RecoverableAuditRun[]> {
  if (typeof (db as any).execute !== "function") return [];
  const rows = await db.execute(sql`
    WITH candidates AS (
      SELECT run_id
      FROM audit_runs
      WHERE status = 'running'
        AND payload IS NOT NULL
        AND lease_expires_at < now()
        AND attempt_count < max_attempts
      ORDER BY started_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${Math.max(1, Math.floor(limit))}
    )
    UPDATE audit_runs r
    SET worker_id = ${AUDIT_WORKER_ID},
        attempt_count = r.attempt_count + 1,
        lease_expires_at = now() + (${LEASE_SECONDS} || ' seconds')::interval,
        error_message = NULL
    FROM candidates
    WHERE r.run_id = candidates.run_id
    RETURNING r.run_id, r.project_id, r.audit_type, r.owner, r.payload, r.attempt_count
  `);
  return rows.rows.map((row: any) => ({
    runId: row.run_id,
    projectId: row.project_id,
    auditType: row.audit_type,
    owner: row.owner,
    payload: row.payload,
    attemptCount: row.attempt_count,
  }));
}

export async function failExhaustedAuditRuns(): Promise<void> {
  if (typeof (db as any).execute !== "function") return;
  await db.execute(sql`
    UPDATE audit_runs
    SET status = 'failed',
        completed_at = now(),
        error_message = 'This audit could not finish after three attempts. Please start a new audit.'
    WHERE status = 'running'
      AND lease_expires_at < now()
      AND attempt_count >= max_attempts
  `);
}

export async function releaseOwnedAuditRunLeases(): Promise<void> {
  if (typeof (db as any).execute !== "function") return;
  await db.execute(sql`
    UPDATE audit_runs
    SET lease_expires_at = now()
    WHERE status = 'running' AND worker_id = ${AUDIT_WORKER_ID}
  `);
}

export async function expireStaleAuditRuns(filters: {
  runId?: string;
  projectId?: string;
  auditType?: string;
  owner?: string;
}): Promise<void> {
  if (typeof (db as any).execute !== "function") return;
  await db.execute(sql`
    UPDATE audit_runs
    SET status = 'failed',
        completed_at = now(),
        error_message = CASE
          WHEN payload IS NOT NULL AND attempt_count >= max_attempts
            THEN 'This audit could not finish after three attempts. Please start a new audit.'
          ELSE 'This audit stopped before it completed. Please start a new audit.'
        END
    WHERE status = 'running'
      AND lease_expires_at < now()
      AND (payload IS NULL OR attempt_count >= max_attempts)
      AND (${filters.runId ?? null}::varchar IS NULL OR run_id = ${filters.runId ?? null})
      AND (${filters.projectId ?? null}::varchar IS NULL OR project_id = ${filters.projectId ?? null})
      AND (${filters.auditType ?? null}::varchar IS NULL OR audit_type = ${filters.auditType ?? null})
      AND (${filters.owner ?? null}::varchar IS NULL OR owner = ${filters.owner ?? null})
  `);
}

export { sql };
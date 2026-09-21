import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type MediaDiscoveryEvidenceStatus = "pending" | "verified" | "failed";
export type MediaDiscoveryRunItem = Record<string, unknown> & {
  candidateKey: string;
  evidenceStatus: MediaDiscoveryEvidenceStatus;
  evidenceFailure?: string;
};

export async function ensureMediaDiscoveryRunsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_discovery_runs (
      run_id varchar PRIMARY KEY,
      owner varchar NOT NULL,
      project_id varchar NOT NULL,
      story_key varchar NOT NULL,
      status varchar NOT NULL DEFAULT 'running',
      items jsonb NOT NULL DEFAULT '[]'::jsonb,
      discovery_token text NOT NULL DEFAULT '',
      error_message varchar,
      started_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS media_discovery_runs_identity_latest
    ON media_discovery_runs (owner, project_id, story_key, started_at DESC)
  `);
  await expireStaleMediaDiscoveryRuns();
}

export async function expireStaleMediaDiscoveryRuns(): Promise<void> {
  await db.execute(sql`
    UPDATE media_discovery_runs
    SET status = 'failed',
        error_message = 'This live search was interrupted before it completed. Please start a new search.',
        updated_at = now(),
        completed_at = now()
    WHERE status = 'running'
      AND updated_at < now() - interval '10 minutes'
  `);
}

export async function createMediaDiscoveryRun(owner: string, projectId: string, storyKey: string): Promise<string> {
  await ensureMediaDiscoveryRunsTable();
  const runId = randomUUID();
  await db.execute(sql`
    INSERT INTO media_discovery_runs (run_id, owner, project_id, story_key)
    VALUES (${runId}, ${owner}, ${projectId}, ${storyKey})
  `);
  return runId;
}

export async function setMediaDiscoveryCandidates(runId: string, items: Record<string, unknown>[]): Promise<void> {
  const pending = items.map((item) => ({ ...item, evidenceStatus: "pending" }));
  await db.execute(sql`
    UPDATE media_discovery_runs
    SET items = ${JSON.stringify(pending)}::jsonb, updated_at = now()
    WHERE run_id = ${runId} AND status = 'running'
  `);
}

export async function settleMediaDiscoveryCandidate(
  runId: string,
  candidateKey: string,
  item: Record<string, unknown> | null,
  failure = "The cited page did not verify this journalist.",
): Promise<void> {
  const replacement = item
    ? { ...item, evidenceStatus: "verified" }
    : null;
  await db.execute(sql`
    UPDATE media_discovery_runs
    SET items = (
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN candidate->>'candidateKey' = ${candidateKey}
            THEN CASE
              WHEN ${replacement ? JSON.stringify(replacement) : null}::jsonb IS NOT NULL
                THEN ${replacement ? JSON.stringify(replacement) : null}::jsonb
              ELSE candidate || jsonb_build_object(
                'evidenceStatus', 'failed',
                'evidenceFailure', ${failure}
              )
            END
          ELSE candidate
        END
        ORDER BY ordinal
      ), '[]'::jsonb)
      FROM jsonb_array_elements(items) WITH ORDINALITY AS entries(candidate, ordinal)
    ),
    updated_at = now()
    WHERE run_id = ${runId} AND status = 'running'
  `);
}

export async function completeMediaDiscoveryRun(runId: string, discoveryToken: string): Promise<void> {
  await db.execute(sql`
    UPDATE media_discovery_runs
    SET status = 'succeeded', discovery_token = ${discoveryToken}, updated_at = now(), completed_at = now()
    WHERE run_id = ${runId} AND status = 'running'
  `);
}

export async function failMediaDiscoveryRun(runId: string, message: string): Promise<void> {
  await db.execute(sql`
    UPDATE media_discovery_runs
    SET status = 'failed', error_message = ${message.slice(0, 500)}, updated_at = now(), completed_at = now()
    WHERE run_id = ${runId} AND status = 'running'
  `);
}

export async function getMediaDiscoveryRun(runId: string, owner: string) {
  await expireStaleMediaDiscoveryRuns();
  const rows = await db.execute(sql`
    SELECT run_id, project_id, story_key, status, items, discovery_token, error_message,
           started_at, updated_at, completed_at
    FROM media_discovery_runs
    WHERE run_id = ${runId} AND owner = ${owner}
  `);
  return rows.rows[0] ?? null;
}

export async function getLatestMediaDiscoveryRun(owner: string, projectId: string, storyKey: string) {
  await expireStaleMediaDiscoveryRuns();
  const rows = await db.execute(sql`
    SELECT run_id, project_id, story_key, status, items, discovery_token, error_message,
           started_at, updated_at, completed_at
    FROM media_discovery_runs
    WHERE owner = ${owner} AND project_id = ${projectId} AND story_key = ${storyKey}
    ORDER BY started_at DESC
    LIMIT 1
  `);
  return rows.rows[0] ?? null;
}
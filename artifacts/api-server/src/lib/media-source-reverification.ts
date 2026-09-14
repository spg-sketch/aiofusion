import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  db,
  mediaContactsTable,
  mediaContactSourceChecksTable,
  type MediaContactRow,
} from "@workspace/db";
import { fetchMediaSourceEvidence } from "./safe-fetch";
import {
  evaluateMediaSource,
  SOURCE_RETRY_BASE_MS,
  SOURCE_RETRY_MAX_MS,
  SOURCE_REVIEW_INTERVAL_MS,
  sourceFetchError,
} from "./media-source-health";
import { logger } from "./logger";

export const MEDIA_REVERIFICATION_INTERVAL_MS = 60 * 60 * 1000;
export const MEDIA_REVERIFICATION_BATCH_SIZE = 20;
export const MEDIA_REVERIFICATION_WORKSPACE_LIMIT = 5;
export const MEDIA_REVERIFICATION_CONCURRENCY = 3;
export const MEDIA_REVERIFICATION_CLAIM_TTL_MS = 30 * 60 * 1000;
export const MEDIA_REVERIFICATION_RUN_LEASE_MS = 55 * 60 * 1000;

type ClaimedContact = Pick<MediaContactRow, "id" | "firstName" | "lastName" | "role" | "email" | "sourceUrl" | "accountId" | "sourceCheckFailureCount"> & {
  claimToken: string;
};

type WorkerOptions = {
  now?: Date;
  batchSize?: number;
  workspaceLimit?: number;
  concurrency?: number;
  fetchEvidence?: typeof fetchMediaSourceEvidence;
};

async function claimMediaReverificationRun(now: Date): Promise<boolean> {
  const previousRunBefore = new Date(now.getTime() - MEDIA_REVERIFICATION_RUN_LEASE_MS);
  const result = await db.execute(sql`
    INSERT INTO media_source_reverification_runs (singleton_id, started_at)
    VALUES (1, ${now}::timestamptz)
    ON CONFLICT (singleton_id) DO UPDATE
      SET started_at = EXCLUDED.started_at
      WHERE media_source_reverification_runs.started_at < ${previousRunBefore}::timestamptz
    RETURNING singleton_id
  `);
  return result.rows.length === 1;
}

export async function claimMediaContactsForReverification(options: WorkerOptions = {}): Promise<ClaimedContact[]> {
  const now = options.now ?? new Date();
  const batchSize = Math.max(1, Math.min(100, options.batchSize ?? MEDIA_REVERIFICATION_BATCH_SIZE));
  const workspaceLimit = Math.max(1, Math.min(25, options.workspaceLimit ?? MEDIA_REVERIFICATION_WORKSPACE_LIMIT));
  const claimExpiredBefore = new Date(now.getTime() - MEDIA_REVERIFICATION_CLAIM_TTL_MS);
  const freshBefore = new Date(now.getTime() - SOURCE_REVIEW_INTERVAL_MS);
  const token = randomUUID();

  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (contact_id, source_url) contact_id, source_url, outcome, checked_at
        FROM media_contact_source_checks
        ORDER BY contact_id, source_url, checked_at DESC, id DESC
      ),
      eligible AS (
        SELECT c.id,
          row_number() OVER (PARTITION BY COALESCE(c.account_id, '__global__') ORDER BY COALESCE(l.checked_at, to_timestamp(0)), c.id) AS workspace_rank
        FROM media_contacts c
        LEFT JOIN latest l ON l.contact_id = c.id AND l.source_url = c.source_url
        WHERE c.deleted_at IS NULL
          AND btrim(c.source_url) <> ''
          AND (c.source_check_claimed_at IS NULL OR c.source_check_claimed_at < ${claimExpiredBefore}::timestamptz)
          AND (
            l.checked_at IS NULL
            OR (l.outcome <> 'unavailable' AND l.checked_at <= ${freshBefore}::timestamptz)
            OR (l.outcome = 'unavailable' AND l.checked_at <= ${now}::timestamptz - (
              LEAST(${SOURCE_RETRY_MAX_MS}, ${SOURCE_RETRY_BASE_MS} * power(2, GREATEST(c.source_check_failure_count - 1, 0)))
              * interval '1 millisecond'
            ))
          )
      ),
      locked AS (
        SELECT c.id
        FROM media_contacts c
        JOIN eligible e ON e.id = c.id
        WHERE e.workspace_rank <= ${workspaceLimit}
        ORDER BY c.id
        FOR UPDATE OF c SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE media_contacts c
      SET source_check_claimed_at = ${now}::timestamptz, source_check_claim_token = ${token}
      FROM locked
      WHERE c.id = locked.id
      RETURNING
        c.id,
        c.first_name AS "firstName",
        c.last_name AS "lastName",
        c.role,
        c.email,
        c.source_url AS "sourceUrl",
        c.account_id AS "accountId",
        c.source_check_failure_count AS "sourceCheckFailureCount"
    `);
    return (result.rows as MediaContactRow[]).map((row) => ({ ...row, claimToken: token }));
  });
}

export async function reverifyClaimedMediaContact(
  contact: ClaimedContact,
  options: Pick<WorkerOptions, "now" | "fetchEvidence"> = {},
): Promise<"current" | "changed" | "unavailable" | "lost-claim"> {
  const checkedAt = options.now ?? new Date();
  const fetchEvidence = options.fetchEvidence ?? fetchMediaSourceEvidence;
  let values: typeof mediaContactSourceChecksTable.$inferInsert;
  let failureCount = 0;
  try {
    const evidence = await fetchEvidence(contact.sourceUrl);
    const evaluation = evaluateMediaSource(contact, evidence);
    values = {
      contactId: contact.id,
      accountId: contact.accountId ?? "__global__",
      sourceUrl: contact.sourceUrl,
      ...evaluation,
      checkedAt,
    };
  } catch (error) {
    const failure = sourceFetchError(error);
    failureCount = contact.sourceCheckFailureCount + 1;
    values = {
      contactId: contact.id,
      accountId: contact.accountId ?? "__global__",
      sourceUrl: contact.sourceUrl,
      outcome: "unavailable",
      ...failure,
      checkedAt,
    };
  }

  return db.transaction(async (tx) => {
    const claimed = await tx.execute(sql`
      UPDATE media_contacts
      SET source_check_claimed_at = NULL,
          source_check_claim_token = NULL,
          source_check_failure_count = ${failureCount},
          last_verified_at = CASE
            WHEN ${values.outcome} <> 'unavailable' THEN ${checkedAt}::timestamptz
            ELSE last_verified_at
          END
      WHERE id = ${contact.id}
        AND source_url = ${contact.sourceUrl}
        AND source_check_claim_token = ${contact.claimToken}
      RETURNING id
    `);
    if (claimed.rows.length === 0) {
      await tx.execute(sql`
        UPDATE media_contacts
        SET source_check_claimed_at = NULL, source_check_claim_token = NULL
        WHERE id = ${contact.id} AND source_check_claim_token = ${contact.claimToken}
      `);
      return "lost-claim";
    }
    await tx.insert(mediaContactSourceChecksTable).values(values);
    return values.outcome;
  });
}

export async function claimMediaContactForManualReverification(
  contact: Pick<MediaContactRow, "id" | "sourceUrl">,
  now = new Date(),
): Promise<ClaimedContact | null> {
  const claimExpiredBefore = new Date(now.getTime() - MEDIA_REVERIFICATION_CLAIM_TTL_MS);
  const token = randomUUID();
  const result = await db.execute(sql`
    UPDATE media_contacts
    SET source_check_claimed_at = ${now}::timestamptz,
        source_check_claim_token = ${token}
    WHERE id = ${contact.id}
      AND source_url = ${contact.sourceUrl}
      AND deleted_at IS NULL
      AND btrim(source_url) <> ''
      AND (source_check_claimed_at IS NULL OR source_check_claimed_at < ${claimExpiredBefore}::timestamptz)
    RETURNING
      id,
      first_name AS "firstName",
      last_name AS "lastName",
      role,
      email,
      source_url AS "sourceUrl",
      account_id AS "accountId",
      source_check_failure_count AS "sourceCheckFailureCount"
  `);
  const row = result.rows[0] as Omit<ClaimedContact, "claimToken"> | undefined;
  return row ? { ...row, claimToken: token } : null;
}

export async function runMediaSourceReverification(options: WorkerOptions = {}) {
  const now = options.now ?? new Date();
  if (!(await claimMediaReverificationRun(now))) {
    return { claimed: 0, completed: 0, unavailable: 0, skipped: true };
  }
  const claimed = await claimMediaContactsForReverification({ ...options, now });
  const concurrency = Math.max(1, Math.min(10, options.concurrency ?? MEDIA_REVERIFICATION_CONCURRENCY));
  const outcomes: string[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, claimed.length) }, async () => {
    while (cursor < claimed.length) {
      const contact = claimed[cursor++];
      try {
        outcomes.push(await reverifyClaimedMediaContact(contact, options));
      } catch (error) {
        logger.warn({ err: error, contactId: contact.id }, "Automatic media source recheck failed");
      }
    }
  }));
  const result = {
    claimed: claimed.length,
    completed: outcomes.filter((outcome) => outcome !== "lost-claim").length,
    unavailable: outcomes.filter((outcome) => outcome === "unavailable").length,
    skipped: false,
  };
  logger.info(result, "Automatic media source reverification sweep completed");
  return result;
}
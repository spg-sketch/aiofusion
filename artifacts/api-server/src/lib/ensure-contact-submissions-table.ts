import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureContactSubmissionsTable(): Promise<void> {
  try {
    // Create table with the full current schema if it doesn't exist yet
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id           serial       PRIMARY KEY,
        type         varchar(32)  NOT NULL,
        name         varchar(128) NOT NULL,
        email        varchar(256) NOT NULL,
        company      varchar(128) NOT NULL DEFAULT '',
        goal         text,
        subject      varchar(256),
        message      text,
        status       varchar(32)  NOT NULL DEFAULT 'pending',
        email_failed boolean      NOT NULL DEFAULT false,
        internal_email_accepted boolean,
        customer_email_accepted boolean,
        created_at   timestamptz  NOT NULL DEFAULT now(),
        updated_at   timestamptz  NOT NULL DEFAULT now()
      )
    `);

    // ── Idempotent migrations for tables created by older versions ────────────

    await db.execute(sql`
      ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS goal text
    `);

    await db.execute(sql`
      ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS subject varchar(256)
    `);

    await db.execute(sql`
      ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS message text
    `);

    await db.execute(sql`
      ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS status varchar(32) NOT NULL DEFAULT 'pending'
    `);

    await db.execute(sql`
      ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `);

    // Ensure email_failed is boolean. Older deployments had it as varchar(8)
    // holding 'true'/'false'. Migrate in-place using a PL/pgSQL block so the
    // logic is idempotent and safe on both fresh and upgraded databases.
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name  = 'contact_submissions'
             AND column_name = 'email_failed'
        ) THEN
          IF (
            SELECT data_type FROM information_schema.columns
             WHERE table_name  = 'contact_submissions'
               AND column_name = 'email_failed'
          ) <> 'boolean' THEN
            ALTER TABLE contact_submissions ALTER COLUMN email_failed DROP DEFAULT;
            ALTER TABLE contact_submissions ALTER COLUMN email_failed
              TYPE boolean USING (email_failed = 'true');
            ALTER TABLE contact_submissions ALTER COLUMN email_failed SET NOT NULL;
            ALTER TABLE contact_submissions ALTER COLUMN email_failed SET DEFAULT false;
          END IF;
        ELSE
          ALTER TABLE contact_submissions
            ADD COLUMN email_failed boolean NOT NULL DEFAULT false;
        END IF;
      END
      $$
    `);

    // Existing successful rows are known to be delivered; failed rows have no
    // per-message history and must not be automatically re-sent as a pair.
    await db.execute(sql`ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS internal_email_accepted boolean`);
    await db.execute(sql`ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS customer_email_accepted boolean`);
    await db.execute(sql`
      UPDATE contact_submissions
      SET internal_email_accepted = true, customer_email_accepted = true
      WHERE email_failed = false
        AND internal_email_accepted IS NULL AND customer_email_accepted IS NULL
    `);

    logger.info({}, "ensureContactSubmissionsTable: table and columns ready");
  } catch (err: unknown) {
    logger.error({ err }, "ensureContactSubmissionsTable: failed");
  }
}

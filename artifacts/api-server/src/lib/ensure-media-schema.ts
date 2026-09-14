import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

/**
 * Brings databases created before the enriched media-contact release forward
 * without relying on a destructive schema sync.  The contact updates are
 * deliberately split into add, backfill, and constrain phases so existing
 * rows remain valid while the new required fields are introduced.
 */
export async function ensureMediaSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE media_contacts
      ADD COLUMN IF NOT EXISTS mobile text,
      ADD COLUMN IF NOT EXISTS linkedin_url text,
      ADD COLUMN IF NOT EXISTS twitter_handle text,
      ADD COLUMN IF NOT EXISTS beats text[],
      ADD COLUMN IF NOT EXISTS sectors text[],
      ADD COLUMN IF NOT EXISTS geography text,
      ADD COLUMN IF NOT EXISTS language text,
      ADD COLUMN IF NOT EXISTS seniority text,
      ADD COLUMN IF NOT EXISTS editorial_status text,
      ADD COLUMN IF NOT EXISTS source_url text,
      ADD COLUMN IF NOT EXISTS source_ref text,
      ADD COLUMN IF NOT EXISTS publication_reach text,
      ADD COLUMN IF NOT EXISTS publication_authority text,
      ADD COLUMN IF NOT EXISTS journalist_authority text,
      ADD COLUMN IF NOT EXISTS confidence text,
      ADD COLUMN IF NOT EXISTS review_notes text,
      ADD COLUMN IF NOT EXISTS provenance jsonb,
      ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
      ADD COLUMN IF NOT EXISTS source_check_claimed_at timestamptz,
      ADD COLUMN IF NOT EXISTS source_check_claim_token varchar(80),
      ADD COLUMN IF NOT EXISTS source_check_failure_count integer,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz
  `);

  await db.execute(sql`
    UPDATE media_contacts
    SET
      mobile = COALESCE(mobile, ''),
      linkedin_url = COALESCE(linkedin_url, ''),
      twitter_handle = COALESCE(twitter_handle, ''),
      beats = COALESCE(beats, ARRAY[]::text[]),
      sectors = COALESCE(sectors, ARRAY[]::text[]),
      geography = COALESCE(geography, ''),
      language = COALESCE(language, ''),
      seniority = COALESCE(seniority, ''),
      editorial_status = COALESCE(editorial_status, ''),
      source_url = COALESCE(source_url, ''),
      source_ref = COALESCE(source_ref, ''),
      publication_reach = COALESCE(publication_reach, ''),
      publication_authority = COALESCE(publication_authority, ''),
      journalist_authority = COALESCE(journalist_authority, ''),
      confidence = COALESCE(confidence, ''),
      review_notes = COALESCE(review_notes, ''),
      provenance = COALESCE(provenance, '{}'::jsonb),
      source_check_failure_count = COALESCE(source_check_failure_count, 0),
      updated_at = COALESCE(updated_at, created_at, now())
    WHERE
      mobile IS NULL OR linkedin_url IS NULL OR twitter_handle IS NULL OR
      beats IS NULL OR sectors IS NULL OR geography IS NULL OR
      language IS NULL OR seniority IS NULL OR editorial_status IS NULL OR
      source_url IS NULL OR source_ref IS NULL OR publication_reach IS NULL OR
      publication_authority IS NULL OR journalist_authority IS NULL OR confidence IS NULL OR review_notes IS NULL OR provenance IS NULL OR
      source_check_failure_count IS NULL OR updated_at IS NULL
  `);

  await db.execute(sql`
    ALTER TABLE media_contacts
      ALTER COLUMN mobile SET DEFAULT '',
      ALTER COLUMN mobile SET NOT NULL,
      ALTER COLUMN linkedin_url SET DEFAULT '',
      ALTER COLUMN linkedin_url SET NOT NULL,
      ALTER COLUMN twitter_handle SET DEFAULT '',
      ALTER COLUMN twitter_handle SET NOT NULL,
      ALTER COLUMN beats SET DEFAULT ARRAY[]::text[],
      ALTER COLUMN beats SET NOT NULL,
      ALTER COLUMN sectors SET DEFAULT ARRAY[]::text[],
      ALTER COLUMN sectors SET NOT NULL,
      ALTER COLUMN geography SET DEFAULT '',
      ALTER COLUMN geography SET NOT NULL,
      ALTER COLUMN language SET DEFAULT '',
      ALTER COLUMN language SET NOT NULL,
      ALTER COLUMN seniority SET DEFAULT '',
      ALTER COLUMN seniority SET NOT NULL,
      ALTER COLUMN editorial_status SET DEFAULT '',
      ALTER COLUMN editorial_status SET NOT NULL,
      ALTER COLUMN source_url SET DEFAULT '',
      ALTER COLUMN source_url SET NOT NULL,
      ALTER COLUMN source_ref SET DEFAULT '',
      ALTER COLUMN source_ref SET NOT NULL,
      ALTER COLUMN publication_reach SET DEFAULT '',
      ALTER COLUMN publication_reach SET NOT NULL,
      ALTER COLUMN publication_authority SET DEFAULT '',
      ALTER COLUMN publication_authority SET NOT NULL,
      ALTER COLUMN journalist_authority SET DEFAULT '',
      ALTER COLUMN journalist_authority SET NOT NULL,
      ALTER COLUMN confidence SET DEFAULT '',
      ALTER COLUMN confidence SET NOT NULL,
      ALTER COLUMN review_notes SET DEFAULT '',
      ALTER COLUMN review_notes SET NOT NULL,
      ALTER COLUMN provenance SET DEFAULT '{}'::jsonb,
      ALTER COLUMN provenance SET NOT NULL,
      ALTER COLUMN source_check_failure_count SET DEFAULT 0,
      ALTER COLUMN source_check_failure_count SET NOT NULL,
      ALTER COLUMN updated_at SET DEFAULT now(),
      ALTER COLUMN updated_at SET NOT NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_contact_categories (
      id serial PRIMARY KEY,
      contact_id integer NOT NULL,
      category_id integer,
      category_name text NOT NULL DEFAULT '',
      account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_import_batches (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      idempotency_key varchar(160),
      source_filename text NOT NULL DEFAULT '',
      source_hash varchar(64) NOT NULL DEFAULT '',
      source_type varchar(20) NOT NULL DEFAULT 'csv',
      summary jsonb NOT NULL DEFAULT '{}'::jsonb,
      committed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_contact_field_overrides (
      id serial PRIMARY KEY,
      contact_id integer NOT NULL,
      account_id varchar NOT NULL,
      field_name varchar(80) NOT NULL,
      value text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_contact_source_checks (
      id serial PRIMARY KEY,
      contact_id integer NOT NULL,
      account_id varchar NOT NULL,
      source_url text NOT NULL,
      outcome varchar(20) NOT NULL,
      error_code varchar(40),
      error_message text NOT NULL DEFAULT '',
      observed_evidence jsonb NOT NULL DEFAULT '{"nameFound":false,"roleFound":false,"emailFound":false,"observedRole":"","observedEmails":[],"excerpt":""}'::jsonb,
      differences jsonb NOT NULL DEFAULT '[]'::jsonb,
      checked_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_source_reverification_runs (
      singleton_id integer PRIMARY KEY CHECK (singleton_id = 1),
      started_at timestamptz NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_recommendation_sets (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL,
      criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_recommendation_items (
      id serial PRIMARY KEY,
      recommendation_set_id integer NOT NULL,
      contact_id integer NOT NULL,
      score integer NOT NULL,
      reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
      rank integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_recommendation_decisions (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL,
      contact_id integer NOT NULL,
      decision varchar(20) NOT NULL,
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_recommendation_feedback (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      story_key varchar(200) NOT NULL,
      contact_id integer NOT NULL,
      signal varchar(12) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_contact_categories_unique
      ON media_contact_categories (contact_id, category_name)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_import_batches_idempotency
      ON media_import_batches (account_id, idempotency_key)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_contact_field_overrides_unique
      ON media_contact_field_overrides (contact_id, account_id, field_name)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_contact_source_checks_latest
      ON media_contact_source_checks (contact_id, checked_at)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_recommendation_items_unique
      ON media_recommendation_items (recommendation_set_id, contact_id)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_recommendation_decisions_unique
      ON media_recommendation_decisions (account_id, project_id, story_key, contact_id)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_recommendation_feedback_unique
      ON media_recommendation_feedback (account_id, project_id, story_key, contact_id)
  `);

  // NOT VALID preserves every legacy row if a partially-created table contains
  // an orphan, while enforcing the relationship for all writes after startup.
  // A later dedicated data repair can validate any such legacy constraints.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_contact_categories_contact_id_fkey') THEN
        ALTER TABLE media_contact_categories ADD CONSTRAINT media_contact_categories_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_contact_categories_category_id_fkey') THEN
        ALTER TABLE media_contact_categories ADD CONSTRAINT media_contact_categories_category_id_fkey
          FOREIGN KEY (category_id) REFERENCES media_categories(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_contact_field_overrides_contact_id_fkey') THEN
        ALTER TABLE media_contact_field_overrides ADD CONSTRAINT media_contact_field_overrides_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_contact_source_checks_contact_id_fkey') THEN
        ALTER TABLE media_contact_source_checks ADD CONSTRAINT media_contact_source_checks_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_recommendation_items_recommendation_set_id_fkey') THEN
        ALTER TABLE media_recommendation_items ADD CONSTRAINT media_recommendation_items_recommendation_set_id_fkey
          FOREIGN KEY (recommendation_set_id) REFERENCES media_recommendation_sets(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_recommendation_items_contact_id_fkey') THEN
        ALTER TABLE media_recommendation_items ADD CONSTRAINT media_recommendation_items_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_recommendation_decisions_contact_id_fkey') THEN
        ALTER TABLE media_recommendation_decisions ADD CONSTRAINT media_recommendation_decisions_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_recommendation_feedback_contact_id_fkey') THEN
        ALTER TABLE media_recommendation_feedback ADD CONSTRAINT media_recommendation_feedback_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) ON DELETE CASCADE NOT VALID;
      END IF;
    END
    $$
  `);

  logger.info("media contacts and recommendation schema ensured");
}

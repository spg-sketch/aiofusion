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
    CREATE TABLE IF NOT EXISTS journalist_privacy_requests (
      id serial PRIMARY KEY, request_type varchar(20) NOT NULL, name text NOT NULL,
      email text NOT NULL, outlet text NOT NULL DEFAULT '', details text NOT NULL,
      scope varchar(20) NOT NULL DEFAULT 'workspace', status varchar(24) NOT NULL DEFAULT 'received',
      assigned_to varchar, due_at timestamptz NOT NULL, verification_status varchar(20) NOT NULL DEFAULT 'unverified',
      verification_note text NOT NULL DEFAULT '', reviewer_approval_at timestamptz, reviewer_approval_by varchar,
      resolution varchar(32), resolution_note text NOT NULL DEFAULT '', notification_status varchar(20) NOT NULL DEFAULT 'pending',
      notification_attempts integer NOT NULL DEFAULT 0, last_notification_error text NOT NULL DEFAULT '',
      outcome_delivery_status varchar(20) NOT NULL DEFAULT 'pending', outcome_delivery_attempts integer NOT NULL DEFAULT 0,
      outcome_delivery_error text NOT NULL DEFAULT '',
      resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    ALTER TABLE journalist_privacy_requests ADD COLUMN IF NOT EXISTS outcome_delivery_status varchar(20) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS outcome_delivery_attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS outcome_delivery_error text NOT NULL DEFAULT ''
      ,ADD COLUMN IF NOT EXISTS outcome_delivery_claimed_at timestamptz
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS journalist_privacy_completion_ledger (
      id serial PRIMARY KEY, request_id integer NOT NULL REFERENCES journalist_privacy_requests(id) ON DELETE RESTRICT,
      store varchar(40) NOT NULL, store_key text NOT NULL, result varchar(24) NOT NULL,
      note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS journalist_privacy_completion_ledger_unique ON journalist_privacy_completion_ledger (request_id, store, store_key)`);
  await db.execute(sql`
    ALTER TABLE journalist_privacy_requests
      ADD COLUMN IF NOT EXISTS approved_scope varchar(20),
      ADD COLUMN IF NOT EXISTS approved_account_id varchar,
      ADD COLUMN IF NOT EXISTS matched_contact_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
      ADD COLUMN IF NOT EXISTS disclosure_result jsonb NOT NULL DEFAULT '{}'::jsonb
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS journalist_privacy_request_events (
      id serial PRIMARY KEY, request_id integer NOT NULL REFERENCES journalist_privacy_requests(id) ON DELETE RESTRICT,
      event_type varchar(32) NOT NULL, actor varchar NOT NULL, note text NOT NULL DEFAULT '',
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_suppressions (
      id serial PRIMARY KEY, request_id integer REFERENCES journalist_privacy_requests(id) ON DELETE RESTRICT,
      scope varchar(20) NOT NULL DEFAULT 'workspace', account_id varchar, email_hash varchar(64),
      name_hash varchar(64), linkedin_hash varchar(64), outlet_hash varchar(64), reason varchar(32) NOT NULL,
      active integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS journalist_privacy_legal_holds (
      id serial PRIMARY KEY, request_id integer NOT NULL REFERENCES journalist_privacy_requests(id) ON DELETE RESTRICT,
      scope varchar(20) NOT NULL, reason text NOT NULL, approved_by varchar NOT NULL,
      expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`DROP INDEX IF EXISTS media_suppressions_request_scope_identity`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS media_suppressions_request_scope_identity ON media_suppressions (request_id, scope, COALESCE(account_id, ''), COALESCE(email_hash, ''), COALESCE(name_hash, ''), COALESCE(linkedin_hash, ''), COALESCE(outlet_hash, ''))`);
  // Discovery candidates are additive and deliberately separate from trusted
  // contacts/outlets. Keep the snapshot immutable at the application layer;
  // status transitions are performed only by the approval routes.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_discoveries (
      id serial PRIMARY KEY,
      account_id varchar NOT NULL,
      project_id varchar NOT NULL,
      candidate_key text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      candidate jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      reviewed_by varchar,
      rejection_reason text,
      contact_id integer REFERENCES media_contacts(id) ON DELETE SET NULL,
      outlet_id integer REFERENCES media_outlets(id) ON DELETE SET NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_discoveries_account_project_candidate_unique
      ON media_discoveries (account_id, project_id, candidate_key)
  `);

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
    CREATE TABLE IF NOT EXISTS media_contact_status_events (
      id serial PRIMARY KEY,
      contact_id integer NOT NULL,
      account_id varchar NOT NULL,
      status varchar(20) NOT NULL,
      note text NOT NULL DEFAULT '',
      created_by varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_contact_correction_reports (
      id serial PRIMARY KEY,
      contact_id integer NOT NULL,
      account_id varchar NOT NULL,
      fields text[] NOT NULL DEFAULT ARRAY[]::text[],
      details text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      reported_by varchar NOT NULL,
      resolution_note text NOT NULL DEFAULT '',
      reviewed_by varchar,
      source_check_id integer,
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
      phrase_attributions jsonb NOT NULL DEFAULT '[]'::jsonb,
      rank integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Existing recommendation tables pre-date exact phrase attribution. Keep
  // this separate from CREATE TABLE so the compatibility path upgrades them
  // without replacing or rewriting stored recommendation items.
  await db.execute(sql`
    ALTER TABLE media_recommendation_items
      ADD COLUMN IF NOT EXISTS phrase_attributions jsonb NOT NULL DEFAULT '[]'::jsonb
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
    CREATE TABLE IF NOT EXISTS media_outreach (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL, story_key varchar(200) NOT NULL,
      contact_id integer, outlet_id integer, status varchar(20) NOT NULL DEFAULT 'planned',
      article_snapshot jsonb NOT NULL DEFAULT '{"title":""}'::jsonb,
      contact_snapshot jsonb NOT NULL DEFAULT '{"name":"","role":"","email":""}'::jsonb,
      outlet_snapshot jsonb NOT NULL DEFAULT '{"name":"","website":""}'::jsonb,
      target_phrases jsonb NOT NULL DEFAULT '[]'::jsonb, pitch_date timestamptz, response_date timestamptz,
      notes text NOT NULL DEFAULT '', responsible_team_member text NOT NULL DEFAULT '', created_by varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_outreach_activities (
      id serial PRIMARY KEY, outreach_id integer NOT NULL, account_id varchar NOT NULL, project_id varchar NOT NULL,
      from_status varchar(20), to_status varchar(20) NOT NULL, note text NOT NULL DEFAULT '', actor varchar NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS media_placements (
      id serial PRIMARY KEY, outreach_id integer NOT NULL, account_id varchar NOT NULL, project_id varchar NOT NULL,
      canonical_url text NOT NULL, canonical_url_key text NOT NULL, publication_date timestamptz NOT NULL,
      headline text NOT NULL, supporting_evidence text NOT NULL, verification varchar(20) NOT NULL DEFAULT 'user_claimed',
      verified_facts jsonb NOT NULL DEFAULT '{}'::jsonb, verification_history jsonb NOT NULL DEFAULT '[]'::jsonb,
      legacy_source_ref text, created_by varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE media_placements ADD COLUMN IF NOT EXISTS verification_history jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await db.execute(sql`
    ALTER TABLE media_outreach
      ADD COLUMN IF NOT EXISTS account_id varchar,
      ADD COLUMN IF NOT EXISTS project_id varchar,
      ADD COLUMN IF NOT EXISTS story_key varchar(200),
      ADD COLUMN IF NOT EXISTS contact_id integer,
      ADD COLUMN IF NOT EXISTS outlet_id integer,
      ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'planned',
      ADD COLUMN IF NOT EXISTS article_snapshot jsonb NOT NULL DEFAULT '{"title":""}'::jsonb,
      ADD COLUMN IF NOT EXISTS contact_snapshot jsonb NOT NULL DEFAULT '{"name":"","role":"","email":""}'::jsonb,
      ADD COLUMN IF NOT EXISTS outlet_snapshot jsonb NOT NULL DEFAULT '{"name":"","website":""}'::jsonb,
      ADD COLUMN IF NOT EXISTS target_phrases jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS pitch_date timestamptz,
      ADD COLUMN IF NOT EXISTS response_date timestamptz,
      ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS responsible_team_member varchar(200) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_by varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);
  await db.execute(sql`
    ALTER TABLE media_outreach_activities
      ADD COLUMN IF NOT EXISTS outreach_id integer,
      ADD COLUMN IF NOT EXISTS account_id varchar,
      ADD COLUMN IF NOT EXISTS project_id varchar,
      ADD COLUMN IF NOT EXISTS from_status varchar(20),
      ADD COLUMN IF NOT EXISTS to_status varchar(20) NOT NULL DEFAULT 'planned',
      ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS actor varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now()
  `);
  await db.execute(sql`DELETE FROM media_outreach_activities WHERE outreach_id IS NULL OR account_id IS NULL OR project_id IS NULL`);
  await db.execute(sql`DELETE FROM media_placements WHERE outreach_id IS NULL OR account_id IS NULL OR project_id IS NULL OR canonical_url IS NULL OR canonical_url_key IS NULL OR publication_date IS NULL`);
  await db.execute(sql`DELETE FROM media_outreach WHERE account_id IS NULL OR project_id IS NULL OR story_key IS NULL`);
  await db.execute(sql`ALTER TABLE media_outreach ALTER COLUMN account_id SET NOT NULL, ALTER COLUMN project_id SET NOT NULL, ALTER COLUMN story_key SET NOT NULL`);
  await db.execute(sql`ALTER TABLE media_outreach_activities ALTER COLUMN outreach_id SET NOT NULL, ALTER COLUMN account_id SET NOT NULL, ALTER COLUMN project_id SET NOT NULL`);
  await db.execute(sql`ALTER TABLE media_placements ALTER COLUMN outreach_id SET NOT NULL, ALTER COLUMN account_id SET NOT NULL, ALTER COLUMN project_id SET NOT NULL, ALTER COLUMN canonical_url SET NOT NULL, ALTER COLUMN canonical_url_key SET NOT NULL, ALTER COLUMN publication_date SET NOT NULL`);
  await db.execute(sql`
    ALTER TABLE media_placements
      ADD COLUMN IF NOT EXISTS outreach_id integer,
      ADD COLUMN IF NOT EXISTS account_id varchar,
      ADD COLUMN IF NOT EXISTS project_id varchar,
      ADD COLUMN IF NOT EXISTS canonical_url text,
      ADD COLUMN IF NOT EXISTS canonical_url_key text,
      ADD COLUMN IF NOT EXISTS publication_date timestamptz,
      ADD COLUMN IF NOT EXISTS headline text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS supporting_evidence text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS verification varchar(20) NOT NULL DEFAULT 'user_claimed',
      ADD COLUMN IF NOT EXISTS verified_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS legacy_source_ref text,
      ADD COLUMN IF NOT EXISTS created_by varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);

  await db.execute(sql`
    ALTER TABLE media_contact_correction_reports
      ADD COLUMN IF NOT EXISTS resolution_note text NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS reviewed_by varchar,
      ADD COLUMN IF NOT EXISTS source_check_id integer
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
    CREATE INDEX IF NOT EXISTS media_contact_status_events_workspace_contact
      ON media_contact_status_events (account_id, contact_id, created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS media_contact_corrections_workspace_status
      ON media_contact_correction_reports (account_id, status, contact_id)
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
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS media_outreach_story_contact_unique ON media_outreach (account_id, project_id, story_key, contact_id)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS media_placements_project_url_unique ON media_placements (account_id, project_id, canonical_url_key)`);

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
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_contact_status_events_contact_id_fkey') THEN
        ALTER TABLE media_contact_status_events ADD CONSTRAINT media_contact_status_events_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_contact_correction_reports_contact_id_fkey') THEN
        ALTER TABLE media_contact_correction_reports ADD CONSTRAINT media_contact_correction_reports_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_contact_correction_reports_source_check_id_fkey') THEN
        ALTER TABLE media_contact_correction_reports ADD CONSTRAINT media_contact_correction_reports_source_check_id_fkey
          FOREIGN KEY (source_check_id) REFERENCES media_contact_source_checks(id) ON DELETE SET NULL NOT VALID;
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
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_outreach_contact_id_fkey') THEN
        ALTER TABLE media_outreach ADD CONSTRAINT media_outreach_contact_id_fkey
          FOREIGN KEY (contact_id) REFERENCES media_contacts(id) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_outreach_outlet_id_fkey') THEN
        ALTER TABLE media_outreach ADD CONSTRAINT media_outreach_outlet_id_fkey
          FOREIGN KEY (outlet_id) REFERENCES media_outlets(id) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_outreach_activities_outreach_id_fkey') THEN
        ALTER TABLE media_outreach_activities ADD CONSTRAINT media_outreach_activities_outreach_id_fkey
          FOREIGN KEY (outreach_id) REFERENCES media_outreach(id) ON DELETE CASCADE NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_placements_outreach_id_fkey') THEN
        ALTER TABLE media_placements ADD CONSTRAINT media_placements_outreach_id_fkey
          FOREIGN KEY (outreach_id) REFERENCES media_outreach(id) ON DELETE CASCADE NOT VALID;
      END IF;
    END
    $$
  `);

  logger.info("media contacts and recommendation schema ensured");
}

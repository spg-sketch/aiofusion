import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function ensureInsightsSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS insight_media (
      id varchar PRIMARY KEY,
      file_name varchar NOT NULL,
      content_type varchar NOT NULL,
      size_bytes text NOT NULL,
      object_path text,
      public_url text NOT NULL,
      alt_text text NOT NULL DEFAULT '',
      created_by_user_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS insight_articles (
      id varchar PRIMARY KEY,
      slug varchar NOT NULL,
      title text NOT NULL,
      excerpt text NOT NULL DEFAULT '',
      tag varchar NOT NULL DEFAULT 'Article',
      external_url text,
      date_published varchar,
      date_modified varchar,
      body jsonb NOT NULL DEFAULT '[]'::jsonb,
      cover_media_id varchar,
      cover_image_url text,
      cover_image_alt text NOT NULL DEFAULT '',
      seo_title text,
      seo_description text,
      focus_keyphrase varchar,
      canonical_url text,
      status varchar NOT NULL DEFAULT 'published',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS insight_articles_slug_unique
    ON insight_articles (slug)
  `);
}
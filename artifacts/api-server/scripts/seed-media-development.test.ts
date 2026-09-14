import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE media_outlets (
      id serial PRIMARY KEY, name text NOT NULL, category text NOT NULL DEFAULT '',
      website text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
      country text NOT NULL DEFAULT '', reach_band text NOT NULL DEFAULT '',
      account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY, outlet_id integer REFERENCES media_outlets(id),
      first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
      role text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '', mobile text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '',
      twitter_handle text NOT NULL DEFAULT '', beats text[] NOT NULL DEFAULT '{}',
      sectors text[] NOT NULL DEFAULT '{}', geography text NOT NULL DEFAULT '',
      language text NOT NULL DEFAULT '', seniority text NOT NULL DEFAULT '',
      editorial_status text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '',
      source_ref text NOT NULL DEFAULT '', publication_reach text NOT NULL DEFAULT '',
      publication_authority text NOT NULL DEFAULT '', journalist_authority text NOT NULL DEFAULT '',
      confidence text NOT NULL DEFAULT '', review_notes text NOT NULL DEFAULT '',
      provenance jsonb NOT NULL DEFAULT '{}', last_verified_at timestamptz,
      source_check_claimed_at timestamptz, source_check_claim_token varchar(80),
      source_check_failure_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(), account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
  `);
  return { ...schema, db: drizzle(client, { schema }) };
});

import { db, mediaContactsTable, mediaOutletsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";
import { DEVELOPMENT_MEDIA_SAMPLES, MEDIA_DEV_SAMPLE_PREFIX, MEDIA_DEV_SOURCE_PREFIX } from "../src/lib/media-development-samples";
import { removeSamples, seedSamples } from "./seed-media-development";

beforeEach(async () => {
  await db.delete(mediaContactsTable);
  await db.delete(mediaOutletsTable);
});

describe("media development database seed", () => {
  it("creates, refreshes and removes one stable row per sample", async () => {
    await seedSamples();
    expect(await db.select().from(mediaContactsTable)).toHaveLength(DEVELOPMENT_MEDIA_SAMPLES.length);
    expect(await db.select().from(mediaOutletsTable)).toHaveLength(DEVELOPMENT_MEDIA_SAMPLES.length);

    await seedSamples();
    expect(await db.select().from(mediaContactsTable)).toHaveLength(DEVELOPMENT_MEDIA_SAMPLES.length);
    expect(await db.select().from(mediaOutletsTable)).toHaveLength(DEVELOPMENT_MEDIA_SAMPLES.length);

    const fixture = DEVELOPMENT_MEDIA_SAMPLES[0];
    await db.update(mediaContactsTable).set({ role: "stale value" })
      .where(eq(mediaContactsTable.sourceRef, fixture.contact.sourceRef));
    await seedSamples();
    const [refreshed] = await db.select().from(mediaContactsTable)
      .where(eq(mediaContactsTable.sourceRef, fixture.contact.sourceRef));
    expect(refreshed.role).toBe(fixture.contact.role);

    expect(await removeSamples()).toEqual({
      contacts: DEVELOPMENT_MEDIA_SAMPLES.length,
      outlets: DEVELOPMENT_MEDIA_SAMPLES.length,
    });
    expect(await db.select().from(mediaContactsTable)
      .where(like(mediaContactsTable.sourceRef, `${MEDIA_DEV_SOURCE_PREFIX}%`))).toHaveLength(0);
    expect(await db.select().from(mediaOutletsTable)
      .where(like(mediaOutletsTable.name, `${MEDIA_DEV_SAMPLE_PREFIX}%`))).toHaveLength(0);
  });

  it("preserves a sample outlet while another contact still references it", async () => {
    await seedSamples();
    const [outlet] = await db.select().from(mediaOutletsTable).limit(1);
    await db.insert(mediaContactsTable).values({
      outletId: outlet.id,
      firstName: "Separate",
      lastName: "Contact",
      sourceRef: "separate-contact",
    });

    const removed = await removeSamples();
    expect(removed.contacts).toBe(DEVELOPMENT_MEDIA_SAMPLES.length);
    expect(removed.outlets).toBe(DEVELOPMENT_MEDIA_SAMPLES.length - 1);
    expect(await db.select().from(mediaOutletsTable).where(eq(mediaOutletsTable.id, outlet.id))).toHaveLength(1);
  });
});
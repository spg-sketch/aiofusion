import { describe, expect, it, vi } from "vitest";

const { db, client } = await vi.hoisted(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE media_outlets (
      id serial PRIMARY KEY, name text NOT NULL, category text NOT NULL DEFAULT '',
      website text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
      country text NOT NULL DEFAULT '', reach_band text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '',
      account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY, outlet_id integer, first_name text NOT NULL DEFAULT '',
      last_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '',
      phone text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', mobile text NOT NULL DEFAULT '',
      linkedin_url text NOT NULL DEFAULT '', twitter_handle text NOT NULL DEFAULT '',
      beats text[] NOT NULL DEFAULT '{}', sectors text[] NOT NULL DEFAULT '{}',
      geography text NOT NULL DEFAULT '', language text NOT NULL DEFAULT '', seniority text NOT NULL DEFAULT '',
      editorial_status text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '',
      source_ref text NOT NULL DEFAULT '', publication_reach text NOT NULL DEFAULT '',
      publication_authority text NOT NULL DEFAULT '', journalist_authority text NOT NULL DEFAULT '',
      confidence text NOT NULL DEFAULT '', review_notes text NOT NULL DEFAULT '',
      provenance jsonb NOT NULL DEFAULT '{}', last_verified_at timestamptz,
      source_check_claimed_at timestamptz, source_check_claim_token varchar,
      source_check_failure_count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_suppressions (
      id serial PRIMARY KEY, request_id integer, scope varchar NOT NULL DEFAULT 'workspace',
      account_id varchar, email_hash varchar, name_hash varchar, linkedin_hash varchar,
      outlet_hash varchar, reason varchar NOT NULL, active integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
    );
  `);
  return { db, client };
});

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { ...schema, db };
});

import { mediaContactsTable, mediaOutletsTable, mediaSuppressionsTable } from "@workspace/db";
import { suppressionKeys } from "../lib/journalist-privacy";
import { fetchMediaDbContext } from "./content-ai";

describe("content media-list privacy context", () => {
  it("omits workspace-suppressed global contacts only for the requesting workspace", async () => {
    const [outlet] = await db.insert(mediaOutletsTable).values({
      name: "Privacy Trade Journal", category: "technology",
    }).returning();
    const [visibleOutlet] = await db.insert(mediaOutletsTable).values({
      name: "Visible Trade Journal", category: "technology",
    }).returning();
    const [hidden] = await db.insert(mediaContactsTable).values({
      outletId: outlet.id, firstName: "Hidden", lastName: "Journalist",
      role: "Editor", email: "hidden@example.test",
    }).returning();
    await db.insert(mediaContactsTable).values({
      outletId: visibleOutlet.id, firstName: "Visible", lastName: "Journalist",
      role: "Editor", email: "visible@example.test",
    });
    await db.insert(mediaContactsTable).values({
      outletId: visibleOutlet.id, firstName: "Private", lastName: "Journalist",
      role: "Editor", email: "private@example.test", accountId: "workspace-a",
    });
    const keys = suppressionKeys({
      name: `${hidden.firstName} ${hidden.lastName}`, email: hidden.email,
      outlet: outlet.name,
    });
    await db.insert(mediaSuppressionsTable).values({
      scope: "workspace", accountId: "workspace-a", reason: "objection", ...keys,
    });

    const forA = await fetchMediaDbContext(["technology"], "workspace-a");
    expect(forA).not.toContain("Hidden Journalist");
    expect(forA).not.toContain("hidden@example.test");
    expect(forA).toContain("Visible Journalist");
    expect(forA).toContain("visible@example.test");
    expect(forA).not.toContain("Private Journalist");
    expect(forA).not.toContain("private@example.test");

    const forB = await fetchMediaDbContext(["technology"], "workspace-b");
    expect(forB).toContain("Hidden Journalist");
    expect(forB).toContain("hidden@example.test");
    expect(forB).toContain("Visible Journalist");
    expect(forB).not.toContain("Private Journalist");
    expect(forB).not.toContain("private@example.test");
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { eq, getTableColumns, sql } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const { collectJournalistCoverage } = vi.hoisted(() => ({ collectJournalistCoverage: vi.fn() }));

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE projects (id varchar PRIMARY KEY, name varchar NOT NULL DEFAULT '', data jsonb NOT NULL DEFAULT '{}', intake jsonb, logo text, owner varchar, tier varchar(16), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE platform_accounts (
      username varchar PRIMARY KEY, password_hash text NOT NULL DEFAULT '', role varchar NOT NULL DEFAULT 'agency',
      parent varchar, max_seats integer, created_at timestamptz NOT NULL DEFAULT now(), email varchar, website varchar,
      status varchar NOT NULL DEFAULT 'active'
    );
    CREATE TABLE platform_companies (
      id varchar PRIMARY KEY, slug varchar UNIQUE NOT NULL, role varchar NOT NULL DEFAULT 'agency',
      parent_slug varchar, free_access boolean NOT NULL DEFAULT true, status varchar NOT NULL DEFAULT 'active',
      plan varchar(16), billing_frequency varchar(16), subscription_status varchar(16),
      stripe_customer_id text, stripe_subscription_id text, current_period_end timestamptz,
      beta_trial_started_at timestamptz, beta_trial_ends_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL);
    CREATE TABLE token_usage (
      id serial PRIMARY KEY, account_id varchar(200) NOT NULL, operation varchar(80) NOT NULL,
      model varchar(80) NOT NULL, input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0, cost_gbp_estimate numeric(10,6),
      project_id varchar(200), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE archive_items (
      id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL, title varchar NOT NULL DEFAULT '',
      content_type varchar NOT NULL DEFAULT '', spokesperson varchar, status varchar NOT NULL DEFAULT 'Draft',
       tags jsonb, headline text, standfirst text, body_copy text, action_notes text, pitch text,
       spokesperson_linkedin text, body text,
      selected_messages jsonb, media_cats jsonb, target_phrases jsonb, target_phrase_ids jsonb, optimisation_assessment jsonb,
      pub_date varchar, released_at varchar, release_channel varchar, source varchar,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_outlets (
      id serial PRIMARY KEY, name text NOT NULL, category text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '',
      description text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '', reach_band text NOT NULL DEFAULT '',
      account_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_contacts (
      id serial PRIMARY KEY, outlet_id integer REFERENCES media_outlets(id), first_name text NOT NULL DEFAULT '',
      last_name text NOT NULL DEFAULT '', role text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '', mobile text NOT NULL DEFAULT '', linkedin_url text NOT NULL DEFAULT '', twitter_handle text NOT NULL DEFAULT '',
      beats text[] NOT NULL DEFAULT '{}', sectors text[] NOT NULL DEFAULT '{}', geography text NOT NULL DEFAULT '', language text NOT NULL DEFAULT '',
      seniority text NOT NULL DEFAULT '', editorial_status text NOT NULL DEFAULT '', source_url text NOT NULL DEFAULT '', source_ref text NOT NULL DEFAULT '',
      publication_reach text NOT NULL DEFAULT '', publication_authority text NOT NULL DEFAULT '', journalist_authority text NOT NULL DEFAULT '',
      confidence text NOT NULL DEFAULT '', review_notes text NOT NULL DEFAULT '', provenance jsonb NOT NULL DEFAULT '{}',
      last_verified_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), account_id varchar,
      created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE media_categories (id serial PRIMARY KEY, name text NOT NULL, account_id varchar, created_at timestamptz NOT NULL DEFAULT now());
  `);
  return { ...(await vi.importActual<object>("@workspace/db/schema")), db, pool: { end: () => client.close() } };
});

vi.mock("../middleware/platform-auth", () => ({ requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../lib/member-guards", () => ({ memberProjectGate: (_req: unknown, _res: unknown, next: () => void) => next(), inAssignedScope: () => true }));
vi.mock("../lib/platform-auth", () => ({
  getVisibleUsernames: async (account: { username: string }) => [account.username.toLowerCase()],
  getAccount: async (username: string) => ({ username: username.toLowerCase(), parent: null, role: "agency", status: "active" }),
  normUsername: (value: string) => value.toLowerCase(),
}));
vi.mock("../lib/safe-fetch", () => ({
  fetchPlacementPageEvidence: async (url: string) => ({ canonicalUrl: url, headline: "Verified headline", publicationDate: "2026-09-03" }),
}));
vi.mock("../lib/journalist-coverage-evidence", () => ({ collectJournalistCoverage }));

import {
  db,
  mediaContactsTable,
  mediaOutletsTable,
  mediaRecommendationDecisionsTable,
  mediaRecommendationFeedbackTable,
  mediaRecommendationItemsTable,
  mediaRecommendationSetsTable,
  mediaOutreachTable,
  mediaOutreachActivitiesTable,
  mediaPlacementsTable,
  projectsTable,
  archiveItemsTable,
  platformMetaTable,
  tokenUsageTable,
} from "@workspace/db";
import { ensureMediaSchema } from "../lib/ensure-media-schema";
import { stableExactTargetPhraseId } from "../lib/exact-target-phrases";
import mediaDbRouter from "./media-db";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  await ensureMediaSchema();
  await ensureMediaSchema();
  await db.execute(sql`INSERT INTO platform_accounts (username, role) VALUES ('workspace-a', 'agency')`);
  await db.execute(sql`INSERT INTO platform_companies (id, slug, free_access, subscription_status, plan) VALUES ('workspace-a-company', 'workspace-a', true, 'active', 'agency')`);
  await db.insert(projectsTable).values({ id: "project-1", owner: "workspace-a" });
  await db.insert(archiveItemsTable).values([
    { id: "story-1", projectId: "project-1", owner: "workspace-a", title: "Story 1" },
    { id: "story-2", projectId: "project-1", owner: "workspace-a", title: "Story 2" },
    { id: "phrase-story", projectId: "project-1", owner: "workspace-a", title: "Phrase story" },
    { id: "long-phrase-story", projectId: "project-1", owner: "workspace-a", title: "Long phrase story" },
    { id: "race-story", projectId: "project-1", owner: "workspace-a", title: "Race story" },
  ]);
  const [outlet] = await db.insert(mediaOutletsTable).values({ name: "Energy Daily", category: "Trade press", country: "UK" }).returning();
  await db.insert(mediaContactsTable).values([
    { outletId: outlet.id, firstName: "Jane", lastName: "One", role: "Energy correspondent", beats: ["energy"], sectors: ["technology"], geography: "UK" },
    { outletId: outlet.id, firstName: "John", lastName: "Two", role: "Energy editor", beats: ["energy"], sectors: ["technology"], geography: "UK", email: "john@example.test" },
  ]);
  const app = express();
  app.use(express.json());
  app.get("/verification-page", (_req, res) => res.type("html").send('<!doctype html><html><head><link rel="canonical" href="/verification-page"><meta property="og:title" content="Verified headline"><meta property="article:published_time" content="2026-09-03"></head><body><h1>Verified headline</h1></body></html>'));
  app.use((req, _res, next) => {
    req.account = { username: String(req.headers["x-workspace"] || "workspace-a"), role: "user" } as NonNullable<typeof req.account>;
    req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof req.log;
    next();
  });
  app.use("/api", mediaDbRouter);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((resolve) => server ? server.close(() => resolve()) : resolve()));

const request = (path: string, workspace = "workspace-a", init?: RequestInit) => fetch(`${baseUrl}${path}`, {
  ...init,
  headers: { "Content-Type": "application/json", "x-workspace": workspace, ...(init?.headers || {}) },
});

type SchemaColumn = ReturnType<typeof getTableColumns>[string];

function expectedDefault(column: SchemaColumn): string | null {
  if (!column.hasDefault || column.default === undefined) return null;
  if (typeof column.default === "string") return column.default === "" ? "empty-string" : column.default;
  if (typeof column.default === "number") return String(column.default);
  if (Array.isArray(column.default)) return column.default.length === 0 ? "empty-array" : JSON.stringify(column.default);
  if ("queryChunks" in column.default) return "now()";
  return Object.keys(column.default).length === 0 ? "empty-object" : JSON.stringify(column.default);
}

function actualDefault(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, "").toLowerCase();
  if (normalized === "now()") return "now()";
  if (/^''(?:::text)?$/.test(normalized)) return "empty-string";
  if (normalized === "array[]::text[]") return "empty-array";
  if (/^'\{\}'(?:::text\[\])?$/.test(normalized)) return "empty-array";
  if (normalized === "'[]'::jsonb") return "empty-array";
  if (/^'\{\}'::jsonb$/.test(normalized)) return "empty-object";
  const jsonDefault = normalized.match(/^'(.*)'::jsonb$/);
  if (jsonDefault) {
    try { return JSON.stringify(JSON.parse(jsonDefault[1])); } catch { /* compare the normalized database expression below */ }
  }
  const textDefault = normalized.match(/^'(.*)'::(?:charactervarying|text)$/);
  if (textDefault) return textDefault[1];
  if (/^0(?:::integer)?$/.test(normalized)) return "0";
  return normalized;
}

async function expectDatabaseColumnsToMatchSchema(
  tableName: string,
  table: Parameters<typeof getTableColumns>[0],
  routeRequiredColumns: string[],
): Promise<void> {
  const result = await db.execute(sql`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `);
  const actualByName = new Map(result.rows.map((row) => [String(row.column_name), row]));
  const schemaByName = new Map(
    Object.values(getTableColumns(table)).map((column) => [column.name, column]),
  );
  const mismatches: string[] = [];

  for (const columnName of routeRequiredColumns) {
    const schemaColumn = schemaByName.get(columnName);
    const databaseColumn = actualByName.get(columnName);
    if (!schemaColumn) {
      mismatches.push(`${tableName}.${columnName}: missing from shared Drizzle schema`);
      continue;
    }
    if (!databaseColumn) {
      mismatches.push(`${tableName}.${columnName}: ensureMediaSchema did not create the column`);
      continue;
    }
    const databaseNotNull = databaseColumn.is_nullable === "NO";
    if (databaseNotNull !== schemaColumn.notNull) {
      mismatches.push(`${tableName}.${columnName}: nullability is ${databaseNotNull ? "NOT NULL" : "nullable"} in the database but ${schemaColumn.notNull ? "NOT NULL" : "nullable"} in Drizzle`);
    }
    const databaseDefault = actualDefault(databaseColumn.column_default);
    const schemaDefault = expectedDefault(schemaColumn);
    if (databaseDefault !== schemaDefault) {
      mismatches.push(`${tableName}.${columnName}: default is ${databaseDefault ?? "none"} in the database but ${schemaDefault ?? "none"} in Drizzle`);
    }
  }

  expect(mismatches, `Media Research schema drift:\n${mismatches.join("\n")}`).toEqual([]);
}

describe("media recommendation refinement API", () => {
  it("migrates the complete recommendation storage contract from a legacy media schema", async () => {
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'media_recommendation_sets',
          'media_recommendation_items',
          'media_recommendation_decisions',
          'media_recommendation_feedback',
          'media_outreach',
          'media_outreach_activities',
          'media_placements'
        )
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "media_outreach",
      "media_outreach_activities",
      "media_placements",
      "media_recommendation_decisions",
      "media_recommendation_feedback",
      "media_recommendation_items",
      "media_recommendation_sets",
    ]);

    const indexes = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'media_recommendation_items_unique',
          'media_recommendation_decisions_unique',
          'media_recommendation_feedback_unique'
        )
      ORDER BY indexname
    `);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "media_recommendation_decisions_unique",
      "media_recommendation_feedback_unique",
      "media_recommendation_items_unique",
    ]);

    const constraints = await db.execute(sql`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'media_recommendation_items_recommendation_set_id_fkey',
        'media_recommendation_items_contact_id_fkey',
        'media_recommendation_decisions_contact_id_fkey',
        'media_recommendation_feedback_contact_id_fkey'
      )
      ORDER BY conname
    `);
    expect(constraints.rows.map((row) => row.conname)).toEqual([
      "media_recommendation_decisions_contact_id_fkey",
      "media_recommendation_feedback_contact_id_fkey",
      "media_recommendation_items_contact_id_fkey",
      "media_recommendation_items_recommendation_set_id_fkey",
    ]);

    await expectDatabaseColumnsToMatchSchema("media_contacts", mediaContactsTable, [
      "mobile", "linkedin_url", "twitter_handle", "beats", "sectors", "geography",
      "language", "seniority", "editorial_status", "source_url", "source_ref",
      "publication_reach", "publication_authority", "journalist_authority",
      "confidence", "review_notes", "provenance", "last_verified_at",
      "source_check_claimed_at", "source_check_claim_token",
      "source_check_failure_count", "updated_at",
    ]);
    await expectDatabaseColumnsToMatchSchema("media_recommendation_sets", mediaRecommendationSetsTable, [
      "account_id", "project_id", "story_key", "criteria", "created_at",
    ]);
    await expectDatabaseColumnsToMatchSchema("media_recommendation_items", mediaRecommendationItemsTable, [
      "recommendation_set_id", "contact_id", "score", "reasons", "phrase_attributions", "rank", "created_at",
    ]);
    await expectDatabaseColumnsToMatchSchema("media_recommendation_decisions", mediaRecommendationDecisionsTable, [
      "account_id", "project_id", "story_key", "contact_id", "decision", "note", "created_at", "updated_at",
    ]);
    await expectDatabaseColumnsToMatchSchema("media_recommendation_feedback", mediaRecommendationFeedbackTable, [
      "account_id", "project_id", "story_key", "contact_id", "signal", "created_at", "updated_at",
    ]);
    await expectDatabaseColumnsToMatchSchema("media_outreach", mediaOutreachTable, [
      "account_id", "project_id", "story_key", "contact_id", "outlet_id", "status", "article_snapshot",
      "contact_snapshot", "outlet_snapshot", "target_phrases", "pitch_date", "response_date", "notes",
      "responsible_team_member", "created_by", "created_at", "updated_at",
    ]);
    await expectDatabaseColumnsToMatchSchema("media_outreach_activities", mediaOutreachActivitiesTable, [
      "outreach_id", "account_id", "project_id", "from_status", "to_status", "note", "actor", "occurred_at",
    ]);
    await expectDatabaseColumnsToMatchSchema("media_placements", mediaPlacementsTable, [
      "outreach_id", "account_id", "project_id", "canonical_url", "canonical_url_key", "publication_date",
      "headline", "supporting_evidence", "verification", "verified_facts", "legacy_source_ref",
      "verification_history", "created_by", "created_at", "updated_at",
    ]);

    await db.execute(sql`ALTER TABLE media_recommendation_items DROP COLUMN phrase_attributions`);
    await ensureMediaSchema();
    const compatibilityColumn = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media_recommendation_items'
        AND column_name = 'phrase_attributions'
    `);
    expect(compatibilityColumn.rows).toHaveLength(1);
  });

  it("persists feedback only for its workspace, project and article, while preserving decisions", async () => {
    const generated = await request("/store/media-db/recommendations", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", terms: ["energy", "technology"] }),
    });
    const generatedBody = await generated.json() as { items: Array<{ contact: { id: number } }> };
    const contactId = generatedBody.items[0].contact.id;
    await request("/store/media-db/recommendations/decisions", "workspace-a", {
      method: "PUT", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", contactId, decision: "shortlisted", note: "Keep this" }),
    });
    expect((await request("/store/media-db/recommendations/feedback", "workspace-a", {
      method: "PUT", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", contactId, signal: "more" }),
    })).status).toBe(200);

    const own = await (await request("/store/media-db/recommendations/decisions?projectId=project-1&storyKey=story-1")).json() as { feedback: unknown[]; decisions: unknown[]; items: Array<{ reasons: string[] }> };
    expect(own.feedback).toMatchObject([{ contactId, signal: "more" }]);
    expect(own.decisions).toMatchObject([{ contactId, decision: "shortlisted", note: "Keep this" }]);
    expect(own.items.some((item: { reasons: string[] }) => item.reasons.includes("Marked More like this"))).toBe(true);

    const otherArticle = await (await request("/store/media-db/recommendations/decisions?projectId=project-1&storyKey=story-2")).json() as { feedback: unknown[] };
    expect(otherArticle.feedback).toEqual([]);
    expect((await request("/store/media-db/recommendations/decisions?projectId=project-1&storyKey=story-1", "workspace-b")).status).toBe(404);
  });

  it("persists exact phrase attributions and rejects forged phrase identities", async () => {
    const targetPhrases = [{
      id: stableExactTargetPhraseId("discovery", "energy correspondent"),
      text: "energy correspondent",
      intentGroup: "discovery",
    }, {
      id: stableExactTargetPhraseId("discovery", "energy platform"),
      text: "energy platform",
      intentGroup: "discovery",
    }];
    const generated = await request("/store/media-db/recommendations", "workspace-a", {
      method: "POST",
      body: JSON.stringify({ projectId: "project-1", storyKey: "phrase-story", terms: [], targetPhrases }),
    });
    expect(generated.status).toBe(200);
    const body = await generated.json() as { items: Array<{ score: number; reasons: string[]; contact: { role: string }; phraseAttributions: Array<{ phraseId: string; phraseText: string; matchKind: string; exactPhraseMatch: string }> }> };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].contact.role).toBe("Energy correspondent");
    expect(body.items[0].reasons).toContain("Exact target phrase appears in coverage profile: “energy correspondent”");
    expect(body.items[0].score).toBeGreaterThan(body.items[1].score);
    const attributions = body.items.flatMap((item) => item.phraseAttributions);
    expect(attributions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phraseId: targetPhrases[0].id,
        phraseText: targetPhrases[0].text,
        matchKind: "exact",
        exactPhraseMatch: expect.stringContaining("full normalized exact phrase"),
      }),
      expect.objectContaining({
        phraseId: targetPhrases[1].id,
        phraseText: targetPhrases[1].text,
        matchKind: "topic",
        exactPhraseMatch: expect.stringContaining("No full exact phrase match"),
      }),
    ]));

    const reloaded = await (await request("/store/media-db/recommendations/decisions?projectId=project-1&storyKey=phrase-story")).json() as {
      items: Array<{ phraseAttributions: Array<{ phraseId: string }> }>;
    };
    expect(reloaded.items[0].phraseAttributions).toEqual(expect.arrayContaining([
      expect.objectContaining({ phraseId: targetPhrases[0].id }),
    ]));

    const forged = await request("/store/media-db/recommendations", "workspace-a", {
      method: "POST",
      body: JSON.stringify({
        projectId: "project-1",
        storyKey: "forged-phrase-story",
        terms: ["energy"],
        targetPhrases: [{ ...targetPhrases[0], id: "phrase-forged" }],
      }),
    });
    expect(forged.status).toBe(400);

    const longText = "İ".repeat(600);
    const capped = longText.slice(0, 500);
    expect(stableExactTargetPhraseId("discovery", longText))
      .toBe(stableExactTargetPhraseId("discovery", capped));
    const longPhrase = {
      id: stableExactTargetPhraseId("discovery", longText),
      text: longText,
      intentGroup: "discovery",
    };
    const longRequest = await request("/store/media-db/recommendations", "workspace-a", {
      method: "POST",
      body: JSON.stringify({ projectId: "project-1", storyKey: "long-phrase-story", terms: ["energy"], targetPhrases: [longPhrase] }),
    });
    expect(longRequest.status).toBe(200);
    const longBody = await longRequest.json() as { items: Array<{ phraseAttributions: unknown[] }> };
    expect(longBody.items).toBeDefined();
    expect(capped).toHaveLength(500);
  });

  it("persists briefs and restrictions, enriches only current candidates, and reloads evidence", async () => {
    const brief = { topic: "energy", angle: "transition", audience: "trade press", regions: ["UK"], publicationTypes: ["Trade press"], whyNow: "budget" };
    expect((await request("/store/media-db/recommendations/brief", "workspace-a", {
      method: "PUT", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", brief }),
    })).status).toBe(200);
    expect(await (await request("/store/media-db/recommendations/brief?projectId=project-1&storyKey=story-1")).json()).toMatchObject({ brief });

    const generated = await request("/store/media-db/recommendations", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", terms: ["energy"] }),
    });
    const generatedBody = await generated.json() as { recommendationSet: { id: number }; items: Array<{ contact: { id: number }; assessment: { version: string } }> };
    expect(generatedBody.items[0]?.assessment.version).toBe("editorial-v1");
    const contactId = generatedBody.items[0].contact.id;

    expect((await request("/store/media-db/recommendations/contact-restriction", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", contactId, doNotContact: true }),
    })).status).toBe(200);
    const blocked = await (await request("/store/media-db/recommendations?projectId=project-1&storyKey=story-1")).json() as { items: Array<{ contact: { id: number }; assessment: { readiness: { status: string } } }> };
    expect(blocked.items.find((item) => item.contact.id === contactId)?.assessment.readiness.status).toBe("blocked");
    expect((await request("/store/media-db/outreach", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", contactId }),
    })).status).toBe(409);

    collectJournalistCoverage.mockResolvedValue({
      evidence: [{ title: "Energy transition", url: "https://example.test/article", publishedAt: "2026-01-01", checkedAt: "2026-01-02T00:00:00.000Z", excerpt: "transition", attribution: "page_checked", authorMatched: true }],
      warnings: ["checked"],
    });
    const enriched = await request("/store/media-db/recommendations/enrich", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1", recommendationSetId: generatedBody.recommendationSet.id }),
    });
    expect(enriched.status).toBe(200);
    expect(collectJournalistCoverage).toHaveBeenCalledTimes(Math.min(5, generatedBody.items.length));
    const enrichedBody = await enriched.json() as { items: Array<{ assessment: { evidence: unknown[] } }> };
    expect(enrichedBody.items[0].assessment.evidence).toHaveLength(1);
    expect(await db.select().from(tokenUsageTable).where(eq(tokenUsageTable.operation, "content-media-recommendations-enrich"))).toHaveLength(1);
    const saved = await db.select().from(mediaRecommendationSetsTable).where(eq(mediaRecommendationSetsTable.id, generatedBody.recommendationSet.id));
    expect((saved[0].criteria as { evidence: Record<string, unknown[]> }).evidence).toBeDefined();
    expect((await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, "mediaRecommendation:brief:workspace-a:project-1:story-1")))).toHaveLength(1);
  });

  it("does not write failed provider results and uses compare-and-swap for concurrent enrichments", async () => {
    const generated = await request("/store/media-db/recommendations", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "race-story", terms: ["energy"] }),
    });
    const body = await generated.json() as { recommendationSet: { id: number; criteria: Record<string, unknown> }; items: unknown[] };
    const before = await db.select({ criteria: mediaRecommendationSetsTable.criteria }).from(mediaRecommendationSetsTable).where(eq(mediaRecommendationSetsTable.id, body.recommendationSet.id));
    collectJournalistCoverage.mockRejectedValueOnce(new Error("provider unavailable"));
    const failed = await request("/store/media-db/recommendations/enrich", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "race-story", recommendationSetId: body.recommendationSet.id }),
    });
    expect(failed.status).toBe(502);
    const afterFailure = await db.select({ criteria: mediaRecommendationSetsTable.criteria }).from(mediaRecommendationSetsTable).where(eq(mediaRecommendationSetsTable.id, body.recommendationSet.id));
    expect(afterFailure[0].criteria).toEqual(before[0].criteria);

    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    collectJournalistCoverage.mockImplementation(async () => {
      calls += 1;
      await gate;
      return { evidence: [], warnings: [] };
    });
    const first = request("/store/media-db/recommendations/enrich", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "race-story", recommendationSetId: body.recommendationSet.id }),
    });
    const second = request("/store/media-db/recommendations/enrich", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "race-story", recommendationSetId: body.recommendationSet.id }),
    });
    while (calls < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    release();
    const statuses = await Promise.all([first.then((response) => response.status), second.then((response) => response.status)]);
    expect(statuses.sort()).toEqual([200, 409]);
  });

  it("tracks the complete outreach journey, preserves snapshots and updates duplicate placements safely", async () => {
    const contacts = await db.select().from(mediaContactsTable);
    const phrase = { id: stableExactTargetPhraseId("discovery", "energy correspondent"), text: "energy correspondent", intentGroup: "discovery" };
    const created = await request("/store/media-db/outreach", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "placement-story", articleTitle: "Stored article", contactId: contacts[0].id, targetPhrases: [phrase], responsibleTeamMember: "Alex" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { outreach: { id: number; contactSnapshot: { name: string }; targetPhrases: unknown[] } };
    const outreachId = createdBody.outreach.id;
    expect(createdBody.outreach.contactSnapshot.name).toContain("Jane");
    expect(createdBody.outreach.targetPhrases).toEqual([phrase]);

    expect((await request(`/store/media-db/outreach/${outreachId}`, "workspace-a", { method: "PUT", body: JSON.stringify({ status: "pitched" }) })).status).toBe(400);
    expect((await request(`/store/media-db/outreach/${outreachId}`, "workspace-a", { method: "PUT", body: JSON.stringify({ status: "pitched", pitchDate: "2026-09-01", notes: "Pitch sent" }) })).status).toBe(200);
    expect((await request(`/store/media-db/outreach/${outreachId}`, "workspace-a", { method: "PUT", body: JSON.stringify({ status: "responded", responseDate: "2026-09-02" }) })).status).toBe(200);
    expect((await request(`/store/media-db/outreach/${outreachId}`, "workspace-a", { method: "PUT", body: JSON.stringify({ status: "accepted" }) })).status).toBe(200);

    const placementUrl = `${baseUrl.replace(/\/api$/, "")}/verification-page`;
    const firstPlacement = await request(`/store/media-db/outreach/${outreachId}/placements`, "workspace-a", {
      method: "POST", body: JSON.stringify({ canonicalUrl: `${placementUrl}?utm_source=email#top`, publicationDate: "2026-09-03", headline: "First headline", supportingEvidence: "The article names the company." }),
    });
    expect(firstPlacement.status).toBe(201);
    const firstPlacementBody = await firstPlacement.json() as { placement: { id: number; canonicalUrl: string; verification: string } };
    expect(firstPlacementBody.placement.canonicalUrl).toBe(placementUrl);
    expect(firstPlacementBody.placement.verification).toBe("user_claimed");

    const updatedPlacement = await request(`/store/media-db/outreach/${outreachId}/placements`, "workspace-a", {
      method: "POST", body: JSON.stringify({ canonicalUrl: placementUrl, publicationDate: "2026-09-04", headline: "Corrected headline", supportingEvidence: "Updated evidence." }),
    });
    expect(updatedPlacement.status).toBe(200);
    expect(await updatedPlacement.json()).toMatchObject({ updated: true, placement: { id: firstPlacementBody.placement.id, headline: "Corrected headline" } });

    const second = await request("/store/media-db/outreach", "workspace-a", {
      method: "POST", body: JSON.stringify({ projectId: "project-1", storyKey: "placement-story", articleTitle: "Stored article", contactId: contacts[1].id, targetPhrases: [phrase] }),
    });
    const secondId = ((await second.json()) as { outreach: { id: number } }).outreach.id;
    await request(`/store/media-db/outreach/${secondId}`, "workspace-a", { method: "PUT", body: JSON.stringify({ status: "pitched", pitchDate: "2026-09-01" }) });
    await request(`/store/media-db/outreach/${secondId}`, "workspace-a", { method: "PUT", body: JSON.stringify({ status: "accepted" }) });
    expect((await request(`/store/media-db/outreach/${secondId}/placements`, "workspace-a", {
      method: "POST", body: JSON.stringify({ canonicalUrl: `${placementUrl}?fbclid=duplicate`, publicationDate: "2026-09-04", headline: "Duplicate", supportingEvidence: "Duplicate evidence" }),
    })).status).toBe(409);

    expect((await request(`/store/media-db/placements/${firstPlacementBody.placement.id}/verification`, "workspace-a", {
      method: "PUT", body: JSON.stringify({ verification: "page_verified", verifiedFacts: { headline: "Forged client headline" } }),
    })).status).toBe(200);
    const revision = await request(`/store/media-db/outreach/${outreachId}/placements`, "workspace-a", {
      method: "POST", body: JSON.stringify({ canonicalUrl: placementUrl, publicationDate: "2026-09-05", headline: "Revised after verification", supportingEvidence: "A new user claim." }),
    });
    expect(await revision.json()).toMatchObject({ placement: { verification: "user_claimed", verifiedFacts: {}, verificationHistory: expect.arrayContaining([expect.objectContaining({ kind: "claim_revised", priorVerification: "page_verified" })]) } });
    expect((await request(`/store/media-db/placements/${firstPlacementBody.placement.id}/verification`, "workspace-a", { method: "PUT" })).status).toBe(200);
    await db.update(mediaContactsTable).set({ role: "Departed", deletedAt: new Date() }).where(sql`${mediaContactsTable.id} = ${contacts[0].id}`);
    const loaded = await (await request("/store/media-db/outreach?projectId=project-1&storyKey=placement-story", "workspace-a")).json() as { outreach: Array<{ contactSnapshot: { role: string }; activities: unknown[]; placements: Array<{ verification: string }> }> };
    const preserved = loaded.outreach.find((row) => row.contactSnapshot.role === "Energy correspondent");
    expect(preserved).toBeDefined();
    expect(preserved!.activities.length).toBeGreaterThanOrEqual(5);
    expect(preserved!.placements[0].verification).toBe("page_verified");
    expect((await request("/store/media-db/outreach?projectId=project-1&storyKey=placement-story", "workspace-b")).status).toBe(404);
  });
});
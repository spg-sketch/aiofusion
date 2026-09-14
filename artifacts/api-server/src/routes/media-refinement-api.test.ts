import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { getTableColumns, sql } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE projects (id varchar PRIMARY KEY, name varchar NOT NULL DEFAULT '', data jsonb NOT NULL DEFAULT '{}', intake jsonb, logo text, owner varchar, tier varchar(16), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
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
vi.mock("../lib/platform-auth", () => ({ getVisibleUsernames: async () => null, normUsername: (value: string) => value.toLowerCase() }));

import {
  db,
  mediaContactsTable,
  mediaOutletsTable,
  mediaRecommendationDecisionsTable,
  mediaRecommendationFeedbackTable,
  mediaRecommendationItemsTable,
  mediaRecommendationSetsTable,
  projectsTable,
} from "@workspace/db";
import { ensureMediaSchema } from "../lib/ensure-media-schema";
import { stableExactTargetPhraseId } from "../lib/exact-target-phrases";
import mediaDbRouter from "./media-db";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  await ensureMediaSchema();
  await ensureMediaSchema();
  await db.insert(projectsTable).values({ id: "project-1", owner: "workspace-a" });
  const [outlet] = await db.insert(mediaOutletsTable).values({ name: "Energy Daily", category: "Trade press", country: "UK" }).returning();
  await db.insert(mediaContactsTable).values([
    { outletId: outlet.id, firstName: "Jane", lastName: "One", role: "Energy correspondent", beats: ["energy"], sectors: ["technology"], geography: "UK" },
    { outletId: outlet.id, firstName: "John", lastName: "Two", role: "Energy editor", beats: ["energy"], sectors: ["technology"], geography: "UK", email: "john@example.test" },
  ]);
  const app = express();
  app.use(express.json());
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
          'media_recommendation_feedback'
        )
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
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
    const otherWorkspace = await (await request("/store/media-db/recommendations/decisions?projectId=project-1&storyKey=story-1", "workspace-b")).json() as { feedback: unknown[]; items: unknown[] };
    expect(otherWorkspace.feedback).toEqual([]);
    expect(otherWorkspace.items).toEqual([]);
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
});
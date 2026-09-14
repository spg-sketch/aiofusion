import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
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
    CREATE TABLE media_recommendation_sets (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL, story_key varchar(200) NOT NULL,
      criteria jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE media_recommendation_items (
      id serial PRIMARY KEY, recommendation_set_id integer NOT NULL REFERENCES media_recommendation_sets(id) ON DELETE CASCADE,
      contact_id integer NOT NULL REFERENCES media_contacts(id), score integer NOT NULL, reasons jsonb NOT NULL DEFAULT '[]',
      rank integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(recommendation_set_id, contact_id)
    );
    CREATE TABLE media_recommendation_decisions (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL, story_key varchar(200) NOT NULL,
      contact_id integer NOT NULL REFERENCES media_contacts(id), decision varchar(20) NOT NULL, note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(account_id, project_id, story_key, contact_id)
    );
    CREATE TABLE media_recommendation_feedback (
      id serial PRIMARY KEY, account_id varchar NOT NULL, project_id varchar NOT NULL, story_key varchar(200) NOT NULL,
      contact_id integer NOT NULL REFERENCES media_contacts(id) ON DELETE CASCADE, signal varchar(12) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(account_id, project_id, story_key, contact_id)
    );
    CREATE TABLE media_categories (id serial PRIMARY KEY, name text NOT NULL, account_id varchar, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE media_contact_field_overrides (id serial PRIMARY KEY, contact_id integer NOT NULL, account_id varchar NOT NULL, field_name varchar(80) NOT NULL, value text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE media_import_batches (id serial PRIMARY KEY, account_id varchar NOT NULL, idempotency_key varchar(160), source_filename text NOT NULL DEFAULT '', source_hash varchar(64) NOT NULL DEFAULT '', source_type varchar(20) NOT NULL DEFAULT 'csv', summary jsonb NOT NULL DEFAULT '{}', committed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  `);
  return { ...(await vi.importActual<object>("@workspace/db/schema")), db, pool: { end: () => client.close() } };
});

vi.mock("../middleware/platform-auth", () => ({ requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../lib/member-guards", () => ({ memberProjectGate: (_req: unknown, _res: unknown, next: () => void) => next(), inAssignedScope: () => true }));
vi.mock("../lib/platform-auth", () => ({ getVisibleUsernames: async () => null, normUsername: (value: string) => value.toLowerCase() }));

import { db, mediaContactsTable, mediaOutletsTable, projectsTable } from "@workspace/db";
import mediaDbRouter from "./media-db";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
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

describe("media recommendation refinement API", () => {
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
});
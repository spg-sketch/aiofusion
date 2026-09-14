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
    CREATE TABLE projects (
      id varchar PRIMARY KEY, owner varchar, deleted_at timestamptz
    );
    CREATE TABLE archive_items (
      id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL,
      title varchar NOT NULL DEFAULT '', content_type varchar NOT NULL DEFAULT '',
      spokesperson varchar, status varchar NOT NULL DEFAULT 'Draft', tags jsonb DEFAULT '[]',
      headline text, standfirst text, body_copy text, body text, selected_messages jsonb,
      media_cats jsonb, target_phrases jsonb, target_phrase_ids jsonb, pub_date varchar,
      released_at varchar, release_channel varchar, source varchar,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE planner_items (
      id varchar PRIMARY KEY, project_id varchar NOT NULL, owner varchar NOT NULL,
      title varchar NOT NULL DEFAULT '', content_type varchar NOT NULL DEFAULT '',
      spokesperson varchar NOT NULL DEFAULT '', key_message varchar NOT NULL DEFAULT '',
      audience varchar NOT NULL DEFAULT '', channels jsonb NOT NULL DEFAULT '[]',
      week integer NOT NULL DEFAULT 1, status varchar NOT NULL DEFAULT 'Planned',
      release_date varchar NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
      headline text, standfirst text, body_copy text, action_notes text,
      target_phrases jsonb, target_phrase_ids jsonb,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );
    CREATE TABLE scoring_configs (owner varchar PRIMARY KEY, config jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
  `);
  return { ...(await vi.importActual<object>("@workspace/db/schema")), db, pool: { end: () => client.close() } };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/member-guards", () => ({
  memberProjectGate: (_req: unknown, _res: unknown, next: () => void) => next(),
  inAssignedScope: (req: { account?: { projectAccess?: string[] | null } }, projectId: string) =>
    !req.account?.projectAccess || req.account.projectAccess.includes(projectId),
  restrictToAssigned: (req: { account?: { projectAccess?: string[] | null } }, ids: string[] | null) =>
    req.account?.projectAccess ? (ids === null ? req.account.projectAccess : ids.filter((id) => req.account!.projectAccess!.includes(id))) : ids,
}));
vi.mock("../lib/platform-auth", () => ({
  getVisibleUsernames: async (account: { username: string; role: string }) => account.role === "admin" ? null : [account.username],
  normUsername: (value: string) => value.toLowerCase(),
}));

import { db } from "@workspace/db";
import storeContentRouter from "./store-content";
import { sql } from "drizzle-orm";

describe("content store project isolation", () => {
  let server: Server;
  let baseUrl = "";
  beforeAll(async () => {
    await db.execute(sql`
      INSERT INTO projects (id, owner) VALUES
        ('private-project', 'workspace-a'),
        ('deleted-project', 'workspace-b')
    `);
    await db.execute(sql`UPDATE projects SET deleted_at = now() WHERE id = 'deleted-project'`);
    await db.execute(sql`
      INSERT INTO archive_items (id, project_id, owner, title, content_type)
      VALUES
        ('private-archive', 'private-project', 'workspace-a', 'Private', 'Article'),
        ('deleted-archive', 'deleted-project', 'workspace-b', 'Deleted', 'Article')
    `);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.account = { username: "workspace-b", role: "user" } as NonNullable<typeof req.account>;
      req.log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as typeof req.log;
      next();
    });
    app.use("/api", storeContentRouter);
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const request = (path: string, init: RequestInit) => fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });

  it("rejects guessed foreign and deleted project writes, including mutations", async () => {
    const postForeign = await request("/store/archive", {
      method: "POST",
      body: JSON.stringify({ id: "forged", projectId: "private-project", title: "Nope", contentType: "Article" }),
    });
    expect(postForeign.status).toBe(403);

    const postDeleted = await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({ id: "deleted", projectId: "deleted-project", title: "Nope", contentType: "Article" }),
    });
    expect(postDeleted.status).toBe(403);

    const putForeign = await request("/store/archive/private-archive", {
      method: "PUT",
      body: JSON.stringify({ title: "Nope", contentType: "Article" }),
    });
    expect(putForeign.status).toBe(403);
    const deleteForeign = await request("/store/archive/private-archive", { method: "DELETE" });
    expect(deleteForeign.status).toBe(403);
    const putDeleted = await request("/store/archive/deleted-archive", {
      method: "PUT",
      body: JSON.stringify({ title: "Nope", contentType: "Article" }),
    });
    expect(putDeleted.status).toBe(403);
  });
});
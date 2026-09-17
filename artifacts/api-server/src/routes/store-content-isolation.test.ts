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
      headline text, standfirst text, body_copy text, action_notes text, body text, selected_messages jsonb,
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
       source_archive_id varchar, body text, selected_messages jsonb, media_cats jsonb, pub_date varchar,
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
        ('workspace-b-project', 'workspace-b'),
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

  it("round-trips the linked article snapshot and blocks deleting its canonical archive", async () => {
    const archive = {
      id: "article-canonical", projectId: "workspace-b-project", title: "Precise article",
      contentType: "Article", status: "Draft", tags: ["article"], headline: "Headline",
      standfirst: "Standfirst", bodyCopy: "The complete body.", body: "Headline\n\nStandfirst\n\nThe complete body.",
      actionNotes: "Coordinate approval", selectedMessages: ["Exact message"], mediaCats: ["Trade"],
      pubDate: "2026-06-01", targetPhrases: [{ id: "phrase-1", text: "exact phrase", intentGroup: "discovery" }],
      targetPhraseIds: ["phrase-1"], createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect((await request("/store/archive", { method: "POST", body: JSON.stringify(archive) })).status).toBe(200);
    const archiveAfterPost = await request(
      "/store/archive?projectId=workspace-b-project",
      { method: "GET" },
    );
    expect((await archiveAfterPost.json() as {
      items: Array<{ id: string; actionNotes: string | null }>;
    }).items.find((item) => item.id === archive.id)?.actionNotes)
      .toBe("Coordinate approval");

    const archiveUpdate = await request("/store/archive/article-canonical", {
      method: "PUT",
      body: JSON.stringify({
        title: archive.title,
        contentType: archive.contentType,
        actionNotes: "Updated action notes",
      }),
    });
    expect(archiveUpdate.status).toBe(200);
    expect((await archiveUpdate.json() as {
      item: { actionNotes: string | null };
    }).item.actionNotes).toBe("Updated action notes");

    const clearArchiveActionNotes = await request("/store/archive/article-canonical", {
      method: "PUT",
      body: JSON.stringify({
        title: archive.title,
        contentType: archive.contentType,
        actionNotes: "",
      }),
    });
    expect(clearArchiveActionNotes.status).toBe(200);
    expect((await clearArchiveActionNotes.json() as {
      item: { actionNotes: string | null };
    }).item.actionNotes).toBe("");
    const archiveAfterClear = await request(
      "/store/archive?projectId=workspace-b-project",
      { method: "GET" },
    );
    expect((await archiveAfterClear.json() as {
      items: Array<{ id: string; actionNotes: string | null }>;
    }).items.find((item) => item.id === archive.id)?.actionNotes).toBe("");

    const planner = {
      id: "planner-canonical", projectId: "workspace-b-project", sourceArchiveId: archive.id,
      title: archive.title, contentType: archive.contentType, spokesperson: "", keyMessage: "Exact message",
      audience: "Trade", channels: ["Website"], week: 23, status: "Drafting", releaseDate: archive.pubDate,
      notes: archive.actionNotes, headline: archive.headline, standfirst: archive.standfirst,
      bodyCopy: archive.bodyCopy, body: archive.body, actionNotes: archive.actionNotes,
      selectedMessages: archive.selectedMessages, mediaCats: archive.mediaCats, pubDate: archive.pubDate,
      targetPhrases: archive.targetPhrases, targetPhraseIds: archive.targetPhraseIds,
    };
    expect((await request("/store/planner", { method: "POST", body: JSON.stringify(planner) })).status).toBe(200);

    const listed = await request("/store/planner?projectId=workspace-b-project", { method: "GET" });
    expect(listed.status).toBe(200);
    const listedBody = await listed.json() as { items: Array<Record<string, unknown>> };
    expect(listedBody.items[0]).toMatchObject({
      sourceArchiveId: "article-canonical", body: archive.body, bodyCopy: "The complete body.",
      selectedMessages: ["Exact message"], mediaCats: ["Trade"], pubDate: "2026-06-01",
      targetPhraseIds: ["phrase-1"],
    });
    const deletion = await request("/store/archive/article-canonical", { method: "DELETE" });
    expect(deletion.status).toBe(409);
    expect((await deletion.json() as { code?: string }).code).toBe("archive_linked_to_planner");

    const archiveAfterRejectedDeletion = await request(
      "/store/archive?projectId=workspace-b-project",
      { method: "GET" },
    );
    expect((await archiveAfterRejectedDeletion.json() as {
      items: Array<{ id: string }>;
    }).items.map((item) => item.id)).toContain(archive.id);
  });

  it("rejects phantom and cross-project source archive references on planner create and update", async () => {
    const foreignLink = await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({
        id: "foreign-source-planner",
        projectId: "workspace-b-project",
        title: "Forged link",
        contentType: "Article",
        sourceArchiveId: "private-archive",
      }),
    });
    expect(foreignLink.status).toBe(400);
    expect((await foreignLink.json() as { error: string }).error)
      .toBe("sourceArchiveId must reference an active archive item in this project.");

    const phantomLink = await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({
        id: "phantom-source-planner",
        projectId: "workspace-b-project",
        title: "Phantom link",
        contentType: "Article",
        sourceArchiveId: "does-not-exist",
      }),
    });
    expect(phantomLink.status).toBe(400);

    expect((await request("/store/archive", {
      method: "POST",
      body: JSON.stringify({
        id: "soft-deleted-source",
        projectId: "workspace-b-project",
        title: "No longer active",
        contentType: "Article",
      }),
    })).status).toBe(200);
    expect((await request("/store/archive/soft-deleted-source", {
      method: "DELETE",
    })).status).toBe(200);
    const deletedSourceLink = await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({
        id: "deleted-source-planner",
        projectId: "workspace-b-project",
        title: "Deleted source",
        contentType: "Article",
        sourceArchiveId: "soft-deleted-source",
      }),
    });
    expect(deletedSourceLink.status).toBe(400);

    expect((await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({
        id: "planner-to-update",
        projectId: "workspace-b-project",
        title: "Unlinked planner row",
        contentType: "Article",
      }),
    })).status).toBe(200);

    const invalidUpdate = await request("/store/planner/planner-to-update", {
      method: "PUT",
      body: JSON.stringify({ sourceArchiveId: "does-not-exist" }),
    });
    expect(invalidUpdate.status).toBe(400);
  });

  it("allows only one active planner link to a canonical archive", async () => {
    const archive = {
      id: "single-link-archive",
      projectId: "workspace-b-project",
      title: "Single link source",
      contentType: "Article",
    };
    expect((await request("/store/archive", {
      method: "POST",
      body: JSON.stringify(archive),
    })).status).toBe(200);

    const firstPlanner = {
      id: "first-source-link",
      projectId: "workspace-b-project",
      title: "First link",
      contentType: "Article",
      sourceArchiveId: archive.id,
    };
    expect((await request("/store/planner", {
      method: "POST",
      body: JSON.stringify(firstPlanner),
    })).status).toBe(200);

    const duplicatePlanner = await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({
        ...firstPlanner,
        id: "duplicate-source-link",
        title: "Duplicate link",
      }),
    });
    expect(duplicatePlanner.status).toBe(409);
    expect((await duplicatePlanner.json() as { error: string }).error)
      .toBe("This library item is already linked to an active Comms Planner row.");

    expect((await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({
        id: "planner-to-duplicate-update",
        projectId: "workspace-b-project",
        title: "Will attempt a duplicate link",
        contentType: "Article",
      }),
    })).status).toBe(200);
    const duplicateUpdate = await request("/store/planner/planner-to-duplicate-update", {
      method: "PUT",
      body: JSON.stringify({ sourceArchiveId: archive.id }),
    });
    expect(duplicateUpdate.status).toBe(409);

    expect((await request("/store/planner/first-source-link", {
      method: "DELETE",
    })).status).toBe(200);
    expect((await request("/store/planner", {
      method: "POST",
      body: JSON.stringify({
        ...firstPlanner,
        id: "replacement-source-link",
        title: "Replacement link",
      }),
    })).status).toBe(200);
  });
});
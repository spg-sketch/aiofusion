import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    articles: [] as Row[],
    media: [] as Row[],
    meta: [] as Row[],
    deleteArticleAfterLock: false,
  };

  const column = (name: string) => ({ __col: name });
  const insightArticlesTable = {
    id: column("id"),
    slug: column("slug"),
    status: column("status"),
    datePublished: column("datePublished"),
    createdAt: column("createdAt"),
  };
  const insightMediaTable = {
    id: column("id"),
    deletedAt: column("deletedAt"),
  };
  const platformMetaTable = {
    key: column("key"),
    value: column("value"),
  };

  function rowsFor(table: unknown): Row[] {
    if (table === insightArticlesTable) return state.articles;
    if (table === insightMediaTable) return state.media;
    if (table === platformMetaTable) return state.meta;
    return [];
  }

  function matches(row: Row, predicate: any): boolean {
    if (!predicate) return true;
    if (predicate.kind === "eq") return row[predicate.column] === predicate.value;
    if (predicate.kind === "and") return predicate.parts.every((part: any) => matches(row, part));
    if (predicate.kind === "isNull") return row[predicate.column] == null;
    return true;
  }

  class QueryBuilder implements PromiseLike<Row[]> {
    constructor(private readonly rows: Row[]) {}
    where(predicate: any) {
      return new QueryBuilder(this.rows.filter((row) => matches(row, predicate)));
    }
    orderBy() {
      return this;
    }
    limit(count: number) {
      return Promise.resolve(this.rows.slice(0, count).map((row) => ({ ...row })));
    }
    then<TResult1 = Row[], TResult2 = never>(
      onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(this.rows.map((row) => ({ ...row }))).then(onfulfilled, onrejected);
    }
  }

  const db: any = {
    select: () => ({
      from: (table: unknown) => {
        // Model a concurrent DELETE that commits while the PATCH is waiting
        // for the advisory lock. The route must re-read and return 404 rather
        // than writing stale pin metadata.
        if (table === insightArticlesTable && state.deleteArticleAfterLock) {
          state.articles = state.articles.filter((row) => row.id !== "one");
          state.deleteArticleAfterLock = false;
        }
        return new QueryBuilder(rowsFor(table));
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Row) => ({
        returning: async () => {
          const row = { ...values };
          rowsFor(table).push(row);
          return [row];
        },
        onConflictDoUpdate: async ({ set }: { set: Row }) => {
          const rows = rowsFor(table);
          const existing = rows.find((row) => row.key === values.key);
          if (existing) Object.assign(existing, set);
          else rows.push({ ...values });
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: (predicate: any) => ({
          returning: async () => {
            const rows = rowsFor(table);
            const updated = rows.filter((row) => matches(row, predicate));
            updated.forEach((row) => Object.assign(row, values));
            return updated.map((row) => ({ ...row }));
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: async (predicate: any) => {
        const rows = rowsFor(table);
        const remaining = rows.filter((row) => !matches(row, predicate));
        rows.splice(0, rows.length, ...remaining);
      },
    }),
    execute: async () => ({ rows: [] }),
    transaction: async (callback: (tx: typeof db) => Promise<unknown>) => {
      try {
        return await callback(db);
      } finally {
        state.deleteArticleAfterLock = false;
      }
    },
  };

  return { state, db, insightArticlesTable, insightMediaTable, platformMetaTable };
});

vi.mock("drizzle-orm", () => ({
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  desc: (column: { __col: string }) => column,
  eq: (column: { __col: string }, value: unknown) => ({
    kind: "eq",
    column: column.__col,
    value,
  }),
  isNull: (column: { __col: string }) => ({ kind: "isNull", column: column.__col }),
  sql: () => ({}),
}));

vi.mock("@workspace/db", () => ({
  db: h.db,
  insightArticlesTable: h.insightArticlesTable,
  insightMediaTable: h.insightMediaTable,
  platformMetaTable: h.platformMetaTable,
}));

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../lib/insight-object-storage", () => ({
  InsightObjectStorage: class {
    async detectRasterContentType() {
      return null;
    }
  },
}));

import insightsRouter from "./insights";

let server: Server;
let baseUrl: string;

function article(id: string, status = "published"): Record<string, unknown> {
  return {
    id,
    slug: id,
    title: id,
    excerpt: "",
    tag: "Article",
    externalUrl: null,
    datePublished: "2026-09-01",
    dateModified: null,
    body: [],
    coverMediaId: null,
    coverImageUrl: null,
    coverImageAlt: "",
    seoTitle: null,
    seoDescription: null,
    focusKeyphrase: null,
    canonicalUrl: null,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: new Date(),
  };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

beforeEach(async () => {
  h.state.articles = ["one", "two", "three"].map((id) => article(id));
  h.state.media = [];
  h.state.meta = [{ key: "insights:homepage:pinned", value: JSON.stringify(["one", "two", "three"]) }];
  h.state.deleteArticleAfterLock = false;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = { role: "admin" } as any;
    req.log = { warn: vi.fn() } as any;
    next();
  });
  app.use("/api", insightsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Insights homepage pin API", () => {
  it("includes pin status in the public response", async () => {
    const response = await request("/api/insights");
    expect(response.status).toBe(200);
    const rows = await response.json() as Array<{ id: string; pinned: boolean }>;
    expect(rows.map((row) => [row.id, row.pinned])).toEqual([
      ["one", true],
      ["two", true],
      ["three", true],
    ]);
  });

  it("rejects a fourth pin without changing the article or singleton list", async () => {
    const response = await request("/api/admin/insights", {
      method: "POST",
      body: JSON.stringify({
        ...article("four"),
        pinned: true,
      }),
    });

    expect(response.status).toBe(409);
    const body = await response.json() as { error: string };
    expect(body.error).toMatch(/up to 3/i);
    expect(h.state.articles.map((row) => row.id)).toEqual(["one", "two", "three"]);
    expect(JSON.parse(String(h.state.meta[0]?.value))).toEqual(["one", "two", "three"]);
  });

  it("rejects a published story without a verified calendar publication date", async () => {
    const response = await request("/api/admin/insights", {
      method: "POST",
      body: JSON.stringify({
        ...article("undated"),
        datePublished: "2026-02-30",
        pinned: false,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/verified publication date/i),
    });
    expect(h.state.articles.map((row) => row.id)).toEqual(["one", "two", "three"]);
  });

  it("rejects a new published story when no publication date is supplied", async () => {
    const input = article("undated");
    delete input.datePublished;
    const response = await request("/api/admin/insights", {
      method: "POST",
      body: JSON.stringify({ ...input, pinned: false }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/verified publication date/i),
    });
    expect(h.state.articles.map((row) => row.id)).toEqual(["one", "two", "three"]);
  });

  it("accepts an explicit verified publication date and assigns the create timestamp on the server", async () => {
    const response = await request("/api/admin/insights", {
      method: "POST",
      body: JSON.stringify({
        ...article("dated-story"),
        datePublished: "2026-09-01",
        dateModified: "1900-01-01T00:00:00.000Z",
        pinned: false,
      }),
    });

    expect(response.status).toBe(201);
    const created = await response.json() as { datePublished: string; dateModified: string };
    expect(created.datePublished).toBe("2026-09-01");
    expect(created.dateModified).not.toBe("1900-01-01T00:00:00.000Z");
    expect(created.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("rejects clearing the verified date from a story that remains published", async () => {
    const previousDate = h.state.articles[0]?.datePublished;
    const response = await request("/api/admin/insights/one", {
      method: "PATCH",
      body: JSON.stringify({
        ...article("one"),
        datePublished: null,
        pinned: true,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/verified publication date/i),
    });
    expect(h.state.articles[0]?.datePublished).toBe(previousDate);
  });

  it("sets the modification timestamp on the server when story content changes", async () => {
    const previousModified = h.state.articles[0]?.dateModified;
    const response = await request("/api/admin/insights/one", {
      method: "PATCH",
      body: JSON.stringify({
        ...article("one"),
        title: "Changed story title",
        dateModified: "1900-01-01T00:00:00.000Z",
        pinned: true,
      }),
    });

    expect(response.status).toBe(200);
    const updated = h.state.articles[0];
    expect(updated?.dateModified).not.toBe("1900-01-01T00:00:00.000Z");
    expect(updated?.dateModified).not.toBe(previousModified);
    expect(updated?.dateModified).toBe((updated?.updatedAt as Date).toISOString());
  });

  it("preserves the modification timestamp when content is unchanged", async () => {
    const previousModified = h.state.articles[0]?.dateModified;
    const response = await request("/api/admin/insights/one", {
      method: "PATCH",
      body: JSON.stringify({
        ...article("one"),
        pinned: false,
      }),
    });

    expect(response.status).toBe(200);
    expect(h.state.articles[0]?.dateModified).toBe(previousModified);
  });

  it("unpins a story atomically when it becomes a draft", async () => {
    const response = await request("/api/admin/insights/one", {
      method: "PATCH",
      body: JSON.stringify({
        ...article("one", "draft"),
        pinned: true,
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { pinned: boolean };
    expect(body.pinned).toBe(false);
    expect(JSON.parse(String(h.state.meta[0]?.value))).toEqual(["two", "three"]);
  });

  it("returns 404 without writing pins when the story disappears after locking", async () => {
    h.state.deleteArticleAfterLock = true;
    const response = await request("/api/admin/insights/one", {
      method: "PATCH",
      body: JSON.stringify({
        ...article("one"),
        pinned: true,
      }),
    });

    expect(response.status).toBe(404);
    expect(JSON.parse(String(h.state.meta[0]?.value))).toEqual(["one", "two", "three"]);
  });

  it("removes a deleted story from the singleton list", async () => {
    const response = await request("/api/admin/insights/one", { method: "DELETE" });

    expect(response.status).toBe(204);
    expect(h.state.articles.map((row) => row.id)).toEqual(["two", "three"]);
    expect(JSON.parse(String(h.state.meta[0]?.value))).toEqual(["two", "three"]);
  });
});
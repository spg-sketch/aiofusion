import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";

vi.mock("@workspace/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const schema = await import("@workspace/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await client.exec(`
    CREATE TABLE howto_entries (
      id varchar PRIMARY KEY, title text NOT NULL, description text NOT NULL,
      type varchar NOT NULL, read_time varchar NOT NULL, display_order integer NOT NULL DEFAULT 0,
      status varchar NOT NULL DEFAULT 'draft', body jsonb NOT NULL DEFAULT '[]',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz
    );
    CREATE TABLE howto_migration_ledger (id varchar PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE insight_media (
      id varchar PRIMARY KEY, file_name text NOT NULL, content_type varchar NOT NULL,
      size_bytes text NOT NULL, object_path text, public_url text NOT NULL, alt_text text NOT NULL DEFAULT '',
      created_by_user_id varchar, created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE insight_articles (
      id varchar PRIMARY KEY, slug varchar NOT NULL UNIQUE, title text NOT NULL,
      excerpt text NOT NULL DEFAULT '', tag varchar NOT NULL DEFAULT 'Article', external_url text,
      date_published varchar, date_modified varchar, body jsonb NOT NULL DEFAULT '[]',
      cover_media_id varchar, cover_image_url text, cover_image_alt text NOT NULL DEFAULT '',
      seo_title text, seo_description text, focus_keyphrase varchar, canonical_url text,
      status varchar NOT NULL DEFAULT 'published', created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
    );
    CREATE TABLE platform_meta (key varchar PRIMARY KEY, value text NOT NULL);
    CREATE TABLE support_faq (
      id serial PRIMARY KEY, category varchar NOT NULL, question text NOT NULL, answer text NOT NULL,
      keywords text NOT NULL DEFAULT '', display_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  return { ...(await vi.importActual<object>("@workspace/db/schema")), db, pool: { end: () => client.close() } };
});

vi.mock("../middleware/platform-auth", () => ({
  requirePlatformAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {
  db,
  howtoEntriesTable,
  howtoMigrationLedgerTable,
  insightArticlesTable,
  insightMediaTable,
  platformMetaTable,
  supportFaqTable,
} from "@workspace/db";
import howtoRouter from "./howto";
import georgeSearchRouter from "./george-search";
import { guideExcerpt, guideParagraphs, supportScore } from "../lib/george-guides";
import insightsRouter from "./insights";
import { applyHowtoSeedMigration, HOWTO_SEED_MIGRATION_ID } from "../lib/howto-seed-migration";
import { HOWTO_INITIAL_SEEDS } from "../lib/howto-seeds";
import { ORIGINAL_GUIDANCE_PAGE_BASELINE } from "../lib/howto-seed-baseline";
import * as schema from "@workspace/db/schema";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.header("x-role") ?? "reader";
    (req as any).account = { role };
    (req as any).log = { warn: vi.fn() };
    next();
  });
  app.use("/api", howtoRouter);
  app.use("/api", georgeSearchRouter);
  app.use("/api", insightsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  await db.delete(platformMetaTable);
  await db.delete(supportFaqTable);
  await db.delete(howtoEntriesTable);
  await db.delete(howtoMigrationLedgerTable);
  await db.delete(insightArticlesTable);
  await db.delete(insightMediaTable);
});

afterEach(() => vi.restoreAllMocks());

const entry = (id: string, status: "draft" | "published" = "published") => ({
  id,
  title: `Title ${id}`,
  description: "Description",
  type: "Guide" as const,
  readTime: "3 min read",
  displayOrder: 1,
  status,
  body: [{ type: "paragraph" as const, runs: [{ text: "Content" }] }],
});

async function request(path: string, options: RequestInit = {}, role = "reader") {
  return fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", "x-role": role, ...(options.headers ?? {}) },
  });
}

describe("How-to CMS", () => {
  it("searches written guide material, not media URLs, and keeps long excerpts around the matching instructions", () => {
    const paragraphs = guideParagraphs([
      { type: "image", mediaId: "asset", altText: "Measurement screenshot", caption: "Select the saved audit" },
      { type: "video", url: "https://not-indexed.example/video", caption: "A walkthrough of reports" },
      { type: "paragraph", runs: [{ text: "Open " }, { text: "the editor", href: "https://not-indexed.example/link" }] },
    ]);
    expect(paragraphs).toEqual(["Measurement screenshot", "Select the saved audit", "A walkthrough of reports", "Open the editor"]);
    expect(supportScore("How do I use measurement?", "", "", paragraphs.join("\n"))).toBeGreaterThan(0);
    const excerpt = guideExcerpt("zebrametric?", [`${"Introduction ".repeat(100)}zebrametric instructions ${"More detail ".repeat(100)}`], "Description");
    expect(excerpt.length).toBeLessThanOrEqual(600);
    expect(excerpt).toContain("zebrametric instructions");
  });
  it("defaults existing and new published guides into George and applies opt-out, edits, unpublishing and deletion immediately", async () => {
    // Legacy rows have no preference and must be included without backfilling.
    await db.insert(howtoEntriesTable).values(entry("existing"));
    const found = async (q: string) => ((await (await request(`/support/search?q=${encodeURIComponent(q)}`)).json()) as {
      results: Array<{ guideId?: string; source: string; question: string; answer: string }>;
    }).results;
    expect((await found("existing")).map((r: any) => r.guideId)).toEqual(["existing"]);
    const created = await request("/admin/howto", { method: "POST", body: JSON.stringify({
      ...entry("new-guide"), body: [
        { type: "heading", runs: [{ text: "Project configuration" }] },
        { type: "step", number: 1, title: "Enable measurement", runs: [{ text: "Use the zebrametric selector." }] },
        { type: "list", items: ["Verify the calibration dial"] },
        { type: "image", mediaId: "unused", altText: "A screenshot" },
      ].filter((b) => b.type !== "image"),
    }) }, "admin");
    expect(created.status).toBe(201);
    expect(((await created.json()) as { includeInGeorge: boolean }).includeInGeorge).toBe(true);
    const matches = await found("zebrametric");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ source: "guide", guideId: "new-guide", answer: expect.stringContaining("zebrametric") });
    expect((await found("calibration"))[0].guideId).toBe("new-guide");
    const patch = (data: object) => request("/admin/howto/new-guide", { method: "PATCH", body: JSON.stringify(data) }, "admin");
    expect((await patch({ includeInGeorge: false })).status).toBe(200);
    expect(await found("zebrametric")).toEqual([]);
    const library = (await (await request("/howto/new-guide")).json()) as { includeInGeorge: boolean };
    expect(library.includeInGeorge).toBe(false); // Opt-out does not remove the library entry.
    expect((await patch({ title: "Updated guide" })).status).toBe(200);
    expect(await found("zebrametric")).toEqual([]); // Unrelated edits preserve opt-out.
    expect((await patch({ includeInGeorge: true, body: [{ type: "paragraph", runs: [{ text: "New foxmetric instructions" }] }] })).status).toBe(200);
    expect(await found("zebrametric")).toEqual([]);
    expect((await found("foxmetric"))[0].question).toBe("Updated guide");
    await patch({ status: "draft" });
    expect(await found("foxmetric")).toEqual([]);
    await patch({ status: "published" });
    expect((await found("foxmetric"))[0].guideId).toBe("new-guide");
    await request("/admin/howto/new-guide", { method: "DELETE" }, "admin");
    expect(await found("foxmetric")).toEqual([]);
    expect(await db.select().from(platformMetaTable).where(eq(platformMetaTable.key, "howto:george:new-guide"))).toEqual([]);
  });

  it("never exposes drafts, excluded guides or inactive FAQs through anonymous support search", async () => {
    await db.insert(howtoEntriesTable).values([entry("published"), entry("draft-guide", "draft"), entry("excluded")]);
    await request("/admin/howto/excluded", { method: "PATCH", body: JSON.stringify({ includeInGeorge: false }) }, "admin");
    await db.insert(supportFaqTable).values([
      { question: "Title FAQ", answer: "Current answer", category: "General" },
      { question: "Title secret FAQ", answer: "Do not expose", category: "General", isActive: false },
    ]);
    const response = await request("/support/search?q=Title", { headers: { "x-role": "reader" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { results } = (await response.json()) as { results: Array<{ source: string; guideId?: string }> };
    expect(results.map((r: any) => r.source).sort()).toEqual(["faq", "guide"]);
    expect(results.find((r) => r.source === "guide")?.guideId).toBe("published");
    expect((await request("/support/search")).status).toBe(400);
    expect((await request(`/support/search?q=${"x".repeat(501)}`)).status).toBe(400);
    expect((await request("/admin/howto/published", {
      method: "PATCH", body: JSON.stringify({ includeInGeorge: false }),
    }, "reader")).status).toBe(403);
    expect((await request("/admin/howto/published", {
      method: "PATCH", body: JSON.stringify({ includeInGeorge: "false" }),
    }, "admin")).status).toBe(400);
  });
  it("matches the frozen source-GuidancePage metadata and complete converted body snapshot", () => {
    const snapshot = HOWTO_INITIAL_SEEDS.map((seed) => ({
      id: seed.id,
      title: seed.title,
      description: seed.description,
      type: seed.type,
      readTime: seed.readTime,
      displayOrder: seed.displayOrder,
      bodySha256: createHash("sha256").update(JSON.stringify(seed.body)).digest("hex"),
    }));
    expect(snapshot).toEqual(ORIGINAL_GUIDANCE_PAGE_BASELINE);
  });

  it("exposes only published entries anonymously, in display order, and keeps Insights readable", async () => {
    await db.insert(howtoEntriesTable).values([
      { ...entry("later"), displayOrder: 20 },
      { ...entry("hidden", "draft"), displayOrder: 0 },
      { ...entry("first"), displayOrder: 1 },
    ]);
    const response = await request("/howto");
    expect(response.status).toBe(200);
    expect((await response.json() as Array<{ id: string }>).map(({ id }) => id)).toEqual(["first", "later"]);
    expect((await request("/howto/hidden")).status).toBe(404);

    await db.insert(insightArticlesTable).values({
      id: "story", slug: "story", title: "Existing story", body: [], status: "published",
      coverImageUrl: null, coverImageAlt: "", excerpt: "", tag: "Article",
    });
    const insights = await request("/insights");
    expect(insights.status).toBe(200);
    expect((await insights.json() as Array<{ id: string; title: string }>)[0]).toMatchObject({
      id: "story", title: "Existing story",
    });
  });

  it("allows CMS CRUD to authorised editors and denies other authenticated roles", async () => {
    expect((await request("/admin/howto", {}, "member")).status).toBe(403);
    const created = await request("/admin/howto", {
      method: "POST",
      body: JSON.stringify(entry("example", "draft")),
    }, "admin");
    expect(created.status).toBe(201);
    const row = await created.json() as { createdAt: string; publishedAt: string | null };
    expect(row.createdAt).toEqual(expect.any(String));
    expect(row.publishedAt).toBeNull();
    expect((await request("/admin/howto/example", {}, "admin")).status).toBe(200);
    const published = await request("/admin/howto/example", {
      method: "PATCH", body: JSON.stringify({ status: "published", title: "Updated" }),
    }, "admin");
    expect(published.status).toBe(200);
    expect((await published.json() as { publishedAt: string }).publishedAt).toEqual(expect.any(String));
    expect((await request("/howto/example")).status).toBe(200);
    expect((await request("/admin/howto/example", { method: "DELETE" }, "admin")).status).toBe(204);
  });

  it("keeps the shared image library and upload endpoints restricted to editorial identities", async () => {
    for (const role of ["member", "agency", "client", "content", "viewer", "billing"]) {
      expect((await request("/admin/insights/media", {}, role)).status).toBe(403);
      expect((await request("/admin/insights/media/asset", { method: "DELETE" }, role)).status).toBe(403);
      expect((await request("/storage/uploads/direct", {
        method: "POST", body: JSON.stringify({}),
      }, role)).status).toBe(403);
      expect((await request("/storage/uploads/request-url", {
        method: "POST", body: JSON.stringify({}),
      }, role)).status).toBe(403);
    }
  });

  it("returns 409 for a duplicate id even when Drizzle wraps the database error", async () => {
    const input = entry("duplicate-guide", "draft");
    expect((await request("/admin/howto", { method: "POST", body: JSON.stringify(input) }, "admin")).status).toBe(201);
    const duplicate = await request("/admin/howto", {
      method: "POST", body: JSON.stringify({ ...input, title: "Do not overwrite" }),
    }, "admin");
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: "A How-to entry with that id already exists" });
    expect((await db.select().from(howtoEntriesTable).where(eq(howtoEntriesTable.id, input.id)))[0]?.title).toBe(input.title);
  });

  it("rejects invalid identifiers, untrusted links, unknown fields, and missing image media", async () => {
    expect((await request("/admin/howto", {
      method: "POST", body: JSON.stringify({ ...entry("Bad ID"), id: "Bad ID" }),
    }, "admin")).status).toBe(400);
    expect((await request("/admin/howto", {
      method: "POST",
      body: JSON.stringify({ ...entry("bad-link"), body: [{ type: "video", url: "javascript:alert(1)" }] }),
    }, "admin")).status).toBe(400);
    expect((await request("/admin/howto", {
      method: "POST",
      body: JSON.stringify({ ...entry("bad-media"), body: [{ type: "image", mediaId: "missing", altText: "" }] }),
    }, "admin")).status).toBe(400);
    expect((await request("/admin/howto", {
      method: "POST", body: JSON.stringify({ ...entry("extra"), createdAt: "2000-01-01T00:00:00.000Z" }),
    }, "admin")).status).toBe(400);
    expect((await request("/admin/howto", {
      method: "POST",
      body: JSON.stringify({
        ...entry("extra-block"),
        body: [{ type: "paragraph", runs: [{ text: "Text", html: "<b>unsafe</b>" }] }],
      }),
    }, "admin")).status).toBe(400);
  });

  it("accepts active shared image references and resolves their public URL", async () => {
    await db.insert(insightMediaTable).values({
      id: "valid-image", fileName: "guide.png", contentType: "image/png", sizeBytes: "12",
      publicUrl: "/api/storage/objects/guide.png", objectPath: "/objects/guide.png", altText: "Library alt",
    });
    const response = await request("/admin/howto", {
      method: "POST",
      body: JSON.stringify({
        ...entry("image-entry"),
        body: [{ type: "image", mediaId: "valid-image", altText: "", url: "https://attacker.test/fake.png" }],
      }),
    }, "admin");
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      body: [{ type: "image", mediaId: "valid-image", altText: "Library alt", url: "/api/storage/objects/guide.png" }],
    });
  });

  it("soft-deletes only unused media, preserving the stored file metadata", async () => {
    await db.insert(insightMediaTable).values({
      id: "asset", fileName: "asset.png", contentType: "image/png", sizeBytes: "12",
      publicUrl: "/asset", objectPath: "/asset", altText: "asset",
    });
    expect((await request("/admin/insights/media/asset", { method: "DELETE" }, "admin")).status).toBe(204);
    const [stored] = await db.select().from(insightMediaTable);
    expect(stored).toMatchObject({ fileName: "asset.png", publicUrl: "/asset", objectPath: "/asset" });
    expect(stored?.deletedAt).toBeInstanceOf(Date);
    expect(await (await request("/admin/insights/media", {}, "admin")).json()).toEqual([]);
    expect((await request("/admin/insights/media/asset", { method: "DELETE" }, "admin")).status).toBe(404);
  });

  for (const status of ["draft", "published"] as const) {
    for (const reference of ["howto-body", "insights-body", "insights-cover"] as const) {
      it(`keeps images referenced by ${status} ${reference} available`, async () => {
        await db.insert(insightMediaTable).values({
          id: "asset", fileName: "asset.png", contentType: "image/png", sizeBytes: "12",
          publicUrl: "/asset", objectPath: "/asset", altText: "asset",
        });
        if (reference === "howto-body") {
          await db.insert(howtoEntriesTable).values({
            ...entry("uses-asset", status), body: [{ type: "image", mediaId: "asset", altText: "A picture" }],
          });
        } else {
          await db.insert(insightArticlesTable).values({
            id: "uses-asset", slug: "uses-asset", title: "Image story", status,
            body: reference === "insights-body" ? [{ type: "image", mediaId: "asset", altText: "" }] : [],
            coverMediaId: reference === "insights-cover" ? "asset" : null,
          });
        }
        const removal = await request("/admin/insights/media/asset", { method: "DELETE" }, "admin");
        expect(removal.status).toBe(409);
        expect(await removal.json()).toEqual({ error: "Media is still referenced by Insights or How-to content" });
        expect((await db.select().from(insightMediaTable))[0]?.deletedAt).toBeNull();
        expect(await (await request("/admin/insights/media", {}, "admin")).json()).toMatchObject([{ id: "asset" }]);
      });
    }
  }

  for (const cms of ["howto", "insights"] as const) {
    for (const method of ["POST", "PATCH"] as const) {
      for (const winner of ["save", "delete"] as const) {
        it(`protects ${cms} images when ${method} and removal overlap with ${winner} committing first`, async () => {
          await db.insert(insightMediaTable).values({
            id: "race-image", fileName: "synthetic.png", contentType: "image/png", sizeBytes: "12",
            publicUrl: "/synthetic.png", objectPath: "/objects/synthetic.png", altText: "",
          });
          const imageBody = [{ type: "image", mediaId: "race-image", altText: "" }];
          const createInput = cms === "howto"
            ? entry("race-content", "draft")
            : { slug: "race-content", title: "Synthetic story", status: "draft", body: [], tag: "Article", excerpt: "", coverImageAlt: "" };
          let contentId = "race-content";
          if (method === "PATCH") {
            const created = await request(`/admin/${cms}`, {
              method: "POST", body: JSON.stringify(createInput),
            }, "admin");
            expect(created.status).toBe(201);
            contentId = (await created.json() as { id: string }).id;
          }
          let reached!: () => void;
          let release!: () => void;
          const atBoundary = new Promise<void>(resolve => { reached = resolve; });
          const barrier = new Promise<void>(resolve => { release = resolve; });
          const transaction = db.transaction.bind(db);
          // PGlite serializes transactions on one connection and cannot model
          // PostgreSQL advisory locks. Hold the save at either boundary to
          // exercise both commit orders, including Insights' unlocked preflight.
          vi.spyOn(db, "transaction").mockImplementationOnce(async (callback, config) => {
            if (winner === "delete") {
              reached();
              await barrier;
              return transaction(callback, config);
            }
            return transaction(async tx => {
              const result = await callback(tx);
              reached();
              await barrier;
              return result;
            }, config);
          });
          const save = request(`/admin/${cms}${method === "PATCH" ? `/${contentId}` : ""}`, {
            method,
            body: JSON.stringify(method === "PATCH" && cms === "howto" ? { body: imageBody } : { ...createInput, body: imageBody }),
          }, "admin");
          await Promise.race([
            atBoundary,
            save.then(async response => {
              throw new Error(`Save returned before the transaction barrier: ${response.status} ${await response.text()}`);
            }),
          ]);
          const removal = request("/admin/insights/media/race-image", { method: "DELETE" }, "admin");
          if (winner === "delete") {
            try {
              expect((await removal).status).toBe(204);
            } finally {
              release();
            }
            expect((await save).status).toBe(400);
          } else {
            release();
            expect((await save).status).toBe(method === "POST" ? 201 : 200);
            expect((await removal).status).toBe(409);
          }
          const [media] = await db.select().from(insightMediaTable);
          expect(media?.deletedAt === null).toBe(winner === "save");
          const saved = cms === "howto"
            ? await db.select({ body: howtoEntriesTable.body }).from(howtoEntriesTable)
            : await db.select({ body: insightArticlesTable.body }).from(insightArticlesTable);
          expect(saved.some(row => row.body.some(block => block.type === "image" && block.mediaId === "race-image")))
            .toBe(winner === "save");
        });
      }
    }
  }

  it("runs the initial seed once and never restores edited or deleted seed rows", async () => {
    expect(await applyHowtoSeedMigration(db)).toEqual({ applied: true, seeded: 6 });
    const seeds = await db.select().from(howtoEntriesTable);
    expect(seeds).toHaveLength(6);
    await db.update(howtoEntriesTable).set({ title: "Editorial change" })
      .where(eq(howtoEntriesTable.id, "getting-started"));
    await db.delete(howtoEntriesTable).where(eq(howtoEntriesTable.id, "aio-diagnostic"));
    expect(await applyHowtoSeedMigration(db)).toEqual({ applied: false, seeded: 0 });
    expect((await db.select().from(howtoEntriesTable).where(eq(howtoEntriesTable.id, "getting-started")))[0]?.title)
      .toBe("Editorial change");
    expect(await db.select().from(howtoEntriesTable).where(eq(howtoEntriesTable.id, "aio-diagnostic"))).toHaveLength(0);
  });

  it("treats a recorded migration with zero entry rows as an intentional empty rerun", async () => {
    await db.insert(howtoMigrationLedgerTable).values({ id: HOWTO_SEED_MIGRATION_ID });
    expect(await applyHowtoSeedMigration(db)).toEqual({ applied: false, seeded: 0 });
    expect(await db.select().from(howtoEntriesTable)).toHaveLength(0);
  });

  describe("missing How-to schema", () => {
    let client: PGlite;
    beforeAll(async () => {
      client = new PGlite();
      // WASM startup can exceed assertion deadlines under release-suite load.
      await client.waitReady;
    }, 120000);
    afterAll(async () => { await client?.close(); });

    it("reports the Drizzle push prerequisite when required How-to tables are missing", async () => {
      const emptyDatabase = drizzlePGlite(client, { schema });
      await expect(applyHowtoSeedMigration(emptyDatabase)).rejects.toThrow(/tables are missing.*db run push/i);
    });
  });
});
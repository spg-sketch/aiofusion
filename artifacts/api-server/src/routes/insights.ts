import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  CreateAdminInsightBody,
  CreateAdminInsightMediaBody,
  RequestInsightUploadUrlBody,
  UpdateAdminInsightBody,
} from "@workspace/api-zod";
import {
  db,
  insightArticlesTable,
  insightMediaTable,
  type InsightArticleRow,
  type InsightBlock,
} from "@workspace/db";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { InsightObjectStorage } from "../lib/insight-object-storage";
import { canAccessInsightsCms } from "../lib/insights-cms-access";
import {
  addOrRemoveHomepagePin,
  HomepagePinLimitError,
  lockHomepagePins,
  readHomepagePinnedIds,
  writeHomepagePinnedIds,
} from "../lib/insights-homepage-pins";

const router = Router();
const storage = new InsightObjectStorage();
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_CMS_IMAGE_BYTES = 6 * 1024 * 1024;
const HIDDEN_PUBLIC_INSIGHT_SLUGS = new Set([
  "earned-media",
  "geo-signals",
  "seo-aio",
  "setup-guide",
  "authority-report",
  "optimiser-guide",
  "media-research-guide",
]);

export function detectRasterBytes(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

function requireInsightsAdmin(req: Request, res: Response): boolean {
  if (!canAccessInsightsCms(req.account?.role, req.platformUser)) {
    res.status(403).json({ error: "Insights CMS access required" });
    return false;
  }
  return true;
}

function validSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function canonicalFor(slug: string): string {
  const domain = (process.env["CANONICAL_DOMAIN"] || "aiofusion.ai")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${domain}/insights/${slug}`;
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return true;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

async function validMediaReferences(
  coverMediaId: string | null | undefined,
  body: InsightBlock[],
): Promise<boolean> {
  const ids = new Set<string>();
  if (coverMediaId) ids.add(coverMediaId);
  for (const block of body) {
    if (block.type === "image") ids.add(block.mediaId);
  }
  if (ids.size === 0) return true;
  const media = await db
    .select({ id: insightMediaTable.id, contentType: insightMediaTable.contentType })
    .from(insightMediaTable)
    .where(isNull(insightMediaTable.deletedAt));
  const allowed = new Map(media.map((item) => [item.id, item.contentType]));
  return [...ids].every((id) => ALLOWED_IMAGE_TYPES.has(allowed.get(id) ?? ""));
}

async function serializeArticles(rows: InsightArticleRow[], pinnedIds?: string[]) {
  const media = await db
    .select()
    .from(insightMediaTable)
    .where(isNull(insightMediaTable.deletedAt));
  const byId = new Map(media.map((item) => [item.id, item]));
  const homepagePins = new Set(pinnedIds ?? await readHomepagePinnedIds());
  return rows.map((row) => ({
    ...row,
    pinned: homepagePins.has(row.id) && row.status === "published",
    coverImageUrl:
      (row.coverMediaId ? byId.get(row.coverMediaId)?.publicUrl : null) ?? null,
    body: (row.body as InsightBlock[]).map((block) => {
      if (block.type !== "image") return block;
      const item = byId.get(block.mediaId);
      return {
        ...block,
        url: item?.publicUrl ?? null,
        altText: block.altText || item?.altText || "",
      };
    }),
  }));
}

router.get("/insights", async (_req, res) => {
  const pinnedIds = await readHomepagePinnedIds();
  const rows = await db
    .select()
    .from(insightArticlesTable)
    .where(eq(insightArticlesTable.status, "published"))
    .orderBy(desc(insightArticlesTable.datePublished), desc(insightArticlesTable.createdAt));
  res.json(await serializeArticles(
    rows.filter((row) => !HIDDEN_PUBLIC_INSIGHT_SLUGS.has(row.slug)),
    pinnedIds,
  ));
});

router.get("/insights/:slug", async (req, res) => {
  if (HIDDEN_PUBLIC_INSIGHT_SLUGS.has(req.params["slug"] ?? "")) {
    res.status(404).json({ error: "Story not found" });
    return;
  }
  const pinnedIds = await readHomepagePinnedIds();
  const [row] = await db
    .select()
    .from(insightArticlesTable)
    .where(and(
      eq(insightArticlesTable.slug, req.params["slug"] ?? ""),
      eq(insightArticlesTable.status, "published"),
    ))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Story not found" });
    return;
  }
  res.json((await serializeArticles([row], pinnedIds))[0]);
});

router.get("/admin/insights", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const pinnedIds = await readHomepagePinnedIds();
  const rows = await db
    .select()
    .from(insightArticlesTable)
    .orderBy(desc(insightArticlesTable.updatedAt));
  res.json(await serializeArticles(rows, pinnedIds));
});

router.post("/admin/insights", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const parsed = CreateAdminInsightBody.safeParse(req.body);
  if (!parsed.success || !validSlug(parsed.data.slug)) {
    res.status(400).json({ error: "Invalid story" });
    return;
  }
  const input = parsed.data;
  const body = input.body as InsightBlock[];
  if (
    !isHttpUrl(input.externalUrl) ||
    !isHttpUrl(input.canonicalUrl) ||
    !(await validMediaReferences(input.coverMediaId, body))
  ) {
    res.status(400).json({ error: "Invalid story links or media references" });
    return;
  }
  try {
    const id = randomUUID();
    const row = await db.transaction(async (tx) => {
      await lockHomepagePins(tx);
      const pinnedIds = await readHomepagePinnedIds(tx);
      const nextPinnedIds = addOrRemoveHomepagePin(
        pinnedIds,
        id,
        input.status === "published" && input.pinned === true,
      );
      const { pinned: _pinned, ...articleInput } = input;
      const [created] = await tx
        .insert(insightArticlesTable)
        .values({
          ...articleInput,
          body,
          coverImageUrl: null,
          id,
          canonicalUrl: input.canonicalUrl || canonicalFor(input.slug),
          publishedAt: input.status === "published" ? new Date() : null,
        })
        .returning();
      await writeHomepagePinnedIds(tx, nextPinnedIds);
      return created!;
    });
    res.status(201).json((await serializeArticles([row]))[0]);
  } catch (error) {
    if (error instanceof HomepagePinLimitError) {
      res.status(409).json({ error: error.message });
      return;
    }
    req.log.warn({ err: error }, "Unable to create Insights story");
    res.status(409).json({ error: "A story with that slug already exists" });
  }
});

router.patch("/admin/insights/:id", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const parsed = UpdateAdminInsightBody.safeParse(req.body);
  if (!parsed.success || !validSlug(parsed.data.slug)) {
    res.status(400).json({ error: "Invalid story" });
    return;
  }
  const input = parsed.data;
  const body = input.body as InsightBlock[];
  if (
    !isHttpUrl(input.externalUrl) ||
    !isHttpUrl(input.canonicalUrl) ||
    !(await validMediaReferences(input.coverMediaId, body))
  ) {
    res.status(400).json({ error: "Invalid story links or media references" });
    return;
  }
  const idParam = req.params["id"];
  const articleId = Array.isArray(idParam) ? idParam[0] ?? "" : idParam ?? "";
  try {
    const row = await db.transaction(async (tx) => {
      await lockHomepagePins(tx);
      // Re-read after taking the singleton lock. A delete can commit between
      // an unlocked preflight read and this transaction; in that case there
      // is no article to update and, importantly, no pin metadata to write.
      const [existing] = await tx
        .select()
        .from(insightArticlesTable)
        .where(eq(insightArticlesTable.id, articleId))
        .limit(1);
      if (!existing) return null;

      const pinnedIds = await readHomepagePinnedIds(tx);
      const existingPinned = pinnedIds.includes(existing.id);
      const requestedPinned = input.pinned === undefined ? existingPinned : input.pinned;
      const nextPinnedIds = addOrRemoveHomepagePin(
        pinnedIds,
        existing.id,
        input.status === "published" && requestedPinned === true,
      );
      const { pinned: _pinned, ...articleInput } = input;
      const [updated] = await tx
        .update(insightArticlesTable)
        .set({
          ...articleInput,
          body,
          coverImageUrl: null,
          canonicalUrl: input.canonicalUrl || canonicalFor(input.slug),
          updatedAt: new Date(),
          publishedAt:
            input.status === "published"
              ? existing.publishedAt ?? new Date()
              : existing.publishedAt,
        })
        .where(eq(insightArticlesTable.id, existing.id))
        .returning();
      await writeHomepagePinnedIds(tx, nextPinnedIds);
      return updated!;
    });
    if (!row) {
      res.status(404).json({ error: "Story not found" });
      return;
    }
    res.json((await serializeArticles([row]))[0]);
  } catch (error) {
    if (error instanceof HomepagePinLimitError) {
      res.status(409).json({ error: error.message });
      return;
    }
    req.log.warn({ err: error }, "Unable to update Insights story");
    res.status(409).json({ error: "A story with that slug already exists" });
  }
});

router.delete("/admin/insights/:id", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const idParam = req.params["id"];
  const articleId = Array.isArray(idParam) ? idParam[0] ?? "" : idParam ?? "";
  await db.transaction(async (tx) => {
    await lockHomepagePins(tx);
    const pinnedIds = await readHomepagePinnedIds(tx);
    await tx
      .delete(insightArticlesTable)
      .where(eq(insightArticlesTable.id, articleId));
    await writeHomepagePinnedIds(tx, addOrRemoveHomepagePin(pinnedIds, articleId, false));
  });
  res.status(204).end();
});

router.get("/admin/insights/media", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const rows = await db
    .select()
    .from(insightMediaTable)
    .where(isNull(insightMediaTable.deletedAt))
    .orderBy(desc(insightMediaTable.createdAt));
  res.json(rows);
});

router.post("/admin/insights/media/metadata", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const parsed = CreateAdminInsightMediaBody.safeParse(req.body);
  if (
    !parsed.success ||
    !ALLOWED_IMAGE_TYPES.has(parsed.data.contentType) ||
    !parsed.data.objectPath ||
    parsed.data.publicUrl !== parsed.data.objectPath.replace(/^\/objects\//, "/api/storage/objects/")
  ) {
    res.status(400).json({ error: "Invalid image metadata" });
    return;
  }
  const detectedContentType = await storage.detectRasterContentType(parsed.data.objectPath);
  if (!detectedContentType || detectedContentType !== parsed.data.contentType) {
    res.status(400).json({ error: "Uploaded file is not a valid PNG, JPEG or WEBP image" });
    return;
  }
  const [row] = await db
    .insert(insightMediaTable)
    .values({
      ...parsed.data,
      contentType: detectedContentType,
      createdByUserId: req.platformUser?.id ?? null,
    })
    .onConflictDoUpdate({
      target: insightMediaTable.id,
      set: {
        fileName: parsed.data.fileName,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes,
        objectPath: parsed.data.objectPath,
        publicUrl: parsed.data.publicUrl,
        altText: parsed.data.altText,
        deletedAt: null,
      },
    })
    .returning();
  res.status(201).json(row);
});

router.post("/storage/uploads/request-url", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const parsed = RequestInsightUploadUrlBody.safeParse(req.body);
  if (!parsed.success || !ALLOWED_IMAGE_TYPES.has(parsed.data.contentType)) {
    res.status(400).json({ error: "Only PNG, JPEG and WEBP uploads are allowed" });
    return;
  }
  res.json(await storage.createUploadTarget());
});

router.post("/storage/uploads/direct", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const input = req.body as Record<string, unknown>;
  const name = typeof input["name"] === "string" ? input["name"].trim() : "";
  const contentType = typeof input["contentType"] === "string" ? input["contentType"] : "";
  const encoded = typeof input["dataBase64"] === "string" ? input["dataBase64"] : "";
  const declaredSize = typeof input["size"] === "number" ? input["size"] : 0;
  if (
    !name ||
    !ALLOWED_IMAGE_TYPES.has(contentType) ||
    !Number.isSafeInteger(declaredSize) ||
    declaredSize < 1 ||
    declaredSize > MAX_CMS_IMAGE_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    res.status(400).json({ error: "Only PNG, JPEG and WEBP images up to 6 MB are allowed" });
    return;
  }
  const bytes = Buffer.from(encoded, "base64");
  const detectedType = detectRasterBytes(bytes);
  if (bytes.length !== declaredSize || detectedType !== contentType) {
    res.status(400).json({ error: "The uploaded file does not match its image type" });
    return;
  }

  const id = randomUUID();
  const objectPath = `/objects/database/${id}`;
  const publicUrl = `/api/storage/objects/database/${id}`;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(insightMediaTable)
      .values({
        id,
        fileName: name,
        contentType: detectedType,
        sizeBytes: String(bytes.length),
        objectPath,
        publicUrl,
        altText: name,
        createdByUserId: req.platformUser?.id ?? null,
      })
      .returning();
    await tx.execute(sql`
      INSERT INTO insight_media_blobs (id, data)
      VALUES (${id}, ${bytes})
    `);
    return created!;
  });
  res.status(201).json(row);
});

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  const raw = req.params.path;
  const relative = Array.isArray(raw) ? raw.join("/") : raw;
  const objectPath = `/objects/${relative ?? ""}`;
  const [media] = await db
    .select()
    .from(insightMediaTable)
    .where(and(eq(insightMediaTable.objectPath, objectPath), isNull(insightMediaTable.deletedAt)))
    .limit(1);
  if (!media || !ALLOWED_IMAGE_TYPES.has(media.contentType)) {
    res.status(404).end();
    return;
  }
  if (media.objectPath === `/objects/database/${media.id}`) {
    const result = await db.execute(sql`
      SELECT data FROM insight_media_blobs WHERE id = ${media.id} LIMIT 1
    `);
    const stored = (result as unknown as { rows: Array<{ data: Uint8Array }> }).rows[0];
    if (!stored?.data) {
      res.status(404).end();
      return;
    }
    const bytes = Buffer.from(stored.data);
    if (detectRasterBytes(bytes) !== media.contentType) {
      res.status(415).end();
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.end(bytes);
    return;
  }
  const response = await storage.download(objectPath);
  if (!response.ok) {
    res.status(response.status === 404 ? 404 : 502).end();
    return;
  }
  res.status(200);
  const contentLength = response.headers.get("content-length");
  res.setHeader("Content-Type", media.contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
});

export default router;
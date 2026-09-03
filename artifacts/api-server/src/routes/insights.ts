import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Router, type Request, type Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
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

const router = Router();
const storage = new InsightObjectStorage();
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function requireInsightsAdmin(req: Request, res: Response): boolean {
  if (req.account?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
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

async function serializeArticles(rows: InsightArticleRow[]) {
  const media = await db
    .select()
    .from(insightMediaTable)
    .where(isNull(insightMediaTable.deletedAt));
  const byId = new Map(media.map((item) => [item.id, item]));
  return rows.map((row) => ({
    ...row,
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
  const rows = await db
    .select()
    .from(insightArticlesTable)
    .where(eq(insightArticlesTable.status, "published"))
    .orderBy(desc(insightArticlesTable.datePublished), desc(insightArticlesTable.createdAt));
  res.json(await serializeArticles(rows));
});

router.get("/insights/:slug", async (req, res) => {
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
  res.json((await serializeArticles([row]))[0]);
});

router.get("/admin/insights", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const rows = await db
    .select()
    .from(insightArticlesTable)
    .orderBy(desc(insightArticlesTable.updatedAt));
  res.json(await serializeArticles(rows));
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
    const [row] = await db
      .insert(insightArticlesTable)
      .values({
        ...input,
        body,
        coverImageUrl: null,
        id: randomUUID(),
        canonicalUrl: input.canonicalUrl || canonicalFor(input.slug),
        publishedAt: input.status === "published" ? new Date() : null,
      })
      .returning();
    res.status(201).json((await serializeArticles([row!]))[0]);
  } catch (error) {
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
  const [existing] = await db
    .select()
    .from(insightArticlesTable)
    .where(eq(insightArticlesTable.id, articleId))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Story not found" });
    return;
  }
  try {
    const [row] = await db
      .update(insightArticlesTable)
      .set({
        ...input,
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
    res.json((await serializeArticles([row!]))[0]);
  } catch (error) {
    req.log.warn({ err: error }, "Unable to update Insights story");
    res.status(409).json({ error: "A story with that slug already exists" });
  }
});

router.delete("/admin/insights/:id", requirePlatformAuth, async (req, res) => {
  if (!requireInsightsAdmin(req, res)) return;
  const idParam = req.params["id"];
  const articleId = Array.isArray(idParam) ? idParam[0] ?? "" : idParam ?? "";
  await db
    .delete(insightArticlesTable)
    .where(eq(insightArticlesTable.id, articleId));
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
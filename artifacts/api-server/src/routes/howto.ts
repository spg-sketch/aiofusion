import { Router, type Request, type Response } from "express";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  CreateAdminHowtoBody,
  UpdateAdminHowtoBody,
} from "@workspace/api-zod";
import {
  db,
  howtoEntriesTable,
  platformMetaTable,
  insightArticlesTable,
  insightMediaTable,
  type HowtoBlock,
} from "@workspace/db";
import { requirePlatformAuth } from "../middleware/platform-auth";
import { canAccessInsightsCms } from "../lib/insights-cms-access";
import { lockSharedMediaReferences } from "../lib/shared-media-reference-lock";
import { excludedGeorgeGuideIds, GEORGE_GUIDE_PREFIX, setGeorgeGuidePreference } from "../lib/george-guides";

const router = Router();
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BODY_FIELDS = new Set(["title", "description", "type", "readTime", "displayOrder", "status", "body", "includeInGeorge"]);

function hasDatabaseCode(error: unknown, code: string): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const nested = current as { code?: unknown; cause?: unknown; originalError?: unknown };
    if (nested.code === code) return true;
    current = nested.cause ?? nested.originalError;
  }
  return false;
}

function authorized(req: Request, res: Response): boolean {
  if (!canAccessInsightsCms(req.account?.role, req.platformUser)) {
    res.status(403).json({ error: "Insights CMS access required" });
    return false;
  }
  return true;
}

function httpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validBody(blocks: HowtoBlock[]): boolean {
  return blocks.every((block) => {
    if (block.type === "video") return httpsUrl(block.url);
    if (block.type === "heading" || block.type === "paragraph" || block.type === "tip" || block.type === "step") {
      return block.runs.every((run) => !run.href || httpsUrl(run.href));
    }
    return true;
  });
}

function stripResolvedImageUrls(blocks: HowtoBlock[]): HowtoBlock[] {
  return blocks.map((block) => {
    if (block.type !== "image") return block;
    const { url: _url, ...stored } = block;
    return stored;
  });
}

async function hasValidImageReferences(tx: any, body: HowtoBlock[]): Promise<boolean> {
  const mediaIds = [...new Set(body.flatMap((block) => block.type === "image" ? [block.mediaId] : []))];
  if (!mediaIds.length) return true;
  const rows = await tx.select({ id: insightMediaTable.id, contentType: insightMediaTable.contentType })
    .from(insightMediaTable)
    .where(isNull(insightMediaTable.deletedAt)) as Array<{ id: string; contentType: string }>;
  const allowed = new Map(rows.map((row) => [row.id, row.contentType]));
  return mediaIds.every((id) => IMAGE_TYPES.has(allowed.get(id) ?? ""));
}

function entryId(req: Request): string {
  const id = req.params["id"];
  return Array.isArray(id) ? id[0] ?? "" : id ?? "";
}

async function serializeEntry(entry: typeof howtoEntriesTable.$inferSelect, excluded = new Set<string>()) {
  const imageIds = [...new Set(entry.body.flatMap((block) => block.type === "image" ? [block.mediaId] : []))];
  const media = imageIds.length
    ? await db.select({ id: insightMediaTable.id, publicUrl: insightMediaTable.publicUrl, altText: insightMediaTable.altText })
      .from(insightMediaTable)
    .where(and(isNull(insightMediaTable.deletedAt), inArray(insightMediaTable.id, imageIds)))
    : [];
  const byId = new Map(media.map((row) => [row.id, row]));
  return {
    ...entry,
    includeInGeorge: !excluded.has(entry.id),
    body: entry.body.map((block) => {
      if (block.type !== "image") return block;
      const asset = byId.get(block.mediaId);
      return { ...block, url: asset?.publicUrl ?? null, altText: block.altText || asset?.altText || "" };
    }),
  };
}

function requestBodyIsStrict(input: unknown, allowed: Set<string>): boolean {
  return typeof input === "object" && input !== null && !Array.isArray(input) &&
    Object.keys(input).every((key) => allowed.has(key));
}

function rawBodyIsStrict(input: unknown): boolean {
  if (!Array.isArray(input)) return false;
  const objectWithOnly = (value: unknown, fields: string[]): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).every((key) => fields.includes(key));
  return input.every((block) => {
    if (!objectWithOnly(block, [
      "type", "runs", "number", "title", "items", "mediaId", "altText", "caption", "url",
    ]) || typeof block.type !== "string") return false;
    let allowed: string[];
    if (["heading", "paragraph", "tip"].includes(block.type)) allowed = ["type", "runs"];
    else if (block.type === "step") allowed = ["type", "number", "title", "runs"];
    else if (block.type === "list") allowed = ["type", "items"];
    else if (block.type === "image") allowed = ["type", "mediaId", "altText", "caption", "url"];
    else if (block.type === "video") allowed = ["type", "url", "caption"];
    else return false;
    if (!objectWithOnly(block, allowed)) return false;
    if (block.runs !== undefined) {
      if (!Array.isArray(block.runs) || !block.runs.every((run) =>
        objectWithOnly(run, ["text", "bold", "italic", "href"]),
      )) return false;
    }
    return true;
  });
}

router.get("/howto", async (_req, res) => {
  const rows = await db.select().from(howtoEntriesTable)
    .where(eq(howtoEntriesTable.status, "published"))
    .orderBy(asc(howtoEntriesTable.displayOrder), asc(howtoEntriesTable.id));
  const excluded = await excludedGeorgeGuideIds();
  res.json(await Promise.all(rows.map((row) => serializeEntry(row, excluded))));
});

router.get("/howto/:id", async (req, res) => {
  const [entry] = await db.select().from(howtoEntriesTable)
    .where(and(eq(howtoEntriesTable.id, entryId(req)), eq(howtoEntriesTable.status, "published")))
    .limit(1);
  if (!entry) {
    res.status(404).json({ error: "How-to entry not found" });
    return;
  }
  res.json(await serializeEntry(entry, await excludedGeorgeGuideIds()));
});

router.get("/admin/howto", requirePlatformAuth, async (req, res) => {
  if (!authorized(req, res)) return;
  const rows = await db.select().from(howtoEntriesTable)
    .orderBy(asc(howtoEntriesTable.displayOrder), asc(howtoEntriesTable.id));
  const excluded = await excludedGeorgeGuideIds();
  res.json(await Promise.all(rows.map((row) => serializeEntry(row, excluded))));
});

router.get("/admin/howto/:id", requirePlatformAuth, async (req, res) => {
  if (!authorized(req, res)) return;
  const [entry] = await db.select().from(howtoEntriesTable)
    .where(eq(howtoEntriesTable.id, entryId(req))).limit(1);
  if (!entry) {
    res.status(404).json({ error: "How-to entry not found" });
    return;
  }
  res.json(await serializeEntry(entry, await excludedGeorgeGuideIds()));
});

router.post("/admin/howto", requirePlatformAuth, async (req, res) => {
  if (!authorized(req, res)) return;
  const parsed = CreateAdminHowtoBody.safeParse(req.body);
  if (!parsed.success || !requestBodyIsStrict(req.body, new Set(["id", ...BODY_FIELDS])) ||
      !rawBodyIsStrict((req.body as Record<string, unknown>)?.["body"])) {
    res.status(400).json({ error: "Invalid How-to entry" });
    return;
  }
  const input = parsed.data;
  const { includeInGeorge = true, ...entryInput } = input;
  const body = stripResolvedImageUrls(input.body as HowtoBlock[]);
  if (!validBody(body)) {
    res.status(400).json({ error: "How-to links must use HTTPS" });
    return;
  }
  try {
    const created = await db.transaction(async (tx) => {
      await lockSharedMediaReferences(tx);
      if (!(await hasValidImageReferences(tx, body))) throw new Error("invalid-media");
      const now = new Date();
      const [entry] = await tx.insert(howtoEntriesTable).values({
        ...entryInput,
        body,
        createdAt: now,
        updatedAt: now,
        publishedAt: input.status === "published" ? now : null,
      }).returning();
      await setGeorgeGuidePreference(tx, entry!.id, includeInGeorge);
      return entry!;
    });
    res.status(201).json(await serializeEntry(created, await excludedGeorgeGuideIds()));
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-media") {
      res.status(400).json({ error: "How-to entry references an invalid or deleted image" });
      return;
    }
    if (hasDatabaseCode(error, "23505")) {
      res.status(409).json({ error: "A How-to entry with that id already exists" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/howto/:id", requirePlatformAuth, async (req, res) => {
  if (!authorized(req, res)) return;
  const parsed = UpdateAdminHowtoBody.safeParse(req.body);
  if (!parsed.success || !requestBodyIsStrict(req.body, BODY_FIELDS) || Object.keys(req.body ?? {}).length === 0 ||
      ("body" in req.body && !rawBodyIsStrict((req.body as Record<string, unknown>)["body"]))) {
    res.status(400).json({ error: "Invalid How-to update" });
    return;
  }
  const input = parsed.data;
  const { includeInGeorge, ...entryInput } = input;
  const body = input.body ? stripResolvedImageUrls(input.body as HowtoBlock[]) : undefined;
  if (body && !validBody(body)) {
    res.status(400).json({ error: "How-to links must use HTTPS" });
    return;
  }
  try {
    const entry = await db.transaction(async (tx) => {
      await lockSharedMediaReferences(tx);
      const [existing] = await tx.select().from(howtoEntriesTable)
        .where(eq(howtoEntriesTable.id, entryId(req))).limit(1);
      if (!existing) return null;
      const nextBody = body ?? existing.body;
      if (!(await hasValidImageReferences(tx, nextBody))) throw new Error("invalid-media");
      const now = new Date();
      const nextStatus = input.status ?? existing.status;
      const [updated] = await tx.update(howtoEntriesTable).set({
        ...entryInput,
        body: nextBody,
        updatedAt: now,
        publishedAt: nextStatus === "published" ? existing.publishedAt ?? now : existing.publishedAt,
      }).where(eq(howtoEntriesTable.id, existing.id)).returning();
      if (includeInGeorge !== undefined) await setGeorgeGuidePreference(tx, existing.id, includeInGeorge);
      return updated ?? null;
    });
    if (!entry) {
      res.status(404).json({ error: "How-to entry not found" });
      return;
    }
    res.json(await serializeEntry(entry, await excludedGeorgeGuideIds()));
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-media") {
      res.status(400).json({ error: "How-to entry references an invalid or deleted image" });
      return;
    }
    throw error;
  }
});

router.delete("/admin/howto/:id", requirePlatformAuth, async (req, res) => {
  if (!authorized(req, res)) return;
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx.delete(howtoEntriesTable)
      .where(eq(howtoEntriesTable.id, entryId(req))).returning({ id: howtoEntriesTable.id });
    if (row) await tx.delete(platformMetaTable).where(eq(platformMetaTable.key, `${GEORGE_GUIDE_PREFIX}${row.id}`));
    return row;
  });
  if (!deleted) {
    res.status(404).json({ error: "How-to entry not found" });
    return;
  }
  res.status(204).end();
});

export default router;
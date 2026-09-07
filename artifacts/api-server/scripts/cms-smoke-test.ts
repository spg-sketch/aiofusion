import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db,
  insightMediaTable,
  platformAccountsTable,
  platformCompaniesTable,
  platformSessionsTable,
} from "@workspace/db";
import { createPlatformSession } from "../src/lib/platform-auth";

const username = `cms-smoke-${randomUUID().slice(0, 8)}`;
const slug = `cms-publish-smoke-${randomUUID().slice(0, 8)}`;
let sid = "";
let mediaId = "";
let articleId = "";

try {
  await db.insert(platformAccountsTable).values({
    username,
    passwordHash: "disposable-smoke-test",
    role: "admin",
    status: "active",
  });
  await db.insert(platformCompaniesTable).values({
    slug: username,
    role: "admin",
    status: "active",
    setupComplete: true,
  });
  sid = await createPlatformSession(username);
  const authHeaders = {
    "content-type": "application/json",
    cookie: `aio_sid=${sid}`,
  };
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==",
    "base64",
  );

  const upload = await fetch("http://localhost:8080/api/storage/uploads/direct", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "cms-smoke.png",
      size: png.length,
      contentType: "image/png",
      dataBase64: png.toString("base64"),
    }),
  });
  const uploaded = await upload.json() as { id?: string; publicUrl?: string; error?: string };
  if (upload.status !== 201 || !uploaded.id || !uploaded.publicUrl) {
    throw new Error(`upload:${upload.status}:${uploaded.error || "invalid response"}`);
  }
  mediaId = uploaded.id;
  const image = await fetch(`http://localhost:8080${uploaded.publicUrl}`);
  if (
    image.status !== 200 ||
    image.headers.get("content-type") !== "image/png" ||
    (await image.arrayBuffer()).byteLength !== png.length
  ) {
    throw new Error(`image-read:${image.status}`);
  }

  const publish = await fetch("http://localhost:8080/api/admin/insights", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      slug,
      title: "CMS Publish Smoke Test",
      excerpt: "Temporary validation story",
      tag: "Insights",
      body: [{ type: "paragraph", text: "Validated" }],
      coverMediaId: mediaId,
      coverImageAlt: "Test image",
      status: "published",
    }),
  });
  const published = await publish.json() as { id?: string; status?: string; error?: string };
  if (publish.status !== 201 || !published.id || published.status !== "published") {
    throw new Error(`publish:${publish.status}:${published.error || "invalid response"}`);
  }
  articleId = published.id;
  const publicStory = await fetch(`http://localhost:8080/api/insights/${slug}`);
  if (publicStory.status !== 200) throw new Error(`public-story:${publicStory.status}`);

  console.log(JSON.stringify({
    uploadCreated: true,
    uploadedImageReadable: true,
    storyPublished: true,
    publishedStoryReadable: true,
  }));
} finally {
  if (articleId && sid) {
    await fetch(`http://localhost:8080/api/admin/insights/${articleId}`, {
      method: "DELETE",
      headers: { cookie: `aio_sid=${sid}` },
    });
  }
  if (mediaId) await db.delete(insightMediaTable).where(eq(insightMediaTable.id, mediaId));
  if (sid) await db.delete(platformSessionsTable).where(eq(platformSessionsTable.sid, sid));
  await db.delete(platformCompaniesTable).where(eq(platformCompaniesTable.slug, username));
  await db.delete(platformAccountsTable).where(eq(platformAccountsTable.username, username));
}
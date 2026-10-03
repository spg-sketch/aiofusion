import { test } from "node:test";
import assert from "node:assert/strict";
import { guides } from "./howto-review-content.mjs";
import { importDrafts, reviewDocument, validateCatalogue } from "./howto-review-batch.mjs";

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", ...headers },
});
function fixture({ uncertain = false, reject = false, mediaMissing = false, targetMissing = false, completed = [] } = {}) {
  const writes = [];
  const fetcher = async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith("/api/admin/howto") && options.method === "POST") {
      const entry = JSON.parse(options.body); writes.push(entry);
      if (uncertain) throw new Error("Lost connection after commit");
      if (reject) return json({}, 400);
      return json({ ...entry, publishedAt: null }, 201);
    }
    if (url.endsWith("/api/admin/howto")) {
      return json(writes.map((e) => ({ ...e, publishedAt: null, body: e.body.map((b) => b.type === "image" ? { ...b, url: "/images/test.webp" } : b) })), 200,
        targetMissing ? {} : { "X-Howto-Target": "development", "X-Howto-Batch-Completed": completed.join(",") });
    }
    if (url.endsWith("/api/admin/insights/media")) {
      return json(mediaMissing ? [] : ["article-1-pr-ai", "article-3-b2b-authority", "article-4-agentic-media"].map((id) => ({ id, publicUrl: "/images/test.webp", contentType: "image/webp" })));
    }
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } });
  };
  return { fetcher, writes };
}

test("complete catalogue has stable unique metadata, illustrations and no em dashes", () => {
  validateCatalogue();
  assert.ok(guides.length >= 25);
  const review = reviewDocument();
  for (const { entry } of guides) assert.ok(review.includes(entry.id));
  assert.equal((review.match(/\| \[ \] \|/g) || []).length, guides.length);
  assert.ok(review.includes("Not saved to a target"));
});
test("preview never POSTs or calls media mutation endpoints", async () => {
  const f = fixture();
  const result = await importDrafts({ target: "development", baseUrl: "https://dev.test", fetcher: f.fetcher });
  assert.equal(f.writes.length, 0);
  assert.equal(result.planned, guides.length);
});
test("completed and deliberately deleted entries remain skipped", async () => {
  const f = fixture({ completed: [guides[0].entry.id] });
  const result = await importDrafts({ target: "development", baseUrl: "https://dev.test", apply: true, fetcher: f.fetcher });
  assert.equal(result.skipped, 1);
  assert.equal(result.created, guides.length - 1);
  assert.equal(result.verifiedNewDrafts, guides.length - 1);
  assert.ok(f.writes.every((e) => e.status === "draft" && e.id !== guides[0].entry.id));
});
test("uncertain create stops without retry and a subsequent preview reconciles the ledger", async () => {
  const f = fixture({ uncertain: true });
  const result = await importDrafts({ target: "development", baseUrl: "https://dev.test", apply: true, fetcher: f.fetcher });
  assert.equal(f.writes.length, 1);
  assert.equal(result.uncertain, 1);
  const resumed = fixture({ completed: [guides[0].entry.id] });
  const preview = await importDrafts({ target: "development", baseUrl: "https://dev.test", fetcher: resumed.fetcher });
  assert.equal(preview.skipped, 1);
  assert.equal(resumed.writes.length, 0);
});
test("known rejection stops distinctly from uncertain outcomes", async () => {
  const f = fixture({ reject: true });
  const result = await importDrafts({ target: "development", baseUrl: "https://dev.test", apply: true, fetcher: f.fetcher });
  assert.equal(result.failed, 1); assert.equal(result.uncertain, 0); assert.equal(f.writes.length, 1);
});
test("target or media preflight failure cannot start writes", async () => {
  for (const flags of [{ targetMissing: true }, { mediaMissing: true }]) {
    const f = fixture(flags);
    await assert.rejects(importDrafts({ target: "development", baseUrl: "https://dev.test", apply: true, fetcher: f.fetcher }));
    assert.equal(f.writes.length, 0);
  }
  await assert.rejects(importDrafts({ target: "production", baseUrl: "https://live.test" }));
});
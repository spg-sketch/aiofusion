import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("real PostgreSQL accounting is shared across team sessions and two independent API processes", async ({ playwright }) => {
  let owner = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5000" });
  let editor = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5000" });
  let billing = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5000" });
  try {
    for (const [context, username] of [[owner, "other@example.invalid"], [editor, "editor-media@example.invalid"], [billing, "billing-media@example.invalid"]] as const) {
      const login = await context.post("/api/platform/login", { data: { username, password: "release-harness-password" } });
      expect(login.status()).toBe(200);
      // APIRequestContext does not send Secure cookies over HTTP loopback,
      // unlike the real browser. Use the real server-issued SID as its
      // supported Bearer credential; never inject test authentication headers.
      const sid = (await context.storageState()).cookies.find((cookie) => cookie.name === "aio_sid")?.value;
      expect(sid).toBeTruthy();
      const cookies = await context.storageState();
      await context.dispose();
      const authenticated = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5000", storageState: cookies, extraHTTPHeaders: { Authorization: `Bearer ${sid}` } });
      if (context === owner) owner = authenticated;
      else if (context === editor) editor = authenticated;
      else billing = authenticated;
    }
    expect((await billing.get("/api/store/media-db/contacts")).status()).toBe(403);
    const results = await (await owner.get("/api/store/media-db/search?type=contacts&scope=all&phrase=Batch")).json();
    const batch = { scope: "selected", type: "contacts", format: "csv", ids: results.results.map((row: { id: number }) => row.id) };
    expect(batch.ids).toHaveLength(25);
    const exportTo = (context: typeof owner, operationId: string, worker: "first" | "second") =>
      context.post("/api/store/media-db/export", { data: { ...batch, operationId }, headers: { "x-release-api-worker": worker } });
    const retryId = randomUUID();
    const identical = await Promise.all([exportTo(owner, retryId, "first"), exportTo(editor, retryId, "second")]);
    expect(identical.map((response) => response.status())).toEqual([200, 200]);
    expect((await (await editor.get("/api/store/media-db/export-allowance", { headers: { "x-release-api-worker": "second" } })).json()).remaining).toBe(75);
    const competing = await Promise.all(Array.from({ length: 5 }, (_, index) => exportTo(index % 2 ? owner : editor, randomUUID(), index % 2 ? "first" : "second")));
    expect(competing.filter((response) => response.status() === 200)).toHaveLength(3);
    expect(competing.filter((response) => response.status() === 429)).toHaveLength(2);
    expect((await exportTo(editor, retryId, "second")).status()).toBe(200);
    for (const worker of ["first", "second"]) {
      expect((await (await owner.get("/api/store/media-db/export-allowance", { headers: { "x-release-api-worker": worker } })).json()).remaining).toBe(0);
    }
  } finally {
    await owner.dispose();
    await editor.dispose();
    await billing.dispose();
  }
});
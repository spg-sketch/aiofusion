/**
 * Explicit, read-only retest of the real diagnostic handler.
 * No project ID or user identity: no saved audits, audit locks or usage records.
 * This invokes paid AI providers once; it is not an authentication/UI test.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import { writeFile } from "node:fs/promises";
import diagnosticRouter from "../src/routes/diagnostic";
import { pool } from "@workspace/db";

const [url, outputPath] = process.argv.slice(2);
if (!url || !outputPath) throw new Error("Usage: retest-website-audit.ts <public URL> <output JSON path>");
const target = new URL(url);
if (!["http:", "https:"].includes(target.protocol)) throw new Error("A public HTTP(S) URL is required.");

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  // Local CLI-only invocation. The application's authentication is unchanged.
  req.account = { username: "", role: "client" } as NonNullable<typeof req.account>;
  next();
});
app.use("/api", diagnosticRouter);
const server = app.listen(0, "127.0.0.1");
try {
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/api/diagnostic`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: target.href }),
    signal: AbortSignal.timeout(180_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Retest failed (${response.status}): ${result.error ?? "No result"}`);
  const record = {
    retestedAt: new Date().toISOString(),
    verificationScope: "Isolated invocation of the current diagnostic handler, before publication; not a published UI test.",
    inputUrl: target.href, originalAuditPreserved: true, result,
  };
  await writeFile(outputPath, JSON.stringify(record, null, 2));
  console.log(JSON.stringify({
    score: result.overallScore, provider: result.provider,
    categories: result.categories.map((category: { name: string; score: number; max: number }) => ({
      name: category.name, score: category.score, max: category.max,
    })),
    facts: result.pageFacts, warnings: result.warnings, outputPath,
  }, null, 2));
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}

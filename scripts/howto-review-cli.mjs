#!/usr/bin/env node
import { writeFile, mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guides } from "./howto-review-content.mjs";
import { importDrafts, reviewDocument, validateCatalogue } from "./howto-review-batch.mjs";

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  validateCatalogue();
  if (args.includes("--document")) {
    await writeFile(resolve(root, "docs/howto-review-checklist.md"), reviewDocument());
    console.log(`Prepared ${guides.length} guides and review checklist; no target reads or writes.`);
    return;
  }
  const target = args.includes("--target") ? value("--target") : undefined;
  const baseUrl = args.includes("--base-url") ? value("--base-url") : undefined;
  const apply = args.includes("--apply");
  if (!target || !baseUrl || (!apply && !args.includes("--preview"))) {
    throw new Error("Use --document, or --target development|staging --base-url ORIGIN --preview|--apply.");
  }
  const user = process.env.HOWTO_EDITOR_USERNAME;
  const password = process.env.HOWTO_EDITOR_PASSWORD;
  if (!user || !password) throw new Error("Existing editor credentials must be supplied through protected runtime configuration. No writes attempted.");
  const directory = resolve(root, "docs/howto-batch-runs");
  await mkdir(directory, { recursive: true });
  const summaryPath = resolve(directory, `${target}-${apply ? "apply" : "preview"}.json`);
  const save = async (summary) => {
    await writeFile(`${summaryPath}.tmp`, `${JSON.stringify(summary, null, 2)}\n`);
    await rename(`${summaryPath}.tmp`, summaryPath);
  };
  const summary = await importDrafts({ target, baseUrl, apply, credentials: { username: user, password }, onSummary: save });
  await writeFile(resolve(root, "docs/howto-review-checklist.md"), reviewDocument(summary));
  console.log(`Created ${summary.created}; skipped ${summary.skipped}; failed ${summary.failed}; uncertain ${summary.uncertain}; planned ${summary.planned}. Summary: ${summaryPath}`);
  if (summary.failed || summary.uncertain) process.exitCode = 1;
}
main().catch(() => {
  // Never log arbitrary network/authentication errors or credential values.
  console.error("How-to batch blocked or stopped. Verify explicit nonproduction target, existing editorial sign-in, shared media, and any recorded uncertain outcome. No automatic retry was made.");
  process.exitCode = 1;
});
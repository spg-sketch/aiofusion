#!/usr/bin/env tsx
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { db, pool } from "@workspace/db";
import { applyHowtoSeedMigration } from "../src/lib/howto-seed-migration";

async function main(): Promise<void> {
  try {
    const result = await applyHowtoSeedMigration(db);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
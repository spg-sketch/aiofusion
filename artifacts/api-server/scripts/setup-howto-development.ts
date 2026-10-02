#!/usr/bin/env tsx
import { assertHowtoDevelopmentTarget, createHowtoDevelopmentTables } from "../src/lib/howto-development-schema";

async function main(): Promise<void> {
  // Check before importing/connecting the database. Do not expose URL values.
  assertHowtoDevelopmentTarget(process.env);
  const { pool } = await import("@workspace/db");
  try {
    const client = await pool.connect();
    try {
      await createHowtoDevelopmentTables(client);
      process.stdout.write("How-to development tables ready; existing objects preserved.\n");
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  process.stderr.write("How-to development schema setup failed. Check development target and schema readiness; no production schema changes are permitted here.\n");
  process.exitCode = 1;
});
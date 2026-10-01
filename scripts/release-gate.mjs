#!/usr/bin/env node
import { runReleaseReadiness } from "./release-readiness.mjs";

// Explicit release:check is always fresh. It shares only serialization, never
// the approval fast path, with completion readiness.
try {
  const result = await runReleaseReadiness({ force: true });
  console.log(`\n[release] PASSED (${result.environment})`);
} catch (error) {
  console.error(`[release] FAILED: ${error instanceof Error ? error.message : "release validation failed"}`);
  process.exitCode = 1;
}
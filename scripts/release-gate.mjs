#!/usr/bin/env node
import { runReleaseGate } from "./release-lib.mjs";

const result = await runReleaseGate();
console.log(`\n[release] ${result.status.toUpperCase()} (${result.environment})`);
if (result.status !== "passed") {
  console.error(`[release] NO-GO: ${result.failedStage ?? "release validation failed"}`);
  process.exitCode = 1;
}
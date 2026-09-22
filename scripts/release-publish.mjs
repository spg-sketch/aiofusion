#!/usr/bin/env node
import { spawn } from "node:child_process";
import { runStagingPublication } from "./release-lib.mjs";

const [program, ...args] = process.argv.slice(2);

async function publish() {
  if (!program) {
    throw new Error("Usage: pnpm run release:publish -- <staging-publish-command> [arguments...]");
  }
  await new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      code === 0
        ? resolve()
        : reject(new Error(`Staging publication exited ${code ?? `by ${signal}`}.`));
    });
  });
}

try {
  await runStagingPublication({ publish });
  console.log("[release] Staging publication completed with current release evidence.");
} catch (error) {
  console.error(`[release] PUBLICATION BLOCKED: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
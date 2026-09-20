#!/usr/bin/env node
import { spawn } from "node:child_process";
import { getFreePort, stopChild, waitForHealth } from "./release-lib.mjs";

const port = await getFreePort();
const child = spawn(process.execPath, ["artifacts/api-server/dist/release-smoke.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "release-smoke",
    RELEASE_SMOKE_MODE: "1",
    PORT: String(port),
    DATABASE_URL: "postgresql://release_smoke:release_smoke@127.0.0.1:1/release_smoke",
    CANONICAL_DOMAIN: "127.0.0.1",
    SESSION_SECRET: "release-smoke-non-secret",
    ALLOWED_ORIGIN: `http://127.0.0.1:${port}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); process.stdout.write(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); process.stderr.write(chunk); });

try {
  await waitForHealth(`http://127.0.0.1:${port}/api/healthz`, { timeoutMs: 15_000 });
  console.log("[release-smoke] production bundle became ready");
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : error}\n${output.slice(-4000)}`);
} finally {
  await stopChild(child);
}
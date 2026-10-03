import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/security",
  testMatch: "*.spec.ts",
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: "docs/security/browser-results.json" }]],
  use: { baseURL: "http://127.0.0.1:5000", trace: "off", ...devices["Desktop Chrome"] },
  webServer: {
    command: "node tests/release/harness.mjs --security",
    url: "http://127.0.0.1:5000/api/healthz", reuseExistingServer: false,
    timeout: 240_000, gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
});
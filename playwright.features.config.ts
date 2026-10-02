import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/features",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: ".local/feature-test-reports/playwright", open: "never" }],
    ["json", { outputFile: ".local/feature-test-reports/features.json" }],
  ],
  outputDir: ".local/feature-test-reports/results",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{
    name: "feature-browser",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: {
    command: "node tests/release/harness.mjs --features",
    url: "http://127.0.0.1:5000/api/healthz",
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
});
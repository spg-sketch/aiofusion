import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/release",
  testMatch: "**/manual-contact-creation.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:5000", trace: "retain-on-failure" },
  projects: [{ name: "built-manual-contacts", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/release/harness.mjs --manual-contacts",
    url: "http://127.0.0.1:5000/api/healthz",
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
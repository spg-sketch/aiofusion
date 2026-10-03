import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/release",
  testMatch: "**/customer-media*.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:5000", trace: "retain-on-failure" },
  projects: [{ name: "customer-media", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/release/harness.mjs --customer-media",
    url: "http://127.0.0.1:5000/api/healthz",
    reuseExistingServer: process.env.AIO_CUSTOMER_MEDIA_RUNNING === "1",
    timeout: 180_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
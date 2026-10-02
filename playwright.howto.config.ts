import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/howto",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "howto-isolated", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/release/harness.mjs --howto",
    url: "http://127.0.0.1:5000/api/healthz",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
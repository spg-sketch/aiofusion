import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/release",
  testMatch: "**/media-research-pagination.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 180_000,
  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "release-media-research-regression",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: {
    command: "node tests/release/harness.mjs --media-research",
    url: "http://127.0.0.1:5000/api/healthz",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
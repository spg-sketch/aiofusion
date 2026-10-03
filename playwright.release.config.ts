import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/release",
   testIgnore: ["**/media-research-pagination.spec.ts", "**/manual-contact-creation.spec.ts"],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "release-critical",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: {
    command: "node tests/release/harness.mjs",
    url: "http://127.0.0.1:5000/api/healthz",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
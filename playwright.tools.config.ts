import { defineConfig } from "@playwright/test";
import features from "./playwright.features.config";

export default defineConfig({
  ...features,
  metadata: {
    environment: "Temporary local PostgreSQL, production-built app, synthetic active 60-day beta",
    realAiOptIn: process.env.AIO_FEATURE_LIVE_AI === "1",
    paymentsExcluded: true,
  },
  testMatch: ["audit-workflows.spec.ts", "tool-workflows.spec.ts"],
  reporter: [
    ["list"],
    ["html", { outputFolder: ".local/feature-test-reports/core/playwright", open: "never" }],
    ["json", { outputFile: ".local/feature-test-reports/core/features.json" }],
  ],
  outputDir: ".local/feature-test-reports/core/results",
  timeout: 180_000,
});
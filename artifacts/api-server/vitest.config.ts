import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // Raised from the 5 s default: PGlite+HTTP test files running concurrently
    // can delay dynamic imports in other test files; hookTimeout covers async
    // beforeEach/afterEach setup in the same scenarios.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

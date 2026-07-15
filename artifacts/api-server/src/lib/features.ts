/**
 * Feature flags — API server
 *
 * Each flag reads from a process env var (FEATURE_*).
 * Set the matching Replit secret to "true" to enable; absent or any other
 * value means disabled.
 *
 * Routes guarded by a disabled flag should return 404 (not 403) so the
 * existence of the route isn't revealed to callers.
 *
 * Adding a new flag:
 *   1. Add an entry here: myFeature: process.env.FEATURE_MY_FEATURE === "true"
 *   2. Guard the route: if (!features.myFeature) { res.sendStatus(404); return; }
 *   3. Add a matching client-side flag in artifacts/aio-fusion/src/lib/features.ts
 */
export const features = {
  aiCoverageSearch: process.env.FEATURE_AI_COVERAGE_SEARCH === "true",
} as const;

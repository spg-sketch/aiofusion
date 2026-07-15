/**
 * Feature flags — frontend
 *
 * Each flag reads from a Vite env var (VITE_FEATURE_*).
 * To enable a feature in Replit: add the env var as a secret and set it to "true",
 * then restart the frontend workflow.
 * To disable: remove the secret or set it to anything other than "true".
 *
 * Adding a new flag:
 *   1. Add an entry here: myFeature: import.meta.env.VITE_FEATURE_MY_FEATURE === "true"
 *   2. Guard the UI: {FEATURES.myFeature && <MyComponent />}
 *   3. Add a matching server-side flag in artifacts/api-server/src/lib/features.ts
 *      if the feature also needs a new API route guarded.
 */
export const FEATURES = {
  aiCoverageSearch: import.meta.env.VITE_FEATURE_AI_COVERAGE_SEARCH === "true",
} as const;

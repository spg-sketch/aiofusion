---
name: AIO Fusion testing and release checks
description: Vitest testing gotchas and keeping release validation reliable under PGlite load.
---

# Testing and release checks

Vitest is the test runner. `pnpm --filter @workspace/api-server run test` (node env) and `pnpm --filter @workspace/aio-fusion run test` (jsdom env) both work; a combined `test` validation command runs both.

**Gotchas worth keeping:**
- To unit-test functions in `api-server/src/routes/llm-check.ts`, mock `@anthropic-ai/sdk` with `vi.hoisted` + `vi.mock` (the SDK client is constructed internally from env vars, so there is no DI seam). `createAnthropicClient` reads `process.env` at call time, so deleting the env vars in a test forces the no-credentials fallback path without mocking.
- jsdom does not implement `window.scrollTo`; `LlmCheckPage` calls it when opening a saved audit. Stub it in the test setup file or you get "Not implemented" noise.
- `LlmCheckPage` renders a saved audit when given `pendingAuditId` matching an entry in `localStorage` key `aio.savedAudits.<clientId>` — the clean seam for backward-compat render tests without faking a network audit.

- **react-qr-code bundled d.ts breaks under @types/react 19** (TS2607/TS2786 on `<QRCode>`): its ambient class-component declaration clashes; fix by casting the default import to a function-component type in MfaPanels.tsx — `pnpm dedupe` does NOT fix this one.
- **Change-password route tests**: the shared test app in platform-login-signup.test.ts injects `req.account = null`; authed routes need a per-suite server that resolves the sid (cookie or Bearer) via getPlatformSessionAccount.
- **Native V8 worker crashes are not assertion failures:** parallel Vitest can rarely abort inside `ThreadIsolation::UnregisterWasmAllocation`, followed by `ERR_IPC_CHANNEL_CLOSED`. Treat this as runtime instability only when the same revision passes the release gate and affected focused suites.

Size the release API stage for the whole suite, not only its longest test. Keep release-only file concurrency separate from the lower default used when typechecking runs concurrently. Move expensive module initialization out of short assertion timeouts and into bounded setup hooks, rather than weakening the assertions or removing the full-workbook regression.

**Why:** PGlite-backed files can queue for a long time. A whole-suite deadline equal to the workbook test budget killed healthy files, while concurrent module loading consumed a short authentication test's entire time budget without an assertion failure.

**How to apply:** When a release gate times out, distinguish stage, file, setup, and assertion deadlines in the logs before adjusting concurrency or test structure. Preserve the release guard and all tests.

When a small PGlite schema test passes alone but repeatedly hangs in its setup hook under the release suite's file concurrency, increasing that hook's timeout is not enough. Run it separately within the same mandatory, fail-closed API stage so neither the full suite nor the schema test is skipped.

**Why:** Contention caused the setup to exceed both the original and a longer timeout, while the identical test passed quickly without concurrent workers.

**How to apply:** Use an explicit exclusion from the parallel invocation followed by an isolated invocation joined with `&&`; keep both under the release stage's deadline and verify the gate includes the isolated result.

Media regression suites may share seeded contacts across cases. A test that marks a reused contact departed can make unrelated ranking and outreach tests fail later even when each passes alone.

**Why:** The departure event persists within the suite and silently changes what subsequent requests can recommend or contact.

**How to apply:** Give lifecycle/status tests their own contact and story identity instead of changing a shared fixture. If a whole file fails but its cases pass alone, inspect newly added tests for persistent fixture mutations before changing application logic.

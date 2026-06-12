---
name: AIO Fusion testing setup + pre-existing typecheck failures
description: How automated tests run in this pnpm monorepo (vitest), and which typecheck errors are pre-existing noise to ignore.
---

# Testing & typecheck state

Vitest is the test runner. `pnpm --filter @workspace/api-server run test` (node env) and `pnpm --filter @workspace/aio-fusion run test` (jsdom env) both work; a combined `test` validation command runs both.

**Gotchas worth keeping:**
- To unit-test functions in `api-server/src/routes/llm-check.ts`, mock `@anthropic-ai/sdk` with `vi.hoisted` + `vi.mock` (the SDK client is constructed internally from env vars, so there is no DI seam). `createAnthropicClient` reads `process.env` at call time, so deleting the env vars in a test forces the no-credentials fallback path without mocking.
- jsdom does not implement `window.scrollTo`; `LlmCheckPage` calls it when opening a saved audit. Stub it in the test setup file or you get "Not implemented" noise.
- `LlmCheckPage` renders a saved audit when given `pendingAuditId` matching an entry in `localStorage` key `aio.savedAudits.<clientId>` — the clean seam for backward-compat render tests without faking a network audit.

**Pre-existing typecheck failures (NOT caused by test work, do not chase under this task):**
- `pnpm run typecheck:libs` must run first (builds lib/* project refs) or api-server/aio-fusion typecheck reports phantom "no exported member" errors from `@workspace/db` / `@workspace/api-zod`.
- Even after building libs, these remain broken on main: `api-server/src/routes/diagnostic.ts` (`Property 'score'/'findings'/'recommendations' does not exist on type '{}'`) and `lib/replit-auth-web/src/use-auth.ts` (`Property 'env' does not exist on ImportMeta`).
- **Why:** so a future agent isn't alarmed by these and doesn't attribute them to new changes.

---
name: Release browser gate integrity
description: Fail-closed policy for release-critical browser validation.
---

Release-critical authentication, authorised workspace, and cross-workspace denial checks must run the production-built web and API against an isolated temporary database, with sign-in driven through the actual UI. Mocked API responses or direct fixture-only endpoint assertions do not qualify.

**Why:** A mocked browser fixture can pass while real session creation, cookie handling, UI handoff, project loading, or server-enforced workspace isolation is broken.

**How to apply:** Keep these journeys small and deterministic, use synthetic data only, fail when prerequisites are absent, and assert denial through an authenticated same-origin browser request.

Temporary-database browser servers need graceful termination rather than the test runner's default hard kill.

**Why:** Hard teardown bypassed the fixture's exit cleanup and left temporary PostgreSQL and email-capture directories behind during repeated runs.

**How to apply:** When a browser server owns disposable services or captured mail, explicitly allow SIGTERM cleanup before forced termination. Do not assume a passing test implies its fixtures were removed.

Run long multi-feature browser commands through the main agent's managed background shell, not a tester's detached shell process.

**Why:** The tester's foreground runner stopped an otherwise progressing batch at five minutes before the JSON reporter finished; its detached shell jobs did not survive, despite the main runner supporting managed background tasks.

**How to apply:** Keep one coherent run, preserve failed-run evidence before a focused retest, and exclude already-passed paid AI actions. A command timeout is incomplete evidence, not eight product failures.

Production-mode loopback browser fixtures can send Secure session cookies that a separate Playwright APIRequestContext does not send over HTTP.

**Why:** The actual sign-in and Hub succeeded, but subsequent APIRequestContext calls returned 401 until they were sent through the signed-in browser's same-origin fetch.

**How to apply:** For real session-isolation evidence, make authenticated requests in the browser context. Do not weaken cookie settings or copy bearer cookies into test output to work around transport differences.
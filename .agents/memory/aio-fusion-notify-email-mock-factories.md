---
name: notify-email test mock factories
description: Mock lib/notify-email in api-server tests so new email functions don't break unrelated suites
---
Rule: when mocking the notify-email module in tests, never enumerate its exports statically — use an `importOriginal`-based factory that auto-wraps every exported async function as a resolved no-op, adding named spies only where a test asserts call args.

**Why:** parallel tasks frequently add new email functions; static mock factories left the new names `undefined`, breaking many unrelated test files at completion validation.

**How to apply:** any test mocking notify-email should follow the auto-wrap pattern (precedent exists across the api-server route tests). Related: jsdom App-level tests need a raised testing-library `asyncUtilTimeout` (~5s) — lazy-page + effect chains exceed the 1s default under CI load.

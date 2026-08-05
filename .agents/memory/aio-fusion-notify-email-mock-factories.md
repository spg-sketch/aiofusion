---
name: notify-email test mock factories
description: Durable rule for mocking shared email modules in api-server tests
---
Rule: static export-list mocks of shared modules (like notify-email) break whenever another task adds a new export — the new name resolves to `undefined` and throws in unrelated test suites. Always use `importOriginal` auto-wrap factories instead.

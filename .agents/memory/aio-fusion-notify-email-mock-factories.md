---
name: notify-email test mock factories
description: Forward-compatible pattern for mocking lib/notify-email across api-server tests
---
Never enumerate notify-email exports statically in a mock factory. Use an `importOriginal`-based auto-wrap: iterate the real module's exports, wrap every async function as a resolved no-op, then override only the functions a specific test needs to spy on.

**Why it matters across sessions:** any task that adds a new email function to notify-email will silently break every test file that uses a static export list, even tests with no relation to the new function.

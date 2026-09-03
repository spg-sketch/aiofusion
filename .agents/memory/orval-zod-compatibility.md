---
name: Orval and Zod compatibility
description: Prevent generated API validators from targeting a different Zod major than the workspace runtime.
---

Pin Orval's Zod output to version 3 while the workspace catalog remains on Zod 3. Do not rely on Orval's automatic major-version detection after generator upgrades.

**Why:** A security-driven Orval update emitted Zod 4 standalone validators while runtime resolution remained on Zod 3. Typechecking, unit tests, and building passed, but the built API crashed during module initialization and publishing reported only a misleading port timeout.

**How to apply:** After Orval or Zod dependency changes, regenerate the clients, inspect representative email and URL validators, then start the built API and require the health endpoint to return 200 before publishing.
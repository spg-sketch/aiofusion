---
name: Playwright browser runtime
description: Environment-specific release-gate failure when the installed Playwright package has no matching Chromium binary.
---

If release-critical browser tests fail before navigation because the expected Playwright executable is missing, install the Chromium runtime matching the workspace's Playwright version before investigating application behavior.

**Why:** Replit workspace caches can retain older browser builds while dependency updates point Playwright at a newer revision. The browser journeys then fail at launch even when the application, production build, and test logic are healthy.

**How to apply:** Check whether the error names a missing path under the Playwright cache. Run the workspace Playwright browser installer for Chromium, then run the critical browser journeys again. Only debug app code if the browser launches and a journey itself fails.
---
name: Release browser gate integrity
description: Fail-closed policy for release-critical browser validation.
---

Release-critical authentication, authorised workspace, and cross-workspace denial checks must run the production-built web and API against an isolated temporary database, with sign-in driven through the actual UI. Mocked API responses or direct fixture-only endpoint assertions do not qualify.

**Why:** A mocked browser fixture can pass while real session creation, cookie handling, UI handoff, project loading, or server-enforced workspace isolation is broken.

**How to apply:** Keep these journeys small and deterministic, use synthetic data only, fail when prerequisites are absent, and assert denial through an authenticated same-origin browser request.
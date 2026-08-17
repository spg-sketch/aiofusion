---
name: Agency partner clients are permanently managed
description: Enforcement points and pitfalls for the "agency clients never hold credentials" rule
---

Clients whose parent account role is "agency" are permanently managed (no own sign-in).

**Why:** Product decision — agency partners resell; their clients must never receive or mint credentials; billing stays with the agency.

**How to apply:**
- Server predicate: `isAgencyPartnerClient(slug)` + `AGENCY_PARTNER_CLIENT_MESSAGE` in platform.ts. Any NEW credential-issuance route (password set/change/reset, access grant, invite-with-password) must call it — the UI hiding a button is not enforcement. Guarded today: accounts create (forced managed), accounts/password, accounts/access grant, change-password, request-set-password, reset-password (skips syncing password into partner slugs; 403 if the user's ONLY memberships are partner clients).
- Legacy parents with role "user" are deliberately NON-partner (old grant/welcome-email flows preserved).
- `/platform/me` returns top-level `agencyManagedClient`; client Session carries it; billing UI and the App billing-only gate check it.
- Testing gotcha: the platform middleware mock must also export `resolvePlatformAccount` (x-test-account header) for `/platform/me`-dependent tests.
- Known gap: pre-existing partner clients that already had a password and no managed meta flag can still log in (migration was out of scope).

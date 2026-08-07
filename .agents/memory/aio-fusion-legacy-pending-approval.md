---
name: Legacy pending_approval accounts
description: How legacy pending_approval account status is treated after the signup-approval flow was retired
---

**Rule:** `pending_approval` is a legacy status — nothing creates it anymore (signup creates active accounts). It is treated as ACTIVE in all login paths (password + Google/Microsoft SSO) and in session validation; only `suspended` blocks access. Admin "reject" of a pending account suspends it (never hard-delete, the account may hold data).

**Why:** SSO callbacks used to redirect legacy pending accounts to `/?oauth_status=pending`, which the frontend didn't handle — the user silently landed back on the sign-in form with no error (looked like login "did nothing"). Password login already admitted them, so the gate was inconsistent dead policy.

**How to apply:** When debugging "SSO succeeds but user isn't signed in", check the account's `status` in `platform_accounts`/`platform_companies` first (staging prod DB is queryable read-only). Never reintroduce a pending gate in one login path only; keep suspended checks in all paths and in `getPlatformSessionAccount`.

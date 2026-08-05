---
name: Intake prefill from account profile
description: How the intake form prefill from account type/profile must be gated
---
Fresh-intake prefill (brand: company name 4.1 + aiWebsite) reads `accountProfile` from `/api/platform/me` via `bootstrapAuth`.

**Rules:**
- Prefill only when `localStorage.getItem(currentIntakeKey()) === null`, applied inside the useState lazy initialisers (synchronous, one-shot) — never via effects, or the empty-blob save races it.
- `accountProfile` must be null for member sessions, impersonation, and offline/cache fallback; both prefill AND the brand/agency note must gate on non-null profile.
- App state must refresh the profile on every in-session login path (password/SSO/MFA/account-type completion) and clear it on logout/account switch — bootstrap-only population leaves same-session sign-ins without prefill and leaks stale profiles across accounts (a completion review caught both).

**Why:** saved answers must never be overwritten, and profile data must never cross account boundaries.

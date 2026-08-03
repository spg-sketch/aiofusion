---
name: AIO Fusion password reset lessons
description: Durable gotchas around credential changes, session revocation, and email-link URL params
---

- **Passwords live in TWO stores**: `platform_users` (primary) and legacy `platform_accounts` (slug login fallback). Any password change must sync both or slug-based login keeps accepting the old password.
- **Legacy sessions have `user_id = NULL`** and skip the session_version check. Revoking "all sessions" for a user must also delete sessions by each associated company slug, not just by user id.
- **Single-use tokens must be consumed atomically**: conditional `UPDATE ... WHERE used_at IS NULL AND expires_at > now() ... RETURNING` and require a row — a select-then-update pattern lets concurrent requests both succeed (code review rejects this).
- **App.tsx strips query params on mount**: the history-sync effect rewrites the URL via replaceState before lazy pages mount. Any email-link param must be captured in App.tsx state at load and passed down as a prop; reading `location.search` inside a lazy page is too late.
- **Shadcn `chart.tsx`/`input-otp.tsx` copies break under recharts v3 / newer types** — the fix (inline tooltip prop types, cast OTP context) must be applied to every artifact's copy of the component.

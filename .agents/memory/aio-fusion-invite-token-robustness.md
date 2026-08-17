---
name: Invite token robustness
description: Invite-link failure diagnosis — token normalisation, failure-reason logging, replaced-vs-revoked, base-URL fallback.
---

- All invite lookups go through `getValidInvite`/`getInviteInvalidReason` (team-invites.ts), which normalise the raw token (`normalizeInviteToken`: trim, decode ≤2x, strip wrapping quotes/brackets/trailing punctuation, extract 64-hex). Add new invite entry points through these helpers, never raw `eq(token)`.
- `getInviteInvalidReason` logs a `invite lookup failed` warn with reason/tokenPrefix/email — it is the single place failure logging lives; call it on any failed lookup (SSO path does).
- Reason `replaced` = revoked invite whose email has a newer pending invite in the same workspace; resend overwrites token in place, so an old resent link is `unknown` (message already points to newest email).
- **Why:** corporate scanners/email clients mangle links, and `getAppBaseUrl()` silently falling back to the hardcoded prod domain makes non-prod tokens never resolve. The fallback now logs a warning; CANONICAL_DOMAIN/REPLIT_DOMAINS must be set per environment.

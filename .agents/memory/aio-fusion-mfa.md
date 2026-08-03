---
name: AIO Fusion MFA (TOTP)
description: How two-factor login works — mandatory for master (admin) accounts, opt-in for others.
---

# AIO Fusion MFA

- TOTP (RFC 6238) implemented on node crypto in `api-server/src/lib/mfa.ts` — no external dependency. QR rendered client-side with `react-qr-code`.
- MFA state lives in **platform_meta** (`account:mfa:<username>`, JSON {secret, enabled, recoveryHashes}) — NOT platform_users columns. **Why:** works uniformly for legacy accounts (incl. the seeded master admin, which has no email/platform_users row) and needs no schema/PGlite fixture changes.
- Login two-step: after a correct password the server returns a stateless HMAC token (`mfaToken`, 10-min TTL, signed with SESSION_SECRET) instead of a session; `/platform/mfa/verify` or `/mfa/enable` exchanges it for the cookie. Both login branches (platform_users + legacy) go through `finishLoginOrChallenge`.
- Master = `role === "admin"` (normalizeRole). Masters: forced enrolment on first login, cannot disable. Others: opt-in via `MfaSecuritySection` on PlatformHomePage signed-in card.
- Recovery codes: 10 single-use, sha256-hashed; shown exactly once at enrolment.
- **How to apply:** SSO logins (Google/Microsoft) bypass this — they never hit `finishLoginOrChallenge`; adding MFA to SSO would need the same challenge in the OAuth callbacks.
- E2E-test with a disposable seeded admin row; note shell `$`-expansion mangles scrypt hashes when inlining them into `psql "$..."` commands — use execFileSync args.

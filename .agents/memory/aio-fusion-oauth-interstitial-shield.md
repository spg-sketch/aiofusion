---
name: OAuth interstitial vs Replit password shield
description: Why SSO hangs on "Completing sign-in, please wait…" on a password-protected deployment
---

# OAuth interstitial vs deployment password shield

The anti-prefetch OAuth callback flow (GET serves an auto-submit form → POST redeems the code) breaks when the deployment's visibility is **password/private**: Replit's `__replshield` 307-redirects requests it doesn't recognize, and the interstitial's form POST gets swallowed — the user is stuck on "Completing sign-in, please wait…" with the GET callback URL still in the address bar.

**Why:** the shield sits in front of every request; even when the GET passed (shield cookie present), the POST navigation can be intercepted and its body lost in the 307 → replit.com → back-to-GET dance.

**Second root cause (found after going Public):** the global CSP middleware sends `script-src 'self'`, which blocks the interstitial's inline auto-submit `<script>` in real browsers — the page hangs on "Completing sign-in…" even with the shield gone. curl tests pass because curl doesn't run JS. Fix: per-response crypto nonce added to the CSP header + `nonce` attr on the script (cspHeaderWithScriptNonce in middleware/csp.ts). Any future server-rendered inline script needs the same treatment.

**How to apply:** if SSO hangs on the interstitial in a deployed environment, first check deployment visibility (`getDeploymentInfo`) before debugging code. Fix = switch visibility to Public (app has its own auth). Local flow can be sanity-checked at localhost:8080 with curl: GET with matching `aio_ms_state` cookie returns the interstitial 200; POST with fake code redirects `code_already_used` in <0.3s.

Related: scanner UAs (Teams/Outlook Safe Links) get an empty 200 on GET; `token_exchange_failed` vs `code_already_used` distinguished via invalid_grant.

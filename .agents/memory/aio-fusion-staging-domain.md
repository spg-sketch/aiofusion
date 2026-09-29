---
name: Staging custom domain setup
description: Lessons from wiring staging.aiofusion.ai to the aio-fusion-staging deployment
---

- Replit custom domains need the A + TXT (replit-verify) records; the TXT must stay permanently for cert renewal. A CNAME cannot coexist with the TXT at the same hostname — never replace A+TXT with a CNAME.
- A domain verified *after* the last publish only starts serving on the next Republish; until then it shows Replit's "This app isn't live yet" 404 even with valid SSL.
- The Domains panel SSL status can stay red/stale after the cert is actually issued — verify with `curl -v https://<domain>` instead of trusting the UI.
- Deployment visibility can change; check current deployment metadata rather than assuming the historical password shield still applies.
- Environments (user asked to remember, CORRECTED): **THIS repl = `aio-fusion-staging`**, the feature-development/staging server. The beta site is on another Replit instance and was intended to have its own DB; beta/alpha promotion should not share databases or data. Do not assume this intended isolation matches the current runtime: a later startup change explicitly forced the staging deployment to use a beta-named connection. Verify the actual target before claiming staging has its own independent DB.
- User's key shared links (asked to remember): Roadmap = https://www.aiofusion.ai/roadmap.html ; Tasks/build plan = https://www.aiofusion.ai/build-plan.html (served from aio-fusion `public/`).

An exposed historical database-login address was confirmed to authenticate and to match the separate beta connection, not this staging deployment's main connection. Do not rotate the staging main database credential to fix that exposure.

**Why:** The value was labelled as a production-database identifier in an old tracked configuration entry, but credential matching showed it belongs to beta. A rotation against the wrong database would leave the exposure intact and could interrupt staging.

**How to apply:** Coordinate revocation or rotation with the beta database owner and every beta consumer before changing it. Do not put connection strings in tracked configuration, even in fields intended to contain only hostname fragments.

Deployment identity values must not be committed in `.replit` because the same source is promoted between the staging and production Repls.

**Why:** Replit's non-secret production environment operation persists values into `.replit`; a staging canonical there can travel with source and poison or block the live deployment.

**How to apply:** Keep `DEPLOYMENT_ENV` and `CANONICAL_DOMAIN` outside source control, set them separately for each deployment, and require the deployed API to fail startup when either is missing or mismatched.

Use the staging custom domain for attended Google sign-in, not automatically the primary Replit URL returned by deployment metadata.

**Why:** OAuth state cookies are host-bound. Starting on a Replit hostname and returning to a custom domain loses that cookie and produces a session-expired error before MFA is evaluated.

**How to apply:** Verify the deployed OAuth redirect destination without logging state or cookies. Keep the user's sign-in on that same hostname, and distinguish OAuth state failures from MFA recovery.

---
name: Staging custom domain setup
description: Lessons from wiring staging.aiofusion.ai to the aio-fusion-staging deployment
---

- Replit custom domains need the A + TXT (replit-verify) records; the TXT must stay permanently for cert renewal. A CNAME cannot coexist with the TXT at the same hostname — never replace A+TXT with a CNAME.
- A domain verified *after* the last publish only starts serving on the next Republish; until then it shows Replit's "This app isn't live yet" 404 even with valid SSL.
- The Domains panel SSL status can stay red/stale after the cert is actually issued — verify with `curl -v https://<domain>` instead of trusting the UI.
- Staging deployment is password-protected (replshield 307 redirect is expected, not an error).
- Environments (user asked to remember, CORRECTED): **THIS repl = `aio-fusion-staging`**, the feature-development/staging server with its own DB. The beta site is on another Replit instance with its own DB, and that beta instance will eventually become alpha. Promote source from staging to beta/alpha without sharing databases or data.
- User's key shared links (asked to remember): Roadmap = https://www.aiofusion.ai/roadmap.html ; Tasks/build plan = https://www.aiofusion.ai/build-plan.html (served from aio-fusion `public/`).

Deployment identity values must not be committed in `.replit` because the same source is promoted between the staging and production Repls.

**Why:** Replit's non-secret production environment operation persists values into `.replit`; a staging canonical there can travel with source and poison or block the live deployment.

**How to apply:** Keep `DEPLOYMENT_ENV` and `CANONICAL_DOMAIN` outside source control, set them separately for each deployment, and require the deployed API to fail startup when either is missing or mismatched.

---
name: Staging custom domain setup
description: Lessons about staging domains, production aliases, and live OAuth configuration
---

- Replit custom domains need the A + TXT (replit-verify) records; the TXT must stay permanently for cert renewal. A CNAME cannot coexist with the TXT at the same hostname — never replace A+TXT with a CNAME.
- A domain verified *after* the last publish only starts serving on the next Republish; until then it shows Replit's "This app isn't live yet" 404 even with valid SSL.
- The Domains panel SSL status can stay red/stale after the cert is actually issued — verify with `curl -v https://<domain>` instead of trusting the UI.
- Check the authoritative DNS zone against the intended hostname before suggesting any record change. The similarly named `.ai` and `.io` zones can appear in the same registrar UI, and the user confirmed a screenshot of the `.io` zone was mistaken for `.ai`.

**Why:** A verification record placed in the wrong zone cannot verify the live `.ai` domain, and changing that zone may disrupt an unrelated `.io` hostname.

**How to apply:** Compare public NS and the Replit-required TXT record against the actual zone in the screenshot. Treat a DNS table with no visible zone name as ambiguous; do not infer its domain from the user's current goal.
- Deployment visibility can change; check current deployment metadata rather than assuming the historical password shield still applies.
- The user clarified: "this isnt stagin anymore - its live." Treat this app as live, not staging.

**Why:** The user corrected the historical staging assumption after the live cutover.

**How to apply:** Keep development-preview verification separate from live publishing. Staging-labelled release checks do not prove the live publishing configuration. Verify the actual deployment mode and database target before making environment claims; never publish without approval.
- User's key shared links (asked to remember): Roadmap = https://www.aiofusion.ai/roadmap.html ; Tasks/build plan = https://www.aiofusion.ai/build-plan.html (served from aio-fusion `public/`).

An exposed historical database-login address was confirmed to authenticate and to match the separate beta connection, not this staging deployment's main connection. Do not rotate the staging main database credential to fix that exposure.

**Why:** The value was labelled as a production-database identifier in an old tracked configuration entry, but credential matching showed it belongs to beta. A rotation against the wrong database would leave the exposure intact and could interrupt staging.

**How to apply:** Coordinate revocation or rotation with the beta database owner and every beta consumer before changing it. Do not put connection strings in tracked configuration, even in fields intended to contain only hostname fragments.

For the domain cutover, the user chose this Replit project's main production database as the master and said the separate beta site/database is no longer needed. Do not migrate beta data into the new live site or block domain planning on a beta database rotation.

**Why:** The beta connection is separate from the database backing the version the user wants to launch.

**How to apply:** Confirm production-mode startup still targets this project's intended main database before changing DNS or Stripe mode. Treat revocation of the exposed beta login as separate security cleanup, not a production data migration.

Deployment identity values must not be committed in `.replit` because the same source is promoted between the staging and production Repls.

**Why:** Replit's non-secret production environment operation persists values into `.replit`; a staging canonical there can travel with source and poison or block the live deployment.

**How to apply:** Keep `DEPLOYMENT_ENV` and `CANONICAL_DOMAIN` outside source control, set them separately for each deployment, and require the deployed API to fail startup when either is missing or mismatched.

Use the staging custom domain for attended Google sign-in, not automatically the primary Replit URL returned by deployment metadata.

**Why:** OAuth state cookies are host-bound. Starting on a Replit hostname and returning to a custom domain loses that cookie and produces a session-expired error before MFA is evaluated.

**How to apply:** Verify the deployed OAuth redirect destination without logging state or cookies. Keep the user's sign-in on that same hostname, and distinguish OAuth state failures from MFA recovery.

A staging-looking hostname is not proof of a test-mode service after a production cutover. Both the staging custom domain and its older generated Replit domain can still reach the production API; `/api/healthz` may return 200 there while ordinary API routes reject the host with 421.

**Why:** The health route is deliberately exempt from the production host guard, so relying on it alone could send a Stripe test-card checkout to a live-mode service.

**How to apply:** Before any published-staging payment test, verify a harmless ordinary API route and the deployment's actual mode. If the host reaches production, stop; use a separately verified test-mode deployment, or explicitly offer the development preview as a less representative alternative. Do not repoint production domains just to run a test.

The production Google OAuth client must authorise the exact non-www canonical callback, including `/api/platform/auth/google/callback`. A registered `www` callback or older `/api/auth/google/callback` is not interchangeable. The user confirmed sign-in worked after adding the exact live URI in Google Auth Platform's existing web client.

**Why:** Checking the redirect generated by the app only proves what it sends, not what Google has authorised. Google returned `redirect_uri_mismatch` until its client allowed the exact URI.

**How to apply:** On this error, inspect Google's request details and compare `redirect_uri` character-for-character with the existing client's Authorised redirect URIs. Add the missing URI there, not under Authorised JavaScript origins; retain existing entries and verify a real live sign-in afterward.

For Microsoft sign-in, distinguish the interactive redirect phase from the server-side token exchange. Once the exact live callback is registered, a token-exchange `invalid_client` can mean the published app has an incorrect client secret even if Azure shows an unexpired secret and development credential checks pass. Rotate only the production client secret using the new Azure secret **Value**, not its Secret ID or display name; keep the client ID unchanged.

**Why:** Live interactive sign-in succeeded but code exchange failed until a newly created secret Value was saved in Publishing's production app secrets and the app was republished. An unexpired Azure entry did not prove Replit held its Value.

**How to apply:** Use bounded provider error-category logging without descriptions or credentials. Check the live build and API health after republishing, then confirm one real sign-in. Never ask for the Value in chat or replace the development secret while correcting production.

---
name: AIO Fusion Insights publishing and prerendering
description: How the database-backed Insights editor preserves crawlable static article HTML.
---

Published Insights content is authoritative in PostgreSQL, while the static frontend build requests the public Insights API and uses that snapshot to generate article HTML, metadata and sitemap entries.

**Why:** The public frontend is a static artifact, so browser-side fetching alone cannot make editorial changes visible to crawlers or visitors without JavaScript.

**How to apply:** Publish the API artifact before rebuilding the web artifact when editorial changes must be included in prerendered HTML. If the API cannot be reached during build, the build intentionally uses the checked-in story snapshot rather than emitting empty pages.

The Insights CMS allows existing platform admins plus users with an exact `@aiofusion.ai` email that is verified and linked to Google or Microsoft. Enforce this capability on the API and expose only the resulting server decision to the frontend.

**Why:** Email text alone is not proof that the company controls the identity, and a frontend-only guard would leave editorial APIs exposed.

**How to apply:** Keep CMS article and media mutations behind the shared server predicate. Password-only, unverified, subdomain, lookalike-domain and missing-user identities must fail closed.
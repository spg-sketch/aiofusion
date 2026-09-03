---
name: AIO Fusion Insights publishing and prerendering
description: How the database-backed Insights editor preserves crawlable static article HTML.
---

Published Insights content is authoritative in PostgreSQL, while the static frontend build requests the public Insights API and uses that snapshot to generate article HTML, metadata and sitemap entries.

**Why:** The public frontend is a static artifact, so browser-side fetching alone cannot make editorial changes visible to crawlers or visitors without JavaScript.

**How to apply:** Publish the API artifact before rebuilding the web artifact when editorial changes must be included in prerendered HTML. If the API cannot be reached during build, the build intentionally uses the checked-in story snapshot rather than emitting empty pages.
---
name: AIO Fusion Insights publishing and prerendering
description: How the database-backed Insights editor preserves crawlable static article HTML.
---

Keep platform How-to guidance separate from public Insights stories, even when the editorial identity and media library are shared.

**Why:** The user specified separate platform instructions, not new public marketing stories, SEO pages or broader staff account privileges.

**How to apply:** Reuse verified Insights editorial access without widening workspace/project access. How-to editorial changes should be available at runtime without adding guides to public Insights feeds or SEO builds.

Published Insights content is authoritative in PostgreSQL, while the static frontend build requests the public Insights API and uses that snapshot to generate article HTML, metadata and sitemap entries.

**Why:** The public frontend is a static artifact, so browser-side fetching alone cannot make editorial changes visible to crawlers or visitors without JavaScript.

**How to apply:** Publish the API artifact before rebuilding the web artifact when editorial changes must be included in prerendered HTML. Unavailable or invalid CMS input must fail the build, not silently substitute checked-in stories. A valid empty CMS snapshot is authoritative. Checked-in content is reserved for explicit offline fixtures.

Include only self-canonical local article pages in the sitemap, while retaining static HTML and source canonicals for syndicated articles.

**Why:** Advertising duplicate local URLs in the sitemap contradicts their canonical tags and confuses indexing signals.

**How to apply:** Compare sitemap article destinations with the canonical actually rendered in their HTML, using the same configured site origin.

Do not infer an article's original publication date from its import, build or render time. Undated legacy stories must remain visibly undated until an editor supplies a verified date; preserve historical dates rather than bulk-backfilling them.

**Why:** An import or page build is not evidence of publication, and fabricated freshness dates mislead readers and search engines.

**How to apply:** Require editorial verification at publishing boundaries, keep modification evidence server-owned, and use the same date values for visible time labels and structured data.

Public audience repositioning must not broaden business-buyer research into consumer claims or silently rewrite factual pullquotes. Preserve those quotations pending editorial approval, even when surrounding promotional copy becomes audience-neutral.

**Why:** The request to remove narrow website positioning explicitly excluded changing quotations and expanding the scope of research evidence.

**How to apply:** Keep stable article URLs and use explicit, exact-value CMS updates alongside checked-in copy changes; leave independently edited CMS fields for editorial review rather than applying a blanket replacement.

The Insights CMS allows existing platform admins plus users with an exact `@aiofusion.ai` email that is verified and linked to Google or Microsoft. Enforce this capability on the API and expose only the resulting server decision to the frontend.

**Why:** Email text alone is not proof that the company controls the identity, and a frontend-only guard would leave editorial APIs exposed.

**How to apply:** Keep CMS article and media mutations behind the shared server predicate. Password-only, unverified, subdomain, lookalike-domain and missing-user identities must fail closed.

Verified Google or Microsoft `@aiofusion.ai` identities sign into the existing Master workspace (`admin`) instead of creating customer workspaces. New staff receive the restricted Support membership and must complete Master MFA.

**Why:** The legacy Master data already belongs to `admin`; creating another Master would split client/project ownership. Automatic owner access would give every employee destructive privileges.

**How to apply:** Run staff routing after explicit invitation handling but before ordinary SSO account resolution. Preserve existing higher membership roles and expose a direct CMS entry point to eligible staff.

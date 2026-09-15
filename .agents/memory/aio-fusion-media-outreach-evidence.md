---
name: Media outreach evidence
description: Durable ownership, history, duplicate, and verification rules for article-level outreach and placements.
---

Outreach records belong to the project owner's workspace, even when an agency user performs the work. Snapshot the source article, contact, outlet, and exact target phrases when outreach is planned. Later edits or departures must not rewrite historical evidence.

**Why:** Live contact records and account relationships change, but placement evidence must remain attributable to the project and the exact phrases that motivated the pitch.

**How to apply:** Keep status changes auditable and serialize them with placement creation. Only placement evidence may produce `placed`. Treat repeated canonical URLs as revisions, reset user claims to unverified after edits, retain all prior claims and page checks, and derive `page_verified` facts only through the DNS-pinned safe fetch path.

Existing Earned Media Tracker rows are linked only by an explicit user selection. Never silently migrate an ambiguous tracker row into a placement.
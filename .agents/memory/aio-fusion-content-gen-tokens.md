---
name: AIO Fusion content generation token limits
description: Generated JSON needs wrapper headroom; incomplete drafts must fail visibly within one bounded request
---

# Content generation token limits

## The rule
Generation limits must include headroom for the full JSON wrapper, not just the body word count. Treat an incomplete model response as a visible failure while retaining the user's source notes. Do not automatically retry an expensive generation inside the same request.

**Why:** An earlier low Article cap truncated Claude's JSON mid-body and real users saw unreadable drafts. A later Article Media Pitch failure had the same user-visible error, although its exact cause was not confirmed from logs. Automatic retries can outlive the browser deadline and incur another model call without delivering a usable result.

**How to apply:** When raising word targets or adding content types, allow wrapper overhead above the body estimate. Log safe metadata such as stop reason and output length, never source notes or model text. Keep transport and model deadlines bounded so errors appear while the user can still retry.

Full-draft generation needs a separate time budget from small field edits. Coordinate the server deadline, browser transport deadline and app-owned run deadline in that order, with room to deliver the server's terminal response.

**Why:** A reported Creator timeout exposed a shared short model cutoff followed by two independent browser cutoffs. Extending only the model deadline would still discard a completed slow draft in the browser.

**How to apply:** Change all three boundaries together for full drafts, retain shorter edit budgets, and verify both slow success and bounded failure without automatic retries or loss of the original editor content.

# Intake data in scripts

Outside the request lifecycle, do not assume a top-level company name or sector from a raw intake blob. Read its structured form data or use the server's DB-backed helpers where appropriate.

**Why:** The store API returns a raw blob rather than a flattened company profile, so demo scripts can silently send incomplete authority context if they guess its shape.

**How to apply:** Inspect the current intake schema before constructing synthetic generation requests; never use real client data for diagnostic calls.

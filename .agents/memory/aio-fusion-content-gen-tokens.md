---
name: AIO Fusion content generation token limits
description: Generated JSON needs wrapper headroom; incomplete drafts must fail visibly within one bounded request
---

# Content generation token limits

## The rule
Generation limits must include headroom for the full JSON wrapper, not just the body word count. Treat an incomplete model response as a visible failure while retaining the user's source notes. Do not automatically retry an expensive generation inside the same request.

**Why:** An earlier low Article cap truncated Claude's JSON mid-body and real users saw unreadable drafts. A later Article Media Pitch failure had the same user-visible error, although its exact cause was not confirmed from logs. Automatic retries can outlive the browser deadline and incur another model call without delivering a usable result.

**How to apply:** When raising word targets or adding content types, allow wrapper overhead above the body estimate. Log safe metadata such as stop reason and output length, never source notes or model text. Keep transport and model deadlines bounded so errors appear while the user can still retry.

# Intake data in scripts

Outside the request lifecycle, do not assume a top-level company name or sector from a raw intake blob. Read its structured form data or use the server's DB-backed helpers where appropriate.

**Why:** The store API returns a raw blob rather than a flattened company profile, so demo scripts can silently send incomplete authority context if they guess its shape.

**How to apply:** Inspect the current intake schema before constructing synthetic generation requests; never use real client data for diagnostic calls.

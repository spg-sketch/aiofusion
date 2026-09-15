---
name: Media contact status and correction provenance
description: Rules for recording departed contacts and user-reported corrections without weakening trusted media data.
---

Record departed/active changes and correction reports as separate, append-only audit records scoped to the active workspace. Do not overwrite canonical contact fields when a user reports a problem. Store the authenticated human actor when available, with a legacy workspace fallback only for old sessions.

**Why:** Global contacts are shared reference data, while each workspace may have its own relationship context. A report or departed marker must remain attributable and must not silently alter trusted data for every workspace.

**How to apply:** Any future contact-status or correction workflow should derive its current display state from the workspace's audit records. Canonical field changes still require an explicit trusted-data review or the existing source-check approval path.
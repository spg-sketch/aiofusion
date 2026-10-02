---
name: Coverage accounting safety
description: Preserve spend reservations and safely diagnose accounting failures without retrying uncertain paid calls.
---

Coverage database failures must fail closed, retain prior recommendation evidence, and expose only a generic message plus a support reference. Server diagnostics may retain PostgreSQL code and schema identifiers, but not SQL parameters, detail text or customer identities.

**Why:** A wrapped INSERT error identifies an accounting boundary, not its PostgreSQL cause; the deployed usage counter was found pointing at an occupied ID despite matching columns and constraints.

**How to apply:** Inspect the nested database cause and serial next-ID occupancy before changing accounting or schema. Counter safeguards must only advance an occupied counter, never rewrite usage history or rewind a healthy sequence. Preserve reservations for attempted calls and release only unattempted calls. Disable provider SDK retries for coverage because a transport failure does not establish that a paid request was unattempted.
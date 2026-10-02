---
name: Media name identifiers
description: Keep imported numeric identifiers out of personal names without deleting valid desk contacts or guessing missing identities.
---

Validate personal-name fields individually, not only their concatenated display name. A real desk label in another field must not disguise an erroneous numeric identifier.

**Why:** The user repeatedly saw four-digit identifiers beside valid desk names. The joined-name guard accepted those combinations, even though the numeric first-name field was not a person's identity.

**How to apply:** Reject new contaminated name values at import, discovery and explicit name-edit boundaries. Preserve legitimate desk identity and contact details when removing an approved erroneous number. Retain unidentified records for human review rather than deleting them or inventing names; do not apply numeric stripping to phones, dates or publication names.

Legacy contaminated records may still receive unrelated edits. Correcting their identity requires an explicit, supported name change; source observations alone are not permission to silently rewrite canonical data.

**Why:** A validation improvement must prevent recurrence without blocking maintenance of retained records or overriding user-owned fields.

**How to apply:** Check submitted name changes against the resulting identity, while keeping identity review separate from unrelated field changes.
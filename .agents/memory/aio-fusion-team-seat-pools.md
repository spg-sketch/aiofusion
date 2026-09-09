---
name: Team seat pools per workspace type
description: Full two-pool team access for Agency Partners and direct Clients; managed Clients have no team
---

Agency Partners and direct Client accounts use the same complete team model:
- Account seats support Admin, Content Team Member, Billing and Viewer roles.
- Project seats are Content Team Member only, with three seats available per project.
- Account and project pools are counted separately.

Agency-managed Client subaccounts have no team controls. Their collaboration is managed through the parent Agency Partner's project seats.

**Why:** The user explicitly corrected the earlier Content-only direct Client model on 2026-09-09 and confirmed that direct Clients must match the Agency Partner version completely.

**How to apply:** Keep direct Client UI, API permissions, role changes, seat counting and project restrictions aligned with Agency Partners. Continue blocking every team-management operation for agency-managed Client subaccounts.

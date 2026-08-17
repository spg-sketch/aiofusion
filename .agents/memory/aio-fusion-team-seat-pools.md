---
name: Team seat pools per workspace type
description: Agency two-pool team seats, direct-client colleague teams, managed clients have no team
---

Team model is resolved per workspace in `resolveTeamMode` (routes/team.ts):
- **agency** (company role "agency"): two pools — account seats (projectAccess NULL members/invites, any invitable role, cap = getTeamSeatLimit) and PROJECT_TEAM_SEATS (3) content-only seats per project (a member/invite holds one seat in EACH listed project).
- **client** direct (no agency parent in platform_accounts): single pool, content role only.
- **null** for agency-managed partner clients (parent account role "agency"): every team endpoint (list, invite, resend, revoke, PATCH, remove) must return 403 — gate all new team routes the same way.
- **standard** for admin/legacy "user" accounts: original single-pool behaviour.

**Why:** Client rule — agency staff manage the account or specific projects; direct clients bring up to 3 colleagues; managed clients collaborate only via the agency's project seats.

**How to apply:**
- Any new invite/member mutation must validate the RESULTING role+projectAccess against the mode, not the request fields alone; resend must refuse legacy invites that violate the current mode (409).
- Per-project full errors list seat-holder names (`getProjectSeatHolders`), include `limitReached` + `projectId`.
- Legacy members with non-content roles + projectAccess are deliberately left working; UI shows their true role so they can be corrected. Seat checks are read-then-write (raceable) — consistent with the pre-existing seat cap, accepted.
- Client UI: TeamSection switches on `team.teamMode`; SubAccountsPage hides the team nav for `session.agencyManagedClient`.

---
name: AIO Fusion audit input overrides
description: Editable Earned Media audit inputs are per-run overrides that must reach three consumers in lockstep
---

# Earned Media audit: editable inputs are per-run overrides

On the audit pre-run screen (LlmCheckPage, the `!result` "Refine what we probe"
panel) the user can edit buyer questions and competitors. These edits are
**per-run overrides held in local state**, NOT persisted back to Project Set-Up
intake. To change them permanently the user edits Project Set-Up.

**Rule:** an edited audit input must reach every consumer or results silently
diverge. There are three:
1. the API request (runCheck overrides `projectData` from getProjectAuthorityData),
2. the in-page report (deriveReportData is passed the edited competitors),
3. the HTML export (openReport's tracked-competitor list).

**Why:** the export path originally still read `getCompetitors()` from intake, so
an edited competitor set showed correct share-of-voice on screen but stale data
in the downloaded report.
**How to apply:** when adding a new editable audit input, wire it into all three
paths, and prefer the parsed local-state array over the raw intake getter
everywhere downstream of the edit.

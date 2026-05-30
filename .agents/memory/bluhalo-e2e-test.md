---
name: Bluhalo end-to-end test
description: How the reusable Bluhalo intake e2e test works and how to keep it valid
---

# Bluhalo end-to-end test

A reusable, on-demand check lives at `artifacts/aio-fusion/test/`:
`bluhalo-intake.fixture.json` (full Bluhalo intake dataset) and
`bluhalo-e2e-plan.md` (the test plan). Run it via the testing tool.

## Approach (and why)
The intake form has ~53 fields across two tracks, so typing every field via
Playwright is slow and blows the step budget. Instead the test creates a project
through the UI, then **injects the whole dataset into localStorage** and reloads,
then drives only the interactive flows (optimise/reject/accept, navigation).

**How to apply:** inject into the active project's intake key. Read
`localStorage['aio.activeProjectId']`; the key is `aio.intake.v2` when it is
`default`/null, else `aio.intake.v2::{id}`. The dataset object must mirror the
persisted shape: `formData`, `duals` (1.2), `dualLists` (1.3), top-level
`spokespeople` (1.8), `businessCategories` (1.9), `audienceCategories` (1.10),
plus `intakeStatus`, `acceptedAt`, `optimisedFields`, `aiWebsite`.

## Gotchas that break the fixture
- Checkbox/select fields are stored as `string[]` in `formData`
  (5.1, 5.3, 5.4, 6.4, 6.5, 7.1), not plain strings.
- Conditional follow-ups (5.1b, 5.4b, 6.4b, 6.5b) only render when the parent
  value array contains the **exact** option string (e.g. 5.1 must include
  "A mix: describe below"). Copy option strings verbatim from IntakeForm.tsx.
- Optimisable fields are 1.1, 1.2, 1.3, 1.6, 2.4; the teal "Optimise" icon only
  shows when the field has content, then "Reject" replaces it after optimising.

**Why:** any change to IntakeForm field ids, types, or option strings can
silently desync the fixture; re-verify against `IntakeForm.tsx` field defs and
`currentIntakeKey()` after editing the intake.

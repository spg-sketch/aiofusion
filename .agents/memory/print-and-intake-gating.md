---
name: AIO Fusion print/PDF and intake completion gating
description: Why audit PDF export uses a new window, and how optional intake fields must be kept out of completion gating
---

# Branded report / PDF export uses a new window, not window.print()

`index.css` has `@media print { #root { display: none } }` and only reveals
`.print-only` content. Any view that lacks a `.print-only` block (like the
Visibility Audit results) produces a BLANK PDF when you call `window.print()`
on the app itself.

**Rule:** for printable/exportable reports on a view without `.print-only`,
build a self-contained branded HTML document, `window.open()` it, write the
HTML, then trigger print in that new window. Mirror the existing pattern in
App.tsx (window.open + document.write + setTimeout print).

**Why:** keeps the user's current screen (e.g. the Planner) in place and
avoids the global print CSS that hides the app root.

**How to apply:** always `escapeHtml()` every interpolated value (company
name, sectors, ICP text, competitors, probe questions) — the report HTML is
assembled by string concatenation. Handle the pop-up-blocked case with a
user-facing alert. Logos: app logo via absolute URL
(`${origin}${BASE_URL}images/...`), client logo is a data URL; render a
placeholder block when absent.

# Optional intake fields must be excluded from completion gating

IntakeForm completion percentage and the `isFullyComplete` (100%) gate drive
downstream actions like "Optimise Project Messages". Adding a new field to a
section silently lowers existing projects' completion and can disable those
actions.

**Rule:** fields that are genuinely optional must set `optional: true` on the
FieldDef and be skipped in ALL completion counters (`totalFields`,
`filledFields`, and `allTrackProgress`). They still render and save normally.

**Why:** ICP (field 1.11) is recommended but optional; counting it as required
broke the optimise gate for already-complete projects.

**How to apply:** when adding any non-mandatory intake field, add `optional`
and verify the three counters filter it out.

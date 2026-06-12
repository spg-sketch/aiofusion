---
name: AIO Fusion Earned Media report has two render paths
description: The Earned Media Visibility Audit report renders both in-page (React) and as an HTML/PDF export, and they must be kept in sync
---

# Two parallel render paths for the same report
`LlmCheckPage.tsx` renders the Earned Media Visibility Audit results in TWO places that should mirror each other and the polished DOCX reference:
- In-page React results view (returned JSX when `result` is set).
- HTML/PDF export built by `buildReportHtml`/`openReport` (opened via "Open report / Save as PDF").

Both present the same sections: hero (AI Authority Index + grade + presence / share of voice / queries appeared), executive summary, AI Authority scorecard, prioritised actions, top visibility gaps, "Who owns the category instead", blind-probe evidence log, method & caveats.

# Shared vs duplicated derivation
- `deriveReportData(result, tracked)` (module-level helper) computes the in-page numbers: idx, grade, presencePct, sov, appearedCount/totalQueries, per-query rows, and the competitor "owns" rows with a `tracked` flag.
- The export (`buildReportHtml`) still derives queryRows / compProfiles / SoV inline rather than calling `deriveReportData`, so the two paths can drift.

**Why:** the export pre-dates the helper; refactoring it fully was out of scope.

**How to apply:** when you change report sections, scoring display, or competitor logic, update BOTH paths. Reusable bits: `normalizeName` + `isTracked` (tracked-competitor matching against `getCompetitors()` from `IntakeForm`, Project Set-Up 4.8) are shared by both. Backend dimension scores are 0-100; the in-page scorecard shows them as `/5` via `Math.round(score/20)` while the index stays `/100`.

# Scorecard display labels/order + evidence-log notes are presentation-only
- `SCORECARD_DISPLAY` (canonical name -> {label, order}) + `orderScorecard(dims)` relabel and re-sort the scorecard rows at DISPLAY time in both paths, so it matches the reference DOCX (worst-first: Non-branded presence, Prominence / position, Share of voice, Spokesperson authority, Source quality (earned-led), Message fidelity, Factual accuracy, Entity clarity). Backend `DIMENSION_NAMES` is left untouched to avoid prompt/parse/test churn.
- The evidence log's last column is "Sources / notes" filled by `queryNote(appeared, competitors, companyName)` from data we already have (no real source URLs).

**Why:** user explicitly chose "presentation polish only, no search grounding, no fabricated sources" for the Simpatico PR demo.

**How to apply:** the report is NOT search-grounded - never reintroduce "Search-grounded" wording (it crept into the in-page Method & caveats once and had to be removed). Keep both Method texts free of search-grounding/citation claims. If you ever add real grounding, that's a separate, larger change.

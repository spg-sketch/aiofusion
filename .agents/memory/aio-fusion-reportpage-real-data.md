---
name: AIO Fusion ReportPage real-data rewiring
description: Measure & Report Executive Summary/GEO tabs source data from real saved audits/diagnostics instead of hardcoded demo constants.
---

# ReportPage real-data rewiring

`ReportPage.tsx` originally rendered hardcoded demo constants (authorityScore, llmScorecard,
technicalAudit, contentAudit, monthlyTrend, etc.) regardless of which client/project was selected.
It now derives everything from `loadSavedAudits`/`authorityIndexFor` (LlmCheckPage), `loadSavedDiagnostics`
(diagnosticStore), and `loadPlannerProjects`/`scoreProject` (contentStore).

**Why:** the client needed the executive summary to reflect real per-client audit history, not a fixed
demo dataset — a report with the same numbers for every client was the core complaint.

**How to apply:** any of these real-data sections can be legitimately empty (no audit run yet) — every
section (hero score card, StatTile row, trend chart, LLM Scorecard table, technical/content audit lists)
must render an explicit empty-state message rather than a blank or zeroed table. LLM Scorecard rows use
`{platform,mentions,cited,rate,trend}` (rate replaces the old rank/sentiment columns, since those aren't
measured for the ChatGPT+Claude-only roster). Technical/content audit rows use `{id,item,status,detail}`
— `id` must be the React key (not `item`, which can repeat across findings from the same category).

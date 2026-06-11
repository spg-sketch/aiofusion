---
name: AIO Fusion LLM Check / Earned Media audit report
description: Data-shape gotchas when building metrics or reports from the Earned Media Visibility Audit (LlmCheckResult).
---

# LLM Check / Earned Media audit report metrics

The downloadable report is built in `openReport()` in `artifacts/aio-fusion/src/LlmCheckPage.tsx`
from the `LlmCheckResult` payload.

## topCompetitors is truncated - do not use it for aggregate metrics

`result.topCompetitors` is filtered and truncated server-side (only rivals with count >= 2,
top 8). Use it for display lists, but NOT for any total/denominator.

**Why:** computing share of voice as `totalMentions / (totalMentions + sum(topCompetitors.mentions))`
understates rival volume (long tail dropped) and mixes per-competitor counts with the per-response
brand count, so the percentage is wrong.

**How to apply:** for aggregate rival volume (e.g. share of voice) sum the full probe set instead:
`result.probes.reduce((s, p) => s + (p.competitors?.length || 0), 0)`. `probes[].competitors` is the
untruncated per-response list.

## Report scope decision

The report intentionally presents only metrics the audit actually measures (AI Authority Index =
visibilityScore, presence, share of voice, blind-probe evidence log, competitor ownership, gaps).
The 8-dimension /5 scorecard (message fidelity, entity clarity, spokesperson authority, etc.) from
the stakeholder sample is deliberately omitted - those need branded-query scoring we do not compute.
Do not fabricate those dimensions; the letter grade is a presentational mapping of visibilityScore.

---
name: AIO Fusion two-stage authority assessment
description: How the Earned Media Visibility Audit produces its AI Authority Index (blind probes + Claude scoring), and the contract that keeps it grounded and backward-compatible.
---

# Earned Media Authority assessment

The audit is two stages: stage one fires the buyer's non-branded category questions at the LLMs as blind probes (brand not named) and measures presence/share-of-voice; stage two passes the probe evidence plus the project's intake data to a single Claude scoring call that returns a structured `assessment` (AI Authority Index 0-100, grade, 8 dimensions, top gaps, prioritised actions, per-query authority read).

**Why:** Patrick liked a report Opus produced this way. Presence metrics alone undersell the story; the structured scorecard is what made the report land.

**How to apply / invariants:**
- `assessment` is OPTIONAL on the result and on saved audits. Every in-app card and every report block that uses it must be presence-gated, so legacy audits saved before this feature still render through the original visibility flow. Do not make assessment a hard dependency.
- The scoring prompt explicitly forbids invention: dimensions with no supporting evidence must score low and justifications default to "No evidence in this run." Keep that intent if you touch the prompt. The grounding evidence the backend supplies is what keeps it honest (verified working: it scored message-fidelity/factual-accuracy 0 and flagged the engines misdescribing the brand rather than inventing positives).
- Stage two is defensive: a balanced-brace JSON extractor + a parser that clamps ranges, normalises to the canonical 8 dimensions, and returns null on any failure. On null the whole UI/report degrades gracefully. Preserve this fail-soft behaviour.
- Probe questions are seeded with the verbatim buyer questions first (capped), so intake quality directly drives probe relevance.
- The audit takes ~70s end to end (multiple runs per model + the scoring call). Test against the api-server at localhost:8080, not the dev domain.

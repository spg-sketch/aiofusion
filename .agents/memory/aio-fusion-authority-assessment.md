---
name: AIO Fusion two-stage authority assessment
description: How the Earned Media Visibility Audit produces its AI Authority Index (blind probes + Claude scoring), and the contract that keeps it grounded and backward-compatible.
---

# Earned Media Authority assessment

The audit is two stages: stage one fires the buyer's non-branded category questions at the LLMs as blind probes (brand not named) and measures presence/share-of-voice; stage two passes the probe evidence plus the project's intake data to a single Claude scoring call that returns a structured `assessment` (AI Authority Index 0-100, grade, 8 dimensions, top gaps, prioritised actions, per-query authority read).

**Why:** Patrick liked a report Opus produced this way. Presence metrics alone undersell the story; the structured scorecard is what made the report land. A later Stage 2 regression silently produced short visibility-only reports that looked complete, so fallback state must be explicit end to end.

**How to apply / invariants:**
- `assessment` is OPTIONAL. New results must carry a coherent `assessmentStatus` + `assessmentOutcome` pair. Only structurally complete assessments may be marked complete; all other new results retain blind-probe evidence with `assessment: null` and a bounded fallback reason.
- Validate complete assessments before parser defaults are applied, then re-validate at the saved-audit boundary. Never trust client-supplied complete metadata. Saved-list, admin, live and print classifications must agree.
- Metadata-free legacy assessments may render only when they pass strict structural validation. Partial, malformed or contradictory metadata stays on the visibility-fallback path.
- Live and printable fallback reports must say that the Authority assessment is incomplete, avoid Authority Index/grade claims, suppress scorecard/action sections, and offer a retry in the live UI. Admin diagnostics expose compact outcome metadata only, never prompts or model output.
- The scoring prompt explicitly forbids invention: dimensions with no supporting evidence must score low and justifications default to "No evidence in this run." Keep that intent if you touch the prompt. The grounding evidence the backend supplies is what keeps it honest (verified working: it scored message-fidelity/factual-accuracy 0 and flagged the engines misdescribing the brand rather than inventing positives).
- Stage two is defensive: a balanced-brace JSON extractor + strict raw validation + a parser that normalises the canonical 8 dimensions. Unavailable, invalid, incomplete and request-error cases are saveable visibility fallbacks, not silent nulls.
- A fallback report may retry Authority scoring up to three times from its saved probe evidence, without rerunning the paid blind probes or bypassing the 21-day full-audit lock. The same saved audit is updated in place and retry count is server-enforced.
- **Why:** A successful visibility run once hit the scoring output ceiling and saved a valid fallback, but the ordinary retry button attempted a full audit and was blocked by the lock. Score-only retries recover the missing report section without multiplying probe cost.
- Probe questions are seeded with the verbatim buyer questions first (capped), so intake quality directly drives probe relevance.
- The audit takes ~70s end to end (multiple runs per model + the scoring call). Test against the api-server at localhost:8080, not the dev domain.

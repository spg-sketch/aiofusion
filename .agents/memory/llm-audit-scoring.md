---
name: LLM visibility audit scoring
description: How the Earned Media Visibility Audit runs multiple probes and aggregates mention results
---

# Earned Media Visibility Audit scoring

The audit probes ChatGPT and Claude with generated questions about a company. Each
question is run multiple times per model (RUNS_PER_QUESTION) to smooth out
non-determinism.

## Decisions to stay consistent with

- **Score and per-model rates are computed over the flat run-level results**
  (every individual model x question x run), so they naturally average across runs.
  Do not switch them to the aggregated `probes` array, or you lose the averaging.
- **The `probes` array shown in the UI is aggregated separately** by `${model}||${question}`
  into one row per question, with `runCount`, `mentionRuns`, and
  `mentioned = mentionRuns * 2 >= runCount` (majority vote, ties count as mentioned).
- **Mention flag and mention context must use the same matcher.** A single
  `aliasRegex(alias)` builder is used by both `isMentioned` and `findMentionContext`.
  **Why:** when they used different matching (regex on normalized text for the flag,
  raw `indexOf` for context) a mention could be flagged true while the context came
  back null/wrong. Keep them on one matcher so they cannot diverge.
- Brand matching tolerates legal suffixes (Ltd, Inc, .io, etc.) and punctuation via
  `brandAliases` + token-join with `[^a-z0-9]+` separators and alphanumeric boundaries.

## Competitor handling

- Competitors are the headline of the report ("Who AI Recommends Instead of You"),
  not a side note. Keep it prominent.
- Only names that come up **repeatedly** are shown: names are normalized
  (`normalizeCompetitor` strips legal suffixes/punctuation), deduped per answer, counted
  by how many run-level answers they appear in, and filtered to `count >= 2`.
  **Why:** the extractor is heuristic/regex-based and pulls noise; showing one-off or
  junk names in front of a client destroys credibility. The repeat filter is the guard.
- Do NOT show competitors per-question (those chips were removed as redundant). The
  single aggregated card is the only place competitors surface to the user. Run-level
  `ProbeResult.competitors` still exists purely to feed the aggregation.
- When no competitor clears the bar, the card shows a positive "opening" message rather
  than hiding, so the headline section is always present.

## Frontend sector selection

- Sectors come from setup (business "operate in" + audience "targeting"); the user
  toggles them and the audit probes up to 3 selected. Placeholder sectors
  ("Project Set-Up", "Awaiting set-up", "") are treated as empty.
- `selectedSectors` must be re-synced via `useEffect` keyed on `activeClient.id` and
  the combined-sectors key, otherwise switching projects leaves stale selection.

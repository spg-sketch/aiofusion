---
name: AIO Fusion IntakeForm structured fields
description: Lifecycle wiring + completion-counter gotchas when adding a repeatable structured field to IntakeForm.tsx
---

# Adding a structured (repeatable) field to IntakeForm.tsx

When a question becomes a repeatable structured field (its own state array,
like `spokespeople` or `products`) instead of a plain textarea, it must be
wired through every place the existing structured fields are handled: state
init, persistence useEffect (blob + deps), saveDraft blob, acceptProjectData
archive blob, valueHtml PDF export, IntakeData type + loadIntakeData mapping,
getProjectDataMessages export, reset handler, and the render branch. Also add
the field id to the optimise-excluded set on BOTH frontend (OPTIMISE_EXCLUDED_IDS)
and backend (OPTIMISE_FIELDS in api-server ai-assist.ts) or it shows a broken
Optimise control.

## Gotcha 1: three completion counters, different indentation
Completion is computed in THREE places that each special-case structured ids
(1.8/1.9/1.10): `sectionHasData`, `trackProgress`, and `allTrackProgress`.
trackProgress is nested one extra level (10-space indent) vs allTrackProgress
(8-space). A `replace_all` on the `if (f.id === "1.8")` line will silently
update only one of them. Always verify all three got the new id, and add it
to each useMemo dependency array.
**Why:** allTrackProgress gates "Optimise Project Messages"; missing the id
there means structured entries never count toward full-form completion.

## Gotcha 2: legacy-text migration can resurrect cleared data
If you migrate an old free-text answer into the new array, only fall back to
the legacy text when the array key is genuinely undefined (`!Array.isArray`),
NOT when it is an empty array. The old formData value is still persisted, so a
`length > 0` guard would re-seed an entry every reload after the user clears
all entries.

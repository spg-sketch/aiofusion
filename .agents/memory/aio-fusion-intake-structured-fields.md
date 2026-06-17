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
all entries. This applies to BOTH the seeding migration (only seed when the key
is undefined) AND every downstream getter that reads the array (e.g.
getIcpProfile/getClientPersona): they must gate their formData fallback on the
key being undefined, never on the joined value being empty, or a cleared
field still returns the stale legacy text.

## Shortcut 2: simple string arrays — use `"string-list"` field type
For questions that need a plain list of individual text entries (no short/long pair),
use `type: "string-list"`. Storage lives in `stringLists: Record<string, string[]>`
(top-level in the blob alongside `dualLists`). Migration from legacy textarea strings
is handled in the state initialiser and in `loadIntakeData` using `/[\n,]+/` split.
The generic renderer handles add/remove. All three completion counters handle it via
`f.type === "string-list"` branches, and `fieldHasContent` checks `stringLists[id]`.
`"string-list"` is not in `OPTIMISABLE_FIELD_TYPES`, so no optimise-exclude wiring
is needed. Fields 3.3 (locations) and 4.8 (competitors) use this type.
**Why:** simpler than dual-list when you only need one value per row; avoids a full
bespoke state array like products/productQueries while still being individually editable.

## Shortcut 1: reuse the existing `dual-list` type instead of new state
If a question only needs short+long (or one long box) per entry, convert it to
the existing `dual-list` field type rather than adding a new state array. This
skips almost all the wiring above (the three completion counters, persistence,
saveDraft, archive, loadIntakeData mapping all already handle `dualLists`
generically), so you only touch: the field config, the shared dual-list render
branch, getProjectDataMessages, the relevant getters, and the optimise excludes.
Genericise the single shared dual-list renderer with optional copy overrides
(itemLabel/addLabel) that DEFAULT to the original "message" wording so 1.3 is
unchanged, and a `singleField` flag to render only the long box (one box per
entry). Optimise for dual-list is hardcoded to id 1.3, so any new dual-list id
must be added to the optimise-excluded sets unless that path is generalised.

## Optimise grounds on the project website
The per-field Optimise (POST /api/ai-assist/optimise-field) sends the Set-Up
website (`aiWebsite`, persisted in localStorage) as `url`. The backend
best-effort fetches it via fetchSiteContent and injects it as reference-only
grounding in the prompt. fetchSiteContent has a fixed 15s internal timeout, so
the route caps the fetch with a ~3s Promise.race against null - never await it
bare or a dead site stalls every Optimise. Site text is untrusted: wrap it in
delimiters and tell the model to ignore instructions inside it.
**Why:** rewrites should stay grounded in the real business without blocking on
slow sites or being hijacked by scraped page content.

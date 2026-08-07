---
name: AIO Fusion em-dash sanitiser
description: How/where em dashes are stripped from AI-generated content, and why a deterministic guard is needed alongside the prompt rule.
---

# Em-dash sanitisation

**Guard tests (Aug 2026):** `no-em-dash.test.ts` in both aio-fusion and
api-server scan their src (and aio-fusion public/) for literal U+2014/U+2015
and fail the suite. When sweeping, NEVER blind-replace inside regex character
classes (use `\u2014` escapes; a sweep once broke extractCompetitors' numbered
list regex in llm-check.ts) and exclude binary files from the sweep.

The owner does not want em dashes anywhere in content ("double em dash" is their
term for the em dash character `—`, U+2014). British spelling, no emojis.

**Rule:** The AI prompts in `content-ai.ts` already carry `BRITISH_RULE`
("Do not use em dashes...") but the model is NOT reliable, so a deterministic
post-process is mandatory, not optional.

**Where it is applied (both layers needed):**
- Server, shared helper `stripEmDashes`/`deepStripEmDashes` (api-server `lib/text-sanitise.ts`).
  - `content-ai.ts`: applied once at the `sse()` chokepoint for every `event==="result"` payload, so all four optimise/generate routes are covered in one place. `deepStripEmDashes` skips `url`/`email` keys (SKIP_KEYS) so identifiers are never corrupted.
  - `ai-assist.ts` optimise/draft-field: applied per prose field before `res.json`.
- Client mirror `stripEmDashes` (aio-fusion `lib/utils.ts`) at content-LOAD chokepoints, which is what cleans *already-saved* content: `App.tsx splitArchiveBody` (draft retrieve) and `IntakeForm.tsx` formData initialiser (all string + string[] values).

**Why load-time on the client:** existing drafts/intake answers live in
localStorage / the shared store; cleaning on load (then they persist on next
save) removes historical em dashes without a destructive migration.

**Regex:** `/[ \t]*[\u2014\u2015]+[ \t]*/g` → `" - "`. Collapses runs (handles the
"double em dash"), only eats spaces/tabs (never newlines, so layout/lists
survive), and intentionally LEAVES en dashes (U+2013) so numeric ranges like
"10–20" are not broken. Scope was limited to the content optimisation feature;
diagnostic/llm-check/seo-audit analysis routes were deliberately left out.

**Static UI copy sweep:** on top of the AI-content sanitiser above, all
hardcoded em dashes in aio-fusion's static UI copy (labels, subtitles,
tooltips, hints, placeholders) and in api-server's seo-audit.ts finding/rec
text (rendered directly in the Website Visibility Audit report) were bulk
replaced with plain hyphens site-wide, since the client's "no em dashes"
preference applies to all visible copy, not just AI-generated text.
Deliberately left untouched: `.test.ts` files (test description strings) and
backend-internal comments/AI-prompt strings that are never rendered to users
(content-ai.ts, llm-check.ts, diagnostic.ts prompt text, code comments).

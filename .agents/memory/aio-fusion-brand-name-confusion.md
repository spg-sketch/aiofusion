---
name: AIO Fusion brand-name / entity confusion handling
description: How the Earned Media (LLM Check) audit disambiguates acronym/ambiguous brand names from namesakes, and the web-grounding decision.
---

# Brand-name confusion in the Earned Media audit

The audit scored acronym/ambiguous brands (e.g. "SMG") too low because LLMs
confuse them with namesakes. Fixed in `llm-check.ts` (server) +
`LlmCheckPage.tsx` / `IntakeForm.tsx` (client).

## Detection corroboration rule (most important)
A weak alias (single token ≤4 chars, e.g. an acronym) is only credited as a
mention when corroborated by a brand-specific signal: the website **domain
label** (`domainLabel`) or the **full legal name**.

**Why:** stripping legal suffixes from the legal name can collapse it to the
sector. `LEGAL_SUFFIXES` includes `group` and `holdings`, so
`brandAliases("Sports Media Group")` yields `"sports media"` — which is just the
sector. If that suffix-stripped form is used as a detection alias OR as a
corroboration signal, any generic sector answer falsely credits the brand.

**How to apply:** in `corroborationSignals` and `detectionAliases`, use the
**full** normalized legal name only (multi-word, including the suffix token), not
`brandAliases(legalName)`. Never use the sector as corroboration in `isMentioned`
(generic answers always mention the sector). Sector is OK only inside
`entityMatchesBrand` (entity-resolution, a different concern).

## Identity anchoring
`buildIdentityProbe(identity)` anchors the single direct/identity probe to the
website + legal name (+ sector/descriptor when `isAmbiguousName`). Plain,
unambiguous names keep the original `What do you know about X?` (so existing
tests pass). `generateProbeQuestions` takes an optional 7th `identity?` param;
without it the direct probe stays a plain string.

## Entity-clarity section
`assessEntityClarity` (one blind Claude call, fail-soft → null) lists namesakes;
`deriveEntityClarity` matches the brand against them and separates "not present"
(`brandRecognised=false`) from "present but confused"
(`brandRecognised=true, brandIsDominant=false`). Surfaced in `summary.entityClarity`,
rendered both in-page and in the HTML export (presence-gated on `isAmbiguous`).
Website flows via `getWebsite()` (reads top-level `aiWebsite`, falls back to a
URL in homepage field 6.2) → `ProjectAuthorityData.website` → `sanitizeProjectData`.

## User-confirmed identity (override)
When `entityClarity.isAmbiguous`, the user can confirm which listed entity is
theirs ("yes, that's us" / "no, it's X"). Stored as
`confirmedEntity {name, description?}` inside the per-project intake blob
(`getConfirmedEntity`/`setConfirmedEntity` in `IntakeForm.tsx`, merge-write so it
survives draft saves) and threaded server-side via `ProjectAuthorityData` →
`BrandIdentity.confirmedEntity`.

**Cross-device persistence:** the choice rides inside the intake blob, so it is
shared via the same `/api/store/*` intake sync as every other Set-Up field — no
dedicated column/route. Push happens on confirm; pull happens on project
open/switch. **Why:** the confirmation must survive across devices/teammates or
the audit re-picks the wrong namesake. **How to apply / the trap:**
`confirmedEntity` is NOT counted by the blank-intake guard (`intakeIsEmpty`,
client + server `intake-guards.ts`), and you must NOT make it counted — doing so
lets a confirm-only payload take the "replace" path and wipe a populated Set-Up.
Instead, a confirm-only payload is allowed past the client push-skip AND the
server intake conflict-update MERGES just the `confirmedEntity` key onto the
existing intake (jsonb `||`, right side wins) rather than replacing. That keeps
both true at once: a confirm always persists even on sparse Set-Up, and a sparse
payload can never erase populated answers.

**Why:** the deterministic heuristic can still pick the wrong namesake; an
explicit human choice should win. **How to apply:** when `confirmedEntity` is
set, `entityMatchesBrand` uses **replace** semantics — ONLY the confirmed entity
counts as the brand (not website/legal/sector matches) — so `deriveEntityClarity`
reflects the user's choice, and `buildIdentityProbe` anchors to the confirmed
name/description. When it is null, behaviour is unchanged (deterministic
fallback). Keep all of this presence-gated; a missing choice must never alter the
baseline verdict.

The same `confirmedEntity` is also threaded into the **content-based diagnostic
audit** (`diagnostic.ts`): the client (`App.tsx` handleRunDiagnostic) sends
`getConfirmedEntity() || undefined`, the route sanitises it
(`sanitizeConfirmedEntity`) and `buildIdentityAnchor` prepends a one-line "this
page belongs to X, analyse it as this company not a namesake" instruction to the
model user message (both Claude + OpenAI fallback). The anchor also says not to
introduce facts beyond the page/measured-facts, preserving the grounding rule.
Empty string when unconfirmed, so the prompt and result are byte-identical to the
old behaviour. Thread any new audit type the same way to keep entity resolution
consistent product-wide.

## Web-grounding decision
Live `web_search` is deliberately NOT enabled. **Why:** the shared Anthropic
proxy lacks a reliable web_search tool; live retrieval breaks audit determinism
and adds latency; the root cause is solved deterministically by domain/legal-name
anchoring. Revisit only if a dependable web-search tool appears. (Documented in a
code comment above `assessEntityClarity`.)

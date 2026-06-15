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

## Web-grounding decision
Live `web_search` is deliberately NOT enabled. **Why:** the shared Anthropic
proxy lacks a reliable web_search tool; live retrieval breaks audit determinism
and adds latency; the root cause is solved deterministically by domain/legal-name
anchoring. Revisit only if a dependable web-search tool appears. (Documented in a
code comment above `assessEntityClarity`.)

---
name: AIO Fusion content AI (LLM) features and exports
description: How the Optimiser/Creator/Media Research LLM features and their Word/Excel exports are wired, and the rules that keep exports honest and safe.
---

# AIO Fusion content AI features

Content features call a real Anthropic LLM via the api-server, not simulated data:
- Content Optimiser/Editor -> `POST /api/content/optimise`
- Content Creator (per-field rewrite) -> `POST /api/content/creator-field`
- Content Creator (whole first draft from scratch) -> `POST /api/content/generate`
- Media Research (target media list) -> `POST /api/content/media-list`

**Creator generate vs creator-field:** `creator-field` only rewrites pasted copy and refuses
empty fields, so the Creator felt like it "just represented the data back". `/content/generate`
authors a full draft (headline/standfirst/bodyCopy/changeLog/supportingData) from Project Data
+ a headline/subject + selected key messages. It picks a prompt variant by content type
(press-release family 1.1, article family 2.1, article media pitch 2.2) with per-type
word-length guidance. The "generation" prompts belong on the Creator, not the Optimiser.

All live in `artifacts/api-server/src/routes/content-ai.ts`, registered in `routes/index.ts`,
rate-limited by `contentAiLimiter` in `middleware/rate-limit.ts`. Test the api-server at
`localhost:8080`, not the dev domain.

Frontend wiring (in `artifacts/aio-fusion/src/App.tsx`): each page uses the
`fetch(`${apiBase()}/api/...`)` pattern, checks `!resp.ok || !data` (media-list also checks
`Array.isArray(data.items)`), throws `data.error`, and shows a loading + error-banner state.

## Streaming contract (progress while generating)

All three `/api/content/*` endpoints stream via **Server-Sent Events**, not a single
JSON body. On success they emit `event: progress` (`{chars}`) repeatedly as the model
writes, then one `event: result` with the payload (same shape as the old JSON), then end.
On model failure/timeout they emit `event: error` (`{error}`) - a friendly, ready-to-show
message. The server aborts the model after `STREAM_TIMEOUT_MS` (90s) and flags it as a
timeout for a distinct message.

**Validation / config / rate-limit failures still return ordinary JSON with a status code
BEFORE the stream opens.** So any client/test must handle both: check the response
`content-type` - if it is not `text/event-stream`, parse JSON and read `.error`.

**Why:** long media-list builds take ~60-90s; a static spinner felt broken. Streaming gives
real incremental progress. Frontend reads it via `streamContent()` (App.tsx, an SSE reader
with a client-side AbortController timeout) and renders the shared `<GenerationProgress>`
panel (elapsed time + stage label + live char count). Indeterminate-bar CSS keyframe lives
in `index.css` (`aio-indeterminate`).

**How to apply:** when adding tests or new callers, do NOT expect `resp.json()` on success -
read the SSE stream. Keep the `result` payload shape identical to the documented JSON so
normalisation/exports keep working.

## Export rules (Media Research Word/Excel downloads)

**The `/api/content/media-list` endpoint returns ONLY `{ items: MediaListItem[] }`** - no
methodology, house email patterns, or reshuffles.

**Why:** exports previously embedded hardcoded demo constants (named real publishers/emails)
as if they were live verified methodology - that is fake data presented as real and was a
code-review blocker.

**How to apply:** never fabricate methodology/patterns/reshuffles in exports. Only render what
the endpoint actually returns. The outreach sequence references the real top-ranked outlet
(`mediaList[0].publication`), not hardcoded outlet names.

## Parsing model JSON (shared extractJson)

`extractJson` in `content-ai.ts` is shared by all `/content/*` endpoints. Long body copy
makes the model emit **raw newlines inside JSON string literals**, which is invalid JSON and
made `JSON.parse` fail with the friendly "AI response could not be read" error. `extractJson`
now has a fallback: if the first parse throws, it runs `sanitiseJsonControlChars()` (a
string-aware walker that escapes raw control chars only when inside a string literal) and
re-parses. The fallback only runs after a normal parse fails, so existing behaviour is
unchanged. URLs the model puts in `supportingData` are passed through `safeHttpUrl()` on the
client (http/https only) before rendering as links.

## Escaping rule

All model-originated strings interpolated into the Word/Excel export HTML must be wrapped in the
module-level `escapeHtml` (App.tsx ~2293). That helper now also escapes `"` and `'` because
URLs/emails are interpolated into `href`/`mailto` attributes.

**Why:** model output is untrusted; unescaped interpolation is an HTML/attribute injection risk
in generated documents.

## Live public-web media discovery integrity

Treat search-model output as untrusted even when the provider reports web grounding. A discovery
is saveable only when its exact normalized source page appears in the provider citations, the
person's full name appears on an SSRF-safe bounded fetch of that page, and any email is an exact
complete address found in that fetched text. Bind saveable results to the authenticated account
with a short-lived signed token so the browser cannot rewrite provenance.

Model-written evidence and pitch framing must remain visibly distinct: call the former an
AI-generated summary of the cited source and the latter an AI-suggested media opportunity. A
source/profile page is not automatically recent coverage, and a source-check date is not proof
that every stored profile field was verified.

**Why:** model-authored URLs, evidence, confidence, and email fields can look grounded while still
being fabricated or mismatched. Host-only citation checks also let a homepage validate an unrelated
profile, and browser-submitted discoveries can falsely acquire a "verified" label.

**How to apply:** keep source downloads bounded through body consumption, not just response headers.
Serialize account saves and deduplicate by person plus outlet rather than source page alone because
several journalists may share a staff page or article. Count every web-search tool call in spend
accounting, including responses that fail JSON parsing.

When rediscovering a saved contact, preserve populated user-maintained intelligence and record the
new source check in provenance. Do not silently replace manual review notes or upgrade retained
fields to newly verified. Reuse visible outlets by canonical domain or normalized name, while
masking inaccessible outlet metadata anywhere recommendation records are returned.

## Typecheck

Use `pnpm exec tsc --noEmit -p tsconfig.check.json` (plain tsc is unreliable here due to TS6306).
`tsconfig.check.json` is a kept helper file.

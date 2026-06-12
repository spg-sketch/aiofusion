---
name: AIO Fusion content AI (LLM) features and exports
description: How the Optimiser/Creator/Media Research LLM features and their Word/Excel exports are wired, and the rules that keep exports honest and safe.
---

# AIO Fusion content AI features

Three content features call a real Anthropic LLM via the api-server, not simulated data:
- Content Optimiser/Editor -> `POST /api/content/optimise`
- Content Creator (per-field) -> `POST /api/content/creator-field`
- Media Research (target media list) -> `POST /api/content/media-list`

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

## Escaping rule

All model-originated strings interpolated into the Word/Excel export HTML must be wrapped in the
module-level `escapeHtml` (App.tsx ~2293). That helper now also escapes `"` and `'` because
URLs/emails are interpolated into `href`/`mailto` attributes.

**Why:** model output is untrusted; unescaped interpolation is an HTML/attribute injection risk
in generated documents.

## Typecheck

Use `pnpm exec tsc --noEmit -p tsconfig.check.json` (plain tsc is unreliable here due to TS6306).
`tsconfig.check.json` is a kept helper file.

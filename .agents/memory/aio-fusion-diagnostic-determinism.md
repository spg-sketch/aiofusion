---
name: AIO Fusion Website Visibility Audit determinism
description: Why /api/diagnostic is single-engine + facts-grounded, and the api-server restart gotcha when testing it.
---

# Website Visibility Audit (`/api/diagnostic`) repeatability

The "Website Visibility Audit" (route `/api/diagnostic`, rendered in `App.tsx`; NOT the separate deterministic `/api/seo-audit` "Website GEO Assessment" on `SeoAuditPage.tsx`) is intentionally built for repeatable results: the same company should produce near-identical reports on repeat runs.

Design decisions to stay consistent with:
- **Single engine, not a merge.** Claude (`claude-sonnet-4-5`) is the only engine on a normal run; OpenAI is a silent fallback only if Claude throws. Do NOT reintroduce the old dual-engine Claude+GPT `mergeResults` averaging - that was a primary source of run-to-run variance.
- **Deterministic settings.** Claude runs at `temperature: 0`. The OpenAI fallback gets a fixed `seed`. Claude's API has no seed parameter, so never claim Claude uses a seed in user-facing copy.
- **gpt-5 cannot use `temperature: 0`.** The OpenAI model is now `gpt-5` (upgraded from gpt-4o). gpt-5 rejects any non-default temperature with a 400 ("Only the default (1) value is supported"), so the OpenAI fallback must NOT pass `temperature` — it relies on `seed` alone for best-effort determinism. gpt-5 still accepts `seed` and `max_completion_tokens`. The same applies to the llm-check probe (`probeOpenAI`). If you ever set temperature on an OpenAI call again, the call will 400 under gpt-5.
- **Measured facts as ground truth.** `safe-fetch` builds a deterministic `GeoAuditFacts` object (image/alt counts, schema types/blocks, heading counts, lists/tables, robots, sitemap size, canonical, OG, meta). These are injected into the prompt as a "treat as ground truth, do not re-estimate" block, returned as `pageFacts`, and rendered in a "Measured on your page" report section. This keeps the figures in the narrative matching reality.

**Why:** temperature 0 + single model + measured-fact grounding gives near-identical (not byte-identical) output. Be honest with the user about "near-identical".

## Testing gotcha: api-server needs a workflow restart
The `artifacts/api-server` dev workflow runs `pnpm run build && pnpm run start` (esbuild bundle, then node). It does NOT hot-reload. After editing any api-server source, **restart the workflow** before curling `localhost:8080`, or you will test stale code (symptom: e.g. `provider: "merged"` or missing `pageFacts` even though the source no longer produces them).

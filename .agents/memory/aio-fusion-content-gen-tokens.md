---
name: AIO Fusion content generation token limits
description: GEN_MAX_TOKENS in content-ai.ts must be generous or extractJson fails on truncated JSON
---

# Content generation token limits

## The rule
`GEN_MAX_TOKENS` in `content-ai.ts` must include headroom for the full JSON wrapper
(headline + standfirst + bodyCopy + changeLog + supportingData) not just the body word count.

**Why:** At the old Article cap of 2500 tokens, Claude's JSON output was being truncated mid-body.
`extractJson` uses `{` / `}` bracket finding — a truncated JSON string causes it to return null,
and the endpoint emits `sse(res, "error", { error: "The AI response could not be read..." })`.
This affected real users, not just the demo script.

**How to apply:** When raising word targets or adding new content types, add at least 1,500 tokens
of JSON-wrapper overhead on top of the estimated body token count (≈1.3 tokens/word).

Current caps (as of 2026-06-30):
- Article: 4500
- Press release: 3500
- Case study: 3500
- Blog post: 3000
- Speaker/Award submission: 2500
- Social post / Article Media Pitch: 2000
- Directory entry: 2000
- Whitepaper: 6000

# Demo-run intake field mapping

`formData` keys (in project intake blob) for reading client data in scripts:
- `"4.1"` — company name
- `"4.4"` — sector (semicolon-separated tags, take first for single-string sector)
- `"1.1"` — full company descriptor (very long, slice to 2000 chars)
- `"4.5"` — geography (semicolon-separated, take first for single value)
- `"1.7"` — comma-separated keywords
- `"2.5"` — ICP / brand positioning summary

**Why:** The store API at `/api/store/projects/:id/intake` returns the raw intake blob which
has no top-level `sector` or `companyName` fields — those live inside `formData` with numeric
section keys. Reading from the DB directly with drizzle-orm is more reliable than the store API
for scripts that run outside the request lifecycle.

---
name: AIO Fusion LLM queries field 1.6
description: Field 1.6 is now a structured LlmQueries type replacing the old plain-text SEO terms field. Covers the storage format, canonical read function, API endpoint pattern, and LlmCheckPage integration.
---

# AIO Fusion LLM queries field 1.6

**Rule:** Field 1.6 is `type: "llm-queries"`, storing `LlmQueries = { v: 1, discovery: string[], shortlist: string[], comparison: string[] }` top-level in the localStorage blob as `llmQueries`. It is NOT inside `formData["1.6"]`.

**Why:** Section 1.6 previously stored plain keyword phrases in `formData["1.6"]`. It now holds 20 natural-language buyer search queries grouped into three buying-journey stages. These are fired verbatim at LLMs in the Earned Media Visibility Audit.

**How to apply:**
- Always read via `getLlmSearchQueries()` export from IntakeForm.tsx (not `getPreferredKeywords()` which is a flat fallback compat shim).
- `getPreferredKeywords()` returns all queries flat (discovery+shortlist+comparison) for backward compat; returns legacy plain text only when `llmQueries` is absent.
- `getProjectDataMessages()` handles 1.6 as structured when `data.llmQueries?.v === 1`.
- Section 3.4 ("audience language phrases") was removed entirely at the same time.
- The API endpoint `/api/content/llm-queries` uses `client.messages.create()` (non-streaming, no SSE headers) — unlike most other content-ai endpoints which use `initSse` + `streamModelText`.
- Categories: `discovery` (7), `shortlist` (7), `comparison` (6). Display labels: "Discovery", "Shortlist", "Comparison and trust". JSON keys are lowercase without spaces.
- LlmCheckPage initialises `buyerQuestionsText` from `getLlmSearchQueries()` (flattened); `customKeywords` is cleared to "" when structured queries exist.

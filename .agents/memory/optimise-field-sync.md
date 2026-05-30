---
name: Optimise field set sync
description: Which intake questions expose the per-question Optimise control, and the frontend/backend sync rule.
---

The per-question "Optimise" control (POST /api/ai-assist/optimise-field) is offered on every free-text answer: any field whose type is `textarea`, `dual` or `dual-list`, EXCEPT the structured pickers 1.8 (spokespeople), 1.9 and 1.10 (media-category pickers). Plain `text` fields (short factual: legal name, founding year, sector, counts), `checkbox` and `heading` are never optimisable.

- Frontend (artifacts/aio-fusion/src/IntakeForm.tsx): `OPTIMISED_FIELD_IDS` is DERIVED from the `sections` config via `isOptimisableField` (type-in-set AND id-not-excluded). Add a new free-text question and it becomes optimisable automatically.
- Backend (artifacts/api-server/src/routes/ai-assist.ts): `OPTIMISE_FIELDS` is a HARDCODED Set used to reject anything else. Tailored prompts exist for 1.1/1.2/1.3/1.6/2.4; every other id falls back to GENERIC_OPTIMISE_INSTRUCTION. Dual=1.2, dual-list=1.3 have special response shapes; all others return {optimised:string}.

**Why:** the two sides are validated independently and there is no shared schema package. If they drift, the UI can show an Optimise button the server 400s, or vice versa.
**How to apply:** when adding/removing/retyping an intake field, update the backend `OPTIMISE_FIELDS` Set to match the frontend derivation. The api-server dev workflow has no watch, so restart it after editing the route.

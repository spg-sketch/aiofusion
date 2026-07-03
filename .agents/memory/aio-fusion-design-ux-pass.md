---
name: AIO Fusion cosmetic design/UX pass conventions
description: Canonical color tokens and shared-component gotchas discovered while doing a cosmetic-only (no functionality change) design pass across AIO Fusion pages.
---

Several pages (`LlmCheckPage.tsx`, `ReportPage.tsx`) define their own **local** `vars` object instead of importing the shared one from `marketing/vars.ts`. The local copies are a subset of the shared palette and do NOT include `gold`. Adding a `vars.gold` reference to one of these pages compiles fine in the editor but fails `tsc` typecheck since the local object literal has no index signature.

**Why:** discovered when introducing the "category selector" gold pill pattern (`background: rgba(201,160,78,0.18)`, `color: #7A5E25`, `border: vars.gold` where available) across multiple pages per a client cosmetic-only design brief — some pages broke typecheck only after the edit.

**How to apply:** before referencing `vars.gold` (or any token) in a page, grep for `const vars = {` at the top of that specific file to see if it shadows the shared import; if so, add the missing token to the local object rather than assuming the shared one applies. Always re-run `pnpm run typecheck` after adding a new color token to any page.

Also: `ReportPage.tsx` has a single shared `StatTile` component reused across Executive Summary, PR & Marketing, Press Release Performance, and Social Impact sections — restyling `StatTile` once (e.g. pink outline + hover "pop") satisfies design requirements for all of those sections simultaneously instead of needing per-instance edits.

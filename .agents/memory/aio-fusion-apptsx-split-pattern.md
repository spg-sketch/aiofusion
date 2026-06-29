---
name: AIO Fusion App.tsx split / mid-file duplicate imports
description: Task agent merges that split App.tsx routinely re-introduce a mid-file import block that duplicates top-level imports, causing a blank-screen 500 in the dev server.
---

## The rule
After any task that touches App.tsx imports or extracts components, run `tsc --noEmit` and grep for `^import` in App.tsx to confirm all import statements are at the top of the file (lines 1–~200). Any import found in the middle of the file (e.g. after line 500) is a merge artefact and must be removed.

**Why:** Task agents resolve rebase/merge conflicts by appending an import block at the end of the last non-conflicting section instead of properly merging into the existing top-level imports. Babel/esbuild detects the duplicate declaration at parse time and returns a 500 before any JS executes — the app shows a blank white screen with no useful runtime message.

**How to apply:**
1. `grep -n "^import" artifacts/aio-fusion/src/App.tsx | tail -30` — any imports with line numbers >200 are duplicates.
2. Identify which names in the mid-file block are truly new (not already imported at top): `apiBase`, `AuthorityDonut`, `getProjectSectorLabel`, `CREATED_PROJECTS_KEY/loadStoredProjects/saveStoredProjects` have been the recurring ones.
3. Add the unique names to the correct existing top-level import, then delete the entire mid-file block.
4. Confirm with `tsc --noEmit` → zero errors.

## Recurring offenders (as of June 2026)
- Page components (GuidancePage, ArchivedProjectsPage, MediaResearchPage, etc.) — now lazy via `React.lazy()` at top; never need a second static import.
- `CreateProjectModal`, `GenerateFromUrlModal`, `Sidebar`, `ClientSelectorPage` — extracted to components/pages; lazy at top.
- `CREATED_PROJECTS_KEY, loadStoredProjects, saveStoredProjects` from `./lib/projectStore` — belongs at top with other projectStore imports.
- `apiBase` from `./lib/apiHelpers` — single static import at top.
- `AuthorityDonut` from `./pages/DashboardPage` — static (not lazy) at top; DashboardPage itself is lazy.

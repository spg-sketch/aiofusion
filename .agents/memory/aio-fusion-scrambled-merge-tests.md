---
name: Scrambled semantic-merge test files on main
description: How to recover when a rebase conflict reveals main's own file is internally broken from an earlier semantic merge
---

Rule: when a rebase conflict file fails tests even after removing markers, check whether the *incoming main* version is itself broken (tests referencing undefined variables, fragments of different tests spliced together). platform-mfa.test.ts on main was scrambled this way by a prior task's semantic merge.

**Why:** the semantic merge tool aligns by variable names ("variable `r`") and can splice unrelated test bodies; accepting either side verbatim keeps broken code.

**How to apply:** find the last coherent version (`git log main-repl/main -- <file>`, `git show <sha>:<file>`), rebuild the file from it, re-add each later task's tests from their evident intent, run the file's suite before `continueMergeResolution`, and note the repair in `divergenceSummary`.

**Update (Aug 2026):** The semantic merge can scramble *source* files too (route handlers spliced into neighboring endpoints), not just tests, and each markTaskComplete rebase round can re-scramble files you already repaired. Keep a verified-good copy of every rebuilt file outside the repo (e.g. /tmp) during the completion cycle so it can be re-applied after each rebase round, and re-run the full suite after *every* round — a "rebase completed cleanly" message does not mean the merged content is coherent.

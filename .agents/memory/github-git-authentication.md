---
name: GitHub Git authentication
description: Distinguish working GitHub API access from authentication used by Git pushes.
---

A healthy GitHub API integration does not establish that the workspace's Git transport credentials are usable. Even a successful fetch is insufficient evidence of push authentication.

**Why:** The API connector reported repository write permission and returned successful responses while an HTTPS Git push rejected its saved credentials. Reconnecting the working API integration would target the wrong authentication path.

**How to apply:** Diagnose Git transport separately from API access. Consult current Replit documentation for Git Providers reauthentication rather than reconnecting a working integration or requesting tokens in chat. Never force-push to work around authentication or divergent history.

Local repository write failures are a separate problem from GitHub authentication. Do not reconnect GitHub or discard working changes to resolve an index-lock error.

**Why:** A stale local Git lock blocked saving changes independently of an already-known GitHub credential failure.

**How to apply:** Check local repository health separately. Leave locks held by active processes untouched; remove a lock only after verifying it is stale and has no active owner.
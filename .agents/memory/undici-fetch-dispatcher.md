---
name: undici dispatcher needs undici's own fetch
description: Why a custom undici Agent/dispatcher must be paired with undici's fetch, not Node's global fetch.
---

In the api-server, any request that pins to a verified IP via a custom `undici` `Agent`/`buildConnector` (the SSRF-safe fetch in `seo-audit.ts`) MUST call `fetch` imported from `undici` (e.g. `import { fetch as undiciFetch } from "undici"`), NOT Node's global `fetch`.

**Why:** Node's built-in `fetch` uses the undici bundled inside Node, but the standalone `undici` package is a different (newer) version. Passing a standalone-undici `Agent` as `dispatcher` to Node's global fetch crashes at request time with `TypeError: fetch failed` caused by `InvalidArgumentError: invalid onRequestStart method` (handler hook mismatch between the two undici versions). Symptom in the app: every Website Technical GEO audit returns "Could not complete audit for this URL" regardless of the URL, even though the target site is reachable.

**How to apply:** keep the dispatcher and the fetch from the same undici. When using undici's fetch the `dispatcher` option is typed, so drop any `// @ts-expect-error` on it (it becomes an unused-directive error) and annotate return types with `Awaited<ReturnType<typeof undiciFetch>>`. Plain fetches with no custom dispatcher (e.g. the PageSpeed call) can stay on global fetch. The api-server dev workflow has no watch, so restart it after editing the route.

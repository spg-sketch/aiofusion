# Threat Model

## Project Overview

This project is a pnpm monorepo with a Vite/React frontend (`artifacts/aio-fusion`) and an Express 5 API server (`artifacts/api-server`). The production application provides public GEO/SEO analysis features: a website audit endpoint that fetches arbitrary URLs, a diagnostic endpoint that sends supplied content to Anthropic and OpenAI, and an LLM visibility checker that queries both providers repeatedly.

Production assumptions for future scans:
- Only production-reachable code should be assessed for reportable findings.
- `NODE_ENV` is `production` in deployed environments.
- TLS is handled by the platform.
- Mockup sandbox environments are dev-only and out of scope unless production reachability is demonstrated.

## Assets

- **AI integration credentials and paid provider quota** — the Anthropic/OpenAI integration keys and their associated spend ceilings are valuable because abuse can generate direct financial cost or provider-side service disruption.
- **Server network position** — the API server can make outbound HTTP requests. If abused, that network position could be used to reach internal services or cloud metadata endpoints that are not meant to be internet-accessible.
- **User-supplied business content** — the diagnostic endpoint accepts pasted content, and the frontend stores project and report data locally. This is not highly regulated data by design, but it can still contain confidential client material.
- **Application availability** — the public API can trigger expensive remote calls and HTML parsing work. Preserving responsiveness and spend is a core security property for this product.

## Trust Boundaries

- **Browser to API boundary** — all frontend requests to `/api/*` come from an untrusted client and must be treated as attacker-controlled, even when initiated by first-party UI flows.
- **API to external websites boundary** — `seo-audit` crosses from the server into arbitrary third-party hosts supplied by the caller; this is the main SSRF boundary.
- **API to AI provider boundary** — `diagnostic` and `llm-check` send caller-controlled content and prompts to Anthropic/OpenAI using privileged API credentials.
- **API to local runtime / environment boundary** — secrets come from environment variables; server logs and error handling must avoid leaking them.
- **Local browser storage boundary** — the React app persists substantial project state in `localStorage`; this data is attacker-modifiable from the browser context and should not be trusted as authoritative server input.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/aio-fusion/src/main.tsx`.
- **Highest-risk code areas**: `artifacts/api-server/src/routes/seo-audit.ts`, `artifacts/api-server/src/routes/diagnostic.ts`, `artifacts/api-server/src/routes/llm-check.ts`.
- **Public/authenticated/admin surfaces**: current production API appears public; no server-side auth or admin boundary is implemented in the shipped Express routes.
- **Usually dev-only / ignore unless proven reachable**: mockup sandbox and other experimental artifacts; local-only UI state in the SPA unless it influences server behavior.

## Threat Categories

### Spoofing

There is no evidence of a production authentication layer protecting the current API routes. The security guarantee for this project is therefore not traditional identity enforcement but explicit recognition of which endpoints are intentionally public and what abuse controls they require. Any future protected surfaces must enforce authentication server-side and not rely on frontend-only state.

### Tampering

All request bodies, query parameters, URLs, and locally stored frontend state are attacker-controlled. The API must validate input types and lengths, and any outbound fetch behavior must continue enforcing its safety guarantees across redirects and other protocol transitions. The frontend must not assume `localStorage` data is trustworthy for any server-side privilege or billing decision.

### Information Disclosure

The main disclosure risk is server-side fetching of attacker-chosen targets or accidental leakage through logs and upstream provider interactions. The application must prevent requests to internal/private destinations, avoid returning verbose internal errors, and keep secrets, cookies, and authorization headers out of logs. User content sent to AI providers should be treated as intentionally disclosed to those processors.

### Denial of Service

This project is especially exposed to resource-exhaustion risk because public routes can trigger multiple outbound network calls, HTML parsing, and paid LLM requests. The application must enforce request cost controls on production APIs: authentication where appropriate, rate limiting, quotas, bounded concurrency, timeouts, and payload-size limits.

### Elevation of Privilege

The highest-impact privilege escalation path in this codebase is turning a public analysis endpoint into a server-side request primitive against more trusted network locations. The API must ensure that user-controlled URLs cannot reach internal services, metadata endpoints, or other privileged network targets, including through redirects or equivalent bypasses. If user/admin features are added later, authorization must be enforced server-side on every privileged route.

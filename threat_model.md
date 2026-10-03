# Threat Model

## Project Overview

This project is a pnpm monorepo with a Vite/React frontend (`artifacts/aio-fusion`) and an Express 5 API server (`artifacts/api-server`). It is a multi-tenant SaaS platform (AIO Fusion) providing AI-powered GEO/SEO analysis and content management. The platform supports agency accounts, client sub-accounts, and team members with role-based access (owner, admin, content, viewer, billing). Authentication uses a custom scrypt-based password system plus Google and Microsoft OAuth, with TOTP-based MFA.

Production assumptions for future scans:
- Only production-reachable code should be assessed for reportable findings.
- `NODE_ENV` is `production` in deployed environments.
- TLS is handled by the platform.
- Mockup sandbox environments are dev-only and out of scope unless production reachability is demonstrated.
- This is an architectural reference, not a current vulnerability register or deployment certificate. Verified source observations, scanner dispositions, reproduction evidence and remediation tracking are in `docs/security/technical-report.md` and `docs/security/coverage.md`.

## Assets

- **AI integration credentials and paid provider quota** — the Anthropic/OpenAI integration keys and their associated spend ceilings are valuable because abuse can generate direct financial cost or provider-side service disruption.
- **Server network position** — the API server can make outbound HTTP requests. If abused, that network position could be used to reach internal services or cloud metadata endpoints that are not meant to be internet-accessible.
- **User accounts and session tokens** — platform sessions (30-day TTL, stored in PostgreSQL) are the primary credential for all authenticated actions. Compromise allows impersonation, data access, and workspace takeover.
- **Tenant project and content data** — agency and client workspaces contain confidential marketing, PR, and GEO analysis data for their own clients. Cross-tenant access would be a serious breach.
- **User PII** — email addresses, display names, and approximate IP hints are stored with sessions and returned by certain endpoints. These must be scoped to the owning user.
- **Application secrets** — `PLATFORM_ADMIN_PASSWORD`, `SESSION_SECRET`, `AI_INTEGRATIONS_*` keys. Compromise of the admin password allows full platform takeover.
- **Application availability** — the public API can trigger expensive remote calls and paid LLM requests. Preserving responsiveness and spend is a core security property.

## Trust Boundaries

- **Browser to API boundary** — all frontend requests to `/api/*` come from an untrusted client and must be treated as attacker-controlled, even when initiated by first-party UI flows.
- **Team member to workspace boundary** — multiple human users share a workspace slug. Each member must only access their own sessions and personal data; workspace data access is governed by `membershipRole`.
- **Agency to client boundary** — agency accounts may view and manage their own client sub-accounts only. The parent check (`account.parent === actor.username`) enforces this for impersonation; other cross-account paths must be similarly constrained.
- **API to external websites boundary** — `safe-fetch`, `seo-audit` and media source/coverage readers cross into caller-supplied or externally discovered hosts. Their DNS, redirect, byte-limit and body-timeout guarantees differ and must be assessed independently.
- **API to AI provider boundary** — `diagnostic` and `llm-check` send caller-controlled content and prompts to Anthropic/OpenAI using privileged API credentials.
- **API to local runtime / environment boundary** — secrets come from environment variables; server logs and error handling must avoid leaking them.
- **Local browser storage boundary** — the React app persists substantial project state in `localStorage`; this data is attacker-modifiable from the browser context and should not be trusted as authoritative server input.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/aio-fusion/src/main.tsx`.
- **Highest-risk code areas**:
  - `artifacts/api-server/src/routes/platform.ts` — auth, sessions, impersonation, team management, role changes.
  - `artifacts/api-server/src/routes/admin.ts` — admin-only content generation, token usage, account management.
  - `artifacts/api-server/src/routes/store-content.ts` — archive and planner item-owner mutation predicates, canonical article references and project access.
  - `artifacts/api-server/src/routes/seo-audit.ts` — SSRF boundary (user-supplied URL fetch).
  - `artifacts/api-server/src/lib/platform-auth.ts` — session creation, resolution, and listing logic.
- **Public/authenticated/admin surfaces**:
  - Public: signup/login/recovery, Google/Microsoft callbacks under `/api/platform/auth/*`, public contact/rights/CMS reads, health and selected analysis/draft routes.
  - Authenticated: personal sessions/MFA and store routes, with additional member-role, project assignment and workspace visibility guards. Authentication alone does not authorise every write.
  - Privileged: admin/steward/editorial predicates vary by endpoint. Agency impersonation is hierarchy-scoped and is not universally Master-only.
- **Historical issue reconciliation**: normal session listing/revocation now scopes named sessions to `userId`; legacy paths exclude user-backed sessions. Archive/planner mutations repeat authorised item-owner predicates. These current source guarantees supersede the old descriptions of those two flaws. Evidence and residual race/role test limits belong in the audit report.
- **Usually dev-only / ignore unless proven reachable**: `scripts/src/seed-staging.ts`, mockup sandbox and other experimental artifacts, local-only UI state.

## Threat Categories

### Spoofing

The platform uses scrypt password hashing, TOTP MFA, personal named-user factors and server-issued 256-bit random session tokens. The Replit OIDC callback in `auth.ts` uses state, nonce and code-verifier validation; custom Google/Microsoft handlers have their own state cookies, provider identity checks and linking/recovery rules. Do not assume identical PKCE or token-validation guarantees across these implementations. Session cookies use `httpOnly`, `secure` and `sameSite: lax` in the reviewed production code; actual proxy/TLS and cookie delivery need separate deployment verification. SHA-1 in the TOTP implementation is the RFC 4226 standard and is not, by itself, a weakness.

Any future protected surfaces must enforce authentication server-side and not rely on frontend-only state.

### Tampering

All request bodies, query parameters, URLs, imported records and locally stored frontend state are attacker-controlled. Drizzle parameter binding and fixed schema identifiers protect reviewed query construction; raw structural fragments require separately traced trusted origins. Archive/planner mutations repeat item-owner predicates, while sensitive project reassignment uses locks/CAS. This does not establish atomicity of every project-to-content permission transition or distributed race.

### Information Disclosure

Personal session APIs scope named sessions to the human user; workspace access remains separately role/tenant-scoped. Disclosure boundaries also include logs, HTML exports, public CMS/media data, upstream AI and external website fetching. Private destinations must be rejected on every network hop, and diagnostics must not reveal credentials or customer content.

The reviewed staging seed script no longer logs supplied passwords. This does not certify log retention, redaction or all operational tooling.

### Denial of Service

This project is especially exposed to resource-exhaustion risk because public routes can trigger multiple outbound network calls, HTML parsing, and paid LLM requests. The application must enforce request cost controls: rate limiting (present on login and signup), bounded concurrency, timeouts, and payload-size limits.

Session revocation applies named-user ownership checks, with distinct privileged administration routes. Rate limits are in-process, and custom header-based keys, anonymous paid operations, parser inflation and remote body consumption require independent abuse-budget review.

### Elevation of Privilege

The highest-impact privilege escalation path remains turning a public analysis endpoint into a server-side request primitive against trusted network locations. SSRF protections in `safe-fetch.ts` must be maintained across redirects.

Within the platform auth layer, agency-to-client impersonation and `canManage` use hierarchy constraints. Privileged surfaces include Master, named editorial and privacy-steward predicates; route names alone do not establish the applicable role boundary. Source review and selected denial fixtures do not certify every role combination or simultaneous ownership change.

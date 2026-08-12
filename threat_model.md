# Threat Model

## Project Overview

This project is a pnpm monorepo with a Vite/React frontend (`artifacts/aio-fusion`) and an Express 5 API server (`artifacts/api-server`). It is a multi-tenant SaaS platform (AIO Fusion) providing AI-powered GEO/SEO analysis and content management. The platform supports agency accounts, client sub-accounts, and team members with role-based access (owner, admin, content, viewer, billing). Authentication uses a custom scrypt-based password system plus Google and Microsoft OAuth, with TOTP-based MFA.

Production assumptions for future scans:
- Only production-reachable code should be assessed for reportable findings.
- `NODE_ENV` is `production` in deployed environments.
- TLS is handled by the platform.
- Mockup sandbox environments are dev-only and out of scope unless production reachability is demonstrated.

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
- **API to external websites boundary** — `seo-audit` crosses from the server into arbitrary third-party hosts supplied by the caller; this is the main SSRF boundary.
- **API to AI provider boundary** — `diagnostic` and `llm-check` send caller-controlled content and prompts to Anthropic/OpenAI using privileged API credentials.
- **API to local runtime / environment boundary** — secrets come from environment variables; server logs and error handling must avoid leaking them.
- **Local browser storage boundary** — the React app persists substantial project state in `localStorage`; this data is attacker-modifiable from the browser context and should not be trusted as authoritative server input.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/aio-fusion/src/main.tsx`.
- **Highest-risk code areas**:
  - `artifacts/api-server/src/routes/platform.ts` — auth, sessions, impersonation, team management, role changes.
  - `artifacts/api-server/src/routes/admin.ts` — admin-only content generation, token usage, account management.
  - `artifacts/api-server/src/routes/store-content.ts` — archive and planner write paths (known TOCTOU gap).
  - `artifacts/api-server/src/routes/seo-audit.ts` — SSRF boundary (user-supplied URL fetch).
  - `artifacts/api-server/src/lib/platform-auth.ts` — session creation, resolution, and listing logic.
- **Public/authenticated/admin surfaces**:
  - Public: `/api/platform/signup`, `/api/platform/login`, `/api/platform/callback/*` (OAuth), `/api/health`.
  - Authenticated (any role): `/api/platform/sessions` (known session isolation issue), `/api/store/*`, `/api/platform/mfa/*`.
  - Admin-only: `/api/platform/admin/*`, `/api/admin/*`, `/api/platform/accounts/:username/impersonate`.
- **Known open findings (do not re-report as new)**:
  - `cross-member-session-enumeration-revocation-2024`: team members can list/revoke each other's sessions via shared workspace slug in `listPlatformSessions`.
  - `store-content-toctou-ownership-2024`: non-atomic ownership check on archive/planner deletes in `store-content.ts`.
- **Usually dev-only / ignore unless proven reachable**: `scripts/src/seed-staging.ts`, mockup sandbox and other experimental artifacts, local-only UI state.

## Threat Categories

### Spoofing

The platform uses scrypt password hashing, TOTP MFA, and server-issued 256-bit random session tokens. OAuth via Google and Microsoft is supported with standard PKCE flows. The OIDC callback in `auth.ts` correctly validates state, nonce, and code verifier. Session cookies are `httpOnly`, `secure`, `sameSite: lax`. No spoofing weaknesses were identified in the authentication primitives themselves; SHA-1 in the TOTP implementation is the RFC 4226 standard and is not a weakness.

Any future protected surfaces must enforce authentication server-side and not rely on frontend-only state.

### Tampering

All request bodies, query parameters, URLs, and locally stored frontend state are attacker-controlled. Store write endpoints must enforce ownership atomically in the WHERE clause of every UPDATE/DELETE, not as a pre-flight read. The known TOCTOU gap in `store-content.ts` violates this guarantee for archive and planner items.

### Information Disclosure

The main disclosure risks are: (1) the shared-slug session listing issue, which exposes team members' email, name, and IP hint to any colleague; (2) accidental leakage through server logs and upstream provider interactions. The application must prevent requests to internal/private destinations on every hop, avoid returning verbose internal errors, and keep secrets out of logs.

The staging seed script logs plaintext passwords to stdout, which is low risk in isolation but should be removed to prevent log-forwarding exposure.

### Denial of Service

This project is especially exposed to resource-exhaustion risk because public routes can trigger multiple outbound network calls, HTML parsing, and paid LLM requests. The application must enforce request cost controls: rate limiting (present on login and signup), bounded concurrency, timeouts, and payload-size limits.

The session revocation IDOR (cross-member-session-enumeration-revocation-2024) can be used by any workspace member to forcibly sign out colleagues, including the workspace owner, which is a low-cost disruption attack.

### Elevation of Privilege

The highest-impact privilege escalation path remains turning a public analysis endpoint into a server-side request primitive against trusted network locations. SSRF protections in `safe-fetch.ts` must be maintained across redirects.

Within the platform auth layer, the agency-to-client impersonation parent check is correctly implemented. Admin role gates on all `/admin/*` and `/platform/admin/*` routes are consistently enforced. The `canManage` hierarchy correctly prevents lateral movement between sibling accounts.

The session isolation failure (cross-member) does not allow privilege escalation to admin, but does allow a lower-privileged member to disrupt the workspace owner's session.

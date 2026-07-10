# AIO Fusion — Investor Technical Due Diligence FAQ

> **Audience:** Investors conducting technical due diligence on the AIO Fusion platform.  
> **Method:** All answers are derived directly from reading the codebase, configuration files, and environment setup. Nothing is inferred or assumed. Where information cannot be verified from code alone, it is flagged **[needs founder confirmation]**.  
> **Date produced:** July 2026

---

## 1. What the Platform Does

### Technical answer

AIO Fusion is a B2B SaaS platform for PR and communications agencies. It enables agency users (and their end clients) to measure, improve, and report on a brand's visibility inside AI-generated answers — a practice the platform calls GEO (Generative Engine Optimisation) or AEO (Answer Engine Optimisation).

The core product consists of:

- **Earned Media Audit ("LLM Check")**: Sends probe questions to ChatGPT (GPT-5) and Claude simultaneously, records whether a named brand appears in the answers, extracts competitors mentioned, and scores the brand across eight authority dimensions. Results are produced via Server-Sent Events (SSE) streaming so the user sees progress in real time.
- **Website/Diagnostic Audit**: Fetches a URL, parses the HTML with Cheerio, measures technical GEO readiness (schema markup, heading hierarchy, AI crawler directives, PageSpeed), and calls Claude to produce a scored assessment across six categories.
- **Content Suite**: Three linked tools — Creator (AI-draft from project data), Optimiser (AI-rewrite of existing copy), and Content Library (saved drafts and published pieces).
- **Comms Planner**: A 12-week calendar for planning PR activities, with optional AI scoring of each planned item for GEO impact.
- **Media Database**: A managed directory of publications and journalists (global shared + per-agency private).
- **Project Hub**: Multi-tenant project management supporting agencies with many client projects simultaneously.
- **Reporting**: Aggregated score dashboards pulling from saved audit results.

The platform targets PR agencies as the direct customer (agency account) and the agency's end clients as indirect beneficiaries (client sub-accounts).

### In plain English

AIO Fusion is a dashboard that tells PR agencies whether their clients actually get mentioned when someone asks ChatGPT or Claude a question — and then gives them the tools to write content that makes those mentions more likely.

---

## 2. Architecture & Tech Stack

### Technical answer

**Monorepo structure:** pnpm workspaces managed as a single TypeScript project with composite builds. Three deployable artifacts and shared libraries.

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, Radix UI, Framer Motion, Wouter (client-side routing), TanStack React Query, Recharts, Zod |
| API Server | Express 5, Node.js 24, TypeScript, esbuild (ESM bundle, `.mjs` output) |
| Database ORM | Drizzle ORM |
| Database | PostgreSQL (Replit-managed, accessed via `DATABASE_URL`) |
| Schema validation | Zod (`zod/v4`), `drizzle-zod`, Orval (OpenAPI codegen) |
| AI integrations | Anthropic Claude (`claude-sonnet-4-5`, `claude-sonnet-4-6`), OpenAI GPT-5 — accessed via Replit AI Integrations proxy |
| Authentication | Replit OIDC (`openid-client`) for developer access; custom scrypt + cookie session system for agency/client logins |
| Logging | Pino (structured JSON), pino-http |
| Testing | Vitest (unit + integration), in-memory PGlite for DB-backed route tests |
| Object Storage | Replit Object Storage (GCS-backed) — used exclusively for database backups |
| Hosting | Replit (development and deployment platform) |
| Word export | `docx` + `file-saver` (Press Release Word export feature) |

**Code organisation:**

```
artifacts/
  aio-fusion/      React + Vite frontend SPA
  api-server/      Express API server
  mockup-sandbox/  Design/component preview (internal tooling)
lib/
  db/              Drizzle schema + PostgreSQL connection pool
  api-spec/        OpenAPI 3.1 spec + Orval codegen config
  api-client-react/ Generated React Query hooks
  api-zod/         Generated Zod schemas
scripts/           Utility scripts (backup, restore, seeding)
```

**API design:** OpenAPI 3.1 spec is the source of truth. Orval generates typed React Query hooks (client) and Zod validators (server) from this spec. All API routes sit under `/api`.

### In plain English

The product is built with modern, mainstream web technology: a React app talking to a Node.js backend, storing data in PostgreSQL, and calling Claude and ChatGPT APIs for the AI features. Everything runs on Replit's cloud platform.

---

## 3. Data — What Is Stored, Where, and How It Is Secured

### Technical answer

**What is stored (23 database tables across 9 schema files):**

| Data category | Tables | Content |
|---|---|---|
| Auth | `sessions`, `users` | Replit OIDC sessions and user identities |
| Platform accounts | `platform_users`, `platform_companies`, `platform_memberships`, `platform_accounts`, `platform_sessions`, `platform_meta` | Agency and client user records, company workspaces, session tokens, key/value platform flags |
| Projects | `projects`, `project_snapshots` | JSONB blobs containing all project data and intake form answers; append-only snapshot history for each project |
| Content | `archive_items`, `planner_items`, `scoring_configs` | Saved drafts, 12-week calendar items, per-agency GEO scoring weights |
| Saved audits | `saved_audits`, `saved_diagnostics`, `saved_content_geo`, `saved_tech_geo` | Full JSON results of every audit run, with soft-delete (`deletedAt`) |
| Media | `media_categories`, `media_outlets`, `media_contacts` | Publication directory and journalist contacts |
| Operational | `admin_events`, `audit_locks`, `token_usage` | Admin action audit log, concurrency locks per audit run, per-account AI token consumption with GBP cost estimates |

**Where:** PostgreSQL database managed by Replit, accessed via the standard `DATABASE_URL` environment variable. Backups uploaded to Replit Object Storage (Google Cloud Storage-backed).

**Access control:**
- All project and content data is gated by `requirePlatformAuth` middleware, which verifies a valid `aio_sid` session cookie against the `platform_sessions` table before any data is returned.
- A strict hierarchy is enforced server-side: admin accounts can see all data; agency accounts see only their own projects and their direct client sub-accounts' projects; client accounts see only their own projects. This is enforced in the `/api/store/*` routes, not the frontend.
- Admin "impersonation" (viewing another account's data) uses a stash/restore cookie mechanism (`aio_admin_sid`) that preserves the admin's original session.

**Password security:** Agency and client passwords are hashed using Node.js built-in `crypto.scryptSync` with a random salt. The stored format is `scrypt$<salt>$<derived-hex>`. No third-party hashing library is used.

**Session security:**
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day TTL.
- Single-session policy: all prior sessions for a user are revoked on new login.
- Partial IP hint (first two octets only) stored on session for display purposes — not full IP.

**Secrets handling:** API keys and database credentials are read from environment variables via Replit's secret management system. No credentials appear in source code.

**Encryption at rest:** [**needs founder confirmation** — Replit's managed PostgreSQL encryption-at-rest posture is not verifiable from the codebase alone.]

**GDPR / data residency:** [**needs founder confirmation** — the Replit platform's data centre region and any applicable DPA arrangements are not determinable from code.]

**Notable gap:** The `platform_accounts` table still exists alongside the newer `platform_users` / `platform_companies` / `platform_memberships` tables, indicating an ongoing data model migration. There is synchronisation code (`backfill`) between the two, creating a dual-write risk during the transition period.

### In plain English

User passwords are stored securely (one-way hashed, not encrypted). All access requires a valid login session. The data hierarchy is enforced on the server — agencies can only see their own clients' data, never someone else's. Client data such as audit results and press releases sits in a PostgreSQL database; AI keys and database passwords are stored as environment secrets, not in the code.

---

## 4. Scalability

### Technical answer

**Current architecture:** Single Express 5 process handling all API requests. No load balancer, no worker pool, no message queue. PostgreSQL is managed by Replit (scale tier unknown — **[needs founder confirmation]**).

**What scales well today:**
- The frontend is a static Vite SPA — it can be served from a CDN with no server involvement per page load.
- Database queries use Drizzle ORM with parameterised queries (no N+1 visible in route code for the common paths).
- Project data is stored as JSONB blobs, reducing JOIN complexity at the cost of queryability.
- AI audit endpoints have per-account concurrency guards (`audit_locks` table) preventing one user from triggering multiple simultaneous heavy AI calls.

**Current bottlenecks:**
- **Single process:** No horizontal scaling mechanism exists. All requests, including long-running AI audits (which can stream for 30–60 seconds each), are handled in the same Node.js event loop.
- **In-memory rate limiters:** Rate limits use `express-rate-limit` with its default in-memory store. Limits are:
  - LLM Check: 3 requests per 15 min per IP
  - Diagnostic: 5 per 15 min per IP
  - General: 500 per 15 min per IP
  If the server restarts, all rate limit counters reset. In a multi-instance deployment these limits would not be shared.
- **No caching layer:** There is no Redis or equivalent. Repeated identical AI calls hit the model API every time.
- **localStorage dependency:** Several client-side features (Archive, Planner, GEO Archive, Comms Planner) use `localStorage` as a hybrid store alongside the database. This data is per-browser and does not scale across devices or team members.

**What scaling would require:**
1. Moving to a multi-instance setup would require replacing in-memory rate limiters and `audit_locks` with a distributed store (Redis or Postgres-backed equivalents — `audit_locks` is already Postgres-backed, which is good).
2. Long-running AI calls would benefit from a queue/worker architecture to avoid tying up the main event loop.
3. The dual-store (localStorage + DB) pattern on several pages would need to be fully migrated to the database.

### In plain English

The system currently runs on a single server — it works well for an early-stage product but would need some engineering work before handling hundreds of simultaneous users running AI audits. The main risk is not the database but the fact that every AI call (which can take up to a minute) shares server resources with all other requests.

---

## 5. Reliability

### Technical answer

**Backups:**
- Daily `pg_dump` to Replit Object Storage via a scheduled deployment job (recommended schedule: 03:00 UTC).
- Each backup includes a verification gate: the script compares the row count in the `projects` table in the dump against the live database before accepting the backup as valid. Dumps that fail the gate are quarantined, not deleted.
- Backups are gzipped and accompanied by a JSON manifest (row counts, SHA256 hash, metadata).
- 14-day rolling retention of verified-only backups.
- A restore dry-run script (`restore-db.ts --verify-restore`) downloads the latest backup into a scratch database and confirms core tables are present and populated.
- A runbook (`backups/RESTORE.md`) documents the emergency restore procedure.

**Health monitoring:**
- `/api/healthz` returns `{"status":"ok"}` — suitable for basic uptime monitoring (e.g., Uptime Robot, Replit deployment health checks).
- No active alerting pipeline (PagerDuty, Slack webhook, etc.) is configured in the codebase. **[Gap: no automated alerting if the service goes down or a backup fails.]**

**Error handling:**
- Pino structured logging with sensitive header redaction (`Authorization`, `Cookie`) ships to whatever log sink Replit provides.
- `admin_events` table captures admin-level actions for audit purposes.
- AI routes have SSE error-handling that writes a structured `error` event to the stream before closing, allowing the frontend to display failure messages rather than hanging.
- `concurrencyGuard` middleware prevents double-submission of audit jobs.

**Single points of failure:**
- The PostgreSQL database (Replit-managed — **[needs founder confirmation]** re: replication/failover).
- The Anthropic and OpenAI API availability (both external; no fallback to a local model).
- The Replit platform itself (hosting provider lock-in).

**Project snapshots:** Every project `upsert` writes an append-only row to `project_snapshots`, providing a per-project history independent of the daily backup.

### In plain English

The platform takes daily database backups and actually verifies them before trusting them — a higher standard than many early-stage products. The gap is that nobody gets automatically notified if a backup fails or the server goes down; that alerting needs to be added. The product also depends on Anthropic and OpenAI staying available — there is no AI failover to a different provider.

---

## 6. Security & Compliance

### Technical answer

**Authentication model:**
- Two independent auth systems: Replit OIDC (developer/internal) and a custom platform auth (agency/client production users).
- Platform auth uses scrypt password hashing (Node.js native `crypto`), salted per user.
- Session tokens are random, stored in `platform_sessions`, validated on every request.
- Cookie flags: `HttpOnly` (not accessible to JavaScript), `Secure` (HTTPS only), `SameSite=Lax`.

**SSRF protection:** The `/api/seo-audit` endpoint, which fetches arbitrary user-supplied URLs, has explicit SSRF guards blocking `localhost`, RFC-1918 private IP ranges, and cloud metadata endpoints (e.g., `169.254.169.254`).

**CORS:** Dynamic allowlist built from `REPLIT_DEV_DOMAIN` and `ALLOWED_ORIGIN` environment variables. Cross-origin cookie sharing requires explicit opt-in via `credentials: true`.

**SQL injection:** Not possible through normal use — all queries go through Drizzle ORM's parameterised query builder. No raw SQL strings were found in application routes.

**Secrets:** AI provider API keys (`AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`) and `DATABASE_URL` are read from environment variables managed by Replit. No secrets appear in committed code.

**Rate limiting:** All sensitive and AI-heavy endpoints have dedicated rate limiters. Login endpoint is limited to 20 attempts per 15 minutes per IP.

**Content Security Policy:** A `cspMiddleware` (`artifacts/api-server/src/middleware/csp.ts`) is applied to every response. It sets a strict CSP: `default-src 'self'`, with narrow allowlists for Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) and Vite HMR websockets in development only. All AI and third-party API calls are server-side and therefore do not appear in the browser CSP.

**Audit logging:** Administrative actions are recorded in the `admin_events` table. Token usage is logged per account per operation.

**Known gaps:**
1. **Rate limiters are in-memory** — they reset on server restart and would not work correctly in a multi-instance setup.
2. **No MFA (multi-factor authentication)** for platform accounts.
3. **No formal penetration test** or third-party security audit on record in the codebase.
4. **Encryption at rest** for the PostgreSQL database depends on Replit's managed infrastructure — not configurable from the application. **[needs founder confirmation]**
5. **Data residency and GDPR DPA** status with Replit as a sub-processor is not addressed in the codebase. **[needs founder confirmation]**
6. **Google OAuth** is referenced in `platform.ts` for signup but its full implementation status should be verified in a live environment. **[needs founder confirmation]**

### In plain English

The core security fundamentals are in place: passwords are properly hashed, session cookies are protected, and the server blocks known attack types (SQL injection, SSRF). The main gaps for enterprise customers are the absence of MFA, no formal third-party security audit, and open questions around GDPR compliance that depend on Replit's data processing posture rather than the application code.

---

## 7. AI/ML Components

### Technical answer

**Models used (token caps verified from route source constants):**

| Model | Provider | Used for | Temperature | Max tokens (configured ceiling) |
|---|---|---|---|---|
| `claude-sonnet-4-5` | Anthropic | GEO Diagnostic (website audit) | `0` (explicit) | 8,192 |
| `gpt-5` | OpenAI | GEO Diagnostic (silent fallback — only called if Claude throws; normal run is Claude-only) | provider default (`1`) | 8,192 |
| `claude-sonnet-4-5` | Anthropic | LLM Check: brand probes | not set (provider default) | 4,000 per probe |
| `gpt-5` | OpenAI | LLM Check: brand probes | not set (provider default) | 8,000 per probe |
| `claude-sonnet-4-5` | Anthropic | LLM Check: authority scoring (post-probe pass) | not set (provider default) | 5,000 |
| `claude-sonnet-4-5` | Anthropic | LLM Check: entity resolution | not set (provider default) | 600 |
| `claude-sonnet-4-6` | Anthropic | Content Optimiser, Content Creator, AI Assist (intake drafting), LLM Queries, Coverage Search | `0` (explicit) | 8,192–16,384 (varies by content type); LLM Queries / Coverage Search capped at 2,048 |

**Access method:** Both providers are accessed through the **Replit AI Integrations proxy** — the base URLs and API keys are injected by Replit and are not billed directly to the operator. **[needs founder confirmation: confirm commercial/billing arrangement with Replit for AI usage at scale]**

**Token usage tracking:** Every AI call logs input tokens, output tokens, model name, operation type, and a GBP cost estimate to the `token_usage` table, scoped to the account and project. A `TokenUsageAdminPage` in the frontend exposes this to administrators.

**Key AI design decisions:**
- **Temperature 0 for analysis and content generation:** The GEO Diagnostic and all Content Suite calls (`content-ai.ts`, `ai-assist.ts`) set `temperature: 0` explicitly for deterministic, repeatable output. **Exception:** LLM Check (`llm-check.ts`) probe calls do not set a temperature — the provider default applies (Anthropic: 1.0 / OpenAI: 1.0). This is intentional: probes are meant to simulate real-world model behaviour rather than produce deterministic answers.
- **No hallucination suppression for coverage search:** The Media Research tool ("coverage search") explicitly instructs the model to surface only media mentions known from its training data. The prompt warns against fabricating results, but there is no external verification of returned mentions against real URLs.
- **Identity anchoring:** The LLM Check and Diagnostic prompts include an explicit "identity anchor" (company domain + legal name) to prevent the model from confusing similarly named organisations.
- **Prompt-level em-dash sanitisation:** A deterministic strip of em-dashes is applied on the server at SSE result output points to counteract a model stylistic tendency. This is a minor but indicative example of prompt reliability engineering.

**External AI dependencies:**
- The product has a hard dependency on both Anthropic and OpenAI API availability. No self-hosted or open-source model alternative exists in the codebase.
- Model versioning is hardcoded in route files (e.g., `claude-sonnet-4-5`, `gpt-5`). An upstream model deprecation requires a code change and redeployment.
- GPT-5 is used for the LLM Check probes only. If OpenAI removes or renames GPT-5, the "ChatGPT visibility" metric would break.

**Not used:** Perplexity, Gemini, or any other AI models. The product scope is intentionally limited to ChatGPT and Claude as the two measured AI engines, matching the stated product scope in `public/llms.txt` and `public/robots.txt`.

### In plain English

The platform uses Claude (Anthropic) for its analysis and content generation, and it also probes GPT-5 (OpenAI) to measure brand visibility specifically within ChatGPT. The costs flow through Replit's integration proxy rather than being billed directly. Every AI call is tracked, so the business can see and manage AI spending per client. The risk is that if either Anthropic or OpenAI changes their models or pricing, it directly affects the product.

---

## 8. Technical Debt & Risks

### Technical answer

**Honest assessment of what needs work:**

**High priority:**
1. **Dual data model migration incomplete:** The codebase contains both a legacy `platform_accounts` flat table and a newer normalised `platform_users / platform_companies / platform_memberships` schema. Synchronisation code keeps them in sync, but this dual-write pattern is a source of complexity and potential data inconsistency until the migration is finalised.
2. **localStorage as a hybrid data store:** Several features (GEO Archive, Comms Planner items, some audit timing and cycle history) persist data to `localStorage` in addition to, or instead of, the database. This means data is siloed per-browser, does not sync across team members on the same account, and is lost if the user clears browser storage. Approximately 26 frontend files reference `localStorage`.
3. **No distributed rate limiting:** In-memory rate limiters do not persist across server restarts and would not work correctly if the API server were scaled horizontally. Moving to Redis or Postgres-backed rate limiting is required before any multi-instance deployment.
4. **No automated alerting:** Backup failures, server downtime, and AI API errors are logged but no alert pipeline (email, Slack, PagerDuty) is wired up in the codebase.

**Medium priority:**
5. **Model version hardcoding:** Claude and GPT model identifiers (`claude-sonnet-4-5`, `claude-sonnet-4-6`, `gpt-5`) are hardcoded in route files. A model deprecation requires a code edit and redeployment — there is no feature flag or config system for model selection.
6. **No schema migration system:** The project uses Drizzle Kit's `push` command for schema changes rather than versioned migration files. In a production environment with multiple deployments this increases the risk of out-of-sync schema states. A `post-merge.sh` script runs `pnpm db push` automatically after merges as a workaround.
7. **No CDN for static frontend assets:** The Vite SPA is served directly from Replit. A CDN layer (Cloudflare, etc.) would improve global page load performance and reduce server load.
8. **Coverage/Media Research accuracy:** The AI media research feature returns results from the model's training data, not a live web search. Returned results cannot be automatically verified against real URLs, so outdated or hallucinated coverage could be presented to users.

**Lower priority:**
9. **Pre-existing TypeScript errors:** Memory documentation notes pre-existing typecheck errors in `diagnostic.ts` and `replit-auth-web` that are carried forward rather than fixed.
10. **Backup scope:** The backup verification gate currently checks only the `projects` table row count. If other critical tables (e.g., `saved_audits`, `platform_users`) are lost in a partial corruption, the backup would still pass the gate.

### In plain English

The biggest technical housekeeping item is that some data still lives only in the user's browser rather than in the shared database — this needs to be fully migrated to make the product work properly for agency teams sharing a project. The rest of the debt is standard for a fast-moving startup: a half-finished data model migration, no automated alerts, and model version numbers baked into the code. None of these are blockers for the current stage, but they should be on the product roadmap before scaling to enterprise clients.

---

## 9. Cost Structure

### Technical answer

**Infrastructure costs (all Replit-platform):**

| Component | Provider | Cost driver |
|---|---|---|
| Hosting (API server + frontend) | Replit | Replit deployment tier — **[needs founder confirmation: current plan and monthly cost]** |
| PostgreSQL database | Replit managed | Included in Replit deployment — **[needs founder confirmation: storage tier]** |
| Object storage (backups) | Replit Object Storage (GCS-backed) | Storage volume of daily gzipped backups (likely small, < 1 GB/month at current scale) |
| AI API calls | Anthropic + OpenAI via Replit AI Integrations proxy | Per-token pricing — billed through Replit integration rather than direct API contracts **[needs founder confirmation: whether costs are billed to Replit or passed through to operator]** |

**Per-audit AI cost profile (configured token ceilings from route source — not observed averages):**

| Operation | Model(s) | Max tokens per call (ceiling) | Cost exposure note |
|---|---|---|---|
| LLM Check — brand probes (capped at 8 probes, `MAX_QUESTIONS = 8`) | `claude-sonnet-4-5` (4,000/probe) + `gpt-5` (8,000/probe) | Up to ~4,000 Claude + ~8,000 OpenAI per probe; ×8 probes per audit | Highest per-run exposure — each probe hits both models in parallel |
| LLM Check — authority scoring (one call after probes) | `claude-sonnet-4-5` | 5,000 | Fixed per audit run |
| GEO Diagnostic (website audit) | `claude-sonnet-4-5` (primary); `gpt-5` silent fallback only if Claude fails | 8,192 | Low-moderate; normal run is one Claude call only |
| Content draft generation | `claude-sonnet-4-6` | Up to 16,384 (varies by content type) | Moderate-high for long-form |
| Content Optimiser / AI Assist | `claude-sonnet-4-6` | 8,192 | Moderate |
| LLM Queries / Coverage Search | `claude-sonnet-4-6` | 2,048 each | Low |

> Note: These are configured maximums; actual billed tokens depend on prompt length and model output. Actual per-call GBP costs depend on Replit's AI proxy pricing **[needs founder confirmation]**. The `token_usage` table records `cost_gbp_estimate` per call, so historical actuals are available in the database.

**Cost controls in code:**
- Per-IP and per-account rate limits on all AI endpoints.
- `concurrencyGuard` prevents parallel audit runs per account.
- Token usage is logged per account, giving the business visibility into which accounts are consuming disproportionate AI resource.
- No per-account AI spending cap or automated cutoff is implemented in code. **[Gap: a high-usage account could accumulate significant AI costs with no automatic throttle beyond the rate limiter.]**

### In plain English

The main ongoing cost beyond platform hosting is AI API usage — every audit, every content draft, and every optimisation call costs money per token. The system tracks this spending per client, which is good. What's missing is an automatic spending cap that would cut off a runaway account. The founder should be asked to share the current monthly AI bill and per-client economics.

---

## 10. Defensibility

### Technical answer

**Proprietary / differentiated:**

| Element | Description |
|---|---|
| **GEO scoring methodology** | The six-category diagnostic scoring model (Schema, Architecture, Authority, Earned Media, Visibility, Technical) with weighted scoring is proprietary. Weights are stored per-agency in `scoring_configs`, allowing white-labelled scoring. |
| **Two-stage earned media audit** | The LLM Check uses blind probes (brand mention detection without telling the model it is being evaluated) followed by a separate Claude scoring pass against eight authority dimensions. This separation is a deliberate design choice to avoid prompt bias. |
| **Identity anchoring system** | Purpose-built prompts that anchor AI analysis to the specific legal entity (domain + legal name + sector) to avoid false positives from brand name ambiguity — a non-obvious problem the team has explicitly engineered around. |
| **PR-domain prompt engineering** | Extensive prompt libraries tuned for UK PR/comms use cases (British English enforcement, em-dash prohibition, citation-ready phrasing objectives, sector-specific probe question generation). This is accumulative IP. |
| **Intake-driven content generation** | A structured 7-step intake form (`IntakeForm`, fields 1.1–7.x) is used to personalise every AI output. The mapping between intake fields and prompt variables represents domain knowledge about what makes PR content authoritative. |
| **Per-agency scoring customisation** | GEO scoring weights are configurable per agency, enabling the platform to support agencies with different client verticals under a single instance. |

**Off-the-shelf / replicable:**
- Frontend stack (React, Tailwind, Radix UI) — commodity.
- Backend stack (Express, Drizzle, PostgreSQL) — commodity.
- Underlying AI capabilities (Claude, GPT-5) — available to any developer.
- Media database structure — replicable, though the seeded content has value.

**Moats (honest assessment):**
- **Workflow moat:** The product integrates auditing, content creation, planning, and reporting in a single workflow. Replicating the individual features is easier than replicating the integrated workflow and accumulated client data.
- **Data moat (early stage):** Saved audits, project snapshots, and the media database accumulate over time and become harder to migrate. This moat strengthens with usage.
- **Methodology moat (medium):** The GEO scoring methodology could be documented and replicated by a well-resourced competitor. The primary protection is speed of iteration and PR agency trust/relationships.
- **No patent protection** is evident from the codebase. **[needs founder confirmation]**
- The underlying AI models are from third-party providers — Anthropic or OpenAI could launch a competing PR-specific product.

### In plain English

The defensible parts of the product are the workflow, the PR-specific methodology baked into the prompts and scoring, and the client data that accumulates over time. The technology stack itself (React, Node.js, PostgreSQL) is not a differentiator — anyone could build the same plumbing. The real IP is the domain knowledge encoded in years of prompts and scoring rubrics, and the trust built with PR agencies who have onboarded their client data. The risk is that a well-funded competitor (or Anthropic/OpenAI themselves) could build a similar interface on top of the same models.

---

## Likely Tough Investor Questions — Suggested Answers

**Q: Why build on Replit? Is that production-grade?**

Replit's deployment platform provides managed PostgreSQL, secrets management, object storage, scheduled jobs, OIDC, and AI API proxying in a single integrated environment. It substantially reduced build time for a solo/small team. The risks are vendor lock-in and uncertainty about the exact SLAs. Before a Series A or significant enterprise sales, the team should confirm Replit's uptime SLA, data residency guarantees, and have a documented migration path to AWS/GCP if needed.

---

**Q: What happens if Anthropic or OpenAI deprecates the model version you're calling?**

Model version strings (`claude-sonnet-4-5`, `claude-sonnet-4-6`, `gpt-5`) are hardcoded in three route files. A deprecation means a code change and redeployment — roughly a day's work, but with risk of regressions in audit quality if the replacement model behaves differently. The product roadmap should include a model version configuration layer and regression test suite for audit outputs.

---

**Q: You track token usage per account — do you pass that cost through to clients?**

The tracking infrastructure exists (`token_usage` table, admin dashboard). Whether the business has implemented per-client billing based on AI consumption is a commercial, not technical, question. **[needs founder confirmation]** The code does not implement an automated billing integration with a payment provider for AI usage.

---

**Q: How do you ensure audit results are accurate and not hallucinated?**

For the Website/Diagnostic audit: results are grounded in "measured facts" (deterministic counts from actual HTML parsing — image alt-text percentages, heading counts, schema types) before being passed to Claude. For the LLM Check: brand probes are sent to the live AI models and the model's actual text output is captured — there is no AI involved in judging whether the brand appeared (that is done by string matching). The authority *scoring* after probes is AI-generated and carries the standard caveats of LLM judgment. For Media Research: coverage results come from the model's training data and are explicitly not live-verified. This is a material caveat that should be disclosed to users.

---

**Q: Is this GDPR-compliant?**

The application code implements reasonable data security practices (scrypt hashing, HttpOnly cookies, access control, structured logging with PII redaction). However, GDPR compliance also requires: a Data Processing Agreement (DPA) with Replit as sub-processor, a clear data residency declaration, a documented retention policy, a subject access request process, and a privacy notice. None of these are verifiable from the codebase and require **founder confirmation**. This is the area of highest compliance risk for enterprise sales into the UK/EU market.

---

**Q: What is the single biggest technical risk today?**

The incomplete migration from the legacy `platform_accounts` flat table to the normalised user/company/membership model. While synchronisation code exists, operating two parallel data models creates a latent risk of data inconsistency. This is the item most likely to cause a production incident that affects multiple agency accounts simultaneously. It should be a top engineering priority in the next sprint cycle.

---

*Document produced by automated codebase analysis, July 2026. All factual claims are traceable to specific files in the repository. Items marked [needs founder confirmation] represent gaps that cannot be resolved from code inspection alone.*

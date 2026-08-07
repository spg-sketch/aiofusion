# Workspace

## User preferences

- NEVER use em dashes (U+2014) anywhere in site content, UI copy, emails, or AI-generated text. Use a plain hyphen ( - ) instead. Guard tests (`no-em-dash.test.ts` in both aio-fusion and api-server) fail the build if one appears. British spelling, no emojis.

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── aio-fusion/         # AIO Fusion — The AI Authority Platform — landing page + interactive demo (React + Vite, Simpatico PR branded). Includes Press Release editor (PressReleasePage.tsx) with WYSIWYG, Word export (docx + file-saver), and document library.
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`); `src/routes/diagnostic.ts` exposes `POST /diagnostic` (full path: `/api/diagnostic`) — calls Claude and OpenAI in parallel for GEO/AEO content analysis, merges results, returns structured JSON; `src/routes/seo-audit.ts` exposes `POST /seo-audit` (full path: `/api/seo-audit`) — fetches a URL, parses HTML with cheerio, analyses meta tags, headings, schema markup, links, images, AI crawler readiness, and Google PageSpeed scores; returns structured findings with scored sections and prioritised recommendations. SSRF-protected (blocks localhost, private IPs, metadata endpoints); `src/routes/llm-check.ts` exposes `POST /llm-check` (full path: `/api/llm-check`) — sends sector-relevant probe questions to both ChatGPT (GPT-5) and Claude, checks whether the company is mentioned in responses, extracts competitors mentioned, and returns a visibility score with detailed per-probe results.
- AI integrations: Anthropic (Claude claude-sonnet-4-5) and OpenAI (GPT-5) via Replit AI Integrations proxy — env vars `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`
- Depends on: `@workspace/db`, `@workspace/api-zod`, `@anthropic-ai/sdk`, `openai`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

#### Available scripts

| Script | Command | Purpose |
|---|---|---|
| `hello` | `pnpm --filter @workspace/scripts run hello` | Smoke-test that the scripts package runs |
| `backup` | `pnpm --filter @workspace/scripts run backup` | Full verified Postgres backup to object storage |
| `restore:list` | `pnpm --filter @workspace/scripts run restore:list` | List available backups |
| `restore:download` | `pnpm --filter @workspace/scripts run restore:download` | Download a backup locally |
| `restore:verify` | `pnpm --filter @workspace/scripts run restore:verify` | Verify a downloaded backup |
| `seed-staging` | `pnpm --filter @workspace/scripts run seed-staging` | Seed fresh test data into the staging database |

#### Staging seed (`seed-staging`)

`scripts/src/seed-staging.ts` populates a staging database with representative accounts, projects, and audit records so testers always start from a known, realistic state.

**When to run it:** After creating or resetting the staging deployment's database — typically whenever you want a clean test baseline.

**How to run it:**

```bash
# If DATABASE_URL is already set in the environment (e.g. inside Replit):
pnpm --filter @workspace/scripts run seed-staging

# Or with an explicit staging URL:
DATABASE_URL=<staging-database-url> pnpm --filter @workspace/scripts run seed-staging
```

**What it creates:**

| Type | Details |
|---|---|
| Agency account | username: `seed-staging-agency` / password: `Staging-Agency-2026!` |
| Client account | username: `seed-staging-client` / password: `Staging-Client-2026!` (child of agency) |
| Projects | Greenleaf Sustainability, FinBridge Capital (owned by agency); HealthNext Diagnostics (owned by client) |
| Audit records | One Earned Media audit + one GEO diagnostic per project |

The script is **idempotent** — running it multiple times is safe; existing rows are left untouched. It also includes a safety guard that refuses to run if `DATABASE_URL` looks like a production URL (override with `SEED_STAGING_FORCE=1` if needed).

---

## Deployment: Production vs Staging

This project uses **two separate Replit Deployments** to keep experimental features completely isolated from live client data.

### Production deployment

- URL: `aio-fusion.replit.app` (or the primary published domain)
- **No `FEATURE_*` or `VITE_FEATURE_*` secrets should be set here.**
- All feature flags default to `false` (disabled) when the env var is absent, so production is always stable.
- Required secrets (set in the production deployment's secret manager):
  - All standard app secrets (`DATABASE_URL`, `SESSION_SECRET`, `AI_INTEGRATIONS_*`, etc.)
  - Do **not** add any `FEATURE_*` or `VITE_FEATURE_*` keys.

### Staging deployment

- URL: `staging.aiofusion.ai` (a second deployment created from the same codebase)
- Used by internal testers and developers to validate experimental features before they reach clients.
- Has its own isolated database (separate `DATABASE_URL`) so no client data is ever at risk.
- Staging-specific secrets (set in the staging deployment's secret manager):

| Secret | Value | Purpose |
|---|---|---|
| `DEPLOYMENT_ENV` | `staging` | Tells the server it is running in the staging environment; triggers the DB isolation guard below |
| `PRODUCTION_DB_IDENTIFIERS` | *(comma-separated list of production DB hostnames / DB names, e.g. `prod-db.example.com,aio_prod`)* | **Required when `DEPLOYMENT_ENV=staging`.** Substrings that must **not** appear in `DATABASE_URL` — the server exits non-zero if unset or if any identifier matches, preventing accidental production DB usage |
| `VITE_FEATURE_AI_COVERAGE_SEARCH` | `true` | Enables AI Coverage Search in the frontend |
| `FEATURE_AI_COVERAGE_SEARCH` | `true` | Enables the matching API route on the server |
| `BRAVE_API_KEY` | *(key when available)* | Powers the AI Coverage Search feature |

- All standard app secrets (`DATABASE_URL`, `SESSION_SECRET`, `AI_INTEGRATIONS_*`, etc.) must also be set in the staging deployment, pointing to staging resources.

#### Database isolation guard

On startup, if `DEPLOYMENT_ENV=staging` (or `NODE_ENV=staging` as a fallback), the API server checks that `DATABASE_URL` does not contain any of the substrings in `PRODUCTION_DB_IDENTIFIERS`.

- If `PRODUCTION_DB_IDENTIFIERS` is **not set** → the server logs a **FATAL** error and exits non-zero. The secret is required when `DEPLOYMENT_ENV=staging`.
- If a match is found → the server logs a **FATAL** error and exits non-zero, causing the deployment to fail immediately.
- If the check passes → an **info** log confirms isolation is verified.

To populate `PRODUCTION_DB_IDENTIFIERS`, copy the hostname and/or database name from the production `DATABASE_URL` (e.g. a Replit-managed PostgreSQL connection string looks like `postgresql://user:pass@<hostname>/<dbname>`) and paste those two values as a comma-separated list into the staging secret.

### How to add a new feature flag to staging

1. Add the flag in `artifacts/aio-fusion/src/lib/features.ts` (frontend, `VITE_FEATURE_*`) and/or `artifacts/api-server/src/lib/features.ts` (server, `FEATURE_*`).
2. Guard your UI/route behind the flag so it's invisible when the var is absent.
3. In the **staging deployment** secret manager, add `VITE_FEATURE_<YOUR_FLAG>=true` and/or `FEATURE_<YOUR_FLAG>=true`.
4. Do **not** add those secrets to the production deployment.
5. Once the feature is ready to ship, remove the flag guard from code and delete the secrets from both deployments.

### Setting up a new staging deployment (one-time)

1. In Replit, open **Deployments** → **New deployment**.
2. Point it at this same codebase.
3. Set all standard secrets (copy from production, swap `DATABASE_URL` for a staging database).
4. Add the `FEATURE_*` / `VITE_FEATURE_*` secrets listed in the table above.
5. Deploy. The staging URL is fully isolated — it shares no database or session store with production.

### Verifying the correct flags are active

The API server reports active feature flags in two places so you can confirm the environment without manual inspection:

**Startup log** — immediately after boot, the server emits a structured log line:
```
{"port":…,"activeFeatureFlags":["aiCoverageSearch"],"msg":"Server listening"}
```
On production the `activeFeatureFlags` array will be empty (`[]`). On staging it will list every enabled flag.

**Health endpoint** — `GET /api/healthz` returns:
```json
{ "status": "ok", "features": ["aiCoverageSearch"] }
```
Hit `https://<staging-url>/api/healthz` to confirm flags are on, and `https://<production-url>/api/healthz` to confirm `"features": []`.

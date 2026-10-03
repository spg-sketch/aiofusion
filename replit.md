# Workspace

## User preferences

- NEVER use em dashes (U+2014) anywhere in site content, UI copy, emails, or AI-generated text. Use a plain hyphen ( - ) instead. Guard tests (`no-em-dash.test.ts` in both aio-fusion and api-server) fail the build if one appears. En dashes (–) in numeric ranges (e.g. "1–3 minutes") are fine and should stay (user confirmed 7 Aug 2026). British spelling, no emojis.

## Overview

### Visual review constraints

- For brand guidelines and design review, the current site is the sole reference and the intended future live site. Do not introduce a separate production-site comparison or make environment separation a prerequisite for reviewing the guidelines. State any unverified screen coverage as an evidence limitation only.
- Keep Project Hub unchanged. It is the approved visual reference, not a redesign target. Brand guidelines and consistency recommendations must protect its layout, controls, colours, typography and behaviour, including indirect changes through shared styles.
- Brand guidelines are documentation proposals until approved for implementation. Do not apply them across the application automatically.

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
### Customer media access and download policy

Customers manage only records added to their active workspace; saved shared records are private bookmarks, not copies. Agency hierarchy never pools private media. Shared discovery requires meaningful criteria and uses batches of up to 25.

Customer media downloads are CSV-only, at most 25 requested records per download and 100 shared-database records per active workspace per UTC calendar day, shared across team members, saved/selected paths and contacts/publications. Repeated downloads count again, except retries of the same operation. Workspace-added records do not consume the daily allowance. Display the reset in the user's local time. Never silently truncate, discard bookmarks or refund uncertain network delivery. Master maintenance contracts and unrelated exports remain separate. Limits do not prevent all copying of legitimately displayed information. Live publication requires separate approval.


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

**When to run it:** Only when preparing dedicated staging review identities. It never resets existing accounts. The previous documented seed logins are retired and are not verified review credentials.

**How to run it:**

```bash
# Requires STAGING_REVIEW_PASSWORD, BETA_DATABASE_URL and
# PRODUCTION_DATABASE_URL in Secrets. Never paste their values into commands.
# DATABASE_URL must exactly match the authorised BETA_DATABASE_URL.
pnpm --filter @workspace/scripts run seed-staging
```

**What it creates:**

| Type | Details |
|---|---|
| Agency Partner | `staging-review-agency`; password held only in `STAGING_REVIEW_PASSWORD` |
| Direct Client | `staging-review-client`; top-level workspace with no agency parent; password held only in `STAGING_REVIEW_PASSWORD` |
| Master | Not created by this script. Requires an authorised existing staging Master identity and normal MFA. Never substitute an arbitrary account with an `admin` role or reset a real account. |
| Optional projects and audits | Set `STAGING_REVIEW_INCLUDE_DATA=1` to include representative data for the dedicated review workspaces. |

The script fails closed before connecting unless the target exactly matches `BETA_DATABASE_URL` and differs from the production database host/path. There is no force override. Identity creation is insert-only and transactional; existing dedicated identities must match the expected structure and supplied password or the script stops without resetting them.

**Verification status:** The new seed has not been run and three-role staging Hub/Settings navigation has not been confirmed. Workspace fixtures in `scripts/settings-button-review.cjs` are isolated component previews, not evidence of real staging authentication. `tests/admin-impersonation.spec.ts` is a mutating impersonation test, not a read-only review-access check; do not run it against published staging or production to obtain screenshots. Keep credentials, session cookies and MFA values in Secrets only.

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

## Stripe Tax (VAT at checkout) — one-time dashboard steps for the owner

Checkout is built to charge VAT automatically via Stripe Tax, but Stripe requires a one-time activation in the Stripe dashboard (test mode and, later, live mode separately):

1. In the Stripe dashboard, go to **Settings → Tax** and click **Activate Stripe Tax**.
2. Set a valid **head office/origin address** (your business address) when prompted. Stripe rejects automatic tax calculation if this address is missing, even in test mode.
3. Add your **tax registrations** (at minimum a UK VAT registration; add EU OSS or per-country registrations as needed).
4. Under **Settings → Emails**, turn on **"Email finished invoices to customers"** (and receipts) so every subscription payment sends a compliant invoice PDF automatically.

Until Stripe Tax is fully configured, behaviour differs by mode. In **test mode**, checkout still works: the server detects both activation and missing-head-office-address errors, logs them loudly, and creates the session without tax so test payments are not blocked. In **live mode**, checkout is refused instead - the business must never silently sell without VAT, so live payments fail with an actionable setup message until Stripe Tax is active and has a valid head office address. Once configured, no code change is needed - VAT appears at checkout automatically, customers confirm their billing address, and business customers can enter a VAT number (valid EU/UK numbers apply reverse charge where appropriate). Billing details saved in the app (billing email, VAT number, address) sync to the Stripe customer so invoices carry them.

### Post-activation verification checklist (test mode)

Run through these steps after activating Stripe Tax in the Stripe **test** dashboard to confirm the full flow works before switching to live mode:

1. **No fallback warning in logs** — Start a checkout from the Billing settings page and confirm the server log does NOT contain `"Stripe Tax is not activated"`. If it does, the origin address or UK VAT registration is still missing in the dashboard.

2. **VAT appears at checkout** — Use Stripe test card `4000 0082 6000 0000` (UK card) and enter a UK billing address at checkout. The summary should show the plan price plus 20% UK VAT on top.

3. **Reverse charge for EU VAT numbers** — Start another checkout, enter a German or other EU billing address, then enter a valid EU VAT number (e.g. `DE123456789` for testing). The VAT line should drop to 0% (reverse charge).

4. **Invoice carries billing details** — Before checking out, save a company name, billing address, and VAT number in **Settings → Billing details** in the app. After a successful test payment, open the Stripe dashboard, find the customer, and confirm the invoice shows the saved name, address, and VAT number.

5. **"View your latest invoice" link appears** — After a successful test payment, refresh the Billing page in the app. The subscription card should show a "View your latest invoice" link. Click it to confirm it opens the hosted Stripe invoice page.

6. **Invoice email sent** — Check the email address associated with the test account (or the billing email if set). Stripe should have sent a "Your invoice from AIO Fusion" email with a PDF attachment and "View invoice" button. If no email arrives, confirm **Settings → Emails → "Email finished invoices to customers"** is enabled in the Stripe dashboard.

7. **Repeat for add-on project checkout** — Go to **Billing → Add a project**, choose a tier, and complete checkout. Confirm VAT appears and the new invoice link is visible after payment.

## Staging Stripe webhook verification

Published staging uses the protected `STRIPE_STAGING_WEBHOOK_SECRET`. It must be the signing secret for the Stripe test-mode endpoint whose URL is `https://aio-fusion-staging.replit.app/api/stripe/webhook`. Updating the endpoint URL does not rotate or recover its signing secret.

After changing the endpoint or secret, complete one test-mode checkout and verify:

1. Stripe reports a successful 2xx delivery for `checkout.session.completed`.
2. Deployment logs do not contain `stripe webhook: signature verification failed`.
3. The matching workspace has its subscription and onboarding state activated locally.

If deliveries return 400 with a signature-verification error, copy that endpoint's current `whsec_...` signing secret into the protected `STRIPE_STAGING_WEBHOOK_SECRET` secret and republish staging. Never put the signing secret in this file, source control, or chat.

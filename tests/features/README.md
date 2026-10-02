# Non-payment feature checks

## Run the isolated browser checks

```sh
pnpm test:features
```

This rebuilds the actual API and web application, creates temporary local
PostgreSQL data, and runs Chromium against the real application. It does not
connect to the customer, development, beta or production database.

The Direct Client journey covers signup, the generated verification email and
one-time token, onboarding, exact 60-day beta activation, project/intake
persistence after refresh, media publication/contact CRUD, publication
bookmarking through the UI and cross-workspace denial. A separate scenario checks
anonymous private-API denial and public page rendering.

The repeatable tool workflows sign in through the actual UI using the isolated
`release@example.invalid` fixture, enter the seeded Release project, and use only
synthetic article, planner, contact and publication content. A small synthetic
project intake is prepared with the authenticated `/api/store/projects/intake`
store endpoint because editor context is a prerequisite; this fixture setup is
not counted as Project Set-Up UI coverage. The tests cover:

- Content Creator manual entry, Content Library save, server-store confirmation,
  and opening the saved headline/body after a full browser refresh.
- Content Optimiser actual Content Library retrieval, headline/body editing,
  archive update, linked Comms Planner handoff, and reload verification.
- Comms Planner calendar entry creation, future release date/week/status,
  rescheduling, refresh verification and deletion of only its own record.
- Media Database search in the added-record collection, both contacts and
  publications, using the top and bottom Search controls; bookmarking both into
  My Media Database, reload verification, publication edit, free-text publication
  association on a contact, and deletion of only the records created by the test.

Provider-backed generation is a separate opt-in test for each editor. It is
skipped explicitly unless `AIO_FEATURE_LIVE_AI=1`; when enabled it makes exactly
one real `/api/content/generate` and one real `/api/content/optimise` request,
checks the submitted editor content and nonempty UI result, and does not mock
the provider/API. Manual Creator save and Optimiser editing/handoff run
independently of that flag. The authenticated UI flows are serial under the
feature Playwright project's one-worker configuration.

After execution, successful core-workflow captures and machine-readable
evidence are written to `.local/feature-test-reports/core/screenshots` and
`.local/feature-test-reports/core/evidence`. These are per-run fixture evidence,
not live-site or production verification.

Email is captured at the Resend transport boundary using a synthetic key.
Delivery to a real inbox is **not** verified. The loopback-only email retrieval
endpoint exists only in the optional feature harness, never the deployed API.
Verification still uses the real application token and verification route.
API redirects are forwarded to the browser with its session cookie; redirects
outside the local fixture are refused.

The HTML report is `.local/feature-test-reports/playwright/index.html`.
Failure screenshots, videos and traces are under
`.local/feature-test-reports/results`. These outputs are ignored by Git.
Playwright gracefully terminates the harness so its temporary database and email
capture are removed.

## Run read-only live checks

Obtain the current production URL from the deployment service before running:

```sh
pnpm test:features:live https://YOUR-VERIFIED-PRODUCTION-HOST
```

This makes anonymous GET requests only. It does not register, authenticate,
submit forms, send email, invoke AI, access billing or modify records.
It records the target, timestamp and each result in
`.local/feature-test-reports/live-smoke.json`.

## Run the requested tools without repeating signup

```sh
pnpm test:tools
pnpm test:tools:ai
```

The first command runs deterministic editing, calendar, database and website
audit checks, explicitly skipping AI-only scenarios. The second opts into the
configured real Anthropic/OpenAI integrations and consumes normal AI usage.
It runs one Creator generation, one Optimiser request and a reduced visibility
audit. The visibility engine also performs identity probes, repeated
measurements and its authority assessment; one query does not mean one provider
call. The only real credentials passed to the isolated API child are those four
AI integration keys/base URLs. No real Stripe, Resend, OAuth, admin or database
credentials are passed.

The fixture is an active synthetic 60-day Direct Client beta, not an exempt
free-access workspace. The visibility audit exercises saved report retrieval,
its real HTML print/export popup and deletion. The website audit exercises a
real HTTPS fetch of example.com, saved report retrieval and the downloadable
HTML-backed document. Both use actual application routes.

Core run outputs are kept separately under
`.local/feature-test-reports/core/{features.json,playwright,results}` so earlier
signup evidence is not replaced. Screenshot evidence is embedded in the
combined standalone report when available.

## Create the combined standalone report

After both commands have produced results:

```sh
node scripts/nonpayment-feature-report.mjs
```

The combined report is `.local/feature-test-reports/summary.html`. Timestamps
and the distinction between live and fixture results must remain visible.
A focused retest report does not prove the entire suite ran again.

## Limits

See `coverage.json`. Payments are deferred until staging is ready. All member
role permutations, external email delivery, Google/Microsoft sign-in and
unrequested outreach-email sending are not covered. Provider-backed AI is only
covered when explicitly opted in and its real providers are available. These
workflows do not establish coverage of full research, reporting or account
administration journeys. Do not call skipped AI or untested paths passed.
Do not change the fixture to use real production credentials or databases.
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

## Create the combined standalone report

After both commands have produced results:

```sh
node scripts/nonpayment-feature-report.mjs
```

The combined report is `.local/feature-test-reports/summary.html`. Timestamps
and the distinction between live and fixture results must remain visible.
A focused retest report does not prove the entire suite ran again.

## Limits

See `coverage.json`. Payments are deferred until staging is ready. Agency beta,
all member-role permutations, external email delivery, Google/Microsoft sign-in,
provider-backed AI generation and full editorial/planner/research/report
journeys are not covered by this initial suite. Do not call them passed.
Do not change the fixture to use real production credentials or databases.
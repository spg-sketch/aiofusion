# AIO Fusion Release Quality Gates

## Authoritative release-candidate check

Run this from the repository root:

```bash
RELEASE_ENVIRONMENT=staging pnpm run release:check
```

This is the only command that establishes a release candidate. Developer `test` and `typecheck` commands remain available for faster feedback, but they are not release approval.

The command is fail-fast and runs these required stages in order:

1. Workspace typechecks
2. API regression suite
3. Web regression suite
4. Operational script tests
5. API production build
6. Web production and pre-render build
7. Isolated production-bundle API startup and `/api/healthz` readiness check
8. Chromium critical journeys for public routing, sign-in, authorised workspace access and denied access

Every stage must run and pass. A missing tool, build output, browser, fixture prerequisite or environment value is a failure, not a skip. The first failure stops the run and names the failed stage.

Each stage has a fixed timeout. A timed-out stage is a failed stage and stops the
gate. Release commands run in their own process group; timeout cleanup sends
`SIGTERM` to the group first and force-kills it with `SIGKILL` if it does not
exit during the cleanup grace period. This prevents hanging child processes from
surviving the release check.

## Isolation and environment boundaries

- Release-candidate validation targets `staging` only.
- The API smoke process binds to an ephemeral loopback port, uses a deliberately unreachable database address, performs no migrations, runs no jobs and is always terminated.
- Browser journeys run the production-built web and API against a temporary local PostgreSQL database seeded with synthetic identities and projects. They contain no customer data and require no production credentials.
- `RELEASE_BASE_URL`, when supplied, must be staging or loopback. The gate rejects a live domain.
- A passing staging gate is not evidence that the same code is live. Live-domain checks happen only after an explicit production publication.

## Evidence and approval

The gate writes `release-evidence/latest.json` with the UTC start/end time, target environment, stage names, durations and pass/fail result. A failure or timeout includes `failedStage`; timed-out stage entries also include `timedOut: true`. It records no environment-variable values, credentials, request bodies or customer data. Attach or copy this non-sensitive summary to the change record.

The release is **NO-GO** if any stage failed, did not run, was skipped, timed out, or used the wrong environment. After all stages pass, the application reviewer checks the evidence and gives the explicit approval to publish to staging. Production publication still requires the business owner and release owner approval in the cutover runbook.

## Staging sign-off

After publishing the approved candidate to staging:

1. Confirm staging `/api/healthz` is ready.
2. Confirm the deployment and database are labelled staging.
3. Check sign-in, an authorised workspace, and denied cross-workspace access using approved test accounts.
4. Review startup and request logs for new errors.
5. Test OAuth, email and Stripe only in their staging/test modes.
6. Record UTC time, release identifier, environment and pass/fail only.

Any failed critical journey, health regression, environment mismatch, unexplained error spike or data-integrity concern is NO-GO for production.

## Post-production verification

Run only after an explicit production release. Never assume staging changes are already live.

1. Confirm production `/api/healthz`.
2. Confirm the published release identifier and canonical production domain.
3. Check approved public navigation and one non-destructive sign-in/workspace journey.
4. Observe health, startup, request, OAuth and webhook logs for at least 15 minutes.
5. Record UTC time, environment and pass/fail without credentials or customer data.

Trigger rollback for failed publication/startup, sustained health failure, authentication or workspace-isolation failure, critical integration failure, unexplained integrity/count changes, or a material error spike. Keep writes frozen where the cutover runbook requires it and use the approved Replit rollback path.
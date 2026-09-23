# AIO Fusion Release Quality Gates

## Authoritative release-candidate check

Run this from the repository root:

```bash
RELEASE_ENVIRONMENT=staging pnpm run release:check
```

This is the only command that establishes a release candidate. Developer `test` and `typecheck` commands remain available for faster feedback, but they are not release approval.

The command is fail-fast and runs these required stages in order:

1. Repository publication-automation guard
2. Workspace typechecks
3. API regression suite
4. Web regression suite
5. Operational script tests
6. API production build
7. Web production and pre-render build
8. Isolated production-bundle API startup and `/api/healthz` readiness check
9. Chromium critical journeys for public routing, sign-in, authorised workspace access and denied access

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

The gate writes `release-evidence/latest.json` with the UTC start/end time, target environment, exact Git revision, `clean` or `dirty` source-state marker, stage names, durations and pass/fail result. A failure or timeout includes `failedStage`; timed-out stage entries also include `timedOut: true`. It records no environment-variable values, repository credentials, request bodies or customer data. Attach or copy this non-sensitive summary to the change record.

The gate refuses to start from a dirty checkout. After every stage passes, it reads Git state again and fails if `HEAD` changed or any tracked or untracked source change appeared during the run.

The release is **NO-GO** if any stage failed, did not run, was skipped, timed out, or used the wrong environment. Evidence is also **NO-GO** when its Git revision differs from the revision being published, when the evidence says `sourceState: "dirty"`, or when the current checkout has uncommitted changes. Reviewers must compare `git rev-parse HEAD` with `gitRevision` in the evidence and confirm `git status --porcelain` is empty. Any commit or uncommitted release change after the gate requires a new release check.

After all stages pass, the application reviewer gives explicit approval to publish to staging. Run the approved staging publisher through the guarded entry point:

```bash
RELEASE_ENVIRONMENT=staging pnpm run release:publish -- <staging-publish-command> [arguments...]
```

This guarded command is the only supported staging publication entry point for operators and repository-managed automation. Never invoke a staging publisher directly from a workflow, package script, runbook or shell. The release gate runs `pnpm run release:validate-automation` and fails if repository workflow configuration or the root package scripts contain a direct publisher invocation.

The guarded command reads `release-evidence/latest.json` and stops before invoking the publisher if the gate failed, the evidence covers another Git revision, the recorded source was dirty, or the current checkout is dirty. After validation, it supplies the verified revision to the staging publisher as `RELEASE_GIT_REVISION`. The staging publication command must preserve that environment value in the deployed API runtime. It does not replace reviewer approval. Production publication still requires the business owner and release owner approval in the cutover runbook.

Before relying on a new or changed repository publication workflow, run the dedicated staging-only verification with current passing evidence and the real staging publisher:

```bash
RELEASE_ENVIRONMENT=staging \
RELEASE_BASE_URL=https://staging.aiofusion.ai \
pnpm run release:verify-staging-publish -- <staging-publish-command> [arguments...]
```

The verification publishes once through the guarded entry point, waits for staging `/api/healthz` to report the approved `releaseRevision`, then temporarily substitutes mismatched evidence and confirms the same publisher is blocked. It restores the original evidence file before exiting. The command refuses non-staging URLs and environments.

This command applies only when staging has a non-interactive publisher command. The current Replit Publish button cannot be passed to the shell guard. Until the managed deployment build enforces the same evidence check, button-based publishing must be treated as an unguarded path and cannot satisfy this verification.

## Staging sign-off

After publishing the approved candidate to staging:

1. Confirm staging `/api/healthz` is ready and returns `releaseRevision`.
2. Confirm the deployment and database are labelled staging.
3. Check sign-in, an authorised workspace, and denied cross-workspace access using approved test accounts.
4. Review startup and request logs for new errors.
5. Test OAuth, email and Stripe only in their staging/test modes.
6. Compare the health response's `releaseRevision` with `gitRevision` in the approved `release-evidence/latest.json`. They must be the same full 40-character hash.
7. Record UTC time, release identifier, environment and pass/fail only.

If `releaseRevision` is absent or differs from the approved evidence, staging sign-off is NO-GO. Any failed critical journey, health regression, environment mismatch, unexplained error spike or data-integrity concern is also NO-GO for production.

## Post-production verification

Run only after an explicit production release. Never assume staging changes are already live.

1. Confirm production `/api/healthz`.
2. Confirm the published release identifier and canonical production domain.
3. Check approved public navigation and one non-destructive sign-in/workspace journey.
4. Observe health, startup, request, OAuth and webhook logs for at least 15 minutes.
5. Record UTC time, environment and pass/fail without credentials or customer data.

Trigger rollback for failed publication/startup, sustained health failure, authentication or workspace-isolation failure, critical integration failure, unexplained integrity/count changes, or a material error spike. Keep writes frozen where the cutover runbook requires it and use the approved Replit rollback path.

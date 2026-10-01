---
name: Validating Replit configuration edits
description: Safe edits to tracked Replit configuration, especially when it may contain private values.
---

Direct writes to `.replit` are blocked. Write the full modified TOML to a temporary workspace file and use `verifyAndReplaceDotReplit` to validate and replace it. If the existing file contains a credential, transform it without printing its contents, then confirm the temporary copy was removed.

**Why:** A direct write was rejected, and printing a normal diff would have exposed a credential-bearing deleted line.

**How to apply:** Use the validated replacement callback for configuration changes, and verify the result using presence checks and `git diff --check`, not a raw diff of sensitive lines.

Setting production-only, non-secret environment variables through Replit's environment tooling can also change the tracked `.replit` file. Do not change them while a release gate is running.

**Why:** The gate's tests and builds passed, but its final source-integrity check correctly rejected a configuration change made during the run.

**How to apply:** Set and verify intended production environment variables first, inspect changed key names without printing values, commit the tracked configuration, and only then start the release gate.

Workflow callbacks can automatically add every configured manual workflow to the
reserved `Project` aggregate. Clearing validation metadata alone does not keep the
Run button from launching tests, typechecking and a fresh full gate together.
`configureWorkflow` does not update that reserved aggregate.

**Why:** Consolidating completion validation still left the default Run action
executing the redundant checks in parallel.

**How to apply:** Inspect only the workflow section. Use a schema-validated
configuration replacement to select the intended Run workflow and narrow the
legacy aggregate. Preserve manual workflows, and regression-check both validation
metadata and the Run entry point after further workflow changes.
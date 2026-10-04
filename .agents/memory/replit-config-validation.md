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

Package-installation helpers may alter project configuration and scaffold a new language even when the install reports failure.

**Why:** A failed temporary PDF-validation tooling install introduced unrelated system dependencies and Python scaffolding into a frontend-only change.

**How to apply:** Review changed configuration keys without printing values, remove only unintended installer changes through the validated configuration workflow, and keep transient verification tools outside the app.

When copying configuration through the sandbox shell callback, normalise CRLF output before schema validation.

**Why:** Terminal-style output converted a source-identical configuration copy into an all-lines-changed diff.

**How to apply:** Preserve the repository's line endings and check that temporary tooling cleanup leaves no configuration change before committing.
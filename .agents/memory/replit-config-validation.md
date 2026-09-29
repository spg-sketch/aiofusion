---
name: Validating Replit configuration edits
description: Safe edits to tracked Replit configuration, especially when it may contain private values.
---

Direct writes to `.replit` are blocked. Write the full modified TOML to a temporary workspace file and use `verifyAndReplaceDotReplit` to validate and replace it. If the existing file contains a credential, transform it without printing its contents, then confirm the temporary copy was removed.

**Why:** A direct write was rejected, and printing a normal diff would have exposed a credential-bearing deleted line.

**How to apply:** Use the validated replacement callback for configuration changes, and verify the result using presence checks and `git diff --check`, not a raw diff of sensitive lines.
---
name: Replit button release guard
description: Why shell release guards do not protect button-based Replit publishing.
---

The Replit Publish button is a separate managed publication path and cannot be wrapped by a repository shell command. Do not treat a passing shell publisher verification as proof that button-based publishing enforces the same evidence.

**Why:** The staging workflow uses Replit's Publish button and has no non-interactive publisher command. The live staging deployment remained on the older build even after the guarded command and release gate passed locally.

**How to apply:** When release evidence must gate the real publisher, enforce it in the managed deployment build or another control that the Publish button necessarily executes. Verify the published health revision after the button-based release.
---
name: Replit button release guard
description: Why shell release guards do not protect button-based Replit publishing.
---

The Replit Publish button is a separate managed publication path and cannot be wrapped by a repository shell command. Do not treat a passing shell publisher verification as proof that button-based publishing enforces the same evidence.

**Why:** The staging workflow uses Replit's Publish button and has no non-interactive publisher command. The live staging deployment remained on the older build even after the guarded command and release gate passed locally.

**How to apply:** When release evidence must gate the real publisher, enforce it in the managed deployment build or another control that the Publish button necessarily executes. Verify the published health revision after the button-based release.

The revision reported by health must be fixed by the approved build artifact, not a mutable runtime environment value.

**Why:** A runtime override can make health report a revision other than the one the managed build actually approved.

**How to apply:** Pass the approved revision into the build, embed it in the API output, and prefer that embedded value when reporting deployed health.

Replit may append a source-identical publication commit after a successful Publish-button release. That changes HEAD even though the tested tracked files have not changed.

**Why:** A guard that compares only commit IDs rejected the next publication immediately after a successful one, despite identical Git trees.

**How to apply:** Accept prior passed release evidence across a clean, source-identical Git tree; reject any changed tree or dirty working copy. During the gate itself, still require the exact revision to remain fixed across every stage.
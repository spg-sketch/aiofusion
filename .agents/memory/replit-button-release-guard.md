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

Tracked generated files must be deterministic before a clean-tree release gate runs.

**Why:** A running preview server reordered an otherwise unchanged generated component registry, making source state dirty. The release check recorded failed evidence, and the Publish-button build correctly rejected it before compilation.

**How to apply:** Keep discovery/output ordering stable and verify a clean checkout after preview workflows start. Regenerate passing release evidence for the current source revision before publishing; do not bypass the managed build guard.

Finish tracked research and memory updates before the final release gate. They count as source changes even when no application code changes.

**Why:** A research note added after successful release validation left the working tree dirty and would block a subsequent managed publication.

**How to apply:** Commit all intended tracked notes before release validation, then avoid further tracked writes until publication. If investigation requires more notes, refresh approval for the resulting clean revision rather than bypassing the guard.

Task-completion validation runs before the completion callback creates its commit.

**Why:** A completion attempt with verified but uncommitted UI changes failed the clean-source release gate even though the full tests, type check and external code review passed.

**How to apply:** When completion includes the release gate, explicitly commit the verified change batch before requesting completion. Do not skip validation or relax the clean-source safeguard to work around the callback ordering.
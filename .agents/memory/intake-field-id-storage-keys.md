---
name: Intake field ids are storage keys
description: Why renumbering an intake question requires a localStorage remap migration, and how it is done.
---

In the AIO Fusion intake form, each field's `id` (e.g. "3.2") is BOTH the user-visible question number AND the key under which the answer is persisted in localStorage (`formData[id]`, plus `duals[id]`, `dualLists[id]`, the `optimisedFields` id array, and `preOptimiseSnapshot.{formData,duals,dualLists}`). Intake data is stored per project under keys starting `aio.intake.v2` (bare key + `aio.intake.v2::{projectId}`).

**Why:** renaming/renumbering a field id therefore orphans or misaligns every existing saved answer unless the stored keys are remapped. A shift like 3.2→3.3→3.4 also moves OTHER answers under the wrong labels, not just the renamed one.

**How to apply:** when moving/renumbering fields, add a flag-guarded remap that runs at MODULE LOAD (not in a useEffect) in App.tsx via the shared `remapStoredIntakeKeys(remap, flag)` helper, iterating every `aio.intake.v2*` key. Module scope is required so the rename completes before IntakeForm's useState initialisers read localStorage on a planner reload. Make the remap injective (build a fresh object from the old) to avoid collisions, order multiple steps correctly, and use a NEW flag per change (never edit an already-shipped migration's remap, since its flag may already be set in users' browsers/production). Also update: the backend OPTIMISE_FIELDS allowlist, the pushLines LLM-export block, any direct readers (e.g. getIcpProfile), hint text that cites a section number, and the test fixture.

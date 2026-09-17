---
name: Secret placeholders
description: Distinguish a registered secret name from a populated secret value.
---

A secret-existence result and an “Added” notification do not establish that a usable value has been saved.

**Why:** both reported a new secret as present while the Secrets UI showed it under “Configure missing Secret values” with an empty Value field. The verification process correctly reported it unavailable; advice to restart compute was premature.

**How to apply:** when runtime consumption reports a missing value, consider an unfilled placeholder before diagnosing propagation. Use the secure Secrets flow to supply the value, never chat or logs. Do not request a compute restart solely because inventory says the name exists.
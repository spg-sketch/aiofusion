---
name: Selective migration approval boundaries
description: Approved workspace separation and the distinction between planning and live import approval.
---

Do not create a separate beta Bluhalo workspace or reuse the same-named staging
Master workspace. Import the selected Bluhalo project under its approved target
owner without a Bluhalo account, company, membership, MFA or SSO identity.

**Why:** The staging schema requires every workspace slug to have a matching
legacy login account. The user chose workspace omission rather than creating a
non-human Bluhalo credential bridge.

**How to apply:** Preserve the selected project and its approved owner mapping,
but do not infer that project selection authorises a workspace or login record.
Final import approval must still identify the frozen manifest and destination.

Treat beta and staging AIO Demo as the same intended workspace, and beta and
staging admin as the same intended Master workspace, when preparing candidate
mappings.

**Why:** The user explicitly confirmed these shared workspace identities, unlike
Bluhalo's separate agency and Master workspaces. Name matching alone was not
sufficient evidence.

**How to apply:** Review reuse of the existing staging workspace without
overwriting credentials, permissions, memberships, settings or existing data.
Workspace identity confirmation does not approve human-identity merges or
broaden the selected-project allowlist.

When a protected legacy account is mapped to an existing Google-only identity,
retain the existing sign-in method and do not transplant the beta password.

**Why:** The user explicitly chose that policy for the legacy agency owner
mapping, to avoid adding a password-based sign-in path to an existing identity.

**How to apply:** Preserve existing credentials and memberships; treat new
workspace memberships as separately reviewed inserts. Preparation-policy
confirmation is not final import approval. Keep person-specific identifiers
in the restricted manifest, not in memory.

When a new workspace for an existing Google-only identity is required by the
legacy workspace foreign key, use a reviewed bridge account with a deterministic
invalid password sentinel rather than a real or copied password hash.

**Why:** A legacy account row is structurally required, but adding a usable
password would weaken the approved SSO-only identity policy.

**How to apply:** Keep the provider identity in the existing human-user record,
verify the sentinel cannot pass the password verifier, and bind retries to the
frozen snapshot-ID map and atomic provenance.
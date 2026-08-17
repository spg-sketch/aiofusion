---
name: Agency partner clients are permanently managed
description: Product/security rule - clients under an agency parent never hold their own credentials
---

Clients whose parent account role is "agency" are permanently managed: they never receive, choose, or mint a sign-in of their own; the agency uses "Client projects" (impersonation) and billing stays with the agency.

**Why:** Product decision for agency partner resellers; a hidden UI control is not enforcement — completion reviews rejected this feature twice for server-side bypasses (caller-supplied password on create; self-target password set).

**How to apply:** Any new credential-issuance path (password set/change/reset, access grant, invites) must consult the server-side partner-client predicate for the TARGET, including self-targeted requests, and creation must discard caller-supplied passwords. Legacy parents with role "user" deliberately keep the old grant/welcome flows. Known gap tracked separately: pre-existing partner clients with leftover passwords can still log in.

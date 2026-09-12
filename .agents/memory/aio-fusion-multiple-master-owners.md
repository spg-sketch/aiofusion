---
name: Multiple Master Owners
description: Product and security rules for adding more than one Owner to the Master workspace
---

The Master workspace may have multiple Owners and unlimited internal team members, but there is only one Master workspace: the canonical `admin` company. Promoting a new Owner must preserve every existing Owner. Team seat caps apply only to Agency Partner and Client workspaces.

Only a current canonical Owner of the Master workspace may promote an existing member to Owner. The sole bootstrap exception is the original active legacy `admin` identity in the canonical `admin` workspace when no named Owner is available. Owner status cannot be granted through invitations, ordinary Admin permissions, an email domain, or the separate agency-level master-owner flag. Existing Owners cannot be demoted or removed through normal team controls.

**Why:** Multiple authorized owners need to retain full ownership concurrently, including destructive account controls, while internal Master staff are not customer-account seats. Restricting promotion to current owners in the canonical Master workspace prevents stale roles or staff allowlists from granting destructive access to customer companies.

**How to apply:** Treat Owner promotion as an exceptional Master-workspace-only role change. Recheck the acting Owner and target membership server-side under the workspace lock, force unrestricted workspace access, and reject Owner roles in every invitation path. Never enforce or display a numeric team-seat limit for the canonical Master workspace. Keep the legacy bootstrap predicate restricted to the exact `admin` account and workspace. At the authentication boundary, an `admin` role belongs only to that canonical workspace; ordinary companies with stale `admin` data must receive agency-level access. Staff allowlists add restricted membership to `admin`, never promote the staff member's own company.
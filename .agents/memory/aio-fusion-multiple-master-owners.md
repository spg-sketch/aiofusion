---
name: Multiple Master Owners
description: Product and security rules for adding more than one Owner to the Master workspace
---

The Master workspace may have multiple Owners and unlimited internal team members, but there is only one Master workspace: the canonical `admin` company. Promoting a new Owner must preserve every existing Owner. Team seat caps apply only to Agency Partner and Client workspaces.

Only a current canonical Owner of the Master workspace may promote an existing member to Owner. The sole bootstrap exception is the original active legacy `admin` identity in the canonical `admin` workspace when no named Owner is available. Owner status cannot be granted through invitations, ordinary Admin permissions, an email domain, or the separate agency-level master-owner flag.

The former blanket protection of existing Master Owners was intentionally replaced: a current named Master Owner may demote or remove another Owner, but never themselves or the last named Owner. Legacy bootstrap authority is not Owner-management authority. Agency Partner and Client ownership protections are unchanged. Removing membership is not deleting the human identity or other workspace data.

Automatic provisioning must respect deliberate membership revocation, even for otherwise eligible staff. Eligibility is a prerequisite for access, not an instruction to restore removed access. Apply the same workspace lock to provisioning and removal so a concurrent login cannot undo revocation; do not broaden identity eligibility while implementing this rule.

No-regrant verification must follow authentication through session resolution, not merely assert that the membership row remains absent. Named sessions without membership must never inherit the full-access behaviour reserved for userless legacy sessions. A deliberate new invitation may restore membership without erasing the historical automatic-provisioning revocation decision.

**Why:** Multiple authorised Owners need ongoing control over who retains ownership without changing the approved identity roster. Staff eligibility and deliberate access decisions are separate: startup backfills must not silently reverse an Owner's removal decision. An absent membership alone does not establish denied access when legacy session fallbacks exist. Internal Master staff are not customer-account seats.

**How to apply:** Treat Owner management as exceptional Master-workspace-only authority. Recheck actor, target, workspace and remaining named Owners under the workspace lock. Preserve unrestricted access for Owners and reject Owner invitations. Keep the legacy bootstrap predicate restricted to the exact `admin` account and workspace. At the authentication boundary, an `admin` role belongs only to that canonical workspace; ordinary companies with stale `admin` data must receive agency-level access. Staff allowlists add restricted membership to `admin`, never promote the staff member's own company.

Staging and production have separate human and workspace identifiers. A verified staff Google identity on staging can still lack its Master membership; never treat an email domain or production role alone as a staging access grant. An explicitly approved restoration of matching Master Owner memberships resolved the affected staging sign-ins, with each person then setting up their own staging authenticator.

**Why:** Staff sign-ins failed after access checks required an actual membership, while production had the memberships and staging had only the Google-linked identities. The affected users confirmed the approved restoration worked, but needed fresh authenticator setup.

**How to apply:** Compare authorized roles and revocation state before staging-only access repair. Match staging identities and company IDs locally rather than copying foreign keys across databases. Expect individual staging MFA enrollment; do not copy production factors or weaken MFA.
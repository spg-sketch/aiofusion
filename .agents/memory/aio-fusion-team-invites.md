---
name: AIO Fusion team invites + membership roles
description: How agency team invitations, 5-tier membership roles, and per-member project access are enforced
---

- `platform_invitations` (single-use token, 7-day TTL) + `platform_memberships.project_access` (JSON array, NULL = all projects) added by `ensure-platform-schema-v4.ts`.
- Membership role rides on the session: `getPlatformSessionAccount` resolves `membershipRole`/`projectAccess` from platform_memberships (userId + activeCompanyId); legacy sessions get undefined = full access (treated as owner).
- Enforcement layers:
  - `lib/member-guards.ts` centralises role/allowlist checks (guardProjectRead/Write, inAssignedScope, restrictToAssigned, `memberProjectGate`). Applied across store.ts, store-content.ts, store-audits.ts, media-db.ts. Any NEW project-data route must use these — code review rejects partial coverage.
  - `blockReadOnlyMembers` middleware in `routes/index.ts` is path-scoped to `/diagnostic`, `/seo-audit`, `/llm-check`, `/ai-assist`, `/content` — do NOT mount it unscoped, it blocks store reads for viewers.
- Seat limit: platform_meta key `account:team-seats:<slug>` (default 3), counts members + pending invites.
- SSO invite acceptance: `?invite=<token>` on OAuth auth start → `aio_invite` cookie → callback calls `handleSsoInvite`; SSO email must match invited email exactly (email-bound).
- `createPlatformSession` revokes per `user_id` NOT per slug — multiple team members share the slug. Don't reinstate slug-wide revocation.
- `BillingOnlyPage` full-page gate in App.tsx for billing members.
- `index.ts` awaits `runStartupMigrations()` BEFORE `app.listen` — never race schema DDL.
- PGlite test fixtures for membership must include `project_access` column in all DDL fixtures; new membership columns must be added to all fixtures.

- Session list/revoke endpoints must scope by per-human `userId`, never the shared workspace slug (`platform_sessions.username`) - slug scoping leaks and lets any member revoke colleagues' sessions.

**Ownership on seat assignment:** invite/PATCH/resend validate projectIds against a downward-only owned set (self + descendant sub-accounts, NOT getVisibleUsernames which includes the parent); client-mode invites null out projectAccess before storage. The "Client projects" shortcut stash must only suppress the leftover account_section=clients deep-link, never other sections (security/billing email links).

**Invite email delivery is part of the transaction boundary:** await `sendTeamInviteEmail` and treat both thrown errors and Resend's returned `error` field as failures. A failed first send retires the new invite; a failed resend restores the previous token and expiry.

**Why:** Resend commonly reports provider rejection in its resolved response rather than throwing. Fire-and-forget sending can therefore show "Invitation sent" and consume a seat even though the recipient never received a usable link.

**How to apply:** any new invitation email path must expose delivery success to its caller and keep invitation state consistent with the link the recipient actually received.

**Signed-in identity rule:** A public invitation must never silently replace a valid browser session belonging to a different person. Reject the acceptance before creating a user or consuming the token, then let the visitor explicitly sign out and retry from the same invite URL.

**Why:** Invitation links are often opened from email in a browser that still carries the inviter's or another colleague's session. An implicit identity switch is confusing and makes it difficult to tell who actually joined.

**How to apply:** Compare any valid session's human user email with the invitation email on the server. Same-user sessions may continue; different or legacy user-less sessions must sign out first. Keep the invite unconsumed on rejection.

**Member identity wording:** A team member enters another organisation's workspace, so the organisation/account display name must be labelled "Workspace", never "Signed in as". Show the member's access role separately.

**Why:** Calling the workspace name the signed-in identity makes invited members reasonably believe they have been logged in as the owner.

**How to apply:** Any account card or workspace switcher must distinguish the active workspace from the human user and membership role.

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

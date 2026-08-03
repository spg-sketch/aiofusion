---
name: AIO Fusion team invites + membership roles
description: How agency team invitations, 5-tier membership roles, and per-member project access are enforced
---

# Team invites + membership roles

- `platform_invitations` (single-use token, 7-day TTL) + `platform_memberships.project_access` (JSON array, NULL = all projects) added by `ensure-platform-schema-v4.ts`.
- Membership role rides on the session: `getPlatformSessionAccount` resolves `membershipRole`/`projectAccess` from platform_memberships (userId + activeCompanyId); legacy sessions get undefined = full access (treated as owner).
- Enforcement layers:
  - `lib/member-guards.ts` centralizes role/allowlist checks (guardProjectRead/Write, inAssignedScope, restrictToAssigned, `memberProjectGate` method-based router middleware). Applied across `store.ts`, `store-content.ts` (archive/planner/scoring-config), `store-audits.ts` (all /store/projects/:id/* audit routes), `media-db.ts`. Any NEW project-data route must use these — code review rejects partial coverage.
  - `blockReadOnlyMembers` middleware in `routes/index.ts` path-scoped to `/diagnostic`, `/seo-audit`, `/llm-check`, `/ai-assist`, `/content` — do NOT mount it unscoped, it would block store reads for viewers.
- Seat limit: platform_meta key `account:team-seats:<slug>` (default 3), counts members + pending invites; master-admin endpoint `/platform/team/seat-limit`.
- SSO invite acceptance: `?invite=<token>` on Google/Microsoft auth start → `aio_invite` cookie → callbacks call `handleSsoInvite` which requires the SSO email to match the invited email exactly (email-bound invites).
- **Why:** invites bind role + project access at accept-time; sessions revoked immediately via `incrementSessionVersion` on role change/removal.

## Critical fix included
`createPlatformSession` used to delete ALL sessions for the workspace slug ("one session per account"). With teams, multiple humans share the slug — revocation is now per `user_id` (legacy userless sessions still revoke per-slug among userless only). Don't reinstate slug-wide revocation.

## Frontend
- `TeamSection.tsx` rendered inside SubAccountsPage for owner/admin members only; `InviteAcceptPage.tsx` gated in App.tsx via `/?invite=` captured on mount (history-sync rewrites the URL right after, so capture in a useState initializer).
- Billing members get `BillingOnlyPage` full-page gate in App.tsx; there's no invoice system — it's a contact-billing placeholder.
- `Session` type now carries `membershipRole`/`projectAccess` from `/platform/me`.

## Startup migrations
`index.ts` now awaits `runStartupMigrations()` (sequential ensure* steps incl. v4) BEFORE `app.listen` — requests must never race schema DDL. Add new ensure* steps to that list, not as post-listen fire-and-forget.

## Typecheck gotcha
`chart.tsx`/`input-otp.tsx` (shadcn copies in aio-fusion AND mockup-sandbox) break under @types/react 19.2.x unless ChartTooltipContent uses `RechartsPrimitive.TooltipProps<ValueType, NameType>` and the OTP context is cast; stale tsbuildinfo/node_modules can hide these until a fresh `pnpm install`.

## Testing
- `routes/team.test.ts` PGlite fixture needs projects table WITH name/intake/logo columns (store list route selects intake JSON) and memberships with `project_access`; the other 3 PGlite fixtures were patched to add `project_access` too — new membership columns must be added to all test DDL fixtures.

# Personal MFA rollout and assisted recovery

## Publication boundary

This change is code prepared in the development workspace. It does not publish
the app, reset a real person, migrate a live credential, import beta identities,
or change the approved Master roster. A preview or disposable-fixture test is
not evidence that staging or production is running this version.

Before any live action, obtain explicit approval naming the environment,
deployment, affected person, action and change/recovery reference. Verify the
published version and domain separately. Do not test the production domain when
only development or staging contains this change.

## Invariants

- The authenticated user's stable ID owns their authenticator, recovery codes,
  trusted devices, lockout and security generation. Workspace membership and
  project ownership remain unchanged.
- Every current canonical Master member must satisfy personal MFA, including a
  Viewer. Owners do not share factors. Other workspaces retain opt-in MFA.
- Password, Google and Microsoft all enter the same personal protection
  boundary. Google's own two-step verification is not a replacement for this.
- Existing workspace MFA is not assigned to the first Owner. Shared secrets are
  never cloned, and legacy trusted devices are never imported into personal MFA.
- Legacy userless non-Master identities remain isolated. Never restore the
  retired shared Master bootstrap identity or grant membership to recover MFA.
- A pending login or session from before a personal reset is not a recovery path.
  Reset requires fresh primary sign-in and personal re-enrolment.

## Approval and retained Owner access

1. Inventory the target environment read-only. Confirm the approved Master
   roster and current roles against the independently approved access plan.
   Preserve revoked memberships and all retained identities. Do not infer Owner
   privileges from email domains or recreate deleted memberships.
2. Arrange an attended window with at least one authorised named Owner who can
   complete their current password/SSO sign-in and demonstrate their existing
   factor, or whose individual recovery has been independently verified and
   explicitly approved. Record the verification reference, never a code.
3. Prepare that Owner's personal factor before enabling the new application
   version for the rest of the roster. With ambiguous shared MFA, approve only
   that verified Owner's individual recovery first. Keep the existing release
   available until the named Owner successfully completes personal enrolment
   in the new release and saves recovery codes.
4. Do not reset all Owners together. After the first Owner's verified access,
   recover/enrol the other approved members one at a time through the named
   member control. Keep another Owner's working factor and saved recovery path
   throughout. If no named Owner has a verified path, stop before publication.
5. A database backup is not permission to restore revoked access. Do not roll
   back factor/generation records wholesale after a reset. If code rollback is
   needed, assess whether the older version understands personal MFA first;
   otherwise pause access and use an approved forward recovery.

## Read-only migration inventory

Use the normal approved environment/secrets workflow to select the database.
The tool uses the already-selected `DATABASE_URL`; it does not select staging
or production from the label, and never prints connection strings.

```sh
pnpm --filter @workspace/api-server exec tsx scripts/migrate-personal-mfa.ts \
  --environment=staging --workspace=admin
```

The default is **dry-run**. Check the returned database fingerprint independently
against the approved environment. The environment flag is an operator label, not
proof of where the database is hosted. Treat the roster output as restricted
operational data, not public documentation.

Classification:

| Classification | Action |
| --- | --- |
| `no-enabled-factor` | Normal personal enrolment; no factor needs moving. |
| `legacy-only` | Preserve the isolated legitimate legacy identity. Never create a user merely to copy its secret. |
| `attributable-proof-required` | Exactly one verified Owner is attributable; require their existing authenticator or unused recovery code, then atomically move, not copy, the factor. |
| `ambiguous-personal-recovery-required` | Independently verify each affected person and explicitly authorise their recovery. Keep the legacy state intact; never distribute its secret. |

Ordinary protected workspaces also require transition approval/proof. The
absence of a personal factor must not silently turn their previous MFA off.

## Explicit operator-assisted transition

No application startup or post-merge hook runs this command. After approval,
use the fingerprint from the reviewed dry-run, current user IDs from that roster,
and the exact target email. Never put authenticator/recovery codes in shell
arguments, chat, logs, tickets or environment variables.

```sh
pnpm --filter @workspace/api-server exec tsx scripts/migrate-personal-mfa.ts \
  --environment=staging --workspace=admin --apply --action=recovery \
  --database-fingerprint='<reviewed fingerprint>' \
  --operator-user-id='<verified Master Owner ID>' \
  --target-user-id='<verified target ID>' \
  --confirm-target-email='<exact target email>' \
  --approval-reference='<non-secret authorisation reference>' \
  --owner-access-verified
```

`--owner-access-verified` attests to the retained-access procedure above; it must
not be supplied merely to bypass a command error. For an attributable move,
choose `--action=move` instead. The command prompts for existing-factor proof in
a hidden interactive terminal. Only the affected person should provide it.

Dry-run can be repeated safely. Apply uses durable transition markers; a retry
after successful transition must not reset the person's newly enrolled factor.
Re-run dry-run and verify state after interruption. Do not infer failure merely
from a lost terminal response or repeat a different reset command to compensate.

## User-assisted enrolment (including Natalie)

This is a procedure, not a performed reset.

1. Independently verify the person's identity using the agreed support process.
   Do not accept possession of a workspace slug or an unverified email message
   as proof. Confirm the exact existing identity and retained membership.
2. A current named Master Owner opens Team, selects that individual, confirms
   the displayed email and acknowledges independent verification.
3. Explain before confirming: only that person's factors/trust are cleared;
   their sessions and pending challenges stop working. Their identity, projects,
   membership role and the shared Master workspace remain.
4. The person starts a fresh sign-in with their usual password, Google or
   Microsoft method. An old challenge link or old browser session will not work.
5. Check the personal email shown on setup. Scan the personal QR code into their
   own authenticator, then enter its current six-digit code.
6. Copy or download the newly generated recovery codes into a private secure
   place. Acknowledge saving them before continuing. Codes are shown only now,
   are single-use and cannot be retrieved later in plaintext.
7. Sign out and sign back in to confirm their own factor works. Verify the
   workspace data and role are unchanged. The assisting Owner should separately
   confirm their own factor still works.
8. Confirm the affected human received the security notice. Never forward
   another Owner's QR code or recovery codes as a workaround.

## Staged verification checklist

Use disposable identities, not the approved real people, for automated tests.
Use a three-member canonical Master fixture with two Owners and one Viewer.

- Each person gets distinct setup secrets/codes and cannot use another's factor.
- Password and both mocked OAuth providers require the same personal boundary.
- Master invitations accepted through password, Google or Microsoft must also
  complete personal enrolment/verification before entering the workspace. If a
  consumed invitation's MFA step is interrupted, resume through normal sign-in,
  not by reissuing membership or accepting the same invitation again.
- Reuse one browser's trust cookie as another person: it must not bypass MFA.
- Concurrent use of a recovery code succeeds once; concurrent setup never
  overwrites an enabled factor or returns multiple sets of active codes.
- Reset only one target: their trust/session/pending token fail; others still
  work and all identities, projects and memberships remain.
- Viewer, non-Owner, stale Owner and support/impersonated requests cannot reset.
- Old sessions and workspace switches cannot enter Master without assurance.
- Simulate partial transition and restart/retry: approved personal factors remain
  intact; unapproved shared cases remain gated.
- Verify failures to read security state fail closed rather than issuing access.
- Save-code acknowledgement, copy/download errors and personal labels work in
  the browser, without analytics or persistent-browser storage of codes.

Record exact commands, fixture environment and results. Real Google/Microsoft
redirects, mail delivery and the target published domain need a separately
approved staging rehearsal; unit tests with mocked providers do not prove them.

## Development verification performed

The implementation was checked using isolated PGlite API fixtures and mocked
provider responses, plus frontend component tests. No migration command was
applied to a live database and no real person's MFA was reset.

- API coverage includes three separate Master members, both OAuth providers,
  password login, concurrent recovery/enrolment, per-person trust and reset,
  stale session/pending-token rejection, workspace switching, verified-recipient
  notices, migration proof and idempotent partial recovery. Master invitation
  enrolment and verification are covered for password, Google and Microsoft,
  including successful authoritative session lookup after MFA.
- Team/migration tests include concurrent recovery approvals, retained factors
  after retry, revoked/demoted/unverified operators, removed target memberships
  and secret-free actor/target audit records.
- A single browser pass intercepted all API traffic with synthetic responses.
  It confirmed personal QR/email display, save acknowledgement gating, actual
  clipboard copy and file download, absence of secrets/codes in persistent
  browser storage or URLs, and distinct setup after switching synthetic people.
- That browser pass did **not** exercise the Team reset form. Component tests
  cover its named confirmation and request contract. Its OAuth-recovery case
  was inconclusive because the synthetic `/me` fixture restored a signed-in
  identity; a separate unauthenticated development screenshot showed the
  recovery explanation correctly. Do not describe that as a real OAuth test.
- The API and web development workflows built and started successfully. Real
  provider redirects, email delivery and published-domain behavior remain for
  the separately approved staging checklist above.
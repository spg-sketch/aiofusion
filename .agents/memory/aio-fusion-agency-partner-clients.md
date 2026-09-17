---
name: Agency partner clients are permanently managed
description: Product/security rule - clients under an agency parent never hold their own credentials
---

Clients whose parent account role is "agency" are permanently managed: they never receive, choose, or mint a sign-in of their own; the agency enters their project workspace directly and billing stays with the agency.

**Agency product model:** One agency client represents one billable project workspace, not a container for multiple projects. Separate account records may remain an internal access boundary, but must not imply additional nested project capacity.

**Why:** The user explicitly clarified that each PR agency client should use one of the agency plan's three included project slots; a client count beside a separate zero-project count misrepresents that model.

**How to apply:** Treat the one-client/one-project relationship as a product requirement, not an assumption that existing code enforces it. Preserve agency-wide purchased allowances and existing records; never silently merge or delete older multi-project client data when applying the rule.

**Why:** Product decision for agency partner resellers; hiding a UI control is not enforcement — direct API calls (caller-supplied password on create, self-targeted password set, forgot-password links) are the real attack surface.

**How to apply:** Any new credential-issuance or session-entry path must consult the hierarchy for the TARGET, including self-targeted requests and existing sessions. Migrated children may have role "user", not "client", so checking only canonical child roles misses legacy credentials. Legacy parents with role "user" deliberately keep the old grant/welcome flows. Authorized management requires a live original operator session with permission to manage the target.

**Agency UX rule:** Present these records as managed clients, not client login accounts. Creation and "Open Project Hub" always open the client's hub, including when it has exactly one project. Only explicit project links open individual projects. This supersedes the earlier sole-project auto-open convention. Direct client users retain independent account settings.

**Why:** Agency users work on behalf of clients and should not pass through a client-account settings screen to reach project work. The server-side session swap remains the security boundary, but the visible journey should feel like opening a managed client project, not logging in as another person.

**Billing rule:** Managed client records and hub entry do not consume capacity. Enforce agency-root allowances on project creation, never on opening a hub. Capacity handling must return to agency billing, not client billing.

**Why:** A full plan must not prevent reading an existing client's workspace; only creating a project consumes a slot.

**Transition recovery rule:** A failed response can arrive after the server has switched the cookie. Reconcile the server-confirmed workspace and original operator before retrying a session transition; local handoff/reload failures must not perform another switch.

**Why:** Blind retries can be rejected as nested impersonation and leave the old UI displaying a different server session.

**Handoff compatibility:** Agency and Master administration share the reload destination contract but not the same product behavior: agency row actions always open the hub, while Master "View account" retains sole-project auto-open.

**Why:** Tightening the handoff consumer without updating every producer previously broke Master navigation despite passing agency-only tests.

**How to apply:** When changing the handoff contract, search every writer and include a producer-to-consumer regression rather than asserting hand-crafted payloads alone.

**Creation recovery rule:** Treat an uncertain create and a failed hub handoff as separate operations. Recover the original create before allowing draft changes; a later authorization failure does not prove the earlier create failed.

**Why:** An API response can disappear after commit. Changing the request identity on an edited draft can then create a second client, while repeating creation after confirmed success confuses navigation failure with data failure.

**How to apply:** Keep the original request identity and effective input together until confirmation. Keep welcome-email delivery outside the required account transaction and do not resend it merely because creation is replayed.

**Receipt security rule:** Never include passwords in an unkeyed request fingerprint, even if only the digest is persisted.

**Why:** Known surrounding request fields turn a fast digest into an offline password verifier, bypassing the account's salted slow password hash. Compare passwords through the protected verifier separately, or use a properly secret-keyed digest.

---
name: Agency partner clients are permanently managed
description: Product/security rule - clients under an agency parent never hold their own credentials
---

Clients whose parent account role is "agency" are permanently managed: they never receive, choose, or mint a sign-in of their own; the agency enters their project workspace directly and billing stays with the agency.

**Why:** Product decision for agency partner resellers; hiding a UI control is not enforcement — direct API calls (caller-supplied password on create, self-targeted password set, forgot-password links) are the real attack surface.

**How to apply:** Any new credential-issuance path (password set/change, forgot/reset links, access grant, invites) must consult the server-side partner-client predicate for the TARGET, including self-targeted requests; creation must discard caller-supplied passwords; forgot-password must stay enumeration-safe (ok:true) while issuing nothing. Legacy parents with role "user" deliberately keep the old grant/welcome flows. Known gap tracked separately: pre-existing partner clients with leftover passwords can still log in.

**Agency UX rule:** Present these records as managed clients, not client login accounts. Do not show last-sign-in status or credential actions. Keep no-project clients in Clients only, never as placeholder cards in the Project Hub. Use one consistent "Go to client" action regardless of project count: open the sole project directly, or open the client's Project Hub when there are zero or several. Listed project names also open that project directly. The Hub contains real projects only. Direct client users keep their own Profile, Sign-in & security, Billing, and Team account settings.

**Why:** Agency users work on behalf of clients and should not pass through a client-account settings screen to reach project work. The server-side session swap remains the security boundary, but the visible journey should feel like opening a managed client project, not logging in as another person.

**Billing rule:** Managed client records do not consume plan capacity; project workspaces do. Before entering a no-project managed client, check the agency billing root's effective project allowance. If it is full, keep the user in the agency workspace and open Billing, because managed client workspaces have no billing access.

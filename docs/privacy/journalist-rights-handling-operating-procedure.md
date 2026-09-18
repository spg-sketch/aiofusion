# Journalist privacy rights-handling operating procedure

**Status:** Draft operating procedure - **legal and policy approval pending**  
**Accountable owner:** [privacy owner]  
**Fallback:** [named trained delegate]  
**Response target:** one calendar month from receipt, subject to a documented
and legally approved extension where permitted.

> This procedure describes an internal control process. It is not legal advice,
> does not promise a legal outcome, and shipping the related feature does
> **not** establish GDPR compliance.

## 1. Scope and request types

Use this procedure for account-free journalist requests for **access,
correction, objection, or removal**. Do not use it as a public lookup,
unauthenticated contact-edit route, or default identity-document collection
process. A request may concern shared reference data or one workspace's
private data; never widen the scope without explicit review.

## 2. Intake and immediate controls

1. Accept the public form and accessible alternative at [email/postal/phone].
   Bound inputs and rate-limit abuse using the trusted proxy-aware client
   identity. Do not log request contents, identity evidence, or whether a
   matching record exists.
2. Create the case **before** sending any notification. Generate an
   unguessable case/reference token and store only the minimum case data.
3. Send a neutral confirmation: receipt is acknowledged, but it must not say
   whether the named person or email exists. Notify the assigned privacy owner
   without unnecessary personal data.
4. Set `received_at` and calculate `due_at` as one calendar month from receipt.
   Record the timezone and the exact dates. Flag overdue cases daily; a
   notification failure is visible and retried without losing the case.
5. Assign to the privacy owner. If unavailable, the named fallback accepts the
   case and records the handover. Assignment is not authorisation to disclose
   or change data.

## 3. Verification and triage

Record the verification method, evidence summary, reviewer, timestamp, result
and confidence - never store identity documents by default.

- Email ownership alone does **not** prove entitlement to the records.
- Ask for proportionate corroboration appropriate to the request and risk.
- If identity or scope is uncertain, mark **needs human review**, do not
  enumerate records, and ask a neutral clarification question.
- Verify whether the request concerns shared data, a named workspace, or both.
  A private-workspace deletion cannot silently become platform-wide suppression.
- Escalate suspected impersonation, coercion, sensitive data, legal demand,
  child/vulnerable-person concern, or conflicting controller instructions to
  the privacy owner and legal adviser.

Permitted verification states: `not_started`, `in_progress`, `verified`,
`uncertain`, `failed`, `not_required` (only where the owner records why).

## 4. Review, decision and application

Only an authorised writable Master reviewer may decide an access disclosure or
destructive/canonical data change. Restricted Master members, ordinary members
and other workspaces cannot read or resolve cases or enumerate suppression
records.

1. Review the verified identity, requested scope, source/provenance and
   processing purpose. For correction, use the existing steward trusted-data
   workflow; do not create a competing correction queue.
2. Record `approved`, `partially_approved`, `rejected`, or `unable_to_confirm`,
   plus reason, scope, reviewer and approval timestamp. Access and destructive
   decisions require explicit approval recorded in the case.
3. Apply an idempotent, concurrency-safe outcome and re-check suppression at
   write time. Cover live rows, import provenance, discoveries, source checks,
   recommendation/outreach snapshots and exports as applicable.
4. For removal, erase or redact personal payloads where approved while
   preserving a minimal audit chronology. Do not rewrite independent editorial
   facts merely to make a record look consistent.
5. If a documented lawful hold applies, record its authority, data scope,
   start/review/end dates and approver. Do not silently skip deletion or claim
   it is complete. **Hold rules and approval are pending legal confirmation.**
6. Record a completion result for every affected copy, including “not found”,
   “already redacted”, or “blocked by approved hold”. Never invent source
   checks, verification dates or provenance.

## 5. State transitions and escalation

Allowed transitions:

`received -> assigned -> verification_in_progress -> verified|uncertain|failed`

`verified -> under_review -> approved|partially_approved|rejected|unable_to_confirm`

`approved|partially_approved -> applying -> resolved`

`uncertain|failed|unable_to_confirm -> awaiting_requester|escalated -> under_review`

Every transition appends an immutable audit event with actor, timestamp,
previous/new state, reason and scope. No event is deleted when a contact is
deleted. Escalate to the accountable owner immediately for an overdue case,
notification failure after retry, cross-workspace scope, conflict between
controllers, suspected abuse, restoration reintroducing suppressed data, or
any legal hold. Legal interpretation, controller/processor classification,
retention periods and extension rights remain **pending legal approval**.

## 6. Notifications and closure

- Notification templates must remain neutral and disclose no database match.
- Send only the minimum necessary case status and outcome; do not include
  unrelated journalist records.
- On delivery failure, expose the failure to the privacy owner, retry through
  the approved channel, and retain the case.
- Close only after the reviewer records verification, decision, scope,
  affected-copy completion, hold status, notification result, due-date outcome
  and any escalation.
- A requester can use the case reference to ask a follow-up, but the reference
  is not an authentication credential.

## 7. Retention and restore controls

Retention periods for case data, audit events, suppression identifiers,
backups and legal holds are **TBD and pending legal approval**; this procedure
must not invent them. Until approved, minimise payloads and restrict access.

The backup/restore owner must document backup retention, restore access,
suppression replay, post-restore verification and incident escalation.
Restoration must not silently reintroduce an upheld suppression/removal. The
technical safeguard, test cadence and accountable infrastructure owner are
**pending infrastructure and legal approval**.

## 8. Required case fields and audit checklist

`case_id`, request type, received/due timestamps, scope, requester contact,
verification state and evidence summary, assigned owner/fallback, state
history, reviewer decision/reason/scope, affected copies, hold details,
notification attempts/failures, completion result, closure timestamp, and
links to the approved correction workflow.

Before approval, confirm:

- [ ] identity and scope are proportionately verified;
- [ ] neutral enumeration-safe response is prepared;
- [ ] authorised reviewer and explicit approval are recorded;
- [ ] one-calendar-month target and overdue status are tracked;
- [ ] import, discovery, recommendation, export and enrichment reintroduction
      checks are covered;
- [ ] audit chronology survives redaction;
- [ ] holds and backup/restore safeguards are recorded, not assumed;
- [ ] legal approval status is visible as pending where unresolved.

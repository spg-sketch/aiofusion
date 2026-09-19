---
name: Journalist privacy outcomes
description: Durable safety rules for rights cases, redaction and suppression enforcement.
---

Privacy requests never prove that a record exists. Disclosures and data changes require verified identity, explicit human approval, confirmed matches and a deliberately chosen scope. A workspace decision must never affect shared data or another workspace implicitly.

**Why:** Email ownership alone does not establish entitlement to another person's records, name-only matching is ambiguous, and media identities survive in imports, discoveries, provenance, recommendations and outreach snapshots after an ordinary contact deletion.

**How to apply:** Preserve case chronology while redacting personal payloads. Enforce the approved scope at every processing boundary, including delayed writes and external-provider work. Treat access as an accounting exercise across all in-scope copies, not a canonical-row export. Route corrections through the existing trusted-data review process.

List endpoints must load the applicable shared/workspace suppression hashes once per request and reuse an in-memory matcher. Never run one suppression query per contact; it turns privacy enforcement into an N+1 latency failure while providing no stronger protection.

**Why:** The Media Database contacts route reached 25+ seconds because it queried suppressions separately for every contact. One scoped read preserves fail-closed matching semantics without the query amplification.

**How to apply:** Keep email, LinkedIn, and name-plus-outlet matching unchanged; scope the batch to shared records plus the processing workspace. Production query failures must still fail closed rather than returning unfiltered contacts.
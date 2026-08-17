---
name: PGlite transaction limitations
description: Queries that deadlock inside db.transaction() + FOR UPDATE in PGlite's single-connection model
---

# PGlite Transaction Limitations (FOR UPDATE context)

## The Rule
Never call these inside `db.transaction()` when the transaction already holds a `FOR UPDATE` lock:
1. Any query using `isNotNull(column)` — hangs indefinitely (PGlite deadlock)
2. `getOwnedProjectIds(slug)` — uses plain `db` internally, deadlocks on the single connection

## What Works Fine Inside `db.transaction(tx)`
- `countAccountPoolSeats(companyId, tx)` — uses `isNull(projectAccess)`, simple COUNT — OK
- `countSeatsUsed(companyId, tx)` — uses `isNull(projectAccess)`, simple COUNT — OK
- `tx.select()...where(eq(...), isNull(...), gt(...))` — basic conditions without `isNotNull` — OK
- `tx.update(...).where(...)` — writes — OK

## Pattern: Pre-compute Before the Transaction
```typescript
// BEFORE db.transaction():
const ownedProjectIds = await getOwnedProjectIds(company.slug); // uses plain db - OK outside
const holders = await getProjectSeatHolders(company.id);        // uses isNotNull - OK outside

// INSIDE db.transaction(async (tx) => { ... }):
// Use pre-computed values; do NOT call getOwnedProjectIds or getProjectSeatHolders with tx
if (ownedProjectIds !== null && projects.some(id => !ownedProjectIds.has(id))) { ... }
```

## Why
PGlite has a single database connection. `db.transaction()` acquires and holds that connection for the transaction duration. Any call to plain `db` (not `tx`) inside the transaction tries to acquire the same connection and deadlocks. For `isNotNull`, the drizzle-orm/PGlite combination produces a hang (not an error) — the cause is not fully diagnosed but the workaround is reliable.

**Why:** Discovered while adding atomic seat-cap enforcement to the team resend handler. The account-pool path (isNull-based COUNT queries) worked fine; the project-pool path (isNotNull-based queries, LEFT JOIN, getOwnedProjectIds) deadlocked.

**How to apply:** Whenever writing a new `db.transaction()` handler that needs project-access data or ownership checks, pre-compute those values before the transaction block and capture them in the closure.

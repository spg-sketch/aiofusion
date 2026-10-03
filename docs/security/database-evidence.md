# SQL and second-order data review

## Connection and query model

`lib/db/src/index.ts` creates one `pg.Pool`, connects Drizzle with imported static schema objects, and handles idle pool errors. This is not proof of safety by itself. The reviewed production source uses `eq`, `and`, `inArray`, `ilike`, selected static column objects, `values()` and `set()`; caller-controlled strings are passed as values, not as table/column names. Examples:

- `store-content.ts`: archive/planner titles, IDs and body fields are passed to `.values()`/`.set()` and `eq(column, id)`. Owner predicates are repeated in mutation `WHERE` clauses.
- `store.ts`: project/intake JSON and identifiers are bound through insert/update and conflict handling. Owner/tier reassignment additionally has transaction/lock/CAS conditions.
- `media-db.ts`: category and text searches use `ilike(column, '%' + query + '%')` and `sql\`array_to_string(${staticColumn}, ' ') ILIKE ${pattern}\``. The nested pattern is a bound value. Sort columns are selected in source, not a caller-supplied identifier. Pagination is numeric and bounded. `%` and `_` retain legitimate search wildcard semantics; this is not SQL code execution or tenant-boundary bypass.
- `platform.ts`, `team.ts`: usernames/emails/tokens/roles/meta keys use fixed schema columns and comparisons, selected write fields and explicit role checks. Password values are hashes; malicious username/password lookup tests produce no session.
- CMS and contact fields use selected columns and Drizzle values. Typed block JSON is not interpreted as a SQL fragment.
- `store-audits.ts`: stored run JSON is read, filtered/merged in application code and rebound as JSON. IDs do not become SQL identifiers.
- Recommendation briefs and other platform metadata are namespaced string keys, not dynamically selected database tables. Stored/imported names, notes and filenames are later read/searched/edited through bound comparisons and values.

## Every raw / direct exception

The exact expression register is [sql-exceptions.json](sql-exceptions.json). Eight change-guard records include one non-SQL `express.raw` body parser.

1. `lib/cleanup-expired-tokens.ts`: `sql.raw(table)` receives a member of a module-local constant tuple of password reset, set-password and email-verification tables. No request field or imported data can select a table. Expiry logic otherwise uses static SQL. A new table choice must be reviewed.
2. `routes/journalist-privacy.ts`: `sql.raw(matchedIds.length ? matchedIds.join(',') : 'NULL')` uses a stored integer-array field, re-filtered with `Number.isInteger(value) && Number(value) > 0`. The joined tokens are numeric values only; empty input becomes literal `NULL`. Scope/account/identity values elsewhere remain bound. Stored/imported string text cannot enter this fragment. Approval separately filters matched IDs and binds an integer array. This was traced rather than reporting raw SQL merely because it exists.
3. `lib/howto-development-schema.ts`: direct `.query()` calls issue static `BEGIN`, fixed `CREATE TABLE`/indexes and `COMMIT`/`ROLLBACK`. The target guard rejects deployed/unknown environments and protected database identities. These statements are development setup, not production request input. No actual schema change to a shared database was performed.
4. `app.ts`: `express.raw({type:'application/json'})` is a body parser for webhook signatures, not SQL.

Other tagged SQL expressions in the machine register use literal syntax, static schema interpolation and bound scalars/arrays. The repository library search found no additional application-owned direct PostgreSQL query wrapper outside the recorded locations and pool constructor. The published build also bundles third-party database code, whose internals are outside this application-source review.

## Executed evidence

Tests issue HTTP requests to the real route handlers and execute Drizzle queries against disposable PGlite, or the fresh built application and temporary PostgreSQL. The shared bounded probes include:

```text
O'Brien & Sons (UK) - R&D
' OR '1'='1' --
quote'/**/OR/**/TRUE--
' UNION SELECT NULL --
%27%20OR%20TRUE%20--
```

There are no destructive statements, timing payloads or attempts against a published domain. Assertions check exact or intentionally enriched stored values, subsequent read/edit/conflict/delete paths, private record exclusion, foreign project integrity and absence of a new authentication session. Imported notes intentionally gain provenance prefixes, so preservation is asserted as containment on import and exact equality on later manual edit. Valid apostrophe-bearing names are not blanket-rejected.

Existing endpoint fixtures inject an identity header or mock middleware where noted; that demonstrates SQL execution and handler scope, not end-to-end authentication. The built-browser harness separately establishes real session/role enforcement through the actual sign-in UI, with unmocked API responses, a synthetic identity, a new PostgreSQL cluster and captured/denied outbound services. See the evidence ledger for actual results.

## Repeatable change guard

```sh
node scripts/security-sql-guard.mjs
node scripts/security-inventory.mjs
```

The guard compares raw/identifier/direct-query call expressions to reviewed digests and refuses directly interpolated execute strings. It is intentionally lightweight, can miss aliases/helpers or a changed value source feeding an unchanged raw call, and cannot prove absence of injection. Never automatically regenerate the exception register to make an alert disappear: trace the values and identifier origin first. Runtime regression and source review remain required.
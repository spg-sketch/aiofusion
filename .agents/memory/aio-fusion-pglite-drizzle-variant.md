---
name: pglite + drizzle-orm peer variant
description: Why adding @electric-sql/pglite to one package breaks tsc across all db-using files, and the fix.
---

# pglite in-memory Postgres for DB-backed route tests

The api-server route tests are normally hermetic (they mock `@workspace/db` with a
hand-rolled JS store). To test SQL behaviour that the JS mock can't reproduce
(e.g. the `coalesce(existing, incoming::jsonb)` blank-never-overwrites guard in
`POST /api/store/projects/intake`), run the real route against an **in-memory
Postgres**: mock `@workspace/db` so it returns a `drizzle(new PGlite(), {schema})`
instance plus the real schema tables (imported unmocked from `@workspace/db/schema`,
which has no DB Pool side-effect). Use the real `drizzle-orm` (do NOT mock it),
inject `req.account = {role:"admin"}` so visibility helpers short-circuit without
seeded accounts/sessions, and `CREATE TABLE projects` to match the schema.

## The peer-variant trap
`drizzle-orm` declares `@electric-sql/pglite` as an **optional peer**. Adding
pglite to ONLY one workspace package makes pnpm fork drizzle-orm into a second
peer-variant folder (`drizzle-orm@<v>_@electric-sql+pglite@<v>_...`). That package
then links to the pglite variant while `lib/db` links to the plain variant, so
`projectsTable` (from lib/db's copy) and `eq/sql` (from api-server's copy) are
nominally different types. tsc fails across EVERY db-using file with
"separate declarations of a private property 'shouldInlineParams'".

**Why:** two physical drizzle-orm copies of the same version are not type-identical.

**How to apply:** if you add `@electric-sql/pglite` (or any optional drizzle peer)
to one package, add it to `lib/db` too (devDependency is fine) so the whole
workspace resolves to a single drizzle-orm variant. Verify with
`readlink <pkg>/node_modules/drizzle-orm` on both packages — they must match — and
run `pnpm run typecheck:libs` + the api-server typecheck.

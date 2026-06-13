---
name: AIO Fusion ownerless project self-heal
description: Why legacy NULL-owner projects keep "disappearing" and the durable claim pattern that fixes it
---

# Ownerless (NULL-owner) projects vanishing

A project whose server `owner` column is NULL (legacy rows, or data blob with no
`owner` field) is returned by the store only to the master, attributed to nobody
in the Users-admin page, and invisible to every agency/client. Users perceive
this as the project "disappearing again".

**Rule:** the client self-heal that claims ownerless projects must:
- run on EVERY load AND after `syncProjectsOnLoad` (a NULL-owned row arrives from
  the sync, not from local state, so a one-time localStorage flag misses it and
  it never re-claims);
- be per-project/idempotent (no global flag);
- only act on the master's browser. Non-admins don't cache an admin-role account
  (`getVisibleUsernames` excludes the master from a subtree), and the server-side
  `coalesce` setWhere predicate blocks non-admin claims anyway;
- persist the local owner ONLY after `pushProjectMeta` confirms (it returns a
  boolean). A failed push must leave the project ownerless so it retries next
  sync, otherwise the DB stays NULL-owned forever while the UI looks fine.

**Why:** server upsert/intake claim a NULL owner via
`owner = coalesce(existing, caller)` — it never reassigns a real owner — so the
claim is only durable if the client actually lands the upsert and then mirrors
the owner locally.

**How to apply:** keep heal call inside `resyncProjects` (awaited) after the sync,
and keep `pushProjectMeta` returning `res.ok`. Don't reintroduce a one-time
migration flag for ownership.

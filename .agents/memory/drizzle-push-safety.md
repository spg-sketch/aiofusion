---
name: Drizzle push safety
description: Established development databases have legacy objects that make partial-schema pushes unsafe.
---

Do not assume a table filter also scopes PostgreSQL sequences during a Drizzle push. A partial schema can still propose removal of unrelated sequences, and Drizzle can report a database error while exiting successfully.

**Why:** A filtered How-to-only push attempted to remove a sequence belonging to an unrelated existing table. PostgreSQL rejected it because dependent data structures still used it. An ordinary noninteractive push also needed an unresolved table rename prompt.

**How to apply:** Use the full supported schema process for established databases, inspect migration output rather than trusting exit status alone, and never force unresolved rename or deletion prompts. Use a fresh isolated database for automated migrations and browser fixtures.
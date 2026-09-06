---
name: Media workbook import safety
description: Durable scoping, reconciliation, and OOXML rules for importing media contacts and outlets.
---

Customer-uploaded media lists must always be scoped to the active account, even when the uploader is a platform admin. An admin upload must not silently create globally visible contacts.

**Why:** The platform also supports intentional global records and manual duplicates. Treating every admin import as global risks leaking a customer's private media list, while broad database uniqueness constraints would change existing manual-entry semantics.

**How to apply:** Use the same duplicate-planning rules for preview and commit. Re-plan inside the commit transaction after taking an account-scoped advisory lock. Skip an existing contact before creating its proposed new outlet, so duplicate contacts cannot leave orphan outlets.

Recurring workbook imports refresh source-managed fields but preserve only fields the user actually changed inside AIO Fusion. Full-record edit forms submit unchanged values too, so create overrides by comparing against the stored row rather than by checking whether a field was present in the request.

**Why:** Treating every submitted edit field as user-owned turns ordinary reimports into false conflicts and prevents source metadata from refreshing.

**How to apply:** Preview and commit must share one reconciliation classifier for new, refreshed, unchanged, duplicate, invalid, and conflicted outcomes. A conflict is a changed workbook value blocked by a genuine user override.

XLSX parsing must resolve worksheets through workbook relationships, not assume sheet IDs equal worksheet filenames. ZIP central-directory compressed and uncompressed size fields must be read in their documented order, with bounded expansion.

**Why:** Valid OOXML can use non-contiguous relationship targets, and reversing the two size fields makes safe workbooks appear to expand beyond limits.

**How to apply:** Validate compressed size, per-entry ratio, and aggregate inflation before parsing values, then regression-check a representative large, multi-sheet workbook.
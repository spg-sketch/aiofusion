---
name: Long media imports
description: How to interpret browser failures during large shared media workbook imports.
---

For large media workbooks, a browser or proxy timeout does not prove the import failed. The server transaction can continue and commit after the client disconnects. Always check the import batch, exact source hash, summary, and aggregate counts before asking for a retry.

**Why:** A reviewed V33 import exceeded the five-minute request window. The browser showed an error, but the server completed the transaction several minutes later. Retrying without reconciliation could create confusion or an unnecessary second request.

**How to apply:** After any timeout, 404, aborted request, or lost response during a media import, query the persisted batch first. Match the source hash and reconcile shared/private counts. Only retry when no matching committed batch exists.
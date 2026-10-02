---
name: How-to authoring model
description: The user's requirement for continuous rich-text How-to editing, rather than individual section forms.
---

The How-to Library must use one WYSIWYG content box. Users should be able to paste the entire guide, select text, and choose headings or body text without creating individual sections.

**Why:** The user rejected the separate section-box workflow and reported that pasted paragraph text could not be selected or edited with Enter.

**How to apply:** Preserve the continuous authoring workflow when changing the How-to editor. Test real clipboard paste, selection, Enter, formatting and save/reopen, not just the save endpoint.

Do not equate one editing surface with storing arbitrary HTML or discarding the established structured content contract.

**Why:** Existing guides and shared media references must remain compatible; the editing interface can change without rewriting saved content or loosening its validation.

**How to apply:** Keep compatibility and media-reference preservation explicit in future editor changes.
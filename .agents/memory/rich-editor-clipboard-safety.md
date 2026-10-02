---
name: Rich editor clipboard safety
description: Why custom rich editor blocks need clipboard verification in addition to JSON persistence tests.
---

Custom ProseMirror/Tiptap blocks must round trip through the editor's HTML serializer and parser, not only through JSON storage. Restrict custom HTML parsing to explicitly marked editor structures; ordinary external images and embeds must not become library-backed media.

**Why:** Clipboard copy and cut serialize to HTML, even when copying existing editor content. Custom blocks with no HTML parse rules passed JSON persistence tests but lost images, media provenance, video links and titled-step structure when pasted back. Cutting to reposition content made that loss destructive.

**How to apply:** Exercise actual editor copy/cut/paste handlers for custom node types, then rebuild from the saved contract. Keep all meaningful metadata and inline formatting through those operations, while preserving validation and rejecting unsupported external HTML. A successful text-only paste test is not enough.
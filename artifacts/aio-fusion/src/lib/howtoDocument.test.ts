import { describe, expect, it } from "vitest";
import { blocksToDocument, documentToBlocks } from "./howtoDocument";
import { buildPayload, emptyDraft } from "./howto";
import type { HowtoBlock } from "./howto";

describe("single-document How-to editing", () => {
  it("round trips every existing block including inline formatting and media provenance", () => {
    const body: HowtoBlock[] = [
      { type: "heading", runs: [{ text: "Start", bold: true }] },
      { type: "paragraph", runs: [{ text: "Normal " }, { text: "bold", bold: true }, { text: "\n" }, { text: "linked", italic: true, href: "https://example.com" }] },
      { type: "tip", runs: [{ text: "Remember this", italic: true }] },
      { type: "step", number: 1, title: "First step", runs: [{ text: "Do this" }] },
      { type: "list", items: ["One", "Two"] },
      { type: "image", mediaId: "media-1", altText: "A screenshot", caption: "Settings", url: "/objects/screenshot.png" },
      { type: "video", url: "https://example.com/video", caption: "Watch the guide" },
    ];
    expect(documentToBlocks(blocksToDocument(body))).toEqual(body);
    const payload = buildPayload({ ...emptyDraft(), body: documentToBlocks(blocksToDocument(body)) }, "draft");
    expect(payload.body[5]).toEqual({ type: "image", mediaId: "media-1", altText: "A screenshot", caption: "Settings" });
  });
  it("keeps paragraph boundaries and multiline text", () => {
    const body: HowtoBlock[] = [
      { type: "paragraph", runs: [{ text: "First paragraph" }] },
      { type: "paragraph", runs: [{ text: "Second paragraph\nSecond line" }] },
    ];
    expect(documentToBlocks(blocksToDocument(body))).toEqual(body);
    expect(blocksToDocument([]).content).toEqual([{ type: "paragraph" }]);
  });
  it("keeps formatting on multiline runs and preserves blank lines", () => {
    const body: HowtoBlock[] = [
      { type: "paragraph", runs: [{ text: "\nBold\n\nlast line\n", bold: true, italic: true, href: "https://example.com/help" }] },
    ];
    expect(documentToBlocks(blocksToDocument(body))).toEqual(body);
  });
  it("preserves formatted bullets instead of losing inline marks on save", () => {
    const doc = { type: "doc", content: [{
      type: "bulletList", content: [{
        type: "listItem", content: [{ type: "paragraph", content: [
          { type: "text", text: "Important", marks: [{ type: "bold" }] },
        ] }],
      }],
    }] };
    const saved = documentToBlocks(doc);
    expect(saved).toEqual([{ type: "paragraph", runs: [{ text: "• " }, { text: "Important", bold: true }] }]);
    expect(blocksToDocument(saved)).toEqual(doc);
  });
  it("retains numbered list text and rejects unsafe links", () => {
    expect(documentToBlocks({ type: "doc", content: [{
      type: "orderedList", content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] },
      ],
    }] })).toEqual([
      { type: "step", number: 1, title: "", runs: [{ text: "First" }] },
      { type: "step", number: 2, title: "", runs: [{ text: "Second" }] },
    ]);
  });
});
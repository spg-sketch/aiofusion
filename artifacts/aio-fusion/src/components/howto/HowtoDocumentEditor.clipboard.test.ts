// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { howtoEditorExtensions } from "./HowtoDocumentEditor";
import { blocksToDocument, documentToBlocks } from "../../lib/howtoDocument";
import { buildPayload, emptyDraft, validateDraft, type HowtoBlock } from "../../lib/howto";

const editors: Editor[] = [];
const rangeDescriptors = Object.getOwnPropertyDescriptors(Range.prototype);
const paragraph: HowtoBlock = { type: "paragraph", runs: [{ text: "Retained instructions" }] };
const mediaBlocks: HowtoBlock[] = [
  { type: "image", mediaId: "library-image-1", url: "/objects/guide.png", altText: "Settings screen", caption: "Choose the project" },
  { type: "video", url: "https://example.com/tutorial", caption: "Watch the walkthrough" },
  { type: "step", number: 1, title: "Select a project", runs: [{ text: "Keep this ", bold: true }, { text: "linked instruction", href: "https://example.com/help" }] },
];

function createEditor(body: HowtoBlock[]) {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: howtoEditorExtensions, content: blocksToDocument(body) });
  editors.push(editor);
  return editor;
}

function clipboardEvent(editor: Editor, type: "copy" | "cut" | "paste", data: Record<string, string>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [], types: Object.keys(data),
      getData: (format: string) => data[format] ?? "",
      setData: (format: string, value: string) => { data[format] = value; },
      clearData: () => { Object.keys(data).forEach((key) => delete data[key]); },
    },
  });
  editor.view.dom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}

beforeEach(() => {
  // Clipboard handlers scroll the selection. jsdom has no layout engine.
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  });
});

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  for (const key of ["getClientRects", "getBoundingClientRect"]) {
    if (rangeDescriptors[key]) Object.defineProperty(Range.prototype, key, rangeDescriptors[key]);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});

describe("How-to custom block clipboard preservation", () => {
  for (const block of mediaBlocks) {
    for (const action of ["copy", "cut"] as const) {
      it(`${action}/paste preserves ${block.type} content and metadata through save and reload`, () => {
        const editor = createEditor([paragraph, block, paragraph]);
        editor.commands.setNodeSelection(editor.state.doc.firstChild!.nodeSize);
        const clipboard: Record<string, string> = {};
        clipboardEvent(editor, action, clipboard);
        expect(clipboard["text/html"]).toContain(`data-howto-node="${block.type}"`);
        const customBlocks = () => documentToBlocks(editor.getJSON()).filter((entry) => entry.type === block.type);
        expect(customBlocks()).toHaveLength(action === "copy" ? 1 : 0);

        editor.commands.setTextSelection(editor.state.doc.content.size - 1);
        clipboardEvent(editor, "paste", clipboard);
        const pasted = customBlocks();
        expect(pasted).toHaveLength(action === "copy" ? 2 : 1);
        for (const entry of pasted) {
          expect(entry).toEqual(block.type === "step" ? { ...block, number: expect.any(Number) } : block);
        }
        expect(editor.getText()).toContain("Retained instructions");
        // Build the actual persisted contract (resolved image URLs are not
        // stored), then remount an editor from that saved JSON.
        const payload = buildPayload({ ...emptyDraft(), body: documentToBlocks(editor.getJSON()) }, "draft");
        const saved = JSON.parse(JSON.stringify(payload)).body as HowtoBlock[];
        const reloaded = createEditor(saved);
        const restored = documentToBlocks(reloaded.getJSON()).filter((entry) => entry.type === block.type);
        const expected = pasted.map((entry) => {
          if (entry.type !== "image") return entry;
          const { url: _resolvedUrl, ...persisted } = entry;
          return { ...persisted, url: "" };
        });
        expect(restored).toEqual(expected);
        if (block.type === "image") expect(restored[0]).toMatchObject({ mediaId: "library-image-1" });
        if (block.type === "step") expect(reloaded.getText()).not.toContain("Step 1: Select a projectStep");
      });
    }
  }

  it("ignores unsupported external images, embeds and unmarked custom structures", () => {
    const editor = createEditor([paragraph]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    clipboardEvent(editor, "paste", {
      "text/plain": "External text",
      "text/html": '<figure class="howto-editor-image"><img src="https://external.example/image.png"><figcaption>External caption</figcaption></figure><iframe src="https://external.example/video"></iframe><div class="howto-editor-video">External video text</div><section class="howto-editor-step"><h3>External title</h3><p>External text</p></section>',
    });
    expect(documentToBlocks(editor.getJSON()).every((entry) => !["image", "video", "step"].includes(entry.type))).toBe(true);
    expect(editor.view.dom.querySelector("img, iframe, video")).toBeNull();
    expect(editor.getText()).toContain("External text");
  });

  it("does not adopt unsafe image URLs from marked clipboard HTML", () => {
    const editor = createEditor([paragraph]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    clipboardEvent(editor, "paste", {
      "text/html": '<figure data-howto-node="image" data-media-id="fake" data-image-url="javascript:alert(1)"><img src="javascript:alert(1)"><figcaption>Safe text</figcaption></figure>',
      "text/plain": "Safe text",
    });
    expect(documentToBlocks(editor.getJSON()).some((entry) => entry.type === "image")).toBe(false);
    expect(editor.view.dom.querySelector("img")).toBeNull();
  });

  it("retains an unfinished video as inert draft data without bypassing save validation", () => {
    const editor = createEditor([{ type: "video", url: "javascript:alert(1)", caption: "Unfinished edit" }, paragraph]);
    editor.commands.setNodeSelection(0);
    const clipboard: Record<string, string> = {};
    clipboardEvent(editor, "cut", clipboard);
    editor.commands.setTextSelection(1);
    clipboardEvent(editor, "paste", clipboard);
    const body = documentToBlocks(editor.getJSON());
    expect(body).toContainEqual({ type: "video", url: "javascript:alert(1)", caption: "Unfinished edit" });
    expect(editor.view.dom.querySelector("a, iframe, video")).toBeNull();
    expect(validateDraft({ ...emptyDraft(), body }, false)).toContain("Block 1: video links must start with https://.");
  });
});
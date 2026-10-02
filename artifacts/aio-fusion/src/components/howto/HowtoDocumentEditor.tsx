import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes, isNodeSelection, type Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, Link2Off, List, ListOrdered, Undo2, Redo2, Image, Video, Lightbulb, Trash2 } from "lucide-react";
import { MediaLibraryModal } from "../MediaLibraryModal";
import { vars } from "../../marketing/vars";
import { isHttps } from "../../lib/howto";
import type { HowtoBlock } from "../../lib/howto";
import { blocksToDocument, documentToBlocks } from "../../lib/howtoDocument";
import "./howtoDocumentEditor.css";

const Tip = Node.create({
  name: "howtoTip", group: "block", content: "inline*",
  parseHTML: () => [{ tag: 'aside[data-howto-tip]' }],
  renderHTML: ({ HTMLAttributes }) => ["aside", mergeAttributes(HTMLAttributes, { "data-howto-tip": "", class: "howto-editor-tip" }), 0],
});

// Restore only explicitly marked editor structures, not arbitrary embeds.
const storedAttribute = (name: string, defaultValue = "") => ({
  default: defaultValue,
  rendered: false,
  parseHTML: (element: HTMLElement) => element.getAttribute(name) ?? defaultValue,
});
const safeImageUrl = (url: string) => !url || isHttps(url) || /^\/(?!\/)/.test(url);
const Step = Node.create({
  name: "howtoStep", group: "block", content: "inline*",
  addAttributes: () => ({
    number: { default: 1, rendered: false, parseHTML: (element) => Number(element.getAttribute("data-step-number")) },
    title: storedAttribute("data-step-title"),
  }),
  parseHTML: () => [{
    tag: 'section[data-howto-node="step"]',
    contentElement: "p[data-howto-step-content]",
    getAttrs: (element) => {
      const number = Number(element.getAttribute("data-step-number"));
      return Number.isInteger(number) && number > 0 && element.querySelector("p[data-howto-step-content]") ? null : false;
    },
  }],
  renderHTML: ({ node }) => ["section", {
    class: "howto-editor-step", "data-howto-node": "step",
    "data-step-number": node.attrs.number, "data-step-title": node.attrs.title,
  },
    ["h3", { contenteditable: "false" }, `Step ${node.attrs.number}${node.attrs.title ? `: ${node.attrs.title}` : ""}`],
    ["p", { "data-howto-step-content": "" }, 0]],
});

const GuideImage = Node.create({
  name: "howtoImage", group: "block", atom: true, draggable: true,
  addAttributes: () => ({
    mediaId: storedAttribute("data-media-id"), altText: storedAttribute("data-alt-text"),
    caption: storedAttribute("data-caption"), url: storedAttribute("data-image-url"),
  }),
  parseHTML: () => [{
    tag: 'figure[data-howto-node="image"]',
    getAttrs: (element) => safeImageUrl(element.getAttribute("data-image-url") ?? "") ? null : false,
  }],
  renderHTML: ({ node }) => ["figure", {
    class: "howto-editor-image", "data-howto-node": "image",
    "data-media-id": node.attrs.mediaId, "data-alt-text": node.attrs.altText,
    "data-caption": node.attrs.caption, "data-image-url": safeImageUrl(node.attrs.url) ? node.attrs.url : "",
  },
    ...(node.attrs.url && safeImageUrl(node.attrs.url) ? [["img", { src: node.attrs.url, alt: node.attrs.altText }]] : [["span", {}, "Choose an image from the media library"]]),
    ["figcaption", {}, node.attrs.caption || node.attrs.altText || "Select image to edit its description"]],
});

const GuideVideo = Node.create({
  name: "howtoVideo", group: "block", atom: true,
  addAttributes: () => ({ url: storedAttribute("data-video-url", "https://"), caption: storedAttribute("data-caption") }),
  parseHTML: () => [{ tag: 'div[data-howto-node="video"]' }],
  // The URL is inert metadata, not an embed or href. Draft validation still
  // requires HTTPS before saving, including after a clipboard operation.
  renderHTML: ({ node }) => ["div", {
    class: "howto-editor-video", "data-howto-node": "video",
    "data-video-url": node.attrs.url, "data-caption": node.attrs.caption,
  }, node.attrs.caption || node.attrs.url],
});

export const howtoEditorExtensions = [
  StarterKit.configure({
    heading: { levels: [2] }, blockquote: false, codeBlock: false, code: false,
    horizontalRule: false, strike: false, underline: false, trailingNode: false,
    link: {
      openOnClick: false, autolink: false, linkOnPaste: false,
      isAllowedUri: (url) => isHttps(url),
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
    },
  }),
  Tip, Step, GuideImage, GuideVideo,
];

type Props = { body: HowtoBlock[]; onChange: (body: HowtoBlock[]) => void };

export function HowtoDocumentEditor({ body, onChange }: Props) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const lastEmitted = useRef(JSON.stringify(body));
  const [mediaOpen, setMediaOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const imageTarget = useRef<{
    bookmark: ReturnType<Editor["state"]["selection"]["getBookmark"]>;
    replace: boolean;
  } | null>(null);

  const editor = useEditor({
    extensions: howtoEditorExtensions,
    content: blocksToDocument(body),
    editorProps: {
      attributes: {
        role: "textbox", "aria-label": "Guide content", "aria-multiline": "true",
        "data-testid": "howto-document", class: "howto-document-prose",
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = documentToBlocks(current.getJSON());
      lastEmitted.current = JSON.stringify(next);
      changeRef.current(next);
    },
  });

  // Never rewrite the live DOM in response to its own input. ProseMirror owns
  // selection, Enter, paste, composition and undo; only external resets replace it.
  useEffect(() => {
    const incoming = JSON.stringify(body);
    if (editor && incoming !== lastEmitted.current) {
      lastEmitted.current = incoming;
      editor.commands.setContent(blocksToDocument(body), { emitUpdate: false });
    }
  }, [body, editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const selection = current.state.selection;
      const selected = isNodeSelection(selection) ? selection.node : selection.$from.parent;
      return {
        bold: current.isActive("bold"), italic: current.isActive("italic"),
        format: current.isActive("heading") ? "heading" : current.isActive("howtoTip") ? "tip" : "paragraph",
        bullet: current.isActive("bulletList"), numbered: current.isActive("orderedList"),
        linked: current.isActive("link"),
        nodeType: selected.type.name, attrs: selected.attrs,
      };
    },
  });

  if (!editor || !state) return null;

  const tool = (label: string, action: () => void, icon: React.ReactNode, active = false, disabled = false) => (
    <button type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled}
      className="howto-editor-tool" onMouseDown={(event) => event.preventDefault()} onClick={action}>
      {icon}
    </button>
  );
  const insertBlock = (type: string, attrs?: Record<string, unknown>) => {
    editor.chain().focus().insertContent([{ type, ...(attrs ? { attrs } : {}) }, { type: "paragraph" }]).run();
  };
  const openImages = (replace = false) => {
    imageTarget.current = { bookmark: editor.state.selection.getBookmark(), replace };
    setMediaOpen(true);
  };
  const closeImages = () => {
    setMediaOpen(false);
    imageTarget.current = null;
  };
  const selectedMedia = state.nodeType === "howtoImage" || state.nodeType === "howtoVideo";
  const selectedStep = state.nodeType === "howtoStep";

  return (
    <div className="howto-document-editor">
      <div className="howto-editor-toolbar" role="toolbar" aria-label="Guide formatting">
        <label className="sr-only" htmlFor="howto-text-format">Text format</label>
        <select id="howto-text-format" aria-label="Text format" value={state.format}
          onChange={(event) => {
            const chain = editor.chain().focus();
            if (event.target.value === "heading") chain.setHeading({ level: 2 }).run();
            else if (event.target.value === "tip") chain.setNode("howtoTip").run();
            else chain.setParagraph().run();
          }}>
          <option value="paragraph">Body text</option><option value="heading">Heading</option><option value="tip">Tip</option>
        </select>
        {tool("Bold", () => editor.chain().focus().toggleBold().run(), <Bold size={16} />, state.bold)}
        {tool("Italic", () => editor.chain().focus().toggleItalic().run(), <Italic size={16} />, state.italic)}
        {tool("Add or edit link", () => {
          setLinkUrl(editor.getAttributes("link").href ?? "");
          setLinkError(""); setLinkOpen(true);
        }, <Link2 size={16} />, state.linked)}
        {tool("Remove link", () => editor.chain().focus().unsetLink().run(), <Link2Off size={16} />, false, !state.linked)}
        {tool("Bullet list", () => editor.chain().focus().toggleBulletList().run(), <List size={16} />, state.bullet)}
        {tool("Numbered list", () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={16} />, state.numbered)}
        {tool("Insert tip", () => insertBlock("howtoTip"), <Lightbulb size={16} />)}
        <button type="button" className="howto-editor-tool howto-editor-add-image"
          onMouseDown={(event) => event.preventDefault()} onClick={() => openImages()}
          aria-haspopup="dialog">
          <Image size={16} aria-hidden="true" /> Add image
        </button>
        {tool("Insert video link", () => insertBlock("howtoVideo"), <Video size={16} />)}
        {tool("Undo", () => editor.chain().focus().undo().run(), <Undo2 size={16} />, false, !editor.can().undo())}
        {tool("Redo", () => editor.chain().focus().redo().run(), <Redo2 size={16} />, false, !editor.can().redo())}
      </div>
      <p className="px-3 py-2 text-[12px]" style={{ color: vars.g500 }}>
        Paste your whole guide here, then use the toolbar to choose headings, body text and formatting.
        Use Add image to upload from your device or choose from the media library.
      </p>
      {linkOpen && (
        <div className="howto-editor-inspector" role="group" aria-label="Edit link">
          <label>Link URL<input aria-label="Link URL" value={linkUrl} placeholder="https://example.com"
            onChange={(event) => setLinkUrl(event.target.value)} /></label>
          <button type="button" className="aio-button aio-button--outline aio-button--compact" onClick={() => {
            if (!isHttps(linkUrl.trim())) { setLinkError("Links must start with https://."); return; }
            editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl.trim() }).run();
            setLinkOpen(false);
          }}>Apply link</button>
          <button type="button" className="aio-button aio-button--text aio-button--compact" onClick={() => setLinkOpen(false)}>Cancel</button>
          {linkError && <p role="alert">{linkError}</p>}
        </div>
      )}
      <EditorContent editor={editor} />
      {(selectedMedia || selectedStep) && (
        <div className="howto-editor-inspector" role="group" aria-label="Selected content details">
          {selectedStep && <label>Step title<input aria-label="Step title" value={state.attrs.title ?? ""}
            onChange={(event) => editor.commands.updateAttributes("howtoStep", { title: event.target.value })} /></label>}
          {state.nodeType === "howtoImage" && <>
            <button type="button" className="aio-button aio-button--outline aio-button--compact"
              onMouseDown={(event) => event.preventDefault()} onClick={() => openImages(true)}>Change image</button>
            <label>Image description<input aria-label="Image description" value={state.attrs.altText ?? ""}
              onChange={(event) => editor.commands.updateAttributes("howtoImage", { altText: event.target.value })} /></label>
          </>}
          {state.nodeType === "howtoVideo" && <label>Video URL<input aria-label="Video URL" value={state.attrs.url ?? ""}
            onChange={(event) => editor.commands.updateAttributes("howtoVideo", { url: event.target.value })} /></label>}
          {selectedMedia && <label>Caption<input aria-label="Caption" value={state.attrs.caption ?? ""}
            onChange={(event) => editor.commands.updateAttributes(state.nodeType, { caption: event.target.value })} /></label>}
          {selectedMedia && <button type="button" aria-label="Remove selected media" className="aio-button aio-button--text aio-button--compact"
            onClick={() => editor.chain().focus().deleteSelection().run()}><Trash2 size={14} /> Remove</button>}
        </div>
      )}
      {mediaOpen && <MediaLibraryModal onClose={closeImages} onSelect={(media) => {
        const target = imageTarget.current;
        if (!target) return;
        // The picker takes focus. Restore the original insertion/replacement
        // target instead of relying on whichever selection remains afterwards.
        const selection = target.bookmark.resolve(editor.state.doc);
        editor.commands.command(({ tr }) => {
          tr.setSelection(selection);
          return true;
        });
        const current = target.replace && editor.isActive("howtoImage") ? editor.getAttributes("howtoImage") : null;
        const attrs = {
          mediaId: media.id, url: media.publicUrl,
          altText: current?.altText || media.altText || "", caption: current?.caption ?? "",
        };
        if (current) editor.chain().focus().updateAttributes("howtoImage", attrs).run();
        else {
          // Add never replaces selected text or a selected existing image.
          editor.commands.setTextSelection(selection.to);
          insertBlock("howtoImage", attrs);
        }
        closeImages();
      }} />}
    </div>
  );
}


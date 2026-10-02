import type { JSONContent } from "@tiptap/core";
import type { HowtoBlock, InlineRun } from "./howto";
import { isHttps } from "./howto";

/** The editor owns its document; persistence continues to use the existing API. */
function inline(runs: InlineRun[]): JSONContent[] {
  return runs.flatMap((run) => {
    const marks: NonNullable<JSONContent["marks"]> = [];
    if (run.bold) marks.push({ type: "bold" });
    if (run.italic) marks.push({ type: "italic" });
    if (run.href && isHttps(run.href)) marks.push({ type: "link", attrs: { href: run.href } });
    return run.text.split("\n").flatMap((text, i) => [
      ...(i ? [{ type: "hardBreak" }] : []),
      ...(text ? [{ type: "text", text, ...(marks.length ? { marks } : {}) }] : []),
    ]);
  });
}

export function blocksToDocument(body: HowtoBlock[]): JSONContent {
  const content: JSONContent[] = body.map((block) => {
    switch (block.type) {
      case "paragraph": {
        // Rich bullets use the legacy paragraph contract on disk. Restore them
        // as genuine list items so the user can continue editing a saved list.
        if (block.runs[0]?.text.startsWith("• ")) {
          const runs = block.runs.map((r, i) => i ? r : { ...r, text: r.text.slice(2) });
          return { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: inline(runs) }] }] };
        }
        return { type: "paragraph", content: inline(block.runs) };
      }
      case "heading": return { type: "heading", attrs: { level: 2 }, content: inline(block.runs) };
      case "tip": return { type: "howtoTip", content: inline(block.runs) };
      case "step": return block.title
        ? { type: "howtoStep", attrs: { number: block.number, title: block.title }, content: inline(block.runs) }
        : { type: "orderedList", attrs: { start: block.number }, content: [{ type: "listItem", content: [{ type: "paragraph", content: inline(block.runs) }] }] };
      case "list": return {
        type: "bulletList",
        content: (block.items.length ? block.items : [""]).map((text) => ({
          type: "listItem", content: [{ type: "paragraph", content: inline([{ text }]) }],
        })),
      };
      case "image": return { type: "howtoImage", attrs: { mediaId: block.mediaId, altText: block.altText, caption: block.caption ?? "", url: block.url ?? "" } };
      case "video": return { type: "howtoVideo", attrs: { url: block.url, caption: block.caption ?? "" } };
    }
  });
  const grouped: JSONContent[] = [];
  for (const node of content) {
    const last = grouped.at(-1);
    if ((node.type === "bulletList" || node.type === "orderedList") && last?.type === node.type) {
      last.content = [...(last.content ?? []), ...(node.content ?? [])];
    } else grouped.push(node);
  }
  return { type: "doc", content: grouped.length ? grouped : [{ type: "paragraph" }] };
}

function runsFromNodes(nodes: JSONContent[] = []): InlineRun[] {
  const runs: InlineRun[] = [];
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      const last = runs.at(-1);
      if (last && !last.bold && !last.italic && !last.href) last.text += "\n";
      else runs.push({ text: "\n" });
    } else if (node.type === "text" && node.text) {
      const run: InlineRun = { text: node.text };
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") run.bold = true;
        if (mark.type === "italic") run.italic = true;
        if (mark.type === "link" && isHttps(mark.attrs?.href ?? "")) run.href = mark.attrs?.href;
      }
      const last = runs.at(-1);
      if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic && last.href === run.href) last.text += run.text;
      else runs.push(run);
    } else if (node.content) {
      if (runs.length && !runs.at(-1)?.text.endsWith("\n")) runs.push({ text: "\n" });
      runs.push(...runsFromNodes(node.content));
    }
  }
  return runs;
}

export function documentToBlocks(doc: JSONContent): HowtoBlock[] {
  let stepNumber = 0;
  return (doc.content ?? []).flatMap((node): HowtoBlock[] => {
    switch (node.type) {
      case "paragraph": return [{ type: "paragraph", runs: runsFromNodes(node.content) }];
      case "heading": return [{ type: "heading", runs: runsFromNodes(node.content) }];
      case "howtoTip": return [{ type: "tip", runs: runsFromNodes(node.content) }];
      case "howtoStep": return [{ type: "step", number: ++stepNumber, title: node.attrs?.title ?? "", runs: runsFromNodes(node.content) }];
      case "bulletList": {
        const items = (node.content ?? []).map((item) => runsFromNodes(item.content));
        // The legacy list contract is plain text. Preserve formatted bullets as
        // rich paragraphs rather than silently dropping their bold/italic/link marks.
        if (items.some((runs) => runs.some((r) => r.bold || r.italic || r.href))) {
          return items.map((runs) => ({ type: "paragraph", runs: [{ text: "• " }, ...runs] }));
        }
        return [{ type: "list", items: items.map((runs) => runs.map((r) => r.text).join("")) }];
      }
      case "orderedList": return (node.content ?? []).map((item) => ({
        type: "step", number: ++stepNumber, title: "", runs: runsFromNodes(item.content),
      }));
      case "howtoImage": return [{
        type: "image", mediaId: node.attrs?.mediaId ?? "", altText: node.attrs?.altText ?? "",
        caption: node.attrs?.caption ?? "", url: node.attrs?.url ?? "",
      }];
      case "howtoVideo": return [{ type: "video", url: node.attrs?.url ?? "", caption: node.attrs?.caption ?? "" }];
      default: throw new Error(`Unsupported guide content: ${node.type}`);
    }
  });
}
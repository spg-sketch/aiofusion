import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2, Link2Off } from "lucide-react";
import { vars } from "../../marketing/vars";
import { isHttps } from "../../lib/howto";
import type { InlineRun } from "../../lib/howto";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function runsToHtml(runs: InlineRun[]): string {
  return runs
    .map((r) => {
      let h = esc(r.text);
      if (r.bold) h = `<strong>${h}</strong>`;
      if (r.italic) h = `<em>${h}</em>`;
      if (r.href) h = `<a href="${esc(r.href)}">${h}</a>`;
      return h;
    })
    .join("");
}

type Fmt = { bold?: boolean; italic?: boolean; href?: string };

export function domToRuns(root: Node): InlineRun[] {
  const out: InlineRun[] = [];
  const walk = (node: Node, fmt: Fmt) => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      if (!text) return;
      const run: InlineRun = { text };
      if (fmt.bold) run.bold = true;
      if (fmt.italic) run.italic = true;
      if (fmt.href) run.href = fmt.href;
      const last = out[out.length - 1];
      if (last && !!last.bold === !!run.bold && !!last.italic === !!run.italic && last.href === run.href) last.text += text;
      else out.push(run);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "BR") {
      out.push({ text: "\n" });
      return;
    }
    // Browser-created paragraph/div boundaries must not concatenate words.
    const block = tag === "DIV" || tag === "P";
    if (block && out.length && !out[out.length - 1].text.endsWith("\n")) out.push({ text: "\n" });
    const next: Fmt = { ...fmt };
    if (tag === "B" || tag === "STRONG" || el.style?.fontWeight === "bold" || el.style?.fontWeight === "700") next.bold = true;
    if (tag === "I" || tag === "EM" || el.style?.fontStyle === "italic") next.italic = true;
    if (tag === "A") {
      const href = el.getAttribute("href");
      if (href) next.href = href;
    }
    el.childNodes.forEach((c) => walk(c, next));
    if (block && el.nextSibling && out.length && !out[out.length - 1].text.endsWith("\n")) out.push({ text: "\n" });
  };
  root.childNodes.forEach((c) => walk(c, {}));
  return out;
}

type Props = {
  runs: InlineRun[];
  onChange: (runs: InlineRun[]) => void;
  label: string;
  testId: string;
  placeholder?: string;
};

const toolBtn = "inline-flex items-center justify-center h-8 w-8 rounded-md border text-[12px] transition-colors";

export function RichRunsEditor({ runs, onChange, label, testId, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("https://");
  const [urlError, setUrlError] = useState("");
  const [empty, setEmpty] = useState(runs.every((r) => !r.text));

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = runsToHtml(runs);
    // Content is owned by the DOM after mount; the block is re-keyed when replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => {
    if (!ref.current) return;
    const next = domToRuns(ref.current);
    setEmpty(next.length === 0);
    onChange(next);
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    if (typeof document.execCommand === "function") document.execCommand(cmd, false, arg);
    sync();
  };

  const rememberSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };

  const openLink = () => {
    rememberSelection();
    const anchor = saved.current?.startContainer?.parentElement?.closest("a");
    setUrl(anchor?.getAttribute("href") || "https://");
    setUrlError("");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const value = url.trim();
    if (!isHttps(value)) {
      setUrlError("Links must start with https://");
      return;
    }
    ref.current?.focus();
    const sel = window.getSelection();
    if (saved.current && sel) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
    if (saved.current?.collapsed) {
      setUrlError("Select the words to link first.");
      return;
    }
    exec("createLink", value);
    setLinkOpen(false);
  };

  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: vars.fieldBorder }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b flex-wrap" style={{ borderColor: vars.g200, background: vars.g100 }} role="toolbar" aria-label={`${label} formatting`}>
        <button type="button" onMouseDown={keep} onClick={() => exec("bold")} className={toolBtn} style={{ borderColor: vars.g300, color: vars.navy }} aria-label="Bold" title="Bold" data-testid={`${testId}-bold`}><Bold size={14} /></button>
        <button type="button" onMouseDown={keep} onClick={() => exec("italic")} className={toolBtn} style={{ borderColor: vars.g300, color: vars.navy }} aria-label="Italic" title="Italic" data-testid={`${testId}-italic`}><Italic size={14} /></button>
        <button type="button" onMouseDown={keep} onClick={openLink} className={toolBtn} style={{ borderColor: vars.g300, color: vars.navy }} aria-label="Add or edit link" title="Link" data-testid={`${testId}-link`}><Link2 size={14} /></button>
        <button type="button" onMouseDown={keep} onClick={() => exec("unlink")} className={toolBtn} style={{ borderColor: vars.g300, color: vars.navy }} aria-label="Remove link" title="Remove link" data-testid={`${testId}-unlink`}><Link2Off size={14} /></button>
        <span className="text-[11px] ml-1" style={{ color: vars.g400 }}>Select words, then format</span>
      </div>
      {linkOpen && (
        <div className="flex items-start gap-2 px-2 py-2 border-b flex-wrap" style={{ borderColor: vars.g200 }}>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-semibold mb-1" style={{ color: vars.g600 }} htmlFor={`${testId}-url`}>Link URL (https only)</label>
            <input
              id={`${testId}-url`}
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinkOpen(false); }}
              className="w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ borderColor: vars.fieldBorder }}
              data-testid={`${testId}-url`}
              autoFocus
            />
            {urlError && <p role="alert" className="text-[12px] mt-1 font-semibold" style={{ color: "#b91c1c" }}>{urlError}</p>}
          </div>
          <button type="button" onClick={applyLink} className="aio-button aio-button--secondary aio-button--compact mt-5" data-testid={`${testId}-apply-link`}>Apply link</button>
          <button type="button" onClick={() => setLinkOpen(false)} className="aio-button aio-button--text aio-button--compact mt-5">Cancel</button>
        </div>
      )}
      <div className="relative">
        {empty && placeholder && <span className="absolute left-3 top-2 text-[14px] pointer-events-none" style={{ color: vars.g400 }}>{placeholder}</span>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          data-testid={testId}
          onInput={sync}
          onBlur={() => { rememberSelection(); sync(); }}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
            if (typeof document.execCommand === "function") document.execCommand("insertText", false, text);
            sync();
          }}
          className="min-h-[44px] px-3 py-2 text-[14px] leading-[1.7] outline-none [&_a]:underline [&_a]:text-[#A52F60]"
          style={{ color: vars.g600 }}
        />
      </div>
    </div>
  );
}

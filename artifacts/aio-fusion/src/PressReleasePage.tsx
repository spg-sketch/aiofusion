import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Plus,
  Clock,
  Download,
  Trash2,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  Heading1,
  Heading2,
  Quote,
  Undo2,
  Redo2,
  Sparkles,
  ArrowLeft,
  Check,
  ChevronDown,
} from "lucide-react";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

const vars = {
  navy: "#0a1628",
  accent: "#4f8fff",
  teal: "#4f8fff",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  g50: "#FAFAFA",
  g100: "#F1F5F9",
  g200: "#E2E8F0",
  g300: "#CBD5E1",
  g400: "#64748B",
  g500: "#475569",
  g600: "#334155",
};

type PressReleaseDoc = {
  id: string;
  title: string;
  status: "draft" | "review" | "approved" | "published";
  updatedAt: string;
  createdAt: string;
  content: string;
  source: "uploaded" | "ai-drafted" | "manual";
};

const PR_TEMPLATE = `<h1>PRESS RELEASE</h1>
<h2>[Headline: Clear, Factual, Entity-Rich Statement]</h2>
<p><strong>[Subheading: Supporting context with key differentiator]</strong></p>
<p><em>[City, Date]</em> - [Opening paragraph: Answer-first structure. Lead with the definitive, quotable statement that AI engines will extract. State WHO is doing WHAT and WHY it matters - in one sentence.]</p>
<p>[Second paragraph: Expand on the announcement. Include specific facts, figures, and context. Name the key entities, products, or initiatives clearly.]</p>
<h2>Key Facts</h2>
<ul>
<li>[Fact 1: Specific, quantifiable claim with source attribution]</li>
<li>[Fact 2: Market context or competitive differentiator]</li>
<li>[Fact 3: Timeline, availability, or scope detail]</li>
</ul>
<h2>Quote</h2>
<p>"[Direct quote from spokesperson - include their full name and title. Make the quote substantive, not generic. Include a forward-looking statement or insight.]"</p>
<p>- <strong>[Full Name]</strong>, [Title], [Organisation]</p>
<h2>Background</h2>
<p>[Company/organisation boilerplate. Include founding year, mission, key metrics, and areas of expertise. Write in third person, factual tone.]</p>
<h2>Media Contact</h2>
<p>[Name] | [Email] | [Phone]</p>`;


const statusConfig = {
  draft: { label: "Draft", bg: "#F3F3F3", color: "#6B7280" },
  review: { label: "In Review", bg: "#FFF8EC", color: "#D4922A" },
  approved: { label: "Approved", bg: "#EFF7F2", color: "#3D9B6B" },
  published: { label: "Published", bg: "#E8F0F8", color: "#165265" },
};

export default function PressReleasePage() {
  const [documents, setDocuments] = useState<PressReleaseDoc[]>([]);
  const [activeDoc, setActiveDoc] = useState<PressReleaseDoc | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [docStatus, setDocStatus] = useState<PressReleaseDoc["status"]>("draft");
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openDoc = (doc: PressReleaseDoc) => {
    setActiveDoc(doc);
    setEditorContent(doc.content);
    setDocStatus(doc.status);
  };

  const saveDoc = () => {
    if (!activeDoc) return;
    const updated = documents.map((d) =>
      d.id === activeDoc.id
        ? { ...d, content: editorRef.current?.innerHTML || editorContent, status: docStatus, updatedAt: "15 Apr 2026" }
        : d
    );
    setDocuments(updated);
  };

  const createNewFromTemplate = () => {
    const newDoc: PressReleaseDoc = {
      id: `pr-${Date.now()}`,
      title: "Untitled Press Release",
      status: "draft",
      updatedAt: "15 Apr 2026",
      createdAt: "15 Apr 2026",
      content: PR_TEMPLATE,
      source: "manual",
    };
    setDocuments([newDoc, ...documents]);
    openDoc(newDoc);
    setShowNewMenu(false);
  };

  const createWithAI = () => {
    setShowNewMenu(false);
    setAiGenerating(true);
    setTimeout(() => {
      const aiDoc: PressReleaseDoc = {
        id: `pr-${Date.now()}`,
        title: "AI-Generated Press Release Draft",
        status: "draft",
        updatedAt: "15 Apr 2026",
        createdAt: "15 Apr 2026",
        content: PR_TEMPLATE,
        source: "ai-drafted",
      };
      setDocuments([aiDoc, ...documents]);
      openDoc(aiDoc);
      setAiGenerating(false);
    }, 2000);
  };

  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "txt" && ext !== "rtf") {
      alert("Please upload a .txt file. For Word or PDF documents, copy and paste the content into the editor instead.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const htmlContent = text
        .split("\n")
        .map((line) => {
          const trimmed = escapeHtml(line.trim());
          if (!trimmed) return "";
          if (line.trim() === line.trim().toUpperCase() && line.trim().length > 3 && line.trim().length < 100) {
            return `<h2>${trimmed}</h2>`;
          }
          return `<p>${trimmed}</p>`;
        })
        .join("");
      const newDoc: PressReleaseDoc = {
        id: `pr-${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        status: "draft",
        updatedAt: "15 Apr 2026",
        createdAt: "15 Apr 2026",
        content: htmlContent || `<p>${escapeHtml(text)}</p>`,
        source: "uploaded",
      };
      setDocuments([newDoc, ...documents]);
      openDoc(newDoc);
    };
    reader.readAsText(file);
    e.target.value = "";
    setShowNewMenu(false);
  };

  const deleteDoc = (id: string) => {
    setDocuments(documents.filter((d) => d.id !== id));
    if (activeDoc?.id === id) {
      setActiveDoc(null);
    }
  };

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }, []);

  const exportToWord = async () => {
    if (!editorRef.current) return;
    const el = editorRef.current;
    const paragraphs: Paragraph[] = [];

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();

      if (tag === "h1") {
        paragraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: element.textContent || "", bold: true, size: 32 })],
          })
        );
      } else if (tag === "h2") {
        paragraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: element.textContent || "", bold: true, size: 26 })],
          })
        );
      } else if (tag === "ul" || tag === "ol") {
        element.querySelectorAll("li").forEach((li) => {
          paragraphs.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun(li.textContent || "")],
            })
          );
        });
      } else if (tag === "p" || tag === "div") {
        const runs: TextRun[] = [];
        element.childNodes.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            runs.push(new TextRun(child.textContent || ""));
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childEl = child as HTMLElement;
            const childTag = childEl.tagName.toLowerCase();
            runs.push(
              new TextRun({
                text: childEl.textContent || "",
                bold: childTag === "strong" || childTag === "b",
                italics: childTag === "em" || childTag === "i",
                underline: childTag === "u" ? {} : undefined,
              })
            );
          }
        });
        if (runs.length > 0) {
          paragraphs.push(new Paragraph({ children: runs }));
        }
      } else {
        element.childNodes.forEach(processNode);
      }
    };

    el.childNodes.forEach(processNode);

    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
    });

    const blob = await Packer.toBlob(doc);
    const fileName = activeDoc?.title ? `${activeDoc.title.replace(/[^a-zA-Z0-9 ]/g, "")}.docx` : "press-release.docx";
    saveAs(blob, fileName);
  };

  if (activeDoc) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b" style={{ borderColor: vars.g200, background: "white" }}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => { saveDoc(); setActiveDoc(null); }}
              className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: vars.accent }}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <div className="w-px h-6" style={{ background: vars.g200 }} />
            <input
              className="text-sm font-semibold bg-transparent border-none outline-none flex-1 min-w-0"
              style={{ color: vars.navy }}
              value={activeDoc.title}
              onChange={(e) => {
                setActiveDoc({ ...activeDoc, title: e.target.value });
                setDocuments(documents.map((d) => d.id === activeDoc.id ? { ...d, title: e.target.value } : d));
              }}
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                style={{ background: statusConfig[docStatus].bg, color: statusConfig[docStatus].color }}
              >
                {statusConfig[docStatus].label} <ChevronDown size={12} />
              </button>
              {showStatusMenu && (
                <div className="absolute top-full right-0 mt-1 w-36 rounded-lg border shadow-lg z-50" style={{ background: "white", borderColor: vars.g200 }}>
                  {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setDocStatus(s); setShowStatusMenu(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 flex items-center gap-2"
                      style={{ color: statusConfig[s].color }}
                    >
                      {docStatus === s && <Check size={12} />}
                      {statusConfig[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => { saveDoc(); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition-colors hover:bg-gray-50"
              style={{ borderColor: vars.g200, color: vars.g600 }}
            >
              <Check size={14} /> Save
            </button>
            <button
              onClick={exportToWord}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white"
              style={{ background: vars.accent }}
            >
              <Download size={14} /> Export .docx
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 px-4 sm:px-6 py-2 border-b" style={{ borderColor: vars.g100, background: vars.g50 }}>
          {[
            { cmd: "undo", icon: Undo2, label: "Undo" },
            { cmd: "redo", icon: Redo2, label: "Redo" },
            { cmd: "separator" },
            { cmd: "bold", icon: Bold, label: "Bold" },
            { cmd: "italic", icon: Italic, label: "Italic" },
            { cmd: "underline", icon: Underline, label: "Underline" },
            { cmd: "separator" },
            { cmd: "formatBlock_h1", icon: Heading1, label: "Heading 1" },
            { cmd: "formatBlock_h2", icon: Heading2, label: "Heading 2" },
            { cmd: "formatBlock_blockquote", icon: Quote, label: "Quote" },
            { cmd: "separator" },
            { cmd: "insertUnorderedList", icon: List, label: "Bullet List" },
            { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered List" },
            { cmd: "separator" },
            { cmd: "justifyLeft", icon: AlignLeft, label: "Align Left" },
            { cmd: "justifyCenter", icon: AlignCenter, label: "Align Center" },
          ].map((btn, i) => {
            if (btn.cmd === "separator") {
              return <div key={i} className="w-px h-5 mx-1" style={{ background: vars.g200 }} />;
            }
            const Icon = btn.icon!;
            return (
              <button
                key={btn.cmd}
                onClick={() => {
                  if (btn.cmd.startsWith("formatBlock_")) {
                    const tag = btn.cmd.replace("formatBlock_", "");
                    execCommand("formatBlock", `<${tag}>`);
                  } else {
                    execCommand(btn.cmd);
                  }
                }}
                className="w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-gray-100"
                title={btn.label}
              >
                <Icon size={15} color={vars.g500} />
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto" style={{ background: "white" }}>
          <div className="max-w-3xl mx-auto px-6 sm:px-12 py-8">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="prose prose-sm max-w-none outline-none min-h-[500px] focus:outline-none"
              style={{
                fontFamily: "'Inter', sans-serif",
                lineHeight: 1.75,
                color: vars.g600,
              }}
              dangerouslySetInnerHTML={{ __html: editorContent }}
              onInput={() => {
                if (editorRef.current) {
                  setEditorContent(editorRef.current.innerHTML);
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-1" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
            Press Releases
          </h2>
          <p className="text-sm font-light" style={{ color: vars.g500 }}>
            Upload, draft, and edit press releases. Export as Word documents when ready.
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: vars.accent }}
          >
            <Plus size={16} /> New Press Release
          </button>
          {showNewMenu && (
            <div className="absolute top-full right-0 mt-2 w-64 rounded-xl border shadow-lg z-50 overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
              <button
                onClick={createNewFromTemplate}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b flex items-center gap-3"
                style={{ borderColor: vars.g100 }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(31,116,143,0.08)" }}>
                  <FileText size={16} color={vars.accent} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: vars.navy }}>From Template</p>
                  <p className="text-[11px]" style={{ color: vars.g400 }}>Patrick's standard PR structure</p>
                </div>
              </button>
              <button
                onClick={createWithAI}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b flex items-center gap-3"
                style={{ borderColor: vars.g100 }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(40,150,185,0.08)" }}>
                  <Sparkles size={16} color={vars.teal} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: vars.navy }}>AI-Assisted Draft</p>
                  <p className="text-[11px]" style={{ color: vars.g400 }}>Generate from intake data</p>
                </div>
              </button>
              <label className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 cursor-pointer">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(212,146,42,0.08)" }}>
                  <Upload size={16} color={vars.amber} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: vars.navy }}>Upload Document</p>
                  <p className="text-[11px]" style={{ color: vars.g400 }}>.txt file upload</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.rtf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {aiGenerating && (
        <div className="rounded-xl border p-6 mb-6 flex items-center gap-4" style={{ background: "rgba(40,150,185,0.04)", borderColor: vars.g200 }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse" style={{ background: "rgba(40,150,185,0.12)" }}>
            <Sparkles size={20} color={vars.teal} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: vars.navy }}>AI is drafting your press release...</p>
            <p className="text-xs" style={{ color: vars.g400 }}>Using intake data and Patrick's standard structure</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="px-4 sm:px-6 py-3 border-b flex items-center justify-between" style={{ borderColor: vars.g100, background: vars.g50 }}>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: vars.g400 }}>
            {documents.length} documents
          </span>
          <div className="flex items-center gap-3">
            {["All", "Draft", "Review", "Approved"].map((f) => (
              <span key={f} className="text-[10px] font-medium cursor-pointer" style={{ color: f === "All" ? vars.accent : vars.g400 }}>
                {f}
              </span>
            ))}
          </div>
        </div>
        <div className="divide-y" style={{ borderColor: vars.g100 }}>
          {documents.map((doc) => {
            const sc = statusConfig[doc.status];
            return (
              <div
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 transition-colors hover:bg-gray-50 cursor-pointer group"
                onClick={() => openDoc(doc)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                    background: doc.source === "ai-drafted" ? "rgba(40,150,185,0.08)" : doc.source === "uploaded" ? "rgba(212,146,42,0.08)" : "rgba(31,116,143,0.08)",
                  }}>
                    {doc.source === "ai-drafted" ? <Sparkles size={16} color={vars.teal} /> :
                     doc.source === "uploaded" ? <Upload size={16} color={vars.amber} /> :
                     <FileText size={16} color={vars.accent} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: vars.navy }}>{doc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px]" style={{ color: vars.g400 }}>
                        <Clock size={10} className="inline mr-1" />
                        Updated {doc.updatedAt}
                      </span>
                      <span className="text-[10px]" style={{ color: vars.g400 }}>
                        Created {doc.createdAt}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-12 sm:ml-0">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: sc.bg, color: sc.color }}>
                    {sc.label}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                  >
                    <Trash2 size={14} color={vars.red} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {documents.length === 0 && (
        <div className="rounded-2xl border p-12 text-center" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(31,116,143,0.06)" }}>
            <FileText size={24} color={vars.accent} />
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ color: vars.navy }}>No press releases yet</h3>
          <p className="text-sm mb-4" style={{ color: vars.g400 }}>Create your first press release using a template, AI assistance, or upload an existing document.</p>
          <button
            onClick={() => setShowNewMenu(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: vars.accent }}
          >
            <Plus size={16} /> New Press Release
          </button>
        </div>
      )}
    </div>
  );
}

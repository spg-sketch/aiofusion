import { useState, useEffect } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { TRADE_MEDIA_CATEGORIES } from "../tradeMediaCategories";
import { streamContent, buildProjectDataText, escapeHtml, safeHttpUrl, GenerationProgress, downloadWordDocument, apiBase } from "../lib/contentAi";
import { loadArchive, useContentStore } from "../lib/contentStore";
import { getKeyMessages, getProjectMediaCategories } from "../IntakeForm";
import { getSession as getLocalSession } from "../lib/auth";
import type { Contact, Outlet } from "./MediaDatabasePage";
import { SearchableOutletPicker } from "./MediaDatabasePage";
import { SummaryRow } from "./shared";
type ConfidenceFlag = "V" | "P" | "U";

type MediaJournalist = {
  name: string;
  title: string;
  email: string;
  confidence: ConfidenceFlag;
  roleCurrency: string;
};

type MediaListItem = {
  rank: number;
  publication: string;
  url: string;
  category: string;
  categoryRank: number;
  description: string;
  readership: string;
  reach: string;
  reachVerified: boolean;
  journalists: MediaJournalist[];
  noBeatContactNote?: string;
  authority: number;
  authorityNote?: string;
  pitchAngle: string;
  suggestedPlacement?: string;
};

const MEDIA_LIST_LLM_PROMPT_V2 = `You are acting as a senior UK PR media-list builder.
Using the Content Item selected and referencing the business information on the Project Data document, produce a target media list using the media categories selected in section 1.9. of the Project Data document to support its distribution.
You do not have live web access in this run. Use your training knowledge to identify relevant publications and beat journalists.

For each publication, return:
1. Publication name and homepage URL
2. Category using the media categories selected in section 1.9. of the Project Data document and 1–N relevancy rank within category
3. One-sentence description of the title (format, frequency, subjects and industry covered)
4. One-sentence description of its readership (job titles, seniority, sector)
5. Audience reach - give an approximate figure based on your training knowledge where available (monthly UU, print circ, subscribers) and label as approximate and unverified
6. Beat journalists likely to cover this story (typically 2–5 per outlet), each as: name | job title | email | confidence flag
   Confidence flag rules:
   [V] Verified - email confirmed in a public source from your training data (publication masthead, signed byline footer, Muck Rack/Cision listing).
   [P] Pattern-inferred - journalist confirmed in role in your training data and email matches the publisher's known house pattern.
   [U] Unverified - journalist name and role are known from training data but email cannot be confirmed; include with this flag so the user can verify independently.
   If you have no training-knowledge of a relevant beat journalist for an outlet, leave journalists empty rather than fabricating a name.
7. Authority score (0–100) - relevance-weighted to the primary target audience (cross-checking with Project Data) - not a generic DA score. Briefly justify scores above 90 and below 60.
8. Suggested pitch angle in one sentence (exclusive vs. embargoed release vs. wire pickup)

Hard rules:
- Never fabricate journalist names, titles or emails. If you have no training knowledge of a beat contact, omit rather than invent.
- It is always better to include a known journalist with confidence [U] than to leave the row empty because verification is not possible in this run.
- Flag any known major reshuffles at outlets in the last 24 months in your training data.

Deliverable:
- A sortable Excel with one row per publication and a multi-line journalists cell; methodology tab; first-wave outreach sequence.
- A structured list in a Word document.`;

function MediaResearchPage() {
  useContentStore();
  const [showLLMBrief, setShowLLMBrief] = useState(false);
  const archive = loadArchive().filter((a) => ["Press release", "Article", "Case study", "Whitepaper", "Blog post"].includes(a.contentType));
  const messages = getKeyMessages();
  const projectCats = getProjectMediaCategories();
  const [selectedId, setSelectedId] = useState<string>(() => {
    try { return localStorage.getItem("aio.research.preload") || ""; } catch { return ""; }
  });
  const [mediaList, setMediaList] = useState<MediaListItem[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [mediaChars, setMediaChars] = useState(0);
  const [mediaError, setMediaError] = useState("");

  // Media Database cross-reference
  const sessionUser = getLocalSession();
  const isAdminUser = sessionUser?.role === "admin";
  const [dbContacts, setDbContacts] = useState<Contact[]>([]);
  const [dbOutlets, setDbOutlets] = useState<{ id: number; name: string }[]>([]);
  const [flaggedJournalists, setFlaggedJournalists] = useState<Set<string>>(new Set());
  const [addToDbModal, setAddToDbModal] = useState<{ name: string; title: string; email: string; outletName: string } | null>(null);
  const [addToDbForm, setAddToDbForm] = useState({ firstName: "", lastName: "", role: "", email: "", outletId: "", notes: "" });
  const [addToDbSaving, setAddToDbSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase()}/api/store/media-db/contacts`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
      fetch(`${apiBase()}/api/store/media-db/outlets`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
    ]).then(([cd, od]) => {
      if (cd?.contacts) setDbContacts(cd.contacts as Contact[]);
      if (od?.outlets) setDbOutlets((od.outlets as Outlet[]).map((o) => ({ id: o.id, name: o.name })));
    }).catch(() => {});
  }, []);

  const normStr = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const findDbContact = (aiName: string, aiOutlet: string): Contact | null => {
    const normAi = normStr(aiName);
    if (!normAi) return null;
    for (const c of dbContacts) {
      const dbFull = normStr(`${c.firstName}${c.lastName}`);
      if (!dbFull) continue;
      if (normAi === dbFull || (dbFull.length > 4 && normAi.includes(dbFull)) || (normAi.length > 4 && dbFull.includes(normAi))) {
        if (c.outletName) {
          const normO = normStr(c.outletName);
          const normAiO = normStr(aiOutlet);
          if (normAiO.includes(normO) || normO.includes(normAiO)) return c;
        } else {
          return c;
        }
      }
    }
    return null;
  };

  const openAddToDb = (j: MediaJournalist, outletName: string) => {
    const parts = j.name.trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ");
    const matchedOutlet = dbOutlets.find((o) => {
      const normO = normStr(o.name);
      const normA = normStr(outletName);
      return normO && normA && (normO === normA || normA.includes(normO) || normO.includes(normA));
    });
    setAddToDbForm({ firstName, lastName, role: j.title, email: j.email, outletId: matchedOutlet ? String(matchedOutlet.id) : "", notes: "" });
    setAddToDbModal({ name: j.name, title: j.title, email: j.email, outletName });
  };

  const saveAddToDb = async () => {
    if (addToDbSaving) return;
    setAddToDbSaving(true);
    try {
      const resp = await fetch(`${apiBase()}/api/store/media-db/contacts`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addToDbForm),
      });
      if (resp.ok) {
        const refreshed = await fetch(`${apiBase()}/api/store/media-db/contacts`, { credentials: "include" }).then((r) => r.json()).catch(() => null);
        if (refreshed?.contacts) setDbContacts(refreshed.contacts as Contact[]);
        setAddToDbModal(null);
      }
    } catch {}
    setAddToDbSaving(false);
  };

  useEffect(() => {
    try { localStorage.removeItem("aio.research.preload"); } catch { /* noop */ }
  }, []);

  const selected = archive.find((a) => a.id === selectedId);

  const runRecommendMedia = async () => {
    if (!selected) return;
    setGenerating(true);
    setMediaList(null);
    setMediaChars(0);
    setMediaError("");
    try {
      const data = await streamContent(
        "/api/content/media-list",
        {
          content: {
            title: selected.title,
            contentType: selected.contentType,
            headline: selected.headline || selected.title,
            standfirst: selected.standfirst || "",
            bodyCopy: selected.bodyCopy || selected.body || "",
          },
          mediaCategories: projectCats,
          keyMessages: messages.map((m) => m.long || m.short).filter(Boolean),
          projectData: buildProjectDataText(),
          prompt: MEDIA_LIST_LLM_PROMPT_V2,
        },
        setMediaChars,
      );
      if (!Array.isArray(data.items)) {
        throw new Error("The media list could not be generated right now. Please try again.");
      }
      if (data.items.length === 0) {
        throw new Error("No publications were returned. Check that media categories are set in Project Set-Up 1.9, then try again.");
      }
      setMediaList(data.items as MediaListItem[]);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "The media list could not be generated right now. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const downloadWordDoc = () => {
    if (!mediaList || !selected) return;
    const confidenceLabel = (c: ConfidenceFlag) => c === "V" ? "[V] Verified" : c === "P" ? "[P] Pattern-inferred" : "[U] Unverified";
    const topOutlet = mediaList[0]?.publication ? escapeHtml(mediaList[0].publication) : "the top-ranked outlet";
    const itemsHtml = mediaList.map((m) => `
      <h2 style="font-family:Georgia,serif;color:#102B36;margin-bottom:4px;">${m.rank}. ${escapeHtml(m.publication)}</h2>
      <p style="margin:0 0 8px 0;color:#1f748f;"><a href="${escapeHtml(m.url)}">${escapeHtml(m.url)}</a> · ${escapeHtml(m.category)} · Rank ${m.categoryRank} in category · <b>Authority ${m.authority}/100</b></p>
      <p><b>Description:</b> ${escapeHtml(m.description)}</p>
      <p><b>Readership:</b> ${escapeHtml(m.readership)}</p>
      <p><b>Audience reach:</b> ${escapeHtml(m.reach)}${m.reachVerified ? "" : " <i>(unverified - flag with client)</i>"}</p>
      <p><b>Beat journalists (${m.journalists.length}):</b></p>
      ${m.journalists.length === 0
        ? `<p style="color:#a04040;"><i>${escapeHtml(m.noBeatContactNote || "No current beat contact identified.")}</i></p>`
        : `<ul>${m.journalists.map((j) => `<li><b>${escapeHtml(j.name)}</b> - ${escapeHtml(j.title)} - <a href="mailto:${escapeHtml(j.email)}">${escapeHtml(j.email)}</a> - ${confidenceLabel(j.confidence)}</li>`).join("")}</ul>`
      }
      ${m.authorityNote ? `<p><b>Authority note:</b> ${escapeHtml(m.authorityNote)}</p>` : ""}
      ${m.suggestedPlacement ? `<p><b>Suggested placement:</b> ${escapeHtml(m.suggestedPlacement)}</p>` : ""}
      <p><b>Suggested pitch angle:</b> ${escapeHtml(m.pitchAngle)}</p>
      <hr/>
    `).join("");
    const methodology = `
      <h2 style="font-family:Georgia,serif;color:#102B36;">Methodology, source caveats and first-wave outreach</h2>
      <p><b>Methodology:</b> Generated against the selected content "${escapeHtml(selected.title)}" (${escapeHtml(selected.contentType)}) using the Project Data media categories (section 1.9). Publications are ranked within each category by relevance-weighted authority across the primary target audience. Confidence flags show how each contact was sourced: [V] verified against a public source, [P] pattern-inferred from a confirmed house email pattern, [U] unverified.</p>
      <p><b>Source caveats:</b> Audience reach figures are publisher-stated or third-party-derived and labelled "approximate" where shown. Unverified figures are flagged. [P] pattern-inferred emails should be cross-checked against a second verified address before bulk sends. Confirm every named contact is still in role before pitching.</p>
      <p><b>First-wave outreach sequence:</b></p>
      <ol>
        <li>Day 0 - Exclusive offer to the top-ranked outlet (${topOutlet}) with a 24-hour window.</li>
        <li>Day 1 - Embargoed release to the remaining category leaders.</li>
        <li>Day 2 - Wider distribution with a bespoke angle per outlet.</li>
        <li>Day 5 - Follow-up commentary or data drop to outlets without first-wave coverage.</li>
      </ol>
    `;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Target Media List - ${escapeHtml(selected.title)}</title></head><body style="font-family:Calibri,Arial,sans-serif;color:#102B36;">
      <h1 style="font-family:Georgia,serif;">Target Media List</h1>
      <p><b>Content:</b> ${escapeHtml(selected.title)} (${escapeHtml(selected.contentType)})</p>
      <p><b>Generated:</b> ${new Date().toLocaleDateString("en-GB")}</p>
      <hr/>
      ${itemsHtml}
      ${methodology}
    </body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Target-Media-List_${selected.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcelDoc = () => {
    if (!mediaList || !selected) return;
    const confidenceLabel = (c: ConfidenceFlag) => c === "V" ? "[V] Verified" : c === "P" ? "[P] Pattern-inferred" : "[U] Unverified";
    const topOutlet = mediaList[0]?.publication ? escapeHtml(mediaList[0].publication) : "the top-ranked outlet";
    const journalistCell = (m: MediaListItem) =>
      m.journalists.length === 0
        ? escapeHtml(m.noBeatContactNote || "No current beat contact identified.")
        : m.journalists.map((j) => `${escapeHtml(j.name)} | ${escapeHtml(j.title)} | ${escapeHtml(j.email)} | ${confidenceLabel(j.confidence)}`).join("&#10;");
    const rows = mediaList.map((m) => `
      <tr>
        <td>${m.rank}</td>
        <td>${escapeHtml(m.publication)}</td>
        <td>${escapeHtml(m.url)}</td>
        <td>${escapeHtml(m.category)}</td>
        <td>${m.categoryRank}</td>
        <td>${escapeHtml(m.description)}</td>
        <td>${escapeHtml(m.readership)}</td>
        <td>${escapeHtml(m.reach)}</td>
        <td>${m.reachVerified ? "Yes" : "No"}</td>
        <td style="white-space:pre-line;vertical-align:top;">${journalistCell(m)}</td>
        <td>${m.authority}</td>
        <td>${escapeHtml(m.authorityNote || "")}</td>
        <td>${escapeHtml(m.pitchAngle)}</td>
        <td>${escapeHtml(m.suggestedPlacement || "")}</td>
      </tr>
    `).join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Media List</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions><x:WorksheetSource HRef="#MediaList"/></x:ExcelWorksheet><x:ExcelWorksheet><x:Name>Methodology</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions><x:WorksheetSource HRef="#Methodology"/></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body>
<table id="MediaList" border="1">
  <thead><tr style="background:#102B36;color:white;font-weight:bold;">
    <th>Rank</th><th>Publication</th><th>URL</th><th>Category</th><th>Category rank</th><th>Description</th><th>Readership</th><th>Audience reach</th><th>Reach verified</th><th>Beat journalists (name | title | email | confidence)</th><th>Authority /100</th><th>Authority note</th><th>Pitch angle</th><th>Suggested placement</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<table id="Methodology" border="1">
  <thead><tr style="background:#102B36;color:white;font-weight:bold;"><th>Section</th><th>Detail</th></tr></thead>
  <tbody>
    <tr><td style="font-weight:bold;">Generated for</td><td>${escapeHtml(selected.title)} (${escapeHtml(selected.contentType)})</td></tr>
    <tr><td style="font-weight:bold;">Ranking method</td><td>Publications are ranked within each category by relevance-weighted authority across the primary target audience using Project Data media categories (section 1.9).</td></tr>
    <tr><td style="font-weight:bold;">Confidence flags</td><td>[V] verified against a public source; [P] pattern-inferred from a confirmed house email pattern; [U] training-knowledge contact, unverified.</td></tr>
    <tr><td style="font-weight:bold;">Reach figures</td><td>Publisher-stated or third-party-derived; labelled approximate where shown.</td></tr>
    <tr><td style="font-weight:bold;">Source caveats</td><td>Unverified ([U]) contacts should be confirmed still in role before pitching. [P] pattern-inferred emails should be cross-checked against a second verified address before bulk sends.</td></tr>
    <tr><td colspan="2"></td></tr>
    <tr><td colspan="2" style="font-weight:bold;background:#102B36;color:white;">First-wave outreach sequence</td></tr>
    <tr><td style="font-weight:bold;">Day 0</td><td>Exclusive offer to the top-ranked outlet (${topOutlet}) with a 24-hour window.</td></tr>
    <tr><td style="font-weight:bold;">Day 1</td><td>Embargoed release to the remaining category leaders.</td></tr>
    <tr><td style="font-weight:bold;">Day 2</td><td>Wider distribution with a bespoke angle per outlet.</td></tr>
    <tr><td style="font-weight:bold;">Day 5</td><td>Follow-up commentary or data drop to outlets without first-wave coverage.</td></tr>
  </tbody>
</table>
</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Target-Media-List_${selected.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const confidenceLabel = (c: ConfidenceFlag) =>
    c === "V" ? "Verified" : c === "P" ? "Pattern-inferred" : "Unverified";
  const confidenceColor = (c: ConfidenceFlag) =>
    c === "V" ? "#3D9B6B" : c === "P" ? "#C9A04E" : "#A04040";

  const ink = "#102B36";
  const accentPink = "#C8497A";
  const accentSoft = "#FBE3ED";
  return (
    <div className="p-6 sm:p-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3" style={{ background: accentSoft, border: `1px solid ${accentPink}40` }}>
          <Target size={12} color={accentPink} />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accentPink }}>Media Research</span>
        </div>
        <h1 className="text-3xl sm:text-4xl mb-2 leading-[1.1]" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Media Research</h1>
        <p className="text-[15px] font-light max-w-3xl" style={{ color: vars.g600 }}>
          Pick a piece from your Archive and let AI recommend the publications and journalists most likely to run it. Coverage on the right trusted outlets is one of the strongest signals AI models use when deciding who to cite, so targeted outreach grows your authority directly. Recommendations come from the media categories you chose in Project Set-Up.
        </p>
      </div>

      {/* Select Content */}
      <div className="bg-white rounded-2xl border p-5 sm:p-6 mb-6" style={{ borderColor: vars.g200 }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: vars.gold }}>1. Select Content</p>
        {(() => {
          const ELIGIBLE_TYPES = ["Press release", "Article", "Case study", "Whitepaper", "Blog post"];
          const eligible = archive.filter((a) => ELIGIBLE_TYPES.includes(a.contentType));
          return eligible.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center" style={{ borderColor: vars.g300 }}>
              <p className="text-[13px] font-light" style={{ color: vars.g500 }}>No Press Releases, Articles, Case Studies, Whitepapers or Blog Posts in the Archive yet.</p>
              <p className="text-[12px] font-light mt-1" style={{ color: vars.g400 }}>Send a piece from the Optimiser or Creator to start. Both approved and draft items will appear here.</p>
            </div>
          ) : (
            <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setMediaList(null); setMediaError(""); }} className="w-full px-3 py-2.5 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
              <option value="">- Choose a piece from Archive -</option>
              {eligible.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.contentType}{a.status ? ` · ${a.status}` : ""})</option>)}
            </select>
          );
        })()}
      </div>

      {selected && (
        <>
          {/* Selected content summary */}
          <div className="bg-white rounded-2xl border p-5 sm:p-6 mb-6" style={{ borderColor: vars.g200 }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-3" style={{ color: vars.gold }}>2. Selected content</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SummaryRow label="Title" value={selected.title} />
              <SummaryRow label="Content type" value={selected.contentType} />
              <SummaryRow label="Spokesperson" value={selected.spokesperson || "-"} />
              <SummaryRow label="LLM target" value={selected.tags?.find((t) => t.startsWith("llm-")) || "General (All LLMs)"} />
              <SummaryRow label="Key messages" value={messages.slice(0, 3).map((m) => m.short).join(" · ") || "-"} />
              <SummaryRow label="Media categories" value={projectCats.length > 0 ? `${projectCats.length} from Project Data` : "-"} />
            </div>
          </div>

          {/* Action button */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={runRecommendMedia}
              disabled={generating}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ background: vars.coral }}
            >
              {generating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Building media list…
                </>
              ) : (
                <>
                  <Target size={14} /> Recommend Media
                </>
              )}
            </button>
            <span className="text-[11px] font-light self-center" style={{ color: vars.g500 }}>
              Submits the LLM prompt below. Returns a structured list, downloadable as Word and Excel.
            </span>
          </div>

          {generating && (
            <div className="mb-6">
              <GenerationProgress
                stages={[
                  "Reviewing your content",
                  "Matching outlets to your media categories",
                  "Identifying beat journalists",
                  "Scoring authority and likely pickup",
                  "Compiling your media list",
                ]}
                chars={mediaChars}
                accent={vars.coral}
              />
            </div>
          )}

          {mediaError && (
            <div className="flex items-start gap-2 rounded-lg border p-3 text-[12px] mb-6" style={{ borderColor: "rgba(176,61,51,0.4)", background: "rgba(176,61,51,0.06)", color: "#B03D33" }}>
              <X size={14} className="mt-0.5 flex-shrink-0" /> <span>{mediaError}</span>
            </div>
          )}

          {/* Results */}
          {mediaList && (
            <div className="bg-white rounded-2xl border overflow-hidden mb-6" style={{ borderColor: vars.g200 }}>
              <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2" style={{ borderColor: vars.g100, background: vars.g50 }}>
                <div>
                  <h3 className="text-[15px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Target Media List</h3>
                  <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>Ordered overall by likelihood of pickup. {mediaList.length} publications.</p>
                </div>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: vars.g500 }}>
                  <span><b style={{ color: "#3D9B6B" }}>[V]</b> Verified</span>
                  <span><b style={{ color: "#C9A04E" }}>[P]</b> Pattern-inferred</span>
                  <span><b style={{ color: "#A04040" }}>[U]</b> Unverified</span>
                </div>
              </div>
              <div className="divide-y" style={{ borderColor: vars.g100 }}>
                {mediaList.map((m) => (
                  <div key={m.rank} className="p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: vars.coral }}>
                          {m.rank}. {m.category} · Rank {m.categoryRank} in category
                        </p>
                        <h4 className="text-[18px] font-semibold mt-0.5" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{m.publication}</h4>
                        <a href={m.url} target="_blank" rel="noreferrer" className="text-[12px] font-light underline" style={{ color: vars.accent }}>{m.url}</a>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.g500 }}>Authority</p>
                        <p className="text-[24px] font-bold leading-none mt-1" style={{ color: vars.gold }}>{m.authority}<span className="text-[12px] font-light" style={{ color: vars.g400 }}>/100</span></p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mt-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: vars.g500 }}>Title</p>
                        <p className="text-[13px] font-light" style={{ color: vars.navy }}>{m.description}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: vars.g500 }}>Readership</p>
                        <p className="text-[13px] font-light" style={{ color: vars.navy }}>{m.readership}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-0.5" style={{ color: vars.g500 }}>Audience reach</p>
                        <p className="text-[13px] font-light" style={{ color: vars.navy }}>
                          {m.reach}
                          {!m.reachVerified && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(224,120,86,0.15)", color: vars.coral }}>unverified</span>}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: vars.g500 }}>
                        Beat journalists ({m.journalists.length})
                      </p>
                      {m.journalists.length === 0 ? (
                        <div className="rounded-lg p-3 text-[12.5px] font-light italic" style={{ background: "rgba(160,64,64,0.08)", border: "1px solid rgba(160,64,64,0.2)", color: "#7A2E2E" }}>
                          {m.noBeatContactNote || "No current beat contact identified."}
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {m.journalists.map((j) => {
                            const dbMatch = findDbContact(j.name, m.publication);
                            const effectiveEmail = dbMatch?.email || j.email;
                            const effectiveTitle = dbMatch?.role || j.title;
                            const flagKey = j.name + "|" + m.publication;
                            const isFlagged = flaggedJournalists.has(flagKey);
                            return (
                              <li key={j.name} className="text-[13px] font-light" style={{ color: vars.navy }}>
                                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 flex-1 min-w-0">
                                    {dbMatch ? (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(61,155,107,0.12)", color: "#3D9B6B" }}>[V] Database</span>
                                    ) : (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${confidenceColor(j.confidence)}1a`, color: confidenceColor(j.confidence) }}>[{j.confidence}] {confidenceLabel(j.confidence)}</span>
                                    )}
                                    <span className="font-semibold">{j.name}</span>
                                    <span style={{ color: vars.g500 }}>- {effectiveTitle}</span>
                                    {effectiveEmail && <a href={`mailto:${effectiveEmail}`} className="text-[12px] underline" style={{ color: vars.accent }}>{effectiveEmail}</a>}
                                    {dbMatch && j.email && dbMatch.email && normStr(dbMatch.email) !== normStr(j.email) && (
                                      <span className="text-[10px] line-through" style={{ color: vars.g300 }}>{j.email}</span>
                                    )}
                                  </div>
                                  {!dbMatch && isAdminUser && j.confidence === "U" && (
                                    <button onClick={() => openAddToDb(j, m.publication)} className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded" style={{ background: "rgba(31,116,143,0.1)", color: vars.accent }}>
                                      <Plus size={10} /> Add to database
                                    </button>
                                  )}
                                  {!dbMatch && !isAdminUser && j.confidence === "U" && !isFlagged && (
                                    <button onClick={() => setFlaggedJournalists((prev) => new Set([...prev, flagKey]))} className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded" style={{ background: "rgba(201,160,78,0.1)", color: "#7A5E25" }}>
                                      Flag for review
                                    </button>
                                  )}
                                  {isFlagged && (
                                    <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded" style={{ background: "rgba(201,160,78,0.15)", color: "#7A5E25" }}>Flagged</span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    {m.authorityNote && (
                      <div className="mt-3 p-2.5 rounded-lg" style={{ background: "rgba(201,160,78,0.1)" }}>
                        <p className="text-[12px] font-light italic" style={{ color: "#7A5E25" }}><span className="font-bold not-italic">Authority note:</span> {m.authorityNote}</p>
                      </div>
                    )}
                    {m.suggestedPlacement && (
                      <div className="mt-3 p-2.5 rounded-lg" style={{ background: "rgba(16,43,54,0.05)" }}>
                        <p className="text-[12px] font-light" style={{ color: ink }}><span className="font-bold">Suggested placement:</span> {m.suggestedPlacement}</p>
                      </div>
                    )}
                    <div className="mt-3 p-2.5 rounded-lg" style={{ background: accentSoft }}>
                      <p className="text-[12px] font-light" style={{ color: ink }}><span className="font-bold">Suggested pitch angle:</span> {m.pitchAngle}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Download buttons */}
              <div className="px-5 py-4 border-t flex flex-wrap items-center gap-3" style={{ borderColor: vars.g100, background: vars.g50 }}>
                <p className="text-[11px] font-light flex-1 min-w-[200px]" style={{ color: vars.g500 }}>
                  Both formats include a methodology, source caveats and a first-wave outreach sequence.
                </p>
                <button
                  onClick={downloadWordDoc}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border bg-white"
                  style={{ borderColor: vars.g200, color: vars.navy }}
                >
                  <FileText size={13} color="#2B579A" /> Download as Word doc
                </button>
                <button
                  onClick={downloadExcelDoc}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border bg-white"
                  style={{ borderColor: vars.g200, color: vars.navy }}
                >
                  <FileText size={13} color="#1F7244" /> Download as Excel doc
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add to database modal */}
      {addToDbModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setAddToDbModal(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <div>
                <h2 className="text-[16px] font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Add to Media Database</h2>
                <p className="text-[12px] font-light mt-0.5" style={{ color: vars.g500 }}>Saving from Media Research: <b>{addToDbModal.outletName}</b></p>
              </div>
              <button onClick={() => setAddToDbModal(null)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {(["firstName", "lastName"] as const).map((key) => (
                  <div key={key}>
                    <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{key === "firstName" ? "First name" : "Last name"}</label>
                    <input value={addToDbForm[key]} onChange={(e) => setAddToDbForm((f) => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                  </div>
                ))}
              </div>
              {(["role", "email"] as const).map((key) => (
                <div key={key}>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>{key === "role" ? "Role / title" : "Email"}</label>
                  <input value={addToDbForm[key]} onChange={(e) => setAddToDbForm((f) => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Publication / outlet</label>
                <SearchableOutletPicker outlets={dbOutlets} value={addToDbForm.outletId} onChange={(id) => setAddToDbForm((f) => ({ ...f, outletId: id }))} />
                {!addToDbForm.outletId && (
                  <p className="text-[11px] mt-1.5" style={{ color: vars.g400 }}>Outlet not yet in your database — add it in Media Database first, then it will appear here.</p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: vars.g500 }}>Notes</label>
                <textarea rows={2} value={addToDbForm.notes} onChange={(e) => setAddToDbForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Beat, preferences, any context..." className="w-full px-3 py-2 rounded-lg border text-[13px] resize-none" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: vars.g200 }}>
              <button onClick={() => setAddToDbModal(null)} className="px-4 py-2 rounded-lg text-[13px] font-semibold border" style={{ borderColor: vars.g200, color: vars.g500 }}>Cancel</button>
              <button onClick={() => void saveAddToDb()} disabled={(!addToDbForm.firstName.trim() && !addToDbForm.lastName.trim()) || addToDbSaving} className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent, opacity: (!addToDbForm.firstName.trim() && !addToDbForm.lastName.trim()) || addToDbSaving ? 0.5 : 1 }}>
                {addToDbSaving ? "Saving..." : "Add to database"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export { MediaResearchPage };

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { streamContent, buildProjectDataText, CONTENT_AI_TIMEOUT_MS, escapeHtml, textToHtmlParagraphs, downloadWordDocument, GenerationProgress, safeHttpUrl } from "../lib/contentAi";
import { loadArchive, saveArchive, useContentStore, splitArchiveBody, type ArchiveItem, loadPlannerProjects, savePlannerProjects, getISOWeek, weekDateLabel, type PlannerProject } from "../lib/contentStore";
import { getKeyMessages, getSpokespeople, loadIntakeData, getActiveProjectId, getProjectMediaCategories, getLlmSearchQueries, getCompetitors, getConfirmedEntity } from "../IntakeForm";
import { CategoryPickerModal, CONTENT_TYPES, countWords, Labelled } from "./shared";
import InfoTip from "../InfoTip";
import { loadSavedAudits } from "../LlmCheckPage";
import CountdownBanner from "../components/CountdownBanner";
type CreatorFieldKey = "headline" | "standfirst" | "pitch" | "transcript" | "actionNotes";

const CREATOR_FIELD_LABELS: Record<CreatorFieldKey, string> = {
  headline: "headline",
  standfirst: "standfirst",
  pitch: "pitch idea",
  transcript: "transcript",
  actionNotes: "action notes",
};

function ContentCreatorPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  useContentStore();
  const [showLLMBrief, setShowLLMBrief] = useState(false);
  const intake = loadIntakeData();
  const spokesList = getSpokespeople();
  const projectCategories = getProjectMediaCategories();

  const [projectName, setProjectName] = useState(() => (intake?.formData["4.1"] as string) || "");
  const [contentType, setContentType] = useState("Article");
  const [articleHeadline, setArticleHeadline] = useState("");
  const [standfirst, setStandfirst] = useState("");
  const [headline, setHeadline] = useState("");
  const [transcript, setTranscript] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [editorFontSize, setEditorFontSize] = useState<number>(13);
  const [optimisedFields, setOptimisedFields] = useState<Set<CreatorFieldKey>>(new Set());
  const [fieldSnapshots, setFieldSnapshots] = useState<Partial<Record<CreatorFieldKey, string>>>({});
  const [changeLog, setChangeLog] = useState<{ kind: "embed" | "structure" | "flag"; text: string; field?: CreatorFieldKey }[]>([]);
  const [showDownloadNotesModal, setShowDownloadNotesModal] = useState(false);
  const [spokesperson, setSpokesperson] = useState(spokesList[0]?.name || "");
  const [spokesLi, setSpokesLi] = useState(spokesList[0]?.linkedin || "");
  const [mediaTarget, setMediaTarget] = useState<string[]>([]);
  const [contentStatus, setContentStatus] = useState<"Draft" | "Review" | "Final">("Draft");
  const [pubDate, setPubDate] = useState("");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [optimisingField, setOptimisingField] = useState<CreatorFieldKey | null>(null);
  const [creatorChars, setCreatorChars] = useState(0);
  const [creatorError, setCreatorError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateChars, setGenerateChars] = useState(0);
  const [generated, setGenerated] = useState(false);
  const [draftSnapshot, setDraftSnapshot] = useState<{ articleHeadline: string; standfirst: string; transcript: string } | null>(null);
  const [supportingData, setSupportingData] = useState<{ text: string; url: string }[]>([]);
  const [targetQuery, setTargetQuery] = useState<{ text: string; category: "discovery" | "shortlist" | "comparison" } | null>(null);

  const llmQueries = getLlmSearchQueries();
  const projectCompetitors = getCompetitors();
  const confirmedEntity = getConfirmedEntity();
  const geography =
    (Array.isArray((intake as { stringLists?: Record<string, string[]> })?.stringLists?.["3.3"])
      ? ((intake as { stringLists?: Record<string, string[]> }).stringLists!["3.3"]).filter(Boolean).join(", ")
      : "") ||
    (typeof (intake as { formData?: Record<string, unknown> })?.formData?.["4.5"] === "string"
      ? ((intake as { formData?: Record<string, unknown> }).formData!["4.5"] as string)
      : "");
  const allLlmQueries: { text: string; category: "discovery" | "shortlist" | "comparison" }[] = [
    ...llmQueries.discovery.map((q) => ({ text: q, category: "discovery" as const })),
    ...llmQueries.shortlist.map((q) => ({ text: q, category: "shortlist" as const })),
    ...llmQueries.comparison.map((q) => ({ text: q, category: "comparison" as const })),
  ];

  const articleHeadlineWords = countWords(articleHeadline);
  const standfirstWords = countWords(standfirst);
  const headlineWords = countWords(headline);
  const transcriptWords = countWords(transcript);
  const articleHeadlineOver = articleHeadlineWords > 20;
  const standfirstOver = standfirstWords > 50;
  const headlineOver = headlineWords > 300;
  const transcriptOver = transcriptWords > 8000;

  const onPickSpokesperson = (name: string) => {
    setSpokesperson(name);
    const s = spokesList.find((x) => x.name === name);
    setSpokesLi(s?.linkedin || "");
  };

  // Preload from archive when navigated here from the Archive page
  useEffect(() => {
    let archiveId = "";
    try { archiveId = localStorage.getItem("aio.creator.preload") || ""; } catch { /* noop */ }
    if (!archiveId) return;
    try { localStorage.removeItem("aio.creator.preload"); } catch { /* noop */ }
    const arc = loadArchive().find((a) => a.id === archiveId);
    if (arc) {
      const parts = splitArchiveBody(arc);
      setArticleHeadline(parts.headline);
      setStandfirst(parts.standfirst);
      setTranscript(parts.bodyCopy);
      if (arc.contentType) setContentType(arc.contentType);
      if (arc.spokesperson) setSpokesperson(arc.spokesperson);
    }
  }, []);

  const archiveItem = () => {
    const items = loadArchive();
    const item: ArchiveItem = {
      id: `arch-${Date.now()}`,
      title: articleHeadline.trim().slice(0, 120) || headline.split("\n")[0].slice(0, 120) || projectName || "Untitled draft",
      contentType,
      spokesperson,
      status: contentStatus === "Final" ? "Final" : "Draft",
      tags: [contentType.toLowerCase().replace(/\s+/g, "-"), "creator"],
      body: [articleHeadline, standfirst, transcript].filter(Boolean).join("\n\n") || "(No content supplied)",
      headline: articleHeadline,
      standfirst: standfirst,
      bodyCopy: transcript,
      createdAt: new Date().toISOString(),
      source: "creator",
    };
    saveArchive([item, ...items]);
    alert(`Saved "${item.title}" to Archive.`);
  };

  const downloadDoc = () => {
    const accent = "#C8497A";
    const meta = [contentType, spokesperson && spokesperson !== "NA" ? spokesperson : "", contentStatus]
      .filter(Boolean)
      .join("  •  ");
    const targetList = mediaTarget.length
      ? `<p style="margin:0 0 14pt 0;">${mediaTarget.map((c) => escapeHtml(c)).join(", ")}</p>`
      : `<p style="margin:0 0 14pt 0; color:#6b7280;">None selected.</p>`;
    const articleWordCount = countWords(transcript);
    const html =
      `<h1 style="font-family:Georgia,serif; font-size:22pt; color:#16213e; margin:0 0 6pt 0;">${escapeHtml(articleHeadline || projectName || "Untitled draft")}</h1>` +
      (standfirst ? `<p style="font-size:13pt; font-style:italic; color:#374151; margin:0 0 14pt 0;">${escapeHtml(standfirst)}</p>` : "") +
      `<p style="font-size:9pt; text-transform:uppercase; letter-spacing:1px; color:${accent}; margin:0 0 4pt 0;">${escapeHtml(meta)}</p>` +
      `<p style="font-size:10pt; color:#6b7280; margin:0 0 18pt 0;">Project: ${escapeHtml(projectName || "-")}  &bull;  Publication: ${escapeHtml(pubDate || "TBD")}${spokesLi ? `  &bull;  ${escapeHtml(spokesLi)}` : ""}  &bull;  ${articleWordCount.toLocaleString()} words</p>` +
      `<hr style="border:none; border-top:1px solid #e5e7eb; margin:0 0 16pt 0;"/>` +
      `<h2 style="font-size:13pt; color:#16213e; margin:0 0 6pt 0;">Pitch idea / news hook</h2>` +
      (textToHtmlParagraphs(headline) || `<p style="margin:0 0 14pt 0; color:#6b7280;">(none)</p>`) +
      `<h2 style="font-size:13pt; color:#16213e; margin:0 0 6pt 0;">Article</h2>` +
      (textToHtmlParagraphs(transcript) || `<p style="margin:0 0 14pt 0; color:#6b7280;">(none)</p>`) +
      (actionNotes.trim() ? `<h2 style="font-size:13pt; color:#16213e; margin:0 0 6pt 0;">Action notes</h2>${textToHtmlParagraphs(actionNotes)}` : "") +
      `<hr style="border:none; border-top:1px solid #e5e7eb; margin:16pt 0;"/>` +
      `<h2 style="font-size:13pt; color:#16213e; margin:0 0 6pt 0;">Media target</h2>${targetList}`;
    downloadWordDocument(`Content Notes - ${(articleHeadline || projectName || "creator-brief").replace(/[^a-z0-9]/gi, "_")}.doc`, html);
  };

  const projectMessages = getKeyMessages();
  const hasAnyContent = articleHeadline.trim().length > 0 || standfirst.trim().length > 0 || transcript.trim().length > 0 || headline.trim().length > 0;
  const isOpt = (k: CreatorFieldKey) => optimisedFields.has(k);
  const anyOptimised = optimisedFields.size > 0;

  const getFieldValue = (key: CreatorFieldKey): string =>
    key === "headline" ? articleHeadline : key === "standfirst" ? standfirst : key === "pitch" ? headline : key === "transcript" ? transcript : actionNotes;
  const setFieldValue = (key: CreatorFieldKey, val: string) => {
    if (key === "headline") setArticleHeadline(val);
    else if (key === "standfirst") setStandfirst(val);
    else if (key === "pitch") setHeadline(val);
    else if (key === "transcript") setTranscript(val);
    else setActionNotes(val);
  };

  type ChangeLogEntry = { kind: "embed" | "structure" | "flag"; text: string; field: CreatorFieldKey };

  const optimiseField = async (key: CreatorFieldKey) => {
    if (optimisedFields.has(key) || optimisingField) return;
    const value = getFieldValue(key);
    if (!value.trim()) {
      alert("Add some copy to this field first, then Optimise will improve it.");
      return;
    }
    setCreatorError("");
    setCreatorChars(0);
    setOptimisingField(key);
    try {
      const data = await streamContent(
        "/api/content/creator-field",
        {
          fieldKey: key,
          value,
          contentType,
          projectName,
          spokesperson: spokesperson === "NA" ? "" : spokesperson,
          headline: articleHeadline,
          standfirst,
          pitch: headline,
          keyMessages: projectMessages.map((m) => m.long || m.short).filter(Boolean),
          projectData: buildProjectDataText(),
        },
        setCreatorChars,
      );
      const nextValue = data.next;
      if (typeof nextValue !== "string") {
        throw new Error("The optimisation could not be generated right now. Please try again.");
      }
      const log: ChangeLogEntry[] = Array.isArray(data.log)
        ? data.log
            .map((c: { kind?: string; text?: string }) => ({
              kind: (c.kind === "embed" || c.kind === "flag" ? c.kind : "structure") as ChangeLogEntry["kind"],
              text: String(c.text || ""),
              field: key,
            }))
            .filter((c: ChangeLogEntry) => c.text.length > 0)
        : [];
      setFieldSnapshots((prev) => ({ ...prev, [key]: value }));
      setFieldValue(key, nextValue);
      setChangeLog((prev) => [...prev, ...log]);
      setOptimisedFields((prev) => new Set(prev).add(key));
    } catch (err) {
      setCreatorError(err instanceof Error ? err.message : "The optimisation could not be generated right now. Please try again.");
    } finally {
      setOptimisingField(null);
    }
  };

  const rejectField = (key: CreatorFieldKey) => {
    if (!optimisedFields.has(key)) return;
    const snap = fieldSnapshots[key];
    if (snap !== undefined) setFieldValue(key, snap);
    setFieldSnapshots((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setChangeLog((prev) => prev.filter((c) => c.field !== key));
    setOptimisedFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
  };

  const CREATOR_PROMPT_1_TYPES = ["Press release", "Case study", "Speaker submission", "Award submission", "Event copy", "Directory entry"];
  const createPromptLabel =
    contentType === "Article Media Pitch" ? "Prompt 2.2"
    : CREATOR_PROMPT_1_TYPES.includes(contentType) ? "Prompt 1.1"
    : "Prompt 2.1";

  const createDraft = async () => {
    if (generating || optimisingField) return;
    const theme = articleHeadline.trim() || headline.trim() || transcript.trim();
    if (!theme && !targetQuery) {
      alert("Add a headline or select a Target LLM Query so the AI knows what to write about.");
      return;
    }
    setCreatorError("");
    setGenerateChars(0);
    setGenerating(true);
    const snapshot = { articleHeadline, standfirst, transcript };
    let queryAuditData: { mentionCount: number; totalProbes: number; competitors: string[] } | undefined;
    if (targetQuery) {
      const projectId = getActiveProjectId() || "default";
      const savedAudits = loadSavedAudits(projectId);
      if (savedAudits.length > 0) {
        const latestAudit = savedAudits[0];
        const matchingProbes = latestAudit.result.probes.filter((p) => p.question === targetQuery.text);
        if (matchingProbes.length > 0) {
          const mentionCount = matchingProbes.filter((p) => p.mentioned).length;
          const auditCompetitors = Array.from(new Set(matchingProbes.flatMap((p) => p.competitors || []).filter(Boolean)));
          queryAuditData = { mentionCount, totalProbes: matchingProbes.length, competitors: auditCompetitors };
        }
      }
    }
    try {
      const data = await streamContent(
        "/api/content/generate",
        {
          contentType,
          projectName,
          spokesperson: spokesperson === "NA" ? "" : spokesperson,
          spokesLi,
          headline: articleHeadline,
          pitch: headline,
          sourceNotes: transcript,
          selectedMessages: projectMessages.map((m) => m.long || m.short).filter(Boolean),
          mediaCategories: mediaTarget,
          projectData: buildProjectDataText(),
          targetQuery: targetQuery ? { text: targetQuery.text, category: targetQuery.category } : undefined,
          queryAuditData,
          confirmedCompany: confirmedEntity?.name || "",
          competitors: projectCompetitors.slice(0, 10),
          geography,
        },
        setGenerateChars,
      );
      setDraftSnapshot(snapshot);
      if (typeof data.headline === "string" && data.headline.trim()) setArticleHeadline(data.headline.trim());
      if (typeof data.standfirst === "string") setStandfirst(data.standfirst);
      if (typeof data.bodyCopy === "string") setTranscript(data.bodyCopy);
      const log = Array.isArray(data.changeLog)
        ? (data.changeLog as { kind?: string; text?: string }[])
            .map((c) => ({
              kind: (c.kind === "embed" || c.kind === "flag" ? c.kind : "structure") as "embed" | "structure" | "flag",
              text: String(c.text || ""),
            }))
            .filter((c) => c.text.length > 0)
        : [];
      setChangeLog(log);
      setSupportingData(
        Array.isArray(data.supportingData)
          ? (data.supportingData as { text?: string; url?: string }[])
              .filter((d) => d && typeof d.text === "string" && d.text.trim().length > 0)
              .map((d) => ({ text: String(d.text), url: safeHttpUrl(d.url) }))
          : [],
      );
      setOptimisedFields(new Set());
      setFieldSnapshots({});
      setGenerated(true);
    } catch (err) {
      setCreatorError(err instanceof Error ? err.message : "The draft could not be generated right now. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const discardDraft = () => {
    if (!draftSnapshot) return;
    if (!window.confirm("Discard the AI draft and restore what you had before?")) return;
    setArticleHeadline(draftSnapshot.articleHeadline);
    setStandfirst(draftSnapshot.standfirst);
    setTranscript(draftSnapshot.transcript);
    setDraftSnapshot(null);
    setChangeLog([]);
    setSupportingData([]);
    setOptimisedFields(new Set());
    setFieldSnapshots({});
    setGenerated(false);
  };

  const optimisePill = (key: CreatorFieldKey) => (
    isOpt(key) ? (
      <button
        type="button"
        onClick={() => rejectField(key)}
        title="Reject the AI version and restore the copy you had"
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors"
        style={{ color: "#C94A3E", background: "rgba(201,74,62,0.08)" }}
      >
        <Undo2 size={12} /> Reject
      </button>
    ) : (
      <button
        type="button"
        onClick={() => optimiseField(key)}
        disabled={getFieldValue(key).trim().length === 0 || optimisingField !== null}
        title="Optimise this copy: the LLM rewrites what you have written to be stronger and easier for AI models to cite, weaving in your key messages from Project Data. You can Reject to restore your original."
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: vars.teal, background: "rgba(40,150,185,0.08)" }}
      >
        {optimisingField === key ? <><Loader2 size={12} className="animate-spin" /> Optimising…</> : <><Sparkles size={12} /> Optimise this copy</>}
      </button>
    )
  );

  const acceptAndArchive = () => {
    archiveItem();
    setOptimisedFields(new Set());
    setFieldSnapshots({});
  };

  const shareDraftFromCreator = () => {
    const subject = encodeURIComponent(`Draft for review: ${articleHeadline || projectName || "Untitled"}`);
    const body = encodeURIComponent(`Headline: ${articleHeadline}\n\nStandfirst:\n${standfirst}\n\nPitch idea:\n${headline}\n\nBody:\n${transcript}\n\n- sent via AIO Fusion`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const sendToMediaResearchFromCreator = () => {
    const id = `temp-${Date.now()}`;
    const items = loadArchive();
    saveArchive([{
      id,
      title: articleHeadline.trim().slice(0, 120) || projectName || "Untitled draft",
      contentType,
      spokesperson: spokesperson === "NA" ? "" : spokesperson,
      status: "Draft",
      tags: [contentType.toLowerCase().replace(/\s+/g, "-"), "creator"],
      body: [standfirst, transcript].filter(Boolean).join("\n\n"),
      headline: articleHeadline,
      standfirst: standfirst,
      bodyCopy: transcript,
      createdAt: new Date().toISOString(),
    }, ...items]);
    try { localStorage.setItem("aio.research.preload", id); } catch { /* noop */ }
    onNavigate("media-research");
  };

  const pushToCommsPlanner = () => {
    const projects = loadPlannerProjects();
    const fallbackNote = anyOptimised ? "Pushed from Content Creator (LLM-optimised draft)." : "Pushed from Content Creator.";
    const proj: PlannerProject = {
      id: `pp-${Date.now()}`,
      title: articleHeadline.trim().slice(0, 120) || projectName || "Untitled draft",
      contentType,
      spokesperson: spokesperson === "NA" ? "" : spokesperson,
      keyMessage: projectMessages[0]?.short || "",
      audience: mediaTarget[0] || "",
      channels: mediaTarget.slice(0, 4),
      week: pubDate ? getISOWeek(new Date(pubDate)) : getISOWeek(new Date()),
      status: contentStatus === "Final" ? "Approved" : contentStatus === "Review" ? "Review" : "Drafting",
      releaseDate: pubDate,
      notes: actionNotes.trim() || fallbackNote,
    };
    savePlannerProjects([proj, ...projects]);
    alert(`"${proj.title}" pushed to the Comms Planner (w/c ${weekDateLabel(proj.week)}).`);
    onNavigate("planner");
  };

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const downloadOptimisationNotes = (format: "word" | "pdf") => {
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const embedItems = changeLog.filter((c) => c.kind === "embed");
    const structureItems = changeLog.filter((c) => c.kind === "structure");
    const flagItems = changeLog.filter((c) => c.kind === "flag");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Content Notes - ${escapeHtml(articleHeadline || projectName || "Draft")}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #102B36; max-width: 720px; margin: 32px auto; padding: 0 24px; line-height: 1.65; font-size: 14px; }
  .meta { font-family: Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: #6b7280; margin-bottom: 8px; }
  h1.head { font-size: 30px; font-weight: 700; margin: 0 0 8px; line-height: 1.2; }
  p.stand { font-style: italic; font-size: 16px; color: #4b5563; margin: 0 0 24px; border-left: 3px solid #C8497A; padding-left: 12px; }
  .section-label { font-family: Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: #C8497A; margin: 28px 0 12px; }
  .body p { margin: 0 0 12px; }
  .body h2 { font-size: 16px; font-weight: 700; color: #16213e; margin: 20px 0 8px; letter-spacing: normal; text-transform: none; }
  .body h3 { font-size: 14px; font-weight: 700; color: #374151; margin: 16px 0 6px; letter-spacing: normal; text-transform: none; }
  ul { padding-left: 20px; font-size: 13px; }
  ul li { margin-bottom: 6px; }
  .flag { color: #B45309; }
  .footer { font-family: Arial, sans-serif; font-size: 10px; color: #9ca3af; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style></head><body>
  <div class="meta">Content Notes · ${dateStr}</div>
  <h1 class="head">${escapeHtml(articleHeadline) || "(no headline)"}</h1>
  <p class="stand">${escapeHtml(standfirst) || "(no standfirst summary)"}</p>
  <div class="section-label">Article</div>
  <div class="body">${textToHtmlParagraphs(transcript) || "<p style='color:#6b7280'>(no article copy)</p>"}</div>
  <div class="section-label">Change log</div>
  <ul>
    ${structureItems.map((c) => `<li><strong>Structure / phrasing:</strong> ${escapeHtml(c.text)}</li>`).join("")}
    ${embedItems.map((c) => `<li><strong>Message embedded:</strong> ${escapeHtml(c.text)}</li>`).join("")}
    ${flagItems.map((c) => `<li class="flag"><strong>Flag:</strong> ${escapeHtml(c.text)}</li>`).join("")}
    ${changeLog.length === 0 ? "<li>(No optimisation has been run yet - run Optimise first to populate this log.)</li>" : ""}
  </ul>
  <div class="footer">${projectName ? `Project: ${escapeHtml(projectName)} · ` : ""}Content type: ${escapeHtml(contentType)}${spokesperson ? ` · Spokesperson: ${escapeHtml(spokesperson)}` : ""}${pubDate ? ` · Publication: ${escapeHtml(pubDate)}` : ""}<br/>Generated by AIO Fusion</div>
</body></html>`;
    const safeName = `Content Notes - ${(articleHeadline || projectName || "content-notes").replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`;
    if (format === "word") {
      const blob = new Blob([html], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.doc`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch { /* noop */ } }, 300);
      } else {
        alert("Pop-up blocked - allow pop-ups for this site to export the PDF.");
      }
    }
    setShowDownloadNotesModal(false);
  };

  const optimisedColor = "#DC2626";
  const headlineColor = isOpt("headline") ? optimisedColor : vars.navy;
  const standfirstColor = isOpt("standfirst") ? optimisedColor : vars.g600;
  const bodyColor = isOpt("transcript") ? optimisedColor : undefined;
  const pitchColor = isOpt("pitch") ? optimisedColor : undefined;
  const actionNotesColor = isOpt("actionNotes") ? optimisedColor : undefined;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <PenLine size={24} color="#ffffff" />
            <h1 className="text-3xl sm:text-4xl tracking-tight" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Content Creator</h1>
          </div>
          <p className="text-[15px] font-light leading-relaxed max-w-4xl" style={{ color: "rgba(255,255,255,0.85)" }}>
            Turn raw notes and transcripts into polished pitches, articles and case studies that are written to be AI friendly from the start. Content built this way is ready to earn citations the moment it goes live, rather than needing fixing later. Your signed-off Project Data is used as the authority brief.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-6 sm:p-8 space-y-5" style={{ borderColor: vars.g200 }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Labelled label="Project name" hint="A working title for this content item - appears on the Comms Planner, Archive card and Earned Media Tracker.">
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Q2 thought leadership programme" className="w-full px-3 py-2.5 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
          </Labelled>
          <Labelled label="Content type" hint="Press release, article, case study, blog, social post.">
            <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Labelled>
        </div>

        <Labelled label="Target LLM Query" hint="Pick a query from section 1.6 to write a GEO-targeted article. The AI will structure the piece to earn a citation when someone asks this exact question. You can leave this blank for a free-form draft.">
          {allLlmQueries.length > 0 ? (
            <select
              value={targetQuery?.text || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) { setTargetQuery(null); return; }
                const found = allLlmQueries.find((q) => q.text === val);
                if (found) setTargetQuery(found);
              }}
              className="w-full px-3 py-2.5 rounded-lg border text-[13px] bg-white"
              style={{ borderColor: vars.g200 }}
            >
              <option value="">- No target query (free-form draft) -</option>
              {llmQueries.discovery.length > 0 && (
                <optgroup label="Discovery">
                  {llmQueries.discovery.map((q) => <option key={q} value={q}>{q}</option>)}
                </optgroup>
              )}
              {llmQueries.shortlist.length > 0 && (
                <optgroup label="Shortlist">
                  {llmQueries.shortlist.map((q) => <option key={q} value={q}>{q}</option>)}
                </optgroup>
              )}
              {llmQueries.comparison.length > 0 && (
                <optgroup label="Comparison &amp; Trust">
                  {llmQueries.comparison.map((q) => <option key={q} value={q}>{q}</option>)}
                </optgroup>
              )}
            </select>
          ) : (
            <div className="rounded-lg border px-3 py-2.5 text-[13px]" style={{ borderColor: vars.g200, background: vars.g50, color: vars.g500 }}>
              No queries generated yet -{" "}
              <button
                type="button"
                className="underline font-semibold"
                style={{ color: vars.accent }}
                onClick={() => onNavigate("intake")}
              >
                generate them in section 1.6
              </button>{" "}
              of Project Set-Up first.
            </div>
          )}
          {targetQuery && (
            <p className="mt-1.5 text-[12px] font-light" style={{ color: vars.g500 }}>
              <span className="font-semibold" style={{ color: vars.accent }}>GEO goal:</span>{" "}
              This article aims to get{" "}
              <strong style={{ color: vars.navy }}>{confirmedEntity?.name || projectName || "your company"}</strong>{" "}
              cited when someone asks:{" "}
              <em>"{targetQuery.text}"</em>
            </p>
          )}
        </Labelled>

        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(200,73,122,0.35)", background: "rgba(200,73,122,0.05)" }}>
          <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: vars.navy }}>
            <Sparkles size={14} color="#C8497A" /> Create a first draft with AI
          </p>
          <p className="text-[12px] font-light mt-1" style={{ color: vars.g500 }}>
            Fill in the fields below, then click <strong>Create Draft</strong> in the Content Actions bar at the bottom of the page. Writes a full {contentType.toLowerCase()} from your headline, brief and signed-off Project Data using {createPromptLabel}. You can then refine any field, or discard it.
          </p>
          {generated && draftSnapshot && (
            <div className="mt-3">
              <button
                onClick={discardDraft}
                disabled={generating}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold border bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: vars.g200, color: "#C94A3E" }}
                title="Discard the AI draft and restore what you had before"
              >
                <Undo2 size={14} /> Discard draft
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap -mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: vars.g500 }}>Content entry</p>
            <span className="text-[11px] font-light" style={{ color: vars.g400 }}>Use Optimise this copy on any field to weave in your key messages.</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="editor-font-size" className="text-[11px] font-medium" style={{ color: vars.g500 }}>Font size</label>
            <select
              id="editor-font-size"
              value={editorFontSize}
              onChange={(e) => setEditorFontSize(Number(e.target.value))}
              className="text-[12px] px-2 py-1 rounded-md border bg-white"
              style={{ borderColor: vars.g200, color: vars.navy }}
              title="Adjust the font size of the headline and transcript fields"
            >
              <option value={11}>Small (11px)</option>
              <option value={13}>Default (13px)</option>
              <option value={15}>Medium (15px)</option>
              <option value={17}>Large (17px)</option>
              <option value={19}>X-Large (19px)</option>
            </select>
          </div>
        </div>

        <Labelled label="Headline" hint={`The article headline as it will appear in print - short, bold and punchy. (${articleHeadlineWords} / 20 words)`} action={optimisePill("headline")}>
          <input
            value={articleHeadline}
            onChange={(e) => setArticleHeadline(e.target.value)}
            placeholder="e.g. AI Authority is the New PR Battleground"
            className="w-full px-3 py-3 rounded-lg border font-bold"
            style={{ borderColor: articleHeadlineOver ? vars.red : (isOpt("headline") ? optimisedColor : vars.g200), fontSize: `${Math.round(editorFontSize * 1.45)}px`, color: headlineColor, lineHeight: 1.25, fontFamily: "'Alice', Georgia, serif" }}
          />
          {articleHeadlineOver && <p className="text-[11px] mt-1" style={{ color: vars.red }}>Over the 20-word limit by {articleHeadlineWords - 20} words.</p>}
        </Labelled>

        <Labelled label="Standfirst summary" hint={`The short summary that sits under the headline and previews the article. (${standfirstWords} / 50 words)`} action={optimisePill("standfirst")}>
          <textarea
            value={standfirst}
            onChange={(e) => setStandfirst(e.target.value)}
            rows={2}
            placeholder="A one-or-two sentence preview that hooks the reader into the article…"
            className="w-full px-3 py-2.5 rounded-lg border italic"
            style={{ borderColor: standfirstOver ? vars.red : (isOpt("standfirst") ? optimisedColor : vars.g200), fontSize: `${Math.round(editorFontSize * 1.1)}px`, color: standfirstColor, lineHeight: 1.45 }}
          />
          {standfirstOver && <p className="text-[11px] mt-1" style={{ color: vars.red }}>Over the 50-word limit by {standfirstWords - 50} words.</p>}
        </Labelled>

        <Labelled label="Pitch idea / news hook" hint={`Up to 300 words for the angle, news hook and supporting reasoning. (${headlineWords} / 300)`} action={optimisePill("pitch")}>
          <textarea value={headline} onChange={(e) => setHeadline(e.target.value)} rows={3} placeholder="Pitch the idea, angle and the news hook…" className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: headlineOver ? vars.red : (isOpt("pitch") ? optimisedColor : vars.g200), fontSize: `${editorFontSize}px`, lineHeight: 1.5, color: pitchColor }} />
          {headlineOver && <p className="text-[11px] mt-1" style={{ color: vars.red }}>Over the 300-word limit by {headlineWords - 300} words.</p>}
        </Labelled>

        <Labelled label="Transcript or notes" hint={`Up to 8,000 words - paste full transcripts, interviews or raw notes here. (${transcriptWords} / 8,000)`} action={optimisePill("transcript")}>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8} placeholder="Paste the interview transcript, podcast notes, customer call extracts or other raw material…" className="w-full px-3 py-2.5 rounded-lg border leading-relaxed" style={{ borderColor: transcriptOver ? vars.red : (isOpt("transcript") ? optimisedColor : vars.g200), fontSize: `${editorFontSize}px`, lineHeight: 1.6, color: bodyColor }} />
          {transcriptOver && <p className="text-[11px] mt-1" style={{ color: vars.red }}>Over the 8,000-word limit by {transcriptWords - 8000} words.</p>}
        </Labelled>

        <Labelled label="Action Notes" hint="Up to 150 words of internal notes - pushed through to the Notes column on the Comms Planner." action={optimisePill("actionNotes")}>
          <textarea
            value={actionNotes}
            onChange={(e) => {
              const next = e.target.value;
              const words = next.trim() === "" ? 0 : next.trim().split(/\s+/).length;
              if (words <= 150) setActionNotes(next);
              else setActionNotes(next.trim().split(/\s+/).slice(0, 150).join(" "));
            }}
            rows={4}
            placeholder="e.g. Pair with launch event the week of; spokesperson availability tight; coordinate with Spencer on quote sign-off."
            className="w-full px-3 py-2.5 rounded-lg border"
            style={{ borderColor: isOpt("actionNotes") ? optimisedColor : vars.g200, fontSize: `${editorFontSize}px`, lineHeight: 1.55, color: actionNotesColor }}
          />
          <p className="text-[10px] font-light mt-1" style={{ color: countWords(actionNotes) > 140 ? vars.red : vars.g400 }}>
            {countWords(actionNotes)} / 150 words · Also shown on the Comms Planner
          </p>
        </Labelled>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Labelled label="Spokesperson" hint="Pulled from the Project Data spokesperson list (1.8).">
            <select value={spokesperson} onChange={(e) => onPickSpokesperson(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
              <option value="">- Select spokesperson -</option>
              <option value="NA">NA</option>
              {spokesList.map((s) => <option key={s.name} value={s.name}>{s.name}{s.title ? ` · ${s.title}` : ""}</option>)}
            </select>
          </Labelled>
          <Labelled label="Spokesperson LinkedIn" hint="Pre-fills from the spokesperson record; can be overridden.">
            <input value={spokesLi} onChange={(e) => setSpokesLi(e.target.value)} placeholder="https://www.linkedin.com/in/..." className="w-full px-3 py-2.5 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
          </Labelled>
        </div>

        <Labelled label="Select Media Targets" hint="Multi-select drawn from the Trade Media Categories list (1.9).">
          <div className="rounded-lg border p-3 mb-2" style={{ borderColor: vars.g200, background: vars.g50 }}>
            {mediaTarget.length === 0 ? (
              <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No targets selected - pick from the project categories or the full alphabetical list.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {mediaTarget.map((cat) => (
                  <span key={cat} className="text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "rgba(224,120,86,0.12)", color: vars.coral }}>
                    {cat}
                    <button onClick={() => setMediaTarget(mediaTarget.filter((c) => c !== cat))}><XCircle size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowCatPicker(true)} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.accent }}>+ Choose categories</button>
            {projectCategories.length > 0 && (
              <button
                onClick={() => setMediaTarget(Array.from(new Set([...mediaTarget, ...projectCategories])))}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}
                title={`Add the ${projectCategories.length} categories selected in Project Set-Up 1.9`}
              >
                Use Project Set-Up categories ({projectCategories.length})
              </button>
            )}
          </div>
        </Labelled>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Labelled label="Content Status" hint="Draft / Review / Final.">
            <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as "Draft" | "Review" | "Final")} className="w-full px-3 py-2.5 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }}>
              <option value="Draft">Draft</option>
              <option value="Review">Review</option>
              <option value="Final">Final</option>
            </select>
          </Labelled>
          <Labelled label="Publication date" hint="Sends an entry to the Comms Planner calendar on save.">
            <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border text-[13px] bg-white" style={{ borderColor: vars.g200 }} />
          </Labelled>
        </div>

      </div>

      {generating && (
        <div className="mt-4">
          <GenerationProgress
            stages={[
              "Reading your Project Data and brief",
              `Drafting the ${contentType.toLowerCase()}`,
              "Weaving in your key messages",
              "Structuring for AI citability",
              "Polishing the draft",
            ]}
            chars={generateChars}
            accent={vars.coral}
          />
        </div>
      )}

      {optimisingField && (
        <div className="mt-4">
          <GenerationProgress
            stages={[
              `Reading your ${CREATOR_FIELD_LABELS[optimisingField] || "copy"}`,
              "Rewriting for AI citability",
              "Weaving in your key messages",
              "Polishing the result",
            ]}
            chars={creatorChars}
            accent={vars.coral}
            compact
          />
        </div>
      )}

      {creatorError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border p-3 text-[12px]" style={{ borderColor: "rgba(176,61,51,0.4)", background: "rgba(176,61,51,0.06)", color: "#B03D33" }}>
          <X size={14} className="mt-0.5 flex-shrink-0" /> <span>{creatorError}</span>
        </div>
      )}

      {/* Content Actions - mirrors the Content Optimiser & Editor action buttons */}
      <div className="mt-8 bg-white rounded-2xl border p-4 sm:p-5" style={{ borderColor: vars.g200 }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: vars.coral }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: vars.g500 }}>Content Actions</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={createDraft}
            disabled={generating || optimisingField !== null}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold text-white hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: vars.teal }}
            title="Write a full draft from your headline, the brief and your Project Data"
          >
            {generating ? <><Loader2 size={14} className="animate-spin" /> Writing draft…</> : generated ? <><Sparkles size={14} /> Regenerate</> : <><Sparkles size={14} /> Create Draft</>}
          </button>
          <button
            onClick={downloadDoc}
            disabled={!hasAnyContent}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-bold border bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: vars.navy, color: vars.navy }}
            title="Download the current draft as a Word document"
          >
            <Download size={14} /> Download
          </button>
          <button
            onClick={() => setShowDownloadNotesModal(true)}
            disabled={changeLog.length === 0}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold border bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: vars.g200, color: vars.navy }}
            title={changeLog.length === 0 ? "Run Optimise first to generate notes" : "Download the optimised piece with a change log explaining where each key message was embedded - as Word or PDF"}
          >
            <FileText size={14} /> Download Notes
          </button>
          <button
            onClick={shareDraftFromCreator}
            disabled={!hasAnyContent}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold border bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: vars.g200, color: vars.navy }}
            title="Open your email client with the current draft ready to send for review"
          >
            <Send size={14} /> Share draft
          </button>
          <button
            onClick={acceptAndArchive}
            disabled={!hasAnyContent}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold text-white hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: vars.gold }}
            title="Sign off this piece and save it to the Archive"
          >
            <Archive size={14} /> Archive
          </button>
          <button
            onClick={sendToMediaResearchFromCreator}
            disabled={!hasAnyContent}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold border bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: vars.navy, color: vars.navy }}
            title="Save the draft and jump to Media Research to find target publications and journalists"
          >
            <Target size={14} /> Media Research
          </button>
          <button
            onClick={pushToCommsPlanner}
            disabled={!hasAnyContent}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold ml-auto text-white hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: vars.accent }}
            title={pubDate ? `Push this piece to the Comms Planner for w/c ${pubDate}` : "Push this piece to the Comms Planner (uses current week if no publication date set)"}
          >
            <Calendar size={14} /> Push to Comms Planner
          </button>
        </div>
      </div>

      {/* Change Log - shown after Optimise has been run */}
      {changeLog.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl border p-4 sm:p-5" style={{ borderColor: "rgba(200,73,122,0.3)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} color="#C8497A" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C8497A" }}>Optimisation change log</span>
          </div>
          <ul className="space-y-1.5 text-[13px] font-light" style={{ color: vars.g600, lineHeight: 1.55 }}>
            {changeLog.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full" style={{ background: c.kind === "flag" ? "#B45309" : c.kind === "structure" ? vars.teal : "#C8497A" }} />
                <span style={{ color: c.kind === "flag" ? "#B45309" : undefined }}>
                  <strong className="font-semibold" style={{ color: c.kind === "flag" ? "#B45309" : vars.navy }}>
                    {c.kind === "embed" ? "Message embedded - " : c.kind === "structure" ? "Structure / phrasing - " : "⚠ Flagged - "}
                  </strong>
                  {c.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {supportingData.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl border p-4 sm:p-5" style={{ borderColor: vars.g200 }}>
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} color={vars.accent} />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: vars.accent }}>Suggested supporting data</span>
          </div>
          <p className="text-[11px] font-light mb-3" style={{ color: vars.g500 }}>Third-party data you could add to strengthen the piece. Verify each source before publishing.</p>
          <ul className="space-y-2 text-[13px] font-light" style={{ color: vars.g600, lineHeight: 1.5 }}>
            {supportingData.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full" style={{ background: vars.accent }} />
                <span>
                  {d.text}
                  {d.url ? <> - <a href={d.url} target="_blank" rel="noreferrer" className="underline break-all" style={{ color: vars.accent }}>{d.url}</a></> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Download Content Notes - format chooser */}
      {showDownloadNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowDownloadNotesModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
              <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                <FileText size={16} color="#C8497A" /> Download content notes
              </h2>
              <button onClick={() => setShowDownloadNotesModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
            </div>
            <div className="p-6">
              <p className="text-[13px] font-light mb-4" style={{ color: vars.g600 }}>
                The document includes the <strong>headline</strong>, <strong>standfirst</strong> and <strong>body copy</strong>, followed by a bullet-pointed <strong>change log</strong> of every key message embedded, structural change made, and any message that could not be embedded naturally.
              </p>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: vars.g500 }}>Choose a format</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => downloadOptimisationNotes("word")} className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border text-[13px] font-semibold transition-colors hover:bg-gray-50" style={{ borderColor: vars.g200, color: vars.navy }}>
                  <FileText size={22} color={vars.accent} />
                  <span>Word (.doc)</span>
                </button>
                <button onClick={() => downloadOptimisationNotes("pdf")} className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border text-[13px] font-semibold transition-colors hover:bg-gray-50" style={{ borderColor: vars.g200, color: vars.navy }}>
                  <FileText size={22} color="#C8497A" />
                  <span>PDF</span>
                </button>
              </div>
              <p className="text-[10px] font-light mt-3 italic" style={{ color: vars.g400 }}>
                PDF opens a print dialog - choose "Save as PDF" as the destination.
              </p>
            </div>
          </div>
        </div>
      )}

      {showCatPicker && (
        <CategoryPickerModal
          all={TRADE_MEDIA_CATEGORIES}
          selected={mediaTarget}
          projectSet={projectCategories}
          onClose={() => setShowCatPicker(false)}
          onSave={(next) => { setMediaTarget(next); setShowCatPicker(false); }}
        />
      )}

    </div>
  );
}

export { ContentCreatorPage, CREATOR_FIELD_LABELS };
export type { CreatorFieldKey };

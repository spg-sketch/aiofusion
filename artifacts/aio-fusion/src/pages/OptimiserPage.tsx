import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, Code2, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2, Wand2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { TRADE_MEDIA_CATEGORIES } from "../tradeMediaCategories";
import { streamContent, buildProjectDataText, CONTENT_AI_TIMEOUT_MS, escapeHtml, safeHttpUrl, GenerationProgress, textToHtmlParagraphs, downloadWordDocument } from "../lib/contentAi";
import { loadArchive, saveArchive, useContentStore, splitArchiveBody, type ArchiveItem, loadPlannerProjects, savePlannerProjects, getISOWeek, weekDateLabel, type PlannerProject } from "../lib/contentStore";
import { getKeyMessages, loadIntakeData, getActiveProjectId, getProjectMediaCategories, getProjectDataMessages, getSpokespeople } from "../IntakeForm";
import { CategoryPickerModal, CONTENT_TYPES, Labelled, countWords } from "./shared";
import InfoTip from "../InfoTip";
import CountdownBanner from "../components/CountdownBanner";
function OptimiserPage({
  onNavigate,
}: {
  onNavigate: (p: string) => void;
}) {
  const intake = loadIntakeData();
  const keyMessages = getKeyMessages();
  const projectDataMessages = getProjectDataMessages();
  const spokesList = getSpokespeople();
  const projectCategories = getProjectMediaCategories();

  const [projectTitle, setProjectTitle] = useState("");
  const [contentType, setContentType] = useState("Press release");
  const [spokesperson, setSpokesperson] = useState<string>(spokesList[0]?.name || "NA");
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [mediaCats, setMediaCats] = useState<string[]>([]);
  const [contentStatus, setContentStatus] = useState<"Draft" | "Review" | "Final">("Draft");
  const [pubDate, setPubDate] = useState("");
  const [llmTarget, setLlmTarget] = useState("General (All LLMs)");
  const [articleHeadline, setArticleHeadline] = useState("");
  const [standfirst, setStandfirst] = useState("");
  const [bodyCopy, setBodyCopy] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [editorFontSize, setEditorFontSize] = useState<number>(13);
  const [optimised, setOptimised] = useState(false);
  const [optimiseSnapshot, setOptimiseSnapshot] = useState<{ articleHeadline: string; standfirst: string; bodyCopy: string } | null>(null);
  const [changeLog, setChangeLog] = useState<{ kind: "embed" | "structure" | "flag"; text: string }[]>([]);
  const [optimising, setOptimising] = useState(false);
  const [optimiseError, setOptimiseError] = useState("");
  const [optimiseChars, setOptimiseChars] = useState(0);
  const [showRetrieve, setShowRetrieve] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showMsgPicker, setShowMsgPicker] = useState(false);
  const [showLLMBrief, setShowLLMBrief] = useState(false);
  const [showOptimiseBriefModal, setShowOptimiseBriefModal] = useState(false);
  const [showDownloadNotesModal, setShowDownloadNotesModal] = useState(false);
  const [retrieveQuery, setRetrieveQuery] = useState("");

  const PROMPT_1_TYPES = ["Press release", "Case study", "Speaker submission", "Award submission", "Event copy", "Directory entry"];
  const PITCH_TYPES = ["Article Media Pitch"];
  const promptVariant: "prompt1" | "prompt2" | "pitch" =
    PITCH_TYPES.includes(contentType) ? "pitch"
    : PROMPT_1_TYPES.includes(contentType) ? "prompt1"
    : "prompt2";

  // Optimiser message picker only offers key messages from Project Set-Up 1.2 and 1.3.
  const keyMessagePicks = projectDataMessages.filter((m) => m.fieldId === "1.2" || m.fieldId === "1.3");

  const contentVersion = useContentStore();
  const RESEARCH_TYPES = ["Press release", "Article", "Case study", "Whitepaper", "Blog post"];
  const archiveAll = useMemo(() => loadArchive(), [showRetrieve, contentVersion]);
  const filteredArchive = archiveAll.filter((a) => !retrieveQuery || (a.title + " " + (a.body || "")).toLowerCase().includes(retrieveQuery.toLowerCase()));

  // Preload from planner / archive
  useEffect(() => {
    let archiveId = "";
    try { archiveId = localStorage.getItem("aio.optimiser.preload") || ""; } catch { /* noop */ }
    if (!archiveId) return;
    try { localStorage.removeItem("aio.optimiser.preload"); } catch { /* noop */ }
    const planner = loadPlannerProjects().find((p) => p.id === archiveId);
    if (planner) {
      setProjectTitle(planner.title);
      setContentType(planner.contentType);
      if (planner.spokesperson) setSpokesperson(planner.spokesperson);
      if (planner.releaseDate) setPubDate(planner.releaseDate);
      return;
    }
    const arc = loadArchive().find((a) => a.id === archiveId);
    if (arc) {
      setProjectTitle(arc.title);
      setContentType(arc.contentType);
      if (arc.spokesperson) setSpokesperson(arc.spokesperson);
      const parts = splitArchiveBody(arc);
      setArticleHeadline(parts.headline);
      setStandfirst(parts.standfirst);
      setBodyCopy(parts.bodyCopy);
      if (Array.isArray(arc.selectedMessages)) setSelectedMessages(arc.selectedMessages);
      if (Array.isArray(arc.mediaCats)) setMediaCats(arc.mediaCats);
      if (typeof arc.pubDate === "string") setPubDate(arc.pubDate);
    }
  }, []);

  const handleRetrieve = (a: ArchiveItem) => {
    setProjectTitle(a.title);
    setContentType(a.contentType);
    if (a.spokesperson) setSpokesperson(a.spokesperson);
    const parts = splitArchiveBody(a);
    setArticleHeadline(parts.headline);
    setStandfirst(parts.standfirst);
    setBodyCopy(parts.bodyCopy);
    if (Array.isArray(a.selectedMessages)) setSelectedMessages(a.selectedMessages);
    if (Array.isArray(a.mediaCats)) setMediaCats(a.mediaCats);
    setPubDate(typeof a.pubDate === "string" ? a.pubDate : "");
    setShowRetrieve(false);
  };

  const archiveItem = (status: "Draft" | "Final") => {
    const items = loadArchive();
    const item: ArchiveItem = {
      id: `arch-${Date.now()}`,
      title: projectTitle || "Untitled project",
      contentType,
      spokesperson: spokesperson === "NA" ? "" : spokesperson,
      status,
      tags: [contentType.toLowerCase().replace(/\s+/g, "-"), ...mediaCats.slice(0, 3).map((c) => c.toLowerCase().replace(/\s+/g, "-"))],
      body: [articleHeadline, standfirst, bodyCopy].filter(Boolean).join("\n\n") || "Optimised content body. (Demo)",
      headline: articleHeadline,
      standfirst: standfirst,
      bodyCopy: bodyCopy,
      selectedMessages,
      mediaCats,
      pubDate,
      createdAt: new Date().toISOString(),
      source: "optimiser",
    };
    saveArchive([item, ...items]);
    alert(`Saved "${item.title}" to Archive as ${status}.`);
  };
  const pushToPlanner = () => {
    if (!projectTitle.trim()) {
      alert("Add a Content Title before placing it on the Comms Planner.");
      return;
    }
    const projects = loadPlannerProjects();
    const dateWeek = pubDate ? getISOWeek(new Date(pubDate)) : getISOWeek(new Date());
    const proj: PlannerProject = {
      id: `proj-${Date.now()}`,
      title: projectTitle,
      contentType,
      spokesperson: spokesperson === "NA" ? "" : spokesperson,
      keyMessage: selectedMessages[0] || "",
      audience: mediaCats[0] || "",
      channels: mediaCats.slice(0, 4),
      week: dateWeek,
      status: contentStatus === "Final" ? "Approved" : contentStatus === "Review" ? "Review" : "Drafting",
      releaseDate: pubDate,
      notes: actionNotes.trim() || "Sent from Content Optimiser.",
    };
    savePlannerProjects([proj, ...projects]);
    alert(`"${proj.title}" added to the Comms Planner (w/c ${weekDateLabel(proj.week)}).`);
    onNavigate("planner");
  };
  const shareDraft = () => {
    const subject = encodeURIComponent(`Draft for review: ${projectTitle || "Untitled"}`);
    const body = encodeURIComponent(`Draft of "${projectTitle}" (${contentType}) for review.\n\nKey messages:\n- ${selectedMessages.join("\n- ") || "-"}\n\n- sent via AIO Fusion`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };
  const downloadDraft = () => {
    const accent = "#C8497A";
    const meta = [contentType, spokesperson && spokesperson !== "NA" ? spokesperson : "", contentStatus]
      .filter(Boolean)
      .join("  •  ");
    const msgList = selectedMessages.length
      ? `<ul style="margin:0 0 14pt 0; padding-left:18pt;">${selectedMessages.map((m) => `<li style="margin:0 0 4pt 0;">${escapeHtml(m)}</li>`).join("")}</ul>`
      : `<p style="margin:0 0 14pt 0; color:#6b7280;">None selected.</p>`;
    const catList = mediaCats.length
      ? `<p style="margin:0 0 14pt 0;">${mediaCats.map((c) => escapeHtml(c)).join(", ")}</p>`
      : `<p style="margin:0 0 14pt 0; color:#6b7280;">None selected.</p>`;
    // Strip the "Optimisation pass:" summary paragraph - useful on screen
    // but not needed in the downloaded document.
    const bodyCopyForDownload = bodyCopy
      .replace(/\n*Optimisation pass:[\s\S]*/i, "")
      .trimEnd();
    const bodyWordCount = countWords(bodyCopyForDownload);
    const html =
      `<h1 style="font-family:Georgia,serif; font-size:22pt; color:#16213e; margin:0 0 6pt 0;">${escapeHtml(articleHeadline || projectTitle || "Untitled draft")}</h1>` +
      (standfirst ? `<p style="font-size:13pt; font-style:italic; color:#374151; margin:0 0 14pt 0;">${escapeHtml(standfirst)}</p>` : "") +
      `<p style="font-size:9pt; text-transform:uppercase; letter-spacing:1px; color:${accent}; margin:0 0 4pt 0;">${escapeHtml(meta)}</p>` +
      `<p style="font-size:10pt; color:#6b7280; margin:0 0 18pt 0;">Project: ${escapeHtml(projectTitle || "-")}  &bull;  Publication: ${escapeHtml(pubDate || "TBC")}  &bull;  ${bodyWordCount.toLocaleString()} words</p>` +
      `<hr style="border:none; border-top:1px solid #e5e7eb; margin:0 0 16pt 0;"/>` +
      `<h2 style="font-size:13pt; color:#16213e; margin:0 0 6pt 0;">Body copy</h2>` +
      (textToHtmlParagraphs(bodyCopyForDownload) || `<p style="margin:0 0 14pt 0; color:#6b7280;">(no body content)</p>`) +
      `<hr style="border:none; border-top:1px solid #e5e7eb; margin:16pt 0;"/>` +
      `<h2 style="font-size:13pt; color:#16213e; margin:0 0 6pt 0;">Key messages</h2>${msgList}` +
      `<h2 style="font-size:13pt; color:#16213e; margin:0 0 6pt 0;">Media categories</h2>${catList}`;
    downloadWordDocument(`${(articleHeadline || projectTitle || "draft").replace(/[^a-z0-9]/gi, "_")}.doc`, html);
  };

  const downloadOptimisedNotes = (format: "word" | "pdf") => {
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const embedItems = changeLog.filter((c) => c.kind === "embed");
    const structureItems = changeLog.filter((c) => c.kind === "structure");
    const flagItems = changeLog.filter((c) => c.kind === "flag");
    const bodyCopyForDownload = bodyCopy.replace(/\n*Optimisation pass:[\s\S]*/i, "").trimEnd();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Optimised Notes - ${escapeHtml(articleHeadline || projectTitle || "Draft")}</title>
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
  <div class="meta">Optimised Notes · ${dateStr}</div>
  <h1 class="head">${escapeHtml(articleHeadline) || "(no headline)"}</h1>
  <p class="stand">${escapeHtml(standfirst) || "(no standfirst)"}</p>
  <div class="section-label">Article</div>
  <div class="body">${textToHtmlParagraphs(bodyCopyForDownload) || "<p style='color:#6b7280'>(no article copy)</p>"}</div>
  <div class="section-label">Change log</div>
  <ul>
    ${structureItems.map((c) => `<li><strong>Structure / phrasing:</strong> ${escapeHtml(c.text)}</li>`).join("")}
    ${embedItems.map((c) => `<li><strong>Message embedded:</strong> ${escapeHtml(c.text)}</li>`).join("")}
    ${flagItems.map((c) => `<li class="flag"><strong>Flag:</strong> ${escapeHtml(c.text)}</li>`).join("")}
    ${changeLog.length === 0 ? "<li>(No optimisation has been run yet - run Optimise first to populate this log.)</li>" : ""}
  </ul>
  <div class="footer">${projectTitle ? `Project: ${escapeHtml(projectTitle)} · ` : ""}Content type: ${escapeHtml(contentType)}${spokesperson && spokesperson !== "NA" ? ` · Spokesperson: ${escapeHtml(spokesperson)}` : ""}${pubDate ? ` · Publication: ${escapeHtml(pubDate)}` : ""}<br/>Generated by AIO Fusion</div>
</body></html>`;
    const safeName = `Optimised Notes - ${(articleHeadline || projectTitle || "draft").replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`;
    if (format === "word") {
      const blob = new Blob([html], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.doc`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.print(); }
    }
    setShowDownloadNotesModal(false);
  };

  const sendToMediaResearch = () => {
    const id = `temp-${Date.now()}`;
    const items = loadArchive();
    saveArchive([{
      id,
      title: projectTitle || "Untitled draft",
      contentType,
      spokesperson: spokesperson === "NA" ? "" : spokesperson,
      status: "Draft",
      tags: [contentType.toLowerCase().replace(/\s+/g, "-")],
      body: [articleHeadline, standfirst, bodyCopy].filter(Boolean).join("\n\n"),
      headline: articleHeadline,
      standfirst: standfirst,
      bodyCopy: bodyCopy,
      createdAt: new Date().toISOString(),
    }, ...items]);
    try { localStorage.setItem("aio.research.preload", id); } catch { /* noop */ }
    onNavigate("media-research");
  };
  const canResearch = RESEARCH_TYPES.includes(contentType);
  const intakeReady = !!intake;
  const semanticPhrases: { phrase: string; relevance: number }[] = [];
  const trackedChanges: { type: "addition" | "modification"; label: string; original: string; revised: string; annotation: string }[] = [];

  const hasAnyContent = articleHeadline.trim().length > 0 || standfirst.trim().length > 0 || bodyCopy.trim().length > 0;

  const runOptimise = async () => {
    if (!hasAnyContent) {
      alert("Add some content first - at least a headline, standfirst or body copy.");
      return;
    }
    setOptimiseError("");
    setOptimiseChars(0);
    setOptimising(true);
    setShowOptimiseBriefModal(false);
    const snapshot = { articleHeadline, standfirst, bodyCopy };
    try {
      const data = await streamContent(
        "/api/content/optimise",
        {
          contentType,
          spokesperson: spokesperson === "NA" ? "" : spokesperson,
          llmTarget,
          projectTitle,
          selectedMessages,
          mediaCategories: mediaCats,
          headline: articleHeadline,
          standfirst,
          bodyCopy,
          promptBrief: promptBriefShort,
          projectData: buildProjectDataText(),
        },
        setOptimiseChars,
      );
      setOptimiseSnapshot(snapshot);
      if (typeof data.headline === "string") setArticleHeadline(data.headline);
      if (typeof data.standfirst === "string") setStandfirst(data.standfirst);
      if (typeof data.bodyCopy === "string") setBodyCopy(data.bodyCopy);
      setChangeLog(Array.isArray(data.changeLog) ? data.changeLog : []);
      setOptimised(true);
    } catch (err) {
      setOptimiseError(err instanceof Error ? err.message : "The optimisation could not be generated right now. Please try again.");
    } finally {
      setOptimising(false);
    }
  };

  const rejectOptimised = () => {
    if (!optimiseSnapshot) return;
    if (!window.confirm("Discard the optimised version and restore the copy you originally entered?")) return;
    setArticleHeadline(optimiseSnapshot.articleHeadline);
    setStandfirst(optimiseSnapshot.standfirst);
    setBodyCopy(optimiseSnapshot.bodyCopy);
    setOptimiseSnapshot(null);
    setChangeLog([]);
    setOptimised(false);
  };

  const promptHeadline = promptVariant === "pitch"
    ? `LLM Optimisation Prompt 2.2 - Article Media Pitch`
    : promptVariant === "prompt1"
    ? `LLM Optimisation Prompt 1.1 - Press release, Case study, Speaker submission, Award submission, Event copy, Directory entry`
    : `LLM Optimisation Prompt 2.1 - Article, Whitepaper, Blog post, Social post`;

  const PROMPT_1_LENGTHS: Record<string, string> = {
    "Press release": "900 words. Create a headline, Standfirst, start first paragraph with City, Country, Date: Source Company and descriptor and key or priority news aspect. Structure newsworthy facts in order of significance through subsequent paragraphs with spokesperson quote towards the end of the press release. Use other best practices for press releases. End with Project Data boilerplate.",
    "Case study": "800 words. Comply with specific guidance or reference links for exact format. Use Challenge, solution, results structure or use other best practices for business case studies in company's industry/sector referencing Project Data.",
    "Speaker submission": "700 words. Comply with specific guidance or reference links for exact format and length of copy. Reference Project Data and spokesperson and LinkedIn entries.",
    "Award submission": "700 words. Comply with specific guidance or reference links for exact format and length of copy. Or use other best practices for business case studies in company's industry/sector referencing Project Data.",
    "Event copy": "600 words. Comply with specific guidance or reference links for exact format and length of copy. Or use other best practices for business case studies in company's industry/sector referencing Project Data.",
    "Directory entry": "500 words. Comply with specific guidance or reference links for exact format and length of copy. Or use other best practices for business case studies in company's industry/sector referencing Project Data.",
  };
  const PROMPT_2_LENGTHS: Record<string, string> = {
    "Article": "900 words",
    "Whitepaper": "2000 words",
    "Blog post": "700 words",
    "Social post": "600 words",
  };

  const promptBriefShort = promptVariant === "pitch"
    ? `Using the accepted information and instructions in Project Data Sections 1-3 for this project, develop a draft Media pitch synopsis for a thought leadership article.

Use the Headline / subject entry as the guiding theme and argument. Optimise the article media pitch to maximise its authority, discoverability, and accurate representation by large language models such as ChatGPT, Perplexity, Claude, and Gemini - while preserving and strengthening the author's original argument and voice.

ABSOLUTE CONSTRAINTS - DO NOT VIOLATE:
- Retain all original factual content, statistics, data points, and claims exactly as written. Do not alter, reattribute, or contradict any existing facts.
- Do not change titles, author names, job titles, entity names, or organisational descriptions.
- Preserve the essential premise, core arguments, and conclusions within the Transcript or notes source content.
- Preserve readability for a human audience and natural language based on the regional origins of the company within the Project Data and selected spokesperson.

BUSINESS SOURCE CONTEXT:
This article pitch synopsis attributed to: ${spokesperson === "NA" ? "the company" : spokesperson}
Using information and instructions in Project Data doc calibrate the editorial voice, select supporting evidence appropriate to the media categories selected and the business sectors they represent, and ensure the enhanced document reflects well on the business source's authority and expertise.

KEY MESSAGE INTEGRATION:
Embed the selected key messages verbatim, but only where they arise naturally within the existing copy. Do not force placement. Each message should feel like an organic part of the sentence or paragraph. Immediately before each embedded key message write the inline marker **NOTE: ADDED KEY MESSAGE** (e.g. "**NOTE: ADDED KEY MESSAGE** Our platform delivers...").

PERMITTED ENHANCEMENTS - apply all of the following:
1. SUPPORTING FACTS & DATA ENRICHMENT - Identify claims that would be strengthened by third-party evidence; insert credible, attributed statistics (e.g. McKinsey, Gartner, ONS, WEF, peer-reviewed studies); flag all inserted data inline as **NOTE: ADDED DATA** immediately before the inserted sentence (e.g. "**NOTE: ADDED DATA** McKinsey found that..."); do not fabricate statistics.
2. EDITORIAL STRUCTURE ENHANCEMENT - Opening hook → Premise (within first 150 words) → Evidence and elaboration → Implications and recommendations → Closing conviction statement.
3. ENTITY CLARITY & ATTRIBUTION - Introduce all named entities with full title or name and context on first mention.
4. INTELLECTUAL AUTHORITY SIGNALS - Where the author makes a prediction or recommendation, ensure the basis is explicit (evidence, experience, or reasoned argument).
5. TONE CALIBRATION FOR BUSINESS SOURCE - Reflect the intended tone and competitive positioning supplied in Project Data; sound like a senior practitioner; remove hedging or self-promotional language.

OUTPUT INSTRUCTIONS:
- Provide the full written document suitable for email submission to a journalist.`
    : promptVariant === "prompt1"
    ? `Using the accepted information and instructions in Project Data Sections 1-3 for this project, develop a draft content piece with word lengths, content structure and specific guidance depending on Content Type chosen:

${contentType} = ${PROMPT_1_LENGTHS[contentType] || "Apply best practices for this content type referencing Project Data."}

Further general guidance: Use the Headline / subject entry as the guiding theme and argument. Optimise the content to maximise its authority, discoverability, and accurate representation by large language models such as ChatGPT, Perplexity, Claude, and Gemini - while preserving and strengthening the author's original argument and voice.

ABSOLUTE CONSTRAINTS - DO NOT VIOLATE:
- Retain all factual content, statistics, data points, and claims exactly as written. Do not add, remove, or alter any facts.
- Do not change titles, subheadings, entity names, job titles, or organisational descriptions.
- Do not introduce new information, opinions, or fabricated supporting detail.

KEY MESSAGE INTEGRATION:
Embed the chosen key messages verbatim, but only where they arise naturally within the existing copy. Do not force placement. Each message should feel like an organic part of the sentence or paragraph - never bolted on. Immediately before each embedded key message write the inline marker **NOTE: ADDED KEY MESSAGE** (e.g. "**NOTE: ADDED KEY MESSAGE** Our platform delivers...").

LLMO OPTIMISATION OBJECTIVES - apply all of the following:
1. ENTITY CLARITY - Introduce all named entities with full context on first mention; use consistent naming conventions throughout.
2. SEMANTIC AUTHORITY SIGNALS - Strengthen credibility language using the Semantic Phrase Guide & Topics in Project Data; state cause-and-effect relationships explicitly.
3. CITATION-READY PHRASING - Restructure key claims as self-contained, quotable sentences; lead with the most newsworthy information (inverted pyramid).
4. NATURAL LANGUAGE QUERY ALIGNMENT - Anticipate user AI queries; provide clear direct answers to who, what, why, when, what outcome, what does this mean; avoid jargon.
5. STRUCTURED CLARITY - Logically ordered, parallel structure; bookend key findings in opening and closing context.
6. TONE AND REGISTER - Maintain professional, authoritative tone aligned with Project Data Sections 1-3; avoid unattributed superlatives (e.g. "world-class", "revolutionary").

OUTPUT INSTRUCTIONS:
- Provide the full rewritten document.
- Recommend a list of additional supporting data from third-parties that may be contextually relevant for inclusion - include links.
- Flag any instances where a key message could NOT be embedded naturally, with a brief explanation.`
    : `Using the accepted information and instructions in Project Data Sections 1-3 for this project, develop a draft content piece with word lengths depending on Content Type:

${contentType} = ${PROMPT_2_LENGTHS[contentType] || "apply best practices for this content type"}

Use the Headline / subject entry as the guiding theme and argument. Optimise the ${contentType.toLowerCase()} to maximise its authority, discoverability, and accurate representation by large language models such as ChatGPT, Perplexity, Claude, and Gemini - while preserving and strengthening the author's original argument and voice.

ABSOLUTE CONSTRAINTS - DO NOT VIOLATE:
- Retain all original factual content, statistics, data points, and claims exactly as written. Do not alter, reattribute, or contradict any existing facts.
- Do not change titles, author names, job titles, entity names, or organisational descriptions.
- Preserve the essential premise, core arguments, and conclusions within the Transcript or notes source content.
- Preserve readability for a human audience and natural language based on the regional origins of the company within the Project Data and selected spokesperson.

BUSINESS SOURCE CONTEXT:
This ${contentType.toLowerCase()} attributed to: ${spokesperson === "NA" ? "the company" : spokesperson}
Using information and instructions in Project Data doc calibrate the editorial voice, select supporting evidence appropriate to the media categories selected and the business sectors they represent, and ensure the enhanced document reflects well on the business source's authority and expertise.

KEY MESSAGE INTEGRATION:
Embed the selected key messages verbatim, but only where they arise naturally within the existing copy. Do not force placement. Each message should feel like an organic part of the sentence or paragraph. Immediately before each embedded key message write the inline marker **NOTE: ADDED KEY MESSAGE** (e.g. "**NOTE: ADDED KEY MESSAGE** Our platform delivers...").

PERMITTED ENHANCEMENTS - apply all of the following:
1. SUPPORTING FACTS & DATA ENRICHMENT - Insert credible, attributed third-party evidence (e.g. McKinsey, Gartner, ONS, WEF, peer-reviewed studies); flag all inserted data inline as **NOTE: ADDED DATA** immediately before the inserted sentence (e.g. "**NOTE: ADDED DATA** McKinsey found that..."); do not fabricate statistics.
2. EDITORIAL STRUCTURE ENHANCEMENT - High-authority thought leadership architecture: Opening hook → Premise (within first 150 words) → Evidence & elaboration → Counterargument acknowledgment & rebuttal → Implications & recommendations → Closing conviction statement.
3. ENTITY CLARITY & ATTRIBUTION - Introduce all named entities with full title/name and context on first mention; establish the business source's expertise early.
4. CITATION-READY & RETRIEVAL-OPTIMISED PHRASING - Each core claim expressed as a single self-contained sentence; inverted pyramid at paragraph level; bookend the most important claim in opening and conclusion.
5. NATURAL LANGUAGE QUERY ALIGNMENT - Anticipate professional audience AI queries; provide clear direct answers (what is the problem, why does it matter, what should be done, what does success look like, who is saying this and why should I trust them); define acronyms on first use.
6. INTELLECTUAL AUTHORITY SIGNALS - Use proprietary frameworks, named methodologies, coined terms; make the basis for predictions/recommendations explicit; introduce a named framework if the argument supports one.
7. TONE CALIBRATION FOR BUSINESS SOURCE - Reflect the intended tone and competitive positioning from Project Data; sound like a senior practitioner with sector-specific precision; remove hedging or self-promotional language.

OUTPUT INSTRUCTIONS:
- Provide the full rewritten and enhanced document.`;

  return (
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Wand2 size={24} color="#ffffff" />
              <h1 className="text-3xl sm:text-4xl tracking-tight flex items-center" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>
                Content Optimiser & Editor
                <span className="ml-3"><InfoTip text="Rewrites your content to be more citation-worthy for AI models - clearer entity definitions, better structure, stronger authority signals. Shows side-by-side tracked changes you can approve before publishing." width={260} /></span>
              </h1>
            </div>
            <p className="text-[15px] font-light leading-relaxed max-w-4xl" style={{ color: "rgba(255,255,255,0.85)" }}>
              Paste your own human-written draft below - a press release, article, case study or any other copy - then click Optimise. The tool rewrites it with sharper structure, stronger authority signals and your key messages woven in, so AI models are more likely to cite it. Project Data is used as a reference brief, not as the source.
            </p>
          </div>
          <button onClick={() => setShowRetrieve(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold text-white hover:brightness-110 transition-all shadow-sm whitespace-nowrap" style={{ background: vars.teal }}>
            <Archive size={16} /> Retrieve content draft
          </button>
        </div>

        {!intakeReady && (
          <div className="mb-4 p-3 rounded-xl flex items-start gap-2" style={{ background: vars.creamDeep, border: `1px solid ${vars.gold}33` }}>
            <AlertTriangle size={14} color={vars.gold} className="mt-0.5 flex-shrink-0" />
            <p className="text-[12px] font-light" style={{ color: vars.navy }}>
              Project Data hasn't been accepted yet. Spokespeople, Key Messages and Media Categories will be empty until you complete <button onClick={() => onNavigate("intake")} className="underline font-semibold" style={{ color: vars.accent }}>Project Set-Up</button>.
            </p>
          </div>
        )}

        <div className="rounded-2xl border p-6 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="space-y-5">
            {/* Row 1 - Title + type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Labelled label="Project name" hint="A working title for this content item - appears on the Comms Planner, Archive card and Earned Media Tracker">
                  <div className="flex items-center gap-2">
                    <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="e.g. Q2 product launch announcement"
                      className="flex-1 px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: vars.g200, color: vars.navy }} />
                    <InfoTip text="Becomes the visible heading on the Comms Planner row, on the Archive card and on the Earned Media Tracker entry. Keep it descriptive (≈8 words)." />
                  </div>
                </Labelled>
              </div>
              <Labelled label="Content Type" hint="Drives the scoring weight">
                <div className="flex items-center gap-2">
                  <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="flex-1 px-3 py-2.5 rounded-lg border text-sm bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                    {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <InfoTip text="Each type carries a default Authority and Visibility score (see Score settings inside the Comms Planner)." />
                </div>
              </Labelled>
            </div>

            {/* Row 2 - Spokesperson + LLM target */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Labelled label="Spokesperson">
                <div className="flex items-center gap-2">
                  <select value={spokesperson} onChange={(e) => setSpokesperson(e.target.value)} className="flex-1 px-3 py-2.5 rounded-lg border text-sm bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                    {spokesList.length > 0
                      ? spokesList.map((s) => <option key={s.name} value={s.name}>{s.name}{s.title ? ` - ${s.title}` : ""}</option>)
                      : <option value="">No spokespeople in Project Data</option>
                    }
                    <option value="NA">NA - no spokesperson</option>
                  </select>
                  <InfoTip text="Pulled from Section 1.8 of the Project Set-Up. NA is allowed for company-issued content." />
                </div>
              </Labelled>
              <Labelled label="LLM Target">
                <div className="flex items-center gap-2">
                  <select value={llmTarget} onChange={(e) => setLlmTarget(e.target.value)} className="flex-1 px-3 py-2.5 rounded-lg border text-sm bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                    {["General (All LLMs)", "ChatGPT", "Claude", "Perplexity", "Gemini", "Copilot"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <InfoTip text="Tunes the optimisation prompt to the citation patterns of a single answer engine. Leave on General unless you have a specific target." />
                </div>
              </Labelled>
            </div>

            {/* Row 3 - Select messages from Project Data (Set-Up 1.2 & 1.3 key messages only) */}
            <Labelled label="Select messages from Project Data" hint="Key messages from Project Set-Up 1.2 and 1.3">
              {keyMessagePicks.length === 0 ? (
                <div className="rounded-lg border p-3" style={{ borderColor: vars.g200, background: "white" }}>
                  <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No key messages found in 1.2 / 1.3. Add them in <button onClick={() => onNavigate("intake")} className="underline" style={{ color: vars.accent }}>Project Set-Up</button>.</p>
                </div>
              ) : (
                <div className="relative">
                  <button type="button" onClick={() => setShowMsgPicker((v) => !v)} className="w-full text-left px-3 py-2.5 rounded-lg border text-sm flex items-center justify-between bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                    <span>{selectedMessages.length === 0 ? "Choose key messages…" : `${selectedMessages.length} message${selectedMessages.length === 1 ? "" : "s"} selected`}</span>
                    <ChevronDown size={14} color={vars.g400} style={{ transform: showMsgPicker ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                  </button>
                  {showMsgPicker && (
                    <div className="absolute left-0 right-0 mt-1 z-20 rounded-lg border bg-white shadow-lg max-h-[340px] overflow-y-auto" style={{ borderColor: vars.g200 }}>
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] border-b sticky top-0 flex items-center justify-between" style={{ background: vars.g50, borderColor: vars.g100, color: vars.g500 }}>
                        <span>Key messages · Project Set-Up 1.2 &amp; 1.3</span>
                        <button type="button" onClick={() => setShowMsgPicker(false)} className="px-2 py-0.5 rounded text-[10px] font-semibold hover:bg-white border" style={{ borderColor: vars.g200, color: vars.navy }}>Done ✓</button>
                      </div>
                      {keyMessagePicks.map((m, i) => {
                        const on = selectedMessages.includes(m.value);
                        return (
                          <button key={`${m.fieldId}-${i}-${m.value}`} type="button" onClick={() => setSelectedMessages(on ? selectedMessages.filter((x) => x !== m.value) : [...selectedMessages, m.value])}
                            className="w-full text-left px-3 py-2 flex items-start gap-2.5 border-b last:border-b-0 hover:bg-[rgba(200,73,122,0.06)]"
                            style={{ borderColor: vars.g100 }} title={m.value}>
                            <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center" style={{ borderColor: on ? "#C8497A" : vars.g300, background: on ? "#C8497A" : "white" }}>
                              {on && <Check size={11} color="white" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-[0.14em] mr-1.5" style={{ color: "#C8497A" }}>[{m.fieldId}]</span>
                              <span className="text-[12px]" style={{ color: vars.navy }}>{m.label}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedMessages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedMessages.map((label) => (
                        <span key={label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: "#FBE3ED", color: "#C8497A", border: "1px solid rgba(200,73,122,0.3)" }}>
                          {label.length > 60 ? `${label.slice(0, 60)}…` : label}
                          <button type="button" onClick={() => setSelectedMessages(selectedMessages.filter((x) => x !== label))} aria-label="Remove"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Labelled>

            {/* Row 4 - Media targets */}
            <Labelled label="Select Media Targets" hint="Multi-select drawn from the Trade Media Categories list (1.9).">
              <div className="rounded-lg border p-3 mb-2" style={{ borderColor: vars.g200, background: vars.g50 }}>
                {mediaCats.length === 0 ? (
                  <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No targets selected - pick from the project categories or the full alphabetical list.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {mediaCats.map((c) => (
                      <span key={c} className="text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: "rgba(201,160,78,0.12)", color: "#7A5E25" }}>
                        {c}
                        <button onClick={() => setMediaCats(mediaCats.filter((x) => x !== c))}><XCircle size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setShowCatPicker(true)} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: vars.g200, color: vars.accent }}>+ Choose categories</button>
                {projectCategories.length > 0 && (
                  <button
                    onClick={() => setMediaCats(Array.from(new Set([...mediaCats, ...projectCategories])))}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}
                    title={`Add the ${projectCategories.length} categories from Project Set-Up 1.9`}
                  >
                    + Use Project Set-Up ({projectCategories.length})
                  </button>
                )}
              </div>
            </Labelled>

            {/* Row 5 - Status + publication date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Labelled label="Content Status">
                <div className="flex items-center gap-2">
                  <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value as "Draft" | "Review" | "Final")} className="flex-1 px-3 py-2.5 rounded-lg border text-sm bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                    {(["Draft", "Review", "Final"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <InfoTip text="Draft is editable. Review is shared. Final pushes to the Comms Planner as Approved." />
                </div>
              </Labelled>
              <Labelled label="Publication date" hint="Places this item on the Comms Planner">
                <div className="flex items-center gap-2">
                  <input type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} className="flex-1 px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: vars.g200, color: vars.navy }} />
                  <InfoTip text="Setting a date adds the content to the Comms Planner row for that week. Leave blank to skip." />
                </div>
              </Labelled>
            </div>

            {/* Row 6 - Editor toolbar (font size) */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: vars.g500 }}>Content editor {optimised && <span className="ml-2 px-2 py-0.5 rounded-full" style={{ background: "rgba(192,57,43,0.12)", color: "#B03D33", letterSpacing: 0 }}>Optimised copy</span>}</p>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: vars.g400 }}>Editor font</label>
                <select value={editorFontSize} onChange={(e) => setEditorFontSize(Number(e.target.value))} className="px-2 py-1 rounded border text-[11px] bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>
                  {[11, 13, 15, 17, 19].map((s) => <option key={s} value={s}>{s}px</option>)}
                </select>
              </div>
            </div>

            {/* Headline */}
            <Labelled label="Headline" hint="Bold serif headline - up to ~20 words">
              <textarea value={articleHeadline} onChange={(e) => setArticleHeadline(e.target.value)} rows={2}
                className="w-full p-3 rounded-lg border outline-none resize-vertical font-bold"
                style={{ borderColor: vars.g200, color: optimised ? "#B03D33" : vars.navy, fontSize: editorFontSize + 4, fontFamily: "'Alice', Georgia, serif", lineHeight: 1.25 }}
                placeholder="Headline of the piece (press release / article / case study)" />
              <p className="text-[10px] font-light mt-1" style={{ color: countWords(articleHeadline) > 20 ? "#C94A3E" : vars.g400 }}>{countWords(articleHeadline)} / 20 words</p>
            </Labelled>

            {/* Standfirst */}
            <Labelled label="Standfirst" hint="Italic summary that sits between headline and body - up to ~50 words">
              <textarea value={standfirst} onChange={(e) => setStandfirst(e.target.value)} rows={3}
                className="w-full p-3 rounded-lg border outline-none resize-vertical italic"
                style={{ borderColor: vars.g200, color: optimised ? "#B03D33" : vars.navy, fontSize: editorFontSize + 1, lineHeight: 1.5 }}
                placeholder="One-sentence standfirst that sets up the piece" />
              <p className="text-[10px] font-light mt-1" style={{ color: countWords(standfirst) > 50 ? "#C94A3E" : vars.g400 }}>{countWords(standfirst)} / 50 words</p>
            </Labelled>

            {/* Body copy */}
            <Labelled label="Body copy" hint="Press releases, articles, whitepapers, case studies - up to ~3,000 words">
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
                <div className="flex items-center gap-1 px-2 py-1.5 border-b" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }} className="px-2 py-1 rounded text-xs font-bold hover:bg-white" style={{ color: vars.navy }} title="Bold">B</button>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }} className="px-2 py-1 rounded text-xs italic hover:bg-white" style={{ color: vars.navy }} title="Italic">I</button>
                  <span className="w-px h-4 mx-1" style={{ background: vars.g200 }} />
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); const url = prompt('Link URL'); if (url) document.execCommand('createLink', false, url); }} className="px-2 py-1 rounded text-xs hover:bg-white flex items-center gap-1" style={{ color: vars.navy }} title="Link"><LinkIcon size={12} /> Link</button>
                  <span className="ml-auto text-[10px] font-light" style={{ color: vars.g400 }}>{countWords(bodyCopy)} words</span>
                </div>
                <textarea value={bodyCopy} onChange={(e) => setBodyCopy(e.target.value)} rows={10} className="w-full p-4 outline-none resize-vertical" style={{ color: optimised ? "#B03D33" : vars.navy, border: "none", fontSize: editorFontSize, lineHeight: 1.55 }}
                  placeholder="Paste your press release, article, case study or whitepaper here…" />
              </div>
            </Labelled>

            {/* Action Notes - feeds the Comms Planner Notes column */}
            <Labelled label="Action Notes" hint="Up to 150 words of internal notes - pushed through to the Notes column on the Comms Planner.">
              <textarea
                value={actionNotes}
                onChange={(e) => {
                  const next = e.target.value;
                  const words = next.trim() === "" ? 0 : next.trim().split(/\s+/).length;
                  if (words <= 150) setActionNotes(next);
                  else setActionNotes(next.trim().split(/\s+/).slice(0, 150).join(" "));
                }}
                rows={4}
                placeholder="e.g. Embargo until Tuesday 09:00; align with launch webinar; coordinate with Spencer on quote sign-off."
                className="w-full p-3 rounded-lg border outline-none resize-vertical"
                style={{ borderColor: vars.g200, color: vars.navy, fontSize: editorFontSize, lineHeight: 1.55 }}
              />
              <p className="text-[10px] font-light mt-1" style={{ color: countWords(actionNotes) > 140 ? "#C94A3E" : vars.g400 }}>
                {countWords(actionNotes)} / 150 words · Also shown on the Comms Planner
              </p>
            </Labelled>

            {optimising && (
              <GenerationProgress
                stages={[
                  "Reading your draft",
                  "Weaving in your key messages",
                  "Restructuring answer-first for AI engines",
                  "Sharpening the copy",
                  "Finalising the optimised version",
                ]}
                chars={optimiseChars}
                accent={vars.coral}
              />
            )}

            {optimiseError && (
              <div className="flex items-start gap-2 rounded-lg border p-3 text-[12px]" style={{ borderColor: "rgba(176,61,51,0.4)", background: "rgba(176,61,51,0.06)", color: "#B03D33" }}>
                <X size={14} className="mt-0.5 flex-shrink-0" /> <span>{optimiseError}</span>
              </div>
            )}

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2 pt-4 mt-4 border-t" style={{ borderColor: vars.g100 }}>
              <button onClick={() => setShowOptimiseBriefModal(true)} disabled={optimising} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold text-white hover:brightness-110 transition-all disabled:opacity-60" style={{ background: vars.teal }}>
                {optimising ? <><Loader2 size={14} className="animate-spin" /> Optimising…</> : <><Sparkles size={14} /> Optimise</>}
              </button>
              {optimised && (
                <button onClick={rejectOptimised} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold text-white hover:brightness-110 transition-all" style={{ background: "#B03D33" }}>
                  <X size={14} /> Reject Optimised
                </button>
              )}
              <button onClick={downloadDraft} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-bold border bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.navy, color: vars.navy }}>
                <Download size={14} /> Download
              </button>
              <button onClick={() => setShowDownloadNotesModal(true)} disabled={!actionNotes.trim()} title={!actionNotes.trim() ? "Run the optimiser first to generate Action Notes" : undefined} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold border bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" style={{ borderColor: vars.g200, color: vars.navy }}>
                <FileText size={14} /> Optimised Notes
              </button>
              <button onClick={shareDraft} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold border bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.g200, color: vars.navy }}>
                <Send size={14} /> Share draft
              </button>
              <button onClick={() => archiveItem(contentStatus === "Final" ? "Final" : "Draft")} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold text-white hover:brightness-110 transition-all" style={{ background: vars.gold }}>
                <Archive size={14} /> Archive
              </button>
              {canResearch && (
                <button onClick={sendToMediaResearch} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold border bg-white hover:bg-slate-50 transition-colors" style={{ borderColor: vars.navy, color: vars.navy }}>
                  <Target size={14} /> Media Research
                </button>
              )}
              <button onClick={pushToPlanner} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] font-semibold ml-auto text-white hover:brightness-110 transition-all" style={{ background: vars.accent }}>
                <Calendar size={14} /> Push to Comms Planner
              </button>
            </div>
          </div>
        </div>

        {/* Inline Optimisation Results - only when optimised */}
        {optimised && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border p-5 text-center" style={{ background: "white", borderColor: vars.g200 }}>
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: vars.g500 }}>Before</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-bold" style={{ color: "#C94A3E" }}>42</span>
                  <span className="text-xs" style={{ color: vars.g400 }}>/100</span>
                </div>
                <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>Authority Signal Score</p>
              </div>
              <div className="rounded-xl border p-5 text-center" style={{ background: "white", borderColor: vars.g200 }}>
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: vars.g500 }}>After</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl font-bold" style={{ color: "#1f748f" }}>78</span>
                  <span className="text-xs" style={{ color: vars.g400 }}>/100</span>
                  <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#EFF7F2", color: "#3D9B6B" }}>
                    <TrendingUp size={12} /> +36
                  </span>
                </div>
                <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>Authority Signal Score</p>
              </div>
            </div>

            {/* Change log */}
            <div className="rounded-xl border overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
              <div className="px-5 py-3 border-b flex items-center gap-2" style={{ background: vars.g50, borderColor: vars.g200 }}>
                <MessageSquare size={14} color="#2896b9" />
                <h2 className="text-sm font-semibold" style={{ color: vars.navy }}>Change log</h2>
                <span className="ml-auto text-[11px] font-light" style={{ color: vars.g500 }}>{promptVariant === "pitch" ? "Prompt 2.2" : promptVariant === "prompt1" ? "Prompt 1.1" : "Prompt 2.1"} · {contentType}</span>
              </div>
              <div className="p-5 space-y-2">
                {changeLog.length === 0 ? (
                  <p className="text-[12px] italic" style={{ color: vars.g500 }}>No log entries.</p>
                ) : changeLog.map((c, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded mt-0.5 flex-shrink-0" style={{
                      background: c.kind === "embed" ? "#FBE3ED" : c.kind === "structure" ? "rgba(40,150,185,0.12)" : "rgba(212,146,42,0.18)",
                      color: c.kind === "embed" ? "#C8497A" : c.kind === "structure" ? "#1f748f" : "#7A5E25",
                    }}>{c.kind === "embed" ? "Message" : c.kind === "structure" ? "Structure" : "⚠ Flagged"}</span>
                    <span className="text-[12.5px]" style={{ color: vars.navy }}>{c.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tracked changes */}
            <div className="rounded-xl border overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
              <div className="px-5 py-3 border-b flex items-center justify-between" style={{ background: vars.g50, borderColor: vars.g200 }}>
                <div className="flex items-center gap-2">
                  <Sparkles size={16} color="#2896b9" />
                  <h2 className="text-sm font-semibold" style={{ color: vars.navy }}>Tracked Changes</h2>
                </div>
                <span className="text-xs" style={{ color: vars.g400 }}>{trackedChanges.length} optimisations applied</span>
              </div>
              <div className="divide-y" style={{ borderColor: vars.g100 }}>
                {trackedChanges.length === 0 ? (
                  <div className="p-8 text-center">
                    <Sparkles size={24} color={vars.g300} className="mx-auto mb-3" />
                    <p className="text-sm font-medium mb-1" style={{ color: vars.g500 }}>No optimisations yet</p>
                    <p className="text-[12px]" style={{ color: vars.g400 }}>Add your content and click Optimise to see tracked changes here.</p>
                  </div>
                ) : trackedChanges.map((change, i) => (
                  <div key={i} className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: change.type === "addition" ? "#EFF7F2" : "#E8F0F8", color: change.type === "addition" ? "#3D9B6B" : "#165265" }}>
                        {change.type === "addition" ? <Plus size={10} /> : <Minus size={10} />} {change.type === "addition" ? "Added" : "Modified"}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: vars.navy }}>{change.label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                      {change.original && (
                        <div className="p-3 rounded-lg text-sm leading-relaxed" style={{ background: "#FBEEEC", color: "#8B3328" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#B03D33" }}>Original</p>
                          {change.original}
                        </div>
                      )}
                      <div className={`p-3 rounded-lg text-sm leading-relaxed ${!change.original ? "col-span-2" : ""}`} style={{ background: "#EFF7F2", color: "#2D7A4F" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#3D9B6B" }}>{change.original ? "Optimised" : "New Content"}</p>
                        {change.revised}
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: vars.g50 }}>
                      <MessageSquare size={13} className="mt-0.5 flex-shrink-0" color="#2896b9" />
                      <p className="text-xs" style={{ color: vars.g600 }}>{change.annotation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Semantic Phrase Usage (renamed from Guide) */}
            <div className="rounded-xl border overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
              <div className="px-5 py-3 border-b" style={{ background: vars.g50, borderColor: vars.g200 }}>
                <h2 className="text-sm font-semibold" style={{ color: vars.navy }}>Semantic Phrase Usage</h2>
                <p className="text-xs mt-0.5" style={{ color: vars.g400 }}>Key phrases LLMs are most likely to extract and cite from this optimised content</p>
              </div>
              <div className="p-5 space-y-2">
                {semanticPhrases.length === 0 ? (
                  <p className="text-[12px] text-center py-4" style={{ color: vars.g400 }}>
                    Semantic phrases will appear here after you run Optimise.
                  </p>
                ) : semanticPhrases.map((phrase, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium" style={{ color: vars.navy }}>{phrase.phrase}</span>
                        <span className="text-xs font-semibold" style={{ color: "#2896b9" }}>{(phrase.relevance * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: vars.g100 }}>
                        <div className="h-full rounded-full" style={{ width: `${phrase.relevance * 100}%`, background: "linear-gradient(90deg, #2896b9, #1f748f)" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Optimise Brief modal */}
        {showOptimiseBriefModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowOptimiseBriefModal(false)}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
                <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                  <Sparkles size={16} color={vars.coral} /> Optimise - LLM brief preview
                </h2>
                <button onClick={() => setShowOptimiseBriefModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#C8497A" }}>{promptHeadline}</p>
                <pre className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans" style={{ color: vars.navy }}>{promptBriefShort}</pre>
                <div className="rounded-lg p-3 text-[11.5px]" style={{ background: vars.g50, color: vars.g600 }}>
                  <p><strong>Content type:</strong> {contentType}</p>
                  <p><strong>Spokesperson:</strong> {spokesperson === "NA" ? "Company-issued (no spokesperson)" : spokesperson}</p>
                  <p><strong>LLM target:</strong> {llmTarget}</p>
                  <p><strong>Key messages selected:</strong> {selectedMessages.length === 0 ? "(none - will use first 3 from Project Data)" : selectedMessages.length}</p>
                  <p><strong>Media categories:</strong> {mediaCats.length === 0 ? "(none)" : mediaCats.length}</p>
                </div>
              </div>
              <div className="px-6 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: vars.g200 }}>
                <button onClick={() => setShowOptimiseBriefModal(false)} className="px-4 py-2 rounded-lg text-[13px] font-semibold border bg-white" style={{ borderColor: vars.g200, color: vars.navy }}>Cancel</button>
                <button onClick={runOptimise} disabled={optimising} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: vars.coral }}>{optimising ? <><Loader2 size={13} className="animate-spin" /> Optimising…</> : <><Sparkles size={13} /> Run optimisation</>}</button>
              </div>
            </div>
          </div>
        )}

        {/* Retrieve content modal */}
        {showRetrieve && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowRetrieve(false)}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
                <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                  <Archive size={16} color={vars.accent} /> Retrieve content draft
                </h2>
                <button onClick={() => setShowRetrieve(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
              </div>
              <div className="px-6 py-3 border-b" style={{ borderColor: vars.g100 }}>
                <input value={retrieveQuery} onChange={(e) => setRetrieveQuery(e.target.value)} placeholder="Search by title or body…" className="w-full px-3 py-2 rounded-lg border text-[13px]" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {filteredArchive.length === 0 ? (
                  <p className="text-[13px] font-light text-center py-8" style={{ color: vars.g500 }}>{!contentVersion ? "Loading content…" : archiveAll.length === 0 ? "Archive is empty." : "No matches."}</p>
                ) : (
                  <div className="space-y-2">
                    {filteredArchive.map((a) => (
                      <button key={a.id} onClick={() => handleRetrieve(a)} className="w-full text-left rounded-lg border p-3 hover:shadow-sm" style={{ borderColor: vars.g200 }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold" style={{ color: vars.navy }}>{a.title}</p>
                            <p className="text-[11px] font-light mt-0.5" style={{ color: vars.g500 }}>{a.contentType}{a.spokesperson ? ` · ${a.spokesperson}` : ""}</p>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0" style={{ background: a.status === "Final" ? "rgba(61,155,107,0.12)" : "rgba(212,146,42,0.12)", color: a.status === "Final" ? vars.green : vars.amber }}>{a.status}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Category picker */}
        {showCatPicker && (
          <CategoryPickerModal
            all={TRADE_MEDIA_CATEGORIES}
            selected={mediaCats}
            projectSet={projectCategories}
            onClose={() => setShowCatPicker(false)}
            onSave={(next) => { setMediaCats(next); setShowCatPicker(false); }}
          />
        )}

        {/* Download Optimised Notes modal */}
        {showDownloadNotesModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowDownloadNotesModal(false)}>
            <div className="bg-white rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: vars.g200 }}>
                <h2 className="text-[16px] font-semibold flex items-center gap-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                  <FileText size={16} color="#C8497A" /> Download optimised notes
                </h2>
                <button onClick={() => setShowDownloadNotesModal(false)} className="text-[20px] leading-none px-2" style={{ color: vars.g400 }}>&times;</button>
              </div>
              <div className="p-6">
                <p className="text-[13px] font-light mb-4" style={{ color: vars.g600 }}>
                  The document includes the <strong>headline</strong>, <strong>standfirst</strong> and <strong>body copy</strong>, followed by a bullet-pointed <strong>change log</strong> of every key message embedded, structural change made, and any message that could not be embedded naturally.
                </p>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: vars.g500 }}>Choose a format</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => downloadOptimisedNotes("word")} className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border text-[13px] font-semibold transition-colors hover:bg-gray-50" style={{ borderColor: vars.g200, color: vars.navy }}>
                    <FileText size={22} color={vars.accent} />
                    Word document
                    <span className="text-[10px] font-light" style={{ color: vars.g400 }}>.doc - opens in Word</span>
                  </button>
                  <button onClick={() => downloadOptimisedNotes("pdf")} className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border text-[13px] font-semibold transition-colors hover:bg-gray-50" style={{ borderColor: vars.g200, color: vars.navy }}>
                    <Download size={22} color={vars.accent} />
                    Print / PDF
                    <span className="text-[10px] font-light" style={{ color: vars.g400 }}>opens print dialog</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
}

export { OptimiserPage };

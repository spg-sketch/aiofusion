import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ChevronRight, Lock, Search, FileEdit, BarChart3, Archive, Send, LineChart, ArrowRight, Sparkles, Loader2,
  TrendingUp, FileText, FileCheck2, Target, HelpCircle, MessageSquareQuote, Bot, ShieldCheck,
  MessagesSquare, Download, AlertTriangle, CheckCircle2, XCircle, Info, Globe, Tag, User, ChevronDown,
  Plus, Minus, MessageSquare, BookOpen, Scroll, Award, Radio, Mic2, PenLine, ClipboardList, ArrowUpRight,
  Lightbulb, ClipboardPaste, Upload, Calendar, Check, Save, Circle, Zap, Mail, Shield, Eye, Building2,
  ArrowLeft, LogOut, Trash2, KeyRound, Users, Activity, Play, ChevronUp, Menu, X, LogIn,
  Link as LinkIcon, Image as ImageIcon, Repeat, TrendingDown, FolderOpen, List as ListIcon, Clock,
  Undo2, ArchiveRestore, RefreshCw, MonitorSmartphone, FileCheck, FolderCheck,
} from "lucide-react";
import { vars } from "../marketing/vars";
import { ratingConfig, type DiagnosticResult, type SavedDiagnostic, loadSavedDiagnostics, persistSavedDiagnostics, contentGeoKey, techGeoKey, loadSavedScored, persistSavedScored, type SavedScored } from "../lib/diagnosticStore";
import { syncDiagnosticsForProject, pushServerDiagnostic } from "../lib/auditSync";
import { apiBase } from "../lib/contentAi";
import type { Client } from "../lib/projectTypes";
import { getSession as getLocalSession } from "../lib/auth";
import { getConfirmedEntity } from "../IntakeForm";
import InfoTip from "../InfoTip";
function DiagnosticPage({
  activeClient,
  pendingDiagnosticId,
  onConsumePendingDiagnostic,
}: {
  activeClient: Client;
  pendingDiagnosticId?: string | null;
  onConsumePendingDiagnostic?: () => void;
}) {
  const [urlInput, setUrlInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [savedDiagnostics, setSavedDiagnostics] = useState<SavedDiagnostic[]>(() => loadSavedDiagnostics(activeClient.id));
  const [justSaved, setJustSaved] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  type AuditLockInfo = { locked: boolean; lastRunAt?: string; nextAvailableAt?: string; daysRemaining?: number };
  const [diagAuditLock, setDiagAuditLock] = useState<AuditLockInfo>({ locked: false });
  const [showDiagConfirm, setShowDiagConfirm] = useState(false);
  const [diagPendingForce, setDiagPendingForce] = useState(false);

  useEffect(() => {
    setSavedDiagnostics(loadSavedDiagnostics(activeClient.id));
    setResult(null);
    setError(null);
    setJustSaved(false);
    setDiagAuditLock({ locked: false });
    setShowDiagConfirm(false);
    setDiagPendingForce(false);
    // Sync diagnostic history from server so all logins see the same results.
    void syncDiagnosticsForProject(activeClient.id).then((merged) => {
      setSavedDiagnostics(merged);
    });
  }, [activeClient.id]);

  useEffect(() => {
    if (!activeClient.id) return;
    const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
    fetch(`${apiBase}/api/audit-lock?projectId=${encodeURIComponent(activeClient.id)}&auditType=website`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d: AuditLockInfo) => setDiagAuditLock(d))
      .catch(() => { /* non-blocking */ });
  }, [activeClient.id]);

  useEffect(() => {
    if (!pendingDiagnosticId) return;
    const match = savedDiagnostics.find((d) => d.id === pendingDiagnosticId);
    if (match) {
      setResult(match.result);
      setError(null);
      setJustSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    onConsumePendingDiagnostic?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDiagnosticId, savedDiagnostics]);

  function saveDiagnostic(target: DiagnosticResult | null = result) {
    if (!target || justSaved) return;
    const entry: SavedDiagnostic = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      result: target,
    };
    const next = [entry, ...savedDiagnostics];
    if (!persistSavedDiagnostics(activeClient.id, next)) {
      alert("Could not save this audit - your browser storage may be full. Try removing a few older saved audits.");
      return;
    }
    setSavedDiagnostics(next);
    setJustSaved(true);
    // Mirror to server so all logins on the same project see this diagnostic.
    void pushServerDiagnostic(activeClient.id, entry);
    window.dispatchEvent(new Event("aio:saved-audits-changed"));
  }

  // Automatically saves a freshly-run audit so it appears in the sidebar
  // straight away, without relying on the user to spot the "Save audit"
  // button in the footer. Uses the freshly-fetched savedDiagnostics list
  // (rather than the possibly-stale `savedDiagnostics` state) so it can't
  // race with the click-to-save path and create a duplicate.
  function autoSaveDiagnostic(target: DiagnosticResult) {
    const current = loadSavedDiagnostics(activeClient.id);
    const entry: SavedDiagnostic = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      result: target,
    };
    const next = [entry, ...current];
    if (!persistSavedDiagnostics(activeClient.id, next)) return;
    setSavedDiagnostics(next);
    setJustSaved(true);
    // Mirror to server so all logins on the same project see this diagnostic.
    void pushServerDiagnostic(activeClient.id, entry);
    window.dispatchEvent(new Event("aio:saved-audits-changed"));
  }

  const copyToClipboard = async (text: string, key: string) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
    }
    if (!ok) {
      alert("Could not copy to your clipboard. Your browser may be blocking clipboard access.");
      return;
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  };

  const buildSeoImprovementsText = (r: DiagnosticResult): string => {
    const lines: string[] = [];
    lines.push(`SEO / AIO improvements for ${activeClient.name}`);
    lines.push(`Overall AIO score: ${r.overallScore}/100`);
    if (r.fetchedUrl) lines.push(`Site analysed: ${r.fetchedUrl}`);
    lines.push("");
    if ((r.priorityActions || []).length > 0) {
      lines.push("PRIORITY ACTIONS");
      r.priorityActions.forEach((a, i) => {
        lines.push(`${i + 1}. [${a.priority}] ${a.action} (${a.timeframe} · ${a.category})`);
      });
      lines.push("");
    }
    const withRecs = (r.categories || []).filter((c) => (c.recommendations || []).length > 0);
    if (withRecs.length > 0) {
      lines.push("RECOMMENDATIONS BY CATEGORY");
      withRecs.forEach((c) => {
        lines.push(`${c.name} (${c.score}/${c.max})`);
        c.recommendations.forEach((rec) => lines.push(`  - ${rec}`));
      });
      lines.push("");
    }
    if ((r.criticalGaps || []).length > 0) {
      lines.push("CRITICAL GAPS");
      r.criticalGaps.forEach((g) => lines.push(`  - ${g}`));
    }
    return lines.join("\n").trim();
  };

  const buildVibeCodePrompt = (r: DiagnosticResult): string => {
    const target = r.fetchedUrl || activeClient.name;
    const lines: string[] = [];
    lines.push("You are an expert technical SEO and GEO (generative engine optimisation) engineer.");
    lines.push("Improve my website so it ranks in traditional search AND gets cited by AI answer engines (ChatGPT, Claude).");
    lines.push("");
    lines.push(`Website: ${target}`);
    lines.push(`Current AIO score: ${r.overallScore}/100`);
    lines.push("");
    lines.push("Make the following changes. For each one, apply the concrete code or content change and briefly explain what you changed and why:");
    lines.push("");
    if ((r.priorityActions || []).length > 0) {
      lines.push("PRIORITY ACTIONS (do these first)");
      r.priorityActions.forEach((a, i) => {
        lines.push(`${i + 1}. [${a.priority}] ${a.action}`);
      });
      lines.push("");
    }
    const withRecs = (r.categories || []).filter((c) => (c.recommendations || []).length > 0);
    if (withRecs.length > 0) {
      lines.push("DETAILED RECOMMENDATIONS");
      withRecs.forEach((c) => {
        lines.push(`${c.name}:`);
        c.recommendations.forEach((rec) => lines.push(`  - ${rec}`));
      });
      lines.push("");
    }
    lines.push("Use clean semantic HTML, structured data (schema.org JSON-LD), clear heading hierarchy, fast load times, and content that directly answers real user questions so AI models can quote it. Return the changes ready to commit.");
    return lines.join("\n").trim();
  };

  const DIAGNOSTIC_LLM_BRIEF = `You are an expert in Generative Engine Optimisation (GEO) and AI Engine Optimisation (AEO). You analyse a brand's web presence for readiness to be cited, referenced, and recommended by AI-powered search and answer engines (ChatGPT, Claude).

Score each of the following 6 categories from 0 to the maximum shown. Be rigorous - most pages score poorly. Provide specific, actionable recommendations for each category.

Categories (score / max):
1. Schema & Structured Data (0-15): Does the content have Organization schema, FAQ schema, Article schema, author markup? Look for JSON-LD, microdata, or RDFa signals.
2. Content Architecture (0-15): Is content written in answer-first format? Are there clear headings, key takeaway boxes, semantic phrases, entity-rich descriptions? Is it structured for extraction?
3. Source Authority (0-15): Are there author credentials, expert profiles, trust signals, citations to primary sources, NAP consistency indicators?
4. Earned Media Signals (0-20): Evidence of press coverage, backlinks, spokesperson mentions, third-party endorsements, industry reports?
5. LLM Visibility (0-20): Is the content written in a way LLMs can easily cite? Are there clear, quotable statements of fact? Does it answer common questions directly?
6. Technical Accessibility (0-15): Are there indicators of page speed, clean HTML structure, proper heading hierarchy, mobile-friendliness, AI crawler access?

Return your analysis as valid JSON only (no markdown, no code fences) with: overallScore (0-100), categories (name, score, max, status, findings[], recommendations[]), strengths[], warnings[], criticalGaps[], priorityActions[] (priority, action, timeframe, impact, category), summary.

Inputs supplied with this brief:
- The site's homepage, fetched automatically from the URL, along with its robots.txt and sitemap. Any content the user pastes is added on top (up to ~50,000 characters in total).
- A set of measured facts counted directly from the page (image and alt-text counts, schema types found, heading counts, sitemap size and so on). These are supplied as ground truth so the figures in the report match what is actually on the page.

Engine used:
- Anthropic Claude (claude-sonnet-4-5), run at temperature 0 and grounded on the measured facts so the same page gives near-identical results each time. OpenAI (gpt-5), also at temperature 0 with a fixed seed, is kept as a silent backup only if Claude is unavailable.`;

  const handleRunDiagnostic = async (force = false) => {
    if (!contentInput.trim() && !urlInput.trim()) {
      setError("Please enter a homepage URL or paste content to analyse.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const resp = await fetch(`${apiBase}/api/diagnostic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          content: contentInput.trim() || undefined,
          url: urlInput.trim() || undefined,
          // Anchor the audit to the company the user confirmed for this brand
          // (from the Earned Media entity-clarity step), so an ambiguous name is
          // measured as the same company across every audit. Omitted when no
          // identity has been confirmed, leaving the result unchanged.
          confirmedEntity: getConfirmedEntity() || undefined,
          projectId: activeClient.id,
          force,
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${resp.status})`);
      }
      const data = await resp.json();
      setResult(data);
      setJustSaved(false);
      // Auto-save every completed audit so it shows up in the sidebar
      // immediately, without waiting for the user to notice/click "Save audit".
      // saveDiagnostic() itself is duplicate-safe, so a later manual click
      // (or the effect below) is a no-op if this already saved it.
      autoSaveDiagnostic(data);
      // Refresh audit lock so the next visit shows the correct last-run date.
      const lockResp = await fetch(`${apiBase}/api/audit-lock?projectId=${encodeURIComponent(activeClient.id)}&auditType=website`, { credentials: "include" }).catch(() => null);
      if (lockResp?.ok) lockResp.json().then(setDiagAuditLock).catch(() => {});
    } catch (err: any) {
      setError(err.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!result) {
    return (
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Globe size={20} color="#ffffff" />
            <h1 className="text-3xl sm:text-4xl tracking-tight flex items-center" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>
              Website Visibility Audit
              <InfoTip text="Runs an AI-powered audit of your website (URL or pasted text) against GEO readiness criteria - content structure, entity clarity, schema markup, and authority signals. Returns scored findings with prioritised recommendations." width={260} />
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>
            Score your site for AI agent visibility and citation.
          </p>
          <p className="text-[14px] font-light leading-relaxed mt-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.85)" }}>
            This assessment looks at your website the way AI search and answer engines now read it. We check the things that decide whether an engine will trust your site, understand what you do, and name you in its answers: how your content is structured, how clearly your brand and services are described, the behind-the-scenes markup that helps machines make sense of the page, and the signals that show you are a credible source.
          </p>
          <p className="text-[14px] font-light leading-relaxed mt-3 max-w-3xl" style={{ color: "rgba(255,255,255,0.85)" }}>
            You get a single readiness score and a short, prioritised list of fixes, so you can see exactly where you stand today and what to improve to be mentioned more often when people ask AI about your sector.
          </p>
        </div>
        <div className="rounded-xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
          <div>
            <label className="text-[13px] font-bold uppercase tracking-[0.14em] mb-3 flex items-center gap-2" style={{ color: vars.navy }}>
              <Globe size={18} style={{ color: vars.teal }} />
              Enter your homepage URL
            </label>
            <div className="mb-4">
              <div className="flex items-center gap-3 px-4 py-4 rounded-xl border-2 transition-colors focus-within:border-blue-400" style={{ borderColor: vars.g200, background: vars.g50 }}>
                <Globe size={20} style={{ color: vars.teal }} />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 text-[15px] bg-transparent outline-none font-medium"
                  style={{ color: vars.navy }}
                />
              </div>
              <p className="text-[12px] mt-2 flex items-start gap-1.5" style={{ color: vars.g400 }}>
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <span>We fetch your homepage automatically, along with its robots.txt and sitemap, and analyse them for AI visibility.</span>
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "#FBEEEC", color: "#B03D33" }}>
                {error}
              </div>
            )}
            {diagAuditLock.lastRunAt && (
              <div className="mb-4 p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: "#F5F7FA", borderLeft: "3px solid #1f748f", color: "#165265" }}>
                <Lock size={14} className="flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Last run: {new Date(diagAuditLock.lastRunAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {diagAuditLock.locked && diagAuditLock.daysRemaining && diagAuditLock.daysRemaining > 0 && (
                    <span className="font-light"> · next run available in {diagAuditLock.daysRemaining} day{diagAuditLock.daysRemaining === 1 ? "" : "s"}</span>
                  )}
                </div>
              </div>
            )}
            {/* Pre-run confirmation dialog */}
            {showDiagConfirm && (
              <div className="mb-4 p-4 rounded-lg border" style={{ background: "#FFFBF0", borderColor: "#E5A800" }}>
                <p className="text-sm font-medium mb-1" style={{ color: "#7A5800" }}>
                  {diagPendingForce ? "Force re-run this audit?" : "Run this audit?"}
                </p>
                <p className="text-xs font-light mb-3" style={{ color: "#7A5800" }}>
                  {diagPendingForce
                    ? "This will override the 21-day lock. Continue?"
                    : "This will fetch and analyse your website. It typically takes 15–30 seconds."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowDiagConfirm(false); handleRunDiagnostic(diagPendingForce); }}
                    className="px-4 py-1.5 rounded text-xs font-medium text-white"
                    style={{ background: "#1f748f" }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowDiagConfirm(false)}
                    className="px-4 py-1.5 rounded text-xs font-medium"
                    style={{ background: "#e8ecf0", color: "#165265" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              {diagAuditLock.locked && getLocalSession()?.role !== "admin" ? (
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium opacity-60 cursor-not-allowed" style={{ background: "#e8ecf0", color: "#165265" }}>
                  <Lock size={16} /> Audit locked
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { setDiagPendingForce(diagAuditLock.locked); setShowDiagConfirm(true); }}
                    disabled={loading || showDiagConfirm}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
                    style={{ background: "#1f748f" }}
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analysing with Claude...
                      </>
                    ) : (
                      <>
                        <Search size={16} /> {diagAuditLock.locked ? "Force Re-run Diagnostic" : "Run Diagnostic"}
                      </>
                    )}
                  </button>
                  {diagAuditLock.locked && (
                    <span className="text-xs font-light" style={{ color: "#B03D33" }}>Admin override</span>
                  )}
                </>
              )}
            </div>
            {loading && (
              <div className="mt-6 p-4 rounded-lg border" style={{ borderColor: vars.g200, background: "rgba(31,116,143,0.02)" }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: vars.accent }} />
                  <span className="text-sm font-medium" style={{ color: vars.navy }}>Running analysis</span>
                </div>
                <p className="text-xs font-light" style={{ color: vars.g500 }}>
                  Your website is being analysed alongside the figures measured directly from your page, to produce a comprehensive GEO authority score. This typically takes 15–30 seconds.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const statusColor = (s: string) => s === "pass" ? vars.green : s === "warn" ? vars.amber : vars.red;
  const statusLabel = (s: string) => s === "pass" ? "Strong" : s === "warn" ? "Needs Work" : "Critical";
  const statusIcon = (s: string) => s === "pass" ? CheckCircle2 : s === "warn" ? AlertTriangle : XCircle;

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ borderColor: vars.g200 }}>
        <div className="px-5 sm:px-8 py-5 sm:py-6" style={{ background: "linear-gradient(135deg, #165265 0%, #1f748f 60%, #2896b9 100%)" }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-10 sm:h-14" />
              <div className="hidden sm:block w-px h-10" style={{ background: "rgba(255,255,255,0.25)" }} />
              <div className="hidden sm:block">
                <p className="text-[12px] uppercase tracking-[0.15em] text-white/60 mb-0.5">Authority & Visibility Report</p>
                <p className="text-white text-lg font-medium" style={{ fontFamily: "'Alice', Georgia, serif" }}>GEO Diagnostic Analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {activeClient.logo ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/20 bg-white/90 px-4 py-3 min-w-[80px] sm:min-w-[100px]">
                  <img src={activeClient.logo} alt={`${activeClient.name} logo`} className="h-10 sm:h-14 max-w-[100px] object-contain" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-3 min-w-[80px] sm:min-w-[100px]" style={{ backdropFilter: "blur(8px)" }}>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center mb-1">
                    <Building2 size={18} className="text-white/40" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-white/50">Client Logo</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 sm:px-8 py-4" style={{ background: "white" }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-light leading-relaxed" style={{ color: vars.g500 }}>
                {result.summary}
              </p>
              {result.pagesFetched && result.pagesFetched.length > 0 && (
                <p className="text-[11px] mt-2 flex items-start gap-1" style={{ color: vars.g400 }}>
                  <Globe size={11} className="flex-shrink-0 mt-0.5" />
                  <span>Analysed {result.pagesFetched.length} live source{result.pagesFetched.length === 1 ? "" : "s"} from your site: {result.pagesFetched.map((p) => { try { return new URL(p).pathname === "/" ? "homepage" : new URL(p).pathname.replace(/^\//, ""); } catch { return p; } }).join(", ")}.</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 self-start flex-shrink-0">
              <button onClick={() => saveDiagnostic()} disabled={justSaved} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-95 disabled:cursor-default" style={{ background: "white", color: vars.navy, border: `1px solid ${vars.g200}` }}>
                {justSaved ? <CheckCircle2 size={14} color={vars.green} /> : <Save size={14} />} {justSaved ? "Saved" : "Save audit"}
              </button>
              <button onClick={() => { const s = document.createElement('style'); s.id = 'aio-print-fix'; s.textContent = '@media print { body, #root, [data-radix-scroll-area-viewport], .overflow-y-auto, .overflow-auto { overflow: visible !important; max-height: none !important; height: auto !important; } }'; document.head.appendChild(s); window.print(); setTimeout(() => { const el = document.getElementById('aio-print-fix'); if (el) el.remove(); }, 2000); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#1f748f" }}>
                <Download size={14} /> Print / PDF
              </button>
            </div>
          </div>
          {result.sources && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t" style={{ borderColor: vars.g100 }}>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
                {result.provider === "openai" ? "Engine: ChatGPT (backup)" : "Engine: Claude"}
              </span>
              {result.pageFacts && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium border" style={{ borderColor: vars.g200, color: vars.g500 }}>
                  Figures measured directly from your page
                </span>
              )}
              <span className="ml-auto text-[10px]" style={{ color: vars.g400 }}>
                {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="relative" style={{ width: 160, height: 160 }}>
              <svg width={160} height={160}>
                <circle cx={80} cy={80} r={70} fill="none" stroke={vars.g200} strokeWidth={12} />
                <circle cx={80} cy={80} r={70} fill="none"
                  stroke={result.overallScore >= 70 ? vars.green : result.overallScore >= 40 ? vars.amber : vars.red}
                  strokeWidth={12} strokeDasharray={`${(result.overallScore / 100) * 440} 440`}
                  strokeLinecap="round" transform="rotate(-90 80 80)" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold" style={{ color: vars.navy }}>{result.overallScore}</span>
                <span className="text-[14px] uppercase tracking-wider mt-1" style={{ color: vars.g400 }}>/100</span>
              </div>
            </div>
            <span className="text-[14px] font-semibold mt-2" style={{ color: vars.navy }}>Authority Score</span>
          </div>
          <div className="flex-1 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(result.categories || []).map((cat) => {
                const Icon = statusIcon(cat.status);
                return (
                  <div key={cat.name} className="p-4 rounded-xl border hover:shadow-md transition-shadow cursor-pointer hover:bg-slate-50" style={{ borderColor: vars.g200 }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon size={16} color={statusColor(cat.status)} />
                      <span className="text-[13px] font-semibold" style={{ color: statusColor(cat.status) }}>{statusLabel(cat.status)}</span>
                    </div>
                    <p className="text-[14px] font-medium truncate mb-1" style={{ color: vars.navy }}>{cat.name}</p>
                    <p className="text-2xl font-bold" style={{ color: vars.navy }}>{cat.score}<span className="text-[13px] font-normal" style={{ color: vars.g400 }}>/{cat.max}</span></p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {result.pageFacts && (() => {
        const f = result.pageFacts!;
        const altPct = f.imagesTotal > 0 ? Math.round((f.imagesWithAlt / f.imagesTotal) * 100) : 0;
        const yesNo = (b: boolean) => (b ? "Yes" : "No");
        const facts: Array<{ label: string; value: string }> = [
          { label: "Page title", value: f.metaTitle ? "Present" : "Missing" },
          { label: "Meta description", value: yesNo(f.hasMetaDescription) },
          { label: "Canonical URL", value: yesNo(f.hasCanonical) },
          { label: "Open Graph tags", value: String(f.openGraphTagCount) },
          { label: "Schema (JSON-LD) blocks", value: f.jsonLdBlockCount === 0 ? "None" : `${f.jsonLdBlockCount}${f.jsonLdTypes.length ? ` (${f.jsonLdTypes.join(", ")})` : ""}` },
          { label: "Microdata elements", value: String(f.microdataCount) },
          { label: "Headings (H1 / H2 / H3)", value: `${f.h1Count} / ${f.h2Count} / ${f.h3Count}` },
          { label: "Images with alt text", value: `${f.imagesWithAlt} of ${f.imagesTotal} (${altPct}%)` },
          { label: "Lists / tables", value: `${f.listCount} / ${f.tableCount}` },
          { label: "robots.txt", value: yesNo(f.hasRobotsTxt) },
          { label: "Sitemap URLs", value: f.sitemapUrlCount === null ? "No sitemap found" : String(f.sitemapUrlCount) },
        ];
        return (
          <div className="rounded-2xl border p-4 sm:p-6 mb-6 hover:shadow-sm transition-shadow" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[16px] font-bold uppercase tracking-[0.12em]" style={{ color: vars.navy }}>Measured On Your Page</h3>
            </div>
            <p className="text-[14px] font-light mb-4" style={{ color: vars.g500 }}>
              These figures are counted directly from your live page, not estimated. They are the same every time the page is checked.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {facts.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border hover:bg-slate-100 transition-colors" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <span className="text-[13px]" style={{ color: vars.g500 }}>{item.label}</span>
                  <span className="text-[13px] font-semibold text-right" style={{ color: vars.navy }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 border" style={{ borderColor: "#C2E5D2", background: "#F0FAF4" }}>
          <div className="flex items-center gap-2 mb-2">
            <Check size={14} color={vars.green} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.green }}>Strengths</span>
          </div>
          <ul className="space-y-1.5">
            {(result.strengths || []).map((s, i) => (
              <li key={i} className="text-xs leading-relaxed" style={{ color: vars.g600 }}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl p-4 border" style={{ borderColor: "#F5DCA0", background: "#FFFCF0" }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} color={vars.amber} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.amber }}>Warnings</span>
          </div>
          <ul className="space-y-1.5">
            {(result.warnings || []).map((w, i) => (
              <li key={i} className="text-xs leading-relaxed" style={{ color: vars.g600 }}>{w}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl p-4 border" style={{ borderColor: "#E8B5AE", background: "#FDF5F4" }}>
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={14} color={vars.red} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.red }}>Critical Gaps</span>
          </div>
          <ul className="space-y-1.5">
            {(result.criticalGaps || []).map((g, i) => (
              <li key={i} className="text-xs leading-relaxed" style={{ color: vars.g600 }}>{g}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <h3 className="text-[16px] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: vars.navy }}>Category Detail</h3>
        <div className="space-y-4">
          {(result.categories || []).map((cat) => (
            <div key={cat.name} className="rounded-xl border p-5 hover:shadow-md transition-shadow cursor-pointer hover:bg-slate-50" style={{ borderColor: vars.g200, background: vars.g50 }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-semibold" style={{ color: vars.navy }}>{cat.name}</span>
                  <span className="px-3 py-1 rounded-full text-[12px] font-bold" style={{ background: statusColor(cat.status) + "18", color: statusColor(cat.status) }}>
                    {cat.score}/{cat.max}
                  </span>
                </div>
              </div>
              {cat.findings.length > 0 && (
                <div className="mb-4">
                  <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: vars.g500 }}>Findings</p>
                  <ul className="space-y-1.5">
                    {cat.findings.map((f, i) => (
                      <li key={i} className="text-[14px] leading-relaxed flex items-start gap-2" style={{ color: vars.g600 }}>
                        <span className="mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: vars.g400 }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {cat.recommendations.length > 0 && (
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: vars.teal }}>Recommendations</p>
                  <ul className="space-y-1.5">
                    {cat.recommendations.map((r, i) => (
                      <li key={i} className="text-[14px] leading-relaxed flex items-start gap-2" style={{ color: vars.teal }}>
                        <ArrowRight size={14} className="mt-1 flex-shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {(result.priorityActions || []).length > 0 && (
        <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
          <h3 className="text-[16px] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: vars.navy }}>Priority Actions</h3>
          <div className="space-y-3">
            {(result.priorityActions || []).map((action, i) => {
              const prioColor = action.priority === "Critical" ? vars.red : action.priority === "High" ? vars.amber : vars.teal;
              return (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border hover:shadow-md transition-shadow cursor-pointer hover:bg-slate-50" style={{ borderColor: vars.g200 }}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-6 h-6 rounded-full border-4 flex-shrink-0" style={{ borderColor: prioColor }} />
                    <span className="text-[15px]" style={{ color: vars.navy }}>{action.action}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 ml-9 sm:ml-0">
                    <span className="px-3 py-1 rounded-full text-[12px] font-semibold" style={{ background: prioColor + "18", color: prioColor }}>{action.priority}</span>
                    <span className="px-3 py-1 rounded-full text-[12px] font-medium" style={{ background: vars.g100, color: vars.g600 }}>{action.timeframe}</span>
                    <span className="px-3 py-1 rounded-full text-[12px] font-medium" style={{ background: vars.g100, color: vars.g600 }}>{action.category}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => copyToClipboard(buildVibeCodePrompt(result), "vibe")} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border" style={{ borderColor: vars.navy, background: "white", color: vars.navy }}>
          {copiedKey === "vibe" ? <CheckCircle2 size={14} color={vars.green} /> : <ClipboardList size={14} />} {copiedKey === "vibe" ? "Copied" : "Copy Vibe Code Prompt"}
        </button>
        <button onClick={() => copyToClipboard(buildSeoImprovementsText(result), "seo")} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border" style={{ borderColor: vars.navy, background: "white", color: vars.navy }}>
          {copiedKey === "seo" ? <CheckCircle2 size={14} color={vars.green} /> : <ClipboardList size={14} />} {copiedKey === "seo" ? "Copied" : "Copy SEO Improvements"}
        </button>
        <button onClick={() => { setResult(null); setError(null); }} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:brightness-110" style={{ background: vars.navy }}>
          <Repeat size={14} /> Run New Diagnostic
        </button>
        <div className="flex items-center gap-2 sm:ml-auto">
          <button onClick={() => saveDiagnostic()} disabled={justSaved} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:brightness-95 disabled:cursor-default" style={{ background: "white", color: vars.navy, border: `1px solid ${vars.g200}` }}>
            {justSaved ? <CheckCircle2 size={14} color={vars.green} /> : <Save size={14} />} {justSaved ? "Saved" : "Save audit"}
          </button>
          <button onClick={() => { const s = document.createElement('style'); s.id = 'aio-print-fix'; s.textContent = '@media print { body, #root, [data-radix-scroll-area-viewport], .overflow-y-auto, .overflow-auto { overflow: visible !important; max-height: none !important; height: auto !important; } }'; document.head.appendChild(s); window.print(); setTimeout(() => { const el = document.getElementById('aio-print-fix'); if (el) el.remove(); }, 2000); }} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:brightness-110" style={{ background: vars.accent }}>
            <Download size={14} /> Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export { DiagnosticPage };

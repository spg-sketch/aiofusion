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
import { apiBase } from "../lib/contentAi";
import { contentGeoKey, techGeoKey, loadSavedScored, persistSavedScored, type SavedScored } from "../lib/diagnosticStore";
import type { Client } from "../lib/projectTypes";
import { getActiveProjectId } from "../IntakeForm";
function GeoContentPage({
  activeClient,
  pendingContentGeoId,
  onConsumePendingContentGeo,
}: {
  activeClient: Client;
  pendingContentGeoId?: string | null;
  onConsumePendingContentGeo?: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [showLLMBrief, setShowLLMBrief] = useState(false);
  const [savedContentGeo, setSavedContentGeo] = useState<SavedScored[]>(() => loadSavedScored(contentGeoKey(activeClient.id)));
  const [justSaved, setJustSaved] = useState(false);
  const corePages = [
    { url: "/about", title: "About Us", contentScore: 78, alignmentScore: 82, status: "Optimised" },
    { url: "/products", title: "Products & Solutions", contentScore: 64, alignmentScore: 71, status: "Needs work" },
    { url: "/services", title: "Services", contentScore: 71, alignmentScore: 76, status: "Optimised" },
    { url: "/leadership", title: "Leadership Team", contentScore: 58, alignmentScore: 62, status: "Needs work" },
    { url: "/case-studies", title: "Case Studies", contentScore: 81, alignmentScore: 79, status: "Optimised" },
    { url: "/insights", title: "Insights / Blog", contentScore: 69, alignmentScore: 73, status: "Needs work" },
  ];
  const recommendations = [
    { page: "/products", priority: "High", action: "Add structured product schema (Product + Offer markup) and Q&A snippets for top 5 questions.", impact: "+18 LLM citation likelihood" },
    { page: "/leadership", priority: "High", action: "Add Person schema with credentials, link spokesperson LinkedIn URLs from Project Set-Up 1.8.", impact: "+22 expert authority signal" },
    { page: "/about", priority: "Medium", action: "Embed core key messages from Project Set-Up 1.2 verbatim in opening paragraph.", impact: "+12 message consistency" },
    { page: "/services", priority: "Medium", action: "Add FAQ block answering top 8 buyer questions with conversational phrasing.", impact: "+15 answer-engine match" },
    { page: "/insights", priority: "Low", action: "Strengthen internal linking - add author-byline links pointing to leadership pages.", impact: "+8 internal authority graph" },
  ];
  const overall = Math.round(corePages.reduce((s, p) => s + (p.contentScore + p.alignmentScore) / 2, 0) / corePages.length);

  useEffect(() => {
    setSavedContentGeo(loadSavedScored(contentGeoKey(activeClient.id)));
    setHasResults(false);
    setScanning(false);
    setJustSaved(false);
  }, [activeClient.id]);

  useEffect(() => {
    if (!pendingContentGeoId) return;
    if (savedContentGeo.some((s) => s.id === pendingContentGeoId)) {
      setHasResults(true);
      setJustSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    onConsumePendingContentGeo?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingContentGeoId, savedContentGeo]);

  function saveContentGeo() {
    if (!hasResults || justSaved) return;
    const entry: SavedScored = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      score: overall,
    };
    const next = [entry, ...savedContentGeo];
    if (!persistSavedScored(contentGeoKey(activeClient.id), next)) {
      alert("Could not save this audit - your browser storage may be full. Try removing a few older saved audits.");
      return;
    }
    setSavedContentGeo(next);
    setJustSaved(true);
    window.dispatchEvent(new Event("aio:saved-audits-changed"));
  }

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl mb-2" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>Website Content GEO</h1>
        <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>Audit your site's core message pages, score AI-citation readiness, and generate an action report aligned to your Project Data (PR sections 2.5–2.7).</p>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => { setScanning(true); setJustSaved(false); setTimeout(() => { setScanning(false); setHasResults(true); }, 1100); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-medium text-white" style={{ background: vars.accent }}>
          <Search size={14} /> {hasResults ? "Re-scan Site" : "Scan Site Content"}
        </button>
        {hasResults && (
          <>
            <button onClick={saveContentGeo} disabled={justSaved} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-medium transition-all hover:brightness-95 disabled:cursor-default" style={{ background: "white", color: vars.navy, border: `1px solid ${vars.g200}` }}>
              {justSaved ? <CheckCircle2 size={14} color={vars.green} /> : <Save size={14} />} {justSaved ? "Saved" : "Save audit"}
            </button>
            <button onClick={() => { const s = document.createElement('style'); s.id = 'aio-print-fix'; s.textContent = '@media print { body, #root, [data-radix-scroll-area-viewport], .overflow-y-auto, .overflow-auto { overflow: visible !important; max-height: none !important; height: auto !important; } }'; document.head.appendChild(s); window.print(); setTimeout(() => { const el = document.getElementById('aio-print-fix'); if (el) el.remove(); }, 2000); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-medium text-white" style={{ background: "#1f748f" }}>
              <Download size={14} /> Print / PDF
            </button>
            <button onClick={() => alert("Recommendations pushed to PR Set-Up sections 2.5–2.7 (mock)")} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-medium" style={{ background: "white", color: vars.accent, border: `1px solid ${vars.accent}` }}>
              <Zap size={14} /> Push to Project Set-Up
            </button>
          </>
        )}
      </div>

      {scanning && (
        <div className="bg-white border rounded-xl p-8 text-center" style={{ borderColor: vars.g200 }}>
          <div className="text-[13px] font-medium" style={{ color: vars.accent }}>Scanning core message pages…</div>
        </div>
      )}

      {hasResults && !scanning && (
        <>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${vars.navy} 0%, #0e3a47 100%)` }}>
              <div className="text-[11px] uppercase tracking-wider opacity-80 mb-1">Overall Content GEO</div>
              <div className="text-4xl font-bold mb-1">{overall}<span className="text-lg opacity-70">/100</span></div>
              <div className="text-[11px] opacity-80">Across {corePages.length} core pages</div>
            </div>
            <div className="rounded-xl p-5 bg-white border" style={{ borderColor: vars.g200 }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: vars.g400 }}>Pages Optimised</div>
              <div className="text-4xl font-bold mb-1" style={{ color: vars.accent }}>{corePages.filter(p => p.status === "Optimised").length}<span className="text-lg" style={{ color: vars.g400 }}>/{corePages.length}</span></div>
              <div className="text-[11px]" style={{ color: vars.g500 }}>{corePages.filter(p => p.status === "Needs work").length} need work</div>
            </div>
            <div className="rounded-xl p-5 bg-white border" style={{ borderColor: vars.g200 }}>
              <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: vars.g400 }}>Action Items</div>
              <div className="text-4xl font-bold mb-1" style={{ color: vars.coral }}>{recommendations.length}</div>
              <div className="text-[11px]" style={{ color: vars.g500 }}>{recommendations.filter(r => r.priority === "High").length} high priority</div>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-6 mb-6" style={{ borderColor: vars.g200 }}>
            <h3 className="text-[15px] font-semibold mb-4" style={{ color: vars.navy }}>Core Page Scores</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr style={{ color: vars.g500 }} className="text-left border-b" >
                    <th className="py-2 pr-3 font-medium">Page</th>
                    <th className="py-2 pr-3 font-medium">URL</th>
                    <th className="py-2 pr-3 font-medium">Content Score</th>
                    <th className="py-2 pr-3 font-medium">Message Alignment</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {corePages.map(p => (
                    <tr key={p.url} className="border-b" style={{ borderColor: vars.g100 }}>
                      <td className="py-3 pr-3 font-medium" style={{ color: vars.navy }}>{p.title}</td>
                      <td className="py-3 pr-3 font-mono text-[11.5px]" style={{ color: vars.g500 }}>{p.url}</td>
                      <td className="py-3 pr-3"><span style={{ color: p.contentScore >= 75 ? vars.accent : p.contentScore >= 65 ? vars.gold : vars.coral }}>{p.contentScore}</span></td>
                      <td className="py-3 pr-3"><span style={{ color: p.alignmentScore >= 75 ? vars.accent : p.alignmentScore >= 65 ? vars.gold : vars.coral }}>{p.alignmentScore}</span></td>
                      <td className="py-3"><span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: p.status === "Optimised" ? "rgba(31,116,143,0.10)" : "rgba(224,120,86,0.12)", color: p.status === "Optimised" ? vars.accent : vars.coral }}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-6" style={{ borderColor: vars.g200 }}>
            <h3 className="text-[15px] font-semibold mb-4" style={{ color: vars.navy }}>Itemised Action Report</h3>
            <div className="space-y-3">
              {recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: vars.g50 }}>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0 mt-0.5" style={{ background: r.priority === "High" ? vars.coral : r.priority === "Medium" ? vars.gold : vars.accent, color: "white" }}>{r.priority}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-mono mb-1" style={{ color: vars.accent }}>{r.page}</div>
                    <div className="text-[13px] mb-1" style={{ color: vars.navy }}>{r.action}</div>
                    <div className="text-[11.5px] font-light" style={{ color: vars.g500 }}>Predicted impact: <span style={{ color: vars.accent }}>{r.impact}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!hasResults && !scanning && (
        <div className="bg-white border rounded-xl p-10 text-center" style={{ borderColor: vars.g200 }}>
          <Globe size={40} color={vars.g300} className="mx-auto mb-4" />
          <h3 className="text-[16px] font-semibold mb-2" style={{ color: vars.navy }}>Ready to scan</h3>
          <p className="text-[13px] font-light max-w-md mx-auto" style={{ color: vars.g500 }}>Click <strong>Scan Site Content</strong> to audit your core message pages against your Project Data PR sections 2.5–2.7 inputs and generate an itemised action report.</p>
        </div>
      )}

    </div>
  );
}


export { GeoContentPage };

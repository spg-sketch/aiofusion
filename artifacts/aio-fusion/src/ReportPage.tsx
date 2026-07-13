import { useState, useMemo, useEffect, useRef } from "react";
import InfoTip from "./InfoTip";
import { effectiveProjectId, loadPlannerProjects, scoreProject } from "./lib/contentStore";
import { getSpokespeople, getKeyMessages } from "./IntakeForm";
import { loadSavedAudits, authorityIndexFor, type SavedAudit } from "./LlmCheckPage";
import { loadSavedDiagnostics, type SavedDiagnostic } from "./lib/diagnosticStore";
import { syncAuditsForProject, syncDiagnosticsForProject } from "./lib/auditSync";
import { apiBase } from "./lib/contentAi";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import {
  Download,
  Printer,
  Share2,
  TrendingUp,
  TrendingDown,
  Check,
  AlertTriangle,
  X,
  Shield,
  FileText,
  BarChart3,
  CheckCircle2,
  Clock,
  ArrowRight,
  Eye,
  Search,
  Plus,
  Trash2,
  Sparkles,
  Calendar,
  Globe,
  PieChart,
  Loader2,
} from "lucide-react";

const vars = {
  navy: "#0a1628",
  accent: "#C8497A",
  teal: "#C8497A",
  green: "#3D9B6B",
  amber: "#D4922A",
  red: "#C94A3E",
  coral: "#C8497A",
  gold: "#C9A04E",
  cream: "#f8fafc",
  g50: "#f8fafc",
  g100: "#f1f5f9",
  g200: "#e2e8f0",
  g300: "#cbd5e1",
  g400: "#64748B",
  g500: "#475569",
  g600: "#334155",
};

type Client = {
  id: string;
  name: string;
  sector: string;
  initials: string;
  color: string;
  contentCount: number;
  avgScore: number;
  scoreTrend: number;
  activePlans: number;
  lastActive: string;
  recentActivity: string;
};

const CONTENT_TYPES = [
  "Press Release",
  "Article (Trade Publication)",
  "Case Study",
  "Whitepaper",
  "Blog Post",
  "Social Post",
  "Event Copy",
  "Speaker Submission",
  "Award Submission",
  "Directory Entry",
];

const REGIONS = ["UK", "North America", "EMEA", "Global"];

type TrackerRow = {
  id: string;
  date: string;
  title: string;
  type: string;
  publication: string;
  category: string;
  spokesperson: string;
  link: string;
  reach: number;
  score: number;
};

const TRACKER_KEY = "aio.earnedTracker.v2";
const seedTracker: TrackerRow[] = [];

// Each client/project gets its own tracker bucket so earned-media rows never
// bleed between accounts. The "default" project keeps the original bare key
// (so any pre-existing data isn't silently orphaned); every other project
// gets a dedicated `TRACKER_KEY::projectId` key, starting empty rather than
// inheriting the shared bare-key data (see contentStore.ts scoping pattern).
function trackerKey(clientId?: string): string {
  const pid = effectiveProjectId(clientId);
  return pid === "default" ? TRACKER_KEY : `${TRACKER_KEY}::${pid}`;
}

function loadTracker(clientId?: string): TrackerRow[] {
  const key = trackerKey(clientId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(seedTracker));
      return seedTracker;
    }
    return JSON.parse(raw) as TrackerRow[];
  } catch {
    return seedTracker;
  }
}

function saveTracker(rows: TrackerRow[], clientId?: string) {
  try { localStorage.setItem(trackerKey(clientId), JSON.stringify(rows)); } catch { /* ignore */ }
}

function ScoreBar({ label, score, max, description }: { label: string; score: number; max: number; description: string }) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 70 ? vars.green : pct >= 40 ? vars.amber : vars.red;
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium" style={{ color: vars.navy }}>{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{score}/{max}</span>
      </div>
      <div className="w-full h-2.5 rounded-full mb-1" style={{ background: vars.g200 }}>
        <div className="h-2.5 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[12.5px] font-light" style={{ color: vars.g600 }}>{description}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "pass" | "warn" | "fail" | "pending" }) {
  const config = {
    pass: { bg: "#EFF7F2", color: vars.green, icon: Check, text: "Pass" },
    warn: { bg: "#FFF8EC", color: vars.amber, icon: AlertTriangle, text: "Needs Work" },
    fail: { bg: "#FBEEEC", color: vars.red, icon: X, text: "Missing" },
    pending: { bg: vars.g100, color: vars.g400, icon: Clock, text: "Pending" },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: c.bg, color: c.color }}>
      <Icon size={12} /> {c.text}
    </span>
  );
}

function StatTile({ label, value, sub, color, icon: Icon }: { label: string; value: string; sub?: string; color?: string; icon?: any }) {
  return (
    <div className="rounded-xl border-2 p-4 bg-white transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:ring-[3px] hover:ring-[#C8497A]" style={{ borderColor: "#C8497A" }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g400 }}>{label}</p>
        {Icon && <Icon size={14} color={color || vars.accent} />}
      </div>
      <p className="text-2xl font-bold mt-1" style={{ color: color || vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{value}</p>
      {sub && <p className="text-[11px] font-light" style={{ color: vars.g500 }}>{sub}</p>}
    </div>
  );
}

function CalloutBrief({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] border-2 transition-colors"
        style={{ borderColor: "#C8497A", color: open ? "white" : "#C8497A", background: open ? "#C8497A" : "white" }}
      >
        <Sparkles size={12} /> {open ? `Hide ${title}` : title}
      </button>
      {open && (
        <div className="mt-2 rounded-xl p-3 sm:p-4" style={{ background: "#FBE3ED", border: "1px solid rgba(200,73,122,0.3)" }}>
          <div className="text-[12px] font-light italic leading-relaxed space-y-2" style={{ color: "#102B36" }}>{children}</div>
        </div>
      )}
    </div>
  );
}

export default function ReportPage({ activeClient, onNavigate }: { activeClient: Client; onNavigate?: (page: string) => void }) {
  const [activeTab, setActiveTab] = useState<"summary" | "prmkt" | "tracker" | "geo">("summary");
  const projectStartDate = "2026-01-08";
  const todayIso = new Date().toISOString().slice(0, 10);

  // ── Live audit data — loaded from localStorage, then synced from server ──
  const [savedAudits, setSavedAudits] = useState<SavedAudit[]>(() => loadSavedAudits(activeClient.id));
  const [savedDiagnostics, setSavedDiagnostics] = useState<SavedDiagnostic[]>(() => loadSavedDiagnostics(activeClient.id));

  useEffect(() => {
    // Load from localStorage immediately so the page renders with local data,
    // then pull from the server and refresh with the merged (shared) history.
    setSavedAudits(loadSavedAudits(activeClient.id));
    setSavedDiagnostics(loadSavedDiagnostics(activeClient.id));
    void Promise.all([
      syncAuditsForProject(activeClient.id),
      syncDiagnosticsForProject(activeClient.id),
    ]).then(([audits, diags]) => {
      setSavedAudits(audits);
      setSavedDiagnostics(diags);
    });
  }, [activeClient.id]);

  // Re-read from localStorage whenever an audit or diagnostic is saved/deleted
  // anywhere in the app (LlmCheckPage, Sidebar, DiagnosticPage, etc. all fire
  // this event after updating localStorage). Without this listener the stat
  // tiles on ReportPage show stale numbers until the user switches project.
  useEffect(() => {
    const handler = () => {
      setSavedAudits(loadSavedAudits(activeClient.id));
      setSavedDiagnostics(loadSavedDiagnostics(activeClient.id));
    };
    window.addEventListener("aio:saved-audits-changed", handler);
    return () => window.removeEventListener("aio:saved-audits-changed", handler);
  }, [activeClient.id]);

  const latestAudit = savedAudits.length > 0 ? savedAudits[0] : null;
  const previousAudit = savedAudits.length > 1 ? savedAudits[1] : null;

  const latestDiagnostic = savedDiagnostics.length > 0 ? savedDiagnostics[0] : null;
  const previousDiagnostic = savedDiagnostics.length > 1 ? savedDiagnostics[1] : null;

  const earnedScore: number | null = latestAudit ? authorityIndexFor(latestAudit.result) : null;
  const websiteScore: number | null = latestDiagnostic?.result.overallScore ?? null;
  const authorityScore = earnedScore !== null && websiteScore !== null
    ? Math.round((earnedScore + websiteScore) / 2)
    : earnedScore ?? websiteScore ?? 0;

  const [rangeFrom, setRangeFrom] = useState(projectStartDate);
  const [rangeTo, setRangeTo] = useState(todayIso);

  const reportDate = (() => {
    const d = new Date(`${rangeTo}T00:00:00`);
    if (isNaN(d.getTime())) return new Date(`${todayIso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  })();

  // Track which project ID the current tracker snapshot belongs to.
  // The save effect must ONLY depend on `tracker` — not on `activeClient.id` —
  // so that when the user switches projects the old project's rows are never
  // written to the new project's key before the load effect has had a chance
  // to populate `tracker` with the new project's data.
  const trackerProjectIdRef = useRef(activeClient.id);
  const [tracker, setTracker] = useState<TrackerRow[]>(() => loadTracker(activeClient.id));
  useEffect(() => {
    trackerProjectIdRef.current = activeClient.id;
    setTracker(loadTracker(activeClient.id));
  }, [activeClient.id]);
  useEffect(() => { saveTracker(tracker, trackerProjectIdRef.current); }, [tracker]);

  const inRange = useMemo(() => tracker.filter(r => r.date >= rangeFrom && r.date <= rangeTo), [tracker, rangeFrom, rangeTo]);
  const earnedRowsForCoverage = useMemo(() =>
    inRange.filter(r => ["Press Release", "Article (Trade Publication)", "Case Study", "Whitepaper"].includes(r.type)),
    [inRange]);

  // Guard against NaN/null scores that can result from AI-search items whose
  // scores object was empty — JSON serialises NaN as null and null coerces to
  // 0 but the guard makes the intent explicit and fixes existing bad rows.
  const safeScore = (r: TrackerRow) => (typeof r.score === "number" && isFinite(r.score) ? r.score : 0);
  const safeReach = (r: TrackerRow) => (typeof r.reach === "number" && isFinite(r.reach) ? r.reach : 0);
  const audienceReach = inRange.reduce((s, r) => s + safeReach(r), 0);
  const authorityPerPiece = inRange.length ? Math.round((inRange.reduce((s, r) => s + safeScore(r), 0) / inRange.length) * 10) / 10 : 0;
  const earnedAuthorityScore = Math.min(100, Math.round(inRange.reduce((s, r) => s + safeScore(r) * (["Press Release", "Article (Trade Publication)"].includes(r.type) ? 2 : 1), 0)));
  const prCoverageCount = earnedRowsForCoverage.length;

  // ── Date-range-aware trend: compare current period to the prior period of equal length ──
  const priorRangeTo = rangeFrom;
  const priorRangeFrom = useMemo(() => {
    const fromMs = new Date(`${rangeFrom}T00:00:00`).getTime();
    const toMs = new Date(`${rangeTo}T00:00:00`).getTime();
    const duration = toMs - fromMs;
    return new Date(fromMs - duration).toISOString().slice(0, 10);
  }, [rangeFrom, rangeTo]);
  const priorInRange = useMemo(
    () => tracker.filter(r => r.date >= priorRangeFrom && r.date < priorRangeTo),
    [tracker, priorRangeFrom, priorRangeTo],
  );
  const priorEarnedAuthorityScore = Math.min(100, Math.round(
    priorInRange.reduce((s, r) => s + safeScore(r) * (["Press Release", "Article (Trade Publication)"].includes(r.type) ? 2 : 1), 0)
  ));
  const trackerTrendDelta: number | null = (inRange.length > 0 || priorInRange.length > 0)
    ? earnedAuthorityScore - priorEarnedAuthorityScore
    : null;

  // ── Category breakdown, straight from the latest Website Visibility audit ──
  const diagnosticCategories = latestDiagnostic?.result.categories ?? [];
  const categoryScores = diagnosticCategories.map((c) => ({
    label: c.name,
    score: c.score,
    max: c.max,
    description: c.findings[0] || c.recommendations[0] || "No findings recorded for this category yet.",
  }));

  const geoTechCategories = diagnosticCategories.filter((c) => c.name === "Schema & Structured Data" || c.name === "Technical Accessibility");
  const geoContentCategories = diagnosticCategories.filter((c) => c.name === "Content Architecture" || c.name === "Source Authority");

  const websiteGeoScores = {
    tech: geoTechCategories.map((c) => ({ label: c.name, score: c.score, max: c.max, desc: c.findings[0] || c.recommendations[0] || "No findings recorded yet." })),
    content: geoContentCategories.map((c) => ({ label: c.name, score: c.score, max: c.max, desc: c.findings[0] || c.recommendations[0] || "No findings recorded yet." })),
  };

  // ── LLM Scorecard: ChatGPT + Claude only, from the latest Earned Media audit ──
  const llmScorecard = latestAudit
    ? (["chatgpt", "claude"] as const).map((key) => {
        const m = latestAudit.result.byModel[key];
        const prevM = previousAudit?.result.byModel[key];
        return {
          platform: key === "chatgpt" ? "ChatGPT" : "Claude",
          mentions: m.mentions,
          cited: m.mentions > 0,
          rate: m.rate,
          trend: prevM ? Math.round(m.rate - prevM.rate) : 0,
        };
      })
    : [];

  // ── Technical / Content checklists, built from the audit's own findings ──
  function auditRows(cats: typeof diagnosticCategories) {
    return cats.flatMap((c) =>
      c.findings.length > 0
        ? c.findings.map((f, i) => ({ id: `${c.name}-${i}`, item: c.name, status: c.status as "pass" | "warn" | "fail", detail: f }))
        : [{ id: c.name, item: c.name, status: c.status as "pass" | "warn" | "fail", detail: c.recommendations[0] || "No findings recorded yet." }],
    );
  }
  const technicalAudit = auditRows(geoTechCategories);
  const contentAudit = auditRows(geoContentCategories);

  // ── Authority trend, built only from dates we actually have audit/diagnostic runs for ──
  function valueAsOf<T extends { savedAt: string }>(list: T[], dateStr: string, pick: (item: T) => number): number | null {
    let result: number | null = null;
    for (const item of list) {
      if (item.savedAt.slice(0, 10) <= dateStr) result = pick(item);
      else break;
    }
    return result;
  }
  const auditsByDate = [...savedAudits].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  const diagsByDate = [...savedDiagnostics].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  const trendDates = Array.from(new Set([
    ...auditsByDate.map((a) => a.savedAt.slice(0, 10)),
    ...diagsByDate.map((d) => d.savedAt.slice(0, 10)),
  ])).sort().slice(-6);

  const monthlyTrend = trendDates.map((dateStr) => {
    const earned = valueAsOf(auditsByDate, dateStr, (a) => authorityIndexFor(a.result));
    const web = valueAsOf(diagsByDate, dateStr, (d) => d.result.overallScore);
    const total = earned !== null && web !== null ? Math.round((earned + web) / 2) : earned ?? web ?? 0;
    const label = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { m: label, total, earned: earned ?? 0, web: web ?? 0 };
  });
  const trendMax = monthlyTrend.length ? Math.max(...monthlyTrend.flatMap(p => [p.total, p.earned, p.web])) + 4 : 100;

  // ── Real trend stats for the summary tiles, instead of fixed demo numbers ──
  const authorityTrendDelta = monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 1].total - monthlyTrend[0].total : null;
  const earnedTrendDelta = latestAudit && previousAudit ? Math.round(authorityIndexFor(latestAudit.result) - authorityIndexFor(previousAudit.result)) : null;
  const websiteTrendDelta = latestDiagnostic && previousDiagnostic ? latestDiagnostic.result.overallScore - previousDiagnostic.result.overallScore : null;
  const livePlannerProjects = useMemo(() => loadPlannerProjects(activeClient.id), [activeClient.id]);
  const predictedEarnedAuthority = livePlannerProjects.length
    ? Math.round(livePlannerProjects.reduce((s, p) => s + scoreProject(p).authority, 0) / livePlannerProjects.length)
    : null;

  const clientKeyMessages = useMemo(
    () => getKeyMessages().filter(km => km.short !== "Primary message not yet set" && (km.short || km.long).trim()),
    // re-read when the active client changes so we pick up the correct project's intake data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeClient.id],
  );

  const messageCoverage = useMemo(() => {
    return clientKeyMessages.map(km => {
      const label = km.short || km.long;
      const keywords = label.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
      const matches = earnedRowsForCoverage.filter(r =>
        keywords.length === 0 || keywords.some(k => r.title.toLowerCase().includes(k)),
      );
      return {
        msg: label,
        n: matches.length,
        articles: matches.filter(r => r.type === "Article (Trade Publication)").length,
        prs: matches.filter(r => r.type === "Press Release").length,
      };
    });
  }, [clientKeyMessages, earnedRowsForCoverage]);

  const volByType = useMemo(() => {
    const tally = new Map<string, number>();
    inRange.forEach(r => tally.set(r.type, (tally.get(r.type) || 0) + 1));
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const volByCategory = useMemo(() => {
    const tally = new Map<string, number>();
    inRange.forEach(r => tally.set(r.category || "-", (tally.get(r.category || "-") || 0) + 1));
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const volBySpokesperson = useMemo(() => {
    const tally = new Map<string, number>();
    inRange.forEach(r => tally.set(r.spokesperson || "-", (tally.get(r.spokesperson || "-") || 0) + 1));
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const projectSpokespeople = useMemo(() => getSpokespeople(), []);
  const socialImpactPeople = useMemo(() => ["Company LinkedIn", ...projectSpokespeople.map(s => s.name).filter(Boolean)], [projectSpokespeople]);

  const socialImpactBySpokesperson: Record<string, { shares: string; engagement: string; dms: string; profileViews: string }> = useMemo(() => {
    const map: Record<string, { shares: string; engagement: string; dms: string; profileViews: string }> = {
      "Company LinkedIn": { shares: "1,820", engagement: "4.2%", dms: "37", profileViews: "612" },
    };
    projectSpokespeople.forEach((s) => {
      if (!s.name) return;
      let seed = 0;
      for (let i = 0; i < s.name.length; i++) seed = (seed * 31 + s.name.charCodeAt(i)) % 10_000;
      map[s.name] = {
        shares: String(300 + (seed % 900)),
        engagement: `${(2 + (seed % 300) / 100).toFixed(1)}%`,
        dms: String(5 + (seed % 40)),
        profileViews: String(150 + (seed % 500)),
      };
    });
    return map;
  }, [projectSpokespeople]);

  const [socialImpactPerson, setSocialImpactPerson] = useState<string>("Company LinkedIn");
  useEffect(() => {
    if (!socialImpactPeople.includes(socialImpactPerson)) setSocialImpactPerson("Company LinkedIn");
  }, [socialImpactPeople, socialImpactPerson]);
  const socialImpactStats = socialImpactBySpokesperson[socialImpactPerson] || socialImpactBySpokesperson["Company LinkedIn"];

  const prRows = useMemo(() => inRange.filter(r => r.type === "Press Release"), [inRange]);
  const prAvgScore = prRows.length ? Math.round((prRows.reduce((s, r) => s + r.score, 0) / prRows.length) * 10) / 10 : 0;

  const tabs = [
    { id: "summary" as const, label: "Executive Summary" },
    { id: "prmkt" as const, label: "PR & Marketing" },
    { id: "tracker" as const, label: "Earned Media Tracker" },
    { id: "geo" as const, label: "Website GEO & Technical" },
  ];

  // ---- Earned Media Tracker form state ----
  const [aiSearch, setAiSearch] = useState({ from: rangeFrom, to: rangeTo, region: "UK", project: activeClient.name, spokesperson: "", contentTitle: "" });
  const [aiResults, setAiResults] = useState<Array<{ title: string; type: string; publication: string; reach: number; scores: Record<string, number>; link: string }>>([]);
  const [aiSearched, setAiSearched] = useState(false);
  const [aiSearching, setAiSearching] = useState(false);
  const [aiSearchError, setAiSearchError] = useState<string | null>(null);

  // ---- Tracker spreadsheet search/filter state ----
  const trackerFilterDefaults = { from: "", to: "", type: "All", message: "", spokesperson: "All", category: "All", mediaTitle: "All" };
  const [trackerFilter, setTrackerFilter] = useState(trackerFilterDefaults);
  const uniqueSpokespersons = useMemo(() => Array.from(new Set(tracker.map(r => r.spokesperson).filter(Boolean))).sort(), [tracker]);
  const uniqueCategories = useMemo(() => Array.from(new Set(tracker.map(r => r.category).filter(Boolean))).sort(), [tracker]);
  const uniqueMediaTitles = useMemo(() => Array.from(new Set(tracker.map(r => r.publication).filter(Boolean))).sort(), [tracker]);
  const filteredTracker = useMemo(() => {
    const msg = trackerFilter.message.trim().toLowerCase();
    return tracker.filter(r => {
      if (trackerFilter.from && r.date < trackerFilter.from) return false;
      if (trackerFilter.to && r.date > trackerFilter.to) return false;
      if (trackerFilter.type !== "All" && r.type !== trackerFilter.type) return false;
      if (trackerFilter.spokesperson !== "All" && r.spokesperson !== trackerFilter.spokesperson) return false;
      if (trackerFilter.category !== "All" && r.category !== trackerFilter.category) return false;
      if (trackerFilter.mediaTitle !== "All" && r.publication !== trackerFilter.mediaTitle) return false;
      if (msg && !r.title.toLowerCase().includes(msg)) return false;
      return true;
    });
  }, [tracker, trackerFilter]);
  const hasActiveTrackerFilters =
    trackerFilter.from !== "" ||
    trackerFilter.to !== "" ||
    trackerFilter.type !== "All" ||
    trackerFilter.message.trim() !== "" ||
    trackerFilter.spokesperson !== "All" ||
    trackerFilter.category !== "All" ||
    trackerFilter.mediaTitle !== "All";

  const [manualForm, setManualForm] = useState<Omit<TrackerRow, "id">>({
    date: new Date().toISOString().slice(0, 10),
    title: "",
    type: CONTENT_TYPES[0],
    publication: "",
    category: "",
    spokesperson: "",
    link: "",
    reach: 0,
    score: 7,
  });

  async function runAiSearch() {
    if (aiSearching) return;
    setAiSearching(true);
    setAiSearched(false);
    setAiSearchError(null);
    setAiResults([]);
    try {
      const resp = await fetch(`${apiBase()}/api/content/coverage-search`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName:  aiSearch.project || activeClient.name,
          dateFrom:     aiSearch.from,
          dateTo:       aiSearch.to,
          region:       aiSearch.region,
          spokesperson: aiSearch.spokesperson,
          contentTitle: aiSearch.contentTitle,
        }),
      });
      const data = await resp.json() as { items?: typeof aiResults; error?: string };
      if (!resp.ok) {
        setAiSearchError(data.error ?? "The search could not complete. Please try again.");
      } else {
        setAiResults(Array.isArray(data.items) ? data.items : []);
        setAiSearched(true);
      }
    } catch {
      setAiSearchError("Network error — please check your connection and try again.");
    } finally {
      setAiSearching(false);
    }
  }

  function addAiResultToTracker(r: typeof aiResults[number]) {
    const scoreVals = Object.values(r.scores).filter((v) => typeof v === "number" && isFinite(v));
    const avgScore = scoreVals.length > 0
      ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length)
      : 5;
    const newRow: TrackerRow = {
      id: `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString().slice(0, 10),
      title: r.title,
      type: r.type === "Article" ? "Article (Trade Publication)" : r.type,
      publication: r.publication,
      category: "Marketing & PR",
      spokesperson: aiSearch.project,
      link: r.link,
      reach: r.reach,
      score: avgScore,
    };
    setTracker(prev => [newRow, ...prev]);
  }

  function addManualRow() {
    if (!manualForm.title.trim()) {
      alert("Please add a Content Title before saving.");
      return;
    }
    const row: TrackerRow = { ...manualForm, id: `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    setTracker(prev => [row, ...prev]);
    setManualForm(f => ({ ...f, title: "", publication: "", link: "", reach: 0 }));
  }

  function removeRow(id: string) {
    setTracker(prev => prev.filter(r => r.id !== id));
  }

  function downloadTrackerCsv() {
    const cols = ["Date", "Title", "Type", "Publication", "Category", "Spokesperson", "Reach", "Score", "Link"];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [cols.map(esc).join(",")];
    for (const r of tracker) {
      rows.push([r.date, r.title, r.type, r.publication, r.category, r.spokesperson, r.reach, r.score, r.link].map(esc).join(","));
    }
    const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `earned-media-tracker-${activeClient.name.replace(/\s+/g, "-").toLowerCase()}.csv`);
  }

  async function downloadTrackerDocx() {
    const COLS = ["Date", "Title", "Type", "Publication", "Category", "Spokesperson", "Reach", "Score", "Link"];
    const pct = (n: number) => Math.round((n / 9) * 100 * 100) / 100;

    const headerCells = COLS.map(h =>
      new TableCell({
        width: { size: pct(1), type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })], alignment: AlignmentType.LEFT })],
      }),
    );

    const dataRows = tracker.map(r =>
      new TableRow({
        children: [r.date, r.title, r.type, r.publication, r.category, r.spokesperson, String(r.reach.toLocaleString()), `${r.score}/10`, r.link].map(
          cell =>
            new TableCell({
              width: { size: pct(1), type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18 })] })],
            }),
        ),
      }),
    );

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: "Earned Media Tracker", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Client: ${activeClient.name}`, children: [new TextRun({ text: `Client: ${activeClient.name}`, size: 20, bold: false })] }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: headerCells, tableHeader: true }), ...dataRows],
          }),
        ],
      }],
    });

    const buffer = await Packer.toBlob(doc);
    saveAs(buffer, `earned-media-tracker-${activeClient.name.replace(/\s+/g, "-").toLowerCase()}.docx`);
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <PieChart size={24} color="#ffffff" />
            <h1 className="text-3xl sm:text-4xl tracking-tight flex items-center" style={{ color: "#ffffff", fontFamily: "'Alice', Georgia, serif" }}>
              Measure &amp; Report
              <InfoTip text="Combines diagnostic scores, earned media authority, planned activity, the Earned Media Tracker and the website GEO audit. Designed to be exported and shared with the client." width={260} />
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: "rgba(255,255,255,0.85)" }}>
            Authority &amp; Activity Report &middot; {activeClient.name} &middot; Generated {reportDate}
          </p>
          <p className="text-[14px] font-light mt-3 max-w-3xl leading-relaxed" style={{ color: "#ffffff" }}>
            This is your shareable scorecard for the whole project. It pulls your audit scores, earned media and planned activity into one place so you can see how your AI authority is growing over time. Clear measurement shows what is working and proves the impact of your AIO strategy to clients and stakeholders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-md hover:brightness-110 active:scale-95"
            style={{ background: vars.navy }}
          >
            <Printer size={16} /> Print
          </button>
          <button
            onClick={() => {
              const shareData = {
                title: `AIO Fusion – Authority & Activity Report · ${activeClient.name}`,
                text: "Here is the AIO Fusion Measure & Report scorecard.",
                url: window.location.href,
              };
              if (navigator.share && navigator.canShare?.(shareData)) {
                void navigator.share(shareData);
              } else {
                void navigator.clipboard.writeText(window.location.href).then(() => {
                  alert("Link copied to clipboard.");
                });
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-md hover:brightness-110 active:scale-95"
            style={{ background: vars.navy }}
          >
            <Share2 size={16} /> Share
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-md hover:brightness-110 active:scale-95"
            style={{ background: vars.accent }}
          >
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 rounded-xl mb-6" style={{ background: vars.navy }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-3 rounded-lg text-[13px] font-semibold transition-all hover:bg-white/15"
            style={{
              background: activeTab === tab.id ? vars.accent : "transparent",
              color: activeTab === tab.id ? "white" : "rgba(255,255,255,0.6)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============== EXECUTIVE SUMMARY ============== */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="rounded-xl p-4 sm:p-6 mb-5" style={{ background: "linear-gradient(135deg, #A8305A, #C8497A)" }}>
              <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
                <div className="flex flex-col items-center">
                  <div className="relative" style={{ width: 140, height: 140 }}>
                    <svg width={140} height={140}>
                      <circle cx={70} cy={70} r={58} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={10} />
                      <circle cx={70} cy={70} r={58} fill="none"
                        stroke={authorityScore >= 70 ? "#5FD89A" : authorityScore >= 40 ? "#F5C842" : "#E8695A"}
                        strokeWidth={10} strokeDasharray={`${(authorityScore / 100) * 364} 364`}
                        strokeLinecap="round" transform="rotate(-90 70 70)" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold text-white">{authorityScore}</span>
                      <span className="text-[10px] text-white/60 uppercase tracking-wider">/100</span>
                    </div>
                  </div>
                  <span className="text-xs text-white/70 mt-2 font-medium">Total Authority Score</span>
                  <span className="text-[10px] text-white/60 mt-0.5">Since {projectStartDate}</span>
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-lg sm:text-xl font-semibold text-white mb-2" style={{ fontFamily: "'Alice', Georgia, serif" }}>
                    {authorityScore >= 70 ? "Strong authority position" : authorityScore >= 40 ? "Moderate authority - room to grow" : "Early stage - significant opportunities"}
                  </h2>
                  <p className="text-sm text-white/75 leading-relaxed mb-4">
                    {activeClient.name} currently scores {authorityScore}/100. This combines earned media authority and your website&rsquo;s technical &amp; content readiness for AI citation.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="px-3 py-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ background: "#FBE3ED" }}>
                      <span className="text-[10px] block uppercase tracking-wider" style={{ color: "#8A3355" }}>Earned</span>
                      <span className="text-lg font-bold" style={{ color: "#102B36" }}>{earnedScore ?? "-"}/100</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ background: "#FBE3ED" }}>
                      <span className="text-[10px] block uppercase tracking-wider" style={{ color: "#8A3355" }}>Website</span>
                      <span className="text-lg font-bold" style={{ color: "#102B36" }}>{websiteScore ?? "-"}/100</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg" style={{ background: "#FBE3ED" }}>
                      <span className="text-[10px] block uppercase tracking-wider" style={{ color: "#8A3355" }}>Authority trend</span>
                      <span className="text-lg font-bold flex items-center gap-1" style={{ color: "#102B36" }}>
                        {authorityTrendDelta === null ? "New" : (
                          <>
                            {authorityTrendDelta >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {authorityTrendDelta >= 0 ? "+" : ""}{authorityTrendDelta}
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5 p-4 rounded-xl" style={{ background: vars.navy }}>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: "#ffffff" }}>Date Range - From</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: "#ffffff" }}>Date Range - To</label>
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: vars.g200 }} />
              </div>
              <button onClick={() => { setRangeFrom(projectStartDate); setRangeTo(todayIso); }} className="px-4 py-2 rounded-lg text-sm font-medium border bg-white" style={{ borderColor: vars.g200, color: vars.g600 }}>
                Reset to project start
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <StatTile
                label="Total Authority Trend"
                value={authorityTrendDelta === null ? "New" : `${authorityTrendDelta >= 0 ? "+" : ""}${authorityTrendDelta}`}
                sub="vs earliest tracked run"
                color={authorityTrendDelta !== null && authorityTrendDelta < 0 ? vars.red : vars.green}
                icon={TrendingUp}
              />
              <StatTile
                label="Earned Media Trend"
                value={earnedTrendDelta === null ? "New" : `${earnedTrendDelta >= 0 ? "+" : ""}${earnedTrendDelta}`}
                sub="from Earned Media audits"
                color={earnedTrendDelta !== null && earnedTrendDelta < 0 ? vars.red : vars.green}
                icon={Eye}
              />
              <StatTile
                label="Website Trend"
                value={websiteTrendDelta === null ? "New" : `${websiteTrendDelta >= 0 ? "+" : ""}${websiteTrendDelta}`}
                sub="from Website Visibility audits"
                color={websiteTrendDelta !== null && websiteTrendDelta < 0 ? vars.red : vars.green}
                icon={Globe}
              />
              <StatTile
                label="Predicted Earned Authority"
                value={predictedEarnedAuthority === null ? "N/A" : String(predictedEarnedAuthority)}
                sub={predictedEarnedAuthority === null ? "add items to Comms Planner" : "avg. from active Comms Planner items"}
                color={vars.accent}
                icon={Sparkles}
              />
              <StatTile label="PR Coverage" value={String(prCoverageCount)} sub="PR / Article / Case Study / Whitepaper" color={vars.accent} icon={FileText} />
            </div>

            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Authority trend</h3>
            <div className="rounded-xl border p-4 mb-6" style={{ borderColor: vars.g200 }}>
              {monthlyTrend.length === 0 ? (
                <p className="text-[13px] font-light py-6 text-center" style={{ color: vars.g500 }}>
                  Run an Earned Media or Website Visibility audit to start tracking your authority trend.
                </p>
              ) : (
                <>
                  <div className="flex items-end gap-2 h-40">
                    {monthlyTrend.map((p, i) => (
                      <div key={`${p.m}-${i}`} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full flex items-end gap-0.5 h-full">
                          <div className="flex-1 rounded-t" style={{ height: `${(p.total / trendMax) * 100}%`, background: vars.navy }} title={`Total ${p.total}`} />
                          <div className="flex-1 rounded-t" style={{ height: `${(p.earned / trendMax) * 100}%`, background: vars.coral }} title={`Earned ${p.earned}`} />
                          <div className="flex-1 rounded-t" style={{ height: `${(p.web / trendMax) * 100}%`, background: vars.teal }} title={`Website ${p.web}`} />
                        </div>
                        <span className="text-[10px]" style={{ color: vars.g500 }}>{p.m}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3 text-[11px]" style={{ color: vars.g500 }}>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: vars.navy }} /> Total</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: vars.coral }} /> Earned</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: vars.teal }} /> Website</span>
                  </div>
                </>
              )}
            </div>

            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Website Content and Technical GEO Summary</h3>
            <p className="text-[13px] font-light mb-4" style={{ color: vars.g600 }}>Technical and content scores from your latest Website Visibility audit feed into the Website track of your Total Authority Score.</p>
            {websiteGeoScores.tech.length === 0 && websiteGeoScores.content.length === 0 ? (
              <p className="text-[13px] font-light" style={{ color: vars.g500 }}>Run a Website Visibility audit to see these scores.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                {[...websiteGeoScores.tech, ...websiteGeoScores.content].map(c => (
                  <ScoreBar key={c.label} label={c.label} score={c.score} max={c.max} description={c.desc} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Score Breakdown by Category</h3>
            {categoryScores.length === 0 ? (
              <p className="text-[13px] font-light" style={{ color: vars.g500 }}>Run a Website Visibility audit to see category-level scores.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                {categoryScores.map(cat => <ScoreBar key={cat.label} {...cat} />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============== PR & MARKETING ============== */}
      {activeTab === "prmkt" && (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>PR &amp; Marketing performance</h2>
            <p className="text-[13px] font-light mb-4" style={{ color: vars.g500 }}>Pulled from your Earned Media Tracker for the date range below.</p>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-xl" style={{ background: vars.navy }}>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: "#ffffff" }}>Date Range - From</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: "#ffffff" }}>Date Range - To</label>
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
          </div>

          {inRange.length === 0 && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-[13px] font-light" style={{ background: "#FBE3ED", color: "#8A3355" }}>
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>No Earned Media Tracker entries found in this date range. Add coverage in the Earned Media Tracker tab, or adjust the dates above.</span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Earned Media Authority Score" value={String(earnedAuthorityScore)} sub="weighted from tracker" color={vars.navy} icon={Sparkles} />
            <StatTile label="Earned Media Authority Trend" value={trackerTrendDelta === null ? "–" : `${trackerTrendDelta >= 0 ? "+" : ""}${trackerTrendDelta}`} sub="vs prior period of equal length" color={trackerTrendDelta !== null && trackerTrendDelta < 0 ? vars.red : vars.green} icon={TrendingUp} />
            <StatTile label="Audience Reach" value={`${(audienceReach / 1_000_000).toFixed(2)}M`} sub="period total" color={vars.navy} icon={Eye} />
            <StatTile label="Authority / piece" value={String(authorityPerPiece)} sub="avg score across rows" color={vars.accent} icon={BarChart3} />
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-4" style={{ color: vars.navy }}>Coverage per key message</h3>
            <p className="text-[12px] font-light mb-4" style={{ color: vars.g500 }}>Counts only PR / Article / Case Study / Whitepaper rows from the Earned Media Tracker. Key messages are pulled from Project Set-Up (sections 1.2 &amp; 1.3).</p>
            {messageCoverage.length === 0 ? (
              <p className="text-[13px] font-light italic" style={{ color: vars.g400 }}>No key messages set for this client. Add them in <strong>Project Set-Up → sections 1.2 &amp; 1.3</strong>.</p>
            ) : (
              <div className="space-y-3">
                {messageCoverage.map(k => (
                  <div key={k.msg}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span style={{ color: vars.navy }}>{k.msg}</span>
                      <span className="font-semibold" style={{ color: vars.accent }}>{k.n} pieces</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: vars.g200 }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, k.n * 25)}%`, background: vars.accent }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Thought Leadership per key message</h3>
              <p className="text-[11px] font-light mb-3" style={{ color: vars.g500 }}>Articles only.</p>
              {messageCoverage.length === 0 ? (
                <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>Add key messages in Project Set-Up (1.2 &amp; 1.3) to see this breakdown.</p>
              ) : (
                <div className="space-y-2">
                  {messageCoverage.map(k => (
                    <div key={k.msg} className="flex justify-between text-[12px]">
                      <span style={{ color: vars.g600 }}>{k.msg}</span>
                      <span className="font-semibold" style={{ color: vars.navy }}>{k.articles}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Press Releases per key message</h3>
              <p className="text-[11px] font-light mb-3" style={{ color: vars.g500 }}>Press Release rows only.</p>
              {messageCoverage.length === 0 ? (
                <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>Add key messages in Project Set-Up (1.2 &amp; 1.3) to see this breakdown.</p>
              ) : (
                <div className="space-y-2">
                  {messageCoverage.map(k => (
                    <div key={k.msg} className="flex justify-between text-[12px]">
                      <span style={{ color: vars.g600 }}>{k.msg}</span>
                      <span className="font-semibold" style={{ color: vars.navy }}>{k.prs}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Press Release Performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <StatTile label="Press Releases in period" value={String(prRows.length)} color={vars.navy} icon={FileText} />
              <StatTile label="Average score / PR" value={String(prAvgScore)} sub="out of 10" color={vars.accent} icon={BarChart3} />
              <StatTile label="Top scorer" value={prRows.length ? String(Math.max(...prRows.map(r => r.score))) : "-"} sub="single PR best" color={vars.green} icon={TrendingUp} />
            </div>
            <div className="space-y-2">
              {prRows.length === 0 && <p className="text-[12px] font-light" style={{ color: vars.g500 }}>No press releases in the selected period.</p>}
              {prRows.map(r => (
                <div key={r.id} className="flex items-center justify-between text-[12px] p-2 rounded-lg" style={{ background: vars.g50 }}>
                  <span className="truncate flex-1" style={{ color: vars.navy }}>{r.title}</span>
                  <span className="px-2 py-0.5 rounded-full font-semibold ml-2" style={{ background: r.score >= 8 ? "#EFF7F2" : "#FFF8EC", color: r.score >= 8 ? vars.green : vars.amber }}>{r.score}/10</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Volume by content type</h3>
              <div className="space-y-2">
                {volByType.length === 0 && <p className="text-[12px] font-light" style={{ color: vars.g500 }}>No items in period.</p>}
                {volByType.map(([t, n]) => (
                  <div key={t} className="flex justify-between text-[12px]">
                    <span style={{ color: vars.g600 }}>{t}</span>
                    <span className="font-semibold" style={{ color: vars.navy }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Volume by media category</h3>
              <div className="space-y-2">
                {volByCategory.length === 0 && <p className="text-[12px] font-light" style={{ color: vars.g500 }}>No items in period.</p>}
                {volByCategory.map(([t, n]) => (
                  <div key={t} className="flex justify-between text-[12px]">
                    <span style={{ color: vars.g600 }}>{t}</span>
                    <span className="font-semibold" style={{ color: vars.navy }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Volume by spokesperson</h3>
              <div className="space-y-2">
                {volBySpokesperson.length === 0 && <p className="text-[12px] font-light" style={{ color: vars.g500 }}>No items in period.</p>}
                {volBySpokesperson.map(([t, n]) => (
                  <div key={t} className="flex justify-between text-[12px]">
                    <span style={{ color: vars.g600 }}>{t}</span>
                    <span className="font-semibold" style={{ color: vars.navy }}>{n} pieces</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Social impact</h3>
              <select
                value={socialImpactPerson}
                onChange={(e) => setSocialImpactPerson(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5 font-semibold"
                style={{ borderColor: vars.navy, background: vars.navy, color: "#ffffff" }}
              >
                {socialImpactPeople.map((p) => (
                  <option key={p} style={{ color: "#ffffff", background: vars.navy }}>{p}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="LinkedIn shares" value={socialImpactStats.shares} color={vars.navy} icon={Share2} />
              <StatTile label="LinkedIn engagement" value={socialImpactStats.engagement} color={vars.navy} icon={TrendingUp} />
              <StatTile label="Inbound DMs" value={socialImpactStats.dms} color={vars.navy} icon={FileText} />
              <StatTile label="Profile views (week)" value={socialImpactStats.profileViews} color={vars.navy} icon={Eye} />
            </div>
          </div>

          <div className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5" style={{ background: vars.navy, color: "white" }}>
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(255,255,255,0.6)" }}>Close the loop</p>
              <h3 className="text-[18px] sm:text-[20px] font-semibold mb-1" style={{ fontFamily: "'Alice', Georgia, serif" }}>Re-run Earned Media Visibility Audit</h3>
              <p className="text-[13px] font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                Refresh the LLM check; the Earned Media Authority Score and trends above will recalculate for the same date range.
              </p>
            </div>
            {onNavigate && (
              <button onClick={() => onNavigate("llm-check")} className="px-5 py-3 rounded-lg text-[13px] font-semibold flex items-center gap-2 transition-all hover:brightness-110 self-start sm:self-auto" style={{ background: "#2896b9", color: "white" }}>
                Re-run Earned Media Visibility Audit <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============== EARNED MEDIA TRACKER ============== */}
      {activeTab === "tracker" && (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <p className="text-sm font-light mb-3" style={{ color: vars.g500 }}>
              Search and record your project coverage and content activity to fuel your authority and visibility scores. This page allows you to do the following:
            </p>
            <ul className="space-y-1.5 pl-5 list-disc text-sm font-light" style={{ color: vars.g500 }}>
              <li>Carry out AI searches for recent Project coverage and earned media citations and add them to your Earned Media Tracker.</li>
              <li>Narrow those searches by Spokesperson or Content Title to drill into a specific aspect of the Project.</li>
              <li>Manually enter coverage into your Earned Media Tracker.</li>
              <li>Search your Earned Media Tracker for content by Type, Message, Spokesperson, Media Category and Media Title.</li>
            </ul>
          </div>

          {/* AI Coverage Search */}
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-1">
              <Search size={16} color={vars.accent} />
              <h3 className="text-base font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>AI Coverage Search</h3>
            </div>
            <p className="text-[13px] font-light mb-4" style={{ color: vars.g500 }}>
              Search the web for earned coverage about your project across Press Releases, Articles, Case Studies, Whitepapers, Blogs, Social, Conferences, Awards and Directories. Each item is scored across ChatGPT and Claude.
            </p>
            <CalloutBrief title="LLM brief">
              <p>You are acting as a senior UK PR media-coverage and earned media reference list builder.</p>
              <p>Using the business information on the Project Data document, you are given permission to web-search and verify coverage before answering.</p>
              <p>Search the web between <strong>[dates selected]</strong> in <strong>[region selected]</strong>, optionally narrowed by <strong>[spokesperson entered]</strong> and <strong>[Content Title entered]</strong>, for media coverage and references in other earned media including conferences, awards, directories and lists of the company identified and described in the Project Data.</p>
              <div>
                <p className="not-italic font-semibold mb-1" style={{ color: "#102B36" }}>Return:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Content title or headline of coverage or reference, including link to article or reference</li>
                  <li>Type (Press Release / Article / Case Study / Whitepaper / Blog / Social / Conference / Award / Directory)</li>
                  <li>Publication or source name</li>
                  <li>Business category</li>
                  <li>Spokesperson (if no byline is noted or quoted in the article, return "None")</li>
                  <li>Audience reach - give a public-source figure where possible (monthly UU, print circulation, subscribers) and label as approximate; flag if unverified</li>
                  <li>Average LLM authority score out of 10 across ChatGPT and Claude for this specific media coverage or reference</li>
                </ul>
              </div>
              <div>
                <p className="not-italic font-semibold mb-1" style={{ color: "#102B36" }}>Search for:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Press releases and news stories</li>
                  <li>Authored articles, media features and reports</li>
                  <li>Case studies and similar references</li>
                  <li>Published whitepapers and reports</li>
                  <li>Blog posts</li>
                  <li>Social posts on LinkedIn, Substack, Medium and similar channels</li>
                  <li>References within conference and event websites</li>
                  <li>References within award schemes, shortlisted entries and awards won</li>
                  <li>References within directories and lists in media editorial and by other organisations</li>
                </ul>
              </div>
              <div>
                <p className="not-italic font-semibold mb-1" style={{ color: "#102B36" }}>Hard rules:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Do not invent references, media coverage, titles or editorial details.</li>
                </ul>
              </div>
              <div>
                <p className="not-italic font-semibold mb-1" style={{ color: "#102B36" }}>Deliverable:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>A sortable Excel with one row per media coverage item or reference.</li>
                  <li>A structured list in a Word document.</li>
                </ul>
              </div>
            </CalloutBrief>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div>
                <label htmlFor="ai-from" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>From</label>
                <input id="ai-from" type="date" value={aiSearch.from} onChange={e => setAiSearch({ ...aiSearch, from: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label htmlFor="ai-to" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>To</label>
                <input id="ai-to" type="date" value={aiSearch.to} onChange={e => setAiSearch({ ...aiSearch, to: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label htmlFor="ai-region" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Region</label>
                <select id="ai-region" value={aiSearch.region} onChange={e => setAiSearch({ ...aiSearch, region: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  {REGIONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ai-project" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Project search</label>
                <input id="ai-project" value={aiSearch.project} onChange={e => setAiSearch({ ...aiSearch, project: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ai-spokesperson" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Spokesperson <span className="font-normal normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
                <input id="ai-spokesperson" placeholder="e.g. Jane Doe" value={aiSearch.spokesperson} onChange={e => setAiSearch({ ...aiSearch, spokesperson: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ai-content-title" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Content Title <span className="font-normal normal-case tracking-normal" style={{ color: vars.g400 }}>(optional)</span></label>
                <input id="ai-content-title" placeholder="e.g. Authority Index" value={aiSearch.contentTitle} onChange={e => setAiSearch({ ...aiSearch, contentTitle: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void runAiSearch()}
                disabled={aiSearching}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: vars.accent }}
              >
                {aiSearching
                  ? <><Loader2 size={14} className="animate-spin" /> Searching…</>
                  : <><Search size={14} /> Run AI Coverage Search</>
                }
              </button>
              {aiSearched && aiResults.length > 0 && (
                <>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: vars.g200, color: vars.g600 }}>
                    <Download size={14} /> Download Report
                  </button>
                  <button
                    onClick={() => {
                      aiResults.forEach(r => addAiResultToTracker(r));
                      alert(`Added ${aiResults.length} item${aiResults.length === 1 ? "" : "s"} to the Earned Media Tracker.`);
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ background: vars.navy }}
                  >
                    <Plus size={14} /> Add to Earned Media Tracker
                  </button>
                </>
              )}
            </div>
            {aiSearchError && (
              <p className="mt-4 text-[12px] font-light" style={{ color: vars.accent }}>{aiSearchError}</p>
            )}
            {aiSearched && aiResults.length === 0 && !aiSearchError && (
              <p className="mt-4 text-[12px] font-light" style={{ color: vars.g500 }}>No coverage found in Claude's training data for these search parameters. Try a broader search — remove the spokesperson or content title filters, or use a wider date range.</p>
            )}

            {aiSearched && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr style={{ background: vars.g50 }}>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Title</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Type</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Publication</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Reach</th>
                      <th className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Avg score</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiResults.map((r, i) => {
                      const avg = Math.round(Object.values(r.scores).reduce((a, b) => a + b, 0) / Object.values(r.scores).length);
                      return (
                        <tr key={i} className="border-t" style={{ borderColor: vars.g200 }}>
                          <td className="px-3 py-3" style={{ color: vars.navy }}>{r.title}</td>
                          <td className="px-3 py-3" style={{ color: vars.g600 }}>{r.type}</td>
                          <td className="px-3 py-3" style={{ color: vars.g600 }}>{r.publication}</td>
                          <td className="px-3 py-3 text-right" style={{ color: vars.g600 }}>{r.reach.toLocaleString()}</td>
                          <td className="px-3 py-3 text-center"><span className="px-2 py-0.5 rounded-full font-semibold text-[11px]" style={{ background: avg >= 7 ? "#EFF7F2" : "#FFF8EC", color: avg >= 7 ? vars.green : vars.amber }}>{avg}/10</span></td>
                          <td className="px-3 py-3 text-right">
                            <button onClick={() => addAiResultToTracker(r)} className="text-xs font-semibold flex items-center gap-1 ml-auto" style={{ color: vars.accent }}>
                              <Plus size={12} /> Add to Tracker
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Manual Entry */}
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-1">
              <Plus size={16} color={vars.accent} />
              <h3 className="text-base font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Manual Entry</h3>
            </div>
            <p className="text-[13px] font-light mb-4" style={{ color: vars.g500 }}>Add a row directly to the Earned Media Tracker spreadsheet.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Publication date</label>
                <input type="date" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Content Title</label>
                <input value={manualForm.title} onChange={e => setManualForm({ ...manualForm, title: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} placeholder="Content Title" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Content Type</label>
                <select value={manualForm.type} onChange={e => setManualForm({ ...manualForm, type: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Publication</label>
                <input value={manualForm.publication} onChange={e => setManualForm({ ...manualForm, publication: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} placeholder="e.g. PRWeek" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Media Category</label>
                <input value={manualForm.category} onChange={e => setManualForm({ ...manualForm, category: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} placeholder="From 1.9 (e.g. Marketing & PR)" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Spokesperson</label>
                <input value={manualForm.spokesperson} onChange={e => setManualForm({ ...manualForm, spokesperson: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} placeholder="Name or NA" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Link</label>
                <input value={manualForm.link} onChange={e => setManualForm({ ...manualForm, link: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} placeholder="https://" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Reach</label>
                <input type="number" value={manualForm.reach} onChange={e => setManualForm({ ...manualForm, reach: Number(e.target.value) })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Authority Score (0-10)</label>
                <input type="number" min={0} max={10} value={manualForm.score} onChange={e => setManualForm({ ...manualForm, score: Number(e.target.value) })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <button onClick={addManualRow} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: vars.accent }}>
              <Plus size={14} /> Add to Earned Media Tracker
            </button>
          </div>

          {/* Search Earned Media Tracker */}
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-1">
              <Search size={16} color={vars.accent} />
              <h3 className="text-base font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Search Earned Media Tracker</h3>
            </div>
            <p className="text-[13px] font-light mb-4" style={{ color: vars.g500 }}>
              Filter the spreadsheet below by any combination of Date, Content Type, Message, Spokesperson, Media Category or Media Title.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <div>
                <label htmlFor="tracker-filter-from" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>From</label>
                <input id="tracker-filter-from" type="date" value={trackerFilter.from} onChange={e => setTrackerFilter({ ...trackerFilter, from: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label htmlFor="tracker-filter-to" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>To</label>
                <input id="tracker-filter-to" type="date" value={trackerFilter.to} onChange={e => setTrackerFilter({ ...trackerFilter, to: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label htmlFor="tracker-filter-type" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Content Type</label>
                <select id="tracker-filter-type" value={trackerFilter.type} onChange={e => setTrackerFilter({ ...trackerFilter, type: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  <option value="All">All types</option>
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="tracker-filter-message" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Message / keyword</label>
                <input id="tracker-filter-message" type="text" placeholder="e.g. authority, GEO, Boots" value={trackerFilter.message} onChange={e => setTrackerFilter({ ...trackerFilter, message: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label htmlFor="tracker-filter-spokesperson" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Spokesperson</label>
                <select id="tracker-filter-spokesperson" value={trackerFilter.spokesperson} onChange={e => setTrackerFilter({ ...trackerFilter, spokesperson: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  <option value="All">All spokespersons</option>
                  {uniqueSpokespersons.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="tracker-filter-category" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Media Category</label>
                <select id="tracker-filter-category" value={trackerFilter.category} onChange={e => setTrackerFilter({ ...trackerFilter, category: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  <option value="All">All categories</option>
                  {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="tracker-filter-media-title" className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Media Title</label>
                <select id="tracker-filter-media-title" value={trackerFilter.mediaTitle} onChange={e => setTrackerFilter({ ...trackerFilter, mediaTitle: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  <option value="All">All media titles</option>
                  {uniqueMediaTitles.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setTrackerFilter(trackerFilterDefaults)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: vars.g200, color: vars.g600 }}>
                Clear filters
              </button>
              <span className="text-[12px]" style={{ color: vars.g500 }}>
                Showing <strong style={{ color: vars.navy }}>{filteredTracker.length}</strong> of {tracker.length} rows
              </span>
            </div>
          </div>

          {/* Tracker Spreadsheet */}
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h3 className="text-base font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Earned Media Tracker spreadsheet</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {tracker.length > 0 && (
                  <>
                    <button
                      onClick={downloadTrackerCsv}
                      title="Download as CSV / Excel"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold"
                      style={{ borderColor: vars.g200, color: vars.g600 }}
                    >
                      <Download size={12} /> Excel (.csv)
                    </button>
                    <button
                      onClick={() => void downloadTrackerDocx()}
                      title="Download as Word document"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold"
                      style={{ borderColor: vars.g200, color: vars.g600 }}
                    >
                      <Download size={12} /> Word (.docx)
                    </button>
                  </>
                )}
                <span className="text-[11px]" style={{ color: vars.g400 }}>
                  {hasActiveTrackerFilters ? `${filteredTracker.length} of ${tracker.length} rows` : `${tracker.length} rows`}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    {["Date", "Title", "Type", "Publication", "Category", "Spokesperson", "Reach", "Score", ""].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTracker.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-[13px] font-light" style={{ color: vars.g500 }}>
                      No rows match the current filters. Try clearing one or more fields above.
                    </td></tr>
                  )}
                  {filteredTracker.map(r => (
                    <tr key={r.id} className="border-t" style={{ borderColor: vars.g200 }}>
                      <td className="px-3 py-2" style={{ color: vars.g600 }}>{r.date}</td>
                      <td className="px-3 py-2" style={{ color: vars.navy }}>
                        {r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="underline">{r.title}</a> : r.title}
                      </td>
                      <td className="px-3 py-2" style={{ color: vars.g600 }}>{r.type}</td>
                      <td className="px-3 py-2" style={{ color: vars.g600 }}>{r.publication}</td>
                      <td className="px-3 py-2" style={{ color: vars.g600 }}>{r.category}</td>
                      <td className="px-3 py-2" style={{ color: vars.g600 }}>{r.spokesperson}</td>
                      <td className="px-3 py-2" style={{ color: vars.g600 }}>{r.reach.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center"><span className="px-2 py-0.5 rounded-full font-semibold text-[11px]" style={{ background: r.score >= 7 ? "#EFF7F2" : "#FFF8EC", color: r.score >= 7 ? vars.green : vars.amber }}>{r.score}/10</span></td>
                      <td className="px-3 py-2"><button onClick={() => removeRow(r.id)} aria-label={`Remove ${r.title}`} title="Remove row" className="text-[11px]" style={{ color: vars.red }}><Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============== WEBSITE GEO & TECHNICAL ============== */}
      {activeTab === "geo" && (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <Eye size={18} color={vars.accent} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Earned Visibility Scorecard</h3>
            </div>
            <p className="text-sm font-light mb-6" style={{ color: vars.g500 }}>How your brand appears across ChatGPT and Claude when users ask questions in your category.</p>
            {llmScorecard.length === 0 ? (
              <p className="text-[13px] font-light" style={{ color: vars.g500 }}>Run an Earned Media audit to see your LLM scorecard.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr style={{ background: vars.g50 }}>
                      {["Platform", "Mentions", "Cited", "Appearance Rate", "Trend"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: vars.g500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {llmScorecard.map(llm => (
                      <tr key={llm.platform} className="border-t" style={{ borderColor: vars.g200 }}>
                        <td className="px-4 py-3.5"><span className="text-sm font-medium" style={{ color: vars.navy }}>{llm.platform}</span></td>
                        <td className="px-4 py-3.5"><span className="text-sm font-semibold" style={{ color: vars.navy }}>{llm.mentions}</span></td>
                        <td className="px-4 py-3.5">{llm.cited ? <CheckCircle2 size={16} color={vars.green} /> : <X size={16} color={vars.g300} />}</td>
                        <td className="px-4 py-3.5"><span className="text-sm" style={{ color: vars.g600 }}>{llm.rate}%</span></td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm font-medium flex items-center gap-1" style={{ color: llm.trend >= 0 ? vars.green : vars.red }}>
                            {llm.trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            {llm.trend >= 0 ? "+" : ""}{llm.trend}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <Shield size={18} color={vars.accent} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Technical &amp; Schema Audit</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>Assessment of structured data, crawler access and technical signals that help AI engines understand and trust your content.</p>
            {technicalAudit.length === 0 ? (
              <p className="text-[13px] font-light" style={{ color: vars.g500 }}>Run a Website Visibility audit to see your technical &amp; schema findings.</p>
            ) : (
              <div className="space-y-3">
                {technicalAudit.map(item => (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                    <span className="text-sm font-medium flex-shrink-0" style={{ color: vars.navy }}>{item.item}</span>
                    <div className="flex items-center gap-3 sm:ml-auto">
                      <StatusBadge status={item.status} />
                      <span className="text-xs font-light flex-1 sm:flex-initial sm:w-64" style={{ color: vars.g500 }}>{item.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} color={vars.teal} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Content Architecture Audit</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>How well your website content is structured for AI comprehension, citation and answer extraction.</p>
            {contentAudit.length === 0 ? (
              <p className="text-[13px] font-light" style={{ color: vars.g500 }}>Run a Website Visibility audit to see your content architecture findings.</p>
            ) : (
              <div className="space-y-3">
                {contentAudit.map(item => (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                    <span className="text-sm font-medium flex-shrink-0" style={{ color: vars.navy }}>{item.item}</span>
                    <div className="flex items-center gap-3 sm:ml-auto">
                      <StatusBadge status={item.status} />
                      <span className="text-xs font-light flex-1 sm:flex-initial sm:w-64" style={{ color: vars.g500 }}>{item.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: vars.cream, borderColor: "#E6D7BC" }}>
            <Calendar size={22} color={vars.gold} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: vars.navy }}>Itemised action report</p>
              <p className="text-[12px] font-light" style={{ color: vars.g600 }}>The Website Technical GEO module consumes Project Data sections 1-3 and 7-8, then produces a downloadable, itemised action list to drive these scores up.</p>
            </div>
            {onNavigate && (
              <button onClick={() => onNavigate("seo-audit")} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white flex-shrink-0 whitespace-nowrap" style={{ background: vars.accent }}>
                Open Website Technical GEO <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

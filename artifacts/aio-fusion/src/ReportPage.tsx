import { useState, useMemo, useEffect } from "react";
import InfoTip from "./InfoTip";
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
} from "lucide-react";

const vars = {
  navy: "#102B36",
  accent: "#C8497A",
  teal: "#C8497A",
  green: "#3D9B6B",
  amber: "#D4922A",
  red: "#C94A3E",
  coral: "#C8497A",
  gold: "#C9A04E",
  cream: "#FBF6EC",
  g50: "#FAFAFA",
  g100: "#F3F3F3",
  g200: "#E5E5E5",
  g300: "#D4D4D4",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#374151",
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
// Seeded to mirror an SMG-style Earned Media & Third-Party Coverage Report —
// Jan–Apr 2026 spanning Press releases / News stories, Authored articles &
// Media features, Case studies, Whitepapers & Reports, Blog posts, Social
// posts and Conference / Event references. Reach figures are estimated
// publisher media-kit / Similarweb / LinkedIn follower counts.
const seedTracker: TrackerRow[] = [
  // 1. Press Releases & News Stories
  { id: "t1",  date: "2026-03-04", title: "Simpatico launches industry-first GEO Authority Index for B2B PR",                                  type: "Press Release",              publication: "simpaticopr.co.uk",   category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://simpaticopr.co.uk/news/geo-index", reach: 15000,    score: 8 },
  { id: "t2",  date: "2026-03-18", title: "GEO 'firmly in the growth phase', finds Simpatico's Authority Index",                              type: "Article (Trade Publication)", publication: "PRWeek",              category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://prweek.com/article/geo-growth",   reach: 480000,   score: 8 },
  { id: "t3",  date: "2026-04-08", title: "Earned media's next phase will be won by differentiation, not scale",                              type: "Article (Trade Publication)", publication: "The Drum",            category: "Marketing & Advertising", spokesperson: "Helen Croydon",     link: "https://thedrum.com/news/2026/04/08",     reach: 11500000, score: 9 },
  { id: "t4",  date: "2026-04-12", title: "The newsroom is GEO's next frontier, but no one has cracked it yet",                               type: "Article (Trade Publication)", publication: "The Drum",            category: "Marketing & PR",     spokesperson: "Helen Croydon",     link: "https://thedrum.com/news/2026/04/12",     reach: 11500000, score: 8 },
  { id: "t5",  date: "2026-04-22", title: "PR silos, measurement and misconceptions continue to stymie GEO growth",                            type: "Article (Trade Publication)", publication: "Adweek",              category: "Marketing & Advertising", spokesperson: "Spencer Gallagher", link: "https://adweek.com/2026/04/geo",          reach: 7400000,  score: 9 },

  // 2. Authored Articles, Media Features & Reports
  { id: "t6",  date: "2026-01-22", title: "The six changes set to shape a more mature GEO market in 2026",                                     type: "Article (Trade Publication)", publication: "PRovoke Media",       category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://provokemedia.com/2026/01/22",     reach: 220000,   score: 8 },
  { id: "t7",  date: "2026-04-10", title: "What B2B brands can learn from Lighthouse on turning research into earned media moments",          type: "Article (Trade Publication)", publication: "The Drum",            category: "Marketing & PR",     spokesperson: "Helen Croydon",     link: "https://thedrum.com/2026/04/10",          reach: 11500000, score: 7 },
  { id: "t8",  date: "2026-04-18", title: "All media is earned media: if fragmentation is the challenge, infrastructure is the answer",        type: "Article (Trade Publication)", publication: "B2B Marketing",       category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://b2bmarketing.net/2026/04/18",     reach: 95000,    score: 9 },
  { id: "t9",  date: "2026-03-25", title: "Spokesperson experience and connectivity key to winning in GEO (Beet.TV)",                          type: "Article (Trade Publication)", publication: "Beet.TV",             category: "Marketing & PR",     spokesperson: "Helen Croydon",     link: "https://beet.tv/2026/03/simpatico",       reach: 50000,    score: 6 },

  // 3. Case Studies & Similar References
  { id: "t10", date: "2026-03-12", title: "Research: Winning audiences and creating moments with B2B GEO (Lighthouse x Simpatico)",            type: "Case Study",                  publication: "simpaticopr.co.uk",   category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://simpaticopr.co.uk/research/lighthouse", reach: 15000, score: 7 },
  { id: "t11", date: "2026-04-14", title: "Unlocking the trade media opportunity with WHSmith Travel and Simpatico",                            type: "Case Study",                  publication: "RETHINK Retail",      category: "Retail",             spokesperson: "Helen Croydon",     link: "https://rethink.industry/case-studies/whsmith", reach: 17000, score: 7 },
  { id: "t12", date: "2026-04-21", title: "Boots Earned Authority powered by Simpatico: Highly Commended — The Drum Awards",                   type: "Case Study",                  publication: "The Drum",            category: "Marketing & Advertising", spokesperson: "Spencer Gallagher", link: "https://thedrum.com/awards/boots",        reach: 11500000, score: 8 },

  // 4. Published Whitepapers & Reports
  { id: "t13", date: "2026-01-14", title: "6 GEO Trends You Can't Miss In 2026",                                                                type: "Whitepaper",                  publication: "simpaticopr.co.uk",   category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://simpaticopr.co.uk/reports/2026-trends", reach: 15000, score: 8 },
  { id: "t14", date: "2026-03-04", title: "GEO Authority Index — Earned Authority Maturity Report 2026",                                        type: "Whitepaper",                  publication: "simpaticopr.co.uk",   category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://simpaticopr.co.uk/reports/authority-index", reach: 15000, score: 9 },
  { id: "t15", date: "2026-03-26", title: "It's time for B2B brands to rethink how they grow earned authority",                                 type: "Whitepaper",                  publication: "simpaticopr.co.uk",   category: "Marketing & PR",     spokesperson: "Helen Croydon",     link: "https://simpaticopr.co.uk/reports/grow-authority", reach: 15000, score: 7 },

  // 5. Blog Posts
  { id: "t16", date: "2026-01-10", title: "AI, attribution & accountability for earned media at CES 2026",                                      type: "Blog Post",                   publication: "simpaticopr.co.uk",   category: "Marketing & Advertising", spokesperson: "Spencer Gallagher", link: "https://simpaticopr.co.uk/blog/ces-2026", reach: 15000,    score: 7 },
  { id: "t17", date: "2026-04-09", title: "Earned media's next test: breaking out of its silos (IAB Connected Comms Summit)",                   type: "Blog Post",                   publication: "simpaticopr.co.uk",   category: "Marketing & PR",     spokesperson: "Helen Croydon",     link: "https://simpaticopr.co.uk/blog/iab-2026", reach: 15000,    score: 6 },

  // 6. Social Posts — LinkedIn, Substack, Medium
  { id: "t18", date: "2026-04-15", title: "Adweek and Simpatico partner for GEO Leadership Summit (LinkedIn post)",                              type: "Social Post",                 publication: "Adweek (LinkedIn)",   category: "Marketing & Advertising", spokesperson: "NA",                link: "https://linkedin.com/company/adweek/posts", reach: 163000,   score: 7 },
  { id: "t19", date: "2026-02-20", title: "6 GEO Trends report shared across LinkedIn by Simpatico team",                                       type: "Social Post",                 publication: "LinkedIn — Simpatico team", category: "Marketing & PR", spokesperson: "NA",                link: "https://linkedin.com/company/simpaticopr", reach: 100000,   score: 6 },

  // 7. Conference & Event Website References
  { id: "t20", date: "2026-01-29", title: "2026 IAB Annual Leadership Meeting — Spencer Gallagher listed as speaker",                            type: "Speaker Submission",          publication: "iab.com",             category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://iab.com/events/alm-2026/speakers", reach: 400000,   score: 8 },
  { id: "t21", date: "2026-03-08", title: "Shoptalk Spring 2026 — Simpatico & WHSmith panel on travel earned media",                             type: "Speaker Submission",          publication: "shoptalk.com",        category: "Retail",             spokesperson: "Helen Croydon",     link: "https://shoptalk.com/spring-2026/agenda",  reach: 150000,   score: 7 },
  { id: "t22", date: "2026-04-02", title: "2026 IAB Connected Comms Summit — Spencer Gallagher listed as speaker",                               type: "Speaker Submission",          publication: "iab.com",             category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://iab.com/events/connected-comms-2026", reach: 400000, score: 9 },
  { id: "t23", date: "2026-04-18", title: "Spencer Gallagher named 2026 PRovoke Top 250 — recognition listing",                                   type: "Directory Entry",             publication: "PRovoke Media",       category: "Marketing & PR",     spokesperson: "Spencer Gallagher", link: "https://provokemedia.com/top250-2026",     reach: 220000,   score: 7 },
];

function loadTracker(): TrackerRow[] {
  try {
    const raw = localStorage.getItem(TRACKER_KEY);
    if (!raw) {
      localStorage.setItem(TRACKER_KEY, JSON.stringify(seedTracker));
      return seedTracker;
    }
    return JSON.parse(raw) as TrackerRow[];
  } catch {
    return seedTracker;
  }
}

function saveTracker(rows: TrackerRow[]) {
  try { localStorage.setItem(TRACKER_KEY, JSON.stringify(rows)); } catch { /* ignore */ }
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
      <p className="text-[11px] font-light" style={{ color: vars.g400 }}>{description}</p>
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
    <div className="rounded-xl border p-4" style={{ borderColor: vars.g200 }}>
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
  const reportDate = "14 April 2026";
  const projectStartDate = "2026-01-08";
  const authorityScore = activeClient.avgScore || 24;
  const earnedScore = 20;
  const websiteScore = 38;

  const [rangeFrom, setRangeFrom] = useState(projectStartDate);
  const [rangeTo, setRangeTo] = useState("2026-04-30");

  const [tracker, setTracker] = useState<TrackerRow[]>(() => loadTracker());
  useEffect(() => saveTracker(tracker), [tracker]);

  const inRange = useMemo(() => tracker.filter(r => r.date >= rangeFrom && r.date <= rangeTo), [tracker, rangeFrom, rangeTo]);
  const earnedRowsForCoverage = useMemo(() =>
    inRange.filter(r => ["Press Release", "Article (Trade Publication)", "Case Study", "Whitepaper"].includes(r.type)),
    [inRange]);

  const audienceReach = inRange.reduce((s, r) => s + r.reach, 0);
  const authorityPerPiece = inRange.length ? Math.round((inRange.reduce((s, r) => s + r.score, 0) / inRange.length) * 10) / 10 : 0;
  const earnedAuthorityScore = Math.min(100, Math.round(inRange.reduce((s, r) => s + r.score * (["Press Release", "Article (Trade Publication)"].includes(r.type) ? 2 : 1), 0)));
  const prCoverageCount = earnedRowsForCoverage.length;

  const categoryScores = [
    { label: "Schema & Structured Data", score: 3, max: 15, description: "Organization, FAQ, Article schema coverage" },
    { label: "Content Architecture", score: 5, max: 15, description: "Answer-first formatting, semantic phrase density" },
    { label: "Source Authority", score: 4, max: 15, description: "NAP consistency, third-party profiles, citations" },
    { label: "Earned Media Signals", score: 7, max: 20, description: "Press mentions, backlink quality, spokesperson visibility" },
    { label: "Earned Visibility", score: 3, max: 20, description: "Mentions across ChatGPT, Perplexity, Claude, Gemini" },
    { label: "Technical Accessibility", score: 2, max: 15, description: "AI crawler access, robots.txt, sitemap, page speed" },
  ];

  const websiteGeoScores = {
    tech: [
      { label: "Schema coverage", score: 6, max: 10, desc: "Organisation, FAQ and Article schema across key templates." },
      { label: "Crawlability", score: 8, max: 10, desc: "AI agents (GPTBot, ClaudeBot, PerplexityBot) reach all priority pages." },
      { label: "Page speed", score: 5, max: 10, desc: "LCP 3.2s on the homepage; target under 2.5s." },
    ],
    content: [
      { label: "Entity clarity", score: 5, max: 10, desc: "Brand, founders and services need explicit, consistent definitions." },
      { label: "Q&A snippet density", score: 4, max: 10, desc: "Add answer-first key takeaways to top 10 templates." },
      { label: "Internal authority graph", score: 6, max: 10, desc: "Spokesperson and topic hubs partially in place." },
    ],
  };

  const llmScorecard = [
    { platform: "ChatGPT", mentions: 24, cited: true, rank: 3, sentiment: "Positive", trend: 8 },
    { platform: "Perplexity", mentions: 31, cited: true, rank: 2, sentiment: "Positive", trend: 12 },
    { platform: "Google AI", mentions: 14, cited: false, rank: 5, sentiment: "Neutral", trend: 3 },
    { platform: "Claude", mentions: 8, cited: false, rank: 7, sentiment: "Neutral", trend: 1 },
    { platform: "Gemini", mentions: 11, cited: false, rank: 6, sentiment: "Neutral", trend: 2 },
  ];

  const technicalAudit = [
    { item: "Organization Schema", status: "fail" as const, detail: "No Organization schema detected on homepage" },
    { item: "FAQ Schema", status: "fail" as const, detail: "FAQ page exists but no structured markup applied" },
    { item: "Article Schema", status: "warn" as const, detail: "Partial implementation - missing author and datePublished" },
    { item: "AI Crawler Access", status: "pass" as const, detail: "robots.txt allows GPTBot, PerplexityBot, ClaudeBot" },
    { item: "Sitemap", status: "pass" as const, detail: "XML sitemap present and submitted to GSC" },
    { item: "Page Speed (Core Web Vitals)", status: "warn" as const, detail: "LCP 3.2s (target < 2.5s), CLS 0.08 (pass)" },
    { item: "NAP Consistency", status: "warn" as const, detail: "3 of 7 third-party profiles have outdated address" },
    { item: "HTTPS / Security Headers", status: "pass" as const, detail: "TLS 1.3, HSTS enabled, CSP present" },
  ];

  const contentAudit = [
    { item: "Homepage Descriptor", status: "warn" as const, detail: "Generic tagline - needs entity-rich, answer-first copy" },
    { item: "Product/Service Pages", status: "fail" as const, detail: "4 of 6 pages use promotional language instead of factual statements" },
    { item: "FAQ Page", status: "warn" as const, detail: "12 questions present, but missing category authority and misconception FAQs" },
    { item: "Blog / Thought Leadership", status: "pass" as const, detail: "Regular publishing cadence, 3 expert-authored pieces this quarter" },
    { item: "Spokesperson Profiles", status: "fail" as const, detail: "No dedicated author/expert profile pages with credentials" },
    { item: "Key Takeaway Boxes", status: "fail" as const, detail: "No answer-first summary blocks on content pages" },
  ];

  const monthlyTrend = [
    { m: "Nov", total: 18, earned: 12, web: 32 },
    { m: "Dec", total: 22, earned: 14, web: 33 },
    { m: "Jan", total: 24, earned: 16, web: 34 },
    { m: "Feb", total: 27, earned: 17, web: 35 },
    { m: "Mar", total: 30, earned: 18, web: 36 },
    { m: "Apr", total: authorityScore, earned: earnedScore, web: websiteScore },
  ];
  const trendMax = Math.max(...monthlyTrend.flatMap(p => [p.total, p.earned, p.web])) + 4;

  const messageCoverage = useMemo(() => {
    const buckets = [
      { msg: "AI authority platform built by PR consultants", contains: ["authority", "platform"] },
      { msg: "Generative engine optimisation expertise", contains: ["geo", "generative", "engine"] },
      { msg: "Measurable AI citation outcomes", contains: ["citation", "measure", "benchmark"] },
      { msg: "Tech + content fusion", contains: ["tech", "fusion", "content"] },
    ];
    return buckets.map(b => {
      const matches = earnedRowsForCoverage.filter(r => b.contains.some(k => r.title.toLowerCase().includes(k)));
      return { msg: b.msg, n: matches.length, articles: matches.filter(r => r.type === "Article (Trade Publication)").length, prs: matches.filter(r => r.type === "Press Release").length };
    });
  }, [earnedRowsForCoverage]);

  const volByType = useMemo(() => {
    const tally = new Map<string, number>();
    inRange.forEach(r => tally.set(r.type, (tally.get(r.type) || 0) + 1));
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const volByCategory = useMemo(() => {
    const tally = new Map<string, number>();
    inRange.forEach(r => tally.set(r.category || "—", (tally.get(r.category || "—") || 0) + 1));
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const volBySpokesperson = useMemo(() => {
    const tally = new Map<string, number>();
    inRange.forEach(r => tally.set(r.spokesperson || "—", (tally.get(r.spokesperson || "—") || 0) + 1));
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const prRows = useMemo(() => inRange.filter(r => r.type === "Press Release"), [inRange]);
  const prAvgScore = prRows.length ? Math.round((prRows.reduce((s, r) => s + r.score, 0) / prRows.length) * 10) / 10 : 0;

  const tabs = [
    { id: "summary" as const, label: "Executive Summary" },
    { id: "prmkt" as const, label: "PR & Marketing" },
    { id: "tracker" as const, label: "Earned Media Tracker" },
    { id: "geo" as const, label: "Website GEO & Technical" },
  ];

  // ---- Earned Media Tracker form state ----
  const [aiSearch, setAiSearch] = useState({ from: rangeFrom, to: rangeTo, region: "UK", project: activeClient.name });
  const [aiResults, setAiResults] = useState<Array<{ title: string; type: string; publication: string; reach: number; scores: Record<string, number>; link: string }>>([]);
  const [aiSearched, setAiSearched] = useState(false);

  const [detailedSearch, setDetailedSearch] = useState({ spokesperson: "All", title: "All" });
  const [detailedResults, setDetailedResults] = useState<typeof aiResults>([]);
  const [detailedSearched, setDetailedSearched] = useState(false);

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
    date: "2026-04-15",
    title: "",
    type: CONTENT_TYPES[0],
    publication: "",
    category: "",
    spokesperson: "",
    link: "",
    reach: 0,
    score: 7,
  });

  function runAiSearch() {
    setAiSearched(true);
    // SMG-style coverage spread across all 7 bucket types Patrick illustrated:
    // Press Release / News, Authored Article + Media Feature, Case Study,
    // Whitepaper, Blog Post, Social Post and Conference / Event reference.
    setAiResults([
      // Press release pickup
      { title: "GEO 'firmly in the growth phase', finds Simpatico's Authority Index",                                  type: "Press Release",              publication: "PRWeek",            reach: 480000,   scores: { Claude: 8, Gemini: 8, ChatGPT: 9, Perplexity: 8, CoPilot: 7 }, link: "https://prweek.com/article/geo-growth" },
      { title: "Simpatico launches industry-first GEO Authority Index for B2B PR",                                      type: "Press Release",              publication: "PRovoke Media",     reach: 220000,   scores: { Claude: 7, Gemini: 7, ChatGPT: 8, Perplexity: 8, CoPilot: 6 }, link: "https://provokemedia.com/2026/03/04" },

      // Authored articles & media features
      { title: "Earned media's next phase will be won by differentiation, not scale",                                    type: "Article (Trade Publication)", publication: "The Drum",          reach: 11500000, scores: { Claude: 9, Gemini: 9, ChatGPT: 9, Perplexity: 9, CoPilot: 8 }, link: "https://thedrum.com/news/2026/04/08" },
      { title: "PR silos, measurement and misconceptions continue to stymie GEO growth",                                 type: "Article (Trade Publication)", publication: "Adweek",            reach: 7400000,  scores: { Claude: 9, Gemini: 8, ChatGPT: 9, Perplexity: 9, CoPilot: 8 }, link: "https://adweek.com/2026/04/geo" },
      { title: "All media is earned media: if fragmentation is the challenge, infrastructure is the answer",             type: "Article (Trade Publication)", publication: "B2B Marketing",     reach: 95000,    scores: { Claude: 8, Gemini: 8, ChatGPT: 9, Perplexity: 9, CoPilot: 7 }, link: "https://b2bmarketing.net/2026/04/18" },

      // Case study
      { title: "Boots Earned Authority powered by Simpatico — Highly Commended, The Drum Awards",                        type: "Case Study",                  publication: "The Drum",          reach: 11500000, scores: { Claude: 8, Gemini: 8, ChatGPT: 8, Perplexity: 9, CoPilot: 7 }, link: "https://thedrum.com/awards/boots" },

      // Whitepaper / report
      { title: "GEO Authority Index — Earned Authority Maturity Report 2026",                                            type: "Whitepaper",                  publication: "simpaticopr.co.uk", reach: 15000,    scores: { Claude: 9, Gemini: 8, ChatGPT: 9, Perplexity: 9, CoPilot: 8 }, link: "https://simpaticopr.co.uk/reports/authority-index" },

      // Blog post
      { title: "AI, attribution & accountability for earned media at CES 2026",                                          type: "Blog Post",                   publication: "simpaticopr.co.uk", reach: 15000,    scores: { Claude: 7, Gemini: 6, ChatGPT: 7, Perplexity: 7, CoPilot: 6 }, link: "https://simpaticopr.co.uk/blog/ces-2026" },

      // Social post
      { title: "Adweek and Simpatico partner for GEO Leadership Summit (LinkedIn announcement)",                          type: "Social Post",                 publication: "Adweek (LinkedIn)", reach: 163000,   scores: { Claude: 7, Gemini: 7, ChatGPT: 8, Perplexity: 7, CoPilot: 6 }, link: "https://linkedin.com/company/adweek/posts" },

      // Conference / event reference
      { title: "2026 IAB Connected Comms Summit — Spencer Gallagher listed as speaker",                                  type: "Speaker Submission",          publication: "iab.com",           reach: 400000,   scores: { Claude: 9, Gemini: 8, ChatGPT: 9, Perplexity: 9, CoPilot: 8 }, link: "https://iab.com/events/connected-comms-2026" },
    ]);
  }

  function runDetailedSearch() {
    setDetailedSearched(true);
    const matches = inRange.filter(r => {
      const okPerson = detailedSearch.spokesperson === "All" || r.spokesperson === detailedSearch.spokesperson;
      const okTitle = detailedSearch.title === "All" || r.title === detailedSearch.title;
      return okPerson && okTitle;
    });
    if (matches.length === 0) {
      setDetailedResults([]);
      return;
    }
    setDetailedResults(matches.map(r => ({
      title: r.title,
      type: r.type,
      publication: r.publication,
      reach: r.reach,
      scores: { Claude: r.score, Gemini: Math.max(0, r.score - 1), ChatGPT: Math.min(10, r.score + 1), Perplexity: r.score, CoPilot: Math.max(0, r.score - 2) },
      link: r.link,
    })));
  }

  function addAiResultToTracker(r: typeof aiResults[number]) {
    const avgScore = Math.round(Object.values(r.scores).reduce((a, b) => a + b, 0) / Object.values(r.scores).length);
    const newRow: TrackerRow = {
      id: `t${Date.now()}`,
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
    const row: TrackerRow = { ...manualForm, id: `t${Date.now()}` };
    setTracker(prev => [row, ...prev]);
    setManualForm(f => ({ ...f, title: "", publication: "", link: "", reach: 0 }));
  }

  function removeRow(id: string) {
    setTracker(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={20} color={vars.accent} />
            <h1 className="text-xl sm:text-2xl tracking-tight flex items-center" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              Authority &amp; Activity Report
              <InfoTip text="Combines diagnostic scores, earned media authority, planned activity, the Earned Media Tracker and the website GEO audit. Designed to be exported and shared with the client." width={260} />
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
            {activeClient.name} &middot; Generated {reportDate}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:bg-gray-50" style={{ borderColor: vars.g200, color: vars.g600 }}>
            <Printer size={16} /> Print
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors hover:bg-gray-50" style={{ borderColor: vars.g200, color: vars.g600 }}>
            <Share2 size={16} /> Share
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white" style={{ background: vars.accent }}>
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl border mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
            style={{
              background: activeTab === tab.id ? vars.accent : "transparent",
              color: activeTab === tab.id ? "white" : vars.g500,
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
            <div className="rounded-xl p-4 sm:p-6 mb-5" style={{ background: "linear-gradient(135deg, #165265, #1f748f)" }}>
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
                    {authorityScore >= 70 ? "Strong authority position" : authorityScore >= 40 ? "Moderate authority — room to grow" : "Early stage — significant opportunities"}
                  </h2>
                  <p className="text-sm text-white/75 leading-relaxed mb-4">
                    {activeClient.name} currently scores {authorityScore}/100. This combines earned media authority and your website&rsquo;s technical &amp; content readiness for AI citation.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <span className="text-[10px] text-white/60 block uppercase tracking-wider">Earned</span>
                      <span className="text-lg font-bold text-white">{earnedScore}/100</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <span className="text-[10px] text-white/60 block uppercase tracking-wider">Website</span>
                      <span className="text-lg font-bold text-white">{websiteScore}/100</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <span className="text-[10px] text-white/60 block uppercase tracking-wider">30-day trend</span>
                      <span className="text-lg font-bold text-white flex items-center gap-1">
                        {activeClient.scoreTrend >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        {activeClient.scoreTrend >= 0 ? "+" : ""}{activeClient.scoreTrend}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-5 p-4 rounded-xl border" style={{ background: vars.g50, borderColor: vars.g200 }}>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Date Range — From</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Date Range — To</label>
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <button onClick={() => { setRangeFrom(projectStartDate); setRangeTo("2026-04-30"); }} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: vars.g200, color: vars.g600 }}>
                Reset to project start
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <StatTile label="Total Authority Trend" value={`+${activeClient.scoreTrend || 12}`} sub="vs last period" color={vars.green} icon={TrendingUp} />
              <StatTile label="Earned Media Trend" value="+6" sub="from LLM checks" color={vars.green} icon={Eye} />
              <StatTile label="Website Trend" value="+4" sub="from latest crawl" color={vars.green} icon={Globe} />
              <StatTile label="Predicted Earned Authority" value={`+${28}`} sub="next 6 months from Comms Planner" color={vars.accent} icon={Sparkles} />
              <StatTile label="PR Coverage" value={String(prCoverageCount)} sub="PR / Article / Case Study / Whitepaper" color={vars.accent} icon={FileText} />
            </div>

            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Authority trend (last 6 months)</h3>
            <div className="rounded-xl border p-4 mb-6" style={{ borderColor: vars.g200 }}>
              <div className="flex items-end gap-2 h-40">
                {monthlyTrend.map(p => (
                  <div key={p.m} className="flex-1 flex flex-col items-center gap-0.5">
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
            </div>

            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Website Content and Technical GEO Summary</h3>
            <p className="text-[12px] font-light mb-4" style={{ color: vars.g500 }}>Three technical and three content scores feed into the Website Visibility track of your Total Authority Score.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {[...websiteGeoScores.tech, ...websiteGeoScores.content].map(c => (
                <ScoreBar key={c.label} label={c.label} score={c.score} max={c.max} description={c.desc} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Score Breakdown by Category</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {categoryScores.map(cat => <ScoreBar key={cat.label} {...cat} />)}
            </div>
          </div>
        </div>
      )}

      {/* ============== PR & MARKETING ============== */}
      {activeTab === "prmkt" && (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>PR &amp; Marketing performance</h2>
            <p className="text-[13px] font-light mb-4" style={{ color: vars.g500 }}>Pulled from your Earned Media Tracker for the date range below.</p>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 p-4 rounded-xl border" style={{ background: vars.g50, borderColor: vars.g200 }}>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Date Range — From</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Date Range — To</label>
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Earned Media Authority Score" value={String(earnedAuthorityScore)} sub="weighted from tracker" color={vars.navy} icon={Sparkles} />
            <StatTile label="Earned Media Authority Trend" value="+6" sub="vs prior period" color={vars.green} icon={TrendingUp} />
            <StatTile label="Audience Reach" value={`${(audienceReach / 1_000_000).toFixed(2)}M`} sub="period total" color={vars.navy} icon={Eye} />
            <StatTile label="Authority / piece" value={String(authorityPerPiece)} sub="avg score across rows" color={vars.accent} icon={BarChart3} />
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-4" style={{ color: vars.navy }}>Coverage per key message</h3>
            <p className="text-[12px] font-light mb-4" style={{ color: vars.g500 }}>Counts only PR / Article / Case Study / Whitepaper rows from the Earned Media Tracker.</p>
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Thought Leadership per key message</h3>
              <p className="text-[11px] font-light mb-3" style={{ color: vars.g500 }}>Articles only.</p>
              <div className="space-y-2">
                {messageCoverage.map(k => (
                  <div key={k.msg} className="flex justify-between text-[12px]">
                    <span style={{ color: vars.g600 }}>{k.msg}</span>
                    <span className="font-semibold" style={{ color: vars.navy }}>{k.articles}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Press Releases per Key message</h3>
              <p className="text-[11px] font-light mb-3" style={{ color: vars.g500 }}>Press Release rows only.</p>
              <div className="space-y-2">
                {messageCoverage.map(k => (
                  <div key={k.msg} className="flex justify-between text-[12px]">
                    <span style={{ color: vars.g600 }}>{k.msg}</span>
                    <span className="font-semibold" style={{ color: vars.navy }}>{k.prs}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.navy }}>Press Release Performance</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <StatTile label="Press Releases in period" value={String(prRows.length)} color={vars.navy} icon={FileText} />
              <StatTile label="Average score / PR" value={String(prAvgScore)} sub="out of 10" color={vars.accent} icon={BarChart3} />
              <StatTile label="Top scorer" value={prRows.length ? String(Math.max(...prRows.map(r => r.score))) : "—"} sub="single PR best" color={vars.green} icon={TrendingUp} />
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
              <h3 className="text-sm font-bold uppercase tracking-[0.12em]" style={{ color: vars.navy }}>Social impact</h3>
              <select className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: vars.g200 }}>
                <option>Company LinkedIn</option>
                <option>Spencer Gallagher</option>
                <option>Helen Croydon</option>
              </select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatTile label="LinkedIn shares" value="1,820" color={vars.navy} icon={Share2} />
              <StatTile label="LinkedIn engagement" value="4.2%" color={vars.navy} icon={TrendingUp} />
              <StatTile label="Inbound DMs" value="37" color={vars.navy} icon={FileText} />
              <StatTile label="Profile views (week)" value="612" color={vars.navy} icon={Eye} />
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
              <li>Carry out more detailed searches for different aspects of the Project.</li>
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
              Search the web for earned coverage about your project across Press Releases, Articles, Case Studies, Whitepapers, Blogs, Social, Conferences, Awards and Directories. Each item is scored across Claude, Gemini, ChatGPT, Perplexity and CoPilot.
            </p>
            <CalloutBrief title="LLM brief">
              <p>You are acting as a senior UK PR media-coverage and earned media reference list builder.</p>
              <p>Using the business information on the Project Data document, you are given permission to web-search and verify coverage before answering.</p>
              <p>Search the web between <strong>[dates selected]</strong> in <strong>[region selected]</strong> for media coverage and references in other earned media including conferences, awards, directories and lists of the company identified and described in the Project Data.</p>
              <div>
                <p className="not-italic font-semibold mb-1" style={{ color: "#102B36" }}>Return:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Content title or headline of coverage or reference, including link to article or reference</li>
                  <li>Type (Press Release / Article / Case Study / Whitepaper / Blog / Social / Conference / Award / Directory)</li>
                  <li>Publication or source name</li>
                  <li>Business category</li>
                  <li>Spokesperson (if no byline is noted or quoted in the article, return "None")</li>
                  <li>Audience reach — give a public-source figure where possible (monthly UU, print circulation, subscribers) and label as approximate; flag if unverified</li>
                  <li>Average LLM authority score out of 10 across Claude, Gemini, ChatGPT, Perplexity and CoPilot for this specific media coverage or reference</li>
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

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>From</label>
                <input type="date" value={aiSearch.from} onChange={e => setAiSearch({ ...aiSearch, from: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>To</label>
                <input type="date" value={aiSearch.to} onChange={e => setAiSearch({ ...aiSearch, to: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Region</label>
                <select value={aiSearch.region} onChange={e => setAiSearch({ ...aiSearch, region: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  {REGIONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Project search</label>
                <input value={aiSearch.project} onChange={e => setAiSearch({ ...aiSearch, project: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={runAiSearch} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: vars.accent }}>
                <Search size={14} /> Run AI Coverage Search
              </button>
              {aiSearched && (
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: vars.g200, color: vars.g600 }}>
                  <Download size={14} /> Download Report
                </button>
              )}
            </div>

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

          {/* Detailed Search */}
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-1">
              <Search size={16} color={vars.accent} />
              <h3 className="text-base font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Detailed Search</h3>
            </div>
            <p className="text-[13px] font-light mb-4" style={{ color: vars.g500 }}>Drill into a single spokesperson and approved Content Title.</p>
            <CalloutBrief title="LLM brief">
              Augment the AI Coverage Search above with: spokesperson [name] AND content title [exact match]. Return only direct mentions; weight authority score upward where the title appears verbatim in the body.
            </CalloutBrief>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Spokesperson</label>
                <select value={detailedSearch.spokesperson} onChange={e => setDetailedSearch({ ...detailedSearch, spokesperson: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  <option>All</option>
                  {Array.from(new Set(tracker.map(t => t.spokesperson))).map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.15em] block mb-1" style={{ color: vars.g500 }}>Content Title</label>
                <select value={detailedSearch.title} onChange={e => setDetailedSearch({ ...detailedSearch, title: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: vars.g200 }}>
                  <option>All</option>
                  {inRange.map(r => <option key={r.id}>{r.title}</option>)}
                </select>
              </div>
            </div>
            <button onClick={runDetailedSearch} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: vars.accent }}>
              <Search size={14} /> Detailed Search
            </button>
            {detailedSearched && detailedResults.length === 0 && (
              <p className="mt-4 text-[12px] font-light" style={{ color: vars.g500 }}>No matches in the selected date range. Adjust the spokesperson or content title and try again.</p>
            )}
            {detailedSearched && detailedResults.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr style={{ background: vars.g50 }}>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Title</th>
                      <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Publication</th>
                      <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: vars.g500 }}>Reach</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedResults.map((r, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: vars.g200 }}>
                        <td className="px-3 py-3" style={{ color: vars.navy }}>{r.title}</td>
                        <td className="px-3 py-3" style={{ color: vars.g600 }}>{r.publication}</td>
                        <td className="px-3 py-3 text-right" style={{ color: vars.g600 }}>{r.reach.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right">
                          <button onClick={() => addAiResultToTracker(r)} className="text-xs font-semibold flex items-center gap-1 ml-auto" style={{ color: vars.accent }}>
                            <Plus size={12} /> Add to Tracker
                          </button>
                        </td>
                      </tr>
                    ))}
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Earned Media Tracker spreadsheet</h3>
              <span className="text-[11px]" style={{ color: vars.g400 }}>
                {hasActiveTrackerFilters ? `${filteredTracker.length} of ${tracker.length} rows` : `${tracker.length} rows`}
              </span>
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
            <p className="text-sm font-light mb-6" style={{ color: vars.g500 }}>How your brand appears across the major AI platforms when users ask questions in your category.</p>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    {["Platform", "Mentions", "Cited", "Rank", "Sentiment", "Trend"].map(h => (
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
                      <td className="px-4 py-3.5"><span className="text-sm" style={{ color: vars.g600 }}>#{llm.rank}</span></td>
                      <td className="px-4 py-3.5">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: llm.sentiment === "Positive" ? "#EFF7F2" : vars.g100, color: llm.sentiment === "Positive" ? vars.green : vars.g500 }}>{llm.sentiment}</span>
                      </td>
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
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <Shield size={18} color={vars.accent} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Technical &amp; Schema Audit</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>Assessment of structured data, crawler access and technical signals that help AI engines understand and trust your content.</p>
            <div className="space-y-3">
              {technicalAudit.map(item => (
                <div key={item.item} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <span className="text-sm font-medium flex-shrink-0" style={{ color: vars.navy }}>{item.item}</span>
                  <div className="flex items-center gap-3 sm:ml-auto">
                    <StatusBadge status={item.status} />
                    <span className="text-xs font-light flex-1 sm:flex-initial sm:w-64" style={{ color: vars.g500 }}>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} color={vars.teal} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Content Architecture Audit</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>How well your website content is structured for AI comprehension, citation and answer extraction.</p>
            <div className="space-y-3">
              {contentAudit.map(item => (
                <div key={item.item} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <span className="text-sm font-medium flex-shrink-0" style={{ color: vars.navy }}>{item.item}</span>
                  <div className="flex items-center gap-3 sm:ml-auto">
                    <StatusBadge status={item.status} />
                    <span className="text-xs font-light flex-1 sm:flex-initial sm:w-64" style={{ color: vars.g500 }}>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: vars.cream, borderColor: "#E6D7BC" }}>
            <Calendar size={22} color={vars.gold} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: vars.navy }}>Itemised action report</p>
              <p className="text-[12px] font-light" style={{ color: vars.g600 }}>The Website Technical GEO module consumes Project Data sections 1-3 and 7-8, then produces a downloadable, itemised action list to drive these scores up.</p>
            </div>
            {onNavigate && (
              <button onClick={() => onNavigate("seo-audit")} className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex-shrink-0" style={{ background: vars.accent }}>
                Open Website Technical GEO <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

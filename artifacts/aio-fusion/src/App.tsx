import { useState } from "react";
import {
  ChevronRight,
  Lock,
  Search,
  FileEdit,
  BarChart3,
  Archive,
  Send,
  LineChart,
  ArrowRight,
  Sparkles,
  TrendingUp,
  FileText,
  Target,
  Code2,
  HelpCircle,
  MessageSquareQuote,
  Bot,
  ShieldCheck,
  MessagesSquare,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Globe,
  Tag,
  User,
  ChevronDown,
  Plus,
  Minus,
  MessageSquare,
  BookOpen,
  Scroll,
  Award,
  Radio,
  Mic2,
  PenLine,
  ClipboardList,
  ArrowUpRight,
  Lightbulb,
  ClipboardPaste,
  Upload,
  Calendar,
  Check,
  Circle,
  Zap,
  Mail,
  Shield,
  Eye,
  Building2,
  ArrowLeft,
  Users,
  Activity,
} from "lucide-react";

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

const clients: Client[] = [
  {
    id: "bluhalo",
    name: "Bluhalo",
    sector: "Agency Advisory & Intelligence",
    initials: "BH",
    color: "#4f8fff",
    contentCount: 24,
    avgScore: 73,
    scoreTrend: 12,
    activePlans: 3,
    lastActive: "Today",
    recentActivity: "Press release optimised",
  },
  {
    id: "greenfield",
    name: "Greenfield Organics",
    sector: "Food & Beverage",
    initials: "GO",
    color: "#22c55e",
    contentCount: 18,
    avgScore: 61,
    scoreTrend: 8,
    activePlans: 2,
    lastActive: "Yesterday",
    recentActivity: "Diagnostic run on blog",
  },
  {
    id: "novatech",
    name: "NovaTech Solutions",
    sector: "B2B SaaS",
    initials: "NT",
    color: "#7c5cff",
    contentCount: 12,
    avgScore: 54,
    scoreTrend: 3,
    activePlans: 1,
    lastActive: "3 days ago",
    recentActivity: "Q2 plan updated",
  },
  {
    id: "meridian",
    name: "Meridian Property Group",
    sector: "Commercial Real Estate",
    initials: "MP",
    color: "#f59e0b",
    contentCount: 9,
    avgScore: 48,
    scoreTrend: -2,
    activePlans: 1,
    lastActive: "5 days ago",
    recentActivity: "Case study drafted",
  },
  {
    id: "arclight",
    name: "Arclight Finance",
    sector: "Financial Services",
    initials: "AF",
    color: "#ef4444",
    contentCount: 6,
    avgScore: 39,
    scoreTrend: 0,
    activePlans: 0,
    lastActive: "1 week ago",
    recentActivity: "Onboarded — no content yet",
  },
];

function MiniDonut({ score, color, size = 56 }: { score: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const scoreColor = score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={vars.g100} strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreColor}
          strokeWidth="5"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        className="absolute text-sm font-bold"
        style={{ color: scoreColor }}
      >
        {score}
      </span>
    </div>
  );
}

const navItems = [
  { label: "Dashboard", id: "dashboard" },
  { label: "GEO Diagnostic", id: "diagnostic" },
  { label: "Content Optimiser", id: "optimiser" },
  { label: "Authority Planner", id: "planner" },
  { label: "Archive", id: "archive", locked: true },
  { label: "Release Gateway", id: "gateway", locked: true },
  { label: "Measure & Report", id: "measure", locked: true },
];

const vars = {
  navy: "#0a1628",
  accent: "#4f8fff",
  purple: "#7c5cff",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  g50: "#f8fafc",
  g100: "#f1f5f9",
  g200: "#e2e8f0",
  g300: "#cbd5e1",
  g400: "#94a3b8",
  g500: "#64748b",
  g600: "#475569",
};

function Sidebar({
  currentPage,
  onNavigate,
  activeClient,
  onBackToClients,
}: {
  currentPage: string;
  onNavigate: (p: string) => void;
  activeClient: Client;
  onBackToClients: () => void;
}) {
  return (
    <aside
      className="flex flex-col border-r w-[240px] flex-shrink-0 h-screen sticky top-0"
      style={{ borderColor: vars.g200, background: "white" }}
    >
      <div
        className="flex items-center gap-2.5 px-5 py-5 border-b"
        style={{ borderColor: vars.g200 }}
      >
        <div className="flex flex-col">
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: vars.navy }}
          >
            AIO Fusion
          </span>
          <span
            className="text-[10px] font-medium tracking-widest uppercase"
            style={{ color: vars.g400 }}
          >
            GEO Platform
          </span>
        </div>
      </div>
      <button
        onClick={onBackToClients}
        className="flex items-center gap-2.5 px-4 py-3 border-b text-left transition-colors hover:bg-slate-50"
        style={{ borderColor: vars.g200 }}
      >
        <ArrowLeft size={14} style={{ color: vars.g400 }} />
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: activeClient.color }}
        >
          {activeClient.initials}
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className="text-xs font-semibold truncate"
            style={{ color: vars.navy }}
          >
            {activeClient.name}
          </span>
          <span className="text-[10px] truncate" style={{ color: vars.g400 }}>
            Switch client
          </span>
        </div>
      </button>
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const isLocked = !!("locked" in item && item.locked);
          return (
            <button
              key={item.id}
              onClick={() => !isLocked && onNavigate(item.id)}
              className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
              style={{
                background: isActive
                  ? "rgba(79,143,255,0.08)"
                  : "transparent",
                color: isActive
                  ? vars.accent
                  : isLocked
                    ? vars.g400
                    : vars.g600,
                cursor: isLocked ? "not-allowed" : "pointer",
                opacity: isLocked ? 0.55 : 1,
              }}
            >
              <span className="flex-1 text-left">{item.label}</span>
              {isLocked && (
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: vars.g100, color: vars.g400 }}
                >
                  <Lock size={10} /> V2
                </span>
              )}
              {isActive && <ChevronRight size={14} />}
            </button>
          );
        })}
      </nav>
      <div
        className="px-3 py-4 border-t"
        style={{ borderColor: vars.g200 }}
      >
        <div className="flex items-center gap-3 px-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #4f8fff, #7c5cff)",
            }}
          >
            SP
          </div>
          <div className="flex flex-col">
            <span
              className="text-xs font-medium"
              style={{ color: vars.navy }}
            >
              Simpatico PR
            </span>
            <span className="text-[10px]" style={{ color: vars.g400 }}>
              Intelligence Tier
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ClientSelectorPage({
  onSelectClient,
}: {
  onSelectClient: (client: Client) => void;
}) {
  const totalContent = clients.reduce((s, c) => s + c.contentCount, 0);
  const avgScore = Math.round(
    clients.reduce((s, c) => s + c.avgScore, 0) / clients.length,
  );

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <header
        className="border-b px-8 py-5 flex items-center justify-between"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4f8fff, #7c5cff)" }}
          >
            <Sparkles size={18} color="white" />
          </div>
          <div>
            <span
              className="text-base font-semibold tracking-tight"
              style={{ color: vars.navy }}
            >
              AIO Fusion
            </span>
            <span
              className="text-[10px] font-medium tracking-widest uppercase ml-2"
              style={{ color: vars.g400 }}
            >
              GEO Platform
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #4f8fff, #7c5cff)" }}
          >
            SP
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium" style={{ color: vars.navy }}>
              Simpatico PR
            </span>
            <span className="text-[10px]" style={{ color: vars.g400 }}>
              Intelligence Tier
            </span>
          </div>
        </div>
      </header>
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: "rgba(79,143,255,0.08)", color: "#4f8fff" }}
            >
              <Building2 size={12} /> Client Hub
            </div>
          </div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: vars.navy }}
          >
            Your Clients
          </h1>
          <p className="text-sm mt-1" style={{ color: vars.g500 }}>
            Select a client to manage their GEO content and authority planning.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          {clients.map((client) => {
            const scoreColor = client.avgScore >= 70 ? "#22c55e" : client.avgScore >= 50 ? "#f59e0b" : "#ef4444";
            return (
              <div
                key={client.id}
                onClick={() => onSelectClient(client)}
                className="rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 group"
                style={{ background: "white", borderColor: vars.g200 }}
              >
                <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${client.color}, ${client.color}88)` }} />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: client.color }}
                      >
                        {client.initials}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold" style={{ color: vars.navy }}>
                          {client.name}
                        </h3>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5 inline-block"
                          style={{ background: `${client.color}10`, color: client.color }}
                        >
                          {client.sector}
                        </span>
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      className="mt-1 transition-transform group-hover:translate-x-1"
                      style={{ color: vars.g300 }}
                    />
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <MiniDonut score={client.avgScore} color={client.color} size={52} />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: vars.g400 }}>Authority Score</span>
                        {client.scoreTrend !== 0 && (
                          <span
                            className="flex items-center gap-0.5 text-[10px] font-semibold"
                            style={{ color: client.scoreTrend > 0 ? "#22c55e" : "#ef4444" }}
                          >
                            <TrendingUp size={10} style={{ transform: client.scoreTrend < 0 ? "rotate(180deg)" : "none" }} />
                            {client.scoreTrend > 0 ? "+" : ""}{client.scoreTrend}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div
                          className="rounded-md px-2 py-1.5 text-center"
                          style={{ background: vars.g50 }}
                        >
                          <p className="text-sm font-bold" style={{ color: vars.navy }}>
                            {client.contentCount}
                          </p>
                          <p className="text-[9px] uppercase tracking-wider" style={{ color: vars.g400 }}>
                            Content
                          </p>
                        </div>
                        <div
                          className="rounded-md px-2 py-1.5 text-center"
                          style={{ background: vars.g50 }}
                        >
                          <p className="text-sm font-bold" style={{ color: vars.navy }}>
                            {client.activePlans}
                          </p>
                          <p className="text-[9px] uppercase tracking-wider" style={{ color: vars.g400 }}>
                            Plans
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between pt-3 border-t"
                    style={{ borderColor: vars.g100 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Activity size={11} style={{ color: vars.g400 }} />
                      <span className="text-[11px]" style={{ color: vars.g500 }}>
                        {client.recentActivity}
                      </span>
                    </div>
                    <span className="text-[10px]" style={{ color: vars.g400 }}>
                      {client.lastActive}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DashboardPage({
  onNavigate,
  activeClient,
}: {
  onNavigate: (p: string) => void;
  activeClient: Client;
}) {
  const activeModules = [
    {
      id: "diagnostic",
      icon: Search,
      title: "GEO Diagnostic",
      description:
        "Analyse how well your content is structured for AI visibility. Get a scored report with specific actions.",
      color: "#4f8fff",
      gradient: "linear-gradient(135deg, #4f8fff, #3a7aee)",
      stats: {
        label: "6 Signal Categories",
        sub: "Authority Index Score /100",
      },
    },
    {
      id: "optimiser",
      icon: FileEdit,
      title: "Content Optimiser",
      description:
        "Transform PR content for maximum AI citation and retrieval. Side-by-side tracked changes with semantic guidance.",
      color: "#7c5cff",
      gradient: "linear-gradient(135deg, #7c5cff, #6b4ced)",
      stats: {
        label: "Before/After Scoring",
        sub: "Semantic Phrase Extraction",
      },
    },
    {
      id: "planner",
      icon: BarChart3,
      title: "Authority Planner",
      description:
        "Score your forward PR plan for predicted AI authority impact. Identify gaps and prioritise activity.",
      color: "#22c55e",
      gradient: "linear-gradient(135deg, #22c55e, #16a34a)",
      stats: {
        label: "8 Activity Categories",
        sub: "Priority Recommendations",
      },
    },
  ];
  const lockedModules = [
    {
      id: "archive",
      icon: Archive,
      title: "Content Archive",
      description:
        "House all PR content with version history, approval workflow and metadata tagging — message, spokesperson and purpose on every piece.",
    },
    {
      id: "gateway",
      icon: Send,
      title: "Release Gateway",
      description:
        "Route approved content to wire services, client websites and agent-ready publishing channels. Includes PR Agent outreach option.",
    },
    {
      id: "measure",
      icon: LineChart,
      title: "Measure & Report",
      description:
        "Track AI citation performance across ChatGPT, Perplexity, Claude and Gemini with automated client reporting.",
    },
  ];

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
            style={{
              background: "rgba(79,143,255,0.08)",
              color: "#4f8fff",
            }}
          >
            <Sparkles size={12} /> GEO Platform
          </div>
        </div>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: vars.navy }}
        >
          {activeClient.name} — Overview
        </h1>
        <p className="text-sm mt-1" style={{ color: vars.g500 }}>
          Optimise your PR content for AI visibility and citation across
          ChatGPT, Perplexity, Claude and Gemini.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div
          className="rounded-xl p-5 border"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(79,143,255,0.08)" }}
            >
              <FileText size={20} color="#4f8fff" />
            </div>
            <div>
              <p
                className="text-2xl font-bold"
                style={{ color: vars.navy }}
              >
                24
              </p>
              <p className="text-xs" style={{ color: vars.g500 }}>
                Content Analysed
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: vars.green }}
          >
            <TrendingUp size={14} /> +8 this month
          </div>
        </div>
        <div
          className="rounded-xl p-5 border"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(124,92,255,0.08)" }}
            >
              <Target size={20} color="#7c5cff" />
            </div>
            <div>
              <p
                className="text-2xl font-bold"
                style={{ color: vars.navy }}
              >
                73
              </p>
              <p className="text-xs" style={{ color: vars.g500 }}>
                Avg Authority Score
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: vars.green }}
          >
            <TrendingUp size={14} /> +12 from baseline
          </div>
        </div>
        <div
          className="rounded-xl p-5 border"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(34,197,94,0.08)" }}
            >
              <BarChart3 size={20} color="#22c55e" />
            </div>
            <div>
              <p
                className="text-2xl font-bold"
                style={{ color: vars.navy }}
              >
                3
              </p>
              <p className="text-xs" style={{ color: vars.g500 }}>
                Active Plans
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: vars.amber }}
          >
            1 needs review
          </div>
        </div>
      </div>
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: vars.g400 }}
      >
        Core Modules
      </h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {activeModules.map((mod) => (
          <div
            key={mod.id}
            onClick={() => onNavigate(mod.id)}
            className="rounded-xl border overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 group"
            style={{ background: "white", borderColor: vars.g200 }}
          >
            <div className="h-1.5" style={{ background: mod.gradient }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: `${mod.color}10` }}
                >
                  <mod.icon size={20} color={mod.color} />
                </div>
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                  style={{ color: vars.g300 }}
                />
              </div>
              <h3
                className="text-base font-semibold mb-1.5"
                style={{ color: vars.navy }}
              >
                {mod.title}
              </h3>
              <p
                className="text-sm leading-relaxed mb-4"
                style={{ color: vars.g500 }}
              >
                {mod.description}
              </p>
              <div
                className="pt-3 border-t"
                style={{ borderColor: vars.g100 }}
              >
                <p
                  className="text-xs font-medium"
                  style={{ color: mod.color }}
                >
                  {mod.stats.label}
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: vars.g400 }}
                >
                  {mod.stats.sub}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: vars.g400 }}
      >
        Coming in V2
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {lockedModules.map((mod) => (
          <div
            key={mod.id}
            className="rounded-xl border overflow-hidden opacity-50"
            style={{ background: "white", borderColor: vars.g200 }}
          >
            <div className="h-1.5" style={{ background: vars.g200 }} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: vars.g100 }}
                >
                  <mod.icon size={20} style={{ color: vars.g400 }} />
                </div>
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
                  style={{ background: vars.g100, color: vars.g400 }}
                >
                  <Lock size={10} /> Coming Soon
                </span>
              </div>
              <h3
                className="text-base font-semibold mb-1.5"
                style={{ color: vars.g500 }}
              >
                {mod.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: vars.g400 }}
              >
                {mod.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Rating = "green" | "amber" | "red";
const ratingConfig = {
  green: {
    bg: "#dcfce7",
    color: "#16a34a",
    icon: CheckCircle2,
    label: "Strong",
  },
  amber: {
    bg: "#fef3c7",
    color: "#d97706",
    icon: AlertTriangle,
    label: "Needs Work",
  },
  red: {
    bg: "#fee2e2",
    color: "#dc2626",
    icon: XCircle,
    label: "Critical",
  },
};

function DiagnosticPage({
  onNavigate,
}: {
  onNavigate: (p: string) => void;
}) {
  const [showResults, setShowResults] = useState(false);
  const signals = [
    {
      id: 1,
      title: "Schema Markup",
      icon: Code2,
      score: 8,
      rating: "green" as Rating,
      finding:
        "Organization and Article schema correctly implemented across key pages.",
      action:
        "Add FAQPage schema to your Q&A content to improve structured snippet eligibility.",
    },
    {
      id: 2,
      title: "FAQ Page Structure",
      icon: HelpCircle,
      score: 4,
      rating: "amber" as Rating,
      finding:
        "FAQ section exists but lacks structured heading hierarchy and answer-first formatting.",
      action:
        "Restructure FAQ with H2 question headings and lead each answer with a direct, quotable statement.",
    },
    {
      id: 3,
      title: "Answer-First Copy",
      icon: MessageSquareQuote,
      score: 3,
      rating: "red" as Rating,
      finding:
        "Most pages open with company background rather than direct answers to user questions.",
      action:
        "Rewrite opening paragraphs to lead with a definitive answer before providing context or credentials.",
    },
    {
      id: 4,
      title: "AI Crawler Access",
      icon: Bot,
      score: 9,
      rating: "green" as Rating,
      finding:
        "robots.txt allows all major AI crawlers. No blocking directives for GPTBot or Anthropic-AI.",
      action:
        "No changes needed. Monitor for new AI crawler user-agents quarterly.",
    },
    {
      id: 5,
      title: "Source Truth Consistency",
      icon: ShieldCheck,
      score: 6,
      rating: "amber" as Rating,
      finding:
        "Key statistics are inconsistent between About page and recent case studies.",
      action:
        "Audit and align all numerical claims, founding dates, and capability statements across the site.",
    },
    {
      id: 6,
      title: "Conversational Content",
      icon: MessagesSquare,
      score: 5,
      rating: "amber" as Rating,
      finding:
        "Content is written in formal marketing tone. Lacks natural question-answer patterns.",
      action:
        "Add conversational Q&A sections that mirror how users ask questions of AI assistants.",
    },
  ];
  const overallScore = 58;

  if (!showResults) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Search size={20} color="#4f8fff" />
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: vars.navy }}
            >
              GEO Diagnostic
            </h1>
          </div>
          <p className="text-sm" style={{ color: vars.g500 }}>
            Analyse how your content is structured for AI visibility across
            six signal categories.
          </p>
        </div>
        <div
          className="rounded-xl border p-8"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <Globe size={18} style={{ color: vars.g400 }} />
              <span
                className="text-sm font-medium"
                style={{ color: vars.g500 }}
              >
                Enter a URL or paste content to analyse
              </span>
            </div>
            <div className="mb-4">
              <div
                className="flex items-center gap-2 p-3 rounded-lg border"
                style={{
                  borderColor: vars.g200,
                  background: vars.g50,
                }}
              >
                <Globe size={16} style={{ color: vars.g400 }} />
                <span className="text-sm" style={{ color: vars.g400 }}>
                  https://example.com/services
                </span>
              </div>
              <p
                className="text-[11px] mt-1.5 flex items-center gap-1"
                style={{ color: vars.g400 }}
              >
                <Info size={11} /> Beta: paste content below for best
                results
              </p>
            </div>
            <div className="mb-6">
              <div
                className="p-4 rounded-lg border min-h-[120px] flex items-start gap-3"
                style={{
                  borderColor: vars.g200,
                  background: vars.g50,
                }}
              >
                <ClipboardPaste
                  size={16}
                  className="mt-0.5"
                  style={{ color: vars.g400 }}
                />
                <span className="text-sm" style={{ color: vars.g400 }}>
                  Paste your page content here...
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowResults(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
                style={{ background: "#4f8fff" }}
              >
                <Search size={16} /> Run Diagnostic
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                style={{ borderColor: vars.g200, color: vars.g600 }}
              >
                <Upload size={16} /> Upload Document
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Search size={20} color="#4f8fff" />
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: vars.navy }}
            >
              GEO Diagnostic
            </h1>
          </div>
          <p className="text-sm" style={{ color: vars.g500 }}>
            Analyse how your content is structured for AI visibility across
            six signal categories.
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: "#4f8fff" }}
        >
          <Download size={16} /> Download Report
        </button>
      </div>
      <div
        className="rounded-xl border p-6 mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Globe size={16} style={{ color: vars.g400 }} />
          <span
            className="text-sm font-medium"
            style={{ color: vars.g500 }}
          >
            Analysing
          </span>
        </div>
        <div
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{ background: vars.g50 }}
        >
          <FileText size={18} style={{ color: vars.g400 }} />
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: vars.navy }}
            >
              simpatico-pr.co.uk — Services Page
            </p>
            <p className="text-xs" style={{ color: vars.g400 }}>
              Pasted content · 2,340 words · Analysed just now
            </p>
          </div>
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="p-6 flex items-center gap-8 rounded-t-xl"
          style={{
            background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
          }}
        >
          <div className="flex flex-col items-center">
            <div className="relative">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="8"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="8"
                  strokeDasharray={`${(overallScore / 100) * 327} 327`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-3xl font-bold"
                  style={{ color: vars.navy }}
                >
                  {overallScore}
                </span>
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: vars.g400 }}
                >
                  out of 100
                </span>
              </div>
            </div>
            <p
              className="text-sm font-medium mt-3"
              style={{ color: vars.navy }}
            >
              Authority Index
            </p>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4">
            {(["green", "amber", "red"] as Rating[]).map((rating) => {
              const count = signals.filter(
                (s) => s.rating === rating,
              ).length;
              const config = ratingConfig[rating];
              return (
                <div
                  key={rating}
                  className="rounded-lg p-3 border"
                  style={{ background: "white", borderColor: vars.g200 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <config.icon size={16} color={config.color} />
                    <span
                      className="text-xs font-medium"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: vars.navy }}
                  >
                    {count}
                  </p>
                  <p className="text-[11px]" style={{ color: vars.g400 }}>
                    signal{count !== 1 ? "s" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="space-y-3 mb-8">
        {signals.map((signal) => {
          const config = ratingConfig[signal.rating];
          return (
            <div
              key={signal.id}
              className="rounded-xl border p-5"
              style={{ background: "white", borderColor: vars.g200 }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${config.color}10` }}
                >
                  <signal.icon size={20} color={config.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3
                      className="text-sm font-semibold"
                      style={{ color: vars.navy }}
                    >
                      Signal {signal.id}: {signal.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-bold"
                        style={{ color: config.color }}
                      >
                        {signal.score}/10
                      </span>
                      <span
                        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          background: config.bg,
                          color: config.color,
                        }}
                      >
                        <config.icon size={10} /> {config.label}
                      </span>
                    </div>
                  </div>
                  <p
                    className="text-sm mb-2"
                    style={{ color: vars.g500 }}
                  >
                    {signal.finding}
                  </p>
                  <div
                    className="flex items-start gap-2 p-3 rounded-lg"
                    style={{ background: vars.g50 }}
                  >
                    <Info
                      size={14}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: vars.accent }}
                    />
                    <p
                      className="text-xs font-medium"
                      style={{ color: vars.navy }}
                    >
                      {signal.action}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="rounded-xl border p-5 flex items-center justify-between"
        style={{
          background: "rgba(79,143,255,0.03)",
          borderColor: "rgba(79,143,255,0.15)",
        }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: vars.navy }}
          >
            Ready to improve your score?
          </h3>
          <p className="text-xs mt-0.5" style={{ color: vars.g500 }}>
            Take your diagnostic findings into the Content Optimiser to
            start addressing each signal.
          </p>
        </div>
        <button
          onClick={() => onNavigate("optimiser")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: "#4f8fff" }}
        >
          Open Content Optimiser <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function OptimiserPage({
  onNavigate,
}: {
  onNavigate: (p: string) => void;
}) {
  const [showResults, setShowResults] = useState(false);
  const semanticPhrases = [
    { phrase: "independent agency advisory", relevance: 0.94 },
    { phrase: "benchmarking dataset", relevance: 0.91 },
    { phrase: "AI agent network", relevance: 0.88 },
    { phrase: "peer intelligence", relevance: 0.85 },
    { phrase: "agency performance metrics", relevance: 0.82 },
    { phrase: "autonomous agent communication", relevance: 0.79 },
    { phrase: "gross profit margin benchmark", relevance: 0.76 },
    { phrase: "professional network for agencies", relevance: 0.73 },
  ];
  const trackedChanges = [
    {
      type: "addition" as const,
      label: "Answer-First Structure",
      original:
        "Spencer Gallagher and Mark Sainthill, co-founders of Bluhalo, the independent agency advisory and intelligence practice, today announced the launch of The Agency Agentic Collective.",
      revised:
        "The Agency Agentic Collective is the first professional network where independent agencies are represented by dedicated AI agents. Launched by Spencer Gallagher and Mark Sainthill of Bluhalo, the platform replaces passive networking with autonomous peer intelligence.",
      annotation:
        "Opening restructured to lead with a definitive, quotable answer. LLMs prioritise the first sentence for citation and summary extraction.",
    },
    {
      type: "modification" as const,
      label: "Source Attribution Signal",
      original:
        "Unlike conventional professional networks, The Agency Agentic Collective operates at machine speed.",
      revised:
        "According to the founders, The Agency Agentic Collective operates at machine speed, differentiating it from conventional professional networks by replacing human-initiated networking with automated agent cycles.",
      annotation:
        "Added attribution signal ('According to the founders') and expanded the differentiator into a standalone, extractable claim.",
    },
    {
      type: "addition" as const,
      label: "Conversational Query Alignment",
      original: "",
      revised:
        "What does an AI agent do inside the Collective? Each agency's agent runs automated discovery cycles every 15 minutes, matching peer agencies by sector and capability, querying anonymised benchmark data, and flagging opportunities for human review.",
      annotation:
        "Inserted Q&A block matching natural conversational queries. This structure aligns with how users ask questions of AI assistants.",
    },
    {
      type: "modification" as const,
      label: "Semantic Phrase Density",
      original:
        "The platform launches with Bluhalo's proprietary benchmarking dataset as its intelligence backbone.",
      revised:
        "The platform launches with Bluhalo's proprietary agency benchmarking dataset covering 75 performance metrics — including gross profit margin, revenue per head, and utilisation rates — drawn from 196 live advisory engagements.",
      annotation:
        "Expanded with high-relevance semantic phrases. Key metrics named explicitly to increase likelihood of citation in LLM responses about agency benchmarks.",
    },
  ];

  if (!showResults) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <FileEdit size={20} color="#7c5cff" />
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: vars.navy }}
            >
              Content Optimiser
            </h1>
          </div>
          <p className="text-sm" style={{ color: vars.g500 }}>
            Transform PR content for maximum AI citation and retrieval
            across large language models.
          </p>
        </div>
        <div
          className="rounded-xl border p-8"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="max-w-lg mx-auto">
            <div className="mb-5">
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: vars.g500 }}
              >
                Content Type
              </label>
              <div
                className="flex items-center gap-2 p-3 rounded-lg border"
                style={{ borderColor: vars.g200 }}
              >
                <span className="text-sm" style={{ color: vars.navy }}>
                  Press Release
                </span>
                <ChevronDown
                  size={14}
                  style={{ color: vars.g400 }}
                  className="ml-auto"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: vars.g500 }}
                >
                  Spokesperson
                </label>
                <div
                  className="flex items-center gap-2 p-3 rounded-lg border"
                  style={{ borderColor: vars.g200 }}
                >
                  <User size={14} style={{ color: vars.g400 }} />
                  <span
                    className="text-sm"
                    style={{ color: vars.g400 }}
                  >
                    Name and title...
                  </span>
                </div>
              </div>
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: vars.g500 }}
                >
                  LLM Target
                </label>
                <div
                  className="flex items-center gap-2 p-3 rounded-lg border"
                  style={{ borderColor: vars.g200 }}
                >
                  <span className="text-sm" style={{ color: vars.navy }}>
                    General (All LLMs)
                  </span>
                  <ChevronDown
                    size={14}
                    style={{ color: vars.g400 }}
                    className="ml-auto"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: vars.g500 }}
                >
                  Key Message
                </label>
                <div
                  className="flex items-center gap-2 p-3 rounded-lg border"
                  style={{ borderColor: vars.g200 }}
                >
                  <Tag size={14} style={{ color: vars.g400 }} />
                  <span className="text-sm" style={{ color: vars.g400 }}>
                    Core message to optimise around...
                  </span>
                </div>
              </div>
              <div>
                <label
                  className="text-xs font-medium mb-1.5 block"
                  style={{ color: vars.g500 }}
                >
                  Purpose
                </label>
                <div
                  className="flex items-center gap-2 p-3 rounded-lg border"
                  style={{ borderColor: vars.g200 }}
                >
                  <Target size={14} style={{ color: vars.g400 }} />
                  <span className="text-sm" style={{ color: vars.g400 }}>
                    e.g. Product launch, Thought leadership...
                  </span>
                </div>
              </div>
            </div>
            <div className="mb-6">
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: vars.g500 }}
              >
                Paste Your Content
              </label>
              <div
                className="p-4 rounded-lg border min-h-[140px] flex items-start gap-3"
                style={{
                  borderColor: vars.g200,
                  background: vars.g50,
                }}
              >
                <ClipboardPaste
                  size={16}
                  className="mt-0.5"
                  style={{ color: vars.g400 }}
                />
                <span className="text-sm" style={{ color: vars.g400 }}>
                  Paste your press release, article, case study or
                  whitepaper here...
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowResults(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ background: "#7c5cff" }}
            >
              <Sparkles size={16} /> Optimise Content
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileEdit size={20} color="#7c5cff" />
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: vars.navy }}
            >
              Content Optimiser
            </h1>
          </div>
          <p className="text-sm" style={{ color: vars.g500 }}>
            Transform PR content for maximum AI citation and retrieval
            across large language models.
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: "#7c5cff" }}
        >
          <Download size={16} /> Export Optimised
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div
          className="rounded-xl border p-4"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <User size={14} style={{ color: vars.g400 }} />
            <span
              className="text-xs font-medium"
              style={{ color: vars.g500 }}
            >
              Spokesperson
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: vars.navy }}>
            Spencer Gallagher, Co-Founder
          </p>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} style={{ color: vars.g400 }} />
            <span
              className="text-xs font-medium"
              style={{ color: vars.g500 }}
            >
              Key Message
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: vars.navy }}>
            AI-powered professional network for agencies
          </p>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} style={{ color: vars.g400 }} />
            <span
              className="text-xs font-medium"
              style={{ color: vars.g500 }}
            >
              LLM Target
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium"
              style={{ color: vars.navy }}
            >
              General (All LLMs)
            </span>
            <ChevronDown size={14} style={{ color: vars.g400 }} />
          </div>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Target size={14} style={{ color: vars.g400 }} />
            <span
              className="text-xs font-medium"
              style={{ color: vars.g500 }}
            >
              Purpose
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: vars.navy }}>
            Product Launch
          </p>
        </div>
      </div>
      <div
        className="rounded-xl border p-4 mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-wider mb-3"
          style={{ color: vars.g400 }}
        >
          Content Workflow
        </p>
        <div className="flex items-center justify-between">
          {[
            { icon: PenLine, label: "Write", done: true },
            { icon: Sparkles, label: "Optimise", done: true },
            { icon: Tag, label: "Tag", done: true },
            { icon: Eye, label: "Client Approval", done: false },
            { icon: Send, label: "Distribute", done: false },
          ].map((step, i, arr) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: step.done ? "#dcfce7" : vars.g100,
                  }}
                >
                  {step.done ? (
                    <Check size={14} color="#16a34a" />
                  ) : (
                    <step.icon size={14} style={{ color: vars.g400 }} />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: step.done ? "#16a34a" : vars.g400 }}
                >
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div
                  className="flex-1 h-px mx-1"
                  style={{ background: step.done ? "#bbf7d0" : vars.g200 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div
          className="rounded-xl border p-5 text-center"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wider mb-1"
            style={{ color: vars.g500 }}
          >
            Before
          </p>
          <div className="flex items-center justify-center gap-2">
            <span
              className="text-3xl font-bold"
              style={{ color: "#ef4444" }}
            >
              42
            </span>
            <span className="text-xs" style={{ color: vars.g400 }}>
              /100
            </span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>
            Authority Signal Score
          </p>
        </div>
        <div
          className="rounded-xl border p-5 text-center"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <p
            className="text-xs font-medium uppercase tracking-wider mb-1"
            style={{ color: vars.g500 }}
          >
            After
          </p>
          <div className="flex items-center justify-center gap-2">
            <span
              className="text-3xl font-bold"
              style={{ color: "#22c55e" }}
            >
              78
            </span>
            <span className="text-xs" style={{ color: vars.g400 }}>
              /100
            </span>
            <span
              className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#dcfce7", color: "#16a34a" }}
            >
              <TrendingUp size={12} /> +36
            </span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: vars.g400 }}>
            Authority Signal Score
          </p>
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ background: vars.g50, borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} color="#7c5cff" />
            <h2
              className="text-sm font-semibold"
              style={{ color: vars.navy }}
            >
              Tracked Changes
            </h2>
          </div>
          <span className="text-xs" style={{ color: vars.g400 }}>
            {trackedChanges.length} optimisations applied
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: vars.g100 }}>
          {trackedChanges.map((change, i) => (
            <div key={i} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    background:
                      change.type === "addition"
                        ? "#dcfce7"
                        : "#dbeafe",
                    color:
                      change.type === "addition"
                        ? "#16a34a"
                        : "#2563eb",
                  }}
                >
                  {change.type === "addition" ? (
                    <Plus size={10} />
                  ) : (
                    <Minus size={10} />
                  )}{" "}
                  {change.type === "addition" ? "Added" : "Modified"}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: vars.navy }}
                >
                  {change.label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                {change.original && (
                  <div
                    className="p-3 rounded-lg text-sm leading-relaxed"
                    style={{ background: "#fef2f2", color: "#991b1b" }}
                  >
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: "#dc2626" }}
                    >
                      Original
                    </p>
                    {change.original}
                  </div>
                )}
                <div
                  className={`p-3 rounded-lg text-sm leading-relaxed ${!change.original ? "col-span-2" : ""}`}
                  style={{ background: "#f0fdf4", color: "#166534" }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "#16a34a" }}
                  >
                    {change.original ? "Optimised" : "New Content"}
                  </p>
                  {change.revised}
                </div>
              </div>
              <div
                className="flex items-start gap-2 p-3 rounded-lg"
                style={{ background: vars.g50 }}
              >
                <MessageSquare
                  size={13}
                  className="mt-0.5 flex-shrink-0"
                  color="#7c5cff"
                />
                <p className="text-xs" style={{ color: vars.g600 }}>
                  {change.annotation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="px-5 py-3 border-b"
          style={{ background: vars.g50, borderColor: vars.g200 }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: vars.navy }}
          >
            Semantic Phrase Guide
          </h2>
          <p className="text-xs mt-0.5" style={{ color: vars.g400 }}>
            Key phrases LLMs are most likely to extract and cite from this
            content
          </p>
        </div>
        <div className="p-5 space-y-2">
          {semanticPhrases.map((phrase, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-sm font-medium"
                    style={{ color: vars.navy }}
                  >
                    {phrase.phrase}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "#7c5cff" }}
                  >
                    {(phrase.relevance * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: vars.g100 }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${phrase.relevance * 100}%`,
                      background:
                        "linear-gradient(90deg, #7c5cff, #4f8fff)",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="px-5 py-3 border-b flex items-center gap-2"
          style={{ background: vars.g50, borderColor: vars.g200 }}
        >
          <Zap size={14} color="#7c5cff" />
          <h2
            className="text-sm font-semibold"
            style={{ color: vars.navy }}
          >
            Next Step — What would you like to do with this content?
          </h2>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <button
            className="p-4 rounded-xl border-2 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
            style={{ borderColor: "rgba(124,92,255,0.3)", background: "rgba(124,92,255,0.02)" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(124,92,255,0.08)" }}
              >
                <Bot size={20} color="#7c5cff" />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: vars.navy }}>
                  Send to PR Agent
                </p>
                <p className="text-[11px]" style={{ color: vars.g400 }}>
                  Automated outreach
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: vars.g500 }}>
              Hand off to the AI PR Agent for journalist identification, personalised pitch drafting and monitored outreach.
            </p>
          </button>
          <button
            className="p-4 rounded-xl border-2 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
            style={{ borderColor: vars.g200 }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: vars.g100 }}
              >
                <Mail size={20} style={{ color: vars.g500 }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: vars.navy }}>
                  Pitch Manually
                </p>
                <p className="text-[11px]" style={{ color: vars.g400 }}>
                  Download &amp; distribute yourself
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: vars.g500 }}>
              Export the optimised content and handle journalist outreach, wire distribution and client sign-off through your existing process.
            </p>
          </button>
        </div>
      </div>
      <div
        className="rounded-xl border p-5 flex items-center justify-between"
        style={{
          background: "rgba(124,92,255,0.03)",
          borderColor: "rgba(124,92,255,0.15)",
        }}
      >
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ color: vars.navy }}
          >
            Add this to your Authority Plan?
          </h3>
          <p className="text-xs mt-0.5" style={{ color: vars.g500 }}>
            Track this optimised content as an activation in your
            Authority Planner.
          </p>
        </div>
        <button
          onClick={() => onNavigate("planner")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: "#7c5cff" }}
        >
          Add to Planner <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function PlannerPage() {
  const [selectedQuarter, setSelectedQuarter] = useState("Q2 2026");
  const quarters = ["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"];
  const scheduledItems = [
    {
      title: "Agency Agentic Collective Launch",
      category: "Press Release",
      date: "14 Apr 2026",
      message: "AI-powered professional network for agencies",
      spokesperson: "Spencer Gallagher",
      purpose: "Product Launch",
      status: "optimised" as const,
    },
    {
      title: "Agency Benchmark Report 2026",
      category: "Original Research",
      date: "28 Apr 2026",
      message: "Independent agency performance benchmarks",
      spokesperson: "Mark Sainthill",
      purpose: "Thought Leadership",
      status: "draft" as const,
    },
    {
      title: "AI Visibility for PR Agencies",
      category: "Speaking",
      date: "15 May 2026",
      message: "GEO as competitive advantage for PR",
      spokesperson: "Spencer Gallagher",
      purpose: "Industry Education",
      status: "planned" as const,
    },
    {
      title: "PR Week Agency Growth Feature",
      category: "Press Release",
      date: "2 Jun 2026",
      message: "Simpatico growth strategy and client wins",
      spokesperson: "Patrick O'Neill",
      purpose: "Agency Profile",
      status: "planned" as const,
    },
    {
      title: "How AI Agents Are Changing Media Relations",
      category: "LinkedIn / Blog",
      date: "10 Jun 2026",
      message: "AI agent utility for PR outreach",
      spokesperson: "Spencer Gallagher",
      purpose: "Thought Leadership",
      status: "draft" as const,
    },
  ];
  const categories = [
    {
      id: "press",
      icon: FileText,
      title: "Press Releases",
      count: 4,
      weight: 7,
      score: 28,
      maxScore: 40,
    },
    {
      id: "research",
      icon: BookOpen,
      title: "Original Research / Data",
      count: 1,
      weight: 10,
      score: 10,
      maxScore: 30,
    },
    {
      id: "whitepapers",
      icon: Scroll,
      title: "Whitepapers",
      count: 0,
      weight: 9,
      score: 0,
      maxScore: 27,
    },
    {
      id: "awards",
      icon: Award,
      title: "Award Submissions",
      count: 3,
      weight: 4,
      score: 12,
      maxScore: 16,
    },
    {
      id: "events",
      icon: Radio,
      title: "Owned Events / Webinars",
      count: 2,
      weight: 6,
      score: 12,
      maxScore: 18,
    },
    {
      id: "speaking",
      icon: Mic2,
      title: "Third-party Speaking",
      count: 1,
      weight: 5,
      score: 5,
      maxScore: 15,
    },
    {
      id: "content",
      icon: PenLine,
      title: "LinkedIn / Blog Content",
      count: 6,
      weight: 3,
      score: 18,
      maxScore: 18,
    },
    {
      id: "lists",
      icon: ClipboardList,
      title: "Industry Lists / Analyst",
      count: 0,
      weight: 5,
      score: 0,
      maxScore: 15,
    },
  ];
  const maxPossible = categories.reduce((s, c) => s + c.maxScore, 0);
  const totalScore = categories.reduce((s, c) => s + c.score, 0);
  const scorePercent = Math.round((totalScore / maxPossible) * 100);
  const gaps = [
    {
      category: "Whitepapers",
      severity: "critical" as const,
      message:
        "No whitepapers planned. This is the second-highest weighted category for AI authority. Adding one whitepaper would increase your plan score by 15%.",
    },
    {
      category: "Industry Lists / Analyst",
      severity: "warning" as const,
      message:
        "No analyst or industry list entries planned. These provide third-party validation signals that strengthen AI citation probability.",
    },
    {
      category: "Original Research",
      severity: "warning" as const,
      message:
        "Only 1 research publication planned. Original data publications are the highest-weighted AI authority signal. Consider adding a second data release.",
    },
  ];

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={20} color="#22c55e" />
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: vars.navy }}
            >
              Authority Planner
            </h1>
          </div>
          <p className="text-sm" style={{ color: vars.g500 }}>
            Plan and score your PR schedule for predicted AI authority impact.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg border" style={{ borderColor: vars.g200, background: "white" }}>
            {quarters.map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuarter(q)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: selectedQuarter === q ? "#22c55e" : "transparent",
                  color: selectedQuarter === q ? "white" : vars.g500,
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: "#22c55e" }}
          >
            <Download size={16} /> Export Plan
          </button>
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="p-6 flex items-center gap-8"
          style={{
            background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
          }}
        >
          <div className="flex flex-col items-center">
            <div className="relative">
              <svg width="140" height="140" viewBox="0 0 140 140">
                <circle
                  cx="70"
                  cy="70"
                  r="60"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="10"
                />
                <circle
                  cx="70"
                  cy="70"
                  r="60"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="10"
                  strokeDasharray={`${(scorePercent / 100) * 377} 377`}
                  strokeLinecap="round"
                  transform="rotate(-90 70 70)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="text-4xl font-bold"
                  style={{ color: vars.navy }}
                >
                  {scorePercent}
                </span>
                <span
                  className="text-[11px] uppercase tracking-wider"
                  style={{ color: vars.g400 }}
                >
                  Plan Score
                </span>
              </div>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-4">
            <div
              className="rounded-lg p-3 border"
              style={{ background: "white", borderColor: vars.g200 }}
            >
              <p
                className="text-[11px] uppercase tracking-wider mb-1"
                style={{ color: vars.g400 }}
              >
                Total Activations
              </p>
              <p
                className="text-2xl font-bold"
                style={{ color: vars.navy }}
              >
                {categories.reduce((s, c) => s + c.count, 0)}
              </p>
            </div>
            <div
              className="rounded-lg p-3 border"
              style={{ background: "white", borderColor: vars.g200 }}
            >
              <p
                className="text-[11px] uppercase tracking-wider mb-1"
                style={{ color: vars.g400 }}
              >
                Categories Active
              </p>
              <p
                className="text-2xl font-bold"
                style={{ color: vars.navy }}
              >
                {categories.filter((c) => c.count > 0).length}/
                {categories.length}
              </p>
            </div>
            <div
              className="rounded-lg p-3 border"
              style={{ background: "white", borderColor: vars.g200 }}
            >
              <p
                className="text-[11px] uppercase tracking-wider mb-1"
                style={{ color: vars.g400 }}
              >
                Gaps Found
              </p>
              <p
                className="text-2xl font-bold"
                style={{ color: "#f59e0b" }}
              >
                {gaps.length}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="px-5 py-3 border-b"
          style={{ background: vars.g50, borderColor: vars.g200 }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: vars.navy }}
          >
            Category Breakdown
          </h2>
        </div>
        <div className="divide-y" style={{ borderColor: vars.g100 }}>
          {categories.map((cat) => {
            const fillPercent =
              cat.maxScore > 0 ? (cat.score / cat.maxScore) * 100 : 0;
            return (
              <div
                key={cat.id}
                className="px-5 py-4 flex items-center gap-4"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background:
                      cat.count > 0
                        ? "rgba(34,197,94,0.06)"
                        : vars.g100,
                  }}
                >
                  <cat.icon
                    size={18}
                    color={cat.count > 0 ? "#22c55e" : "#94a3b8"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className="text-sm font-medium"
                      style={{ color: vars.navy }}
                    >
                      {cat.title}
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-xs"
                        style={{ color: vars.g400 }}
                      >
                        {cat.count} planned
                      </span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            cat.weight >= 8
                              ? "#dcfce7"
                              : cat.weight >= 5
                                ? "#fef3c7"
                                : vars.g100,
                          color:
                            cat.weight >= 8
                              ? "#16a34a"
                              : cat.weight >= 5
                                ? "#d97706"
                                : vars.g500,
                        }}
                      >
                        Weight: {cat.weight}/10
                      </span>
                    </div>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: vars.g100 }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${fillPercent}%`,
                        background:
                          fillPercent >= 70
                            ? "linear-gradient(90deg, #22c55e, #16a34a)"
                            : fillPercent > 0
                              ? "linear-gradient(90deg, #f59e0b, #eab308)"
                              : "#e2e8f0",
                      }}
                    />
                  </div>
                  <span
                    className="text-[11px]"
                    style={{ color: vars.g400 }}
                  >
                    {cat.score} / {cat.maxScore} points
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden mb-6"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ background: vars.g50, borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-2">
            <Calendar size={14} color="#22c55e" />
            <h2
              className="text-sm font-semibold"
              style={{ color: vars.navy }}
            >
              Scheduled Activations
            </h2>
          </div>
          <span className="text-xs" style={{ color: vars.g400 }}>
            {scheduledItems.length} items in {selectedQuarter}
          </span>
        </div>
        <div className="divide-y" style={{ borderColor: vars.g100 }}>
          {scheduledItems.map((item, i) => (
            <div key={i} className="px-5 py-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(34,197,94,0.06)" }}
                  >
                    <Calendar size={14} color="#22c55e" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: vars.navy }}>
                      {item.title}
                    </p>
                    <p className="text-[11px]" style={{ color: vars.g400 }}>
                      {item.category} · {item.date}
                    </p>
                  </div>
                </div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    background: item.status === "optimised" ? "#dcfce7" : item.status === "draft" ? "#fef3c7" : vars.g100,
                    color: item.status === "optimised" ? "#16a34a" : item.status === "draft" ? "#d97706" : vars.g500,
                  }}
                >
                  {item.status}
                </span>
              </div>
              <div className="flex items-center gap-4 ml-11">
                <div className="flex items-center gap-1.5">
                  <Tag size={11} style={{ color: vars.g400 }} />
                  <span className="text-[11px]" style={{ color: vars.g500 }}>
                    {item.message}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User size={11} style={{ color: vars.g400 }} />
                  <span className="text-[11px]" style={{ color: vars.g500 }}>
                    {item.spokesperson}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Target size={11} style={{ color: vars.g400 }} />
                  <span className="text-[11px]" style={{ color: vars.g500 }}>
                    {item.purpose}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div
            className="px-5 py-3 border-b flex items-center gap-2"
            style={{ background: vars.g50, borderColor: vars.g200 }}
          >
            <AlertTriangle size={14} color="#d97706" />
            <h2
              className="text-sm font-semibold"
              style={{ color: vars.navy }}
            >
              Gap Analysis
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {gaps.map((gap, i) => (
              <div
                key={i}
                className="p-3 rounded-lg"
                style={{
                  background:
                    gap.severity === "critical"
                      ? "#fef2f2"
                      : "#fffbeb",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background:
                        gap.severity === "critical"
                          ? "#fee2e2"
                          : "#fef3c7",
                      color:
                        gap.severity === "critical"
                          ? "#dc2626"
                          : "#d97706",
                    }}
                  >
                    {gap.severity}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: vars.navy }}
                  >
                    {gap.category}
                  </span>
                </div>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: vars.g600 }}
                >
                  {gap.message}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div
            className="px-5 py-3 border-b flex items-center gap-2"
            style={{ background: vars.g50, borderColor: vars.g200 }}
          >
            <TrendingUp size={14} color="#16a34a" />
            <h2
              className="text-sm font-semibold"
              style={{ color: vars.navy }}
            >
              Over-Represented
            </h2>
          </div>
          <div className="p-4">
            <div className="p-3 rounded-lg" style={{ background: "#f0fdf4" }}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={12} color="#16a34a" />
                <span
                  className="text-xs font-semibold"
                  style={{ color: vars.navy }}
                >
                  LinkedIn / Blog Content
                </span>
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: vars.g600 }}
              >
                6 posts planned — already at maximum impact for this
                category. Additional posts offer diminishing returns for
                AI authority.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div
          className="px-5 py-3 border-b flex items-center gap-2"
          style={{
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(79,143,255,0.04))",
            borderColor: vars.g200,
          }}
        >
          <Lightbulb size={16} color="#22c55e" />
          <h2
            className="text-sm font-semibold"
            style={{ color: vars.navy }}
          >
            Priority Recommendation
          </h2>
        </div>
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
              }}
            >
              <Target size={24} color="white" />
            </div>
            <div>
              <h3
                className="text-base font-semibold mb-1"
                style={{ color: vars.navy }}
              >
                Publish a whitepaper this quarter
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: vars.g500 }}
              >
                Your plan has no whitepapers scheduled, yet this is the
                second-highest weighted category for AI authority (9/10).
                A single whitepaper on a core topic — such as "How
                Independent Agencies Can Measure AI Visibility" — would
                increase your plan score by approximately 15 points and
                provide the most impactful single addition to your Q2
                strategy.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "#dcfce7", color: "#16a34a" }}
                >
                  <ArrowUpRight size={12} /> +15% predicted plan score
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [currentPage, setCurrentPage] = useState("dashboard");

  if (!activeClient) {
    return (
      <ClientSelectorPage
        onSelectClient={(client) => {
          setActiveClient(client);
          setCurrentPage("dashboard");
        }}
      />
    );
  }

  return (
    <div className="flex h-screen w-full font-['Inter',sans-serif]" style={{ background: vars.g50 }}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        activeClient={activeClient}
        onBackToClients={() => setActiveClient(null)}
      />
      <main className="flex-1 overflow-y-auto" style={{ background: vars.g50 }}>
        {currentPage === "dashboard" && (
          <DashboardPage onNavigate={setCurrentPage} activeClient={activeClient} />
        )}
        {currentPage === "diagnostic" && (
          <DiagnosticPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "optimiser" && (
          <OptimiserPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "planner" && <PlannerPage />}
      </main>
    </div>
  );
}

export default App;

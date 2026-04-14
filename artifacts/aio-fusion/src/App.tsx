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
  Play,
  ChevronUp,
  ExternalLink,
  Menu,
  X,
  LogIn,
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
    color: "#1f748f",
    contentCount: 24,
    avgScore: 73,
    scoreTrend: 12,
    activePlans: 3,
    lastActive: "Today",
    recentActivity: "Press release optimised",
  },
  {
    id: "merkle",
    name: "Merkle",
    sector: "Customer Experience (dentsu)",
    initials: "MK",
    color: "#2896b9",
    contentCount: 18,
    avgScore: 61,
    scoreTrend: 8,
    activePlans: 2,
    lastActive: "Yesterday",
    recentActivity: "Diagnostic run on blog",
  },
  {
    id: "kepler",
    name: "Kepler",
    sector: "Digital Marketing",
    initials: "KP",
    color: "#165265",
    contentCount: 12,
    avgScore: 54,
    scoreTrend: 3,
    activePlans: 1,
    lastActive: "3 days ago",
    recentActivity: "Q2 plan updated",
  },
  {
    id: "the7stars",
    name: "the7stars",
    sector: "Media Agency",
    initials: "7S",
    color: "#D4922A",
    contentCount: 9,
    avgScore: 48,
    scoreTrend: -2,
    activePlans: 1,
    lastActive: "5 days ago",
    recentActivity: "Case study drafted",
  },
  {
    id: "fjord",
    name: "Fjord",
    sector: "Design Innovation (Accenture Song)",
    initials: "FJ",
    color: "#C94A3E",
    contentCount: 6,
    avgScore: 39,
    scoreTrend: 0,
    activePlans: 0,
    lastActive: "1 week ago",
    recentActivity: "Onboarded, no content yet",
  },
];

function MiniDonut({ score, color, size = 56 }: { score: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const scoreColor = score >= 70 ? "#3D9B6B" : score >= 50 ? "#D4922A" : "#C94A3E";
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
  { label: "Dashboard", id: "dashboard", locked: true },
  { label: "AIO Diagnostic", id: "diagnostic" },
  { label: "Content Optimiser", id: "optimiser" },
  { label: "Authority Planner", id: "planner" },
  { label: "Archive", id: "archive", locked: true },
  { label: "Release Gateway", id: "gateway", locked: true },
  { label: "Measure & Report", id: "measure", locked: true },
];

const vars = {
  navy: "#165265",
  accent: "#1f748f",
  teal: "#2896b9",
  slate: "#1f748f",
  green: "#3D9B6B",
  amber: "#D4922A",
  red: "#C94A3E",
  lightBg: "#e0f2f7",
  lightAccent: "#b7e1ed",
  g50: "#FAFAFA",
  g100: "#F3F3F3",
  g200: "#E5E5E5",
  g300: "#D4D4D4",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#374151",
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
      className="flex flex-col border-r w-[260px] flex-shrink-0 h-screen sticky top-0"
      style={{ borderColor: vars.g200, background: "white" }}
    >
      <div
        className="flex items-center gap-3 px-6 py-6 border-b"
        style={{ borderColor: vars.g200 }}
      >
        <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-20" />
      </div>
      <button
        onClick={onBackToClients}
        className="flex items-center gap-3 px-5 py-4 border-b text-left transition-colors hover:bg-slate-50"
        style={{ borderColor: vars.g200 }}
      >
        <ArrowLeft size={14} style={{ color: vars.g400 }} />
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: activeClient.color }}
        >
          {activeClient.initials}
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className="text-[13px] font-medium truncate"
            style={{ color: vars.navy }}
          >
            {activeClient.name}
          </span>
          <span className="text-[11px] font-light truncate" style={{ color: vars.g400 }}>
            Switch client
          </span>
        </div>
      </button>
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          const isLocked = !!("locked" in item && item.locked);
          return (
            <button
              key={item.id}
              onClick={() => !isLocked && onNavigate(item.id)}
              className="flex items-center gap-3 w-full rounded-lg px-4 py-3 text-[13px] font-medium transition-colors"
              style={{
                background: isActive
                  ? "rgba(31,116,143,0.06)"
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
              background: "linear-gradient(135deg, #1f748f, #165265)",
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
        className="border-b px-10 py-6 flex items-center justify-between"
        style={{ background: "white", borderColor: vars.g200 }}
      >
        <div className="flex items-center gap-3.5">
          <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-24" />
        </div>
        <div className="flex items-center gap-3.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #1f748f, #165265)" }}
          >
            SP
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-medium" style={{ color: vars.navy }}>
              Simpatico PR
            </span>
            <span className="text-[11px] font-light" style={{ color: vars.g400 }}>
              Intelligence Tier
            </span>
          </div>
        </div>
      </header>
      <div className="px-10 py-10 max-w-5xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ background: "rgba(31,116,143,0.06)", color: "#1f748f" }}
            >
              <Building2 size={12} /> Client Hub
            </div>
          </div>
          <h1
            className="text-3xl tracking-tight"
            style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
          >
            Your Clients
          </h1>
          <p className="text-[15px] font-light mt-2" style={{ color: vars.g500 }}>
            Select a client to manage their GEO content and authority planning.
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-7">
          {clients.map((client) => {
            const scoreColor = client.avgScore >= 70 ? "#3D9B6B" : client.avgScore >= 50 ? "#D4922A" : "#C94A3E";
            return (
              <div
                key={client.id}
                onClick={() => onSelectClient(client)}
                className="rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 group"
                style={{ background: "white", borderColor: vars.g200 }}
              >
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${client.color}, ${client.color}66)` }} />
                <div className="p-7">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
                        style={{ background: client.color }}
                      >
                        {client.initials}
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold" style={{ color: vars.navy }}>
                          {client.name}
                        </h3>
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded mt-1 inline-block"
                          style={{ background: `${client.color}08`, color: client.color }}
                        >
                          {client.sector}
                        </span>
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      className="mt-1.5 transition-transform group-hover:translate-x-1"
                      style={{ color: vars.g300 }}
                    />
                  </div>
                  <div className="flex items-center gap-5 mb-5">
                    <MiniDonut score={client.avgScore} color={client.color} size={56} />
                    <div className="flex-1 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-light" style={{ color: vars.g400 }}>Authority Score</span>
                        {client.scoreTrend !== 0 && (
                          <span
                            className="flex items-center gap-0.5 text-[11px] font-semibold"
                            style={{ color: client.scoreTrend > 0 ? "#1f748f" : "#C94A3E" }}
                          >
                            <TrendingUp size={10} style={{ transform: client.scoreTrend < 0 ? "rotate(180deg)" : "none" }} />
                            {client.scoreTrend > 0 ? "+" : ""}{client.scoreTrend}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          className="rounded-lg px-3 py-2.5 text-center"
                          style={{ background: vars.g50 }}
                        >
                          <p className="text-[15px] font-bold" style={{ color: vars.navy }}>
                            {client.contentCount}
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.15em] font-medium mt-0.5" style={{ color: vars.g400 }}>
                            Content
                          </p>
                        </div>
                        <div
                          className="rounded-lg px-3 py-2.5 text-center"
                          style={{ background: vars.g50 }}
                        >
                          <p className="text-[15px] font-bold" style={{ color: vars.navy }}>
                            {client.activePlans}
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.15em] font-medium mt-0.5" style={{ color: vars.g400 }}>
                            Plans
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className="flex items-center justify-between pt-4 border-t"
                    style={{ borderColor: vars.g100 }}
                  >
                    <div className="flex items-center gap-2">
                      <Activity size={12} style={{ color: vars.g400 }} />
                      <span className="text-[12px] font-light" style={{ color: vars.g500 }}>
                        {client.recentActivity}
                      </span>
                    </div>
                    <span className="text-[11px] font-light" style={{ color: vars.g400 }}>
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
      title: "AIO Diagnostic",
      description:
        "Analyse how well your content is structured for AI visibility. Get a scored report with specific actions.",
      color: "#1f748f",
      gradient: "linear-gradient(135deg, #1f748f, #165265)",
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
      color: "#2896b9",
      gradient: "linear-gradient(135deg, #2896b9, #237474)",
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
      color: "#1f748f",
      gradient: "linear-gradient(135deg, #1f748f, #165265)",
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
        "House all PR content with version history, approval workflow and metadata tagging: message, spokesperson and purpose on every piece.",
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
              background: "rgba(31,116,143,0.06)",
              color: "#1f748f",
            }}
          >
            <Sparkles size={12} /> The AI Authority Platform
          </div>
        </div>
        <h1
          className="text-2xl tracking-tight"
          style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
        >
          {activeClient.name}: Overview
        </h1>
        <p className="text-[14px] font-light mt-2" style={{ color: vars.g500 }}>
          Optimise your PR content for AI visibility and citation across
          ChatGPT, Perplexity, Claude and Gemini.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-5 mb-10">
        <div
          className="rounded-xl p-5 border"
          style={{ background: "white", borderColor: vars.g200 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(31,116,143,0.06)" }}
            >
              <FileText size={20} color="#1f748f" />
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
              style={{ background: "rgba(40,150,185,0.08)" }}
            >
              <Target size={20} color="#2896b9" />
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
              style={{ background: "rgba(74,111,165,0.08)" }}
            >
              <BarChart3 size={20} color="#1f748f" />
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
    bg: "#EFF7F2",
    color: "#3D9B6B",
    icon: CheckCircle2,
    label: "Strong",
  },
  amber: {
    bg: "#FDF6ED",
    color: "#B8821F",
    icon: AlertTriangle,
    label: "Needs Work",
  },
  red: {
    bg: "#FBEEEC",
    color: "#B03D33",
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

  const diagnosticRows = [
    {
      action: "Authority Audit in Earned Media",
      output: "Coverage quality score, citation-readiness of press mentions, journalist attribution patterns, and media outlet authority signals.",
    },
    {
      action: "Authority Audit in Owned Media",
      output: "Website content structure score, schema markup status, FAQ optimisation, answer-first copy assessment, and AI crawler accessibility.",
    },
    {
      action: "Key competitor comparison",
      output: "Side-by-side authority benchmarking across competitors, showing citation frequency, signal category scores, and share of AI voice.",
    },
    {
      action: "Priority Actions",
      output: "Ranked list of high-impact recommendations with estimated effort and projected score improvement per action.",
    },
  ];

  if (!showResults) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Search size={20} color="#1f748f" />
            <h1
              className="text-xl tracking-tight"
              style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
            >
              AIO Diagnostic
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
            Authority and Visibility Diagnostic for AI engines.
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
                style={{ background: "#1f748f" }}
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
            <Search size={20} color="#1f748f" />
            <h1
              className="text-xl tracking-tight"
              style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
            >
              AIO Diagnostic
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
            Authority and Visibility Diagnostic for AI engines.
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: "#1f748f" }}
        >
          <Download size={16} /> Download Report
        </button>
      </div>

      <div className="rounded-xl border overflow-hidden mb-8" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="px-6 py-4 text-center" style={{ background: vars.accent }}>
          <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "'Alice', Georgia, serif" }}>
            Authority and Visibility Diagnostic
          </h2>
        </div>
        <div className="grid grid-cols-2">
          <div className="px-6 py-3 text-center font-semibold text-sm text-white" style={{ background: "rgba(31,116,143,0.75)" }}>
            Action
          </div>
          <div className="px-6 py-3 text-center font-semibold text-sm text-white" style={{ background: "rgba(31,116,143,0.75)" }}>
            Output
          </div>
        </div>
        {diagnosticRows.map((row, i) => (
          <div key={i} className="grid grid-cols-2 border-t" style={{ borderColor: vars.g200 }}>
            <div className="px-6 py-5 flex items-center justify-center text-center border-r" style={{ borderColor: vars.g200 }}>
              <span className="text-sm font-medium" style={{ color: vars.navy }}>{row.action}</span>
            </div>
            <div className="px-6 py-5 flex items-center">
              <span className="text-sm font-light leading-relaxed" style={{ color: vars.g500 }}>{row.output}</span>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 border-t" style={{ borderColor: vars.g200 }}>
          <div className="px-6 py-5 border-r" style={{ borderColor: vars.g200 }}></div>
          <div className="px-6 py-5"></div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => onNavigate("optimiser")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: "#1f748f" }}
        >
          Open Optimization Tools <ArrowRight size={14} />
        </button>
        <button
          onClick={() => setShowResults(false)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border"
          style={{ borderColor: vars.g200, color: vars.g600 }}
        >
          Run New Diagnostic
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
        "The platform launches with Bluhalo's proprietary agency benchmarking dataset covering 75 performance metrics including gross profit margin, revenue per head, and utilisation rates, drawn from 196 live advisory engagements.",
      annotation:
        "Expanded with high-relevance semantic phrases. Key metrics named explicitly to increase likelihood of citation in LLM responses about agency benchmarks.",
    },
  ];

  if (!showResults) {
    return (
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <FileEdit size={20} color="#2896b9" />
            <h1
              className="text-xl tracking-tight"
              style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
            >
              Content Optimiser
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
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
              style={{ background: "#2896b9" }}
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
            <FileEdit size={20} color="#2896b9" />
            <h1
              className="text-xl tracking-tight"
              style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
            >
              Content Optimiser
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
            Transform PR content for maximum AI citation and retrieval
            across large language models.
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: "#2896b9" }}
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
                    background: step.done ? "#EFF7F2" : vars.g100,
                  }}
                >
                  {step.done ? (
                    <Check size={14} color="#3D9B6B" />
                  ) : (
                    <step.icon size={14} style={{ color: vars.g400 }} />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: step.done ? "#3D9B6B" : vars.g400 }}
                >
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div
                  className="flex-1 h-px mx-1"
                  style={{ background: step.done ? "#C2E5D2" : vars.g200 }}
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
              style={{ color: "#C94A3E" }}
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
              style={{ color: "#1f748f" }}
            >
              78
            </span>
            <span className="text-xs" style={{ color: vars.g400 }}>
              /100
            </span>
            <span
              className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#EFF7F2", color: "#3D9B6B" }}
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
            <Sparkles size={16} color="#2896b9" />
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
                        ? "#EFF7F2"
                        : "#E8F0F8",
                    color:
                      change.type === "addition"
                        ? "#3D9B6B"
                        : "#165265",
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
                    style={{ background: "#FBEEEC", color: "#8B3328" }}
                  >
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: "#B03D33" }}
                    >
                      Original
                    </p>
                    {change.original}
                  </div>
                )}
                <div
                  className={`p-3 rounded-lg text-sm leading-relaxed ${!change.original ? "col-span-2" : ""}`}
                  style={{ background: "#EFF7F2", color: "#2D7A4F" }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: "#3D9B6B" }}
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
                  color="#2896b9"
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
                    style={{ color: "#2896b9" }}
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
                        "linear-gradient(90deg, #2896b9, #1f748f)",
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
          <Zap size={14} color="#2896b9" />
          <h2
            className="text-sm font-semibold"
            style={{ color: vars.navy }}
          >
            Next Step: What would you like to do with this content?
          </h2>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <button
            className="p-4 rounded-xl border-2 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
            style={{ borderColor: "rgba(40,150,185,0.25)", background: "rgba(40,150,185,0.02)" }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(40,150,185,0.08)" }}
              >
                <Bot size={20} color="#2896b9" />
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
          background: "rgba(40,150,185,0.03)",
          borderColor: "rgba(40,150,185,0.12)",
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
          style={{ background: "#2896b9" }}
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
            <BarChart3 size={20} color="#1f748f" />
            <h1
              className="text-xl tracking-tight"
              style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}
            >
              Authority Planner
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
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
                  background: selectedQuarter === q ? "#1f748f" : "transparent",
                  color: selectedQuarter === q ? "white" : vars.g500,
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: "#1f748f" }}
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
            background: "linear-gradient(135deg, #FAFAFA, #F3F3F3)",
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
                  stroke="#E5E5E5"
                  strokeWidth="10"
                />
                <circle
                  cx="70"
                  cy="70"
                  r="60"
                  fill="none"
                  stroke="#D4922A"
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
                style={{ color: "#D4922A" }}
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
                        ? "rgba(74,111,165,0.06)"
                        : vars.g100,
                  }}
                >
                  <cat.icon
                    size={18}
                    color={cat.count > 0 ? "#1f748f" : "#9CA3AF"}
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
                              ? "#EFF7F2"
                              : cat.weight >= 5
                                ? "#FDF6ED"
                                : vars.g100,
                          color:
                            cat.weight >= 8
                              ? "#3D9B6B"
                              : cat.weight >= 5
                                ? "#B8821F"
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
                            ? "linear-gradient(90deg, #3D9B6B, #2D7A4F)"
                            : fillPercent > 0
                              ? "linear-gradient(90deg, #D4922A, #B8821F)"
                              : "#E5E5E5",
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
            <Calendar size={14} color="#1f748f" />
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
                    style={{ background: "rgba(74,111,165,0.06)" }}
                  >
                    <Calendar size={14} color="#1f748f" />
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
                    background: item.status === "optimised" ? "#EFF7F2" : item.status === "draft" ? "#FDF6ED" : vars.g100,
                    color: item.status === "optimised" ? "#3D9B6B" : item.status === "draft" ? "#B8821F" : vars.g500,
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
            <AlertTriangle size={14} color="#B8821F" />
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
                      ? "#FBEEEC"
                      : "#FDF6ED",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background:
                        gap.severity === "critical"
                          ? "#FBEEEC"
                          : "#FDF6ED",
                      color:
                        gap.severity === "critical"
                          ? "#B03D33"
                          : "#B8821F",
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
            <TrendingUp size={14} color="#3D9B6B" />
            <h2
              className="text-sm font-semibold"
              style={{ color: vars.navy }}
            >
              Over-Represented
            </h2>
          </div>
          <div className="p-4">
            <div className="p-3 rounded-lg" style={{ background: "#EFF7F2" }}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={12} color="#3D9B6B" />
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
                6 posts planned, already at maximum impact for this
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
              "linear-gradient(135deg, rgba(74,111,165,0.04), rgba(31,116,143,0.04))",
            borderColor: vars.g200,
          }}
        >
          <Lightbulb size={16} color="#1f748f" />
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
                background: "linear-gradient(135deg, #1f748f, #165265)",
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
                A single whitepaper on a core topic, such as "How
                Independent Agencies Can Measure AI Visibility", would
                increase your plan score by approximately 15 points and
                provide the most impactful single addition to your Q2
                strategy.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: "#EFF7F2", color: "#3D9B6B" }}
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

const llmLogos = [
  { name: "ChatGPT", color: "#10A37F", icon: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
  )},
  { name: "Perplexity", color: "#1FB8CD", icon: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 1L4 5v6.5L1.5 13v5L4 19.5V23l8-4 8 4v-3.5L22.5 18v-5L20 11.5V5L12 1zm0 2.2l6 3v5.3l-6 3-6-3V6.2l6-3zM3.5 14.2l1.5-.8v2.1l4 2v2.3l-5.5-2.7v-2.9zm17 0v2.9l-5.5 2.7v-2.3l4-2v-2.1l1.5.8z"/></svg>
  )},
  { name: "Claude", color: "#D97757", icon: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.5v-3.07c-3.39-.49-6-3.4-6-6.93h2c0 2.76 2.24 5 5 5s5-2.24 5-5h2c0 3.53-2.61 6.44-6 6.93V17.5h3v2H8v-2h3z"/></svg>
  )},
  { name: "Gemini", color: "#4285F4", icon: (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15h-2v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg>
  )},
];

const agencyBrands = [
  "Simpatico PR", "Bluhalo", "Merkle", "Kepler",
  "the7stars", "Fjord", "Mindshare", "OMD UK",
];

const blogPosts = [
  { title: "The B2B Marketer's Fast Guide to Winning AI Authority in 2026", date: "10 March 2026", tag: "Guide", image: "/images/story-ai-authority.png" },
  { title: "Why Earned Media is the Key to AI Citation", date: "28 February 2026", tag: "Insight", image: "/images/story-earned-media.png" },
  { title: "How GEO is Reshaping B2B Discovery", date: "14 February 2026", tag: "Analysis", image: "/images/story-geo-reshaping.png" },
];

function GuideDownload() {
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && email) setSubmitted(true);
  };

  return (
    <section id="guide" className="py-32" style={{ background: "#F5F3F0" }}>
      <div className="max-w-6xl mx-auto px-8">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-6" style={{ background: "rgba(31,116,143,0.08)", color: vars.accent }}>
              <Download size={12} /> Free Guide
            </div>
            <h2 className="text-3xl md:text-4xl mb-6 leading-[1.15]" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              The B2B Marketer's Fast Guide to Winning AI Authority
            </h2>
            <p className="text-[15px] font-light leading-[1.8] mb-8" style={{ color: vars.g500 }}>
              Everything you need to know about Generative Engine Optimisation: why earned media dominates AI citations, how to structure content for retrieval, and the framework behind AIO Fusion.
            </p>
            <div className="space-y-4">
              {[
                "Why 82% of AI-cited content comes from earned media",
                "The 6 GEO signal categories that drive AI visibility",
                "A practical roadmap for B2B authority building",
              ].map((point) => (
                <div key={point} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(31,116,143,0.1)" }}>
                    <Check size={12} color={vars.accent} />
                  </div>
                  <span className="text-[14px] font-light" style={{ color: vars.g600 }}>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="h-3" style={{ background: `linear-gradient(90deg, ${vars.accent}, ${vars.teal})` }} />
            {!submitted ? (
              <form onSubmit={handleSubmit} className="p-10">
                <h3 className="text-xl mb-2" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                  Download the guide
                </h3>
                <p className="text-[13px] font-light mb-8" style={{ color: vars.g500 }}>
                  Enter your details to receive the PDF instantly.
                </p>
                <div className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: vars.g500 }}>Full name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-lg border text-[14px] outline-none transition-colors focus:ring-2"
                      style={{ borderColor: vars.g200, background: vars.g50, color: vars.navy }}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: vars.g500 }}>Work email *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 rounded-lg border text-[14px] outline-none transition-colors focus:ring-2"
                      style={{ borderColor: vars.g200, background: vars.g50, color: vars.navy }}
                      placeholder="jane@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.15em] mb-2" style={{ color: vars.g500 }}>Company</label>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border text-[14px] outline-none transition-colors focus:ring-2"
                      style={{ borderColor: vars.g200, background: vars.g50, color: vars.navy }}
                      placeholder="Acme Corp"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2.5 mt-8 px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: vars.accent }}
                >
                  <Download size={18} /> Get the Guide
                </button>
                <p className="text-[11px] font-light text-center mt-4" style={{ color: vars.g400 }}>
                  We respect your privacy. No spam, ever.
                </p>
              </form>
            ) : (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "rgba(61,155,107,0.1)" }}>
                  <CheckCircle2 size={32} color={vars.green} />
                </div>
                <h3 className="text-xl mb-3" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
                  Your guide is ready
                </h3>
                <p className="text-[14px] font-light mb-8" style={{ color: vars.g500 }}>
                  Thanks, {name.split(" ")[0]}. Click below to download your copy of the AI Authority Guide.
                </p>
                <a
                  href={`${import.meta.env.BASE_URL}Simpatico_PR_B2B_AI_Authority_Guide_2026.pdf`}
                  download
                  className="inline-flex items-center justify-center gap-2.5 px-10 py-4 rounded-lg text-[15px] font-semibold text-white transition-all hover:brightness-110"
                  style={{ background: vars.accent }}
                >
                  <Download size={18} /> Download PDF
                </a>
                <p className="text-[12px] font-light mt-6" style={{ color: vars.g400 }}>
                  A copy has also been sent to {email}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingPage({ onLogin }: { onLogin: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="font-['Inter',sans-serif] text-[#1C1C1C]" style={{ background: "#FAFAFA" }}>
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md" style={{ background: "rgba(22,82,101,0.92)" }}>
        <div className="max-w-7xl mx-auto px-8 h-[96px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-white.png`} alt="AIO Fusion" className="h-20" />
          </div>
          <div className="hidden md:flex items-center gap-10">
            <a href="#features" className="text-[13px] font-light text-white/60 hover:text-white transition-colors tracking-wide">Features</a>
            <a href="#how-it-works" className="text-[13px] font-light text-white/60 hover:text-white transition-colors tracking-wide">How It Works</a>
            <a href="#llms" className="text-[13px] font-light text-white/60 hover:text-white transition-colors tracking-wide">LLM Coverage</a>
            <a href="#stories" className="text-[13px] font-light text-white/60 hover:text-white transition-colors tracking-wide">Stories</a>
            <a href="#for-agencies" className="text-[13px] font-light text-white/60 hover:text-white transition-colors tracking-wide">For Agencies</a>
            <a href="#for-agents" className="text-[13px] font-light text-white/60 hover:text-white transition-colors tracking-wide">For Agents</a>
            <a href="#guide" className="text-[13px] font-light text-white/60 hover:text-white transition-colors tracking-wide">Guide</a>
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all hover:brightness-110"
              style={{ background: vars.accent }}
            >
              <LogIn size={14} /> Admin Login
            </button>
          </div>
          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden px-8 pb-5 flex flex-col gap-4" style={{ background: "rgba(22,82,101,0.98)" }}>
            <a href="#features" className="text-[13px] font-light text-white/60 py-2">Features</a>
            <a href="#how-it-works" className="text-[13px] font-light text-white/60 py-2">How It Works</a>
            <a href="#llms" className="text-[13px] font-light text-white/60 py-2">LLM Coverage</a>
            <a href="#stories" className="text-[13px] font-light text-white/60 py-2">Stories</a>
            <a href="#for-agencies" className="text-[13px] font-light text-white/60 py-2">For Agencies</a>
            <a href="#for-agents" className="text-[13px] font-light text-white/60 py-2">For Agents</a>
            <a href="#guide" className="text-[13px] font-light text-white/60 py-2">Guide</a>
            <button onClick={onLogin} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-white" style={{ background: vars.accent }}>
              <LogIn size={14} /> Admin Login
            </button>
          </div>
        )}
      </nav>

      <section className="relative min-h-[100vh] flex items-center justify-center overflow-hidden" style={{ background: vars.navy }}>
        <div className="absolute inset-0 overflow-hidden">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute w-full h-full object-cover opacity-65 scale-[1.8]"
            style={{ filter: "brightness(0.9) saturate(0.8)" }}
          >
            <source src={`${import.meta.env.BASE_URL}videos/hero-backdrop.mp4`} type="video/mp4" />
          </video>
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(22,82,101,0.25) 0%, rgba(22,82,101,0.55) 50%, rgba(22,82,101,0.92) 100%)" }} />
          <div className="absolute w-[600px] h-[600px] rounded-full opacity-15" style={{ background: "radial-gradient(circle, #1f748f 0%, transparent 70%)", top: "10%", right: "-10%", animation: "float1 20s ease-in-out infinite" }} />
          <div className="absolute w-[500px] h-[500px] rounded-full opacity-10" style={{ background: "radial-gradient(circle, #2896b9 0%, transparent 70%)", bottom: "5%", left: "-5%", animation: "float2 25s ease-in-out infinite" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>
        <style>{`
          @keyframes float1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-40px, 30px) scale(1.1); } }
          @keyframes float2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, -40px) scale(1.15); } }
        `}</style>
        <div className="relative z-10 max-w-4xl mx-auto px-8 text-center pt-16">
          <div className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 mb-10" style={{ background: "rgba(31,116,143,0.2)", border: "1px solid rgba(31,116,143,0.3)" }}>
            <Sparkles size={12} /> Generative Engine Optimisation
          </div>
          <h1 className="text-5xl md:text-[5.5rem] text-white leading-[1.05] mb-8" style={{ fontFamily: "'Alice', Georgia, serif" }}>
            Win AI Authority<br />
            <span style={{ color: vars.accent }}>for Your Brand</span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-14 leading-relaxed font-light">
            AIO Fusion by Simpatico PR helps agencies and B2B businesses become the source AI cites.
            Diagnose, optimise, and plan your content for visibility across ChatGPT, Perplexity, Claude and Gemini.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <button
              onClick={onLogin}
              className="flex items-center gap-2.5 px-10 py-4 rounded-lg text-[15px] font-semibold text-white transition-all hover:brightness-110 hover:scale-[1.02]"
              style={{ background: vars.accent }}
            >
              <LogIn size={18} /> Platform Login
            </button>
            <a
              href="#features"
              className="flex items-center gap-2.5 px-10 py-4 rounded-lg text-[15px] font-medium text-white/90 transition-all hover:bg-white/15"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Learn More <ArrowRight size={16} />
            </a>
          </div>
          <div className="mt-20 flex items-center justify-center gap-2.5 text-white/30 text-[13px] font-light tracking-wide">
            <span>Powering GEO for leading agencies</span>
            <ChevronDown size={14} className="animate-bounce" />
          </div>
        </div>
      </section>

      <section className="py-16 border-b" style={{ background: "#fff", borderColor: vars.g200 }}>
        <div className="max-w-6xl mx-auto px-8">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.25em] mb-10" style={{ color: vars.g400 }}>
            Trusted by forward-thinking agencies and brands
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-5">
            {agencyBrands.map((brand) => (
              <span key={brand} className="text-[15px] font-medium tracking-tight" style={{ color: vars.g300 }}>
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-32" style={{ background: "#FAFAFA" }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-6" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
              <Target size={12} /> Core Platform
            </div>
            <h2 className="text-4xl md:text-5xl mb-6" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Three tools, one AI authority strategy</h2>
            <p className="text-lg max-w-2xl mx-auto font-light leading-relaxed" style={{ color: vars.g500 }}>
              AIO Fusion provides a complete GEO workflow, from diagnosing how AI sees your brand, to optimising content and planning authority-building activity.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { title: "AIO Diagnostic", desc: "Analyse how well your content is structured for AI visibility. Get a scored report across 6 signal categories with specific actions.", color: vars.accent, gradient: "linear-gradient(135deg, #1f748f, #165265)", icon: FileText },
              { title: "Content Optimiser", desc: "Transform PR content for maximum AI citation and retrieval. Side-by-side tracked changes with semantic guidance and approval workflow.", color: vars.teal, gradient: "linear-gradient(135deg, #2896b9, #237474)", icon: FileEdit },
              { title: "Authority Planner", desc: "Score your forward PR plan for predicted AI authority impact. Identify gaps and prioritise activity across 8 categories.", color: vars.slate, gradient: "linear-gradient(135deg, #1f748f, #165265)", icon: BarChart3 },
            ].map((tool) => (
              <div key={tool.title} className="bg-white rounded-2xl overflow-hidden border transition-all hover:shadow-lg hover:-translate-y-1" style={{ borderColor: vars.g200 }}>
                <div className="h-1.5" style={{ background: tool.gradient }} />
                <div className="p-10">
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6" style={{ background: `${tool.color}0A` }}>
                    <tool.icon size={26} color={tool.color} />
                  </div>
                  <h3 className="text-2xl mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{tool.title}</h3>
                  <p className="text-[15px] leading-[1.75] font-light" style={{ color: vars.g500 }}>{tool.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-32" style={{ background: "#fff" }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl mb-6" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>How AIO Fusion works</h2>
            <p className="text-lg max-w-2xl mx-auto font-light leading-relaxed" style={{ color: vars.g500 }}>
              A managed service model. Simpatico PR operates the platform on behalf of clients, delivering GEO as part of a retained engagement.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-10">
            {[
              { step: "01", title: "Onboard", desc: "Client data, messaging and content are loaded into a dedicated workspace." },
              { step: "02", title: "Diagnose", desc: "Run the AIO Diagnostic to benchmark how AI currently perceives the brand." },
              { step: "03", title: "Optimise", desc: "Use the Content Optimiser to rewrite PR content for AI citation and visibility." },
              { step: "04", title: "Plan & Measure", desc: "Build a forward plan scored for authority impact and track results over time." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-xl font-light border-2" style={{ borderColor: vars.navy, color: vars.navy }}>
                  {item.step}
                </div>
                <h3 className="text-xl mb-3" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{item.title}</h3>
                <p className="text-[14px] leading-[1.75] font-light" style={{ color: vars.g500 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24" style={{ background: vars.navy }}>
        <div className="max-w-5xl mx-auto px-8 text-center">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            {[
              { value: "82%", label: "of AI-cited content comes from earned media" },
              { value: "95%", label: "of AI citations use non-paid sources" },
              { value: "40%", label: "of search queries now handled by AI" },
              { value: "30%+", label: "visibility boost via GEO methods" },
            ].map((stat) => (
              <div key={stat.value}>
                <div className="text-4xl md:text-5xl mb-3" style={{ color: vars.accent, fontFamily: "'Alice', Georgia, serif" }}>{stat.value}</div>
                <p className="text-[13px] text-white/50 leading-relaxed font-light">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="llms" className="py-32" style={{ background: "#FAFAFA" }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-6" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
              <Globe size={12} /> Coverage
            </div>
            <h2 className="text-4xl md:text-5xl mb-6" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Optimise for every major LLM</h2>
            <p className="text-lg max-w-2xl mx-auto font-light leading-relaxed" style={{ color: vars.g500 }}>
              AIO Fusion analyses and scores your content against the retrieval and citation patterns of the four dominant answer engines.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {llmLogos.map((llm) => (
              <div key={llm.name} className="bg-white rounded-2xl border p-10 flex flex-col items-center gap-5 transition-all hover:shadow-lg hover:-translate-y-1" style={{ borderColor: vars.g200 }}>
                <div className="w-18 h-18 rounded-2xl flex items-center justify-center" style={{ width: 72, height: 72, background: `${llm.color}0A`, color: llm.color }}>
                  {llm.icon}
                </div>
                <span className="text-xl" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{llm.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="stories" className="py-32" style={{ background: "#fff" }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex items-end justify-between mb-16">
            <div>
              <h2 className="text-4xl md:text-5xl mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Latest stories</h2>
              <p className="text-lg font-light" style={{ color: vars.g500 }}>Insights on AI authority, GEO strategy, and B2B PR from the Simpatico team.</p>
            </div>
            <a href="https://www.simpaticopr.co.uk/" target="_blank" rel="noopener noreferrer" className="hidden md:flex items-center gap-2 text-[13px] font-medium hover:underline" style={{ color: vars.accent }}>
              View all on simpaticopr.co.uk <ExternalLink size={13} />
            </a>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {blogPosts.map((post) => (
              <a key={post.title} href="https://www.simpaticopr.co.uk/" target="_blank" rel="noopener noreferrer" className="bg-white rounded-2xl border overflow-hidden group transition-all hover:shadow-lg hover:-translate-y-1" style={{ borderColor: vars.g200 }}>
                <div className="h-52 overflow-hidden">
                  <img src={post.image} alt={post.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>{post.tag}</span>
                    <span className="text-[13px] font-light" style={{ color: vars.g400 }}>{post.date}</span>
                  </div>
                  <h3 className="text-lg leading-snug group-hover:underline" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{post.title}</h3>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <GuideDownload />

      <section id="for-agencies" className="py-32" style={{ background: vars.g50 }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="grid md:grid-cols-2 gap-20 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-6" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
                <Building2 size={12} /> For PR & Marketing Agencies
              </div>
              <h2 className="text-4xl md:text-5xl mb-6" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Add GEO to your service offering</h2>
              <p className="text-lg font-light leading-relaxed mb-8" style={{ color: vars.g500 }}>
                AIO Fusion is built for agencies who want to offer Generative Engine Optimisation as a managed service. White-label the platform for your clients and deliver measurable AI authority results.
              </p>
              <div className="space-y-5">
                {[
                  "Dedicated client workspaces with your branding",
                  "Diagnostic, optimisation and planning tools in one platform",
                  "Measurable AI citation and visibility metrics",
                  "Managed service model: we train your team",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 flex-shrink-0" style={{ background: `${vars.accent}12` }}>
                      <Check size={12} color={vars.accent} />
                    </div>
                    <span className="text-[15px] font-light" style={{ color: vars.g600 }}>{item}</span>
                  </div>
                ))}
              </div>
              <a href="https://www.simpaticopr.co.uk/contact" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white mt-10 transition-all hover:brightness-110" style={{ background: vars.accent }}>
                <Mail size={16} /> Partner with Simpatico PR
              </a>
            </div>
            <div className="space-y-6">
              {[
                { stat: "6x", label: "Average increase in AI citation rate for agency clients" },
                { stat: "73%", label: "Of B2B buyers now use AI tools in their purchase research" },
                { stat: "8", label: "Authority categories tracked and scored per client" },
              ].map((item) => (
                <div key={item.stat} className="bg-white rounded-2xl p-8 border" style={{ borderColor: vars.g200 }}>
                  <div className="text-4xl mb-2" style={{ color: vars.accent, fontFamily: "'Alice', Georgia, serif" }}>{item.stat}</div>
                  <p className="text-[15px] font-light leading-relaxed" style={{ color: vars.g500 }}>{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="for-agents" className="py-32" style={{ background: vars.navy }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] mb-6" style={{ background: "rgba(40,150,185,0.1)", color: vars.teal }}>
              <Bot size={12} /> For AI Agents
            </div>
            <h2 className="text-4xl md:text-5xl text-white mb-6" style={{ fontFamily: "'Alice', Georgia, serif" }}>
              Agents that understand<br />your brand authority.
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto leading-relaxed font-light">
              AIO Fusion structures your brand's authority data so AI agents (ChatGPT, Perplexity, Claude, Gemini) can discover, cite, and recommend your business with confidence.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {[
              {
                title: "Structured authority signals",
                desc: "AIO Fusion analyses your content across 6 signal categories and outputs structured data that AI agents can parse: entity relationships, expertise markers, and citation-ready claims.",
                endpoint: "GET /api/authority-signals",
                color: vars.accent,
              },
              {
                title: "AI-optimised content delivery",
                desc: "Content optimised through AIO Fusion is formatted for LLM retrieval: clear assertions, attributed data, semantic structure. Your brand becomes the answer, not just a search result.",
                endpoint: "POST /api/content-optimise",
                color: vars.teal,
              },
              {
                title: "Real-time citation tracking",
                desc: "Monitor when and how AI agents cite your brand. Track citation frequency, context accuracy, and competitive positioning across all major LLMs in real time.",
                endpoint: "GET /api/citations",
                color: vars.slate,
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl p-8 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
                <h3 className="text-xl text-white mb-4" style={{ fontFamily: "'Alice', Georgia, serif" }}>{item.title}</h3>
                <p className="text-[14px] text-white/45 leading-[1.75] font-light mb-6">{item.desc}</p>
                <code className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-mono" style={{ background: "rgba(255,255,255,0.05)", color: item.color }}>
                  <Code2 size={12} /> {item.endpoint}
                </code>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div className="rounded-2xl p-10 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(40,150,185,0.15)" }}>
                  <Scroll size={18} color={vars.teal} />
                </div>
                <div>
                  <h3 className="text-lg text-white" style={{ fontFamily: "'Alice', Georgia, serif" }}>Agent instructions</h3>
                  <p className="text-[12px] text-white/40 font-light">llms.txt</p>
                </div>
              </div>
              <p className="text-[14px] text-white/45 leading-[1.75] font-light mb-6">
                A structured file at the root of your domain that tells AI agents what your business does, what your expertise is, and how to access your authority data. The GEO equivalent of robots.txt.
              </p>
              <div className="rounded-xl p-5 font-mono text-[12px] leading-relaxed" style={{ background: "rgba(0,0,0,0.3)" }}>
                <div style={{ color: vars.g400 }}># AIO Fusion: Agent Instructions</div>
                <div className="mt-2" style={{ color: vars.teal }}>name: AIO Fusion by Simpatico PR</div>
                <div style={{ color: vars.teal }}>type: The AI Authority Platform</div>
                <div style={{ color: vars.teal }}>expertise: Generative Engine Optimisation</div>
                <div className="mt-2" style={{ color: vars.g400 }}># Endpoints</div>
                <div style={{ color: vars.accent }}>authority_signals: /api/authority-signals</div>
                <div style={{ color: vars.accent }}>content_optimise: /api/content-optimise</div>
                <div style={{ color: vars.accent }}>citations: /api/citations</div>
              </div>
            </div>
            <div className="rounded-2xl p-10 border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(31,116,143,0.15)" }}>
                  <ShieldCheck size={18} color={vars.accent} />
                </div>
                <div>
                  <h3 className="text-lg text-white" style={{ fontFamily: "'Alice', Georgia, serif" }}>API reference</h3>
                  <p className="text-[12px] text-white/40 font-light">Structured data endpoints</p>
                </div>
              </div>
              <p className="text-[14px] text-white/45 leading-[1.75] font-light mb-6">
                Programmatic access to your brand's authority data. AI agents can query your expertise signals, retrieve optimised content, and check citation status, all through authenticated REST endpoints.
              </p>
              <div className="space-y-3">
                {[
                  { method: "GET", path: "/api/authority-signals", desc: "Retrieve authority score and signal breakdown" },
                  { method: "POST", path: "/api/content-optimise", desc: "Submit content for AI citation optimisation" },
                  { method: "GET", path: "/api/citations", desc: "Track AI citations across LLMs" },
                  { method: "GET", path: "/api/competitors", desc: "Competitive authority benchmarking" },
                ].map((api) => (
                  <div key={api.path} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(0,0,0,0.2)" }}>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded mt-0.5 flex-shrink-0" style={{ background: api.method === "POST" ? "rgba(31,116,143,0.15)" : "rgba(40,150,185,0.15)", color: api.method === "POST" ? vars.accent : vars.teal }}>
                      {api.method}
                    </span>
                    <div>
                      <code className="text-[12px] font-mono text-white/70">{api.path}</code>
                      <p className="text-[11px] text-white/35 font-light mt-0.5">{api.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { stat: "6", label: "Signal categories analysed" },
              { stat: "4", label: "Major LLMs tracked" },
              { stat: "100+", label: "Authority data points per client" },
              { stat: "Real-time", label: "Citation monitoring" },
            ].map((item) => (
              <div key={item.label} className="text-center py-6 rounded-2xl border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}>
                <div className="text-3xl text-white mb-1" style={{ fontFamily: "'Alice', Georgia, serif" }}>{item.stat}</div>
                <p className="text-[12px] text-white/40 font-light">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32" style={{ background: vars.navy, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-4xl md:text-5xl text-white mb-7" style={{ fontFamily: "'Alice', Georgia, serif" }}>Ready to win AI authority?</h2>
          <p className="text-lg text-white/50 mb-14 leading-relaxed font-light">
            Get in touch with Simpatico PR to discuss how AIO Fusion can help your business become the source AI cites and recommends.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <a href="https://www.simpaticopr.co.uk/contact" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-10 py-4 rounded-lg text-[15px] font-semibold text-white transition-all hover:brightness-110" style={{ background: vars.accent }}>
              <Mail size={18} /> Contact Simpatico PR
            </a>
            <button onClick={onLogin} className="flex items-center gap-2.5 px-10 py-4 rounded-lg text-[15px] font-medium text-white/90 transition-all hover:bg-white/15" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }}>
              <LogIn size={16} /> Admin Login
            </button>
          </div>
        </div>
      </section>

      <footer className="py-14 border-t" style={{ background: "#fff", borderColor: vars.g200 }}>
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-20" />
              <span className="text-[13px] font-light" style={{ color: vars.g400 }}>by Simpatico PR</span>
            </div>
            <div className="flex items-center gap-8 text-[13px] font-light" style={{ color: vars.g400 }}>
              <a href="https://www.simpaticopr.co.uk/" target="_blank" rel="noopener noreferrer" className="hover:underline">simpaticopr.co.uk</a>
              <a href="https://www.simpaticopr.co.uk/contact" target="_blank" rel="noopener noreferrer" className="hover:underline">Contact</a>
            </div>
            <p className="text-[12px] font-light" style={{ color: vars.g400 }}>&copy; Simpatico PR Ltd. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  const [view, setView] = useState<"landing" | "platform">("landing");
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [currentPage, setCurrentPage] = useState("diagnostic");

  if (view === "landing") {
    return <LandingPage onLogin={() => setView("platform")} />;
  }

  if (!activeClient) {
    return (
      <ClientSelectorPage
        onSelectClient={(client) => {
          setActiveClient(client);
          setCurrentPage("diagnostic");
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

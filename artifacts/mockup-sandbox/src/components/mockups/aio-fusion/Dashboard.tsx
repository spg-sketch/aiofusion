import "./_group.css";
import { AppLayout } from "./_shared/AppLayout";
import {
  Search,
  FileEdit,
  BarChart3,
  Archive,
  Send,
  LineChart,
  ArrowRight,
  Lock,
  Sparkles,
  TrendingUp,
  FileText,
  Target,
} from "lucide-react";

const activeModules = [
  {
    id: "diagnostic",
    icon: Search,
    title: "GEO Diagnostic",
    description: "Analyse how well your content is structured for AI visibility. Get a scored report with specific actions.",
    color: "#4f8fff",
    gradient: "linear-gradient(135deg, #4f8fff, #3a7aee)",
    stats: { label: "6 Signal Categories", sub: "Authority Index Score /100" },
  },
  {
    id: "optimiser",
    icon: FileEdit,
    title: "Content Optimiser",
    description: "Transform PR content for maximum AI citation and retrieval. Side-by-side tracked changes with semantic guidance.",
    color: "#7c5cff",
    gradient: "linear-gradient(135deg, #7c5cff, #6b4ced)",
    stats: { label: "Before/After Scoring", sub: "Semantic Phrase Extraction" },
  },
  {
    id: "planner",
    icon: BarChart3,
    title: "Authority Planner",
    description: "Score your forward PR plan for predicted AI authority impact. Identify gaps and prioritise activity.",
    color: "#22c55e",
    gradient: "linear-gradient(135deg, #22c55e, #16a34a)",
    stats: { label: "8 Activity Categories", sub: "Priority Recommendations" },
  },
];

const lockedModules = [
  {
    id: "archive",
    icon: Archive,
    title: "Content Archive",
    description: "Search, tag and retrieve all optimised content with full version history.",
  },
  {
    id: "gateway",
    icon: Send,
    title: "Release Gateway",
    description: "Route optimised content to wire services, social channels and CMS platforms.",
  },
  {
    id: "measure",
    icon: LineChart,
    title: "Measure & Report",
    description: "Track AI citation performance across LLMs with automated reporting.",
  },
];

export function Dashboard() {
  return (
    <AppLayout currentPage="dashboard">
      <div className="px-8 py-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: "rgba(79,143,255,0.1)", color: "#4f8fff" }}>
              <Sparkles size={12} /> GEO Platform
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--aio-navy)" }}>
            Welcome back, Simpatico
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--aio-gray-500)" }}>
            Optimise your PR content for AI visibility and citation across ChatGPT, Perplexity, Claude and Gemini.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl p-5 border" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(79,143,255,0.1)" }}>
                <FileText size={20} color="#4f8fff" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: "var(--aio-navy)" }}>24</p>
                <p className="text-xs" style={{ color: "var(--aio-gray-500)" }}>Content Analysed</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--aio-green)" }}>
              <TrendingUp size={14} /> +8 this month
            </div>
          </div>
          <div className="rounded-xl p-5 border" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(124,92,255,0.1)" }}>
                <Target size={20} color="#7c5cff" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: "var(--aio-navy)" }}>73</p>
                <p className="text-xs" style={{ color: "var(--aio-gray-500)" }}>Avg Authority Score</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--aio-green)" }}>
              <TrendingUp size={14} /> +12 from baseline
            </div>
          </div>
          <div className="rounded-xl p-5 border" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)" }}>
                <BarChart3 size={20} color="#22c55e" />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: "var(--aio-navy)" }}>3</p>
                <p className="text-xs" style={{ color: "var(--aio-gray-500)" }}>Active Plans</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--aio-amber)" }}>
              1 needs review
            </div>
          </div>
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--aio-gray-500)" }}>
          Core Modules
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {activeModules.map((mod) => (
            <div
              key={mod.id}
              className="rounded-xl border overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 group"
              style={{ background: "white", borderColor: "var(--aio-gray-200)" }}
            >
              <div className="h-1.5" style={{ background: mod.gradient }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: `${mod.color}15` }}
                  >
                    <mod.icon size={20} color={mod.color} />
                  </div>
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1"
                    style={{ color: "var(--aio-gray-400)" }}
                  />
                </div>
                <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--aio-navy)" }}>
                  {mod.title}
                </h3>
                <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--aio-gray-500)" }}>
                  {mod.description}
                </p>
                <div className="pt-3 border-t" style={{ borderColor: "var(--aio-gray-100)" }}>
                  <p className="text-xs font-medium" style={{ color: mod.color }}>{mod.stats.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--aio-gray-400)" }}>{mod.stats.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--aio-gray-500)" }}>
          Coming in V2
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lockedModules.map((mod) => (
            <div
              key={mod.id}
              className="rounded-xl border overflow-hidden opacity-60"
              style={{ background: "white", borderColor: "var(--aio-gray-200)" }}
            >
              <div className="h-1.5" style={{ background: "var(--aio-gray-200)" }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--aio-gray-100)" }}>
                    <mod.icon size={20} style={{ color: "var(--aio-gray-400)" }} />
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
                    style={{ background: "var(--aio-gray-100)", color: "var(--aio-gray-500)" }}>
                    <Lock size={10} /> Coming Soon
                  </span>
                </div>
                <h3 className="text-base font-semibold mb-1.5" style={{ color: "var(--aio-gray-500)" }}>
                  {mod.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--aio-gray-400)" }}>
                  {mod.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

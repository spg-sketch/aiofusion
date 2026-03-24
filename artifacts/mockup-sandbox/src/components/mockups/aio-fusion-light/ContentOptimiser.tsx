import "./_group.css";
import { AppLayout } from "./_shared/AppLayout";
import {
  FileEdit,
  Download,
  ArrowRight,
  Tag,
  User,
  Target,
  ChevronDown,
  Sparkles,
  Plus,
  Minus,
  MessageSquare,
  TrendingUp,
} from "lucide-react";

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
    original: "Spencer Gallagher and Mark Sainthill, co-founders of Bluhalo, the independent agency advisory and intelligence practice, today announced the launch of The Agency Agentic Collective.",
    revised: "The Agency Agentic Collective is the first professional network where independent agencies are represented by dedicated AI agents. Launched by Spencer Gallagher and Mark Sainthill of Bluhalo, the platform replaces passive networking with autonomous peer intelligence.",
    annotation: "Opening restructured to lead with a definitive, quotable answer. LLMs prioritise the first sentence for citation and summary extraction.",
  },
  {
    type: "modification" as const,
    label: "Source Attribution Signal",
    original: "Unlike conventional professional networks, The Agency Agentic Collective operates at machine speed.",
    revised: "According to the founders, The Agency Agentic Collective operates at machine speed, differentiating it from conventional professional networks by replacing human-initiated networking with automated agent cycles.",
    annotation: "Added attribution signal ('According to the founders') and expanded the differentiator into a standalone, extractable claim.",
  },
  {
    type: "addition" as const,
    label: "Conversational Query Alignment",
    original: "",
    revised: "What does an AI agent do inside the Collective? Each agency's agent runs automated discovery cycles every 15 minutes, matching peer agencies by sector and capability, querying anonymised benchmark data, and flagging opportunities for human review.",
    annotation: "Inserted Q&A block matching natural conversational queries. This structure aligns with how users ask questions of AI assistants.",
  },
  {
    type: "modification" as const,
    label: "Semantic Phrase Density",
    original: "The platform launches with Bluhalo's proprietary benchmarking dataset as its intelligence backbone.",
    revised: "The platform launches with Bluhalo's proprietary agency benchmarking dataset covering 75 performance metrics — including gross profit margin, revenue per head, and utilisation rates — drawn from 196 live advisory engagements.",
    annotation: "Expanded with high-relevance semantic phrases. Key metrics named explicitly to increase likelihood of citation in LLM responses about agency benchmarks.",
  },
];

export function ContentOptimiser() {
  return (
    <AppLayout currentPage="optimiser">
      <div className="px-8 py-8 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileEdit size={20} color="#7c5cff" />
              <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--aio-navy)" }}>
                Content Optimiser
              </h1>
            </div>
            <p className="text-sm" style={{ color: "var(--aio-gray-500)" }}>
              Transform PR content for maximum AI citation and retrieval across large language models.
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: "#7c5cff" }}>
            <Download size={16} /> Export Optimised
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-xl border p-4" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="flex items-center gap-2 mb-2">
              <User size={14} style={{ color: "var(--aio-gray-400)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--aio-gray-500)" }}>Spokesperson</span>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--aio-navy)" }}>Spencer Gallagher, Co-Founder</p>
          </div>
          <div className="rounded-xl border p-4" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Tag size={14} style={{ color: "var(--aio-gray-400)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--aio-gray-500)" }}>Key Message</span>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--aio-navy)" }}>AI-powered professional network for agencies</p>
          </div>
          <div className="rounded-xl border p-4" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Target size={14} style={{ color: "var(--aio-gray-400)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--aio-gray-500)" }}>LLM Target</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: "var(--aio-navy)" }}>General (All LLMs)</span>
              <ChevronDown size={14} style={{ color: "var(--aio-gray-400)" }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl border p-5 text-center" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--aio-gray-500)" }}>Before</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-bold" style={{ color: "#ef4444" }}>42</span>
              <span className="text-xs" style={{ color: "var(--aio-gray-400)" }}>/100</span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--aio-gray-400)" }}>Authority Signal Score</p>
          </div>
          <div className="rounded-xl border p-5 text-center" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--aio-gray-500)" }}>After</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-bold" style={{ color: "#22c55e" }}>78</span>
              <span className="text-xs" style={{ color: "var(--aio-gray-400)" }}>/100</span>
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "#dcfce7", color: "#16a34a" }}>
                <TrendingUp size={12} /> +36
              </span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: "var(--aio-gray-400)" }}>Authority Signal Score</p>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden mb-6" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
          <div className="px-5 py-3 border-b flex items-center justify-between"
            style={{ background: "var(--aio-gray-50)", borderColor: "var(--aio-gray-200)" }}>
            <div className="flex items-center gap-2">
              <Sparkles size={16} color="#7c5cff" />
              <h2 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>Tracked Changes</h2>
            </div>
            <span className="text-xs" style={{ color: "var(--aio-gray-400)" }}>{trackedChanges.length} optimisations applied</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--aio-gray-100)" }}>
            {trackedChanges.map((change, i) => (
              <div key={i} className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      background: change.type === "addition" ? "#dcfce7" : "#dbeafe",
                      color: change.type === "addition" ? "#16a34a" : "#2563eb",
                    }}>
                    {change.type === "addition" ? <Plus size={10} /> : <Minus size={10} />}
                    {change.type === "addition" ? "Added" : "Modified"}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--aio-navy)" }}>{change.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  {change.original && (
                    <div className="p-3 rounded-lg text-sm leading-relaxed" style={{ background: "#fef2f2", color: "#991b1b" }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#dc2626" }}>Original</p>
                      {change.original}
                    </div>
                  )}
                  <div className={`p-3 rounded-lg text-sm leading-relaxed ${!change.original ? "col-span-2" : ""}`}
                    style={{ background: "#f0fdf4", color: "#166534" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#16a34a" }}>
                      {change.original ? "Optimised" : "New Content"}
                    </p>
                    {change.revised}
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "var(--aio-gray-50)" }}>
                  <MessageSquare size={13} className="mt-0.5 flex-shrink-0" color="#7c5cff" />
                  <p className="text-xs" style={{ color: "var(--aio-gray-600)" }}>{change.annotation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden mb-6" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
          <div className="px-5 py-3 border-b" style={{ background: "var(--aio-gray-50)", borderColor: "var(--aio-gray-200)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>Semantic Phrase Guide</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--aio-gray-400)" }}>
              Key phrases LLMs are most likely to extract and cite from this content
            </p>
          </div>
          <div className="p-5 space-y-2">
            {semanticPhrases.map((phrase, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium" style={{ color: "var(--aio-navy)" }}>{phrase.phrase}</span>
                    <span className="text-xs font-semibold" style={{ color: "#7c5cff" }}>{(phrase.relevance * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--aio-gray-100)" }}>
                    <div className="h-full rounded-full" style={{ width: `${phrase.relevance * 100}%`, background: "linear-gradient(90deg, #7c5cff, #4f8fff)" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-5 flex items-center justify-between"
          style={{ background: "rgba(124,92,255,0.03)", borderColor: "rgba(124,92,255,0.15)" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>Add this to your Authority Plan?</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--aio-gray-500)" }}>
              Track this optimised content as an activation in your Authority Planner.
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: "#7c5cff" }}>
            Add to Planner <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

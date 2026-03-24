import "./_group.css";
import { AppLayout } from "./_shared/AppLayout";
import {
  Search,
  Code2,
  HelpCircle,
  MessageSquareQuote,
  Bot,
  ShieldCheck,
  MessagesSquare,
  Download,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  FileText,
  Globe,
} from "lucide-react";

type Rating = "green" | "amber" | "red";

interface Signal {
  id: number;
  title: string;
  icon: any;
  score: number;
  rating: Rating;
  finding: string;
  action: string;
}

const signals: Signal[] = [
  {
    id: 1,
    title: "Schema Markup",
    icon: Code2,
    score: 8,
    rating: "green",
    finding: "Organization and Article schema correctly implemented across key pages.",
    action: "Add FAQPage schema to your Q&A content to improve structured snippet eligibility.",
  },
  {
    id: 2,
    title: "FAQ Page Structure",
    icon: HelpCircle,
    score: 4,
    rating: "amber",
    finding: "FAQ section exists but lacks structured heading hierarchy and answer-first formatting.",
    action: "Restructure FAQ with H2 question headings and lead each answer with a direct, quotable statement.",
  },
  {
    id: 3,
    title: "Answer-First Copy",
    icon: MessageSquareQuote,
    score: 3,
    rating: "red",
    finding: "Most pages open with company background rather than direct answers to user questions.",
    action: "Rewrite opening paragraphs to lead with a definitive answer before providing context or credentials.",
  },
  {
    id: 4,
    title: "AI Crawler Access",
    icon: Bot,
    score: 9,
    rating: "green",
    finding: "robots.txt allows all major AI crawlers. No blocking directives for GPTBot or Anthropic-AI.",
    action: "No changes needed. Monitor for new AI crawler user-agents quarterly.",
  },
  {
    id: 5,
    title: "Source Truth Consistency",
    icon: ShieldCheck,
    score: 6,
    rating: "amber",
    finding: "Key statistics are inconsistent between About page and recent case studies.",
    action: "Audit and align all numerical claims, founding dates, and capability statements across the site.",
  },
  {
    id: 6,
    title: "Conversational Content",
    icon: MessagesSquare,
    score: 5,
    rating: "amber",
    finding: "Content is written in formal marketing tone. Lacks natural question-answer patterns.",
    action: "Add conversational Q&A sections that mirror how users ask questions of AI assistants.",
  },
];

const ratingConfig = {
  green: { bg: "#dcfce7", color: "#16a34a", icon: CheckCircle2, label: "Strong" },
  amber: { bg: "#fef3c7", color: "#d97706", icon: AlertTriangle, label: "Needs Work" },
  red: { bg: "#fee2e2", color: "#dc2626", icon: XCircle, label: "Critical" },
};

const overallScore = 58;

export function GeoDiagnostic() {
  return (
    <AppLayout currentPage="diagnostic">
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Search size={20} color="#4f8fff" />
              <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--aio-navy)" }}>
                GEO Diagnostic
              </h1>
            </div>
            <p className="text-sm" style={{ color: "var(--aio-gray-500)" }}>
              Analyse how your content is structured for AI visibility across six signal categories.
            </p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "#4f8fff" }}
          >
            <Download size={16} /> Download Report
          </button>
        </div>

        <div className="rounded-xl border p-6 mb-6" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Globe size={16} style={{ color: "var(--aio-gray-400)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--aio-gray-500)" }}>Analysing</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--aio-gray-50)" }}>
            <FileText size={18} style={{ color: "var(--aio-gray-400)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--aio-navy)" }}>simpatico-pr.co.uk — Services Page</p>
              <p className="text-xs" style={{ color: "var(--aio-gray-400)" }}>Pasted content · 2,340 words · Analysed 2 min ago</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden mb-6" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
          <div className="p-6 flex items-center gap-8" style={{ background: "var(--aio-navy)" }}>
            <div className="flex flex-col items-center">
              <div className="relative">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                  <circle
                    cx="60" cy="60" r="52"
                    fill="none"
                    stroke={overallScore >= 70 ? "#22c55e" : overallScore >= 40 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="8"
                    strokeDasharray={`${(overallScore / 100) * 327} 327`}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-white">{overallScore}</span>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--aio-gray-400)" }}>
                    out of 100
                  </span>
                </div>
              </div>
              <p className="text-sm font-medium text-white mt-3">Authority Index</p>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-4">
              {(["green", "amber", "red"] as Rating[]).map((rating) => {
                const count = signals.filter((s) => s.rating === rating).length;
                const config = ratingConfig[rating];
                return (
                  <div key={rating} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <config.icon size={16} color={config.color} />
                      <span className="text-xs font-medium" style={{ color: config.color }}>{config.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{count}</p>
                    <p className="text-[11px]" style={{ color: "var(--aio-gray-400)" }}>
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
                className="rounded-xl border p-5 transition-all hover:shadow-sm"
                style={{ background: "white", borderColor: "var(--aio-gray-200)" }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${config.color}12` }}>
                    <signal.icon size={20} color={config.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>
                        Signal {signal.id}: {signal.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: config.color }}>
                          {signal.score}/10
                        </span>
                        <span
                          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ background: config.bg, color: config.color }}
                        >
                          <config.icon size={10} />
                          {config.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm mb-2" style={{ color: "var(--aio-gray-500)" }}>
                      {signal.finding}
                    </p>
                    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "var(--aio-gray-50)" }}>
                      <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: "var(--aio-accent)" }} />
                      <p className="text-xs font-medium" style={{ color: "var(--aio-navy)" }}>
                        {signal.action}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border p-5 flex items-center justify-between"
          style={{ background: "rgba(79,143,255,0.04)", borderColor: "rgba(79,143,255,0.2)" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>
              Ready to improve your score?
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--aio-gray-500)" }}>
              Take your diagnostic findings into the Content Optimiser to start addressing each signal.
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: "#4f8fff" }}>
            Open Content Optimiser <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

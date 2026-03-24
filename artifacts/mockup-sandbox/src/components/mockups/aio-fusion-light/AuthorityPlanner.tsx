import "./_group.css";
import { AppLayout } from "./_shared/AppLayout";
import {
  BarChart3,
  Download,
  FileText,
  BookOpen,
  Scroll,
  Award,
  Radio,
  Mic2,
  PenLine,
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Lightbulb,
  Target,
} from "lucide-react";

interface PlanCategory {
  id: string;
  icon: any;
  title: string;
  count: number;
  weight: number;
  weightLabel: string;
  score: number;
  maxScore: number;
}

const categories: PlanCategory[] = [
  { id: "press", icon: FileText, title: "Press Releases", count: 4, weight: 7, weightLabel: "High", score: 28, maxScore: 40 },
  { id: "research", icon: BookOpen, title: "Original Research / Data", count: 1, weight: 10, weightLabel: "Highest", score: 10, maxScore: 30 },
  { id: "whitepapers", icon: Scroll, title: "Whitepapers", count: 0, weight: 9, weightLabel: "Very High", score: 0, maxScore: 27 },
  { id: "awards", icon: Award, title: "Award Submissions", count: 3, weight: 4, weightLabel: "Medium", score: 12, maxScore: 16 },
  { id: "events", icon: Radio, title: "Owned Events / Webinars", count: 2, weight: 6, weightLabel: "High", score: 12, maxScore: 18 },
  { id: "speaking", icon: Mic2, title: "Third-party Speaking", count: 1, weight: 5, weightLabel: "Medium", score: 5, maxScore: 15 },
  { id: "content", icon: PenLine, title: "LinkedIn / Blog Content", count: 6, weight: 3, weightLabel: "Low", score: 18, maxScore: 18 },
  { id: "lists", icon: ClipboardList, title: "Industry Lists / Analyst", count: 0, weight: 5, weightLabel: "Medium", score: 0, maxScore: 15 },
];

const totalScore = categories.reduce((sum, c) => sum + c.score, 0);
const maxPossible = categories.reduce((sum, c) => sum + c.maxScore, 0);
const scorePercent = Math.round((totalScore / maxPossible) * 100);

const gaps = [
  { category: "Whitepapers", severity: "critical" as const, message: "No whitepapers planned. This is the second-highest weighted category for AI authority. Adding one whitepaper would increase your plan score by 15%." },
  { category: "Industry Lists / Analyst", severity: "warning" as const, message: "No analyst or industry list entries planned. These provide third-party validation signals that strengthen AI citation probability." },
  { category: "Original Research", severity: "warning" as const, message: "Only 1 research publication planned. Original data publications are the highest-weighted AI authority signal. Consider adding a second data release." },
];

const overRepresented = [
  { category: "LinkedIn / Blog Content", message: "6 posts planned — already at maximum impact for this category. Additional posts offer diminishing returns for AI authority." },
];

export function AuthorityPlanner() {
  return (
    <AppLayout currentPage="planner">
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={20} color="#22c55e" />
              <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--aio-navy)" }}>
                Authority Planner
              </h1>
            </div>
            <p className="text-sm" style={{ color: "var(--aio-gray-500)" }}>
              Score your forward PR plan for predicted AI authority impact. Q2 2026 Plan.
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: "#22c55e" }}>
            <Download size={16} /> Export Plan Report
          </button>
        </div>

        <div className="rounded-xl border overflow-hidden mb-6" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
          <div className="p-6 flex items-center gap-8 rounded-t-xl" style={{ background: "linear-gradient(135deg, #f8fafc, #f1f5f9)" }}>
            <div className="flex flex-col items-center">
              <div className="relative">
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r="60" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                  <circle cx="70" cy="70" r="60" fill="none"
                    stroke={scorePercent >= 70 ? "#22c55e" : scorePercent >= 40 ? "#f59e0b" : "#ef4444"}
                    strokeWidth="10" strokeDasharray={`${(scorePercent / 100) * 377} 377`}
                    strokeLinecap="round" transform="rotate(-90 70 70)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold" style={{ color: "var(--aio-navy)" }}>{scorePercent}</span>
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--aio-gray-400)" }}>Plan Score</span>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg p-3 border" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
                  <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--aio-gray-400)" }}>Total Activations</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--aio-navy)" }}>{categories.reduce((s, c) => s + c.count, 0)}</p>
                </div>
                <div className="rounded-lg p-3 border" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
                  <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--aio-gray-400)" }}>Categories Active</p>
                  <p className="text-2xl font-bold" style={{ color: "var(--aio-navy)" }}>
                    {categories.filter((c) => c.count > 0).length}/{categories.length}
                  </p>
                </div>
                <div className="rounded-lg p-3 border" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
                  <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--aio-gray-400)" }}>Gaps Found</p>
                  <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{gaps.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden mb-6" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
          <div className="px-5 py-3 border-b" style={{ background: "var(--aio-gray-50)", borderColor: "var(--aio-gray-200)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>Category Breakdown</h2>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--aio-gray-100)" }}>
            {categories.map((cat) => {
              const fillPercent = cat.maxScore > 0 ? (cat.score / cat.maxScore) * 100 : 0;
              return (
                <div key={cat.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: cat.count > 0 ? "rgba(34,197,94,0.06)" : "var(--aio-gray-100)" }}>
                    <cat.icon size={18} color={cat.count > 0 ? "#22c55e" : "#94a3b8"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium" style={{ color: "var(--aio-navy)" }}>{cat.title}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: "var(--aio-gray-400)" }}>{cat.count} planned</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: cat.weight >= 8 ? "#dcfce7" : cat.weight >= 5 ? "#fef3c7" : "var(--aio-gray-100)",
                            color: cat.weight >= 8 ? "#16a34a" : cat.weight >= 5 ? "#d97706" : "var(--aio-gray-500)",
                          }}>
                          Weight: {cat.weight}/10
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--aio-gray-100)" }}>
                      <div className="h-full rounded-full" style={{
                        width: `${fillPercent}%`,
                        background: fillPercent >= 70 ? "linear-gradient(90deg, #22c55e, #16a34a)"
                          : fillPercent > 0 ? "linear-gradient(90deg, #f59e0b, #eab308)" : "#e2e8f0",
                      }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[11px]" style={{ color: "var(--aio-gray-400)" }}>{cat.score} / {cat.maxScore} points</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border overflow-hidden" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="px-5 py-3 border-b flex items-center gap-2"
              style={{ background: "var(--aio-gray-50)", borderColor: "var(--aio-gray-200)" }}>
              <AlertTriangle size={14} color="#d97706" />
              <h2 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>Gap Analysis</h2>
            </div>
            <div className="p-4 space-y-3">
              {gaps.map((gap, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: gap.severity === "critical" ? "#fef2f2" : "#fffbeb" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        background: gap.severity === "critical" ? "#fee2e2" : "#fef3c7",
                        color: gap.severity === "critical" ? "#dc2626" : "#d97706",
                      }}>
                      {gap.severity}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "var(--aio-navy)" }}>{gap.category}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--aio-gray-600)" }}>{gap.message}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border overflow-hidden" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
            <div className="px-5 py-3 border-b flex items-center gap-2"
              style={{ background: "var(--aio-gray-50)", borderColor: "var(--aio-gray-200)" }}>
              <TrendingUp size={14} color="#16a34a" />
              <h2 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>Over-Represented</h2>
            </div>
            <div className="p-4 space-y-3">
              {overRepresented.map((item, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: "#f0fdf4" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={12} color="#16a34a" />
                    <span className="text-xs font-semibold" style={{ color: "var(--aio-navy)" }}>{item.category}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--aio-gray-600)" }}>{item.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border overflow-hidden" style={{ background: "white", borderColor: "var(--aio-gray-200)" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(79,143,255,0.04))", borderColor: "var(--aio-gray-200)" }}>
            <Lightbulb size={16} color="#22c55e" />
            <h2 className="text-sm font-semibold" style={{ color: "var(--aio-navy)" }}>Priority Recommendation</h2>
          </div>
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                <Target size={24} color="white" />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1" style={{ color: "var(--aio-navy)" }}>
                  Publish a whitepaper this quarter
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--aio-gray-500)" }}>
                  Your plan has no whitepapers scheduled, yet this is the second-highest weighted category for AI authority (9/10). A single whitepaper on a core topic — such as "How Independent Agencies Can Measure AI Visibility" — would increase your plan score by approximately 15 points and provide the most impactful single addition to your Q2 strategy. Combine this with your existing original research to create a compounding authority signal.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ background: "#dcfce7", color: "#16a34a" }}>
                    <ArrowUpRight size={12} /> +15% predicted plan score
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

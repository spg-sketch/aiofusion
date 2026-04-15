import { useState } from "react";
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
  Target,
  Users,
  BarChart3,
  CheckCircle2,
  Clock,
  ArrowRight,
  Eye,
  Zap,
  Star,
} from "lucide-react";

const vars = {
  navy: "#165265",
  accent: "#1f748f",
  teal: "#2896b9",
  green: "#3D9B6B",
  amber: "#D4922A",
  red: "#C94A3E",
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

export default function ReportPage({ activeClient }: { activeClient: Client }) {
  const [activeTab, setActiveTab] = useState<"actions" | "overview" | "detail">("actions");
  const [completedActions, setCompletedActions] = useState<Set<number>>(new Set());
  const [actionFilter, setActionFilter] = useState<"all" | "Critical" | "High" | "Medium" | "Low">("all");
  const reportDate = "14 April 2026";
  const authorityScore = activeClient.avgScore || 24;

  const categoryScores = [
    { label: "Schema & Structured Data", score: 3, max: 15, description: "Organization, FAQ, and Article schema coverage" },
    { label: "Content Architecture", score: 5, max: 15, description: "Answer-first formatting, semantic phrase density, heading structure" },
    { label: "Source Authority", score: 4, max: 15, description: "NAP consistency, third-party profiles, citation network" },
    { label: "Earned Media Signals", score: 7, max: 20, description: "Press mentions, backlink quality, spokesperson visibility" },
    { label: "LLM Visibility", score: 3, max: 20, description: "Mentions and citations across ChatGPT, Perplexity, Google AI" },
    { label: "Technical Accessibility", score: 2, max: 15, description: "AI crawler access, robots.txt, sitemap, page speed" },
  ];

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
    { item: "Article Schema", status: "warn" as const, detail: "Partial implementation — missing author and datePublished" },
    { item: "AI Crawler Access", status: "pass" as const, detail: "robots.txt allows GPTBot, PerplexityBot, ClaudeBot" },
    { item: "Sitemap", status: "pass" as const, detail: "XML sitemap present and submitted to GSC" },
    { item: "Page Speed (Core Web Vitals)", status: "warn" as const, detail: "LCP 3.2s (target < 2.5s), CLS 0.08 (pass)" },
    { item: "NAP Consistency", status: "warn" as const, detail: "3 of 7 third-party profiles have outdated address" },
    { item: "HTTPS / Security Headers", status: "pass" as const, detail: "TLS 1.3, HSTS enabled, CSP present" },
  ];

  const contentAudit = [
    { item: "Homepage Descriptor", status: "warn" as const, detail: "Generic tagline — needs entity-rich, answer-first copy" },
    { item: "Product/Service Pages", status: "fail" as const, detail: "4 of 6 pages use promotional language instead of factual statements" },
    { item: "FAQ Page", status: "warn" as const, detail: "12 questions present, but missing category authority and misconception FAQs" },
    { item: "Blog / Thought Leadership", status: "pass" as const, detail: "Regular publishing cadence, 3 expert-authored pieces this quarter" },
    { item: "Spokesperson Profiles", status: "fail" as const, detail: "No dedicated author/expert profile pages with credentials" },
    { item: "Key Takeaway Boxes", status: "fail" as const, detail: "No answer-first summary blocks on content pages" },
  ];

  const priorityActions = [
    { priority: "Critical", timeframe: "This week", action: "Implement Organization Schema on homepage", impact: "High", category: "Technical" },
    { priority: "Critical", timeframe: "This week", action: "Deploy FAQ Schema markup on FAQ page", impact: "High", category: "Technical" },
    { priority: "High", timeframe: "This week", action: "Create expert author profile pages with credentials", impact: "High", category: "Content" },
    { priority: "High", timeframe: "This month", action: "Rewrite homepage descriptor with entity-rich copy", impact: "Medium", category: "Content" },
    { priority: "High", timeframe: "This month", action: "Add answer-first key takeaway blocks to top 10 pages", impact: "High", category: "Content" },
    { priority: "Medium", timeframe: "This month", action: "Fix Article Schema — add author and datePublished", impact: "Medium", category: "Technical" },
    { priority: "Medium", timeframe: "This month", action: "Update 3 outdated third-party profiles (NAP)", impact: "Medium", category: "Authority" },
    { priority: "Medium", timeframe: "This quarter", action: "Publish industry report with original research data", impact: "High", category: "Content" },
    { priority: "Medium", timeframe: "This quarter", action: "Rewrite 4 product pages from promotional to factual", impact: "Medium", category: "Content" },
    { priority: "Low", timeframe: "This quarter", action: "Add misconception and category authority FAQs", impact: "Low", category: "Content" },
    { priority: "Low", timeframe: "This quarter", action: "Improve LCP to under 2.5 seconds", impact: "Low", category: "Technical" },
  ];

  const totalEarned = categoryScores.filter(c => ["Earned Media Signals", "LLM Visibility", "Source Authority"].includes(c.label)).reduce((s, c) => s + c.score, 0);
  const totalEarnedMax = categoryScores.filter(c => ["Earned Media Signals", "LLM Visibility", "Source Authority"].includes(c.label)).reduce((s, c) => s + c.max, 0);
  const totalOwned = categoryScores.filter(c => ["Schema & Structured Data", "Content Architecture", "Technical Accessibility"].includes(c.label)).reduce((s, c) => s + c.score, 0);
  const totalOwnedMax = categoryScores.filter(c => ["Schema & Structured Data", "Content Architecture", "Technical Accessibility"].includes(c.label)).reduce((s, c) => s + c.max, 0);

  const tabs = [
    { id: "actions" as const, label: "Action Plan" },
    { id: "overview" as const, label: "Executive Summary" },
    { id: "detail" as const, label: "Detailed Audit" },
  ];

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={20} color={vars.accent} />
            <h1 className="text-xl sm:text-2xl tracking-tight" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              GEO Authority Report
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
            {activeClient.name} &mdash; Generated {reportDate}
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

      <div className="flex gap-1 p-1 rounded-xl border mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: activeTab === tab.id ? vars.accent : "transparent",
              color: activeTab === tab.id ? "white" : vars.g500,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="rounded-xl p-4 sm:p-6 mb-6" style={{ background: "linear-gradient(135deg, #165265, #1f748f)" }}>
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
                  <span className="text-xs text-white/70 mt-2 font-medium">AIO Authority Score</span>
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-lg sm:text-xl font-semibold text-white mb-2" style={{ fontFamily: "'Alice', Georgia, serif" }}>
                    {authorityScore >= 70 ? "Strong Authority Position" : authorityScore >= 40 ? "Moderate Authority — Room to Grow" : "Early Stage — Significant Opportunities"}
                  </h2>
                  <p className="text-sm text-white/70 leading-relaxed mb-4">
                    {activeClient.name} currently scores {authorityScore}/100 on the AIO Authority Index. This score reflects your brand's readiness to be cited, referenced, and recommended by AI-powered search and answer engines. The breakdown below shows where you're strong and where focused effort will drive the biggest improvements.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <div className="px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <span className="text-xs text-white/50 block">Earned Media</span>
                      <span className="text-lg font-bold text-white">{totalEarned}/{totalEarnedMax}</span>
                    </div>
                    <div className="px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <span className="text-xs text-white/50 block">Owned Media</span>
                      <span className="text-lg font-bold text-white">{totalOwned}/{totalOwnedMax}</span>
                    </div>
                    <div className="px-4 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <span className="text-xs text-white/50 block">Trend</span>
                      <span className="text-lg font-bold text-white flex items-center gap-1">
                        {activeClient.scoreTrend >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        {activeClient.scoreTrend >= 0 ? "+" : ""}{activeClient.scoreTrend}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-5" style={{ color: vars.navy }}>Score Breakdown by Category</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {categoryScores.map((cat) => (
                <ScoreBar key={cat.label} {...cat} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <Eye size={18} color={vars.accent} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>LLM Visibility Scorecard</h3>
            </div>
            <p className="text-sm font-light mb-6" style={{ color: vars.g500 }}>
              How your brand appears across the major AI platforms when users ask questions in your category.
            </p>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr style={{ background: vars.g50 }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: vars.g500 }}>Platform</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: vars.g500 }}>Mentions</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: vars.g500 }}>Cited</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: vars.g500 }}>Rank</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: vars.g500 }}>Sentiment</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: vars.g500 }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {llmScorecard.map((llm) => (
                    <tr key={llm.platform} className="border-t" style={{ borderColor: vars.g200 }}>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-medium" style={{ color: vars.navy }}>{llm.platform}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-semibold" style={{ color: vars.navy }}>{llm.mentions}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {llm.cited ? (
                          <CheckCircle2 size={16} color={vars.green} className="mx-auto" />
                        ) : (
                          <X size={16} color={vars.g300} className="mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm" style={{ color: vars.g600 }}>#{llm.rank}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{
                          background: llm.sentiment === "Positive" ? "#EFF7F2" : vars.g100,
                          color: llm.sentiment === "Positive" ? vars.green : vars.g500,
                        }}>
                          {llm.sentiment}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm font-medium flex items-center justify-center gap-1" style={{ color: llm.trend >= 0 ? vars.green : vars.red }}>
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
              <Target size={18} color={vars.accent} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Key Findings</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="rounded-xl p-4 border" style={{ borderColor: "#C2E5D2", background: "#F0FAF4" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Check size={16} color={vars.green} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: vars.green }}>Strengths</span>
                </div>
                <ul className="space-y-2">
                  <li className="text-sm" style={{ color: vars.g600 }}>AI crawlers have full access (robots.txt configured)</li>
                  <li className="text-sm" style={{ color: vars.g600 }}>Active thought leadership publishing programme</li>
                  <li className="text-sm" style={{ color: vars.g600 }}>Already cited by ChatGPT and Perplexity</li>
                </ul>
              </div>
              <div className="rounded-xl p-4 border" style={{ borderColor: "#F5DCA0", background: "#FFFCF0" }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} color={vars.amber} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: vars.amber }}>Needs Attention</span>
                </div>
                <ul className="space-y-2">
                  <li className="text-sm" style={{ color: vars.g600 }}>Content uses promotional rather than factual language</li>
                  <li className="text-sm" style={{ color: vars.g600 }}>NAP inconsistencies across 3 profiles</li>
                  <li className="text-sm" style={{ color: vars.g600 }}>FAQ page lacks schema markup</li>
                </ul>
              </div>
              <div className="rounded-xl p-4 border" style={{ borderColor: "#E8B5AE", background: "#FDF5F4" }}>
                <div className="flex items-center gap-2 mb-2">
                  <X size={16} color={vars.red} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: vars.red }}>Critical Gaps</span>
                </div>
                <ul className="space-y-2">
                  <li className="text-sm" style={{ color: vars.g600 }}>No Organization Schema on any page</li>
                  <li className="text-sm" style={{ color: vars.g600 }}>No expert author profile pages</li>
                  <li className="text-sm" style={{ color: vars.g600 }}>No answer-first content formatting</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "detail" && (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <Shield size={18} color={vars.accent} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Technical & Schema Audit</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>
              Assessment of structured data, crawler access, and technical signals that help AI engines understand and trust your content.
            </p>
            <div className="space-y-3">
              {technicalAudit.map((item) => (
                <div key={item.item} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-sm font-medium flex-shrink-0" style={{ color: vars.navy }}>{item.item}</span>
                  </div>
                  <div className="flex items-center gap-3 sm:ml-auto">
                    <StatusBadge status={item.status} />
                    <span className="text-xs font-light flex-1 sm:flex-initial sm:w-64" style={{ color: vars.g500 }}>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-5 p-4 rounded-xl" style={{ background: "rgba(31,116,143,0.04)" }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: vars.green }} />
                <span className="text-xs" style={{ color: vars.g500 }}>
                  {technicalAudit.filter(t => t.status === "pass").length} Pass
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: vars.amber }} />
                <span className="text-xs" style={{ color: vars.g500 }}>
                  {technicalAudit.filter(t => t.status === "warn").length} Needs Work
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: vars.red }} />
                <span className="text-xs" style={{ color: vars.g500 }}>
                  {technicalAudit.filter(t => t.status === "fail").length} Missing
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} color={vars.teal} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Content Architecture Audit</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>
              How well your website content is structured for AI comprehension, citation, and answer extraction.
            </p>
            <div className="space-y-3">
              {contentAudit.map((item) => (
                <div key={item.item} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 rounded-xl border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-sm font-medium flex-shrink-0" style={{ color: vars.navy }}>{item.item}</span>
                  </div>
                  <div className="flex items-center gap-3 sm:ml-auto">
                    <StatusBadge status={item.status} />
                    <span className="text-xs font-light flex-1 sm:flex-initial sm:w-64" style={{ color: vars.g500 }}>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-5 p-4 rounded-xl" style={{ background: "rgba(40,150,185,0.04)" }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: vars.green }} />
                <span className="text-xs" style={{ color: vars.g500 }}>
                  {contentAudit.filter(t => t.status === "pass").length} Pass
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: vars.amber }} />
                <span className="text-xs" style={{ color: vars.g500 }}>
                  {contentAudit.filter(t => t.status === "warn").length} Needs Work
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: vars.red }} />
                <span className="text-xs" style={{ color: vars.g500 }}>
                  {contentAudit.filter(t => t.status === "fail").length} Missing
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} color={vars.accent} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Brand Profile Summary</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>Key information from the client intake that shapes this report.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl" style={{ background: vars.g50 }}>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: vars.g400 }}>Industry / Sector</span>
                <span className="text-sm font-medium" style={{ color: vars.navy }}>{activeClient.sector}</span>
              </div>
              <div className="p-4 rounded-xl" style={{ background: vars.g50 }}>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: vars.g400 }}>Priority Type</span>
                <span className="text-sm font-medium" style={{ color: vars.navy }}>GEO (Generative Engine Optimisation)</span>
              </div>
              <div className="p-4 rounded-xl" style={{ background: vars.g50 }}>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: vars.g400 }}>Primary Audience</span>
                <span className="text-sm font-medium" style={{ color: vars.navy }}>B2B decision makers, procurement leads</span>
              </div>
              <div className="p-4 rounded-xl" style={{ background: vars.g50 }}>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: vars.g400 }}>Content Pieces Managed</span>
                <span className="text-sm font-medium" style={{ color: vars.navy }}>{activeClient.contentCount} active items</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "actions" && (() => {
        const filteredActions = actionFilter === "all" ? priorityActions : priorityActions.filter(a => a.priority === actionFilter);
        const completedCount = completedActions.size;
        const totalActions = priorityActions.length;
        const progressPct = Math.round((completedCount / totalActions) * 100);

        return (
        <div className="space-y-6">
          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={18} color={vars.accent} />
                  <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Action Plan</h3>
                </div>
                <p className="text-sm font-light" style={{ color: vars.g500 }}>
                  {completedCount} of {totalActions} actions completed
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 sm:w-40">
                  <div className="w-full h-2.5 rounded-full" style={{ background: vars.g200 }}>
                    <div className="h-2.5 rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: progressPct === 100 ? vars.green : vars.accent }} />
                  </div>
                </div>
                <span className="text-sm font-bold" style={{ color: progressPct === 100 ? vars.green : vars.accent }}>{progressPct}%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
              {(["all", "Critical", "High", "Medium", "Low"] as const).map((f) => {
                const count = f === "all" ? priorityActions.length : priorityActions.filter(a => a.priority === f).length;
                const fColor = f === "Critical" ? vars.red : f === "High" ? vars.amber : f === "Medium" ? vars.accent : f === "Low" ? vars.g400 : vars.navy;
                const isActive = actionFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setActionFilter(f)}
                    className="rounded-xl px-3 py-3 text-center border transition-colors"
                    style={{
                      borderColor: isActive ? fColor : vars.g200,
                      background: isActive ? `${fColor}0A` : "transparent",
                    }}
                  >
                    <p className="text-lg font-bold" style={{ color: fColor }}>{count}</p>
                    <p className="text-[10px] font-medium" style={{ color: isActive ? fColor : vars.g500 }}>{f === "all" ? "All" : f}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="px-4 sm:px-6 py-3 border-b flex items-center justify-between" style={{ borderColor: vars.g100, background: vars.g50 }}>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: vars.g400 }}>
                {filteredActions.length} {actionFilter === "all" ? "actions" : `${actionFilter} actions`}
              </span>
              {completedCount > 0 && (
                <span className="text-[10px] font-medium" style={{ color: vars.green }}>
                  {completedCount} done
                </span>
              )}
            </div>
            <div className="divide-y" style={{ borderColor: vars.g100 }}>
              {filteredActions.map((action, i) => {
                const origIdx = priorityActions.indexOf(action);
                const isDone = completedActions.has(origIdx);
                const prioColor = action.priority === "Critical" ? vars.red : action.priority === "High" ? vars.amber : action.priority === "Medium" ? vars.accent : vars.g400;
                return (
                  <div
                    key={origIdx}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 transition-colors"
                    style={{ background: isDone ? "rgba(61,155,107,0.03)" : "transparent", opacity: isDone ? 0.7 : 1 }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => {
                          setCompletedActions((prev) => {
                            const next = new Set(prev);
                            if (next.has(origIdx)) next.delete(origIdx);
                            else next.add(origIdx);
                            return next;
                          });
                        }}
                        className="w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{
                          borderColor: isDone ? vars.green : prioColor,
                          background: isDone ? vars.green : "transparent",
                        }}
                      >
                        {isDone && <Check size={14} color="white" />}
                      </button>
                      <span className="text-sm font-medium" style={{ color: vars.navy, textDecoration: isDone ? "line-through" : "none" }}>
                        {action.action}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0 ml-9 sm:ml-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                        background: action.priority === "Critical" ? "#FBEEEC" : action.priority === "High" ? "#FFF8EC" : "rgba(31,116,143,0.06)",
                        color: prioColor,
                      }}>
                        {action.priority}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: vars.g100, color: vars.g500 }}>
                        {action.timeframe}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: vars.g100, color: vars.g500 }}>
                        {action.category}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                        background: action.impact === "High" ? "#EFF7F2" : vars.g100,
                        color: action.impact === "High" ? vars.green : vars.g500,
                      }}>
                        {action.impact} impact
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <Star size={18} color={vars.amber} />
              <h3 className="text-base sm:text-lg font-semibold" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Projected Impact</h3>
            </div>
            <p className="text-sm font-light mb-5" style={{ color: vars.g500 }}>
              Estimated score improvement if all actions in each timeframe are completed.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, rgba(31,116,143,0.04), rgba(40,150,185,0.04))" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: vars.g400 }}>After This Week</p>
                <p className="text-3xl font-bold mb-1" style={{ color: vars.navy }}>{Math.min(authorityScore + 15, 100)}</p>
                <p className="text-xs font-medium" style={{ color: vars.green }}>+15 points (Schema + FAQ fix)</p>
              </div>
              <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, rgba(31,116,143,0.06), rgba(40,150,185,0.06))" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: vars.g400 }}>After This Month</p>
                <p className="text-3xl font-bold mb-1" style={{ color: vars.navy }}>{Math.min(authorityScore + 32, 100)}</p>
                <p className="text-xs font-medium" style={{ color: vars.green }}>+32 points (Content + Authority)</p>
              </div>
              <div className="rounded-xl p-5 text-center" style={{ background: "linear-gradient(135deg, rgba(31,116,143,0.08), rgba(40,150,185,0.08))" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: vars.g400 }}>After This Quarter</p>
                <p className="text-3xl font-bold mb-1" style={{ color: vars.navy }}>{Math.min(authorityScore + 48, 100)}</p>
                <p className="text-xs font-medium" style={{ color: vars.green }}>+48 points (Full implementation)</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ background: "rgba(31,116,143,0.03)", borderColor: vars.g200 }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
              <div className="flex-1">
                <h4 className="text-sm font-semibold mb-1" style={{ color: vars.navy }}>Ready to implement?</h4>
                <p className="text-[13px] font-light" style={{ color: vars.g500 }}>
                  Use the Content Optimiser and Authority Planner to begin executing these recommendations within the platform.
                </p>
              </div>
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white flex-shrink-0" style={{ background: vars.accent }}>
                Start Implementing <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import InfoTip from "./InfoTip";
import { loadCycle, recordCycle, type CycleHistory } from "./App";
import { getPreferredKeywords, getBusinessSectors, getTargetSectors } from "./IntakeForm";
import {
  Eye,
  Search,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Bot,
  Zap,
  Users,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Repeat,
  FileEdit,
  Info,
  Download,
  Building2,
} from "lucide-react";

const vars = {
  navy: "#165265",
  accent: "#1f748f",
  teal: "#2896b9",
  green: "#3D9B6B",
  amber: "#D4922A",
  red: "#C94A3E",
  lightBg: "#e0f2f7",
  g50: "#FAFAFA",
  g100: "#F3F3F3",
  g200: "#E5E5E5",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#374151",
};

interface Client {
  id: string;
  name: string;
  sector: string;
  logo?: string;
}

interface ProbeItem {
  question: string;
  model: string;
  mentioned: boolean;
  mentionRuns?: number;
  runCount?: number;
  mentionContext: string | null;
  responsePreview: string;
}

interface LlmCheckResult {
  companyName: string;
  sector: string;
  checkedAt: string;
  visibilityScore: number;
  totalProbes: number;
  totalMentions: number;
  byModel: {
    chatgpt: { probes: number; mentions: number; rate: number };
    claude: { probes: number; mentions: number; rate: number };
  };
  topCompetitors: { name: string; mentions: number }[];
  probes: ProbeItem[];
}

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? vars.green : score >= 30 ? vars.amber : vars.red;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={vars.g200} strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}%</span>
      </div>
    </div>
  );
}

function ModelCard({ label, icon, probes, mentions, rate }: { label: string; icon: React.ReactNode; probes: number; mentions: number; rate: number }) {
  const color = rate >= 60 ? vars.green : rate >= 30 ? vars.amber : vars.red;
  return (
    <div className="border rounded-xl p-5 flex-1" style={{ borderColor: vars.g200, background: "white" }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-[14px] font-semibold" style={{ color: vars.navy }}>{label}</span>
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className="text-3xl font-bold" style={{ color }}>{rate}%</span>
        <span className="text-[12px] mb-1" style={{ color: vars.g400 }}>visibility</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px]" style={{ color: vars.g500 }}>
          Mentioned in <strong style={{ color: vars.navy }}>{mentions}</strong> of <strong style={{ color: vars.navy }}>{probes}</strong> queries
        </span>
      </div>
    </div>
  );
}

function ProbeRow({ probe, companyName }: { probe: ProbeItem; companyName: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
        <div className="flex-shrink-0">
          {probe.mentioned ? (
            <CheckCircle2 size={18} style={{ color: vars.green }} />
          ) : (
            <XCircle size={18} style={{ color: vars.red }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate" style={{ color: vars.navy }}>{probe.question}</p>
          <p className="text-[11px] mt-0.5" style={{ color: vars.g400 }}>{probe.model}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {probe.runCount && probe.runCount > 1 && (
            <span className="text-[10px] hidden sm:inline" style={{ color: vars.g400 }}>
              {probe.mentionRuns}/{probe.runCount} runs
            </span>
          )}
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{
            background: probe.mentioned ? "#ECFDF5" : "#FEE2E2",
            color: probe.mentioned ? vars.green : vars.red,
          }}>
            {probe.mentioned ? "Mentioned" : "Not found"}
          </span>
          {expanded ? <ChevronUp size={14} style={{ color: vars.g400 }} /> : <ChevronDown size={14} style={{ color: vars.g400 }} />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: vars.g100 }}>
          {probe.mentionContext && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: "#ECFDF5", border: "1px solid #D1FAE5" }}>
              <p className="text-[11px] font-semibold mb-1" style={{ color: vars.green }}>Mention context:</p>
              <p className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
                {highlightName(probe.mentionContext, companyName)}
              </p>
            </div>
          )}
          <div className="mt-3 p-3 rounded-lg" style={{ background: vars.g50 }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: vars.g500 }}>Full response preview:</p>
            <p className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
              {highlightName(probe.responsePreview, companyName)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const NAME_SUFFIXES = new Set([
  "ltd", "limited", "inc", "incorporated", "llc", "plc", "llp", "co", "company",
  "corp", "corporation", "group", "holdings", "gmbh", "sa", "ag", "pty", "io", "sas", "bv", "srl",
]);

function nameCandidates(name: string): string[] {
  const clean = name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const core = clean.split(" ").filter((t) => t && !NAME_SUFFIXES.has(t));
  return Array.from(
    new Set([name.trim(), core.join(" "), core[0] || ""].filter((c) => c && c.length >= 3)),
  );
}

function highlightName(text: string, name: string): React.ReactNode {
  const candidates = nameCandidates(name);
  if (candidates.length === 0) return text;
  const escaped = candidates
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  const lowerCands = new Set(candidates.map((c) => c.toLowerCase()));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return parts.map((part, i) =>
    lowerCands.has(part.toLowerCase()) ? (
      <strong key={i} style={{ color: vars.accent, background: "#E0F2F7", padding: "0 2px", borderRadius: 2 }}>{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function LlmCheckPage({ activeClient, onNavigate }: { activeClient: Client; onNavigate?: (p: string) => void }) {
  const { isAuthenticated, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LlmCheckResult | null>(null);
  const prefilledKeywords = getPreferredKeywords();
  const [customKeywords, setCustomKeywords] = useState(prefilledKeywords.join(", "));
  const [companyName, setCompanyName] = useState(activeClient.name);
  useEffect(() => {
    setCompanyName(activeClient.name);
  }, [activeClient.id, activeClient.name]);
  const probeName = companyName.trim();
  const businessSectors = getBusinessSectors();
  const targetSectors = getTargetSectors();
  const PLACEHOLDER_SECTORS = ["Project Set-Up", "Awaiting set-up", ""];
  const setupSectors = Array.from(
    new Set([...businessSectors, ...targetSectors].map((s) => (s || "").trim()).filter(Boolean)),
  );
  const fallbackSector = PLACEHOLDER_SECTORS.includes((activeClient.sector || "").trim())
    ? ""
    : (activeClient.sector || "").trim();
  const combinedSectors = setupSectors.length > 0 ? setupSectors : fallbackSector ? [fallbackSector] : [];
  const combinedKey = combinedSectors.join("|");
  const [selectedSectors, setSelectedSectors] = useState<string[]>(combinedSectors);
  useEffect(() => {
    setSelectedSectors(combinedKey ? combinedKey.split("|") : []);
  }, [activeClient.id, combinedKey]);
  const toggleSector = (s: string) =>
    setSelectedSectors((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const selectedCount = combinedSectors.filter((s) => selectedSectors.includes(s)).length;
  const auditSectors = combinedSectors.filter((s) => selectedSectors.includes(s)).slice(0, 3);
  const [cycleData, setCycleData] = useState<CycleHistory>(() => loadCycle(activeClient.id));
  const previousScore = cycleData.history.length > 0 ? cycleData.history[cycleData.history.length - 1].score : null;

  useEffect(() => {
    setCycleData(loadCycle(activeClient.id));
  }, [activeClient.id]);

  async function runCheck() {
    if (!isAuthenticated) {
      login();
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const keywords = customKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const resp = await fetch(`${apiBase}/api/llm-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName: probeName,
          sector: auditSectors[0] || activeClient.sector,
          sectors: auditSectors,
          keywords,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Check failed" }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setResult(data);
      const updated = recordCycle(activeClient.id, data.visibilityScore);
      setCycleData(updated);
    } catch (err: any) {
      setError(err.message || "Failed to run visibility check");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Eye size={20} color="#1f748f" />
            <h1 className="text-xl tracking-tight flex items-center" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              Earned Media Visibility Audit
              <InfoTip text="Sends real questions about the sectors you operate in and the markets you sell to, then checks whether your brand is mentioned by ChatGPT and Claude. This is the test that matters - it measures actual AI citation behaviour." width={260} />
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
            Score whether AI models mention {probeName || activeClient.name} when asked about the sectors you operate in and the markets you sell to.
          </p>
        </div>
        <div className="rounded-xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <Search size={18} style={{ color: vars.g400 }} />
              <span className="text-sm font-medium" style={{ color: vars.g500 }}>
                Confirm the brand and add any extra key phrases to probe
              </span>
            </div>
            <div className="mb-4">
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>Company</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Enter the brand or sub-brand to probe"
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: vars.g200, color: vars.navy, background: "white" }}
              />
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: probeName.length === 0 ? vars.red : vars.g400 }}>
                <Info size={11} />
                {probeName.length === 0
                  ? "Enter a brand name to probe."
                  : "Edit to probe just the core brand (for example \"Bluhalo\") or a specific sub-brand."}
              </p>
            </div>
            {combinedSectors.length > 0 ? (
              <div className="mb-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>Sectors you operate in</label>
                    <div className="px-3 py-2.5 rounded-lg border min-h-[42px] flex flex-wrap gap-1.5" style={{ borderColor: vars.g200, background: vars.g50 }}>
                      {businessSectors.map((s) => (s || "").trim()).filter(Boolean).length > 0 ? (
                        businessSectors.map((s) => (s || "").trim()).filter(Boolean).map((s) => {
                          const on = selectedSectors.includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => toggleSector(s)}
                              className="text-[12px] px-2 py-0.5 rounded-full border transition-colors"
                              style={on
                                ? { background: vars.lightBg, color: vars.accent, borderColor: vars.accent }
                                : { background: "white", color: vars.g400, borderColor: vars.g200 }}
                            >
                              {s}
                            </button>
                          );
                        })
                      ) : <span className="text-sm" style={{ color: vars.g400 }}>Not set in Project Set-Up (1.9)</span>}
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>Sectors you're targeting</label>
                    <div className="px-3 py-2.5 rounded-lg border min-h-[42px] flex flex-wrap gap-1.5" style={{ borderColor: vars.g200, background: vars.g50 }}>
                      {targetSectors.map((s) => (s || "").trim()).filter(Boolean).length > 0 ? (
                        targetSectors.map((s) => (s || "").trim()).filter(Boolean).map((s) => {
                          const on = selectedSectors.includes(s);
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => toggleSector(s)}
                              className="text-[12px] px-2 py-0.5 rounded-full border transition-colors"
                              style={on
                                ? { background: vars.lightBg, color: vars.accent, borderColor: vars.accent }
                                : { background: "white", color: vars.g400, borderColor: vars.g200 }}
                            >
                              {s}
                            </button>
                          );
                        })
                      ) : <span className="text-sm" style={{ color: vars.g400 }}>Not set in Project Set-Up (1.10)</span>}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: selectedCount === 0 ? vars.red : vars.g400 }}>
                  <Info size={11} />
                  {selectedCount === 0
                    ? "Select at least one sector to run the audit."
                    : selectedCount > 3
                      ? "Tap to include or exclude. The audit probes up to 3 sectors, so only the first 3 are used."
                      : "Tap a sector to include or exclude it. The audit probes the highlighted sectors."}
                </p>
              </div>
            ) : (
              <div className="mb-4 p-3 rounded-lg border text-[12px]" style={{ borderColor: "#F3D9A4", background: "#FDF6E7", color: "#8A6314" }}>
                Add the sectors you operate in (Project Set-Up 1.9) and the markets you sell to (1.10) so the audit knows what to probe.
              </div>
            )}
            <div className="mb-6">
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>
                Additional key phrases <span className="font-normal" style={{ color: vars.g400 }}>(optional, comma-separated)</span>
              </label>
              <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                <Zap size={16} style={{ color: vars.g400 }} />
                <input
                  type="text"
                  value={customKeywords}
                  onChange={(e) => setCustomKeywords(e.target.value)}
                  placeholder="e.g. benchmarking, agency intelligence"
                  className="flex-1 text-sm bg-transparent outline-none"
                  style={{ color: vars.navy }}
                />
              </div>
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: vars.g400 }}>
                <Info size={11} />
                {prefilledKeywords.length > 0
                  ? "Pulled in from your Project Set-Up (section 1.6). Edit or add to these before running."
                  : "Adds extra prompts so we can probe niche queries you want to be cited for."}
              </p>
            </div>
            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "#FBEEEC", color: "#B03D33" }}>
                {error}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={runCheck}
                disabled={loading || auditSectors.length === 0 || probeName.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
                style={{ background: "#1f748f" }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Querying Claude & ChatGPT...
                  </>
                ) : (
                  <>
                    <Search size={16} /> Run Visibility Audit
                  </>
                )}
              </button>
            </div>
            {loading && (
              <div className="mt-6 p-4 rounded-lg border" style={{ borderColor: vars.g200, background: "rgba(31,116,143,0.02)" }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: vars.accent }} />
                  <span className="text-sm font-medium" style={{ color: vars.navy }}>Running dual-engine visibility probes</span>
                </div>
                <p className="text-xs font-light" style={{ color: vars.g500 }}>
                  We're asking both Claude and ChatGPT real sector questions and counting whether {probeName || activeClient.name} appears in their responses. This typically takes 30-60 seconds.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
      <div className="rounded-2xl border overflow-hidden mb-6" style={{ borderColor: vars.g200 }}>
        <div className="px-5 sm:px-8 py-5 sm:py-6" style={{ background: "linear-gradient(135deg, #165265 0%, #1f748f 60%, #2896b9 100%)" }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={`${import.meta.env.BASE_URL}images/logo-white.png`} alt="AIO Fusion" className="h-10 sm:h-14" />
              <div className="hidden sm:block w-px h-10" style={{ background: "rgba(255,255,255,0.25)" }} />
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/60 mb-0.5">Authority & Visibility Report</p>
                <p className="text-white text-sm font-medium" style={{ fontFamily: "'Alice', Georgia, serif" }}>Earned Media Visibility Audit</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {activeClient.logo ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/20 bg-white/90 px-4 py-3 min-w-[80px] sm:min-w-[100px]">
                  <img src={activeClient.logo} alt={`${activeClient.name} logo`} className="h-10 sm:h-14 max-w-[100px] object-contain" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-3 min-w-[80px] sm:min-w-[100px]" style={{ backdropFilter: "blur(8px)" }}>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg border-2 border-dashed border-white/30 flex items-center justify-center mb-1">
                    <Building2 size={18} className="text-white/40" />
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-white/50">Client Logo</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-5 sm:px-8 py-4" style={{ background: "white" }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-light leading-relaxed" style={{ color: vars.g500 }}>
                {result.companyName} was mentioned in <strong style={{ color: vars.navy }}>{result.totalMentions}</strong> of <strong style={{ color: vars.navy }}>{result.totalProbes}</strong> AI probes across ChatGPT and Claude.{" "}
                {result.visibilityScore >= 60
                  ? "Strong AI visibility - this brand is being referenced reliably in your sector."
                  : result.visibilityScore >= 30
                  ? "Moderate AI visibility - the brand appears in some contexts but is not consistently cited."
                  : "Low AI visibility - AI models are not reliably mentioning this brand when asked about the sector."}
              </p>
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white self-start flex-shrink-0" style={{ background: "#1f748f" }}>
              <Download size={14} /> Save as PDF
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t" style={{ borderColor: vars.g100 }}>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-medium border" style={{ borderColor: vars.g200, color: vars.g500 }}>
              Claude: {result.byModel.claude.rate}%
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-medium border" style={{ borderColor: vars.g200, color: vars.g500 }}>
              ChatGPT: {result.byModel.chatgpt.rate}%
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: "rgba(31,116,143,0.06)", color: vars.accent }}>
              Dual-engine merged
            </span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: vars.lightBg, color: vars.accent }}>
              <Repeat size={10} className="inline mr-1" /> Cycle {cycleData.cycle}
            </span>
            <span className="ml-auto text-[10px]" style={{ color: vars.g400 }}>
              {new Date(result.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
          <div className="flex flex-col items-center flex-shrink-0">
            <ScoreRing score={result.visibilityScore} size={130} />
            <span className="text-xs font-semibold mt-1" style={{ color: vars.navy }}>AI Visibility Score</span>
            {previousScore !== null && (() => {
              const delta = result.visibilityScore - previousScore;
              const positive = delta > 0;
              const same = delta === 0;
              const Icon = positive ? TrendingUp : same ? ArrowRight : TrendingDown;
              const color = positive ? vars.green : same ? vars.g500 : vars.red;
              const bg = positive ? "#ECFDF5" : same ? vars.g100 : "#FEE2E2";
              return (
                <span className="mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: bg, color }}>
                  <Icon size={10} className="inline mr-1" />
                  {positive ? "+" : ""}{delta} vs previous ({previousScore}%)
                </span>
              );
            })()}
          </div>
          <div className="flex-1 w-full">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-3" style={{ color: vars.g400 }}>By Model</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ModelCard
                label="ChatGPT (GPT-4o)"
                icon={<MessageSquare size={16} style={{ color: "#10A37F" }} />}
                probes={result.byModel.chatgpt.probes}
                mentions={result.byModel.chatgpt.mentions}
                rate={result.byModel.chatgpt.rate}
              />
              <ModelCard
                label="Claude (Anthropic)"
                icon={<Bot size={16} style={{ color: "#D97706" }} />}
                probes={result.byModel.claude.probes}
                mentions={result.byModel.claude.mentions}
                rate={result.byModel.claude.rate}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-1 flex items-center gap-2" style={{ color: vars.navy }}>
          <Users size={14} style={{ color: vars.accent }} />
          Who AI Recommends Instead of You
        </h3>
        <p className="text-[12px] mb-4" style={{ color: vars.g500 }}>
          The brands that came up again and again when we asked AI about your sector. These are the names winning the visibility you want.
        </p>
        {result.topCompetitors.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {result.topCompetitors.map((c) => (
              <div key={c.name} className="flex items-center justify-between p-3 rounded-lg border" style={{ background: vars.g50, borderColor: vars.g200 }}>
                <span className="text-[13px] font-medium" style={{ color: vars.navy }}>{c.name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded whitespace-nowrap" style={{ background: vars.lightBg, color: vars.accent }}>
                  in {c.mentions} of {result.totalProbes} answers
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] p-3 rounded-lg" style={{ background: vars.g50, color: vars.g500 }}>
            No single rival was recommended often enough to stand out across these searches. That is an opening: the AI has no clear go-to name in your sector yet, so there is space to claim it.
          </p>
        )}
      </div>

      <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-4 flex items-center gap-2" style={{ color: vars.navy }}>
          <Zap size={14} style={{ color: vars.accent }} />
          Detailed Probe Results
        </h3>
        <div className="space-y-2">
          {result.probes.map((probe, i) => (
            <ProbeRow key={i} probe={probe} companyName={result.companyName} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-4" style={{ color: vars.navy }}>How to Interpret These Results</h3>
        <div className="space-y-3">
          {[
            { t: "This is the real test.", b: "We're asking AI models the same questions a prospect, journalist or researcher would ask. If your brand doesn't appear, that's the gap GEO work needs to close." },
            { t: "Scores are directional, not precise.", b: "AI model responses aren't deterministic - the same question can produce slightly different answers each time. Individual results will vary, but the trend across multiple checks over time is meaningful." },
            { t: "Competitors reveal what's working.", b: "The companies AI does mention are winning the visibility race in your sector - analyse what they're doing differently with content structure, schema markup and authority signals." },
            { t: "Use this as a baseline.", b: "Run it now, do your GEO work (diagnostic, content optimisation, schema, authority planning), then run it again. A score moving from 20% to 50% is a measurable result you can report to the client." },
            { t: "Add key phrases for better targeting.", b: "The optional key phrases field lets you test more specific queries relevant to what the client wants to be known for, making the check more representative of their actual market." },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: vars.lightBg }}>
                <span className="text-[10px] font-bold" style={{ color: vars.accent }}>{i + 1}</span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: vars.g500 }}>
                <strong style={{ color: vars.g600 }}>{item.t}</strong> {item.b}
              </p>
            </div>
          ))}
        </div>
      </div>

      {cycleData.history.length > 1 && (
        <div className="rounded-2xl border p-4 sm:p-6 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] mb-4 flex items-center gap-2" style={{ color: vars.navy }}>
            <Repeat size={14} style={{ color: vars.accent }} /> Visibility Over Cycles
          </h3>
          <div className="flex items-end gap-2 h-24">
            {cycleData.history.map((h, i) => {
              const pct = Math.max(4, h.score);
              const isLast = i === cycleData.history.length - 1;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold" style={{ color: vars.g500 }}>{h.score}%</span>
                  <div className="w-full rounded-t" style={{ height: `${pct}%`, background: isLast ? vars.accent : vars.lightBg }} />
                  <span className="text-[9px]" style={{ color: vars.g400 }}>C{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 mb-6" style={{ background: vars.navy, color: "white" }}>
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>
            <Repeat size={11} className="inline mr-1" /> Continue the loop
          </p>
          <p className="text-[15px] font-semibold mb-1">Use this score to drive the next cycle</p>
          <p className="text-[12px] font-light" style={{ color: "rgba(255,255,255,0.7)" }}>
            Optimise the next piece of content, push it through Plan and Release, then re-run this audit. Each cycle should move the score.
          </p>
        </div>
        {onNavigate && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => onNavigate("optimiser")} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 transition-all hover:brightness-110" style={{ background: vars.teal, color: "white" }}>
              <FileEdit size={14} /> Optimise content
            </button>
            <button onClick={() => onNavigate("planner")} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 transition-all hover:brightness-110" style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>
              Open Planner <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setResult(null); setError(""); }} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border" style={{ borderColor: vars.g200, color: vars.g600 }}>
          Run New Audit
        </button>
        <span className="text-[11px]" style={{ color: vars.g400 }}>
          Checked {new Date(result.checkedAt).toLocaleString()} · Results reflect AI model knowledge at time of query and may vary between sessions
        </span>
      </div>
    </div>
  );
}

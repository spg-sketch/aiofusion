import { useState, useEffect } from "react";
import { loadCycle, recordCycle, type CycleHistory } from "./lib/cycleHistory";
import CountdownBanner from "./components/CountdownBanner";
import { recordAuditDuration, getAuditDurationSeconds, getAuditSampleCount, getTypicalDurationHint } from "./lib/auditTiming";
import { getPreferredKeywords, getBusinessSectors, getTargetSectors, getIcpProfile, getClientLocations, getClientPersona, getProjectAuthorityData, getCompetitors, getBuyerQuestions, getSpokespeople, getEvidenceUrls, getBoilerplate, getCompanyDescriptor, getLegalName, getConfirmedEntity, setConfirmedEntity, getLlmSearchQueries, getWebsite, setActiveProjectId, type ConfirmedEntity } from "./IntakeForm";
import { syncIntakeForProject } from "./lib/projectSync";
import { getSession } from "./lib/auth";
import {
  Eye,
  Search,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Zap,
  Users,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Repeat,
  Info,
  Download,
  Building2,
  Clock,
  Trash2,
  SlidersHorizontal,
  AlertTriangle,
  Plus,
  X,
  Loader2,
  Wand2,
  Lock,
  Anchor,
} from "lucide-react";

const vars = {
  navy: "#0a1628",
  accent: "#4f8fff",
  teal: "#4f8fff",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  lightBg: "#e8f0fe",
  g50: "#FAFAFA",
  g100: "#F1F5F9",
  g200: "#E2E8F0",
  g400: "#64748B",
  g500: "#475569",
  g600: "#334155",
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
  competitors?: string[];
  anchored?: boolean;
}

interface AssessmentDimension {
  name: string;
  score: number;
  justification: string;
  confidence: "high" | "medium" | "low";
}

interface AuthorityAssessment {
  index: number;
  grade: string;
  summary: string;
  dimensions: AssessmentDimension[];
  topGaps: string[];
  priorityActions: { action: string; rationale: string; priority: string; failedProbes?: string[] }[];
  queryTable: { query: string; appeared: boolean; notes: string }[];
  competitorInsights?: { name: string; description: string }[];
  categoryFraming?: { query: string; themes: string }[];
  narrativeSignals?: { gpt: string[]; claude: string[]; divergence: string | null };
}

interface EntityClarity {
  brandName: string;
  isAmbiguous: boolean;
  brandRecognised: boolean;
  brandIsDominant: boolean;
  competingEntities: { name: string; description: string }[];
  note: string;
}

interface LlmCheckResult {
  companyName: string;
  sector: string;
  sectors?: string[];
  icp?: string;
  businessType?: string;
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
  assessment?: AuthorityAssessment | null;
  entityClarity?: EntityClarity | null;
  detectionVersion?: number;
}

export type SavedAudit = { id: string; savedAt: string; result: LlmCheckResult };

const savedAuditsKey = (clientId: string) => `aio.savedAudits.${clientId}`;

export function loadSavedAudits(clientId: string): SavedAudit[] {
  try {
    const raw = localStorage.getItem(savedAuditsKey(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedAudits(clientId: string, list: SavedAudit[]): boolean {
  try {
    localStorage.setItem(savedAuditsKey(clientId), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeName(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(ltd|limited|llp|inc|llc|plc)$/, "");
}

function isTracked(name: string, trackedNorm: string[]): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  return trackedNorm.some((t) => t && (t === n || (t.length >= 4 && (n.includes(t) || t.includes(n)))));
}

function isLikelyAffectedByCorroborationFix(r: LlmCheckResult): boolean {
  if (r.detectionVersion) return false;
  return !!(r.entityClarity?.isAmbiguous && r.visibilityScore <= 15);
}

function isSupersededByNewerRun(audit: SavedAudit, allAudits: SavedAudit[]): boolean {
  const norm = normalizeName(audit.result.companyName);
  return allAudits.some(
    (a) =>
      a.id !== audit.id &&
      normalizeName(a.result.companyName) === norm &&
      a.result.checkedAt > audit.result.checkedAt,
  );
}

// Display labels and a fixed worst-first order for the scorecard, so the table
// reads like the reference report regardless of the order the model returns the
// dimensions in. Names not in this map keep their own label and sort last.
const SCORECARD_DISPLAY: Record<string, { label: string; order: number }> = {
  "presence": { label: "Non-branded presence", order: 0 },
  "prominence": { label: "Prominence / position", order: 1 },
  "share of voice": { label: "Share of voice", order: 2 },
  "spokesperson authority": { label: "Spokesperson authority", order: 3 },
  "source quality": { label: "Source quality (earned-led)", order: 4 },
  "message fidelity": { label: "Message fidelity", order: 5 },
  "factual accuracy": { label: "Factual accuracy", order: 6 },
  "entity clarity": { label: "Entity clarity", order: 7 },
};

function orderScorecard(
  dims: AssessmentDimension[],
): Array<AssessmentDimension & { displayName: string; order: number }> {
  return dims
    .map((d) => {
      const disp = SCORECARD_DISPLAY[d.name.trim().toLowerCase()];
      return { ...d, displayName: disp ? disp.label : d.name, order: disp ? disp.order : 99 };
    })
    .sort((a, b) => a.order - b.order);
}

// A short, honest note for the evidence log built from data we already collect:
// whether the brand surfaced, or which rivals the engines named instead.
function queryNote(appeared: boolean, competitors: string[], companyName: string): string {
  if (appeared) return `${companyName} surfaced in the engines' answer.`;
  if (competitors.length > 0) return `Engines named ${competitors.slice(0, 2).join(" and ")} instead.`;
  return "No company clearly recommended.";
}

interface ReportQueryRow {
  question: string;
  appeared: boolean;
  models: string[];
  competitors: string[];
  note: string;
}

interface ReportOwnsRow {
  name: string;
  mentions: number;
  examples: string[];
  tracked: boolean;
}

interface ReportData {
  assess: AuthorityAssessment | null;
  idx: number;
  grade: string;
  presencePct: number;
  sov: number;
  appearedCount: number;
  totalQueries: number;
  queryRows: ReportQueryRow[];
  owns: ReportOwnsRow[];
  trackedCount: number;
  categoryFraming: { query: string; themes: string }[];
}

function deriveReportData(result: LlmCheckResult, tracked: string[]): ReportData {
  const assess = result.assessment || null;
  const idx = assess ? assess.index : result.visibilityScore;
  const grade = assess && assess.grade ? assess.grade : idx >= 80 ? "A" : idx >= 60 ? "B" : idx >= 40 ? "C" : idx >= 20 ? "D" : "F";
  const presencePct = result.totalProbes > 0 ? Math.round((result.totalMentions / result.totalProbes) * 100) : 0;
  const competitorMentionTotal = result.probes.reduce((s, p) => s + (p.competitors?.length || 0), 0);
  const sovDenom = result.totalMentions + competitorMentionTotal;
  const sov = sovDenom > 0 ? Math.round((result.totalMentions / sovDenom) * 100) : 0;

  const byQuery = new Map<string, { question: string; appeared: boolean; models: Set<string>; competitors: Set<string> }>();
  for (const p of result.probes) {
    let g = byQuery.get(p.question);
    if (!g) { g = { question: p.question, appeared: false, models: new Set(), competitors: new Set() }; byQuery.set(p.question, g); }
    if (p.mentioned) g.appeared = true;
    g.models.add(p.model.includes("GPT") ? "ChatGPT" : "Claude");
    (p.competitors || []).forEach((c) => g!.competitors.add(c));
  }
  const queryRows: ReportQueryRow[] = [...byQuery.values()].map((g) => ({
    question: g.question, appeared: g.appeared, models: [...g.models], competitors: [...g.competitors],
    note: queryNote(g.appeared, [...g.competitors], result.companyName),
  }));
  const appearedCount = queryRows.filter((q) => q.appeared).length;
  const totalQueries = queryRows.length;

  const compQueries = new Map<string, Set<string>>();
  for (const p of result.probes) {
    (p.competitors || []).forEach((c) => {
      let s = compQueries.get(c);
      if (!s) { s = new Set(); compQueries.set(c, s); }
      s.add(p.question);
    });
  }
  const trackedNorm = tracked.map(normalizeName).filter(Boolean);
  const owns: ReportOwnsRow[] = result.topCompetitors.map((c) => ({
    name: c.name,
    mentions: c.mentions,
    examples: compQueries.has(c.name) ? [...compQueries.get(c.name)!].slice(0, 2) : [],
    tracked: isTracked(c.name, trackedNorm),
  }));

  const categoryFraming = assess?.categoryFraming || [];

  return { assess, idx, grade, presencePct, sov, appearedCount, totalQueries, queryRows, owns, trackedCount: tracked.filter((t) => t.trim()).length, categoryFraming };
}

function ScoreRing({ score, size = 100, unit = "%" }: { score: number; size?: number; unit?: string }) {
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
        <span className="text-2xl font-bold" style={{ color }}>{score}{unit}</span>
      </div>
    </div>
  );
}

function ReportSection({
  icon, title, subtitle, defaultOpen = true, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background: "white", borderColor: vars.g200 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-4 sm:px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="mt-0.5 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold uppercase tracking-[0.1em]" style={{ color: vars.navy }}>{title}</p>
          <p className="text-[12px] font-normal mt-0.5 leading-snug" style={{ color: vars.g400 }}>{subtitle}</p>
        </div>
        {open
          ? <ChevronUp size={16} className="flex-shrink-0 mt-1" style={{ color: vars.g400 }} />
          : <ChevronDown size={16} className="flex-shrink-0 mt-1" style={{ color: vars.g400 }} />}
      </button>
      {open && (
        <div className="px-4 sm:px-6 pb-5 pt-1 border-t" style={{ borderColor: vars.g100 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ProbeRow({ probe, companyName }: { probe: ProbeItem; companyName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [anchorTooltipVisible, setAnchorTooltipVisible] = useState(false);

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
          {probe.anchored && (
            <span
              className="relative"
              onClick={(e) => { e.stopPropagation(); setAnchorTooltipVisible((v) => !v); }}
              onMouseEnter={() => setAnchorTooltipVisible(true)}
              onMouseLeave={() => setAnchorTooltipVisible(false)}
              title="This question was automatically clarified to ensure AI engines answered about your company, not a namesake"
            >
              <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                <Anchor size={10} />
                Anchored
              </span>
              {anchorTooltipVisible && (
                <span className="absolute right-0 top-full mt-1 z-10 w-56 text-[11px] leading-relaxed p-2.5 rounded-lg shadow-lg" style={{ background: vars.navy, color: "white" }}>
                  This question was automatically clarified to ensure AI engines answered about your company, not a namesake.
                </span>
              )}
            </span>
          )}
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
          {probe.anchored && (
            <div className="mt-3 p-3 rounded-lg flex gap-2.5" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
              <Anchor size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#1D4ED8" }} />
              <p className="text-[12px] leading-relaxed" style={{ color: "#1E3A5F" }}>
                <span className="font-semibold">Question clarified automatically.</span> The company name was appended with its domain to ensure AI engines answered about your company, not a namesake with a similar name.
              </p>
            </div>
          )}
          {probe.mentionContext && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: "#ECFDF5", border: "1px solid #D1FAE5" }}>
              <p className="text-[11px] font-semibold mb-1" style={{ color: vars.green }}>Mention context:</p>
              <p className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
                {highlightName(probe.mentionContext, companyName)}
              </p>
            </div>
          )}
          {probe.competitors && probe.competitors.length > 0 && (
            <div className="mt-3 p-3 rounded-lg" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: "#C2410C" }}>
                Companies the AI named instead{probe.mentioned ? " (alongside " + companyName + ")" : ""}:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {probe.competitors.map((c, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "white", border: "1px solid #FED7AA", color: vars.navy }}>
                    {c}
                  </span>
                ))}
              </div>
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

function NarrativeSignalsCard({ signals, companyName }: { signals: { gpt: string[]; claude: string[]; divergence: string | null }; companyName: string }) {
  const hasGpt = signals.gpt.length > 0;
  const hasClaude = signals.claude.length > 0;
  if (!hasGpt && !hasClaude) return null;
  return (
    <ReportSection
      icon={<Repeat size={14} style={{ color: vars.accent }} />}
      title="Narrative signals"
      subtitle="How each AI engine describes this brand when it does surface — and whether they agree"
      defaultOpen={true}
    >
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: vars.g400 }}>ChatGPT frames {companyName} as…</p>
          {hasGpt ? (
            <div className="flex flex-wrap gap-1.5">
              {signals.gpt.map((tag, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#E0F2F7", color: vars.navy, border: `1px solid ${vars.teal}30` }}>{tag}</span>
              ))}
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: vars.g400 }}>Brand did not surface in ChatGPT probes — no framing to extract.</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2" style={{ color: vars.g400 }}>Claude frames {companyName} as…</p>
          {hasClaude ? (
            <div className="flex flex-wrap gap-1.5">
              {signals.claude.map((tag, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "#F3E8FF", color: "#6B21A8", border: "1px solid #D8B4FE30" }}>{tag}</span>
              ))}
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: vars.g400 }}>Brand did not surface in Claude probes — no framing to extract.</p>
          )}
        </div>
      </div>
      {signals.divergence && (
        <div className="rounded-xl p-3 flex gap-2.5" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#D97706" }} />
          <div>
            <p className="text-[11px] font-bold mb-0.5" style={{ color: "#92400E" }}>Positioning divergence</p>
            <p className="text-[12px] leading-relaxed" style={{ color: "#78350F" }}>{signals.divergence} This suggests inconsistent positioning in AI training data — a PR opportunity to reinforce a unified narrative.</p>
          </div>
        </div>
      )}
    </ReportSection>
  );
}

export default function LlmCheckPage({ activeClient, onNavigate, pendingAuditId, onConsumePending }: { activeClient: Client; onNavigate?: (p: string) => void; pendingAuditId?: string | null; onConsumePending?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [probeProgress, setProbeProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<LlmCheckResult | null>(null);
  const prefilledKeywords = getPreferredKeywords();
  const [customKeywords, setCustomKeywords] = useState(() => {
    const q = getLlmSearchQueries();
    const hasStructured = q.discovery.length > 0 || q.shortlist.length > 0 || q.comparison.length > 0;
    return hasStructured ? "" : prefilledKeywords.join(", ");
  });
  const [companyName, setCompanyName] = useState(activeClient.name);
  const [businessType, setBusinessType] = useState<"" | "service" | "product" | "consumer">("");
  const [icpProfile, setIcpProfile] = useState(getIcpProfile());
  const [icpLocation, setIcpLocation] = useState(getClientLocations());
  const [llmQueries, setLlmQueries] = useState<{ discovery: string[]; shortlist: string[]; comparison: string[] }>(() => {
    const q = getLlmSearchQueries();
    if (q.discovery.length > 0 || q.shortlist.length > 0 || q.comparison.length > 0) {
      return { discovery: q.discovery, shortlist: q.shortlist, comparison: q.comparison };
    }
    return { discovery: getBuyerQuestions(), shortlist: [], comparison: [] };
  });
  const [llmQueriesGenerating, setLlmQueriesGenerating] = useState(false);
  const [llmQueriesError, setLlmQueriesError] = useState("");
  const [competitorsText, setCompetitorsText] = useState(getCompetitors().join("\n"));
  useEffect(() => {
    // Pin the active project key FIRST so every subsequent localStorage read
    // targets this project's data, not whatever was last active in the session.
    setActiveProjectId(activeClient.id);
    setCompanyName(activeClient.name);
    setIcpProfile(getIcpProfile());
    setIcpLocation(getClientLocations());
    const q = getLlmSearchQueries();
    const hasStructured = q.discovery.length > 0 || q.shortlist.length > 0 || q.comparison.length > 0;
    setLlmQueries(hasStructured
      ? { discovery: q.discovery, shortlist: q.shortlist, comparison: q.comparison }
      : { discovery: getBuyerQuestions(), shortlist: [], comparison: [] });
    setCustomKeywords(hasStructured ? "" : getPreferredKeywords().join(", "));
    setCompetitorsText(getCompetitors().join("\n"));
    setSpokespeople(getSpokespeople());
    setEvidenceUrls(getEvidenceUrls());
    setBoilerplate(getBoilerplate());
    setDescriptor(getCompanyDescriptor());
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
  // LLM search queries (1.6) and competitors (4.8) most directly shape the
  // audit, so they are editable here.
  const buyerQuestions = [...llmQueries.discovery, ...llmQueries.shortlist, ...llmQueries.comparison]
    .map((q) => q.trim()).filter(Boolean);
  const competitors = competitorsText.split(/[\n,]+/).map((c) => c.trim()).filter(Boolean);
  // The remaining authority signals are shown read-only so the user can see what
  // is feeding the score, with a pointer to where to edit them in Project Set-Up.
  // Stored as state so they refresh when activeClient.id changes (the useEffect
  // above calls setActiveProjectId first, ensuring reads target the right project).
  const [spokespeople, setSpokespeople] = useState(() => getSpokespeople());
  const [evidenceUrls, setEvidenceUrls] = useState(() => getEvidenceUrls());
  const [boilerplate, setBoilerplate] = useState(() => getBoilerplate());
  const [descriptor, setDescriptor] = useState(() => getCompanyDescriptor());
  const [cycleData, setCycleData] = useState<CycleHistory>(() => loadCycle(activeClient.id));
  const previousScore = cycleData.history.length > 0 ? cycleData.history[cycleData.history.length - 1].score : null;
  const [savedAudits, setSavedAudits] = useState<SavedAudit[]>(() => loadSavedAudits(activeClient.id));
  const [justSaved, setJustSaved] = useState(false);
  const [resultIsFromSaved, setResultIsFromSaved] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  type AuditLockInfo = { locked: boolean; lastRunAt?: string; nextAvailableAt?: string; daysRemaining?: number };
  const [auditLock, setAuditLock] = useState<AuditLockInfo>({ locked: false });
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [pendingForce, setPendingForce] = useState(false);
  // The identity the user has confirmed is theirs for an ambiguous brand name.
  // Read from the project on mount/switch; persisted via setConfirmedEntity so
  // the next audit run anchors to it.
  const [confirmedEntity, setConfirmedEntityState] = useState<ConfirmedEntity>(() => getConfirmedEntity());
  // Whether the confirmation control is open for editing (re-opened by "Change").
  const [editingIdentity, setEditingIdentity] = useState(false);

  function saveConfirmedEntity(entity: ConfirmedEntity) {
    setConfirmedEntity(entity);
    setConfirmedEntityState(entity);
    setEditingIdentity(false);
  }
  const hasSection16Queries = (() => {
    const q = getLlmSearchQueries();
    return q.discovery.length > 0 || q.shortlist.length > 0 || q.comparison.length > 0;
  })();
  const setupIncomplete = auditSectors.length === 0 || probeName.length === 0 || !hasSection16Queries;
  useEffect(() => {
    if (setupIncomplete) setShowRefine(true);
  }, [setupIncomplete]);

  useEffect(() => {
    setCycleData(loadCycle(activeClient.id));
    setSavedAudits(loadSavedAudits(activeClient.id));
    setResult(null);
    setError("");
    setJustSaved(false);
    setResultIsFromSaved(false);
    setConfirmedEntityState(getConfirmedEntity());
    setEditingIdentity(false);
    setAuditLock({ locked: false });
    setShowRunConfirm(false);
    setPendingForce(false);
  }, [activeClient.id]);

  // Fetch audit lock status for this project whenever the active client changes.
  useEffect(() => {
    if (!activeClient.id) return;
    const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
    fetch(`${apiBase}/api/audit-lock?projectId=${encodeURIComponent(activeClient.id)}&auditType=visibility`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setAuditLock(d))
      .catch(() => { /* non-blocking */ });
  }, [activeClient.id]);

  // Pull this project's shared Set-Up from the server, then refresh the confirmed
  // identity from the (possibly newer) local cache. This is what lets a choice
  // confirmed on another device, or by a teammate on the same account, show up
  // here instead of only in the browser that made it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await syncIntakeForProject(activeClient.id);
      if (!cancelled) setConfirmedEntityState(getConfirmedEntity());
    })();
    return () => { cancelled = true; };
  }, [activeClient.id]);

  function saveAuditToHistory(auditResult: LlmCheckResult | null = result) {
    if (!auditResult) return;
    if (savedAudits.some((a) => a.result.checkedAt === auditResult.checkedAt)) {
      setJustSaved(true);
      return;
    }
    const entry: SavedAudit = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      result: auditResult,
    };
    const next = [entry, ...savedAudits];
    if (!persistSavedAudits(activeClient.id, next)) {
      alert("Could not save this audit - your browser storage may be full. Try removing a few older saved audits.");
      return;
    }
    setSavedAudits(next);
    setJustSaved(true);
    window.dispatchEvent(new Event("aio:saved-audits-changed"));
  }

  function openSavedAudit(a: SavedAudit) {
    setResult(a.result);
    setError("");
    setJustSaved(true);
    setResultIsFromSaved(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteSavedAudit(id: string) {
    const next = savedAudits.filter((a) => a.id !== id);
    if (!persistSavedAudits(activeClient.id, next)) {
      alert("Could not update saved audits - your browser storage may be unavailable.");
      return;
    }
    setSavedAudits(next);
    window.dispatchEvent(new Event("aio:saved-audits-changed"));
  }

  useEffect(() => {
    if (!pendingAuditId) return;
    const match = savedAudits.find((a) => a.id === pendingAuditId);
    if (match) openSavedAudit(match);
    onConsumePending?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuditId, savedAudits]);

  async function generateQueriesOnPage(isAuto = false) {
    setLlmQueriesError("");
    setLlmQueriesGenerating(true);
    try {
      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const resp = await fetch(`${apiBase}/api/content/llm-queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descriptor: getCompanyDescriptor(),
          primaryMessage: getBoilerplate(),
          services: "",
          targetClients: getIcpProfile(),
          geography: getClientLocations(),
          mediaCategories: getBusinessSectors().slice(0, 5).join(", "),
          competitors: getCompetitors().slice(0, 10).join(", "),
          websiteUrl: getWebsite(),
        }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({ error: "Could not generate queries." }));
        throw new Error(d.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setLlmQueries({
        discovery: Array.isArray(data.discovery) ? (data.discovery as string[]) : [],
        shortlist: Array.isArray(data.shortlist) ? (data.shortlist as string[]) : [],
        comparison: Array.isArray(data.comparison) ? (data.comparison as string[]) : [],
      });
    } catch (err) {
      if (!isAuto) {
        setLlmQueriesError((err instanceof Error ? err.message : null) || "Could not generate queries. Please try again.");
      }
    } finally {
      setLlmQueriesGenerating(false);
    }
  }

  async function runCheck(force = false) {
    setLoading(true);
    setError("");
    setResult(null);
    setJustSaved(false);
    const _auditStart = Date.now();
    setProbeProgress(null);

    try {
      const keywords = customKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);

      // Start from the Project Set-Up data, then apply the user's on-screen edits
      // to the two highest-impact inputs so what they see is what gets probed.
      const projectData = getProjectAuthorityData();
      projectData.buyerQuestions = buyerQuestions;
      projectData.competitors = competitors;

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
          icp: icpProfile.trim(),
          location: icpLocation.trim(),
          persona: getClientPersona(),
          businessType,
          projectData,
          projectId: activeClient.id,
          force,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Check failed" }));
        if (resp.status === 429 && data.locked) {
          const retryAfterHeader = resp.headers.get("Retry-After");
          const retryAfterSecs = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const nextAvailableAt = !isNaN(retryAfterSecs)
            ? new Date(Date.now() + retryAfterSecs * 1000).toISOString()
            : (data.nextAvailableAt as string | undefined);
          const daysRemaining = !isNaN(retryAfterSecs)
            ? Math.ceil(retryAfterSecs / 86400)
            : (data.daysRemaining as number | undefined);
          setAuditLock({
            locked: true,
            lastRunAt: data.lastRunAt as string | undefined,
            nextAvailableAt,
            daysRemaining,
          });
        }
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      // The endpoint now streams SSE: progress events while probes run, then a
      // single result event with the full payload.
      if (!resp.body) throw new Error("Response stream could not be read.");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData: LlmCheckResult | null = null;
      let sseError: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = "message";
          let dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          let parsed: Record<string, unknown>;
          try { parsed = JSON.parse(dataStr); } catch { continue; }
          if (event === "progress") {
            const done = typeof parsed.done === "number" ? parsed.done : 0;
            const total = typeof parsed.total === "number" ? parsed.total : 0;
            setProbeProgress({ done, total });
          } else if (event === "result") {
            finalData = parsed as unknown as LlmCheckResult;
          } else if (event === "error") {
            sseError = typeof parsed.error === "string" ? parsed.error : "Visibility check failed. Please try again.";
          }
        }
      }

      if (sseError) throw new Error(sseError);
      if (!finalData) throw new Error("The audit ended before it finished. Please try again.");

      setResult(finalData);
      setResultIsFromSaved(false);
      const updated = recordCycle(activeClient.id, finalData.visibilityScore);
      setCycleData(updated);
      saveAuditToHistory(finalData);
      recordAuditDuration("visibility", Date.now() - _auditStart, getAuditDurationSeconds("visibility") * 1000);
      // Refresh audit lock so the UI reflects the new last-run date immediately.
      const apiBase2 = import.meta.env.DEV ? `https://${window.location.host}` : "";
      fetch(`${apiBase2}/api/audit-lock?projectId=${encodeURIComponent(activeClient.id)}&auditType=visibility`, { credentials: "include" })
        .then((r) => r.json())
        .then(setAuditLock)
        .catch(() => {});
    } catch (err: any) {
      setError(err.message || "Failed to run visibility check");
    } finally {
      setLoading(false);
      setProbeProgress(null);
    }
  }

  function openReport() {
    if (!result) return;
    const w = window.open("", "_blank");
    if (!w) {
      alert("Pop-up blocked - allow pop-ups for this site to open the report.");
      return;
    }
    const aioLogo = `${window.location.origin}${import.meta.env.BASE_URL}images/logo-color.png`;
    const assess = result.assessment || null;
    const idx = assess ? assess.index : result.visibilityScore;
    const grade = assess && assess.grade ? assess.grade : idx >= 80 ? "A" : idx >= 60 ? "B" : idx >= 40 ? "C" : idx >= 20 ? "D" : "F";
    const gradeRead =
      idx >= 60
        ? "Strong - this brand is being referenced reliably at the discovery stage."
        : idx >= 30
          ? "Moderate - the brand appears in some answers but is not consistently surfaced."
          : "Low - AI engines rarely surface this brand on non-branded category queries.";
    const checked = new Date(result.checkedAt).toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const sectorsUsed = result.sectors && result.sectors.length > 0 ? result.sectors : auditSectors;
    const presencePct = result.totalProbes > 0 ? Math.round((result.totalMentions / result.totalProbes) * 100) : 0;
    // Share of voice from the full probe set (every named rival across all probes),
    // not the server-truncated topCompetitors list, so the percentage stays honest.
    const competitorMentionTotal = result.probes.reduce((s, p) => s + (p.competitors?.length || 0), 0);
    const sovDenom = result.totalMentions + competitorMentionTotal;
    const sov = sovDenom > 0 ? Math.round((result.totalMentions / sovDenom) * 100) : 0;

    // Group per-model probes into one row per unique query for the evidence log.
    const byQuery = new Map<string, { question: string; appeared: boolean; models: Set<string>; competitors: Set<string> }>();
    for (const p of result.probes) {
      let g = byQuery.get(p.question);
      if (!g) { g = { question: p.question, appeared: false, models: new Set(), competitors: new Set() }; byQuery.set(p.question, g); }
      if (p.mentioned) g.appeared = true;
      g.models.add(p.model.includes("GPT") ? "ChatGPT" : "Claude");
      (p.competitors || []).forEach((c) => g!.competitors.add(c));
    }
    const queryRows = [...byQuery.values()];
    const appearedCount = queryRows.filter((q) => q.appeared).length;
    const totalQueries = queryRows.length;

    // Which queries each competitor surfaced in.
    const compQueries = new Map<string, Set<string>>();
    for (const p of result.probes) {
      (p.competitors || []).forEach((c) => {
        let s = compQueries.get(c);
        if (!s) { s = new Set(); compQueries.set(c, s); }
        s.add(p.question);
      });
    }

    const topComp = result.topCompetitors[0];
    const execSummary =
      `${escapeHtml(result.companyName)} appeared in <strong>${appearedCount}</strong> of <strong>${totalQueries}</strong> non-branded category queries across ChatGPT and Claude (${presencePct}% presence). ` +
      (result.topCompetitors.length > 0
        ? `When ${escapeHtml(result.companyName)} was absent, the engines recommended rivals instead${topComp ? `, most often <strong>${escapeHtml(topComp.name)}</strong> (in ${topComp.mentions} of ${result.totalProbes} answers)` : ""}. `
        : `No single rival was recommended often enough to dominate, so there is open space to claim the category. `) +
      gradeRead;

    const clientLogoBlock = activeClient.logo
      ? `<img src="${escapeHtml(activeClient.logo)}" alt="${escapeHtml(activeClient.name)} logo" class="client-logo" />`
      : `<div class="client-logo placeholder">${escapeHtml(activeClient.name)}</div>`;

    const evidenceRows = queryRows
      .map(
        (q) =>
          `<tr><td>${escapeHtml(q.question)}</td><td class="${q.appeared ? "appeared-yes" : "appeared-no"}">${q.appeared ? "Yes" : "No"}</td><td>${[...q.competitors].map((c) => escapeHtml(c)).join(", ") || `<span class="muted">none surfaced</span>`}</td><td class="muted">${escapeHtml(queryNote(q.appeared, [...q.competitors], result.companyName))}</td></tr>`,
      )
      .join("");

    const trackedNormExport = competitors.map(normalizeName).filter(Boolean);
    const insightMapExport = new Map<string, string>(
      (assess?.competitorInsights || []).map((ci) => [normalizeName(ci.name), ci.description]),
    );
    const ownsRows = result.topCompetitors
      .map((c) => {
        const qs = compQueries.get(c.name);
        const examples = qs ? [...qs].slice(0, 2).map((x) => escapeHtml(x)).join("; ") : "";
        const tracked = isTracked(c.name, trackedNormExport);
        const insight = !tracked ? insightMapExport.get(normalizeName(c.name)) : undefined;
        return `<tr><td><strong>${escapeHtml(c.name)}</strong>${insight ? `<br/><span class="muted">${escapeHtml(insight)}</span>` : ""}</td><td>${c.mentions} of ${result.totalProbes} answers<br/><span class="muted">${examples}</span></td><td class="${tracked ? "appeared-yes" : "appeared-no"}">${tracked ? "Yes" : "No"}</td></tr>`;
      })
      .join("");

    const probeGaps = queryRows.filter((q) => !q.appeared).slice(0, 6);
    const gapItems = assess && assess.topGaps.length > 0 ? assess.topGaps : probeGaps.map((q) => q.question);
    const gapsBlock =
      gapItems.length > 0
        ? `<ul class="gaps">${gapItems.map((g) => `<li>${escapeHtml(g)}</li>`).join("")}</ul>`
        : `<p class="muted box">No discovery gaps - ${escapeHtml(result.companyName)} appeared in every probed query.</p>`;

    const summaryHtml = assess && assess.summary ? escapeHtml(assess.summary) : execSummary;

    const scorecardBlock = assess
      ? `<div class="card">
      <h2>AI Authority scorecard</h2>
      <table>
        <thead><tr><th>Dimension</th><th>Score / 5</th><th>Read</th></tr></thead>
        <tbody>${orderScorecard(assess.dimensions)
          .map((d) => {
            const noEvidence = d.confidence === "low" && d.score === 0 && d.justification.trim() === "No evidence in this run.";
            const pillClass = noEvidence ? "nm" : d.score >= 60 ? "good" : d.score >= 30 ? "mid" : "low";
            const pillText = noEvidence ? "N/M" : `${Math.round(d.score / 20)} / 5`;
            const readText = noEvidence ? "Not measurable — brand appeared too rarely in this run for a reliable score." : d.justification;
            return `<tr><td><strong>${escapeHtml(d.displayName)}</strong></td><td><span class="score-pill ${pillClass}">${pillText}</span></td><td>${escapeHtml(readText)}</td></tr>`;
          })
          .join("")}</tbody>
      </table>
    </div>`
      : "";

    const actionsBlock =
      assess && assess.priorityActions.length > 0
        ? `<div class="card">
      <h2>Prioritised actions</h2>
      <ol class="actions">${assess.priorityActions
        .map((a) => {
          const displayedProbes = (a.failedProbes || []).slice(0, 3);
          const extraProbes = (a.failedProbes || []).length - 3;
          const failedProbesHtml = displayedProbes.length > 0
            ? `<br /><span class="absent-label">Absent on:</span> ${displayedProbes.map((q) => `<span class="absent-chip">${escapeHtml(q)}</span>`).join(" ")}${extraProbes > 0 ? ` <span class="muted">+${extraProbes} more</span>` : ""}`
            : "";
          return `<li><span class="prio prio-${a.priority}">${escapeHtml((a.priority || "medium").toUpperCase())}</span> <strong>${escapeHtml(a.action)}</strong>${a.rationale ? `<br /><span class="muted">${escapeHtml(a.rationale)}</span>` : ""}${failedProbesHtml}</li>`;
        })
        .join("")}</ol>
    </div>`
        : "";

    const ns = assess?.narrativeSignals;
    const narrativeSignalsBlock = ns && (ns.gpt.length > 0 || ns.claude.length > 0)
      ? `<div class="card">
      <h2>Narrative signals</h2>
      <p class="lead" style="margin-bottom:12px;">How each AI engine describes ${escapeHtml(result.companyName)} when it does surface — and whether they agree.</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:${ns.divergence ? "14px" : "0"}">
        <div style="flex:1;min-width:180px;">
          <p class="meta-line" style="margin-bottom:6px;"><strong>ChatGPT frames ${escapeHtml(result.companyName)} as&hellip;</strong></p>
          ${ns.gpt.length > 0
            ? ns.gpt.map((t) => `<span class="ns-tag ns-gpt">${escapeHtml(t)}</span>`).join(" ")
            : `<span class="muted">Brand did not surface in ChatGPT probes.</span>`}
        </div>
        <div style="flex:1;min-width:180px;">
          <p class="meta-line" style="margin-bottom:6px;"><strong>Claude frames ${escapeHtml(result.companyName)} as&hellip;</strong></p>
          ${ns.claude.length > 0
            ? ns.claude.map((t) => `<span class="ns-tag ns-claude">${escapeHtml(t)}</span>`).join(" ")
            : `<span class="muted">Brand did not surface in Claude probes.</span>`}
        </div>
      </div>
      ${ns.divergence
        ? `<div class="divergence-box"><strong>Positioning divergence:</strong> ${escapeHtml(ns.divergence)} This suggests inconsistent positioning in AI training data &mdash; a PR opportunity to reinforce a unified narrative.</div>`
        : ""}
    </div>`
      : "";

    const ec = result.entityClarity || null;
    const entityClarityBlock =
      ec && ec.isAmbiguous
        ? `<div class="card">
      <h2>Entity clarity: who else is called "${escapeHtml(ec.brandName)}"</h2>
      <p class="lead">${escapeHtml(ec.note)}</p>
      <p class="meta-line" style="margin-top:10px;"><strong>Status:</strong> ${ec.brandRecognised
            ? (ec.brandIsDominant
                ? "The brand is the most prominent holder of this name, but it is shared."
                : "The brand is recognised under this name but is not the most prominent holder - present but confused.")
            : "The brand did not surface for the bare name unprompted - the engines associate the name with other organisations (not absent, but confused)."}</p>
      <table style="margin-top:12px;">
        <thead><tr><th>Other organisations known as "${escapeHtml(ec.brandName)}"</th><th>What they are</th></tr></thead>
        <tbody>${ec.competingEntities
            .map((e) => `<tr><td><strong>${escapeHtml(e.name)}</strong></td><td class="muted">${escapeHtml(e.description) || "&mdash;"}</td></tr>`)
            .join("")}</tbody>
      </table>${confirmedEntity
            ? `<p class="meta-line" style="margin-top:12px;"><strong>Confirmed identity:</strong> "${escapeHtml(ec.brandName)}" is ${escapeHtml(confirmedEntity.name)}. Future audits measure this company specifically.</p>`
            : ""}
    </div>`
        : "";

    const assessmentQueryBlock =
      assess && assess.queryTable.length > 0
        ? `<div class="card">
      <h2>Per-query authority read</h2>
      <table>
        <thead><tr><th>Query</th><th>Appeared</th><th>What the engines said</th></tr></thead>
        <tbody>${assess.queryTable
          .map(
            (q) =>
              `<tr><td>${escapeHtml(q.query)}</td><td class="${q.appeared ? "appeared-yes" : "appeared-no"}">${q.appeared ? "Yes" : "No"}</td><td>${escapeHtml(q.notes) || `<span class="muted">No evidence</span>`}</td></tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>`
        : "";

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Authority &amp; Earned-Media Visibility Assessment - ${escapeHtml(result.companyName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1C1C1C; margin: 0; padding: 0 0 40px; background: #fff; }
  .wrap { max-width: 820px; margin: 0 auto; padding: 0 24px; }
  .header { background: linear-gradient(135deg, #165265 0%, #1f748f 60%, #2896b9 100%); color: #fff; padding: 22px 0; margin-bottom: 24px; }
  .header .wrap { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .aio-logo { height: 46px; }
  .header .eyebrow { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255,255,255,0.65); margin: 0 0 2px; }
  .header .title { font-size: 15px; font-weight: 600; margin: 0; }
  .client-logo { height: 52px; max-width: 150px; object-fit: contain; background: #fff; border-radius: 10px; padding: 6px 10px; }
  .client-logo.placeholder { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: #165265; min-width: 90px; height: 52px; }
  h1 { font-size: 24px; color: #165265; margin: 0 0 4px; }
  .sub { color: #6B7280; font-size: 13px; margin: 0 0 18px; }
  .card { border: 1px solid #E5E5E5; border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; }
  .index-row { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
  .index-num { font-size: 50px; font-weight: 700; color: #165265; line-height: 1; }
  .index-num span { font-size: 22px; color: #9CA3AF; font-weight: 600; }
  .index-label { font-size: 11px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 6px; }
  .grade { font-size: 18px; font-weight: 700; padding: 6px 14px; border-radius: 10px; }
  .grade.A, .grade.B { background: #ECFDF5; color: #2F855A; }
  .grade.C { background: #FEFCE8; color: #A16207; }
  .grade.D, .grade.F { background: #FEE2E2; color: #B91C1C; }
  .stats { display: flex; gap: 10px; flex-wrap: wrap; }
  .stat { background: #FAFAFA; border: 1px solid #E5E5E5; border-radius: 10px; padding: 10px 14px; min-width: 120px; }
  .stat b { display: block; font-size: 22px; color: #165265; }
  .stat small { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #165265; margin: 0 0 10px; }
  p.lead { font-size: 14px; color: #374151; line-height: 1.6; margin: 0; }
  .meta-line { font-size: 12px; color: #6B7280; margin: 0 0 4px; }
  .meta-line strong { color: #374151; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; background: #F3F4F6; color: #374151; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #E5E5E5; }
  td { padding: 8px 10px; border-bottom: 1px solid #EEE; vertical-align: top; color: #1C1C1C; }
  td.appeared-yes { color: #2F855A; font-weight: 600; }
  td.appeared-no { color: #B91C1C; font-weight: 600; }
  .gaps { margin: 0; padding-left: 18px; }
  .gaps li { font-size: 13px; color: #374151; margin-bottom: 6px; }
  .box { background: #FAFAFA; border-radius: 8px; padding: 12px; }
  .muted { color: #6B7280; font-size: 12px; }
  .score-pill { display: inline-block; min-width: 34px; text-align: center; font-weight: 700; font-size: 12px; padding: 3px 8px; border-radius: 8px; }
  .score-pill.good { background: #ECFDF5; color: #2F855A; }
  .score-pill.mid { background: #FEFCE8; color: #A16207; }
  .score-pill.low { background: #FEE2E2; color: #B91C1C; }
  .score-pill.nm { background: #F3F3F3; color: #9CA3AF; }
  .conf { font-size: 11px; white-space: nowrap; }
  .conf-high { color: #2F855A; }
  .conf-medium { color: #A16207; }
  .conf-low { color: #9CA3AF; }
  .actions { margin: 0; padding-left: 18px; }
  .actions li { font-size: 13px; color: #374151; margin-bottom: 10px; line-height: 1.5; }
  .prio { display: inline-block; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 6px; margin-right: 6px; vertical-align: middle; }
  .prio-high { background: #FEE2E2; color: #B91C1C; }
  .absent-label { font-size: 10px; font-weight: 600; color: #6B7280; }
  .absent-chip { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; margin: 2px 2px 0 0; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
  .ns-tag { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 9999px; font-weight: 500; margin: 2px 2px 0 0; }
  .ns-gpt { background: #E0F2F7; color: #0F2A3F; border: 1px solid rgba(20,158,188,0.18); }
  .ns-claude { background: #F3E8FF; color: #6B21A8; border: 1px solid rgba(216,180,254,0.18); }
  .divergence-box { margin-top: 12px; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #78350F; }
  .prio-medium { background: #FEFCE8; color: #A16207; }
  .prio-low { background: #F3F4F6; color: #6B7280; }
  .footer { font-size: 11px; color: #9CA3AF; margin-top: 18px; border-top: 1px solid #E5E5E5; padding-top: 12px; }
  @media print { .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .card, tr { break-inside: avoid; } }
</style></head>
<body>
  <div class="header"><div class="wrap">
    <div class="header-left">
      <img src="${aioLogo}" alt="AIO Fusion" class="aio-logo" />
      <div><p class="eyebrow">AI Authority &amp; Visibility</p><p class="title">Earned-Media Visibility Assessment</p></div>
    </div>
    ${clientLogoBlock}
  </div></div>
  <div class="wrap">
    <h1>AI Authority &amp; Earned-Media Visibility Assessment</h1>
    <p class="sub">${escapeHtml(result.companyName)} &middot; ${escapeHtml(checked)} &middot; Blind probes across ChatGPT and Claude${sectorsUsed.length > 0 ? ` &middot; ${escapeHtml(sectorsUsed.join(", "))}` : ""}${trackedNormExport.length > 0 ? ` &middot; ${trackedNormExport.length} tracked competitors` : ""}</p>
    <div class="card">
      <div class="index-row">
        <div>
          <div class="index-num">${idx}<span> / 100</span></div>
          <div class="index-label">AI Authority Index</div>
        </div>
        <div class="grade ${grade}">Grade ${grade}</div>
        <div class="stats">
          <div class="stat"><b>${presencePct}%</b><small>Presence</small></div>
          <div class="stat"><b>${sov}%</b><small>Share of voice</small></div>
          <div class="stat"><b>${appearedCount} / ${totalQueries}</b><small>Queries appeared</small></div>
        </div>
      </div>
      <div style="margin-top:14px;font-size:11px;color:#6B7280;">ChatGPT: ${result.byModel.chatgpt.rate}% &middot; Claude: ${result.byModel.claude.rate}% &middot; Cycle ${cycleData.cycle}</div>
      <p style="margin-top:10px;font-size:10px;color:#9CA3AF;">Methodology: the Authority Index applies intent-tier weighting &mdash; buyer-intent queries (1.5&times;) carry more signal than sector queries (1.0&times;) or the direct identity probe (0.5&times;).</p>
    </div>
    <div class="card">
      <h2>Executive summary</h2>
      <p class="lead">${summaryHtml}</p>
      ${result.icp ? `<p class="meta-line" style="margin-top:12px;"><strong>Ideal customer profile:</strong> ${escapeHtml(result.icp)}</p>` : ""}
    </div>
    ${narrativeSignalsBlock}
    ${entityClarityBlock}
    ${scorecardBlock}
    ${actionsBlock}
    <div class="card">
      <h2>Top visibility gaps</h2>
      ${gapsBlock}
    </div>
    <div class="card">
      <h2>Who owns the category instead</h2>
      ${result.topCompetitors.length > 0
        ? `<table><thead><tr><th>Competitor</th><th>Surfaced in</th><th>On tracked list?</th></tr></thead><tbody>${ownsRows}</tbody></table>`
        : `<p class="muted box">No single rival was recommended often enough to stand out. That is an opening: the engines have no clear go-to name in your sector yet, so there is space to claim it.</p>`}
    </div>
    ${assessmentQueryBlock}
    ${assess && assess.categoryFraming && assess.categoryFraming.length > 0
      ? `<div class="card">
      <h2>What the AI says about this category</h2>
      <p class="meta-line" style="margin-bottom:10px;">How AI engines frame each topic when this brand is not named — the vocabulary and concepts you need to own. Derived from blind-probe evidence only.</p>
      <table>
        <thead><tr><th style="width:38%">Query</th><th>How engines frame this topic</th></tr></thead>
        <tbody>${assess.categoryFraming.map((row) => `<tr><td><strong>${escapeHtml(row.query)}</strong></td><td class="muted">${escapeHtml(row.themes)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`
      : ""}
    <div class="card">
      <h2>Blind-probe evidence log</h2>
      <table>
        <thead><tr><th>Query</th><th>Appeared</th><th>Competitors surfaced</th><th>Sources / notes</th></tr></thead>
        <tbody>${evidenceRows}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>Method &amp; caveats</h2>
      <p class="lead">This assessment fires the buyer's real, non-branded category questions at ChatGPT and Claude as blind probes (the brand is not named in the prompt), with multiple runs per model to account for AI non-determinism. Presence and share of voice are measured from those live answers. Branded queries that test message fidelity and entity clarity are not part of this run. Results reflect each engine's knowledge at the time of the probe and vary between sessions, so re-run on a schedule to chart the trend.</p>
    </div>
    <div class="footer">Generated by AIO Fusion &middot; AI Authority &amp; Earned-Media Visibility Assessment &middot; Results reflect AI model knowledge at time of query and may vary between sessions.</div>
  </div>
</body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch {
        /* noop */
      }
    }, 400);
  }

  if (!result) {
    return (
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Eye size={20} color="#1f748f" />
            <h1 className="text-xl tracking-tight flex items-center" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>
              Earned Media Visibility Audit
            </h1>
          </div>
          <p className="text-[14px] font-light" style={{ color: vars.g500 }}>
            Score how often {probeName || activeClient.name} is mentioned when AI engines are asked about your sectors and target markets.
          </p>
        </div>
        <div className="rounded-xl border p-4 sm:p-8" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="max-w-lg mx-auto">
            <div className="mb-5 p-4 rounded-lg border" style={{ borderColor: vars.g200, background: vars.g50 }}>
              <div className="flex items-center gap-2 mb-3">
                <Search size={16} style={{ color: vars.accent }} />
                <span className="text-sm font-medium" style={{ color: vars.navy }}>
                  We'll probe <strong>{probeName || activeClient.name}</strong> using your Project Set-Up data
                </span>
              </div>
              {combinedSectors.length > 0 ? (
                auditSectors.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {auditSectors.map((s) => (
                      <span key={s} className="text-[12px] px-2.5 py-1 rounded-full border" style={{ background: vars.lightBg, color: vars.accent, borderColor: vars.accent }}>{s}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px]" style={{ color: vars.red }}>No sectors selected. Open "Refine what we probe" below to choose at least one.</p>
                )
              ) : (
                <p className="text-[12px]" style={{ color: "#8A6314" }}>No sectors found in your Project Set-Up. Open "Refine what we probe" below to set them, or add them in Project Set-Up (1.9 and 1.10).</p>
              )}
              <p className="text-[11px] mt-2.5 flex items-start gap-1" style={{ color: vars.g400 }}>
                <Info size={11} className="flex-shrink-0 mt-0.5" />
                We also pull in your buyer questions ({buyerQuestions.length}), competitors ({competitors.length}) and authority signals (spokespeople, coverage, boilerplate) from your Project Set-Up, along with your company, ideal customer profile and locations. They all shape the result. Open "Refine what we probe" to see and adjust everything.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRefine((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] font-medium mb-5 transition-colors hover:opacity-80"
              style={{ color: vars.accent }}
            >
              <SlidersHorizontal size={13} />
              {showRefine ? "Hide refine options" : "Refine what we probe"}
              <ChevronDown size={13} style={{ transform: showRefine ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {showRefine && (<>
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
                  : "Edit to probe just the core brand name or a specific sub-brand."}
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
                    <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>Audiences you target</label>
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
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>Business type</label>
              <div className="flex flex-wrap gap-2">
                {([ ["", "Auto-detect"], ["service", "Professional services / agency"], ["product", "Product / software"], ["consumer", "Consumer brand"] ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBusinessType(val)}
                    className="text-[12px] px-3 py-1.5 rounded-full border transition-colors"
                    style={businessType === val
                      ? { background: vars.lightBg, color: vars.accent, borderColor: vars.accent, fontWeight: 600 }
                      : { background: "white", color: vars.g500, borderColor: vars.g200 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] mt-1.5 flex items-start gap-1" style={{ color: vars.g400 }}>
                <Info size={11} className="flex-shrink-0 mt-0.5" />
                Shapes the vocabulary of the generated probes so AI engines surface the right category of competitor — agencies and providers for services, platforms and vendors for products, brands for consumer. Leave on Auto-detect if unsure.
              </p>
            </div>
            <div className="mb-6">
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>
                Additional keywords <span className="font-normal" style={{ color: vars.g400 }}>(optional, comma-separated)</span>
              </label>
              <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: vars.g200, background: vars.g50 }}>
                <Zap size={16} style={{ color: vars.g400 }} />
                <input
                  type="text"
                  value={customKeywords}
                  onChange={(e) => setCustomKeywords(e.target.value)}
                  placeholder="e.g. crisis communications, thought leadership, B2B fintech"
                  className="flex-1 text-sm bg-transparent outline-none"
                  style={{ color: vars.navy }}
                />
              </div>
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: vars.g400 }}>
                <Info size={11} />
                These keywords generate one extra probe — "Which companies are known for [keyword]?" — alongside the LLM search queries in section 1.6. They are not fired as verbatim questions.
              </p>
            </div>
            <div className="mb-6">
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>
                Who you serve - ideal customer profile <span className="font-normal" style={{ color: vars.g400 }}>(optional, recommended)</span>
              </label>
              <textarea
                value={icpProfile}
                onChange={(e) => setIcpProfile(e.target.value)}
                rows={6}
                placeholder="e.g. small to mid-sized marketing and creative agencies, 10 to 150 staff - not the large global consultancies"
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-y"
                style={{ borderColor: vars.g200, color: vars.navy, background: vars.g50 }}
              />
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: vars.g400 }}>
                <Info size={11} />
                {getIcpProfile()
                  ? "Pulled in from your Project Set-Up (section 3.2). Describing the size and type of customer you serve steers results to specialist providers, not the household-name firms."
                  : "Add this in Project Set-Up (section 3.2), or type it here. It steers results to specialist providers for your size of customer, not the household-name firms."}
              </p>
            </div>
            <div className="mb-6">
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>
                Locations you serve <span className="font-normal" style={{ color: vars.g400 }}>(optional, recommended)</span>
              </label>
              <input
                type="text"
                value={icpLocation}
                onChange={(e) => setIcpLocation(e.target.value)}
                placeholder="e.g. London and the South East, UK-wide, Ireland"
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: vars.g200, color: vars.navy, background: vars.g50 }}
              />
              <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: vars.g400 }}>
                <Info size={11} />
                {getClientLocations()
                  ? "Pulled in from your Project Set-Up (section 3.3). AI answers are often localised, so this checks how you show up in the places that matter to you."
                  : "Add this in Project Set-Up (section 3.3), or type it here. AI answers are often localised, so this checks how you show up where it matters."}
              </p>
            </div>
            <div className="mb-6">
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>
                LLM search queries — how they find you
              </label>
              <div className="mb-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void generateQueriesOnPage()}
                  disabled={llmQueriesGenerating}
                  className="self-start flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: vars.accent }}
                >
                  {llmQueriesGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  {llmQueriesGenerating ? "Generating..." : buyerQuestions.length > 0 ? "Regenerate queries" : "Generate top 12 queries"}
                </button>
                {llmQueriesError && (
                  <p className="text-[12px]" style={{ color: vars.red }}>{llmQueriesError}</p>
                )}
                {buyerQuestions.length === 0 && !llmQueriesGenerating && (
                  <p className="text-[12px] font-light" style={{ color: vars.g500 }}>
                    Or type your own queries in the groups below. Fill in Company Set-Up (section 4) and your primary message first for the best results.
                  </p>
                )}
              </div>
              {(() => {
                const groups: { key: "discovery" | "shortlist" | "comparison"; label: string; sublabel: string; note?: string }[] = [
                  { key: "discovery", label: "Discovery", sublabel: "They are researching the problem space" },
                  { key: "shortlist", label: "Shortlist", sublabel: "They are looking for a provider" },
                  { key: "comparison", label: "Comparison and trust", sublabel: "They are evaluating you against alternatives", note: "Your website domain appears in brackets after your name so AI engines identify the right company — important when your name is shared with others." },
                ];
                return (
                  <div className="space-y-3">
                    {groups.map(({ key, label, sublabel, note }) => {
                      const items = llmQueries[key];
                      return (
                        <div key={key} className="rounded-xl border p-3" style={{ borderColor: vars.g200, background: "white" }}>
                          <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: vars.accent }}>{label}</span>
                            <span className="text-[11px] font-light" style={{ color: vars.g400 }}>{sublabel}</span>
                          </div>
                          <div className="space-y-1.5 mb-2">
                            {items.length === 0 && (
                              <p className="text-[12px] font-light italic" style={{ color: vars.g400 }}>No queries yet.</p>
                            )}
                            {items.map((q, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <textarea
                                  value={q}
                                  rows={2}
                                  onChange={(e) => {
                                    const next = items.map((x, j) => (j === i ? e.target.value : x));
                                    setLlmQueries((prev) => ({ ...prev, [key]: next }));
                                  }}
                                  className="flex-1 px-3 py-2 rounded-lg border text-[13px] font-light outline-none resize-none leading-snug"
                                  style={{ borderColor: vars.g200, color: vars.navy, background: vars.g50 }}
                                  placeholder="Type a query..."
                                />
                                <button
                                  type="button"
                                  onClick={() => setLlmQueries((prev) => ({ ...prev, [key]: items.filter((_, j) => j !== i) }))}
                                  className="flex-shrink-0 p-1 mt-1.5 rounded transition-opacity hover:opacity-70"
                                  style={{ color: vars.g400 }}
                                  title="Remove query"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                          {note && items.length > 0 && (
                            <p className="text-[11px] mb-2 flex items-start gap-1" style={{ color: vars.g400 }}>
                              <Info size={11} className="flex-shrink-0 mt-0.5" />{note}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => setLlmQueries((prev) => ({ ...prev, [key]: [...prev[key], ""] }))}
                            className="text-[12px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-70"
                            style={{ color: vars.accent }}
                          >
                            <Plus size={12} /> Add query
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <p className="text-[11px] mt-2 flex items-start gap-1" style={{ color: buyerQuestions.length === 0 ? "#8A6314" : vars.g400 }}>
                <Info size={11} className="flex-shrink-0 mt-0.5" />
                {buyerQuestions.length > 0
                  ? `These ${buyerQuestions.length} queries are run as blind probes. We then check whether you appear in the answer.`
                  : "Generate queries above, or type your own. They are run as blind probes so we can check whether you appear."}
              </p>
            </div>
            <div className="mb-6">
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>
                Competitors we measure you against <span className="font-normal" style={{ color: vars.g400 }}>(one per line)</span>
              </label>
              <textarea
                value={competitorsText}
                onChange={(e) => setCompetitorsText(e.target.value)}
                rows={3}
                placeholder="e.g. Edelman, Brunswick, FleishmanHillard"
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none resize-y"
                style={{ borderColor: vars.g200, color: vars.navy, background: vars.g50 }}
              />
              <p className="text-[11px] mt-1.5 flex items-start gap-1" style={{ color: competitors.length === 0 ? "#8A6314" : vars.g400 }}>
                <Info size={11} className="flex-shrink-0 mt-0.5" />
                {competitors.length > 0
                  ? `We use these ${competitors.length} competitors from your Project Set-Up (section 4.8) to work out share of voice, which is who the AI engines name instead of you.`
                  : "Add your main competitors in Project Set-Up (section 4.8), or type them here. We use them to work out share of voice, which is who the AI engines name instead of you."}
              </p>
            </div>
            <div className="mb-6 p-4 rounded-lg border" style={{ borderColor: vars.g200, background: vars.g50 }}>
              <div className="flex items-center gap-2 mb-1">
                <Info size={13} style={{ color: vars.accent }} />
                <span className="text-[12px] font-semibold" style={{ color: vars.navy }}>Other signals feeding your authority score</span>
              </div>
              <p className="text-[11px] mb-3" style={{ color: vars.g400 }}>
                These come straight from your Project Set-Up and feed the authority scoring. To change them, edit the relevant section in Project Set-Up.
              </p>
              <ul className="space-y-2">
                <li className="flex items-start justify-between gap-3">
                  <span className="text-[12px]" style={{ color: vars.navy }}>Spokespeople <span style={{ color: vars.g400 }}>(section 1.8)</span></span>
                  <span className="text-[11px] text-right" style={{ color: spokespeople.length === 0 ? "#8A6314" : vars.g500 }}>
                    {spokespeople.length > 0 ? spokespeople.map((s) => s.name).filter(Boolean).join(", ") : "None set"}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span className="text-[12px]" style={{ color: vars.navy }}>Coverage &amp; evidence links <span style={{ color: vars.g400 }}>(sections 1.4, 4.7, 7.3)</span></span>
                  <span className="text-[11px] text-right" style={{ color: evidenceUrls.length === 0 ? "#8A6314" : vars.g500 }}>
                    {evidenceUrls.length > 0 ? `${evidenceUrls.length} link${evidenceUrls.length === 1 ? "" : "s"}` : "None set"}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span className="text-[12px]" style={{ color: vars.navy }}>Boilerplate <span style={{ color: vars.g400 }}>(section 4.3)</span></span>
                  <span className="text-[11px] text-right max-w-[55%]" style={{ color: boilerplate ? vars.g500 : "#8A6314" }}>
                    {boilerplate ? boilerplate.slice(0, 60).trimEnd() + (boilerplate.length > 60 ? "…" : "") : "Not set — add in Project Set-Up"}
                  </span>
                </li>
                <li className="flex items-start justify-between gap-3">
                  <span className="text-[12px]" style={{ color: vars.navy }}>Company descriptor <span style={{ color: vars.g400 }}>(section 1.1)</span></span>
                  <span className="text-[11px] text-right max-w-[55%]" style={{ color: descriptor ? vars.g500 : "#8A6314" }}>
                    {descriptor ? descriptor.slice(0, 60).trimEnd() + (descriptor.length > 60 ? "…" : "") : "Not set — add in Project Set-Up"}
                  </span>
                </li>
              </ul>
            </div>
            </>)}
            {error && (
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: "#FBEEEC", color: "#B03D33" }}>
                {error}
              </div>
            )}
            {auditLock.lastRunAt && (
              <div className="mb-4 p-3 rounded-lg flex items-start gap-2 text-sm" style={{ background: "#F5F7FA", borderLeft: "3px solid #1f748f", color: "#165265" }}>
                <Lock size={14} className="flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium">Last run: {new Date(auditLock.lastRunAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {auditLock.locked && auditLock.daysRemaining && auditLock.daysRemaining > 0 && (
                    <span className="font-light"> · next run available in {auditLock.daysRemaining} day{auditLock.daysRemaining === 1 ? "" : "s"}</span>
                  )}
                </div>
              </div>
            )}
            {/* Pre-run confirmation dialog */}
            {showRunConfirm && (
              <div className="mb-4 p-4 rounded-lg border" style={{ background: "#FFFBF0", borderColor: "#E5A800" }}>
                <p className="text-sm font-medium mb-1" style={{ color: "#7A5800" }}>
                  {pendingForce ? "Force re-run this audit?" : "Run this audit?"}
                </p>
                <p className="text-xs font-light mb-3" style={{ color: "#7A5800" }}>
                  {pendingForce
                    ? "This will override the 21-day lock. Continue?"
                    : "This will query Claude and ChatGPT across up to 8 questions. It typically takes 1–3 minutes."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setShowRunConfirm(false); runCheck(pendingForce); }}
                    className="px-4 py-1.5 rounded text-xs font-medium text-white"
                    style={{ background: "#1f748f" }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowRunConfirm(false)}
                    className="px-4 py-1.5 rounded text-xs font-medium"
                    style={{ background: "#e8ecf0", color: "#165265" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {auditLock.locked && getSession()?.role !== "admin" ? (
                <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium opacity-60 cursor-not-allowed" style={{ background: "#e8ecf0", color: "#165265" }}>
                  <Lock size={16} /> Audit locked
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { setPendingForce(auditLock.locked); setShowRunConfirm(true); }}
                    disabled={loading || auditSectors.length === 0 || probeName.length === 0 || !hasSection16Queries || showRunConfirm}
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
                        <Search size={16} /> {auditLock.locked ? "Force Re-run Audit" : "Run Visibility Audit"}
                      </>
                    )}
                  </button>
                  {auditLock.locked && (
                    <span className="text-xs font-light" style={{ color: "#B03D33" }}>Admin override</span>
                  )}
                  {!loading && (() => { const hint = getTypicalDurationHint("visibility"); return hint ? (
                    <span className="flex items-center gap-1 text-xs" style={{ color: vars.g400 }}>
                      <Clock size={12} />
                      {hint}
                    </span>
                  ) : null; })()}
                </>
              )}
            </div>
            {!loading && !hasSection16Queries && (
              <div className="mt-3 p-3 rounded-lg flex items-start gap-2.5" style={{ background: "#FEF3C7", border: "1px solid #FCD34D" }}>
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#92400E" }} />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: "#78350F" }}>
                    Section 1.6 queries required before running the audit
                  </p>
                  <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "#92400E" }}>
                    The audit fires your buyer-journey queries verbatim at AI engines. Without them it can only use your brand name, which inflates scores. Go to{" "}
                    {onNavigate ? (
                      <button
                        onClick={() => onNavigate("intake")}
                        className="underline font-medium hover:opacity-75 transition-opacity"
                        style={{ color: "#78350F" }}
                      >
                        Project Set-Up → Section 1.6
                      </button>
                    ) : (
                      <span className="font-medium">Project Set-Up → Section 1.6</span>
                    )}{" "}
                    and generate your LLM search queries first.
                  </p>
                </div>
              </div>
            )}
            <div className="mt-4">
              <CountdownBanner
                active={loading}
                durationSeconds={getAuditDurationSeconds("visibility")}
                label="Your visibility report is being prepared"
                sampleCount={getAuditSampleCount("visibility")}
              />
              {loading && probeProgress && probeProgress.total > 0 && (
                <div
                  className="mt-2 px-4 py-2.5 rounded-xl flex items-center gap-3"
                  style={{ background: "#f0f8fb", border: "1px solid rgba(31,116,143,0.18)" }}
                >
                  <Loader2 size={14} className="flex-shrink-0 animate-spin" style={{ color: "#1f748f" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium" style={{ color: "#165265" }}>
                        {probeProgress.done >= probeProgress.total
                          ? "Generating report…"
                          : `Probe ${probeProgress.done} of ${probeProgress.total} complete`}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: "#6B7280" }}>
                        {Math.round((probeProgress.done / probeProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(31,116,143,0.15)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          background: "linear-gradient(90deg, #1f748f, #2896b9)",
                          width: `${Math.round((probeProgress.done / probeProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            {loading && (
              <div className="mt-4 p-4 rounded-lg border" style={{ borderColor: vars.g200, background: "rgba(31,116,143,0.02)" }}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: vars.accent }} />
                  <span className="text-sm font-medium" style={{ color: vars.navy }}>Running visibility probes</span>
                </div>
                <p className="text-xs font-light" style={{ color: vars.g500 }}>
                  We're running real sector questions as blind probes and counting whether {probeName || activeClient.name} appears in the responses. This typically takes 1–3 minutes.
                </p>
              </div>
            )}
          </div>
        </div>
        {savedAudits.length > 0 && (
          <div className="rounded-xl border p-4 sm:p-6 mt-6" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} color={vars.accent} />
              <h2 className="text-[15px] font-semibold" style={{ color: vars.navy }}>Saved audits</h2>
            </div>
            <p className="text-[12px] font-light mb-4" style={{ color: vars.g500 }}>
              Reopen a past audit to view its full report. Saved on this device only.
            </p>
            <div className="flex flex-col gap-2">
              {savedAudits.map((a) => {
                const affected = isLikelyAffectedByCorroborationFix(a.result);
                const superseded = affected && isSupersededByNewerRun(a, savedAudits);
                const showWarning = affected && !superseded;
                return (
                  <div
                    key={a.id}
                    className="flex flex-col rounded-lg border transition-colors hover:bg-[rgba(31,116,143,0.04)]"
                    style={{ borderColor: showWarning ? "#F59E0B" : vars.g200 }}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <button onClick={() => openSavedAudit(a)} className="flex items-center gap-3 flex-1 text-left">
                        <div
                          className="flex items-center justify-center w-11 h-11 rounded-lg text-[13px] font-bold shrink-0"
                          style={{ background: showWarning ? "#FEF3C7" : "rgba(31,116,143,0.08)", color: showWarning ? "#92400E" : vars.accent }}
                        >
                          {a.result.visibilityScore}%
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: vars.navy }}>
                            {a.result.companyName}
                          </p>
                          <p className="text-[11px] font-light" style={{ color: vars.g500 }}>
                            Saved {new Date(a.savedAt).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </button>
                      <span className="hidden sm:inline-flex items-center gap-1 text-[12px] font-medium" style={{ color: vars.accent }}>
                        Open <ArrowRight size={13} />
                      </span>
                      <button
                        onClick={() => deleteSavedAudit(a.id)}
                        className="p-2 rounded-lg transition-colors hover:bg-[rgba(0,0,0,0.04)]"
                        style={{ color: vars.g400 }}
                        title="Remove this saved audit"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {showWarning && (
                      <div className="flex items-start gap-2 px-3 pb-3 pt-0">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: "#D97706" }} />
                        <p className="text-[11px] leading-snug" style={{ color: "#92400E" }}>
                          Score may understate real visibility — this brand name is shared with other organisations and the older detection method may have discounted genuine mentions. Open and re-run to get an updated result.
                        </p>
                      </div>
                    )}
                    {superseded && (
                      <div className="flex items-start gap-2 px-3 pb-3 pt-0">
                        <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: vars.g400 }} />
                        <p className="text-[11px] leading-snug" style={{ color: vars.g500 }}>
                          Superseded by a newer run — the score concern no longer applies to this client.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const rd = deriveReportData(result, competitors);
  const gapItems = rd.assess && rd.assess.topGaps.length > 0
    ? rd.assess.topGaps
    : rd.queryRows.filter((q) => !q.appeared).map((q) => q.question);
  const gradeStyle = (i: number) =>
    i >= 60 ? { background: "#ECFDF5", color: "#2F855A" } : i >= 40 ? { background: "#FEFCE8", color: "#A16207" } : { background: "#FEE2E2", color: "#B91C1C" };

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
            <button onClick={openReport} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white self-start flex-shrink-0" style={{ background: "#1f748f" }} title="Opens a branded report in a new window and the print or save-as-PDF dialog, so your Planner stays where it is">
              <Download size={14} /> Open report / Save as PDF
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

      {/* Stale-result warning for saved audits affected by the corroboration-fix */}
      {resultIsFromSaved && isLikelyAffectedByCorroborationFix(result) &&
        !savedAudits.some(
          (a) =>
            normalizeName(a.result.companyName) === normalizeName(result.companyName) &&
            a.result.checkedAt > result.checkedAt,
        ) && (
        <div
          className="rounded-xl border px-4 py-3 mb-6 flex items-start gap-3"
          style={{ background: "#FFFBEB", borderColor: "#F59E0B" }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#D97706" }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold mb-0.5" style={{ color: "#92400E" }}>
              This score may understate real visibility
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "#78350F" }}>
              &ldquo;{result.companyName}&rdquo; is a name shared with other organisations. An earlier version of the detection method could discount genuine mentions for ambiguous names like this, producing near-zero scores. The detection has since been improved — re-run the audit to get an up-to-date result.
            </p>
          </div>
          <button
            onClick={() => { setResult(null); setError(""); setResultIsFromSaved(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold shrink-0 self-start transition-all hover:brightness-95"
            style={{ background: "#F59E0B", color: "white" }}
          >
            <Repeat size={13} /> Re-run audit
          </button>
        </div>
      )}

      {/* Hero - AI Authority Index */}
      <div className="rounded-2xl border p-5 sm:p-7 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-5 flex-shrink-0 lg:border-r lg:pr-7" style={{ borderColor: vars.g200 }}>
            <ScoreRing score={rd.idx} unit="" size={120} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: vars.g400 }}>AI Authority Index</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold leading-none" style={{ color: vars.navy }}>{rd.idx}</span>
                <span className="text-base font-medium" style={{ color: vars.g400 }}>/ 100</span>
              </div>
              <span className="inline-block mt-2 text-sm font-bold px-2.5 py-1 rounded-lg" style={gradeStyle(rd.idx)}>Grade {rd.grade}</span>
              {previousScore !== null && (() => {
                const delta = result.visibilityScore - previousScore;
                const positive = delta > 0;
                const same = delta === 0;
                const Icon = positive ? TrendingUp : same ? ArrowRight : TrendingDown;
                const color = positive ? vars.green : same ? vars.g500 : vars.red;
                const bg = positive ? "#ECFDF5" : same ? vars.g100 : "#FEE2E2";
                return (
                  <span className="block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit" style={{ background: bg, color }}>
                    <Icon size={10} className="inline mr-1" />
                    {positive ? "+" : ""}{delta} vs previous ({previousScore}%)
                  </span>
                );
              })()}
            </div>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-3">
            {[
              { v: `${rd.presencePct}%`, l: "Presence" },
              { v: `${rd.sov}%`, l: "Share of voice" },
              { v: `${rd.appearedCount} / ${rd.totalQueries}`, l: "Queries appeared" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border p-3 sm:p-4 text-center" style={{ background: vars.g50, borderColor: vars.g200 }}>
                <p className="text-2xl sm:text-[28px] font-bold leading-none" style={{ color: vars.navy }}>{s.v}</p>
                <p className="text-[10px] uppercase tracking-[0.08em] mt-1.5" style={{ color: vars.g400 }}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] mt-4 pt-3 border-t" style={{ borderColor: vars.g100, color: vars.g400 }}>
          Non-branded category queries ({rd.appearedCount} of {rd.totalQueries}) vs named competitors{rd.trackedCount > 0 ? ` · ${rd.trackedCount} tracked competitors` : ""} · ChatGPT {result.byModel.chatgpt.rate}% · Claude {result.byModel.claude.rate}% · Cycle {cycleData.cycle}
        </p>
        <p className="text-[10px] mt-2 flex items-start gap-1" style={{ color: vars.g400 }}>
          <Info size={10} className="flex-shrink-0 mt-0.5" />
          Methodology: the Authority Index applies intent-tier weighting — buyer-intent queries (1.5x) carry more signal than sector queries (1.0x) or the direct identity probe (0.5x), so a brand cited on high-intent buyer questions scores meaningfully higher than one cited only on generic "who are the leaders in X" probes.
        </p>
      </div>

      {/* Executive summary */}
      <ReportSection
        icon={<Eye size={14} style={{ color: vars.accent }} />}
        title="Executive summary"
        subtitle="A plain-English read on overall AI visibility for this brand"
        defaultOpen={false}
      >
        {rd.assess?.summary
          ? <p className="text-[13px] leading-relaxed" style={{ color: vars.g600 }}>{rd.assess.summary}</p>
          : <p className="text-[13px] leading-relaxed" style={{ color: vars.g600 }}>
              {result.companyName} appeared in {rd.appearedCount} of {rd.totalQueries} non-branded category queries across ChatGPT and Claude ({rd.presencePct}% presence), with {rd.sov}% share of voice against the rivals the engines named.
            </p>}
        {result.icp && (
          <p className="text-[12px] mt-3" style={{ color: vars.g500 }}>
            <strong style={{ color: vars.g600 }}>Ideal customer profile:</strong> {result.icp}
          </p>
        )}
      </ReportSection>

      {/* Narrative signals */}
      {rd.assess?.narrativeSignals && (
        <NarrativeSignalsCard signals={rd.assess.narrativeSignals} companyName={result.companyName} />
      )}

      {/* Entity clarity */}
      {result.entityClarity && result.entityClarity.isAmbiguous && (
        <ReportSection
          icon={<AlertTriangle size={14} style={{ color: vars.amber }} />}
          title={`Entity clarity: who else is called "${result.entityClarity.brandName}"`}
          subtitle="Other organisations sharing this name that may be causing scoring confusion"
        >
          <p className="text-[13px] leading-relaxed" style={{ color: vars.g600 }}>{result.entityClarity.note}</p>
          <p className="text-[12px] mt-3" style={{ color: vars.g500 }}>
            <strong style={{ color: vars.g600 }}>Status:</strong>{" "}
            {result.entityClarity.brandRecognised
              ? (result.entityClarity.brandIsDominant
                  ? "The brand is the most prominent holder of this name, but it is shared."
                  : "The brand is recognised under this name but is not the most prominent holder — present but confused.")
              : "The brand did not surface for the bare name unprompted — the engines associate the name with other organisations (not absent, but confused)."}
          </p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${vars.g200}` }}>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pr-3" style={{ color: vars.g500 }}>Other organisations known as &ldquo;{result.entityClarity.brandName}&rdquo;</th>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pl-3" style={{ color: vars.g500 }}>What they are</th>
                </tr>
              </thead>
              <tbody>
                {result.entityClarity.competingEntities.map((e, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${vars.g100}` }}>
                    <td className="text-[12px] py-2 pr-3 font-semibold align-top" style={{ color: vars.g600 }}>{e.name}</td>
                    <td className="text-[12px] py-2 pl-3" style={{ color: vars.g500 }}>{e.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confirmation step: let the user lock in which company is theirs so the
              next audit measures the right one. */}
          <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${vars.g100}` }}>
            {confirmedEntity && !editingIdentity ? (
              <div className="flex items-start gap-2 flex-wrap">
                <CheckCircle2 size={16} style={{ color: vars.green, marginTop: 1, flexShrink: 0 }} />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[13px] font-semibold" style={{ color: vars.g600 }}>
                    Confirmed: &ldquo;{result.entityClarity.brandName}&rdquo; is {confirmedEntity.name}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: vars.g500 }}>
                    Your next audit will measure this company specifically. Re-run the check to apply it.
                  </p>
                </div>
                <button
                  onClick={() => setEditingIdentity(true)}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border self-start"
                  style={{ color: vars.accent, borderColor: vars.g200, background: "white" }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <p className="text-[13px] font-semibold mb-1" style={{ color: vars.g600 }}>
                  Which company is &ldquo;{result.entityClarity.brandName}&rdquo;?
                </p>
                <p className="text-[12px] mb-3" style={{ color: vars.g500 }}>
                  Confirm or correct the identity so the next audit measures the right organisation.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() =>
                      saveConfirmedEntity({
                        name: getLegalName() || result.companyName,
                        description: descriptor ? descriptor.split(/[.\n]/)[0].trim().slice(0, 300) : "",
                      })
                    }
                    className="text-left text-[12px] px-3 py-2 rounded-lg border transition-all hover:brightness-95"
                    style={{ borderColor: vars.g200, color: vars.g600, background: vars.g50 }}
                  >
                    <strong>Yes, that&rsquo;s us</strong> — {getLegalName() || result.companyName} is our company, not the others listed.
                  </button>
                  {result.entityClarity.competingEntities.map((e, i) => (
                    <button
                      key={i}
                      onClick={() => saveConfirmedEntity({ name: e.name, description: e.description })}
                      className="text-left text-[12px] px-3 py-2 rounded-lg border transition-all hover:brightness-95"
                      style={{ borderColor: vars.g200, color: vars.g600, background: "white" }}
                    >
                      <strong>No, we are {e.name}</strong>{e.description ? ` — ${e.description}` : ""}
                    </button>
                  ))}
                </div>
                {confirmedEntity && (
                  <div className="flex gap-3 mt-3">
                    <button
                      onClick={() => setEditingIdentity(false)}
                      className="text-[12px] font-semibold"
                      style={{ color: vars.g500 }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveConfirmedEntity(null)}
                      className="text-[12px] font-semibold"
                      style={{ color: vars.red }}
                    >
                      Remove confirmation
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </ReportSection>
      )}

      {/* Scorecard */}
      {rd.assess && rd.assess.dimensions.length > 0 && (
        <ReportSection
          icon={<CheckCircle2 size={14} style={{ color: vars.accent }} />}
          title="AI Authority scorecard"
          subtitle="How your brand performs across five scored dimensions — presence, source quality, messaging, accuracy, and people"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${vars.g200}` }}>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pr-3" style={{ color: vars.g500 }}>Dimension</th>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 px-3 whitespace-nowrap" style={{ color: vars.g500 }}>Score / 5</th>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pl-3" style={{ color: vars.g500 }}>Read</th>
                </tr>
              </thead>
              <tbody>
                {orderScorecard(rd.assess.dimensions).map((d) => {
                  const noEvidence = d.confidence === "low" && d.score === 0 && d.justification.trim() === "No evidence in this run.";
                  const outOf5 = Math.round(d.score / 20);
                  const color = noEvidence ? vars.g400 : d.score >= 60 ? vars.green : d.score >= 30 ? vars.amber : vars.red;
                  return (
                    <tr key={d.name} style={{ borderBottom: `1px solid ${vars.g100}` }}>
                      <td className="py-2.5 pr-3 align-top text-[12px] font-semibold" style={{ color: vars.navy }}>{d.displayName}</td>
                      <td className="py-2.5 px-3 align-top whitespace-nowrap">
                        <span className="text-[12px] font-bold px-2 py-0.5 rounded" style={{ color, background: noEvidence ? vars.g100 : vars.g50 }}>
                          {noEvidence ? "N/M" : `${outOf5} / 5`}
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 align-top text-[12px]" style={{ color: noEvidence ? vars.g400 : vars.g500 }}>
                        {noEvidence ? "Not measurable — brand appeared too rarely in this run for a reliable score." : d.justification}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] mt-3" style={{ color: vars.g400 }}>
            Index weighting: non-branded presence and share of voice 50%, source and message 20%, accuracy and entity 20%, people 10%.
          </p>
        </ReportSection>
      )}

      {/* Prioritised actions */}
      {rd.assess && rd.assess.priorityActions.length > 0 && (
        <ReportSection
          icon={<ArrowRight size={14} style={{ color: vars.accent }} />}
          title="Prioritised actions"
          subtitle="The highest-impact steps to improve AI visibility — ranked by priority"
        >
          <div className="flex flex-col gap-2">
            {rd.assess.priorityActions.map((a, i) => {
              const pc = a.priority === "high" ? { bg: "#FEE2E2", c: "#B91C1C" } : a.priority === "low" ? { bg: vars.g100, c: vars.g500 } : { bg: "#FEFCE8", c: "#A16207" };
              const displayedProbes = (a.failedProbes || []).slice(0, 3);
              const extraProbes = (a.failedProbes || []).length - 3;
              return (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg border" style={{ borderColor: vars.g200 }}>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 mt-0.5" style={{ background: pc.bg, color: pc.c }}>
                    {(a.priority || "medium").toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium" style={{ color: vars.navy }}>{a.action}</p>
                    {a.rationale && <p className="text-[11px] mt-0.5" style={{ color: vars.g500 }}>{a.rationale}</p>}
                    {displayedProbes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        <span className="text-[10px] font-semibold shrink-0" style={{ color: vars.g400 }}>Absent on:</span>
                        {displayedProbes.map((q, qi) => (
                          <span key={qi} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q}>{q}</span>
                        ))}
                        {extraProbes > 0 && (
                          <span className="text-[10px]" style={{ color: vars.g400 }}>+{extraProbes} more</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ReportSection>
      )}

      {/* Top visibility gaps */}
      {gapItems.length > 0 && (
        <ReportSection
          icon={<TrendingDown size={14} style={{ color: vars.accent }} />}
          title="Top visibility gaps"
          subtitle="Queries where AI isn't naming this brand — the highest-opportunity areas to address"
        >
          <ul className="list-disc pl-5 space-y-1.5">
            {gapItems.map((g, i) => (
              <li key={i} className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>{g}</li>
            ))}
          </ul>
        </ReportSection>
      )}

      {/* Who owns the category instead */}
      <ReportSection
        icon={<Users size={14} style={{ color: vars.accent }} />}
        title="Who owns the category instead"
        subtitle="The brands AI recommended when this company wasn't cited — ordered by frequency"
      >
        <p className="text-[12px] mb-4" style={{ color: vars.g500 }}>
          The brands the engines recommended when {result.companyName} was absent — ordered by how often they appeared.
        </p>
        {rd.owns.length > 0 ? (() => {
          const insightMap = new Map<string, string>(
            (rd.assess?.competitorInsights || []).map((ci) => [normalizeName(ci.name), ci.description]),
          );
          const tracked = rd.owns.filter((c) => c.tracked);
          const untracked = rd.owns.filter((c) => !c.tracked);
          const CompTable = ({ rows, showInsight }: { rows: typeof rd.owns; showInsight: boolean }) => (
            <table className="w-full text-left mb-1" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${vars.g200}` }}>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pr-3" style={{ color: vars.g500 }}>Competitor</th>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 px-3 whitespace-nowrap" style={{ color: vars.g500 }}>Surfaced in</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const insight = showInsight ? insightMap.get(normalizeName(c.name)) : undefined;
                  return (
                    <tr key={c.name} style={{ borderBottom: `1px solid ${vars.g100}` }}>
                      <td className="py-2.5 pr-3 align-top" style={{ maxWidth: "340px" }}>
                        <span className="text-[12px] font-semibold" style={{ color: vars.navy }}>{c.name}</span>
                        {insight && (
                          <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: vars.g500 }}>{insight}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 align-top text-[12px]" style={{ color: vars.g500, whiteSpace: "nowrap" }}>
                        {c.mentions} of {result.totalProbes} answers
                        {c.examples.length > 0 && <span className="block text-[11px] mt-0.5 whitespace-normal" style={{ color: vars.g400 }}>{c.examples.join("; ")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
          return (
            <div className="overflow-x-auto space-y-5">
              {untracked.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "#B91C1C" }}>
                    Rivals not on your tracked list — new intelligence
                  </p>
                  <CompTable rows={untracked} showInsight={true} />
                  <p className="text-[11px] mt-2" style={{ color: vars.g400 }}>
                    These rivals were surfaced by the AI engines but are not in your tracked competitor set (Project Set-Up 4.8). Consider adding them.
                  </p>
                </div>
              )}
              {tracked.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: vars.green }}>
                    Known competitors — already tracked
                  </p>
                  <CompTable rows={tracked} showInsight={false} />
                </div>
              )}
            </div>
          );
        })() : (
          <p className="text-[13px] p-3 rounded-lg" style={{ background: vars.g50, color: vars.g500 }}>
            No single rival was recommended often enough to stand out across these searches. That is an opening: the AI has no clear go-to name in your sector yet, so there is space to claim it.
          </p>
        )}
      </ReportSection>

      {/* What the AI says about this category */}
      {rd.categoryFraming.length > 0 && (
        <ReportSection
          icon={<Info size={14} style={{ color: vars.accent }} />}
          title="What the AI says about this category"
          subtitle="How AI engines frame each topic when this brand isn't named — the vocabulary and concepts you need to own"
          defaultOpen={true}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${vars.g200}` }}>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pr-3" style={{ color: vars.g500, width: "38%" }}>Query</th>
                  <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pl-3" style={{ color: vars.g500 }}>How engines frame this topic</th>
                </tr>
              </thead>
              <tbody>
                {rd.categoryFraming.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${vars.g100}` }}>
                    <td className="py-2.5 pr-3 align-top text-[12px] font-medium" style={{ color: vars.navy }}>{row.query}</td>
                    <td className="py-2.5 pl-3 align-top text-[12px]" style={{ color: vars.g500 }}>{row.themes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px]" style={{ color: vars.g400 }}>
            Derived from blind-probe evidence only — reflects what AI engines say when the brand is not named in the prompt.
          </p>
        </ReportSection>
      )}

      {/* Blind-probe evidence log */}
      <ReportSection
        icon={<Search size={14} style={{ color: vars.accent }} />}
        title="Blind-probe evidence log"
        subtitle="Every query sent to the AI engines, and whether this brand appeared in the answer"
        defaultOpen={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${vars.g200}` }}>
                <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pr-3" style={{ color: vars.g500 }}>Query</th>
                <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 px-3 whitespace-nowrap" style={{ color: vars.g500 }}>Appeared</th>
                <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 px-3" style={{ color: vars.g500 }}>Competitors surfaced</th>
                <th className="text-[11px] font-semibold uppercase tracking-[0.06em] py-2 pl-3" style={{ color: vars.g500 }}>Sources / notes</th>
              </tr>
            </thead>
            <tbody>
              {rd.queryRows.map((q, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${vars.g100}` }}>
                  <td className="py-2.5 pr-3 align-top text-[12px]" style={{ color: vars.navy }}>{q.question}</td>
                  <td className="py-2.5 px-3 align-top text-[12px] font-semibold whitespace-nowrap" style={{ color: q.appeared ? vars.green : "#B91C1C" }}>
                    {q.appeared ? "Yes" : "No"}
                  </td>
                  <td className="py-2.5 px-3 align-top text-[12px]" style={{ color: vars.g500 }}>
                    {q.competitors.length > 0 ? q.competitors.join(", ") : <span style={{ color: vars.g400 }}>none surfaced</span>}
                  </td>
                  <td className="py-2.5 pl-3 align-top text-[11px]" style={{ color: vars.g400 }}>{q.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportSection>

      <ReportSection
        icon={<Zap size={14} style={{ color: vars.accent }} />}
        title="Detailed probe results"
        subtitle="The full AI responses to each question — expand individual rows to read the answer verbatim"
        defaultOpen={false}
      >
        <div className="space-y-2">
          {result.probes.map((probe, i) => (
            <ProbeRow key={i} probe={probe} companyName={result.companyName} />
          ))}
        </div>
      </ReportSection>

      <ReportSection
        icon={<Eye size={14} style={{ color: vars.accent }} />}
        title="Method &amp; caveats"
        subtitle="How the audit works, what the numbers mean, and what to watch out for"
        defaultOpen={false}
      >
        <ul className="list-disc pl-5 space-y-1.5">
          <li className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
            Blind probes were run across ChatGPT and Claude using {rd.totalQueries} non-branded category queries a prospect, journalist or researcher might ask. {result.companyName} was never named in the prompts.
          </li>
          <li className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
            Presence is the share of probes in which {result.companyName} appeared. Share of voice weighs those mentions against the rival brands the engines named.
          </li>
          <li className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
            AI responses are not deterministic, so individual results vary. The trend across repeated cycles is the meaningful signal, not a single run.
          </li>
          <li className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
            Some ICP-narrowed probes are phrased to surface specialist or independent providers rather than large household names — a global agency or enterprise vendor is not expected to appear in those specific questions.{result.businessType && result.businessType !== "" ? ` Probe vocabulary was set to: ${result.businessType === "product" ? "Product / software" : result.businessType === "consumer" ? "Consumer brand" : "Professional services / agency"}.` : ""}
          </li>
          {rd.assess && rd.assess.dimensions.some((d) => d.confidence === "low" && d.score === 0 && d.justification.trim() === "No evidence in this run.") && (
            <li className="text-[12px] leading-relaxed" style={{ color: vars.g600 }}>
              Scorecard dimensions marked N/M (not measurable) could not be scored reliably because the brand appeared in too few probes. They are not failures — they indicate where more visibility work is needed first.
            </li>
          )}
        </ul>
      </ReportSection>

      <ReportSection
        icon={<Info size={14} style={{ color: vars.accent }} />}
        title="How to interpret these results"
        subtitle="A practical guide to making sense of your score and acting on it"
        defaultOpen={false}
      >
        <div className="space-y-3">
          {[
            { t: "This is the real test.", b: "We're asking AI models the same questions a prospect, journalist or researcher would ask. If your brand doesn't appear, that's the gap GEO work needs to close." },
            { t: "Scores are directional, not precise.", b: "AI model responses aren't deterministic - the same question can produce slightly different answers each time. Individual results will vary, but the trend across multiple checks over time is meaningful." },
            { t: "Competitors reveal what's working.", b: "The companies AI does mention are winning the visibility race in your sector - analyse what they're doing differently with content structure, schema markup and authority signals." },
            { t: "Use this as a baseline.", b: "Run it now, do your GEO work (diagnostic, content optimisation, schema, authority planning), then run it again. A score moving from 20% to 50% is a measurable result you can report to the client." },
            { t: "Set the right business type.", b: "Use the Business type selector to match the probe vocabulary to the client — agencies and providers for services, platforms and vendors for products, brands for consumer. This ensures the competitor set AI surfaces is actually comparable to the client." },
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
      </ReportSection>

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
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={() => { saveAuditToHistory(); openReport(); }} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 transition-all hover:brightness-95" style={{ background: "white", color: vars.navy }}>
            {justSaved ? <CheckCircle2 size={14} /> : <Download size={14} />} {justSaved ? "Saved to history" : "Save this report"}
          </button>
          <button onClick={() => { setResult(null); setError(""); }} className="px-4 py-2.5 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 transition-all hover:brightness-110" style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>
            <Repeat size={14} /> Run New Audit
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px]" style={{ color: vars.g400 }}>
          Checked {new Date(result.checkedAt).toLocaleString()} · Results reflect AI model knowledge at time of query and may vary between sessions
        </span>
        <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>
          · Next report available from{" "}
          {new Date(new Date(result.checkedAt).getTime() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>
    </div>
  );
}

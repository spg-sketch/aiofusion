import { useState, useEffect } from "react";
import InfoTip from "./InfoTip";
import CountdownBanner from "./components/CountdownBanner";
import { recordAuditDuration, getAuditDurationSeconds, getAuditSampleCount, getTypicalDurationHint } from "./lib/auditTiming";
import {
  Globe,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  FileText,
  Code2,
  Link,
  Image,
  Bot,
  Zap,
  Loader2,
  ExternalLink,
  Tag,
  Save,
  Download,
} from "lucide-react";

type Client = { id: string; name: string };

type SavedTechGeo = { id: string; savedAt: string; score: number; result: AuditResult };

const techGeoStorageKey = (clientId: string) => `aio.savedTechGeo.${clientId}`;

function loadSavedTechGeo(clientId: string): SavedTechGeo[] {
  try {
    const raw = localStorage.getItem(techGeoStorageKey(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedTechGeo(clientId: string, list: SavedTechGeo[]): boolean {
  try {
    localStorage.setItem(techGeoStorageKey(clientId), JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const vars = {
  navy: "#0a1628",
  accent: "#C8497A",
  teal: "#4f8fff",
  green: "#3D9B6B",
  amber: "#D4922A",
  red: "#C94A3E",
  lightBg: "#eef3ff",
  g50: "#f8fafc",
  g100: "#f1f5f9",
  g200: "#e2e8f0",
  g300: "#cbd5e1",
  g400: "#64748B",
  g500: "#475569",
  g600: "#334155",
};

interface SeoFinding {
  label: string;
  value: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

interface LinkInfo {
  href: string;
  text: string;
  type: "internal" | "external";
}

interface AuditResult {
  url: string;
  fetchedAt: string;
  scores: {
    overall: number;
    meta: number;
    headings: number;
    schema: number;
    links: number;
    images: number;
    aiReadiness: number;
    performance: number;
  };
  meta: SeoFinding[];
  headings: SeoFinding[];
  schema: SeoFinding[];
  links: {
    findings: SeoFinding[];
    internal: LinkInfo[];
    external: LinkInfo[];
    inboundIndicators: SeoFinding[];
  };
  images: SeoFinding[];
  aiReadiness: SeoFinding[];
  performance: SeoFinding[];
  recommendations: { priority: "Critical" | "High" | "Medium" | "Low"; text: string; category: string }[];
}

function StatusIcon({ status }: { status: string }) {
  if (status === "pass") return <CheckCircle2 size={16} style={{ color: vars.green }} />;
  if (status === "warn") return <AlertTriangle size={16} style={{ color: vars.amber }} />;
  return <XCircle size={16} style={{ color: vars.red }} />;
}

function ScoreRing({ score, size = 80, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? vars.green : score >= 40 ? vars.amber : vars.red;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={vars.g200} strokeWidth="4" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="font-bold" style={{ fontSize: size * 0.3, color }}>{score}</span>
      </div>
      {label && <span className="text-[11px] font-medium text-center" style={{ color: vars.g500 }}>{label}</span>}
    </div>
  );
}

function FindingsTable({ findings }: { findings: SeoFinding[] }) {
  return (
    <div className="space-y-2">
      {findings.map((f, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: vars.g50 }}>
          <div className="mt-0.5"><StatusIcon status={f.status} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[13px] font-semibold" style={{ color: vars.navy }}>{f.label}</span>
              <span className="text-[12px] font-medium" style={{ color: f.status === "pass" ? vars.green : f.status === "warn" ? vars.amber : vars.red }}>{f.value}</span>
            </div>
            {f.detail && <p className="text-[11px] mt-0.5" style={{ color: vars.g500 }}>{f.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  score,
  findings,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: any;
  score: number;
  findings?: SeoFinding[];
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const color = score >= 70 ? vars.green : score >= 40 ? vars.amber : vars.red;

  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: vars.g200, background: "white" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}12` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="flex-1 text-[14px] font-semibold" style={{ color: vars.navy }}>{title}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: vars.g200 }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
            </div>
            <span className="text-[12px] font-bold" style={{ color }}>{score}</span>
          </div>
          {open ? <ChevronUp size={16} style={{ color: vars.g400 }} /> : <ChevronDown size={16} style={{ color: vars.g400 }} />}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t" style={{ borderColor: vars.g100 }}>
          <div className="pt-4">
            {findings && <FindingsTable findings={findings} />}
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    Critical: { bg: "#FEE2E2", text: vars.red },
    High: { bg: "#FEF3C7", text: "#92400E" },
    Medium: { bg: "#E0F2F7", text: vars.accent },
    Low: { bg: vars.g100, text: vars.g500 },
  };
  const c = colors[priority] || colors.Medium;
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: c.bg, color: c.text }}>
      {priority}
    </span>
  );
}

export default function SeoAuditPage({
  activeClient,
  pendingTechGeoId,
  onConsumePendingTechGeo,
}: {
  activeClient: Client;
  pendingTechGeoId?: string | null;
  onConsumePendingTechGeo?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [savedTechGeo, setSavedTechGeo] = useState<SavedTechGeo[]>(() => loadSavedTechGeo(activeClient.id));
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setSavedTechGeo(loadSavedTechGeo(activeClient.id));
    setResult(null);
    setUrl("");
    setError("");
    setLoading(false);
    setJustSaved(false);
  }, [activeClient.id]);

  useEffect(() => {
    if (!pendingTechGeoId) return;
    const match = savedTechGeo.find((s) => s.id === pendingTechGeoId);
    if (match) {
      setResult(match.result);
      setUrl(match.result.url);
      setJustSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    onConsumePendingTechGeo?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTechGeoId, savedTechGeo]);

  function saveAudit(auditResult: AuditResult | null = result) {
    if (!auditResult) return;
    if (savedTechGeo.some((s) => s.result.url === auditResult.url && s.result.fetchedAt === auditResult.fetchedAt)) {
      setJustSaved(true);
      return;
    }
    const entry: SavedTechGeo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      score: auditResult.scores.overall,
      result: auditResult,
    };
    const next = [entry, ...savedTechGeo];
    if (!persistSavedTechGeo(activeClient.id, next)) {
      alert("Could not save this audit - your browser storage may be full. Try removing a few older saved audits.");
      return;
    }
    setSavedTechGeo(next);
    setJustSaved(true);
    window.dispatchEvent(new Event("aio:saved-audits-changed"));
  }

  async function runAudit() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setJustSaved(false);
    const _auditStart = Date.now();

    try {
      const apiBase = import.meta.env.DEV ? `https://${window.location.host}` : "";
      const resp = await fetch(`${apiBase}/api/seo-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Audit failed" }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setResult(data);
      saveAudit(data);
      recordAuditDuration("website", Date.now() - _auditStart, getAuditDurationSeconds("website") * 1000);
    } catch (err: any) {
      setError(err.message || "Failed to run audit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Globe size={20} color="#ffffff" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold flex items-center" style={{ color: "#ffffff", fontFamily: "Alice, serif" }}>
                Website GEO Assessment
                <InfoTip text="Crawls a URL and checks meta tags, headings, schema markup, links, images, AI crawler access, and Google PageSpeed scores. Returns prioritised fixes to improve AI discoverability and citation-worthiness." width={260} />
              </h1>
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>
                Technical website analysis with AI readiness scoring
              </p>
            </div>
          </div>
        </div>

        <div className="border rounded-xl p-5 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: vars.g400 }} />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && runAudit()}
                placeholder="Enter a URL to audit (e.g. simpatico.pr)"
                className="w-full pl-10 pr-4 py-3 rounded-lg border text-[14px] outline-none transition-colors"
                style={{ borderColor: vars.g200, color: vars.navy }}
              />
            </div>
            <button
              onClick={runAudit}
              disabled={loading || !url.trim()}
              className="px-6 py-3 rounded-lg text-white text-[14px] font-semibold flex items-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: vars.accent }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Search size={16} />
                  <span>Run Audit</span>
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="mt-3 p-3 rounded-lg flex items-center gap-2 text-[13px]" style={{ background: "#FEE2E2", color: vars.red }}>
              <XCircle size={16} />
              {error}
            </div>
          )}
          {!loading && (() => { const hint = getTypicalDurationHint("website"); return hint ? (
            <p className="mt-2 flex items-center gap-1 text-xs" style={{ color: vars.g400 }}>
              <Zap size={11} />
              {hint}
            </p>
          ) : null; })()}
        </div>

        <CountdownBanner
          active={loading}
          durationSeconds={getAuditDurationSeconds("website")}
          label="Website audit running"
          sampleCount={getAuditSampleCount("website")}
        />

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: vars.lightBg }}>
              <Loader2 size={28} className="animate-spin" style={{ color: vars.accent }} />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: vars.navy }}>Analysing {url}...</p>
            <p className="text-[12px] mt-1" style={{ color: vars.g400 }}>
              Checking meta tags, schema, page speed, AI readiness...
            </p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => saveAudit()} disabled={justSaved} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-medium transition-all hover:brightness-95 disabled:cursor-default" style={{ background: "white", color: vars.navy, border: `1px solid ${vars.g200}` }}>
                {justSaved ? <CheckCircle2 size={14} color={vars.green} /> : <Save size={14} />} {justSaved ? "Saved" : "Save audit"}
              </button>
              <button onClick={() => { const s = document.createElement('style'); s.id = 'aio-print-fix'; s.textContent = '@media print { body, #root, [data-radix-scroll-area-viewport], .overflow-y-auto, .overflow-auto { overflow: visible !important; max-height: none !important; height: auto !important; } }'; document.head.appendChild(s); window.print(); setTimeout(() => { const el = document.getElementById('aio-print-fix'); if (el) el.remove(); }, 2000); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12.5px] font-medium text-white" style={{ background: "#1f748f" }}>
                <Download size={14} /> Print / PDF
              </button>
            </div>
            <div className="border rounded-xl p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <div className="relative">
                  <ScoreRing score={result.scores.overall} size={100} />
                </div>
                <div className="flex-1">
                  <h2 className="text-[18px] font-bold mb-1" style={{ color: vars.navy, fontFamily: "Alice, serif" }}>
                    Overall Score: {result.scores.overall}/100
                  </h2>
                  <p className="text-[13px] mb-3" style={{ color: vars.g500 }}>
                    <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 flex items-center gap-1">
                      {result.url} <ExternalLink size={12} />
                    </a>
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { label: "Meta", score: result.scores.meta },
                      { label: "Headings", score: result.scores.headings },
                      { label: "Schema", score: result.scores.schema },
                      { label: "Links", score: result.scores.links },
                      { label: "Images", score: result.scores.images },
                      { label: "AI Ready", score: result.scores.aiReadiness },
                      { label: "Speed", score: result.scores.performance },
                    ].map((s) => {
                      const c = s.score >= 70 ? vars.green : s.score >= 40 ? vars.amber : vars.red;
                      return (
                        <div key={s.label} className="flex items-center gap-1.5">
                          <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: vars.g200 }}>
                            <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: c }} />
                          </div>
                          <span className="text-[11px] font-medium" style={{ color: vars.g500 }}>{s.label}</span>
                          <span className="text-[11px] font-bold" style={{ color: c }}>{s.score}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {result.recommendations.length > 0 && (
              <div className="border rounded-xl p-5" style={{ background: "white", borderColor: vars.g200 }}>
                <h3 className="text-[15px] font-bold mb-4 flex items-center gap-2" style={{ color: vars.navy, fontFamily: "Alice, serif" }}>
                  <ArrowRight size={16} style={{ color: vars.accent }} />
                  Priority Recommendations
                </h3>
                <div className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: vars.g50 }}>
                      <PriorityBadge priority={r.priority} />
                      <div className="flex-1">
                        <p className="text-[13px]" style={{ color: vars.g600 }}>{r.text}</p>
                        <span className="text-[10px] font-medium" style={{ color: vars.g400 }}>{r.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Section title="Meta Tags & Discoverability" icon={Tag} score={result.scores.meta} findings={result.meta} defaultOpen={true} />
            <Section title="Heading Structure" icon={FileText} score={result.scores.headings} findings={result.headings} />
            <Section title="Schema & Structured Data" icon={Code2} score={result.scores.schema} findings={result.schema} />
            <Section title="Links & Authority Signals" icon={Link} score={result.scores.links} defaultOpen={false}>
              <FindingsTable findings={result.links.findings} />
              {result.links.inboundIndicators.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-[12px] font-bold mb-2 uppercase tracking-wide" style={{ color: vars.g400 }}>Authority Indicators</h4>
                  <FindingsTable findings={result.links.inboundIndicators} />
                </div>
              )}
              {(result.links.external.length > 0 || result.links.internal.length > 0) && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {result.links.internal.length > 0 && (
                    <div>
                      <h4 className="text-[12px] font-bold mb-2 uppercase tracking-wide" style={{ color: vars.g400 }}>Internal Links ({result.links.internal.length})</h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {result.links.internal.slice(0, 15).map((l, i) => (
                          <div key={i} className="text-[11px] truncate" style={{ color: vars.g500 }}>
                            {l.href} {l.text && <span style={{ color: vars.g400 }}>- {l.text}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.links.external.length > 0 && (
                    <div>
                      <h4 className="text-[12px] font-bold mb-2 uppercase tracking-wide" style={{ color: vars.g400 }}>External Links ({result.links.external.length})</h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {result.links.external.slice(0, 15).map((l, i) => (
                          <div key={i} className="text-[11px] truncate" style={{ color: vars.g500 }}>
                            {l.href} {l.text && <span style={{ color: vars.g400 }}>- {l.text}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Section>
            <Section title="Image Optimisation" icon={Image} score={result.scores.images} findings={result.images} />
            <Section title="AI Readiness" icon={Bot} score={result.scores.aiReadiness} findings={result.aiReadiness} defaultOpen={true} />
            <Section title="Performance" icon={Zap} score={result.scores.performance} findings={result.performance} />

            <div className="text-center py-4">
              <p className="text-[11px]" style={{ color: vars.g400 }}>
                Audited {new Date(result.fetchedAt).toLocaleString()} · Scores are indicative - always verify with manual review
              </p>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="rounded-xl border p-10 flex flex-col items-center justify-center" style={{ background: "white", borderColor: vars.g200 }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: vars.g100 }}>
              <Search size={28} style={{ color: vars.accent }} />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: vars.navy }}>Enter a URL to begin</p>
            <p className="text-[12px] mt-1 text-center max-w-md" style={{ color: vars.g400 }}>
              Get a full technical website analysis including meta tags, heading structure, schema markup,
              AI crawler readiness, Google PageSpeed scores, and prioritised GEO recommendations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

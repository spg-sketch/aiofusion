import { useState } from "react";
import {
  Eye,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Bot,
  Zap,
  Users,
  ArrowRight,
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
  g300: "#D4D4D4",
  g400: "#9CA3AF",
  g500: "#6B7280",
  g600: "#374151",
};

interface Client {
  id: string;
  name: string;
  sector: string;
}

interface ProbeItem {
  question: string;
  model: string;
  mentioned: boolean;
  mentionContext: string | null;
  competitors: string[];
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
          {probe.competitors.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: vars.g500 }}>Competitors mentioned:</p>
              <div className="flex flex-wrap gap-1.5">
                {probe.competitors.map((c) => (
                  <span key={c} className="text-[11px] px-2 py-0.5 rounded" style={{ background: vars.g100, color: vars.g600 }}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function highlightName(text: string, name: string): React.ReactNode {
  const parts = text.split(new RegExp(`(${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === name.toLowerCase() ? (
      <strong key={i} style={{ color: vars.accent, background: "#E0F2F7", padding: "0 2px", borderRadius: 2 }}>{part}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function LlmCheckPage({ activeClient }: { activeClient: Client }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LlmCheckResult | null>(null);
  const [customKeywords, setCustomKeywords] = useState("");

  async function runCheck() {
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
        body: JSON.stringify({
          companyName: activeClient.name,
          sector: activeClient.sector,
          keywords,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({ error: "Check failed" }));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to run visibility check");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: vars.g50 }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: vars.lightBg }}>
              <Eye size={20} style={{ color: vars.accent }} />
            </div>
            <div>
              <h1 className="text-[22px] font-bold" style={{ color: vars.navy, fontFamily: "Alice, serif" }}>
                LLM Visibility Check
              </h1>
              <p className="text-[13px]" style={{ color: vars.g500 }}>
                Check whether AI models mention {activeClient.name} when asked about your sector
              </p>
            </div>
          </div>
        </div>

        <div className="border rounded-xl p-5 mb-6" style={{ background: "white", borderColor: vars.g200 }}>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>Company</label>
              <div className="px-3 py-2.5 rounded-lg border text-[14px]" style={{ borderColor: vars.g200, color: vars.navy, background: vars.g50 }}>
                {activeClient.name}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>Sector</label>
              <div className="px-3 py-2.5 rounded-lg border text-[14px]" style={{ borderColor: vars.g200, color: vars.navy, background: vars.g50 }}>
                {activeClient.sector}
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-[12px] font-semibold block mb-1.5" style={{ color: vars.g500 }}>
              Additional keywords <span className="font-normal">(optional, comma-separated)</span>
            </label>
            <input
              type="text"
              value={customKeywords}
              onChange={(e) => setCustomKeywords(e.target.value)}
              placeholder="e.g. benchmarking, agency intelligence, independent agencies"
              className="w-full px-3 py-2.5 rounded-lg border text-[14px] outline-none"
              style={{ borderColor: vars.g200, color: vars.navy }}
            />
          </div>
          <button
            onClick={runCheck}
            disabled={loading}
            className="px-6 py-3 rounded-lg text-white text-[14px] font-semibold flex items-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: vars.accent }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Querying AI models...</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>Check Visibility</span>
              </>
            )}
          </button>
          {error && (
            <div className="mt-3 p-3 rounded-lg flex items-center gap-2 text-[13px]" style={{ background: "#FEE2E2", color: vars.red }}>
              <XCircle size={16} /> {error}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: vars.lightBg }}>
              <Loader2 size={28} className="animate-spin" style={{ color: vars.accent }} />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: vars.navy }}>Querying ChatGPT and Claude...</p>
            <p className="text-[12px] mt-1 text-center max-w-md" style={{ color: vars.g400 }}>
              Asking both models relevant questions about your sector to check if {activeClient.name} is being mentioned. This may take 30-60 seconds.
            </p>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-5">
            <div className="border rounded-xl p-6" style={{ background: "white", borderColor: vars.g200 }}>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <ScoreRing score={result.visibilityScore} size={110} />
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-[20px] font-bold mb-1" style={{ color: vars.navy, fontFamily: "Alice, serif" }}>
                    AI Visibility Score
                  </h2>
                  <p className="text-[14px] mb-3" style={{ color: vars.g500 }}>
                    {result.companyName} was mentioned in <strong style={{ color: vars.navy }}>{result.totalMentions}</strong> of <strong style={{ color: vars.navy }}>{result.totalProbes}</strong> queries across both models
                  </p>
                  <p className="text-[13px] leading-relaxed" style={{ color: vars.g400 }}>
                    {result.visibilityScore >= 60
                      ? "Strong AI visibility — this brand is being referenced by AI models in your sector."
                      : result.visibilityScore >= 30
                      ? "Moderate AI visibility — the brand appears in some contexts but is not consistently cited."
                      : "Low AI visibility — AI models are not reliably mentioning this brand when asked about the sector."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
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

            {result.topCompetitors.length > 0 && (
              <div className="border rounded-xl p-5" style={{ background: "white", borderColor: vars.g200 }}>
                <h3 className="text-[15px] font-bold mb-4 flex items-center gap-2" style={{ color: vars.navy, fontFamily: "Alice, serif" }}>
                  <Users size={16} style={{ color: vars.accent }} />
                  Competitors Mentioned by AI
                </h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {result.topCompetitors.map((c) => (
                    <div key={c.name} className="flex items-center justify-between p-3 rounded-lg" style={{ background: vars.g50 }}>
                      <span className="text-[13px] font-medium" style={{ color: vars.navy }}>{c.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: vars.lightBg, color: vars.accent }}>
                        {c.mentions}x mentioned
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border rounded-xl p-5" style={{ background: "white", borderColor: vars.g200 }}>
              <h3 className="text-[15px] font-bold mb-4 flex items-center gap-2" style={{ color: vars.navy, fontFamily: "Alice, serif" }}>
                <Zap size={16} style={{ color: vars.accent }} />
                Detailed Probe Results
              </h3>
              <div className="space-y-2">
                {result.probes.map((probe, i) => (
                  <ProbeRow key={i} probe={probe} companyName={result.companyName} />
                ))}
              </div>
            </div>

            <div className="text-center py-4">
              <p className="text-[11px]" style={{ color: vars.g400 }}>
                Checked {new Date(result.checkedAt).toLocaleString()} · Results reflect AI model knowledge at time of query and may vary between sessions
              </p>
            </div>
          </div>
        )}

        {!result && !loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: vars.lightBg }}>
              <Eye size={28} style={{ color: vars.accent }} />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: vars.navy }}>Check your AI visibility</p>
            <p className="text-[12px] mt-1 text-center max-w-md" style={{ color: vars.g400 }}>
              We'll ask ChatGPT and Claude relevant questions about your sector and check whether {activeClient.name} appears in their responses.
              You'll see which models mention you, which competitors they recommend instead, and the exact context of any mentions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

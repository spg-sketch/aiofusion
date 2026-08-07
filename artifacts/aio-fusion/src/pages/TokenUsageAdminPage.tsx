import { useState } from "react";
import { vars } from "../marketing/vars";
import { ArrowLeft, AlertTriangle, Shield, ShieldOff, ChevronDown, ChevronUp, Sliders, PoundSterling } from "lucide-react";
import { apiBase } from "../lib/contentAi";

export type TokenUsageRow = {
  accountId: string;
  month: string;
  operation: string;
  model: string;
  totalInput: number;
  totalOutput: number;
  totalCost: string;
  callCount: number;
};

export type TokenDailyRow = {
  accountId: string;
  day: string;
  totalCost: string;
  callCount: number;
};

export type TokenUserInfo = {
  userId: string;
  userEmail: string | null;
  userName: string | null;
};

export type SpikeInfo = {
  last7Cost: number;
  prior7Cost: number;
  ratio: number;
  flagged: boolean;
};

export function TokenUsageAdminPage({
  rows,
  dailyRows,
  usersByAccount,
  statusByAccount,
  spikeFlags,
  thirtyDayCosts,
  currentMonthSpends,
  spendLimits,
  defaultLimit,
  defaultMonthlySpendLimitGbp,
  loading,
  error,
  onBack,
  onRefresh,
}: {
  rows: TokenUsageRow[] | null;
  dailyRows?: TokenDailyRow[] | null;
  usersByAccount?: Record<string, TokenUserInfo>;
  statusByAccount?: Record<string, string>;
  spikeFlags?: Record<string, SpikeInfo>;
  thirtyDayCosts?: Record<string, number>;
  currentMonthSpends?: Record<string, number>;
  spendLimits?: Record<string, number | null>;
  defaultLimit?: number;
  defaultMonthlySpendLimitGbp?: number;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const ink = vars.navy;
  const accent = vars.accent;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [selectedDailyMonth, setSelectedDailyMonth] = useState<string>(currentMonth);
  const [blockingSlug, setBlockingSlug] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, string>>({});
  const [quotaSlug, setQuotaSlug] = useState<string | null>(null);
  const [quotaValue, setQuotaValue] = useState("");
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  // Spend limit modal state
  const [spendLimitSlug, setSpendLimitSlug] = useState<string | null>(null);
  const [spendLimitValue, setSpendLimitValue] = useState("");
  const [spendLimitSaving, setSpendLimitSaving] = useState(false);
  const [spendLimitError, setSpendLimitError] = useState<string | null>(null);
  const [localSpendLimits, setLocalSpendLimits] = useState<Record<string, number | null>>({});

  function effectiveStatus(slug: string): string {
    return localStatus[slug] ?? statusByAccount?.[slug] ?? "active";
  }

  function effectiveSpendLimit(slug: string): number | null {
    if (slug in localSpendLimits) return localSpendLimits[slug];
    if (spendLimits && slug in spendLimits) return spendLimits[slug];
    return defaultMonthlySpendLimitGbp ?? 50;
  }

  async function handleBlock(slug: string, action: "block" | "unblock") {
    setBlockingSlug(slug);
    setBlockError(null);
    try {
      const res = await fetch(`${apiBase()}/api/admin/account/${encodeURIComponent(slug)}/block`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) { setBlockError(json.error ?? "Failed"); return; }
      setLocalStatus((prev) => ({ ...prev, [slug]: json.status }));
    } catch {
      setBlockError("Network error");
    } finally {
      setBlockingSlug(null);
    }
  }

  async function handleQuotaSave(slug: string) {
    setQuotaSaving(true);
    setQuotaError(null);
    const trimmed = quotaValue.trim();
    const body = trimmed === "" || trimmed === "0"
      ? { multiplier: null }
      : { multiplier: parseFloat(trimmed) };
    try {
      const res = await fetch(`${apiBase()}/api/admin/account/${encodeURIComponent(slug)}/quota-override`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setQuotaError(json.error ?? "Failed"); return; }
      setQuotaSlug(null);
      setQuotaValue("");
    } catch {
      setQuotaError("Network error");
    } finally {
      setQuotaSaving(false);
    }
  }

  async function handleSpendLimitSave(slug: string) {
    setSpendLimitSaving(true);
    setSpendLimitError(null);
    const trimmed = spendLimitValue.trim();
    let limitGbp: number | null;
    if (trimmed === "") {
      limitGbp = null; // reset to default
    } else {
      const v = parseFloat(trimmed);
      if (!isFinite(v) || v < 0) {
        setSpendLimitError("Enter a positive number, 0 for no limit, or leave blank to reset to default.");
        setSpendLimitSaving(false);
        return;
      }
      limitGbp = v;
    }
    try {
      const res = await fetch(`${apiBase()}/api/admin/account/${encodeURIComponent(slug)}/spend-limit`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitGbp }),
      });
      const json = await res.json();
      if (!res.ok) { setSpendLimitError(json.error ?? "Failed"); return; }
      setLocalSpendLimits((prev) => ({ ...prev, [slug]: json.limitGbp }));
      setSpendLimitSlug(null);
      setSpendLimitValue("");
    } catch {
      setSpendLimitError("Network error");
    } finally {
      setSpendLimitSaving(false);
    }
  }

  // Monthly totals keyed by account+month
  const monthTotals: Record<string, { accountId: string; month: string; totalCost: number; callCount: number }> = {};
  for (const row of rows ?? []) {
    const key = `${row.accountId}::${row.month}`;
    if (!monthTotals[key]) monthTotals[key] = { accountId: row.accountId, month: row.month, totalCost: 0, callCount: 0 };
    monthTotals[key].totalCost += parseFloat(row.totalCost);
    monthTotals[key].callCount += row.callCount;
  }

  // Accounts sorted by 30-day cost descending
  const allSlugs = [...new Set((rows ?? []).map((r) => r.accountId))];
  const slugsSortedByCost = [...allSlugs].sort((a, b) => {
    const ca = thirtyDayCosts?.[a] ?? 0;
    const cb = thirtyDayCosts?.[b] ?? 0;
    return cb - ca;
  });

  // Daily rows grouped by account (all rows, unfiltered)
  const dailyByAccount: Record<string, TokenDailyRow[]> = {};
  for (const dr of dailyRows ?? []) {
    if (!dailyByAccount[dr.accountId]) dailyByAccount[dr.accountId] = [];
    dailyByAccount[dr.accountId].push(dr);
  }

  // Available months (YYYY-MM) in descending order, derived from daily rows
  const availableMonths = [...new Set((dailyRows ?? []).map((dr) => dr.day.slice(0, 7)))]
    .sort((a, b) => b.localeCompare(a));

  function renderUserBadge(accountId: string) {
    const info = usersByAccount?.[accountId.toLowerCase()];
    if (!info) return null;
    const label = [info.userName, info.userEmail].filter(Boolean).join(" · ");
    if (!label) return null;
    return (
      <div className="text-[10px] font-mono mt-0.5 leading-tight" style={{ color: vars.g400 }} title="Account owner">
        {label}
      </div>
    );
  }

  function renderSpikeBadge(slug: string) {
    const spike = spikeFlags?.[slug];
    if (!spike?.flagged) return null;
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ml-2"
        style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}
        title={`Spend spike: £${spike.last7Cost.toFixed(4)} last 7 days vs £${spike.prior7Cost.toFixed(4)} prior 7 days (${spike.ratio.toFixed(1)}×)`}
      >
        <AlertTriangle size={10} /> {spike.ratio.toFixed(1)}× spike
      </span>
    );
  }

  function renderSpendLimitCell(slug: string) {
    const limit = effectiveSpendLimit(slug);
    const spent = currentMonthSpends?.[slug] ?? 0;
    const unlimited = limit === null;
    const pct = unlimited ? 0 : Math.min(100, (spent / limit) * 100);
    const nearLimit = !unlimited && pct >= 80;
    const overLimit = !unlimited && spent >= limit;

    const barColor = overLimit ? "#EF4444" : nearLimit ? "#F59E0B" : "#22C55E";

    return (
      <div className="min-w-[140px]">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[12px] font-semibold" style={{ color: overLimit ? "#EF4444" : ink }}>
            £{spent.toFixed(2)}
          </span>
          <span className="text-[11px]" style={{ color: vars.g400 }}>
            / {unlimited ? "no limit" : `£${limit.toFixed(0)}`}
          </span>
          {overLimit && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: "#EF4444" }}>
              <AlertTriangle size={9} /> Over
            </span>
          )}
        </div>
        {!unlimited && (
          <div className="w-full rounded-full h-1.5" style={{ background: vars.g200 }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
        )}
      </div>
    );
  }

  function renderBlockButton(slug: string) {
    const status = effectiveStatus(slug);
    const isBlocking = blockingSlug === slug;
    const suspended = status === "suspended";
    return (
      <button
        onClick={() => void handleBlock(slug, suspended ? "unblock" : "block")}
        disabled={isBlocking}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition-all hover:opacity-80 disabled:opacity-40"
        style={suspended
          ? { background: "#F0FDF4", color: "#166534", borderColor: "#86EFAC" }
          : { background: "#FEF2F2", color: "#991B1B", borderColor: "#FCA5A5" }
        }
        title={suspended ? "Unblock this account" : "Block this account"}
      >
        {suspended ? <><ShieldOff size={11} /> Unblock</> : <><Shield size={11} /> Block</>}
      </button>
    );
  }

  function renderQuotaButton(slug: string) {
    return (
      <button
        onClick={() => { setQuotaSlug(slug); setQuotaValue(""); setQuotaError(null); }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition-all hover:opacity-80"
        style={{ background: "#EFF6FF", color: "#1D4ED8", borderColor: "#BFDBFE" }}
        title="Adjust this account's fair usage quota multiplier"
      >
        <Sliders size={11} /> Quota
      </button>
    );
  }

  function renderSpendLimitButton(slug: string) {
    return (
      <button
        onClick={() => {
          const current = effectiveSpendLimit(slug);
          setSpendLimitSlug(slug);
          setSpendLimitValue(current === null ? "0" : String(current));
          setSpendLimitError(null);
        }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition-all hover:opacity-80"
        style={{ background: "#F0FDF4", color: "#166534", borderColor: "#86EFAC" }}
        title="Set this account's monthly GBP spending cap"
      >
        <PoundSterling size={11} /> Limit
      </button>
    );
  }

  const systemDefault = defaultMonthlySpendLimitGbp ?? 50;

  return (
    <div className="min-h-screen" style={{ background: vars.cream, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] mb-8 hover:opacity-70 transition-opacity"
          style={{ color: vars.g500 }}
        >
          <ArrowLeft size={14} /> Back to platform home
        </button>

        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-[28px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Token Usage</h1>
            <p className="text-[14px]" style={{ color: vars.g500 }}>Estimated Anthropic / OpenAI API cost by account. Spike badges flag accounts whose last-7-day content AI usage is 3× above the prior 7 days. Monthly spend caps block AI requests when exceeded.</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold border transition-all hover:bg-black/5 disabled:opacity-50"
            style={{ color: ink, borderColor: vars.g200 }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {blockError && (
          <div className="mb-4 px-4 py-3 rounded-xl text-[13px]" style={{ background: "#FEF2F2", color: "#991B1B" }}>{blockError}</div>
        )}

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl text-[13px]" style={{ background: "#FEF2F2", color: "#991B1B" }}>{error}</div>
        )}

        {rows === null && !loading && !error && (
          <p className="text-[14px]" style={{ color: vars.g500 }}>Click Refresh to load usage data.</p>
        )}

        {rows !== null && rows.length === 0 && (
          <p className="text-[14px]" style={{ color: vars.g500 }}>No token usage has been recorded yet.</p>
        )}

        {/* Quota override modal */}
        {quotaSlug && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
              <h2 className="text-[16px] font-bold mb-1" style={{ color: ink }}>Quota override - {quotaSlug}</h2>
              <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>
                Set a multiplier on the default {defaultLimit ?? 500}-call/month limit. Enter <strong>2</strong> to double the limit, <strong>0.5</strong> to halve it, or leave blank to reset to default.
              </p>
              <input
                type="number"
                min="0.1"
                step="0.5"
                value={quotaValue}
                onChange={(e) => setQuotaValue(e.target.value)}
                placeholder="e.g. 2 (blank = reset to default)"
                className="w-full border rounded-lg px-3 py-2 text-[13px] mb-3"
                style={{ borderColor: vars.g200, color: ink }}
              />
              {quotaError && <p className="text-[12px] mb-2" style={{ color: "#991B1B" }}>{quotaError}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setQuotaSlug(null); setQuotaValue(""); setQuotaError(null); }}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold border"
                  style={{ borderColor: vars.g200, color: vars.g500 }}
                >Cancel</button>
                <button
                  onClick={() => void handleQuotaSave(quotaSlug)}
                  disabled={quotaSaving}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: accent }}
                >
                  {quotaSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Spend limit modal */}
        {spendLimitSlug && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
              <h2 className="text-[16px] font-bold mb-1" style={{ color: ink }}>Monthly spend limit - {spendLimitSlug}</h2>
              <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>
                Set the maximum GBP this account may spend on AI calls in a calendar month. When the limit is hit, all AI endpoints return a clear error until the next month. Enter <strong>0</strong> to remove the cap, or leave blank to restore the system default (£{systemDefault}/month).
              </p>
              <input
                type="number"
                min="0"
                step="5"
                value={spendLimitValue}
                onChange={(e) => setSpendLimitValue(e.target.value)}
                placeholder={`e.g. ${systemDefault} (blank = system default £${systemDefault})`}
                className="w-full border rounded-lg px-3 py-2 text-[13px] mb-3"
                style={{ borderColor: vars.g200, color: ink }}
              />
              {spendLimitError && <p className="text-[12px] mb-2" style={{ color: "#991B1B" }}>{spendLimitError}</p>}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setSpendLimitSlug(null); setSpendLimitValue(""); setSpendLimitError(null); }}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold border"
                  style={{ borderColor: vars.g200, color: vars.g500 }}
                >Cancel</button>
                <button
                  onClick={() => void handleSpendLimitSave(spendLimitSlug)}
                  disabled={spendLimitSaving}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "#166534" }}
                >
                  {spendLimitSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {rows !== null && rows.length > 0 && (
          <>
            {/* 30-day leaderboard sorted by cost */}
            <div className="mb-8 rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
              <div className="px-5 py-3 border-b text-[11px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: vars.g200, color: vars.g500, background: vars.g100 }}>
                30-day cost ranking - accounts sorted by spend
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${vars.g200}` }}>
                      {["Account / User", "30-day cost", "This month vs limit", "Status", "Actions"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slugsSortedByCost.map((slug, i) => (
                      <tr key={slug} style={{ borderBottom: `1px solid ${vars.g200}`, background: i % 2 === 0 ? "white" : "transparent" }}>
                        <td className="px-4 py-2.5" style={{ color: ink }}>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-medium">{slug}</span>
                            {renderSpikeBadge(slug)}
                          </div>
                          {renderUserBadge(slug)}
                        </td>
                        <td className="px-4 py-2.5 font-semibold" style={{ color: accent }}>
                          £{(thirtyDayCosts?.[slug] ?? 0).toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5">
                          {renderSpendLimitCell(slug)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold"
                            style={effectiveStatus(slug) === "suspended"
                              ? { background: "#FEF2F2", color: "#991B1B" }
                              : { background: "#F0FDF4", color: "#166534" }
                            }
                          >
                            {effectiveStatus(slug)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {renderBlockButton(slug)}
                            {renderQuotaButton(slug)}
                            {renderSpendLimitButton(slug)}
                            <button
                              onClick={() => setExpandedAccounts((prev) => {
                                const next = new Set(prev);
                                if (next.has(slug)) next.delete(slug); else next.add(slug);
                                return next;
                              })}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition-all hover:bg-black/5"
                              style={{ borderColor: vars.g200, color: vars.g500 }}
                              title="Toggle daily breakdown"
                            >
                              {expandedAccounts.has(slug) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              Daily
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daily breakdown (expanded per account) */}
            {slugsSortedByCost.some((s) => expandedAccounts.has(s)) && (
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>
                  Showing month:
                </span>
                <select
                  value={selectedDailyMonth}
                  onChange={(e) => setSelectedDailyMonth(e.target.value)}
                  className="text-[12px] rounded-lg border px-2 py-1"
                  style={{ borderColor: vars.g200, color: vars.navy, background: "white" }}
                >
                  {availableMonths.length === 0 && (
                    <option value={currentMonth}>{currentMonth}</option>
                  )}
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            {slugsSortedByCost.filter((s) => expandedAccounts.has(s)).map((slug) => {
              const days = (dailyByAccount[slug] ?? []).filter((dr) => dr.day.startsWith(selectedDailyMonth));
              const allDays = dailyByAccount[slug] ?? [];
              return (
                <div key={`daily-${slug}`} className="mb-6 rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
                  <div className="px-5 py-3 border-b text-[11px] font-bold uppercase tracking-[0.16em] flex items-center gap-2" style={{ borderColor: vars.g200, color: vars.g500, background: vars.g100 }}>
                    Daily breakdown - {slug} - {selectedDailyMonth}
                    {renderSpikeBadge(slug)}
                  </div>
                  {allDays.length === 0 ? (
                    <p className="px-5 py-4 text-[13px]" style={{ color: vars.g500 }}>No usage in the last 90 days.</p>
                  ) : days.length === 0 ? (
                    <p className="px-5 py-4 text-[13px]" style={{ color: vars.g500 }}>No usage in {selectedDailyMonth} for this account.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${vars.g200}` }}>
                            {["Date", "Calls", "Est. cost (GBP)"].map((h) => (
                              <th key={h} className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {days.map((dr, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${vars.g200}`, background: i % 2 === 0 ? "white" : "transparent" }}>
                              <td className="px-4 py-2" style={{ color: ink }}>{dr.day}</td>
                              <td className="px-4 py-2" style={{ color: vars.g500 }}>{dr.callCount.toLocaleString()}</td>
                              <td className="px-4 py-2 font-semibold" style={{ color: accent }}>£{dr.totalCost}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Monthly summary */}
            <div className="mb-8 rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
              <div className="px-5 py-3 border-b text-[11px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: vars.g200, color: vars.g500, background: vars.g100 }}>
                Monthly summary by account
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${vars.g200}` }}>
                      {["Account / User", "Month", "Calls", "Est. cost (GBP)"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(monthTotals)
                      .sort((a, b) => b.month.localeCompare(a.month) || a.accountId.localeCompare(b.accountId))
                      .map((mt, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${vars.g200}`, background: i % 2 === 0 ? "white" : "transparent" }}>
                          <td className="px-4 py-2.5" style={{ color: ink }}>
                            <div className="flex items-center gap-1 flex-wrap">
                              <p className="font-medium">{mt.accountId}</p>
                              {renderSpikeBadge(mt.accountId)}
                            </div>
                            {renderUserBadge(mt.accountId)}
                          </td>
                          <td className="px-4 py-2.5" style={{ color: vars.g500 }}>{mt.month}</td>
                          <td className="px-4 py-2.5" style={{ color: vars.g500 }}>{mt.callCount.toLocaleString()}</td>
                          <td className="px-4 py-2.5 font-semibold" style={{ color: accent }}>£{mt.totalCost.toFixed(4)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Breakdown by operation */}
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: vars.g200 }}>
              <div className="px-5 py-3 border-b text-[11px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: vars.g200, color: vars.g500, background: vars.g100 }}>
                Breakdown by operation
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${vars.g200}` }}>
                      {["Account / User", "Month", "Operation", "Model", "Calls", "Input tokens", "Output tokens", "Est. cost (GBP)"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em]" style={{ color: vars.g500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${vars.g200}`, background: i % 2 === 0 ? "white" : "transparent" }}>
                        <td className="px-4 py-2.5" style={{ color: ink }}>
                          <p className="font-medium">{row.accountId}</p>
                          {renderUserBadge(row.accountId)}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: vars.g500 }}>{row.month}</td>
                        <td className="px-4 py-2.5" style={{ color: vars.g500 }}>{row.operation}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: vars.g500 }}>{row.model}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: vars.g500 }}>{row.callCount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: vars.g500 }}>{row.totalInput.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: vars.g500 }}>{row.totalOutput.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-semibold" style={{ color: accent }}>£{row.totalCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

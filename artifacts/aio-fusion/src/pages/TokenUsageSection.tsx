import { useState, useEffect } from "react";
import { vars } from "../marketing/vars";
import { AlertTriangle, Shield, ShieldOff, ChevronDown, ChevronUp, Sliders, PoundSterling, Loader2, Eye } from "lucide-react";
import { apiBase } from "../lib/contentAi";
import type { TokenUsageRow, TokenDailyRow, TokenUserInfo, SpikeInfo } from "./TokenUsageAdminPage";

type TokenUsagePayload = {
  rows: TokenUsageRow[];
  dailyRows?: TokenDailyRow[];
  usersByAccount?: Record<string, TokenUserInfo>;
  statusByAccount?: Record<string, string>;
  freeAccessByAccount?: Record<string, boolean>;
  spikeFlags?: Record<string, SpikeInfo>;
  thirtyDayCosts?: Record<string, number>;
  currentMonthSpends?: Record<string, number>;
  spendLimits?: Record<string, number | null>;
  defaultLimit?: number;
  defaultMonthlySpendLimitGbp?: number;
};

export function TokenUsageSection({ onViewAccount }: { onViewAccount?: (slug: string) => void }) {
  const [data, setData] = useState<TokenUsagePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    fetch(`${apiBase()}/api/admin/token-usage`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load token usage");
        const json = await r.json() as TokenUsagePayload;
        setData(json);
      })
      .catch(() => setError("Could not load token usage data."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

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

  const [spendLimitSlug, setSpendLimitSlug] = useState<string | null>(null);
  const [spendLimitValue, setSpendLimitValue] = useState("");
  const [spendLimitSaving, setSpendLimitSaving] = useState(false);
  const [spendLimitError, setSpendLimitError] = useState<string | null>(null);
  const [localSpendLimits, setLocalSpendLimits] = useState<Record<string, number | null>>({});

  const [freeAccessSlug, setFreeAccessSlug] = useState<string | null>(null);
  const [freeAccessError, setFreeAccessError] = useState<string | null>(null);
  const [localFreeAccess, setLocalFreeAccess] = useState<Record<string, boolean>>({});

  // FILTERS
  const [filterAccount, setFilterAccount] = useState("");
  const [filterFromMonth, setFilterFromMonth] = useState("");
  const [filterToMonth, setFilterToMonth] = useState("");
  const [filterOperation, setFilterOperation] = useState("");
  const [filterModel, setFilterModel] = useState("");
  const [filterProject, setFilterProject] = useState("");

  if (!data && loading) return <div className="p-6 text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading usage data...</div>;
  if (!data && error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const {
    rows, dailyRows, usersByAccount, statusByAccount, freeAccessByAccount,
    spikeFlags, thirtyDayCosts, currentMonthSpends, spendLimits,
    defaultLimit, defaultMonthlySpendLimitGbp
  } = data;

  function effectiveStatus(slug: string) { return localStatus[slug] ?? statusByAccount?.[slug] ?? "active"; }
  function effectiveSpendLimit(slug: string) {
    if (slug in localSpendLimits) return localSpendLimits[slug];
    if (spendLimits && slug in spendLimits) return spendLimits[slug];
    return defaultMonthlySpendLimitGbp ?? 50;
  }
  function effectiveFreeAccess(slug: string) { return localFreeAccess[slug] ?? freeAccessByAccount?.[slug] ?? false; }

  async function handleBlock(slug: string, action: "block" | "unblock") {
    setBlockingSlug(slug);
    setBlockError(null);
    try {
      const res = await fetch(`${apiBase()}/api/admin/account/${encodeURIComponent(slug)}/block`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) { setBlockError(json.error ?? "Failed"); return; }
      setLocalStatus((prev) => ({ ...prev, [slug]: json.status }));
    } catch { setBlockError("Network error"); } finally { setBlockingSlug(null); }
  }

  async function handleQuotaSave(slug: string) {
    setQuotaSaving(true); setQuotaError(null);
    const trimmed = quotaValue.trim();
    const body = trimmed === "" || trimmed === "0" ? { multiplier: null } : { multiplier: parseFloat(trimmed) };
    try {
      const res = await fetch(`${apiBase()}/api/admin/account/${encodeURIComponent(slug)}/quota-override`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setQuotaError(json.error ?? "Failed"); return; }
      setQuotaSlug(null); setQuotaValue("");
    } catch { setQuotaError("Network error"); } finally { setQuotaSaving(false); }
  }

  async function handleSpendLimitSave(slug: string) {
    setSpendLimitSaving(true); setSpendLimitError(null);
    const trimmed = spendLimitValue.trim();
    let limitGbp: number | null;
    if (trimmed === "") limitGbp = null;
    else {
      const v = parseFloat(trimmed);
      if (!isFinite(v) || v < 0) { setSpendLimitError("Positive number, 0, or blank."); setSpendLimitSaving(false); return; }
      limitGbp = v;
    }
    try {
      const res = await fetch(`${apiBase()}/api/admin/account/${encodeURIComponent(slug)}/spend-limit`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limitGbp }),
      });
      const json = await res.json();
      if (!res.ok) { setSpendLimitError(json.error ?? "Failed"); return; }
      setLocalSpendLimits((prev) => ({ ...prev, [slug]: json.limitGbp }));
      setSpendLimitSlug(null); setSpendLimitValue("");
    } catch { setSpendLimitError("Network error"); } finally { setSpendLimitSaving(false); }
  }

  async function handleFreeAccess(slug: string, enabled: boolean) {
    setFreeAccessSlug(slug); setFreeAccessError(null);
    try {
      const res = await fetch(`${apiBase()}/api/admin/account/${encodeURIComponent(slug)}/free-access`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) { setFreeAccessError(json.error ?? "Failed"); return; }
      setLocalFreeAccess((prev) => ({ ...prev, [slug]: json.freeAccess }));
    } catch { setFreeAccessError("Network error"); } finally { setFreeAccessSlug(null); }
  }

  const filteredRows = rows.filter((r) => {
    if (filterAccount && !r.accountId.toLowerCase().includes(filterAccount.toLowerCase())) return false;
    if (filterFromMonth && r.month < filterFromMonth) return false;
    if (filterToMonth && r.month > filterToMonth) return false;
    if (filterOperation && !r.operation.toLowerCase().includes(filterOperation.toLowerCase())) return false;
    if (filterModel && !r.model.toLowerCase().includes(filterModel.toLowerCase())) return false;
    if (
      filterProject &&
      !(r.projectName ?? "").toLowerCase().includes(filterProject.toLowerCase()) &&
      !(r.projectId ?? "").toLowerCase().includes(filterProject.toLowerCase())
    ) return false;
    return true;
  });

  const monthTotals: Record<string, { accountId: string; month: string; totalCost: number; callCount: number }> = {};
  for (const row of filteredRows) {
    const key = `${row.accountId}::${row.month}`;
    if (!monthTotals[key]) monthTotals[key] = { accountId: row.accountId, month: row.month, totalCost: 0, callCount: 0 };
    monthTotals[key].totalCost += parseFloat(row.totalCost);
    monthTotals[key].callCount += row.callCount;
  }

  const allSlugs = [...new Set(filteredRows.map((r) => r.accountId))];
  const slugsSortedByCost = [...allSlugs]
    .filter(a => !filterAccount || a.toLowerCase().includes(filterAccount.toLowerCase()))
    .sort((a, b) => (thirtyDayCosts?.[b] ?? 0) - (thirtyDayCosts?.[a] ?? 0));

  const dailyByAccount: Record<string, TokenDailyRow[]> = {};
  for (const dr of dailyRows ?? []) {
    if (!dailyByAccount[dr.accountId]) dailyByAccount[dr.accountId] = [];
    dailyByAccount[dr.accountId].push(dr);
  }

  const availableMonths = [...new Set((dailyRows ?? []).map((dr) => dr.day.slice(0, 7)))].sort((a, b) => b.localeCompare(a));

  function renderUserBadge(accountId: string) {
    const info = usersByAccount?.[accountId.toLowerCase()];
    if (!info) return null;
    const label = [info.userName, info.userEmail].filter(Boolean).join(" · ");
    if (!label) return null;
    return <div className="text-[10px] font-mono mt-0.5 leading-tight" style={{ color: vars.g400 }}>{label}</div>;
  }

  function renderSpikeBadge(slug: string) {
    const spike = spikeFlags?.[slug];
    if (!spike?.flagged) return null;
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ml-2" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
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
          <span className="text-[12px] font-semibold" style={{ color: overLimit ? "#EF4444" : ink }}>£{spent.toFixed(2)}</span>
          <span className="text-[11px]" style={{ color: vars.g400 }}>/ {unlimited ? "no limit" : `£${limit.toFixed(0)}`}</span>
          {overLimit && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold" style={{ color: "#EF4444" }}><AlertTriangle size={9} /> Over</span>}
        </div>
        {!unlimited && (
          <div className="w-full rounded-full h-1.5" style={{ background: vars.g200 }}>
            <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
          </div>
        )}
      </div>
    );
  }

  const systemDefault = defaultMonthlySpendLimitGbp ?? 50;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Token & AI Usage</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor API costs, adjust limits, and drill down into model usage.</p>
        </div>
        <button onClick={loadData} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all hover:bg-black/5 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : "Refresh"}
        </button>
      </div>

      {(blockError || freeAccessError || error) && (
        <div className="px-4 py-3 rounded-xl text-sm bg-red-50 text-red-900">{blockError || freeAccessError || error}</div>
      )}

      {/* Quota override modal */}
      {quotaSlug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-base font-bold mb-1" style={{ color: ink }}>Quota override - {quotaSlug}</h2>
            <p className="text-sm mb-4 text-gray-500">Set a multiplier on the default {defaultLimit ?? 500}-call/month limit. Enter 2 to double, 0.5 to halve, or blank to reset.</p>
            <input type="number" min="0.1" step="0.5" value={quotaValue} onChange={e => setQuotaValue(e.target.value)} placeholder="e.g. 2" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
            {quotaError && <p className="text-xs mb-2 text-red-700">{quotaError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setQuotaSlug(null)} className="px-4 py-2 rounded-lg text-xs font-semibold border text-gray-600">Cancel</button>
              <button onClick={() => handleQuotaSave(quotaSlug)} disabled={quotaSaving} className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#C8497A] disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Spend limit modal */}
      {spendLimitSlug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-base font-bold mb-1" style={{ color: ink }}>Monthly spend limit - {spendLimitSlug}</h2>
            <p className="text-sm mb-4 text-gray-500">Set maximum GBP. 0 for no limit, blank for default (£{systemDefault}).</p>
            <input type="number" min="0" step="5" value={spendLimitValue} onChange={e => setSpendLimitValue(e.target.value)} placeholder={`e.g. ${systemDefault}`} className="w-full border rounded-lg px-3 py-2 text-sm mb-3" />
            {spendLimitError && <p className="text-xs mb-2 text-red-700">{spendLimitError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSpendLimitSlug(null)} className="px-4 py-2 rounded-lg text-xs font-semibold border text-gray-600">Cancel</button>
              <button onClick={() => handleSpendLimitSave(spendLimitSlug)} disabled={spendLimitSaving} className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-green-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border flex flex-wrap gap-4 items-end shadow-sm">
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">Account</label>
          <input type="text" value={filterAccount} onChange={e => setFilterAccount(e.target.value)} placeholder="Filter by account..." className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">From month</label>
          <input type="month" value={filterFromMonth} onChange={e => setFilterFromMonth(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">To month</label>
          <input type="month" value={filterToMonth} onChange={e => setFilterToMonth(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">Operation</label>
          <input type="text" value={filterOperation} onChange={e => setFilterOperation(e.target.value)} placeholder="e.g. generate, edit" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">Model</label>
          <input type="text" value={filterModel} onChange={e => setFilterModel(e.target.value)} placeholder="e.g. claude-3" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">Project</label>
          <input type="text" value={filterProject} onChange={e => setFilterProject(e.target.value)} placeholder="Name or project ID" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden bg-white shadow-sm">
        <div className="px-5 py-3 border-b text-[11px] font-bold uppercase tracking-[0.16em] bg-gray-50 text-gray-500">
          30-day cost ranking - accounts sorted by spend
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                {["Account / User", "30-day cost", "This month vs limit", "Status", "Actions"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em] text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slugsSortedByCost.map((slug, i) => (
                <tr key={slug} className={`border-b border-gray-200 ${i % 2 === 0 ? "bg-white" : "bg-transparent"}`}>
                  <td className="px-4 py-2.5 text-gray-900">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-medium">{slug}</span>
                      {renderSpikeBadge(slug)}
                    </div>
                    {renderUserBadge(slug)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-[#C8497A]">£{(thirtyDayCosts?.[slug] ?? 0).toFixed(4)}</td>
                  <td className="px-4 py-2.5">{renderSpendLimitCell(slug)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${effectiveStatus(slug) === 'suspended' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                      {effectiveStatus(slug)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {onViewAccount && (
                        <button onClick={() => onViewAccount(slug)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
                          <Eye size={11} /> View account
                        </button>
                      )}
                      <button onClick={() => handleBlock(slug, effectiveStatus(slug) === 'suspended' ? 'unblock' : 'block')} disabled={blockingSlug === slug} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border ${effectiveStatus(slug) === 'suspended' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'} hover:opacity-80 disabled:opacity-40`}>
                        {effectiveStatus(slug) === 'suspended' ? <><ShieldOff size={11}/> Unblock</> : <><Shield size={11}/> Block</>}
                      </button>
                      <button onClick={() => { setQuotaSlug(slug); setQuotaValue(""); setQuotaError(null); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200 hover:opacity-80"><Sliders size={11}/> Quota</button>
                      <button onClick={() => { setSpendLimitSlug(slug); setSpendLimitValue(effectiveSpendLimit(slug) === null ? "0" : String(effectiveSpendLimit(slug))); setSpendLimitError(null); }} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border bg-green-50 text-green-800 border-green-300 hover:opacity-80"><PoundSterling size={11}/> Limit</button>
                      <button onClick={() => handleFreeAccess(slug, !effectiveFreeAccess(slug))} disabled={freeAccessSlug === slug} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border ${effectiveFreeAccess(slug) ? 'bg-yellow-50 text-yellow-800 border-yellow-300' : 'bg-gray-50 text-gray-600 border-gray-300'} hover:opacity-80 disabled:opacity-40`}>
                        {effectiveFreeAccess(slug) ? "Free access: on" : "Free access"}
                      </button>
                      <button onClick={() => setExpandedAccounts(p => { const n = new Set(p); if(n.has(slug)) n.delete(slug); else n.add(slug); return n; })} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border bg-white border-gray-200 text-gray-500 hover:bg-gray-50">
                        {expandedAccounts.has(slug) ? <ChevronUp size={11}/> : <ChevronDown size={11}/>} Daily
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {slugsSortedByCost.some(s => expandedAccounts.has(s)) && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Showing month:</span>
          <select value={selectedDailyMonth} onChange={e => setSelectedDailyMonth(e.target.value)} className="text-[12px] rounded-lg border px-2 py-1 bg-white border-gray-200">
            {availableMonths.length === 0 && <option value={currentMonth}>{currentMonth}</option>}
            {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      {slugsSortedByCost.filter(s => expandedAccounts.has(s)).map(slug => {
        const days = (dailyByAccount[slug] ?? []).filter(dr => dr.day.startsWith(selectedDailyMonth));
        return (
          <div key={`daily-${slug}`} className="rounded-2xl border overflow-hidden bg-white shadow-sm">
            <div className="px-5 py-3 border-b text-[11px] font-bold uppercase tracking-[0.16em] flex items-center gap-2 bg-gray-50 text-gray-500">
              Daily breakdown - {slug} - {selectedDailyMonth} {renderSpikeBadge(slug)}
            </div>
            {days.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-gray-500">No usage in {selectedDailyMonth}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em] text-gray-500">Date</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em] text-gray-500">Calls</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em] text-gray-500">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((dr, i) => (
                      <tr key={i} className={`border-b border-gray-200 ${i % 2 === 0 ? "bg-white" : "bg-transparent"}`}>
                        <td className="px-4 py-2 text-gray-900">{dr.day}</td>
                        <td className="px-4 py-2 text-gray-500">{dr.callCount.toLocaleString()}</td>
                        <td className="px-4 py-2 font-semibold text-[#C8497A]">£{dr.totalCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-2xl border overflow-hidden bg-white shadow-sm">
        <div className="px-5 py-3 border-b text-[11px] font-bold uppercase tracking-[0.16em] bg-gray-50 text-gray-500">Detailed Usage Log (Filtered)</div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-[13px] border-collapse relative">
            <thead className="sticky top-0 bg-gray-50 shadow-sm">
              <tr>
                {["Account", "Project", "Month", "Operation", "Model", "Calls", "Est. cost"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.12em] text-gray-500 bg-gray-50">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 100).map((r, i) => (
                <tr key={i} className={`border-b border-gray-200 ${i % 2 === 0 ? "bg-white" : "bg-transparent"}`}>
                  <td className="px-4 py-2 text-gray-900">{r.accountId}</td>
                  <td className="px-4 py-2 text-gray-500">
                    <span className="block font-medium text-gray-700">{r.projectName ?? "Account level"}</span>
                    {r.projectId && <span className="block text-[10px] font-mono text-gray-400">{r.projectId}</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{r.month}</td>
                  <td className="px-4 py-2 text-gray-500">{r.operation}</td>
                  <td className="px-4 py-2 text-gray-500">{r.model}</td>
                  <td className="px-4 py-2 text-gray-500">{r.callCount.toLocaleString()}</td>
                  <td className="px-4 py-2 font-semibold text-[#C8497A]">£{parseFloat(r.totalCost).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 100 && <div className="p-4 text-center text-xs text-gray-500 border-t">Showing first 100 rows. Use filters to narrow down.</div>}
        </div>
      </div>
    </div>
  );
}

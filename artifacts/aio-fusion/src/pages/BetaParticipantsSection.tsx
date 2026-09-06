import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { apiBase } from "../lib/contentAi";

const ink = "#0a1628";
type BetaFilter = "current" | "expiring" | "expired" | "all";

export interface SubscriptionRow {
  slug: string;
  displayName: string;
  accountType: string;
  accountStatus: string;
  subscriptionStatus: string;
  plan: string | null;
  frequency: string | null;
  currentPeriodEnd: string | null;
  lastPaymentAt: string | null;
  actionsLast30Days: number;
  projectAddons: number;
  freeAccess: boolean;
  discount: { percent: number; label: string; redeemedAt: string; endedAt: string | null } | null;
  // Beta trial fields
  betaTrialStartedAt?: string | null;
  betaTrialEndsAt?: string | null;
  betaTrialStatus?: string | null;
  betaDaysRemaining?: number | null;
  projectCount?: number;
  projectAllowance?: number;
}

export function classifyBetaParticipant(
  row: SubscriptionRow,
  now = new Date(),
): Exclude<BetaFilter, "all"> | null {
  if (!row.betaTrialStartedAt || !row.betaTrialEndsAt) return null;
  const endsAt = new Date(row.betaTrialEndsAt);
  if (Number.isNaN(endsAt.getTime())) return null;
  const remainingDays = Math.ceil((endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (row.betaTrialStatus === "expired" || remainingDays <= 0) return "expired";
  if (remainingDays <= 7) return "expiring";
  return "current";
}

export function BetaParticipantsSection() {
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BetaFilter>("current");

  const loadRows = () => {
    void fetch(`${apiBase()}/api/admin/subscriptions`, { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => null))?.error)))
      .then((d: { rows: SubscriptionRow[] }) => { setRows(d.rows); setRowsError(null); })
      .catch((e) => setRowsError(typeof e === "string" ? e : "Could not load the overview."));
  };
  useEffect(() => { loadRows(); }, []);

  const betaRows = rows?.filter((row) => classifyBetaParticipant(row) !== null) ?? [];
  const currentRows = betaRows.filter((row) => classifyBetaParticipant(row) === "current");
  const expiringRows = betaRows.filter((row) => classifyBetaParticipant(row) === "expiring");
  const expiredRows = betaRows.filter((row) => classifyBetaParticipant(row) === "expired");

  const displayRows = activeTab === "current" ? currentRows 
    : activeTab === "expiring" ? expiringRows 
    : activeTab === "expired" ? expiredRows 
    : betaRows;

  function fmtDate(iso?: string | null): string {
    if (!iso) return "-";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  const thCls = "text-left text-[10px] font-bold uppercase tracking-[0.14em] px-4 py-3 whitespace-nowrap bg-gray-50 text-gray-500 border-b border-gray-200";
  const tdCls = "px-4 py-3 text-[13px] whitespace-nowrap border-b border-gray-200 text-gray-700";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Beta Participants</h2>
          <p className="text-sm text-gray-500 mt-1">Manage active, expiring, and expired beta trial accounts.</p>
        </div>
        <button
          type="button"
          onClick={loadRows}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-semibold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-gray-200">
        {[
          { id: "current", label: "Current", count: currentRows.length },
          { id: "expiring", label: "Expiring Soon", count: expiringRows.length },
          { id: "expired", label: "Expired", count: expiredRows.length },
          { id: "all", label: "All Beta", count: betaRows.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as BetaFilter)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === tab.id ? 'border-[#C8497A] text-[#C8497A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-[#FBE3ED] text-[#C8497A]' : 'bg-gray-100 text-gray-500'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {rowsError && <p className="text-sm font-semibold text-red-600">{rowsError}</p>}
      {!rows && !rowsError ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Loading beta participants...
        </div>
      ) : displayRows.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm">No {activeTab} beta participants found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thCls}>Account</th>
                <th className={thCls}>Type</th>
                <th className={thCls}>Trial Started</th>
                <th className={thCls}>Trial Ends</th>
                <th className={thCls}>Days Left</th>
                <th className={thCls}>Projects</th>
                <th className={thCls}>Actions (30d)</th>
                <th className={thCls}>Billing state</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(r => (
                <tr key={r.slug} className="hover:bg-gray-50/50 transition-colors">
                  <td className={tdCls}>
                    <div className="font-semibold text-gray-900">{r.displayName}</div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">{r.slug}</div>
                  </td>
                  <td className={tdCls}>{r.accountType === "agency" ? "Agency/Partner" : "In-House"}</td>
                  <td className={tdCls}>{fmtDate(r.betaTrialStartedAt)}</td>
                  <td className={tdCls}>{fmtDate(r.betaTrialEndsAt)}</td>
                  <td className={tdCls}>
                    {r.betaDaysRemaining != null ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        r.betaDaysRemaining <= 0 ? 'bg-red-50 text-red-700' :
                        r.betaDaysRemaining <= 3 ? 'bg-orange-50 text-orange-700' :
                        'bg-green-50 text-green-700'
                      }`}>
                        {r.betaDaysRemaining <= 0 ? 'Expired' : `${r.betaDaysRemaining} days`}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {r.projectCount != null ? (
                      <span className="font-medium">
                        {r.projectCount} <span className="text-gray-400 font-normal">/ {r.projectAllowance ?? '∞'}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className={tdCls}>{r.actionsLast30Days}</td>
                  <td className={tdCls}>
                    {r.freeAccess ? "Free access" : r.subscriptionStatus === "none" ? "Beta trial" : r.subscriptionStatus.replace("_", " ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

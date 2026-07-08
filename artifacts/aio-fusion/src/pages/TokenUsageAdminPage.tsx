import { vars } from "../marketing/vars";
import { ArrowLeft } from "lucide-react";

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

export type TokenUserInfo = {
  userId: string;
  userEmail: string | null;
  userName: string | null;
};

export function TokenUsageAdminPage({
  rows,
  usersByAccount,
  loading,
  error,
  onBack,
  onRefresh,
}: {
  rows: TokenUsageRow[] | null;
  usersByAccount?: Record<string, TokenUserInfo>;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const ink = vars.navy;
  const accent = vars.accent;

  const monthTotals: Record<string, { accountId: string; month: string; totalCost: number; callCount: number }> = {};
  for (const row of rows ?? []) {
    const key = `${row.accountId}::${row.month}`;
    if (!monthTotals[key]) monthTotals[key] = { accountId: row.accountId, month: row.month, totalCost: 0, callCount: 0 };
    monthTotals[key].totalCost += parseFloat(row.totalCost);
    monthTotals[key].callCount += row.callCount;
  }

  function renderUserBadge(accountId: string) {
    const info = usersByAccount?.[accountId.toLowerCase()];
    if (!info) return null;
    const label = [info.userName, info.userEmail].filter(Boolean).join(" · ");
    if (!label) return null;
    return (
      <div className="text-[10px] font-mono mt-0.5 leading-tight" style={{ color: vars.g400 }} title="Account owner — based on membership record">
        {label}
      </div>
    );
  }

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
            <p className="text-[14px]" style={{ color: vars.g500 }}>Estimated Anthropic / OpenAI API cost by account, month and operation.</p>
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

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl text-[13px]" style={{ background: "#FEF2F2", color: "#991B1B" }}>{error}</div>
        )}

        {rows === null && !loading && !error && (
          <p className="text-[14px]" style={{ color: vars.g500 }}>Click Refresh to load usage data.</p>
        )}

        {rows !== null && rows.length === 0 && (
          <p className="text-[14px]" style={{ color: vars.g500 }}>No token usage has been recorded yet. Usage is logged whenever an AI feature is used.</p>
        )}

        {rows !== null && rows.length > 0 && (
          <>
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
                        <tr key={i} style={{ borderBottom: `1px solid ${vars.g200}` }}>
                          <td className="px-4 py-2.5" style={{ color: ink }}>
                            <p className="font-medium">{mt.accountId}</p>
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

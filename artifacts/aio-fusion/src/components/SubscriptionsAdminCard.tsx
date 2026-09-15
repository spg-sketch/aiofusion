import { useEffect, useState } from "react";
import { CreditCard, Loader2, Copy, Check, Send, XCircle } from "lucide-react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/contentAi";

const ink = "#0a1628";
const accent = "#C8497A";

interface SubscriptionRow {
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
}

interface InviteRow {
  email: string;
  accountType: string;
  percent: number;
  label: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBySlug: string | null;
  expired: boolean;
  url: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const statusColours: Record<string, { bg: string; fg: string }> = {
  active: { bg: "#E7F6EE", fg: "#1E7A46" },
  past_due: { bg: "#FDF1E2", fg: "#B3620E" },
  cancelled: { bg: "#FDEAEA", fg: "#B3261E" },
  none: { bg: "#F1F4F7", fg: "#5B6B78" },
};

export function SubscriptionsAdminCard() {
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);

  // Invite form
  const [invEmail, setInvEmail] = useState("");
  const [invType, setInvType] = useState<"client" | "agency">("client");
  const [invPercent, setInvPercent] = useState("");
  const [invLabel, setInvLabel] = useState("Beta");
  const [invLoading, setInvLoading] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [endingSlug, setEndingSlug] = useState<string | null>(null);

  const loadRows = () => {
    void fetch(`${apiBase()}/api/admin/subscriptions`, { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => null))?.error)))
      .then((d: { rows: SubscriptionRow[] }) => { setRows(d.rows); setRowsError(null); })
      .catch((e) => setRowsError(typeof e === "string" ? e : "Could not load the subscription overview."));
  };
  const loadInvites = () => {
    void fetch(`${apiBase()}/api/admin/discount-invites`, { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => null))?.error)))
      .then((d: { invites: InviteRow[] }) => { setInvites(d.invites); setInvitesError(null); })
      .catch((e) => setInvitesError(typeof e === "string" ? e : "Could not load discount invites."));
  };
  useEffect(() => { loadRows(); loadInvites(); }, []);

  const handleCreateInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(null);
    setCreatedUrl(null);
    const pct = Number.parseInt(invPercent, 10);
    if (!Number.isInteger(pct) || pct < 1 || pct > 99) {
      setInvError("Discount must be a whole number between 1 and 99. For 100%, use the free-access toggle in Token & AI Usage instead.");
      return;
    }
    setInvLoading(true);
    void fetch(`${apiBase()}/api/admin/discount-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: invEmail.trim(), accountType: invType, percent: pct, label: invLabel.trim() }),
    })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.error || "Could not create the invite.");
        setCreatedUrl(json.url);
        setInvEmail("");
        setInvPercent("");
        loadInvites();
      })
      .catch((err: Error) => setInvError(err.message))
      .finally(() => setInvLoading(false));
  };

  const handleCopy = (url: string) => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 2000);
    });
  };

  const handleEndDiscount = (slug: string) => {
    if (!confirm(`End the discount for '${slug}'? Their next renewal will bill at full price. This cannot be undone.`)) return;
    setEndingSlug(slug);
    void fetch(`${apiBase()}/api/admin/discounts/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ slug }),
    })
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (!r.ok) throw new Error(json?.error || "Could not end the discount.");
        loadRows();
      })
      .catch((err: Error) => setRowsError(err.message))
      .finally(() => setEndingSlug(null));
  };

  const inputStyle = { background: "white", borderColor: vars.g200, color: ink } as const;
  const labelCls = "aio-type-eyebrow block mb-1.5";
  const thCls = "aio-type-eyebrow text-left px-3 py-2 whitespace-nowrap";
  const tdCls = "aio-type-meta px-3 py-2 whitespace-nowrap";

  return (
    <div className="rounded-2xl p-6 sm:p-8 mt-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#FBE3ED" }}>
          <CreditCard size={16} color={accent} />
        </div>
        <div>
          <h2 className="aio-type-card-title" style={{ color: ink }}>Subscriptions</h2>
          <p className="aio-type-body mt-0.5" style={{ color: vars.g600 }}>
            Every account's subscription at a glance, plus beta and VIP discount invitations.
          </p>
        </div>
      </div>

      {/* Overview table */}
       {rowsError && <p className="aio-type-supporting font-semibold mb-3" style={{ color: "#B3261E" }}>{rowsError}</p>}
      {!rows && !rowsError ? (
         <div className="aio-type-supporting flex items-center gap-2 py-4" style={{ color: vars.g500 }}>
          <Loader2 size={14} className="animate-spin" /> Loading subscriptions…
        </div>
      ) : rows && (
        <div className="overflow-x-auto rounded-xl border mb-8" style={{ borderColor: vars.g200 }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: vars.g500 }}>
                <th className={thCls}>Account</th>
                <th className={thCls}>Type</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Plan</th>
                <th className={thCls}>Billing</th>
                <th className={thCls}>Renews</th>
                <th className={thCls}>Last payment</th>
                <th className={thCls}>Actions (30d)</th>
                <th className={thCls}>Discount</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sc = statusColours[r.subscriptionStatus] ?? statusColours.none;
                return (
                  <tr key={r.slug} style={{ borderTop: `1px solid ${vars.g200}`, color: ink }}>
                    <td className={tdCls}>
                       <span className="aio-type-label">{r.displayName}</span>
                      <span className="ml-1.5" style={{ color: vars.g400 }}>{r.slug}</span>
                    </td>
                    <td className={tdCls} style={{ color: vars.g600 }}>{r.accountType === "agency" ? "Agency/Partner" : r.accountType === "client" ? "In-House" : r.accountType}</td>
                    <td className={tdCls}>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: sc.bg, color: sc.fg }}>
                        {r.freeAccess ? "free access" : r.subscriptionStatus.replace("_", " ")}
                      </span>
                    </td>
                    <td className={tdCls} style={{ color: vars.g600 }}>
                      {r.plan ?? "-"}{r.projectAddons > 0 ? ` +${r.projectAddons} project${r.projectAddons > 1 ? "s" : ""}` : ""}
                    </td>
                    <td className={tdCls} style={{ color: vars.g600 }}>{r.frequency ?? "-"}</td>
                    <td className={tdCls} style={{ color: vars.g600 }}>{fmtDate(r.currentPeriodEnd)}</td>
                    <td className={tdCls} style={{ color: vars.g600 }}>{fmtDate(r.lastPaymentAt)}</td>
                    <td className={tdCls} style={{ color: vars.g600 }}>{r.actionsLast30Days}</td>
                    <td className={tdCls}>
                      {r.discount ? (
                        <span style={{ color: r.discount.endedAt ? vars.g400 : "#1E7A46" }} className="font-semibold">
                          {r.discount.percent}% {r.discount.label}
                          {r.discount.endedAt ? " (ended)" : ` . ${fmtDate(r.discount.redeemedAt)}`}
                        </span>
                      ) : (
                        <span style={{ color: vars.g300 }}>-</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {r.discount && !r.discount.endedAt && (
                        <button
                          onClick={() => handleEndDiscount(r.slug)}
                          disabled={endingSlug === r.slug}
                           className="aio-button aio-button--text aio-button--compact uppercase tracking-[0.1em]"
                          style={{ color: "#B3261E" }}
                        >
                          {endingSlug === r.slug ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                          End discount
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite form */}
       <h3 className="aio-type-card-title mb-1" style={{ color: ink }}>Send a discount invitation</h3>
       <p className="aio-type-body mb-4" style={{ color: vars.g600 }}>
        Creates a single-use link (valid 30 days) that pre-loads the account type and applies the discount automatically at checkout - the discount persists on every renewal until you end it. For 100% free access, use the free-access toggle in Token & AI Usage.
      </p>
      <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3 items-end">
        <div className="lg:col-span-2">
          <label className={labelCls} style={{ color: vars.g500 }}>Invitee email</label>
           <input type="email" required value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="them@company.com" className="aio-type-body w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2" style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={{ color: vars.g500 }}>Account type</label>
           <select value={invType} onChange={(e) => setInvType(e.target.value as "client" | "agency")} className="aio-type-body w-full px-3 py-2.5 rounded-xl border focus:outline-none" style={inputStyle}>
            <option value="client">In-House</option>
            <option value="agency">Agency/Partner</option>
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: vars.g500 }}>Discount %</label>
           <input type="number" required min={1} max={99} step={1} value={invPercent} onChange={(e) => setInvPercent(e.target.value)} placeholder="e.g. 50" className="aio-type-body w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2" style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={{ color: vars.g500 }}>Label</label>
           <input type="text" required value={invLabel} onChange={(e) => setInvLabel(e.target.value)} placeholder="Beta / VIP" className="aio-type-body w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2" style={inputStyle} />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
           <button type="submit" disabled={invLoading} className="aio-button aio-button--primary uppercase tracking-[0.14em]" style={{ background: accent }}>
            {invLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Create invitation link
          </button>
        </div>
      </form>
       {invError && <p className="aio-type-supporting font-semibold mb-3" style={{ color: "#B3261E" }}>{invError}</p>}
      {createdUrl && (
         <div className="aio-type-supporting flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl" style={{ background: "#E7F6EE", color: "#1E7A46" }}>
           <span className="font-semibold shrink-0">Invitation link:</span>
          <span className="truncate">{createdUrl}</span>
           <button onClick={() => handleCopy(createdUrl)} className="aio-button aio-button--text aio-button--compact shrink-0 uppercase tracking-[0.1em]">
            {copied === createdUrl ? <Check size={12} /> : <Copy size={12} />}
            {copied === createdUrl ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {/* Invite list */}
       {invitesError && <p className="aio-type-supporting font-semibold mb-3" style={{ color: "#B3261E" }}>{invitesError}</p>}
      {invites && invites.length > 0 && (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: vars.g200 }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", color: vars.g500 }}>
                <th className={thCls}>Email</th>
                <th className={thCls}>Type</th>
                <th className={thCls}>Discount</th>
                <th className={thCls}>Label</th>
                <th className={thCls}>Sent</th>
                <th className={thCls}>Status</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i, idx) => (
                <tr key={idx} style={{ borderTop: `1px solid ${vars.g200}`, color: ink }}>
                  <td className={tdCls}>{i.email}</td>
                  <td className={tdCls} style={{ color: vars.g600 }}>{i.accountType === "agency" ? "Agency/Partner" : "In-House"}</td>
                  <td className={tdCls}>{i.percent}%</td>
                  <td className={tdCls} style={{ color: vars.g600 }}>{i.label}</td>
                  <td className={tdCls} style={{ color: vars.g600 }}>{fmtDate(i.createdAt)}</td>
                  <td className={tdCls}>
                    {i.usedAt ? (
                      <span className="font-semibold" style={{ color: "#1E7A46" }}>Redeemed {fmtDate(i.usedAt)}{i.usedBySlug ? ` (${i.usedBySlug})` : ""}</span>
                    ) : i.expired ? (
                      <span style={{ color: "#B3261E" }}>Expired</span>
                    ) : (
                      <span style={{ color: vars.g600 }}>Pending . expires {fmtDate(i.expiresAt)}</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {i.url && !i.expired && (
                       <button onClick={() => handleCopy(i.url!)} className="aio-button aio-button--text aio-button--compact uppercase tracking-[0.1em]" style={{ color: accent }}>
                        {copied === i.url ? <Check size={11} /> : <Copy size={11} />}
                        {copied === i.url ? "Copied" : "Copy link"}
                      </button>
                    )}
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

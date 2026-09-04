import { useEffect, useState } from "react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/apiHelpers";

const ink = vars.navy;
const accent = vars.accent;

// Subscription card shown at the top of the Billing settings section.
// - No subscription: choose annual or quarterly billing and start Stripe
//   Checkout (test mode during Beta).
// - Subscribed: shows plan, status, renewal date, projects used vs included,
//   payment-method/cancellation via the Stripe Customer Portal, past invoices,
//   and the two upsells (add a project, change a project's tier).
// Access is enforced server-side; the parent gates rendering by role.

type ProjectTier = "standard" | "premium" | "max";

type BillingProject = {
  id: string;
  name: string;
  tier: ProjectTier | null;
  isAddon: boolean;
  addonSubscriptionId: string | null;
  pendingTier: ProjectTier | null;
};

type SubscriptionInfo = {
  status: "none" | "active" | "past_due" | "cancelled";
  plan: "inhouse" | "agency" | null;
  frequency: "annual" | "quarterly" | null;
  currentPeriodEnd: string | null;
  entitled: boolean;
  applicablePlan: "inhouse" | "agency";
  includedProjects: number;
  projectAllowance: number;
  projectsUsed: number;
  latestInvoiceUrl?: string | null;
  portalAvailable: boolean;
  checkoutAvailable: boolean;
  companyRecordComplete: boolean;
  trial: {
    status: "eligible" | "active" | "expired" | "used" | "exempt";
    startedAt: string | null;
    endsAt: string | null;
    daysRemaining: number;
  };
  projects: BillingProject[];
  unassignedAddons: { tier: ProjectTier; purchasedAt: string }[];
  tierPrices: Record<ProjectTier, { yearlyTotal: number; actionsPerMonth: number }>;
  prices: {
    annual: { yearlyTotal: number };
    quarterly: { perQuarter: number; yearlyTotal: number };
  };
};

type Invoice = {
  id: string;
  number: string | null;
  created: string;
  amountDuePence: number;
  status: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

function pounds(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
  })}`;
}

const PLAN_LABELS: Record<string, string> = {
  inhouse: "In-House",
  agency: "Agency/Partner",
};

const TIER_LABELS: Record<ProjectTier, string> = {
  standard: "Standard",
  premium: "Premium",
  max: "Max",
};

const TIER_ORDER: ProjectTier[] = ["standard", "premium", "max"];

const STATUS_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  active: { text: "Active", color: "#166534", bg: "#DCFCE7" },
  past_due: { text: "Payment overdue", color: "#92400E", bg: "#FEF3C7" },
  cancelled: { text: "Cancelled", color: "#991B1B", bg: "#FEE2E2" },
};

export function SubscriptionCard({ checkoutResult }: { checkoutResult?: "success" | "cancelled" | null }) {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [frequency, setFrequency] = useState<"annual" | "quarterly">("annual");
  const [starting, setStarting] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/platform/billing/subscription`, { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as SubscriptionInfo;
        if (!cancelled) setInfo(json);
      } catch {
        /* card shows a fallback message */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [checkoutResult, refreshTick]);

  useEffect(() => {
    const refresh = () => setRefreshTick((tick) => tick + 1);
    window.addEventListener("aio:company-billing-saved", refresh);
    return () => window.removeEventListener("aio:company-billing-saved", refresh);
  }, []);

  async function startCheckout() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/api/platform/billing/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not start checkout. Please try again.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  async function startTrial() {
    if (!window.confirm("Start your one-time 60-day beta trial now? No card is required, and the trial cannot be restarted.")) return;
    setStartingTrial(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/api/platform/billing/trial`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start the beta trial.");
        return;
      }
      setRefreshTick((tick) => tick + 1);
      window.dispatchEvent(new Event("aio:beta-trial-changed"));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStartingTrial(false);
    }
  }

  if (!loaded) return null;
  if (!info) return null;

  const planLabel = PLAN_LABELS[info.plan ?? info.applicablePlan] ?? "";
  const trial = info.trial ?? { status: "eligible" as const, startedAt: null, endsAt: null, daysRemaining: 0 };
  const subscribed = info.status !== "none";
  const status = STATUS_LABELS[info.status];
  const renewal = info.currentPeriodEnd
    ? new Date(info.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <>
      <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
        <h2 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Subscription</h2>

        {checkoutResult === "success" && (
          <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: "#DCFCE7", color: "#166534" }}>
            Payment received. Activation can take a few seconds - refresh shortly if you don't see the change yet.
          </p>
        )}
        {checkoutResult === "cancelled" && (
          <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: vars.g50, color: vars.g600 }}>
            Checkout was cancelled - no payment was taken.
          </p>
        )}

        {trial.status === "eligible" && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "#FBE3ED55", border: `1px solid ${accent}55` }}>
            <p className="text-[14px] font-bold mb-1" style={{ color: ink }}>Try AIO Fusion free for 60 days</p>
            <p className="text-[13px] mb-3" style={{ color: vars.g600 }}>
              No card required. Your one-time trial starts when you confirm and includes two project workspaces.
            </p>
            <button
              type="button"
              onClick={startTrial}
              disabled={startingTrial}
              className="px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
              style={{ background: accent }}
            >
              {startingTrial ? "Starting trial..." : "Start free beta trial"}
            </button>
          </div>
        )}

        {trial.status === "active" && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
            <p className="text-[14px] font-bold" style={{ color: "#166534" }}>
              {trial.daysRemaining <= 1
                ? "Beta trial ends today"
                : `Beta trial active - ${trial.daysRemaining} days remaining`}
            </p>
            <p className="text-[13px] mt-1" style={{ color: "#166534" }}>
              Choose a plan below before the trial ends to keep paid features available.
            </p>
          </div>
        )}

        {trial.status === "expired" && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <p className="text-[14px] font-bold" style={{ color: "#991B1B" }}>Your beta trial has ended</p>
            <p className="text-[13px] mt-1" style={{ color: "#991B1B" }}>
              Your account and existing work remain available. Choose a plan below to continue using paid features and project capacity.
            </p>
          </div>
        )}

        {subscribed ? (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[14px] font-semibold" style={{ color: ink }}>
                {planLabel} plan{info.frequency ? ` - billed ${info.frequency === "annual" ? "annually" : "quarterly"}` : ""}
              </span>
              {status && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: status.color, background: status.bg }}>
                  {status.text}
                </span>
              )}
            </div>
            <p className="text-[13px]" style={{ color: vars.g500 }}>
              {info.includedProjects} Premium project{info.includedProjects === 1 ? "" : "s"} included.
              {renewal ? ` Next renewal: ${renewal}.` : ""}
            </p>
            {info.entitled && (
              <p className="text-[13px] mt-1" style={{ color: vars.g500 }}>
                Projects: <strong style={{ color: ink }}>{info.projectsUsed} of {info.projectAllowance}</strong> in use
                {info.unassignedAddons.length > 0 && (
                  <> - {info.unassignedAddons.length} purchased project slot{info.unassignedAddons.length === 1 ? "" : "s"} ({info.unassignedAddons.map((a) => TIER_LABELS[a.tier]).join(", ")}) waiting for a new project</>
                )}
                .
              </p>
            )}
            {info.status === "past_due" && (
              <p className="text-[13px] mt-2" style={{ color: "#92400E" }}>
                Your last payment did not go through. We'll retry automatically - please update your card details below to avoid interruption.
              </p>
            )}
            {info.latestInvoiceUrl && (
              <p className="text-[13px] mt-1">
                <a
                  href={info.latestInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline underline-offset-2"
                  style={{ color: accent }}
                >
                  View your latest invoice
                </a>
              </p>
            )}
            {info.portalAvailable && <PortalButtons />}
            {info.status === "cancelled" && (
              <div className="mt-3">
                <p className="text-[13px] mb-3" style={{ color: vars.g500 }}>
                  Your subscription has been cancelled. You can restart it below.
                </p>
                <RestartChooser info={info} frequency={frequency} setFrequency={setFrequency} starting={starting} onStart={startCheckout} error={error} />
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>
              {trial.status === "active" ? "Subscribe when you are ready to continue after the trial." : `Subscribe to the ${planLabel} plan.`} {info.includedProjects} Premium project{info.includedProjects === 1 ? "" : "s"} included. Prices exclude VAT - tax is calculated at checkout based on your billing country, and business customers can enter a VAT number there.
            </p>
            <RestartChooser info={info} frequency={frequency} setFrequency={setFrequency} starting={starting} onStart={startCheckout} error={error} />
          </div>
        )}
      </div>

      {info.entitled && (
        <>
          <AddProjectCard info={info} />
          <ChangeTierCard info={info} onChanged={() => setRefreshTick((t) => t + 1)} />
        </>
      )}
      {subscribed && <InvoicesCard />}
    </>
  );
}

// --- Stripe Customer Portal buttons ------------------------------------------

function PortalButtons() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/api/platform/billing/portal`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not open the billing portal.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openPortal}
          disabled={busy}
          className="px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-80 disabled:opacity-50"
          style={{ color: ink, border: `1.5px solid ${vars.g300}`, background: "white" }}
        >
          {busy ? "Opening..." : "Update payment method"}
        </button>
        <button
          type="button"
          onClick={openPortal}
          disabled={busy}
          className="px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] transition-all hover:opacity-80 disabled:opacity-50"
          style={{ color: "#991B1B", border: "1.5px solid #FECACA", background: "white" }}
        >
          Cancel subscription
        </button>
        {error && <span className="text-[13px]" style={{ color: "#991B1B" }}>{error}</span>}
      </div>
      <p className="text-[11px] mt-2" style={{ color: vars.g400 }}>
        Both open your secure Stripe billing portal, where you can update your card or cancel at the end of the billing period.
      </p>
    </div>
  );
}

// --- Add a project -------------------------------------------------------------

function AddProjectCard({ info }: { info: SubscriptionInfo }) {
  const [tier, setTier] = useState<ProjectTier>("premium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/api/platform/billing/project-checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not start checkout. Please try again.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
       <h2 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Add a project workspace</h2>
      <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>
         Add one independent project workspace for another brand, client, or programme. Billed annually, excl. VAT (added at checkout). Once paid, your next new project uses the tier you choose here. This adds a separate workspace, not extra runtime capacity inside an existing project.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-2xl">
        {TIER_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTier(t)}
            className="rounded-xl p-4 text-left transition-all"
            style={{
              border: tier === t ? `2px solid ${accent}` : `1.5px solid ${vars.g200}`,
              background: tier === t ? "#FBE3ED22" : "white",
            }}
          >
            <span className="text-[13px] font-bold block" style={{ color: ink }}>{TIER_LABELS[t]}</span>
            <span className="text-[16px] font-bold block" style={{ color: ink }}>{pounds(info.tierPrices[t].yearlyTotal)}/yr</span>
            <span className="text-[12px]" style={{ color: vars.g500 }}>{info.tierPrices[t].actionsPerMonth} actions/month</span>
          </button>
        ))}
      </div>
      {info.checkoutAvailable && !info.companyRecordComplete && (
        <p className="text-[13px] mb-3" style={{ color: "#92400E" }}>
          Save your company and billing information before adding another project.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={buy}
          disabled={busy || !info.checkoutAvailable || !info.companyRecordComplete}
          className="px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? "Starting checkout..." : "Continue to payment"}
        </button>
        {error && <span className="text-[13px]" style={{ color: "#991B1B" }}>{error}</span>}
      </div>
    </div>
  );
}

// --- Change a project's tier -----------------------------------------------------

function ChangeTierCard({ info, onChanged }: { info: SubscriptionInfo; onChanged: () => void }) {
  const [projectId, setProjectId] = useState("");
  const [tier, setTier] = useState<ProjectTier | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (info.projects.length === 0) return null;

  const selected = info.projects.find((p) => p.id === projectId) ?? null;
  // Included projects (no purchased add-on) are upgraded by buying an add-on
  // tier for them; add-on projects change tier on their existing subscription.
  const selectedIsAddon = !!selected?.isAddon;
  const currentTier: ProjectTier = (selected?.tier ?? "premium") as ProjectTier;
  const isUpgrade = tier !== "" && TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(currentTier);

  async function submit() {
    if (!selected || tier === "") return;
    setBusy(true);
    setMessage(null);
    try {
      if (selectedIsAddon) {
        const res = await fetch(`${apiBase()}/api/platform/billing/project-tier`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selected.id, tier }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessage({ kind: "error", text: json.error ?? "Could not change the tier." });
          return;
        }
        setMessage({ kind: "ok", text: json.message ?? "Tier updated." });
        onChanged();
      } else {
        // Included project: purchase an add-on tier attached to this project.
        const res = await fetch(`${apiBase()}/api/platform/billing/project-checkout`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selected.id, tier }),
        });
        const json = await res.json();
        if (!res.ok || !json.url) {
          setMessage({ kind: "error", text: json.error ?? "Could not start checkout." });
          return;
        }
        window.location.href = json.url;
      }
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <h2 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Change a project's tier</h2>
      <p className="text-[13px] mb-4" style={{ color: vars.g500 }}>
        Upgrades apply immediately (the prorated difference is charged to your card). Downgrades take effect at your next renewal.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 max-w-2xl">
        <div className="md:col-span-6">
          <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>Project</label>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setTier(""); setMessage(null); }}
            className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2"
            style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent, background: "white" }}
          >
            <option value="">Choose a project...</option>
            {info.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id} - {p.isAddon ? TIER_LABELS[(p.tier ?? "premium") as ProjectTier] : "Premium (included)"}
                {p.pendingTier ? ` (changing to ${TIER_LABELS[p.pendingTier]} at renewal)` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-6">
          <label className="text-[11px] font-bold uppercase tracking-[0.18em] block mb-1.5" style={{ color: ink }}>New tier</label>
          <select
            value={tier}
            onChange={(e) => { setTier(e.target.value as ProjectTier | ""); setMessage(null); }}
            disabled={!selected}
            className="w-full px-3 py-2.5 rounded-lg border text-[14px] focus:outline-none focus:ring-2 disabled:opacity-50"
            style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent, background: "white" }}
          >
            <option value="">Choose a tier...</option>
            {/* Add-on projects can move to any other tier; included projects
                (already Premium) can only be upgraded to Max. */}
            {TIER_ORDER.filter((t) =>
              selectedIsAddon ? t !== currentTier : TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf("premium"),
            ).map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]} - {pounds(info.tierPrices[t].yearlyTotal)}/yr, {info.tierPrices[t].actionsPerMonth} actions/month
                </option>
              ))}
          </select>
        </div>
      </div>
      {selected && !selectedIsAddon && (
        <p className="text-[12px] mt-2" style={{ color: vars.g500 }}>
          This project is included in your plan at Premium. Upgrading it adds a paid project tier ({tier !== "" ? `${pounds(info.tierPrices[tier].yearlyTotal)}/yr` : "billed annually"}) on top of your plan.
        </p>
      )}
      {selected && !selectedIsAddon && info.checkoutAvailable && !info.companyRecordComplete && (
        <p className="text-[12px] mt-2" style={{ color: "#92400E" }}>
          Save your company and billing information before continuing to payment.
        </p>
      )}
      {selected && selectedIsAddon && tier !== "" && !isUpgrade && (
        <p className="text-[12px] mt-2" style={{ color: vars.g500 }}>
          This is a downgrade - the lower price and allowance apply from your next renewal.
        </p>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !selected || tier === "" || (!selectedIsAddon && (!info.checkoutAvailable || !info.companyRecordComplete))}
          className="px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? "Working..." : selectedIsAddon ? "Change tier" : "Continue to payment"}
        </button>
        {message && (
          <span className="text-[13px]" style={{ color: message.kind === "ok" ? "#166534" : "#991B1B" }}>{message.text}</span>
        )}
      </div>
    </div>
  );
}

// --- Past invoices ---------------------------------------------------------------

function InvoicesCard() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/platform/billing/invoices`, { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as { invoices?: Invoice[] };
        if (!cancelled) setInvoices(json.invoices ?? []);
      } catch {
        /* section simply stays hidden */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!invoices || invoices.length === 0) return null;

  return (
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <h2 className="text-[16px] font-bold mb-3" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Invoices</h2>
      <div className="divide-y" style={{ borderColor: vars.g100 }}>
        {invoices.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <span className="text-[13px] font-semibold" style={{ color: ink }}>
                {inv.number ?? inv.id}
              </span>
              <span className="text-[12px] ml-3" style={{ color: vars.g500 }}>
                {new Date(inv.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold" style={{ color: ink }}>{pounds(inv.amountDuePence)}</span>
              {inv.status && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{
                  color: inv.status === "paid" ? "#166534" : vars.g600,
                  background: inv.status === "paid" ? "#DCFCE7" : vars.g100,
                }}>
                  {inv.status === "paid" ? "Paid" : inv.status.replace(/_/g, " ")}
                </span>
              )}
              {(inv.invoicePdf || inv.hostedInvoiceUrl) && (
                <a
                  href={inv.invoicePdf ?? inv.hostedInvoiceUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-bold underline"
                  style={{ color: accent }}
                >
                  PDF
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RestartChooser({
  info,
  frequency,
  setFrequency,
  starting,
  onStart,
  error,
}: {
  info: SubscriptionInfo;
  frequency: "annual" | "quarterly";
  setFrequency: (f: "annual" | "quarterly") => void;
  starting: boolean;
  onStart: () => void;
  error: string | null;
}) {
  const options: { key: "annual" | "quarterly"; title: string; detail: string }[] = [
    {
      key: "annual",
      title: `${pounds(info.prices.annual.yearlyTotal)}/yr`,
      detail: "Billed annually",
    },
    {
      key: "quarterly",
      title: `${pounds(info.prices.quarterly.perQuarter)}/quarter`,
      detail: `Billed quarterly - ${pounds(info.prices.quarterly.yearlyTotal)}/yr`,
    },
  ];
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 max-w-xl">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setFrequency(opt.key)}
            className="rounded-xl p-4 text-left transition-all"
            style={{
              border: frequency === opt.key ? `2px solid ${accent}` : `1.5px solid ${vars.g200}`,
              background: frequency === opt.key ? "#FBE3ED22" : "white",
            }}
          >
            <span className="text-[16px] font-bold block" style={{ color: ink }}>{opt.title}</span>
            <span className="text-[12px]" style={{ color: vars.g500 }}>{opt.detail}</span>
          </button>
        ))}
      </div>
      {!info.checkoutAvailable && (
        <p className="text-[13px] mb-3" style={{ color: vars.g500 }}>
          Online checkout isn't available right now - contact info@aiofusion.ai to subscribe.
        </p>
      )}
      {info.checkoutAvailable && !info.companyRecordComplete && (
        <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ color: "#92400E", background: "#FEF3C7" }}>
          Complete and save your company and billing information below before continuing to payment.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={starting || !info.checkoutAvailable || !info.companyRecordComplete}
          className="px-5 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: accent }}
        >
          {starting ? "Starting checkout..." : "Continue to payment"}
        </button>
        {error && <span className="text-[13px]" style={{ color: "#991B1B" }}>{error}</span>}
      </div>
      <p className="text-[11px] mt-3" style={{ color: vars.g400 }}>
        Payments are processed securely by Stripe. During Beta, payments run in test mode.
      </p>
    </div>
  );
}

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

export type SubscriptionActivationSummary = {
  plan: SubscriptionInfo["plan"];
  frequency: SubscriptionInfo["frequency"];
  currentPeriodEnd: string | null;
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
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<string, { text: string; color: string; bg: string }> = {
  active: { text: "Active", color: "#166534", bg: "#DCFCE7" },
  past_due: { text: "Payment overdue", color: "#92400E", bg: "#FEF3C7" },
  cancelled: { text: "Cancelled", color: "#991B1B", bg: "#FEE2E2" },
};

/**
 * Returns a stable, user-facing date for Stripe's current period end.
 *
 * Stripe normally sends an ISO timestamp, but this value is account data and
 * can be null (or malformed while an older record is being migrated). Keep
 * those cases out of the render rather than displaying "Invalid Date".
 */
export function formatSubscriptionEnd(currentPeriodEnd: string | null | undefined): string | null {
  if (!currentPeriodEnd) return null;
  const date = new Date(currentPeriodEnd);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Counts the remaining billing time in whole days.
 *
 * A partial day still counts as a day (the same convention used by Stripe's
 * customer-facing dates), while the exact renewal boundary and past dates are
 * zero. Keeping this calculation timestamp-based avoids the off-by-one error
 * caused by comparing local calendar dates around DST changes.
 */
export function daysUntilRenewal(
  currentPeriodEnd: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!currentPeriodEnd) return null;
  const end = new Date(currentPeriodEnd);
  const nowTime = now.getTime();
  const endTime = end.getTime();
  if (!Number.isFinite(endTime) || !Number.isFinite(nowTime)) return null;
  return Math.max(0, Math.ceil((endTime - nowTime) / DAY_IN_MS));
}

function RenewalDetails({
  status,
  currentPeriodEnd,
}: {
  status: SubscriptionInfo["status"];
  currentPeriodEnd: string | null;
}) {
  // A cancelled subscription remains paid through its current period end, but
  // it has no upcoming renewal. Do not suggest that it will renew.
  const subscribed = status === "active" || status === "past_due" || status === "cancelled";
  if (!subscribed) return null;

  const renewal = formatSubscriptionEnd(currentPeriodEnd);
  if (!renewal) return null;

  const days = daysUntilRenewal(currentPeriodEnd);
  return (
    <div className="mt-2 space-y-0.5" data-testid="subscription-renewal-details">
      <p className="aio-type-supporting" style={{ color: vars.g500 }}>
        Paid until <strong style={{ color: ink }}>{renewal}</strong>.
      </p>
      {status === "cancelled" ? (
        <p className="aio-type-supporting" style={{ color: "#991B1B" }}>
          Your subscription is cancelled and will not renew.
        </p>
      ) : days !== null ? (
        <p className="aio-type-supporting" style={{ color: vars.g500 }}>
          Next renewal in <strong style={{ color: ink }}>{days} {days === 1 ? "day" : "days"}</strong>.
        </p>
      ) : null}
    </div>
  );
}

function PaymentSuccessState({
  info,
}: {
  info: SubscriptionInfo;
}) {
  const renewal = formatSubscriptionEnd(info.currentPeriodEnd);

  return (
    <div
      className="mb-5 rounded-xl p-5"
      data-testid="payment-success-state"
      role="status"
      aria-live="polite"
      style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}
    >
      <h3 className="aio-type-card-title" style={{ color: "#166534" }}>
        Thank you for signing up to AIO Fusion
      </h3>
      <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
        Your payment was successful and your subscription is now active.
      </p>
      {renewal && (
        <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
          You are paid until <strong>{renewal}</strong>.
        </p>
      )}
    </div>
  );
}

export function SubscriptionCard({
  checkoutResult,
  checkoutSessionId,
  onboarding = false,
  onAccessActivated,
}: {
  checkoutResult?: "success" | "cancelled" | null;
  checkoutSessionId?: string | null;
  onboarding?: boolean;
  onAccessActivated?: (summary: SubscriptionActivationSummary) => void;
}) {
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [frequency, setFrequency] = useState<"annual" | "quarterly">("annual");
  const [starting, setStarting] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [checkoutConfirmed, setCheckoutConfirmed] = useState(false);
  const paidSubscription = info?.status === "active" || info?.status === "past_due";

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

  useEffect(() => {
    const accessConfirmed = checkoutResult === "success"
      ? checkoutConfirmed && paidSubscription
      : info?.entitled;
    if (accessConfirmed && onboarding && info) {
      onAccessActivated?.({
        plan: info.plan,
        frequency: info.frequency,
        currentPeriodEnd: info.currentPeriodEnd,
      });
    }
  }, [
    checkoutConfirmed,
    checkoutResult,
    info?.currentPeriodEnd,
    info?.entitled,
    info?.frequency,
    info?.plan,
    onboarding,
    onAccessActivated,
    paidSubscription,
  ]);

  useEffect(() => {
    if (!onboarding || checkoutResult !== "success" || checkoutConfirmed) return;
    if (!checkoutSessionId) {
      setConfirmationError("The payment return link is incomplete. Use the retry button below or contact support if payment was taken.");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    const reconcile = async () => {
      if (cancelled) return;
      setConfirming(true);
      setConfirmationError(null);
      try {
        const res = await fetch(`${apiBase()}/api/platform/billing/reconcile-checkout`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: checkoutSessionId }),
        });
        const json = await res.json().catch(() => ({})) as { status?: string; error?: string };
        if (res.ok && json.status === "confirmed") {
          setCheckoutConfirmed(true);
          setRefreshTick((tick) => tick + 1);
          return;
        }
        if (res.status === 202 && attempts < 20) {
          attempts += 1;
          timer = window.setTimeout(reconcile, 1500);
          return;
        }
        setConfirmationError(json.error ?? "Payment confirmation is taking longer than expected. Try again safely below.");
      } catch {
        setConfirmationError("Could not connect to confirm payment. Check your connection and try again.");
      } finally {
        if (!cancelled) setConfirming(false);
      }
    };
    void reconcile();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [checkoutConfirmed, checkoutResult, checkoutSessionId, onboarding, refreshTick]);

  async function startCheckout() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase()}/api/platform/billing/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency, ...(onboarding ? { onboarding: true } : {}) }),
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

  return (
    <>
      <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
        <h2 className="aio-type-card-title mb-1" style={{ color: ink }}>Subscription</h2>

        {checkoutResult === "success" && checkoutConfirmed && paidSubscription && (
          <PaymentSuccessState info={info} />
        )}
        {checkoutResult === "success" && (!checkoutConfirmed || !paidSubscription) && (
          <div className="mb-5" data-testid="payment-confirmation-pending">
            <p className="aio-type-supporting" style={{ color: confirmationError ? "#991B1B" : vars.g600 }}>
              {confirmationError ?? (confirming ? "Securely confirming your completed Stripe checkout..." : "Confirming payment...")}
            </p>
            {confirmationError && (
              <button
                type="button"
                className="aio-button aio-button--outline aio-button--compact mt-3 rounded-full uppercase tracking-[0.12em]"
                style={{ color: ink, border: `1.5px solid ${vars.g300}`, background: "white" }}
                onClick={() => setRefreshTick((tick) => tick + 1)}
              >
                Try payment confirmation again
              </button>
            )}
          </div>
        )}
        {checkoutResult === "cancelled" && (
          <p className="aio-type-supporting mb-3 px-3 py-2 rounded-lg" style={{ background: vars.g50, color: vars.g600 }}>
            Checkout was cancelled - no payment was taken.
          </p>
        )}

        {!onboarding && trial.status === "eligible" && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "#FBE3ED55", border: `1px solid ${accent}55` }}>
            <p className="aio-type-card-title mb-1" style={{ color: ink }}>Try AIO Fusion free for 60 days</p>
            <p className="aio-type-body mb-3" style={{ color: vars.g600 }}>
              No card required. Your one-time trial starts when you confirm and includes two project workspaces.
            </p>
            <button
              type="button"
              onClick={startTrial}
              disabled={startingTrial}
              className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
              style={{ background: accent }}
            >
              {startingTrial ? "Starting trial..." : "Start free beta trial"}
            </button>
          </div>
        )}

        {trial.status === "active" && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}>
            <p className="aio-type-card-title" style={{ color: "#166534" }}>
              {trial.daysRemaining <= 1
                ? "Beta trial ends today"
                : `Beta trial active - ${trial.daysRemaining} days remaining`}
            </p>
            <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
              Choose a plan below before the trial ends to keep paid features available.
            </p>
          </div>
        )}

        {trial.status === "expired" && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <p className="aio-type-card-title" style={{ color: "#991B1B" }}>Your beta trial has ended</p>
            <p className="aio-type-supporting mt-1" style={{ color: "#991B1B" }}>
              Your account and existing work remain available. Choose a plan below to continue using paid features and project capacity.
            </p>
          </div>
        )}

        {subscribed ? (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="aio-type-label" style={{ color: ink }}>
                {planLabel} plan{info.frequency ? ` - billed ${info.frequency === "annual" ? "annually" : "quarterly"}` : ""}
              </span>
              {status && (
                <span className="aio-type-meta font-bold px-2.5 py-1 rounded-full" style={{ color: status.color, background: status.bg }}>
                  {status.text}
                </span>
              )}
            </div>
            <p className="aio-type-supporting" style={{ color: vars.g500 }}>
              {info.includedProjects} Premium project{info.includedProjects === 1 ? "" : "s"} included.
            </p>
            <RenewalDetails status={info.status} currentPeriodEnd={info.currentPeriodEnd} />
            {info.entitled && (
              <p className="aio-type-supporting mt-1" style={{ color: vars.g500 }}>
                Projects: <strong style={{ color: ink }}>{info.projectsUsed} of {info.projectAllowance}</strong> in use
                {info.unassignedAddons.length > 0 && (
                  <> - {info.unassignedAddons.length} purchased project slot{info.unassignedAddons.length === 1 ? "" : "s"} ({info.unassignedAddons.map((a) => TIER_LABELS[a.tier]).join(", ")}) waiting for a new project</>
                )}
                .
              </p>
            )}
            {info.status === "past_due" && (
              <p className="aio-type-supporting mt-2" style={{ color: "#92400E" }}>
                Your last payment did not go through. We'll retry automatically - please update your card details below to avoid interruption.
              </p>
            )}
            {info.latestInvoiceUrl && (
              <p className="aio-type-supporting mt-1">
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
                <p className="aio-type-supporting mb-3" style={{ color: vars.g500 }}>
                  Your subscription has been cancelled. You can restart it below.
                </p>
                <RestartChooser info={info} frequency={frequency} setFrequency={setFrequency} starting={starting} onStart={startCheckout} error={error} />
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="aio-type-body mb-4" style={{ color: vars.g500 }}>
              {trial.status === "active" ? "Subscribe when you are ready to continue after the trial." : `Subscribe to the ${planLabel} plan.`} {info.includedProjects} Premium project{info.includedProjects === 1 ? "" : "s"} included. Prices exclude VAT - tax is calculated at checkout based on your billing country, and business customers can enter a VAT number there.
            </p>
            <RestartChooser info={info} frequency={frequency} setFrequency={setFrequency} starting={starting} onStart={startCheckout} error={error} />
          </div>
        )}
      </div>

      {info.entitled && TIER_ORDER.every((tier) => Boolean(info.tierPrices?.[tier])) && (
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
          className="aio-button aio-button--outline aio-button--compact rounded-full uppercase tracking-[0.12em]"
          style={{ color: ink, border: `1.5px solid ${vars.g300}`, background: "white" }}
        >
          {busy ? "Opening..." : "Update payment method"}
        </button>
        <button
          type="button"
          onClick={openPortal}
          disabled={busy}
          className="aio-button aio-button--outline aio-button--compact rounded-full uppercase tracking-[0.12em]"
          style={{ color: "#991B1B", border: "1.5px solid #FECACA", background: "white" }}
        >
          Cancel subscription
        </button>
        {error && <span className="aio-type-supporting" style={{ color: "#991B1B" }}>{error}</span>}
      </div>
      <p className="aio-type-meta mt-2" style={{ color: vars.g400 }}>
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
       <h2 className="aio-type-card-title mb-1" style={{ color: ink }}>Add a project workspace</h2>
      <p className="aio-type-body mb-4" style={{ color: vars.g500 }}>
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
            <span className="aio-type-label block" style={{ color: ink }}>{TIER_LABELS[t]}</span>
            <span className="aio-type-card-title block" style={{ color: ink }}>{pounds(info.tierPrices[t].yearlyTotal)}/yr</span>
            <span className="aio-type-meta" style={{ color: vars.g500 }}>{info.tierPrices[t].actionsPerMonth} actions/month</span>
          </button>
        ))}
      </div>
      {info.checkoutAvailable && !info.companyRecordComplete && (
        <p className="aio-type-supporting mb-3" style={{ color: "#92400E" }}>
          Save your company and billing information before adding another project.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={buy}
          disabled={busy || !info.checkoutAvailable || !info.companyRecordComplete}
          className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
          style={{ background: accent }}
        >
          {busy ? "Starting checkout..." : "Continue to payment"}
        </button>
        {error && <span className="aio-type-supporting" style={{ color: "#991B1B" }}>{error}</span>}
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
      <h2 className="aio-type-card-title mb-1" style={{ color: ink }}>Change a project's tier</h2>
      <p className="aio-type-body mb-4" style={{ color: vars.g500 }}>
        Upgrades apply immediately (the prorated difference is charged to your card). Downgrades take effect at your next renewal.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 max-w-2xl">
        <div className="md:col-span-6">
          <label className="aio-type-eyebrow block mb-1.5" style={{ color: ink }}>Project</label>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setTier(""); setMessage(null); }}
            className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2"
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
          <label className="aio-type-eyebrow block mb-1.5" style={{ color: ink }}>New tier</label>
          <select
            value={tier}
            onChange={(e) => { setTier(e.target.value as ProjectTier | ""); setMessage(null); }}
            disabled={!selected}
            className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 disabled:opacity-50"
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
        <p className="aio-type-meta mt-2" style={{ color: vars.g500 }}>
          This project is included in your plan at Premium. Upgrading it adds a paid project tier ({tier !== "" ? `${pounds(info.tierPrices[tier].yearlyTotal)}/yr` : "billed annually"}) on top of your plan.
        </p>
      )}
      {selected && !selectedIsAddon && info.checkoutAvailable && !info.companyRecordComplete && (
        <p className="aio-type-meta mt-2" style={{ color: "#92400E" }}>
          Save your company and billing information before continuing to payment.
        </p>
      )}
      {selected && selectedIsAddon && tier !== "" && !isUpgrade && (
        <p className="aio-type-meta mt-2" style={{ color: vars.g500 }}>
          This is a downgrade - the lower price and allowance apply from your next renewal.
        </p>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !selected || tier === "" || (!selectedIsAddon && (!info.checkoutAvailable || !info.companyRecordComplete))}
          className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
          style={{ background: accent }}
        >
          {busy ? "Working..." : selectedIsAddon ? "Change tier" : "Continue to payment"}
        </button>
        {message && (
          <span className="aio-type-supporting" style={{ color: message.kind === "ok" ? "#166534" : "#991B1B" }}>{message.text}</span>
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
      <h2 className="aio-type-card-title mb-3" style={{ color: ink }}>Invoices</h2>
      <div className="divide-y" style={{ borderColor: vars.g100 }}>
        {invoices.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <span className="aio-type-label" style={{ color: ink }}>
                {inv.number ?? inv.id}
              </span>
              <span className="aio-type-meta ml-3" style={{ color: vars.g500 }}>
                {new Date(inv.created).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="aio-type-label" style={{ color: ink }}>{pounds(inv.amountDuePence)}</span>
              {inv.status && (
                <span className="aio-type-meta font-bold px-2 py-0.5 rounded-full" style={{
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
                  className="aio-button aio-button--text aio-button--compact underline"
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
            <span className="aio-type-card-title block" style={{ color: ink }}>{opt.title}</span>
            <span className="aio-type-meta" style={{ color: vars.g500 }}>{opt.detail}</span>
          </button>
        ))}
      </div>
      {!info.checkoutAvailable && (
        <p className="aio-type-supporting mb-3" style={{ color: vars.g500 }}>
          Online checkout isn't available right now - contact info@aiofusion.ai to subscribe.
        </p>
      )}
      {info.checkoutAvailable && !info.companyRecordComplete && (
        <p className="aio-type-supporting mb-3 px-3 py-2 rounded-lg" style={{ color: "#92400E", background: "#FEF3C7" }}>
          Complete and save your company and billing information below before continuing to payment.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={starting || !info.checkoutAvailable || !info.companyRecordComplete}
          className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
          style={{ background: accent }}
        >
          {starting ? "Starting checkout..." : "Continue to payment"}
        </button>
        {error && <span className="aio-type-supporting" style={{ color: "#991B1B" }}>{error}</span>}
      </div>
      <p className="aio-type-meta mt-3" style={{ color: vars.g400 }}>
        Payments are processed securely by Stripe. During Beta, payments run in test mode.
      </p>
    </div>
  );
}

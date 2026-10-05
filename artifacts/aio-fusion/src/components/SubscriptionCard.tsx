import { useEffect, useId, useState } from "react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/apiHelpers";
import { CheckoutReturnLoading } from "./CheckoutReturnLoading";
import { BillingInformationPrompt, focusBillingSection } from "./BillingInformationPrompt";
import { billingMoney, useTierProration } from "../hooks/useTierProration";
import type { PackageCapacity } from "../lib/billingAllowance";

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

type ConfirmedAddon = {
  tier: ProjectTier;
  projectId: string | null;
  assigned: boolean;
};

type CheckoutConfirmationKind = "main-subscription" | "project-addon";

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
  packageCapacity?: PackageCapacity;
  /** Temporary compatibility with pre-contract responses. */
  capacity?: PackageCapacity;
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

function monthlyEquivalent(pencePerPeriod: number, months: number): string {
  return `£${Math.round(pencePerPeriod / (months * 100)).toLocaleString("en-GB")}`;
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

function isProjectTier(value: unknown): value is ProjectTier {
  return value === "standard" || value === "premium" || value === "max";
}

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
  verifiedCheckout,
}: {
  info: SubscriptionInfo;
  verifiedCheckout: boolean;
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
        {verifiedCheckout ? "Thank you for signing up to AIO Fusion" : "Your subscription is active"}
      </h3>
      <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
        {verifiedCheckout
          ? "Your payment was successful and your subscription is now active."
          : "Your active subscription has been verified by AIO Fusion."}
      </p>
      {renewal && (
        <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
          You are paid until <strong>{renewal}</strong>.
        </p>
      )}
    </div>
  );
}

function ProjectAddonSuccessState({ addon, kind }: { addon: ConfirmedAddon; kind: "agency" | "client" }) {
  const tierLabel = TIER_LABELS[addon.tier];

  return (
    <div
      className="mb-5 rounded-xl p-5"
      data-testid="project-addon-success-state"
      role="status"
      aria-live="polite"
      style={{ background: "#ECFDF5", border: "1px solid #A7F3D0" }}
    >
      <h3 className="aio-type-card-title" style={{ color: "#166534" }}>
        {kind === "agency" ? "Additional client/project package purchased" : "Additional project workspace purchased"}
      </h3>
      <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
        Tier: <strong>{tierLabel}</strong>
      </p>
      {addon.assigned ? (
        <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
          Your <strong>{tierLabel}</strong> add-on is linked to your project.
        </p>
      ) : (
        <>
          <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
            {kind === "agency"
              ? "One managed-client and project package is now available."
              : "One extra workspace is now available."}
          </p>
          <p className="aio-type-supporting mt-1" style={{ color: "#166534" }}>
            {kind === "agency" ? "Your next managed client can use" : "Your next new project will use"} <strong>{tierLabel}</strong>.
          </p>
        </>
      )}
    </div>
  );
}

export function SubscriptionCard({
  checkoutResult,
  checkoutSessionId,
  onboarding = false,
  onAccessActivated,
  onCheckoutStartingChange,
  confirmationOnly = false,
  confirmationLoadingView,
}: {
  checkoutResult?: "success" | "cancelled" | null;
  checkoutSessionId?: string | null;
  onboarding?: boolean;
  onAccessActivated?: (summary: SubscriptionActivationSummary) => void;
  onCheckoutStartingChange?: (starting: boolean) => void;
  /**
   * Keep the checkout reconciliation mounted without rendering the billing
   * card. Guided onboarding uses this while the return page is still being
   * verified, so a successful Stripe return never flashes the billing form.
   */
  confirmationOnly?: boolean;
  confirmationLoadingView?: React.ReactNode;
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
  const [checkoutConfirmationKind, setCheckoutConfirmationKind] = useState<CheckoutConfirmationKind | null>(null);
  const [confirmedAddon, setConfirmedAddon] = useState<ConfirmedAddon | null>(null);
  const [verifiedAfterConfirmation, setVerifiedAfterConfirmation] = useState(false);
  const paidSubscription = info?.status === "active" || info?.status === "past_due";
  const packageCapacity = info?.packageCapacity ?? info?.capacity;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/platform/billing/subscription`, { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as SubscriptionInfo;
        if (!cancelled) {
          setInfo(json);
          if (checkoutConfirmed) setVerifiedAfterConfirmation(true);
        }
      } catch {
        /* card shows a fallback message */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [checkoutConfirmed, checkoutResult, refreshTick]);

  useEffect(() => {
    const refresh = () => setRefreshTick((tick) => tick + 1);
    window.addEventListener("aio:company-billing-saved", refresh);
    return () => window.removeEventListener("aio:company-billing-saved", refresh);
  }, []);

  useEffect(() => {
    const accessConfirmed = checkoutResult === "success"
      ? checkoutConfirmed
        && checkoutConfirmationKind !== "project-addon"
        && verifiedAfterConfirmation
        && info?.status === "active"
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
    checkoutConfirmationKind,
    checkoutResult,
    info?.currentPeriodEnd,
    info?.entitled,
    info?.frequency,
    info?.plan,
    onboarding,
    onAccessActivated,
    paidSubscription,
    verifiedAfterConfirmation,
  ]);

  useEffect(() => {
    // A successful Checkout return can render this card either in the guided
    // onboarding step or immediately afterwards in Account Settings. In both
    // cases, only the server reconciliation response may turn the return flag
    // into a payment acknowledgement. Do not leave Account Settings showing
    // the generic "Confirming payment..." state when the paid onboarding hand-
    // off has already mounted this card.
    // Standard Account Settings checkouts historically return without a
    // session id. Their server-backed subscription response is the source of
    // truth; only onboarding returns with a session id use this explicit
    // checkout reconciliation step.
    if (checkoutResult !== "success" || checkoutConfirmed) return;
    if (!checkoutSessionId) {
      // Guided onboarding cannot safely advance without the session reference.
      // A standard Account Settings return never included one, so let its
      // server-backed subscription state render without a false warning.
      if (onboarding) {
        setConfirmationError("The payment return link is incomplete. Use the retry button below or contact support if payment was taken.");
      }
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
        const json = await res.json().catch(() => ({})) as {
          status?: string;
          error?: string;
          kind?: string;
          addon?: {
            tier?: string;
            projectId?: string | null;
            assigned?: boolean;
          };
        };
        if (res.ok && json.status === "confirmed") {
          if (json.kind === "project-addon") {
            const addon = json.addon;
            const tier = addon?.tier;
            if (
              !addon
              || !isProjectTier(tier)
              || (addon.projectId !== null && typeof addon.projectId !== "string")
              || typeof addon.assigned !== "boolean"
            ) {
              setConfirmationError("Payment confirmation returned incomplete project details. Try payment confirmation again.");
              return;
            }
            setCheckoutConfirmationKind("project-addon");
            setConfirmedAddon({
              tier,
              projectId: addon.projectId,
              assigned: addon.assigned,
            });
          } else if (!json.kind || json.kind === "main-subscription") {
            // Main-subscription was added as an optional response field. Keep
            // accepting the original response shape for existing returns.
            setCheckoutConfirmationKind("main-subscription");
            setConfirmedAddon(null);
          } else {
            setConfirmationError("Payment confirmation returned an unknown purchase type. Try payment confirmation again.");
            return;
          }
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
    onCheckoutStartingChange?.(true);
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
      onCheckoutStartingChange?.(false);
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

  if (confirmationOnly) {
    if (confirmationError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8fafc]">
          <div className="w-full max-w-xl" data-testid="payment-confirmation-pending-page" role="status" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: vars.accent }}>
              Payment confirmation
            </p>
            <h2 className="fo-page-heading text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
              We need to verify your payment
            </h2>
            <p className="fo-page-copy text-base sm:text-lg leading-relaxed text-slate-600">
              {confirmationError}
            </p>
            <button
              type="button"
              className="fo-primary inline-flex items-center justify-center gap-2 rounded-md px-8 py-4 text-white text-sm font-bold uppercase tracking-wider mt-7 transition-all duration-300 hover:brightness-110"
              style={{ background: vars.accent }}
              onClick={() => setRefreshTick((tick) => tick + 1)}
            >
              Try payment confirmation again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8fafc]">
        <div className="w-full max-w-xl" data-testid="payment-confirmation-pending-page">
          {confirmationLoadingView ?? <CheckoutReturnLoading />}
        </div>
      </div>
    );
  }

  if (!loaded) return null;
  if (!info) return null;

  const planLabel = PLAN_LABELS[info.plan ?? info.applicablePlan] ?? "";
  const trial = info.trial ?? { status: "eligible" as const, startedAt: null, endsAt: null, daysRemaining: 0 };
  const subscribed = info.status !== "none";
  const status = STATUS_LABELS[info.status];

  return (
    <>
      <div id="subscription-details" tabIndex={-1} className="rounded-2xl p-6 sm:p-8 mb-6 scroll-mt-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
        <h2 className="aio-type-card-title mb-1" style={{ color: ink }}>Subscription</h2>

        {checkoutResult === "success" && checkoutConfirmationKind !== "project-addon" && paidSubscription && (checkoutConfirmed || !checkoutSessionId) && (
          <PaymentSuccessState info={info} verifiedCheckout={checkoutConfirmed} />
        )}
        {checkoutResult === "success" && checkoutConfirmationKind === "project-addon" && checkoutConfirmed && confirmedAddon && (
          <ProjectAddonSuccessState addon={confirmedAddon} kind={packageCapacity?.kind === "agency" ? "agency" : "client"} />
        )}
        {checkoutResult === "success" && (checkoutSessionId || onboarding) && (
          !checkoutConfirmed
          || (checkoutConfirmationKind !== "project-addon" && !paidSubscription)
        ) && (
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
              No card required. Your one-time trial starts when you confirm and includes {info.applicablePlan === "inhouse" ? "one project in your account" : "two managed clients with one project each"}.
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
              {packageCapacity?.kind === "agency"
                ? `${packageCapacity.included} managed client/project packages included.`
                : `${packageCapacity?.included ?? info.includedProjects} Premium project${(packageCapacity?.included ?? info.includedProjects) === 1 ? "" : "s"} included in this account.`}
            </p>
            <RenewalDetails status={info.status} currentPeriodEnd={info.currentPeriodEnd} />
            {info.entitled && packageCapacity ? (
              <div className="aio-type-supporting mt-2" data-testid="package-capacity-summary" style={{ color: vars.g500 }}>
                <p>
                  <strong style={{ color: ink }}>{packageCapacity.included}</strong> included ·{" "}
                  <strong style={{ color: ink }}>{packageCapacity.purchased}</strong> purchased ·{" "}
                  <strong style={{ color: ink }}>{packageCapacity.reserved}</strong> reserved ·{" "}
                  <strong style={{ color: ink }}>{packageCapacity.used}</strong> projects used ·{" "}
                  <strong style={{ color: ink }}>{packageCapacity.remaining === null ? "Unlimited" : Math.max(0, packageCapacity.remaining)}</strong> remaining ·{" "}
                  <strong style={{ color: ink }}>{packageCapacity.allowance === null ? "Unlimited" : packageCapacity.allowance}</strong> total allowance
                </p>
                {packageCapacity.kind === "agency" && (
                  <p className="mt-1">An empty managed client still reserves its client/project package until it is archived or removed.</p>
                )}
                {packageCapacity.overLimit && (
                  <p className="mt-1" style={{ color: "#92400E" }}>
                    Existing work remains readable, but no new {packageCapacity.kind === "agency" ? "managed clients or projects" : "projects"} can be added while this account is over its package limit.
                  </p>
                )}
                {!packageCapacity.overLimit && (
                  <p className="mt-1" style={{ color: "#166534" }}>Within package allowance.</p>
                )}
              </div>
            ) : info.entitled && (
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
               {trial.status === "active"
                ? "You can continue your beta trial without payment, or start a paid subscription now."
                 : `Subscribe to the ${planLabel} plan. ${packageCapacity
                   ? packageCapacity.kind === "agency"
                     ? `${packageCapacity.included} managed clients with one Premium project each included.`
                     : `${packageCapacity.included} Premium project${packageCapacity.included === 1 ? "" : "s"} in your account included.`
                   : `${info.includedProjects} Premium project${info.includedProjects === 1 ? "" : "s"} included.`}`} Review your total at checkout.
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
      {subscribed && <InvoicesCard key={refreshTick} />}
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
  const paidSubscription = info.status === "active" || info.status === "past_due";
  const [tier, setTier] = useState<ProjectTier>("premium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pricesReady = TIER_ORDER.every((t) => {
    const price = info.tierPrices?.[t];
    return Boolean(
      price
      && Number.isFinite(price.yearlyTotal)
      && Number.isFinite(price.actionsPerMonth),
    );
  });
  const agencyPackage = (info.packageCapacity ?? info.capacity)?.kind === "agency";
  const directClientPackage = (info.packageCapacity ?? info.capacity)?.kind === "client";

  async function buy() {
    if (!paidSubscription || !info.companyRecordComplete || !pricesReady || !info.checkoutAvailable) return;
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
    <div data-testid="add-project-card" className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
       <h2 className="aio-type-card-title mb-1" style={{ color: ink }}>
         {agencyPackage ? "Add a client/project package" : "Add a project workspace"}
       </h2>
      <p className="aio-type-body mb-4" style={{ color: vars.g500 }}>
         {agencyPackage
           ? "Add capacity for one managed client with one independent project workspace. Billed annually. An empty client reserves the purchased package, and its first project uses that same package."
           : directClientPackage
             ? "Add one independent project workspace in this account for another brand, product, or programme. Billed annually. Once paid, your next new project uses the tier you choose here. This does not create another client account."
             : "Add one independent project workspace for another brand, client, or programme. Billed annually. Once paid, your next new project uses the tier you choose here. This adds a separate workspace, not extra runtime capacity inside an existing project."}
      </p>
       {pricesReady ? (
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-2xl">
           {TIER_ORDER.map((t) => (
             <button
               key={t}
               type="button"
                aria-label={`Add a ${TIER_LABELS[t]} ${agencyPackage ? "client/project package" : "project workspace"}`}
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
       ) : (
         <p className="aio-type-supporting mb-4 px-3 py-2 rounded-lg" data-testid="project-tier-prices-unavailable" style={{ color: "#92400E", background: "#FEF3C7" }}>
           Project tier pricing is temporarily unavailable. Adding a project is disabled until pricing is available.
         </p>
       )}
      {info.checkoutAvailable && !info.companyRecordComplete && (
        <BillingInformationPrompt />
      )}
      {!paidSubscription && (
        <div className="aio-type-supporting mb-3" style={{ color: vars.g600 }}>
          <p>Additional workspaces require a paid subscription. Subscribe in the Subscription box first.</p>
          <button type="button" className="aio-button aio-button--text aio-button--compact mt-2" onClick={() => focusBillingSection("subscription-details")}>
            Go to Subscription
          </button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={buy}
           disabled={busy || !paidSubscription || !pricesReady || !info.checkoutAvailable || !info.companyRecordComplete}
          className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
          style={{ background: accent }}
        >
          {busy ? "Starting checkout..." : "Continue to payment"}
        </button>
        {error && <span className="aio-type-supporting" style={{ color: "#991B1B" }}>{error}</span>}
      </div>
      <p className="aio-type-meta mt-3" style={{ color: vars.g500 }}>
        Tier upgrades are charged immediately at the prorated amount shown before confirmation. Downgrades take effect at renewal. Cancelling a package retires its funded project at the end of the paid period; existing work remains available until then.
      </p>
    </div>
  );
}

// --- Change a project's tier -----------------------------------------------------

function ChangeTierCard({ info, onChanged }: { info: SubscriptionInfo; onChanged: () => void }) {
  const [projectId, setProjectId] = useState("");
  const [tier, setTier] = useState<ProjectTier | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const selected = info.projects.find((p) => p.id === projectId) ?? null;
  const pricesReady = TIER_ORDER.every((t) => {
    const price = info.tierPrices?.[t];
    return Boolean(
      price
      && Number.isFinite(price.yearlyTotal)
      && Number.isFinite(price.actionsPerMonth),
    );
  });
  // Included projects (no purchased add-on) are upgraded by buying an add-on
  // tier for them; add-on projects change tier on their existing subscription.
  const selectedIsAddon = !!selected?.isAddon;
  const currentTier: ProjectTier = (selected?.tier ?? "premium") as ProjectTier;
  const isUpgrade = tier !== "" && TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(currentTier);
  const needsPreview = selectedIsAddon && isUpgrade && pricesReady;
  const preview = useTierProration(
    projectId, tier,
    JSON.stringify([selected?.addonSubscriptionId, currentTier, selected?.pendingTier]),
    needsPreview,
  );

  async function submit() {
    if (busy || !selected || tier === "" || !pricesReady) return;
    if (needsPreview && (!preview.quote || preview.quote.expiresAt <= Date.now())) {
      preview.refresh();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (selectedIsAddon) {
        const res = await fetch(`${apiBase()}/api/platform/billing/project-tier`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: selected.id, tier, ...(needsPreview ? { quoteId: preview.quote!.quoteId } : {}) }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessage({ kind: "error", text: json.error ?? "Could not change the tier." });
          // A changed-but-unreconciled invoice must never invite another charge.
          if (json.changed) {
            setProjectId("");
            setTier("");
            onChanged();
          } else if (needsPreview) {
            preview.refresh();
          }
          return;
        }
        const reconciliation = json.reconciliation;
        setMessage({
          kind: needsPreview && reconciliation?.matched !== true ? "error" : "ok",
          text: reconciliation?.matched
            ? `${json.message ?? "Tier upgraded."} Final paid invoice: ${billingMoney(reconciliation.amountPaid, reconciliation.currency)}. This matches your approved preview.`
            : needsPreview
              ? "The tier-change result could not be reconciled with your approved preview. Check Billing and your invoices before making another change."
              : json.message ?? "Tier updated.",
        });
        // The server is authoritative for the current tier and any pending
        // renewal change. Clear the controls before reloading it so a second
        // click cannot submit the previous project against refreshed data.
        setProjectId("");
        setTier("");
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
      setMessage({ kind: "error", text: selectedIsAddon
        ? "The tier-change result could not be confirmed. Refresh Billing and check your invoices before trying again."
        : "Network error. Please try again." });
      if (selectedIsAddon) {
        setProjectId("");
        setTier("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="change-tier-card" className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <h2 className="aio-type-card-title mb-1" style={{ color: ink }}>Change a project's tier</h2>
      <p className="aio-type-body mb-4" style={{ color: vars.g500 }}>
        Included Premium projects are the baseline in your agency plan. An included project can be upgraded to Max by purchasing a separate Max add-on at its full annual fee. Existing paid add-ons can be moved to another tier; upgrades apply immediately and downgrades take effect at the next renewal.
      </p>
      {!pricesReady && (
        <p className="aio-type-supporting mb-4 px-3 py-2 rounded-lg" data-testid="change-tier-prices-unavailable" style={{ color: "#92400E", background: "#FEF3C7" }}>
          Project tier pricing is temporarily unavailable. Tier changes are disabled until pricing is available.
        </p>
      )}
      {info.projects.length === 0 ? (
        <div className="rounded-xl p-4" data-testid="change-tier-empty-state" style={{ background: vars.g50, border: `1px solid ${vars.g200}` }}>
          <p className="aio-type-supporting" style={{ color: vars.g600 }}>
            No client projects are available to change yet.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <button
              type="button"
              disabled
              className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
              style={{ background: accent }}
            >
              Change tier
            </button>
            <button
              type="button"
              className="aio-button aio-button--outline aio-button--compact rounded-full uppercase tracking-[0.12em]"
              style={{ color: ink, border: `1.5px solid ${vars.g300}`, background: "white" }}
              aria-label="Refresh client projects"
              onClick={() => {
                setProjectId("");
                setTier("");
                setMessage(null);
                onChanged();
              }}
            >
              Refresh projects
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 max-w-2xl">
          <div className="md:col-span-6">
            <label className="aio-type-eyebrow block mb-1.5" htmlFor="client-project-select" style={{ color: ink }}>Client project</label>
            <select
              id="client-project-select"
              aria-label="Client project"
              value={projectId}
              disabled={busy}
              onChange={(e) => { setProjectId(e.target.value); setTier(""); setMessage(null); }}
              className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2"
              style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent, background: "white" }}
            >
              <option value="">Choose a client project...</option>
              {info.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.id} - {p.isAddon ? TIER_LABELS[(p.tier ?? "premium") as ProjectTier] : "Premium (included)"}
                  {p.pendingTier ? ` (changing to ${TIER_LABELS[p.pendingTier]} at renewal)` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6">
            <label className="aio-type-eyebrow block mb-1.5" htmlFor="new-tier-select" style={{ color: ink }}>New tier</label>
            <select
              id="new-tier-select"
              aria-label="New tier"
              value={tier}
              onChange={(e) => { setTier(e.target.value as ProjectTier | ""); setMessage(null); }}
              disabled={busy || !selected || !pricesReady}
              className="aio-type-body w-full px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{ borderColor: vars.g200, ["--tw-ring-color" as any]: accent, background: "white" }}
            >
              <option value="">Choose a tier...</option>
              {/* Add-on projects can move to any other tier; included projects
                  (already Premium) can only be upgraded to Max. */}
              {pricesReady && TIER_ORDER.filter((t) =>
                selectedIsAddon ? t !== currentTier : TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf("premium"),
              ).map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABELS[t]} - {pounds(info.tierPrices[t].yearlyTotal)}/yr, {info.tierPrices[t].actionsPerMonth} actions/month
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}
      {selected && !selectedIsAddon && pricesReady && (
        <p className="aio-type-meta mt-2" style={{ color: vars.g500 }}>
          This project is included in your plan at Premium. Upgrading it adds a paid project tier ({tier !== "" ? `${pounds(info.tierPrices[tier].yearlyTotal)}/yr` : "billed annually"}) on top of your plan.
        </p>
      )}
      {selected && !selectedIsAddon && info.checkoutAvailable && !info.companyRecordComplete && (
        <BillingInformationPrompt />
      )}
      {selected && selectedIsAddon && tier !== "" && !isUpgrade && (
        <p className="aio-type-meta mt-2" style={{ color: vars.g500 }}>
          No immediate charge. {TIER_LABELS[tier]} and its lower allowance take effect at your next renewal
          {pricesReady ? ` at ${pounds(info.tierPrices[tier].yearlyTotal)}/year` : ""}. Your current allowance stays in place until then.
        </p>
      )}
      {needsPreview && (
        <div className="rounded-xl p-4 mt-4 max-w-2xl" style={{ background: vars.g50, border: `1px solid ${vars.g200}` }} aria-live="polite">
          {preview.loading && <p className="aio-type-supporting" role="status">Calculating your exact charge with Stripe...</p>}
          {preview.error && (
            <>
              <p className="aio-type-supporting" role="alert" style={{ color: "#991B1B" }}>{preview.error} No tier change has been submitted by this preview.</p>
              <button type="button" disabled={busy} onClick={preview.refresh} className="aio-button aio-button--text aio-button--compact mt-2">Retry charge preview</button>
            </>
          )}
          {preview.quote && (
            <div data-testid="tier-charge-preview">
              <p className="aio-type-label" style={{ color: ink }}>Due now: {billingMoney(preview.quote.amountDue, preview.quote.currency)}</p>
              <p className="aio-type-supporting mt-1" style={{ color: vars.g600 }}>Annual renewal price: {billingMoney(preview.quote.annualRenewalAmount, preview.quote.currency)}/year for {TIER_LABELS[tier as ProjectTier]}.</p>
              <p className="aio-type-meta mt-2" style={{ color: vars.g500 }}>The immediate amount is calculated by Stripe, including applicable tax and credits. The annual tier price is before any applicable renewal tax or discounts. Confirming authorises the charge shown above and applies the higher allowance immediately.</p>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={submit}
           disabled={busy || !pricesReady || !selected || tier === "" || (needsPreview && !preview.quote) || (!selectedIsAddon && (!info.checkoutAvailable || !info.companyRecordComplete))}
          className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
          style={{ background: accent }}
        >
          {busy ? "Working..." : needsPreview ? (preview.quote ? `Confirm upgrade - ${billingMoney(preview.quote.amountDue, preview.quote.currency)} now` : "Confirm upgrade") : selectedIsAddon ? "Change tier" : "Continue to payment"}
        </button>
        {message && (
          <span role={message.kind === "error" ? "alert" : "status"} className="aio-type-supporting" style={{ color: message.kind === "ok" ? "#166534" : "#991B1B" }}>{message.text}</span>
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
  const companyDetailsHelpId = useId();
  const companyDetailsRequired = info.checkoutAvailable && !info.companyRecordComplete;
  const options: { key: "annual" | "quarterly"; label: string; monthly: string; detail: string }[] = [
    {
      key: "annual",
      label: "Pay annually",
      monthly: monthlyEquivalent(info.prices.annual.yearlyTotal, 12),
      detail: `${pounds(info.prices.annual.yearlyTotal)} billed annually`,
    },
    {
      key: "quarterly",
      label: "Pay quarterly",
      monthly: monthlyEquivalent(info.prices.quarterly.perQuarter, 3),
      detail: `${pounds(info.prices.quarterly.perQuarter)} billed quarterly · ${pounds(info.prices.quarterly.yearlyTotal)}/yr`,
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
            <span className="aio-type-label block mb-1" style={{ color: ink }}>{opt.label}</span>
            <span className="aio-type-card-title block" style={{ color: ink }}>{opt.monthly}<span className="aio-type-meta font-normal" style={{ color: vars.g500 }}>/mo equivalent</span></span>
            <span className="aio-type-meta block mt-1" style={{ color: vars.g500 }}>{opt.detail}</span>
          </button>
        ))}
      </div>
      <p className="aio-type-meta mb-4" style={{ color: vars.g500 }}>Monthly figures are for comparison only. Payments are taken annually or quarterly, not monthly. Review the final amount at checkout.</p>
      {!info.checkoutAvailable && (
        <p className="aio-type-supporting mb-3" style={{ color: vars.g500 }}>
          Online checkout isn't available right now - contact info@aiofusion.ai to subscribe.
        </p>
      )}
      {info.trial?.status === "active" && (
        <div className="aio-type-supporting mb-3 px-3 py-3 rounded-lg" data-testid="beta-payment-timing" style={{ color: ink, background: vars.g50, border: `1px solid ${vars.g200}` }}>
          <p className="font-semibold">Completing checkout starts your paid subscription immediately.</p>
          <p className="mt-1">It does not just save your card for the end of beta. Any amount due is shown at checkout. Unused beta days are not added to your paid billing period or credited.</p>
          <p className="mt-1">Saving your company address alone does not start a subscription or end your trial. You can keep using your remaining beta days without entering card details.</p>
        </div>
      )}
      {companyDetailsRequired && (
        <BillingInformationPrompt id={companyDetailsHelpId} />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={starting || !info.checkoutAvailable || !info.companyRecordComplete}
          aria-describedby={companyDetailsRequired ? companyDetailsHelpId : undefined}
          title={companyDetailsRequired ? "Complete and save your company details to enable payment." : undefined}
          className="aio-button aio-button--primary rounded-full uppercase tracking-[0.12em]"
          style={{ background: accent }}
        >
          {starting ? "Starting checkout..." : "Continue to payment"}
        </button>
        {error && <span className="aio-type-supporting" style={{ color: "#991B1B" }}>{error}</span>}
      </div>
      <p className="aio-type-meta mt-3" style={{ color: vars.g400 }}>
        Payments are processed securely by Stripe.
      </p>
    </div>
  );
}

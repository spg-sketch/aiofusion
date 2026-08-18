import { useEffect, useState } from "react";
import { vars } from "../marketing/vars";
import { apiBase } from "../lib/apiHelpers";

const ink = vars.navy;
const accent = vars.accent;

// Subscription card shown at the top of the Billing settings section.
// - No subscription: choose annual or quarterly billing and start Stripe
//   Checkout (test mode during Beta).
// - Subscribed: shows plan, status and renewal date.
// Access is enforced server-side; the parent gates rendering by role.

type SubscriptionInfo = {
  status: "none" | "active" | "past_due" | "cancelled";
  plan: "inhouse" | "agency" | null;
  frequency: "annual" | "quarterly" | null;
  currentPeriodEnd: string | null;
  entitled: boolean;
  applicablePlan: "inhouse" | "agency";
  includedProjects: number;
  checkoutAvailable: boolean;
  prices: {
    annual: { yearlyTotal: number };
    quarterly: { perQuarter: number; yearlyTotal: number };
  };
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
  const [error, setError] = useState<string | null>(null);

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
  }, [checkoutResult]);

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

  if (!loaded) return null;
  if (!info) return null;

  const planLabel = PLAN_LABELS[info.plan ?? info.applicablePlan] ?? "";
  const subscribed = info.status !== "none";
  const status = STATUS_LABELS[info.status];
  const renewal = info.currentPeriodEnd
    ? new Date(info.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="rounded-2xl p-6 sm:p-8 mb-6" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
      <h2 className="text-[16px] font-bold mb-1" style={{ color: ink, fontFamily: "'Alice', Georgia, serif" }}>Subscription</h2>

      {checkoutResult === "success" && !info.entitled && (
        <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: "#DCFCE7", color: "#166534" }}>
          Payment received - your subscription is being activated. This can take a few seconds; refresh shortly.
        </p>
      )}
      {checkoutResult === "cancelled" && !subscribed && (
        <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: vars.g50, color: vars.g600 }}>
          Checkout was cancelled - no payment was taken.
        </p>
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
          {info.status === "past_due" && (
            <p className="text-[13px] mt-2" style={{ color: "#92400E" }}>
              Your last payment did not go through. We'll retry automatically - please check your card details to avoid interruption.
            </p>
          )}
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
            Subscribe to the {planLabel} plan - {info.includedProjects} Premium project{info.includedProjects === 1 ? "" : "s"} included. All prices exclude VAT.
          </p>
          <RestartChooser info={info} frequency={frequency} setFrequency={setFrequency} starting={starting} onStart={startCheckout} error={error} />
        </div>
      )}
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={starting || !info.checkoutAvailable}
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

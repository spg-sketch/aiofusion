import { Loader2 } from "lucide-react";
import { vars } from "../marketing/vars";

/**
 * Neutral, non-successful state for the short period between returning from
 * Stripe and receiving the server's authoritative checkout reconciliation.
 * Keep this wording safe to reuse during auth/onboarding bootstrap.
 */
export function CheckoutReturnLoading() {
  return (
    <div data-testid="checkout-return-loading" role="status" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: vars.accent }}>
        Payment confirmation
      </p>
      <h2 className="fo-page-heading text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
        Checking your payment
      </h2>
      <p className="fo-page-copy text-base sm:text-lg leading-relaxed text-slate-600">
        Please wait while we confirm your payment.
      </p>
      <Loader2 size={26} className="animate-spin mt-7" style={{ color: vars.accent }} aria-label="Checking your payment" />
    </div>
  );
}
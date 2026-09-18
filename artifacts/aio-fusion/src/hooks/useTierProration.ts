import { useEffect, useState } from "react";
import { apiBase } from "../lib/apiHelpers";

export type TierProrationQuote = {
  quoteId: string;
  amountDue: number;
  currency: string;
  annualRenewalAmount: number;
  prorationDate: number;
  expiresAt: number;
  applied: "now" | "at_renewal";
};

/** Stripe amounts are in the currency's minor unit, including zero-decimal currencies. */
export function billingMoney(amount: number, currency: string) {
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency", currency: currency.toUpperCase(), currencyDisplay: "code",
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amount / 10 ** digits);
}

export function useTierProration(projectId: string, tier: string, subscriptionState: string, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([projectId, tier, subscriptionState, enabled, attempt]);
  const [result, setResult] = useState<{
    key: string;
    quote: TierProrationQuote | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/platform/billing/project-tier/preview`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, tier }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not preview the tier change.");
        if (
          typeof json.quoteId !== "string" || !json.quoteId ||
          !Number.isSafeInteger(json.amountDue) || json.amountDue < 0 ||
          !Number.isSafeInteger(json.annualRenewalAmount) || json.annualRenewalAmount < 0 ||
          typeof json.currency !== "string" || !/^[a-z]{3}$/i.test(json.currency) ||
          !Number.isFinite(json.expiresAt) || json.expiresAt <= Date.now() ||
          !Number.isSafeInteger(json.prorationDate) ||
          !["now", "at_renewal"].includes(json.applied)
        ) throw new Error("The charge preview was invalid. Please request a new preview.");
        billingMoney(json.amountDue, json.currency);
        if (cancelled) return;
        setResult({ key, quote: json, error: null });
        expiryTimer = setTimeout(() => {
          setResult({ key, quote: null, error: "This charge preview has expired. Request a new preview before confirming." });
        }, json.expiresAt - Date.now());
      } catch (err) {
        if (!cancelled) setResult({
          key, quote: null,
          error: err instanceof Error ? err.message : "Could not preview the charge. Please try again.",
        });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(expiryTimer);
    };
  }, [key, enabled, projectId, tier]);

  const current = enabled && result?.key === key ? result : null;
  return {
    quote: current?.quote ?? null,
    error: current?.error ?? null,
    loading: enabled && !current,
    refresh: () => setAttempt((value) => value + 1),
  };
}
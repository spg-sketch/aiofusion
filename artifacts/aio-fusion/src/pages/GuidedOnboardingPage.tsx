import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, CreditCard, Play, AlertTriangle, AlertCircle } from "lucide-react";
import AccountTypeSelectPage from "./AccountTypeSelectPage";
import { FocusedOnboardingShell } from "./FocusedOnboardingShell";
import { BillingDetailsCard } from "../components/BillingDetailsCard";
import {
  daysUntilRenewal,
  formatSubscriptionEnd,
  SubscriptionCard,
  type SubscriptionActivationSummary,
} from "../components/SubscriptionCard";
import { apiBase } from "../lib/apiHelpers";
import { vars } from "../marketing/vars";

type Step = "account_type" | "workspace_basics" | "access" | "billing" | "first_project";
type State = { step: Step; accessChoice?: "beta" | "paid" };

function OnboardingLayout({
  state,
  onSignOut,
  children,
}: {
  state: State;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  if (state.step === "first_project") return null;
  const focusedState = {
    ...state,
    step: state.step as Exclude<Step, "first_project">,
  };

  return (
    <FocusedOnboardingShell state={focusedState} onSignOut={onSignOut}>
      {children}
    </FocusedOnboardingShell>
  );
}

export function GuidedOnboardingPage({
  onSignOut,
  onRoleChanged,
  onComplete,
  checkoutResult,
  checkoutSessionId,
}: {
  onSignOut: () => void;
  onRoleChanged: (role: "agency" | "client") => void;
  onComplete: (destinationSection?: "profile" | "billing") => Promise<{ ok: boolean; error?: string }>;
  checkoutResult?: "success" | "cancelled" | null;
  checkoutSessionId?: string | null;
}) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [selectedAccessChoice, setSelectedAccessChoice] = useState<"beta" | "paid" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activationSummary, setActivationSummary] = useState<SubscriptionActivationSummary | null>(null);

  const complete = useCallback(async () => {
    setBusy(true);
    setError(null);
    // A paid return has already been server-reconciled on this screen. Open
    // the Account Settings billing section so the user sees the same
    // server-backed active-subscription summary immediately after hand-off.
    const result = await onComplete(checkoutResult === "success" ? "billing" : "profile");
    if (!result.ok) {
      setError(result.error ?? "Could not finish account setup.");
      setBusy(false);
    }
  }, [onComplete]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [setupRes, meRes] = await Promise.all([
        fetch(`${apiBase()}/api/platform/onboarding`, { credentials: "include", cache: "no-store" }),
        fetch(`${apiBase()}/api/platform/me`, { credentials: "include", cache: "no-store" }),
      ]);
      const setup = await setupRes.json().catch(() => ({})) as { state?: State; error?: string };
      if (!setupRes.ok || !setup.state) throw new Error(setup.error ?? "Could not load account setup.");
      if (setup.state.step === "first_project") {
        await complete();
        return;
      }
      setState(setup.state);
      if (meRes.ok) {
        const me = await meRes.json() as {
          accountProfile?: { displayName?: string | null; website?: string | null };
        };
        setDisplayName((current) => current || me.accountProfile?.displayName || "");
        setWebsite((current) => current || me.accountProfile?.website || "");
      }
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load account setup.");
    }
  }, [complete]);

  useEffect(() => { void load(); }, [load]);

  const handleAccessActivated = useCallback((summary: SubscriptionActivationSummary) => {
    if (checkoutResult === "success") {
      setActivationSummary((current) => current ?? summary);
      return;
    }
    void load();
  }, [checkoutResult, load]);

  async function post(path: string, body: unknown): Promise<State | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase()}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({})) as { state?: State; error?: string };
      if (!response.ok) {
        if (json.state) setState(json.state);
        setError(json.error ?? "Could not save this step.");
        return null;
      }
      if (json.state && json.state.step !== "first_project") setState(json.state);
      return json.state ?? null;
    } catch {
      setError("Could not connect. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function continueWithAccessChoice() {
    if (!selectedAccessChoice) return;
    const next = await post("/api/platform/onboarding/access", { choice: selectedAccessChoice });
    if (next?.step === "first_project") await complete();
  }

  if (!state && !loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="animate-spin text-[#C8497A]" size={32} />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8fafc]">
        <div className="text-center max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <AlertCircle size={32} className="mx-auto mb-4 text-red-500" />
          <p className="mb-8 text-slate-600 leading-relaxed font-medium">{loadError}</p>
          <div className="flex items-center justify-center gap-6">
            <button className="text-sm font-bold uppercase tracking-wider text-[#C8497A] hover:opacity-80 transition-opacity" onClick={() => void load()}>
              Try again
            </button>
            <button className="text-sm font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.step === "account_type") {
    return (
      <AccountTypeSelectPage
        onSignOut={onSignOut}
        onComplete={(role) => {
          onRoleChanged(role);
          void load();
        }}
      />
    );
  }

  if (state.step === "billing" && checkoutResult === "success" && activationSummary) {
    const renewalDate = formatSubscriptionEnd(activationSummary.currentPeriodEnd);
    const renewalDays = daysUntilRenewal(activationSummary.currentPeriodEnd);
    const frequencyLabel = activationSummary.frequency === "quarterly" ? "quarterly" : "annual";
    const planLabel = activationSummary.plan === "agency" ? "Agency/Partner" : "In-House";

    return (
      <OnboardingLayout state={state} onSignOut={onSignOut}>
        <div className="animate-in fade-in duration-500 w-full max-w-xl" data-testid="payment-success-page">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-7"
            style={{ background: "#DCFCE7", color: "#166534" }}
          >
            <Check size={34} strokeWidth={2.5} />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] mb-3" style={{ color: vars.accent }}>
            Payment confirmed
          </p>
          <h2 className="fo-page-heading text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Thank you for signing up to AIO Fusion
          </h2>
          <p className="fo-page-copy text-base sm:text-lg leading-relaxed text-slate-600 mb-6">
            Your payment was successful and your {planLabel} plan is active. You are billed {frequencyLabel}.
          </p>
          {renewalDate && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 mb-8">
              <p className="text-sm text-emerald-900">
                You are paid until <strong>{renewalDate}</strong>.
              </p>
              {renewalDays !== null && (
                <p className="text-sm text-emerald-800 mt-1">
                  Your next renewal is in <strong>{renewalDays} {renewalDays === 1 ? "day" : "days"}</strong>.
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => void complete()}
            disabled={busy}
              className="fo-primary inline-flex items-center justify-center gap-2 rounded-md px-8 py-4 text-white text-sm font-bold uppercase tracking-wider transition-all duration-300 disabled:opacity-50 hover:brightness-110"
            style={{ background: vars.accent }}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : "Continue to my account"}
            {!busy && <ArrowRight size={18} />}
          </button>
          {error && <p className="mt-4 text-sm font-medium text-red-700">{error}</p>}
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout state={state} onSignOut={onSignOut}>
      {state.step === "workspace_basics" && (
        <div className="animate-in fade-in duration-700">
          <h2 className="fo-page-heading text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Set up your company
          </h2>
          <p className="fo-page-copy text-base sm:text-lg mb-10 leading-relaxed text-slate-600">
            Confirm the company details used throughout your account.
          </p>

          <div className="space-y-6 mb-10">
            <div>
              <label htmlFor="company-name" className="block text-sm font-semibold text-slate-900 mb-2">Company name</label>
              <input 
                id="company-name"
                className="w-full rounded-xl border px-4 py-3.5 text-base focus:outline-none focus:ring-1 focus:ring-[#C8497A] focus:border-[#C8497A] transition-all bg-white"
                style={{ borderColor: vars.g200 }}
                value={displayName} 
                onChange={(e) => setDisplayName(e.target.value)} 
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div>
              <label htmlFor="company-website" className="block text-sm font-semibold text-slate-900 mb-2">Company website</label>
              <input 
                id="company-website"
                className="w-full rounded-xl border px-4 py-3.5 text-base focus:outline-none focus:ring-1 focus:ring-[#C8497A] focus:border-[#C8497A] transition-all bg-white"
                style={{ borderColor: vars.g200 }}
                value={website} 
                onChange={(e) => setWebsite(e.target.value)} 
                placeholder="https://example.com" 
              />
            </div>
          </div>

          {error && (
            <div className="mb-8 p-4 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-100 flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
              <p>{error}</p>
            </div>
          )}

          <button 
            disabled={busy || !displayName.trim() || !website.trim()} 
            onClick={() => void post("/api/platform/onboarding/workspace-basics", { displayName, website })} 
              className="fo-primary inline-flex items-center justify-center gap-2 rounded-md px-8 py-4 text-white text-sm font-bold uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
            style={{ background: vars.accent }}
              data-testid="button-continue-workspace-basics"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : "Continue"}
            {!busy && <ArrowRight size={18} />}
          </button>
        </div>
      )}

      {state.step === "access" && (
        <div className="animate-in fade-in duration-700">
          <h2 className="fo-page-heading text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Choose how to start
          </h2>
          <p className="fo-page-copy text-base sm:text-lg mb-10 leading-relaxed text-slate-600">
            Start the existing 60-day beta without a card, or continue with a paid plan.
          </p>

          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <button 
              disabled={busy} 
              onClick={() => setSelectedAccessChoice("beta")}
              aria-pressed={selectedAccessChoice === "beta"}
              className={`fo-choice text-left rounded-xl border-2 p-6 disabled:opacity-50 group ${
                selectedAccessChoice === "beta"
                  ? "border-[#C8497A] shadow-[0_0_0_1px_#C8497A]"
                  : "border-slate-200"
              }`}
              data-testid="button-access-choice-beta"
            >
              <span className="fo-icon-block fo-icon-block-pink">
                <Play size={18} className="ml-0.5" />
              </span>
              <strong className="text-xl block mb-2 text-slate-900 font-bold">60-day beta</strong>
              <span className="text-sm text-slate-600 leading-relaxed block">
                No card or billing address required. Includes two project workspaces to explore the platform.
              </span>
            </button>

            <button 
              disabled={busy} 
              onClick={() => setSelectedAccessChoice("paid")}
              aria-pressed={selectedAccessChoice === "paid"}
              className={`fo-choice text-left rounded-xl border-2 p-6 disabled:opacity-50 group ${
                selectedAccessChoice === "paid"
                  ? "border-[#C8497A] shadow-[0_0_0_1px_#C8497A]"
                  : "border-slate-200"
              }`}
              data-testid="button-access-choice-paid"
            >
              <span className="fo-icon-block fo-icon-block-navy">
                <CreditCard size={18} />
              </span>
              <strong className="text-xl block mb-2 text-slate-900 font-bold">Paid plan</strong>
              <span className="text-sm text-slate-600 leading-relaxed block">
                Save company billing details, then continue to secure Stripe checkout for full access.
              </span>
            </button>
          </div>

          <button
            disabled={busy || !selectedAccessChoice}
            onClick={() => void continueWithAccessChoice()}
            className="fo-primary inline-flex items-center justify-center gap-2 rounded-md px-8 py-4 text-white text-sm font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: vars.accent }}
            data-testid="button-continue-access-choice"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : "Continue"}
            {!busy && <ArrowRight size={18} />}
          </button>
          
          {error && (
            <div className="mb-8 p-4 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-100 flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}

      {state.step === "billing" && (
        <div className="animate-in fade-in duration-700 w-full max-w-3xl mx-auto">
          <h2 className="fo-page-heading text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Billing and payment
          </h2>
          <p className="fo-page-copy text-base sm:text-lg mb-8 leading-relaxed text-slate-600">
            Save the required billing information before choosing your payment schedule.
          </p>
          
          {checkoutResult === "cancelled" && (
            <div className="mb-8 rounded-xl bg-amber-50 border border-amber-200 p-5 text-sm text-amber-800 flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
              <p>Checkout was cancelled. No payment was taken, and you can continue here when ready.</p>
            </div>
          )}

          <div className="space-y-8">
            <BillingDetailsCard />
            <SubscriptionCard
              checkoutResult={checkoutResult}
              checkoutSessionId={checkoutSessionId}
              onboarding
              onAccessActivated={handleAccessActivated}
            />
          </div>
          
          {error && (
            <div className="mt-8 p-4 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-100 flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}

    </OnboardingLayout>
  );
}

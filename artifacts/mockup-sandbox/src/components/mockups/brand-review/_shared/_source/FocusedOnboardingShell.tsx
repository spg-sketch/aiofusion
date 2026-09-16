import { Check, LogOut, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import "./FocusedOnboardingShell.css";

export type FocusedOnboardingStep =
  | "account_type"
  | "workspace_basics"
  | "access"
  | "billing";

export type FocusedOnboardingState = {
  step: FocusedOnboardingStep;
  accessChoice?: "beta" | "paid";
};

const BASE_STEPS: readonly [FocusedOnboardingStep, string][] = [
  ["account_type", "Account type"],
  ["workspace_basics", "Company"],
  ["access", "Trial or plan"],
];

export function FocusedOnboardingShell({
  state,
  onSignOut,
  children,
}: {
  state: FocusedOnboardingState;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const steps = state.step === "billing" || state.accessChoice === "paid"
    ? [...BASE_STEPS, ["billing", "Billing"] as const]
    : BASE_STEPS;
  const activeIndex = Math.max(0, steps.findIndex(([key]) => key === state.step));

  return (
    <div className="focused-onboarding">
      <div className="fo-shell">
        <aside className="fo-rail">
          <div>
            <div className="fo-rail-header">
              <img
                className="fo-wordmark"
                src="/__mockup/images/brand-review/logo-white-notagline.png"
                alt="AIO Fusion"
                data-testid="img-onboarding-logo"
              />
              <button
                type="button"
                onClick={onSignOut}
                className="fo-mobile-signout"
                aria-label="Sign out"
                data-testid="button-sign-out-mobile"
              >
                <LogOut size={18} />
              </button>
            </div>
            <div className="fo-rail-copy">
              <span className="fo-eyebrow fo-rail-eyebrow">
                <Sparkles size={13} /> New customer setup
              </span>
              <h1 className="fo-serif">A clear start for your workspace.</h1>
              <p>A few focused steps, then you are ready to explore AIO Fusion.</p>
            </div>
            <nav className="fo-desktop-progress" aria-label="Onboarding progress">
              <p className="fo-progress-title">Your progress</p>
              <ol>
                {steps.map(([key, label], index) => {
                  const current = key === state.step;
                  const past = index < activeIndex;
                  return (
                    <li key={key}>
                      {index < steps.length - 1 && (
                        <span className={`fo-step-line${past ? " is-past" : ""}`} />
                      )}
                      <span className={`fo-step-marker${past || current ? " is-active" : ""}`}>
                        {past ? <Check size={13} strokeWidth={3} /> : index + 1}
                      </span>
                      <span className={`fo-progress-label${current ? " is-current" : past ? " is-past" : ""}`}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </nav>
            <nav className="fo-mobile-progress" aria-label="Onboarding progress">
              Step {activeIndex + 1} of {steps.length}: {steps[activeIndex]?.[1]}
              <div className="fo-mobile-progress-track">
                <span style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }} />
              </div>
            </nav>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="fo-desktop-signout"
            data-testid="button-sign-out"
          >
            <LogOut size={15} /> Sign out
          </button>
        </aside>

        <main className="fo-content">
          <div className="fo-content-inner">
            <header className="fo-content-header">
              <h1 className="sr-only">New Customer Onboarding</h1>
              <p className="sr-only">
                Welcome to AIO Fusion. For faster customer onboarding, please complete the following steps.
              </p>
              <div className="fo-content-progress">
                <span>Step {activeIndex + 1}</span>
                <span>of {steps.length}</span>
              </div>
              <span className="fo-time-note">Setup takes about 2 minutes</span>
            </header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default FocusedOnboardingShell;
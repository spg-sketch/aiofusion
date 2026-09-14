import { useState } from "react";
import { Building2, User, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { apiBase } from "../lib/apiHelpers";
import { FocusedOnboardingShell } from "./FocusedOnboardingShell";

interface Props {
  onComplete: (role: "agency" | "client") => void;
  onSignOut: () => void;
}

export default function AccountTypeSelectPage({ onComplete, onSignOut }: Props) {
  const [selected, setSelected] = useState<"agency" | "client" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selected || loading) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${apiBase()}/api/platform/setup/account-type`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accountType: selected }),
      });
      const json = await resp.json() as { ok?: boolean; error?: string };
      if (!resp.ok || !json.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      onComplete(selected);
    } catch {
      setError("Could not connect. Please check your connection and try again.");
      setLoading(false);
    }
  };

  const agencySelected = selected === "agency";
  const clientSelected = selected === "client";

  return (
    <FocusedOnboardingShell state={{ step: "account_type" }} onSignOut={onSignOut}>
      <section className="fo-fade fo-delay">
        <p className="fo-eyebrow">01 / Workspace identity</p>
        <h2 className="fo-page-heading mt-4">How will you use AIO Fusion?</h2>
        <p className="fo-page-copy mt-4 max-w-xl text-[15px] leading-7">
          Choose the account type that best describes your work. Which would suit you best? You can update this in your account settings at a later stage.
        </p>

        <div className="fo-options mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSelected("agency")}
            aria-pressed={agencySelected}
            className="fo-choice rounded-xl border-2 p-5 text-left"
            data-testid="button-account-type-agency"
          >
            <span className={`fo-icon-block fo-icon-block-navy${agencySelected ? " is-selected" : ""}`}>
              <Building2 size={18} />
            </span>
            <strong className="mt-4 block text-[15px]">Agency / Partner</strong>
            <span className="mt-2 block text-[12px] leading-5">
              For agencies and consultants working on behalf of clients. Add Client Projects, manage their projects, and view every dashboard from one place.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelected("client")}
            aria-pressed={clientSelected}
            className="fo-choice rounded-xl border-2 p-5 text-left"
            data-testid="button-account-type-client"
          >
            <span className={`fo-icon-block fo-icon-block-pink${clientSelected ? " is-selected" : ""}`}>
              <User size={18} />
            </span>
            <strong className="mt-4 block text-[15px]">Direct Client</strong>
            <span className="mt-2 block text-[12px] leading-5">
              For businesses managing PR and marketing for their own company or brand. One focused workspace with all your projects in one place.
            </span>
          </button>
        </div>

        {error && (
          <div className="fo-error mt-5" role="alert" data-testid="status-account-type-error">
            <AlertCircle size={18} />
            <p>{error}</p>
          </div>
        )}

        <div className="fo-action-row">
          <span />
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="fo-primary inline-flex items-center justify-center gap-3 rounded-md px-6 py-3.5 text-[11px] font-bold uppercase tracking-[.14em] text-white"
            data-testid="button-continue-account-type"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : "Continue"}
            {!loading && <ArrowRight size={15} />}
          </button>
        </div>
      </section>
    </FocusedOnboardingShell>
  );
}

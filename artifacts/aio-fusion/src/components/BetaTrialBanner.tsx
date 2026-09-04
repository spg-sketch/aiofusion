import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { apiBase } from "../lib/apiHelpers";

type Trial = {
  status: "eligible" | "active" | "expired" | "used" | "exempt";
  daysRemaining: number;
};

export function BetaTrialBanner({ onViewPlans }: { onViewPlans: () => void }) {
  const [trial, setTrial] = useState<Trial | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${apiBase()}/api/platform/billing/subscription`, { credentials: "include" });
        if (!response.ok) return;
        const data = await response.json() as { trial?: Trial };
        if (!cancelled && data.trial) setTrial(data.trial);
      } catch {
        // Billing may be managed by a parent agency; omit the banner in that case.
      }
    };
    void load();
    window.addEventListener("aio:beta-trial-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("aio:beta-trial-changed", load);
    };
  }, []);

  if (!trial || (trial.status !== "active" && trial.status !== "expired")) return null;

  const expired = trial.status === "expired";
  return (
    <div
      className="mb-6 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      style={{
        background: expired ? "#FEF2F2" : "#ECFDF5",
        border: `1px solid ${expired ? "#FECACA" : "#A7F3D0"}`,
        color: expired ? "#991B1B" : "#166534",
      }}
    >
      <div className="flex items-start gap-3">
        <Clock size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-[14px] font-bold">
            {expired
              ? "Your 60-day beta trial has ended"
              : trial.daysRemaining <= 1
                ? "Your beta trial ends today"
                : `${trial.daysRemaining} days left in your beta trial`}
          </p>
          <p className="text-[13px] mt-0.5">
            {expired
              ? "Your work is safe. Choose a plan to continue using paid features."
              : "Choose a plan before your trial ends to keep uninterrupted access."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewPlans}
        className="shrink-0 self-start rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white sm:self-auto"
        style={{ background: "#C8497A" }}
      >
        View plans
      </button>
    </div>
  );
}
import { useState } from "react";
import { Building2, User, ArrowRight, Loader2, ArrowLeft } from "lucide-react";
import { apiBase } from "../lib/apiHelpers";
import { vars } from "../marketing/vars";

const ink = "#0a1628";
const accent = "#C8497A";
const teal = "#1A647B";

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

  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: "white", color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ background: teal, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-20 sm:h-30" />
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold uppercase tracking-[0.14em] transition-all hover:bg-white/10 text-white"
          style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
        >
          <ArrowLeft size={14} /> Cancel
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-14 sm:py-20">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: accent, color: "white" }}>1</div>
            <span className="text-[12px] font-semibold" style={{ color: accent }}>Account type</span>
          </div>
          <div className="flex-1 h-px mx-2" style={{ background: vars.g200 }} />
          <div className="flex items-center gap-1.5 opacity-40">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: vars.g300, color: "white" }}>2</div>
            <span className="text-[12px] font-semibold" style={{ color: vars.g500 }}>Dashboard</span>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight" style={{ fontFamily: "'Alice', Georgia, serif", color: ink }}>
          Thank you for signing up to AIO Fusion
        </h1>
        <p className="text-[16px] leading-[1.7] mb-2" style={{ color: vars.g600 }}>
          We offer two types of account: a <strong style={{ color: ink }}>Direct Client</strong> account, for managing your own company or brand, and an <strong style={{ color: ink }}>Agency / Partner</strong> account, for managing PR and marketing on behalf of multiple clients.
        </p>
        <p className="text-[16px] leading-[1.7] mb-10" style={{ color: vars.g600 }}>
          Which would suit you best? Don't worry — you can always update this in your account settings at a later stage.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {/* Agency / Partner */}
          <button
            type="button"
            onClick={() => setSelected("agency")}
            className="text-left p-6 rounded-2xl border-2 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              borderColor: selected === "agency" ? accent : vars.g200,
              background: selected === "agency" ? "#FDF0F5" : "white",
              boxShadow: selected === "agency" ? `0 0 0 1px ${accent}` : undefined,
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: selected === "agency" ? accent : vars.g100 }}>
              <Building2 size={22} color={selected === "agency" ? "white" : vars.g500} />
            </div>
            <div className="text-[17px] font-bold mb-2" style={{ color: ink }}>Agency / Partner</div>
            <p className="text-[13.5px] leading-[1.65]" style={{ color: vars.g600 }}>
              For agencies and consultants working on behalf of clients. Add client accounts, manage their projects, and view every dashboard from one place.
            </p>
            {selected === "agency" && (
              <div className="mt-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: accent }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
                </div>
                Selected
              </div>
            )}
          </button>

          {/* Client */}
          <button
            type="button"
            onClick={() => setSelected("client")}
            className="text-left p-6 rounded-2xl border-2 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              borderColor: selected === "client" ? teal : vars.g200,
              background: selected === "client" ? "#EDF6F9" : "white",
              boxShadow: selected === "client" ? `0 0 0 1px ${teal}` : undefined,
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: selected === "client" ? teal : vars.g100 }}>
              <User size={22} color={selected === "client" ? "white" : vars.g500} />
            </div>
            <div className="text-[17px] font-bold mb-2" style={{ color: ink }}>Direct Client</div>
            <p className="text-[13.5px] leading-[1.65]" style={{ color: vars.g600 }}>
              For businesses managing PR and marketing for their own company or brand. One focused workspace with all your projects in one place.
            </p>
            {selected === "client" && (
              <div className="mt-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: teal }}>
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: teal }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: teal }} />
                </div>
                Selected
              </div>
            )}
          </button>
        </div>

        {error && (
          <p className="mb-5 text-[13px] font-semibold text-center py-2.5 px-4 rounded-xl" style={{ color: "white", background: "rgba(220,38,38,0.85)" }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || loading}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-[15px] font-bold uppercase tracking-[0.14em] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none"
          style={{ background: accent }}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          {loading ? "Setting up your account…" : "Continue to dashboard"}
        </button>
      </div>
    </div>
  );
}

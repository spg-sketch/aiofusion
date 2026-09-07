import { useState } from "react";
import { Building2, User, ArrowRight, Loader2, AlertCircle, LogOut } from "lucide-react";
import { apiBase } from "../lib/apiHelpers";
import { vars } from "../marketing/vars";

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
    <div className="min-h-screen bg-white font-sans text-slate-900 flex flex-col">
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between" style={{ background: vars.navy }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-8 sm:h-10" />
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:bg-white/10 text-white border border-white/20"
        >
          <LogOut size={16} /> Sign out
        </button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 sm:py-20 w-full animate-in fade-in duration-700">
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: vars.accent, color: "white" }}>1</div>
            <span className="text-sm font-semibold" style={{ color: vars.accent }}>Account type</span>
          </div>
          <div className="w-12 h-px" style={{ background: vars.g200 }} />
          <div className="flex items-center gap-2 opacity-60">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: vars.g200, color: vars.g600 }}>2</div>
            <span className="text-sm font-semibold text-slate-500">Workspace details</span>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
          Thank you for signing up to AIO Fusion
        </h1>
        <p className="text-base sm:text-lg mb-2 leading-relaxed text-slate-600">
          We offer two types of account: a <strong className="font-semibold text-slate-900">Direct Client</strong> account for managing your own company or brand, and an <strong className="font-semibold text-slate-900">Agency / Partner</strong> account for managing PR and marketing on behalf of multiple clients.
        </p>
        <p className="text-base sm:text-lg mb-10 leading-relaxed text-slate-600">
          Which would suit you best? You can update this in your account settings at a later stage.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
          {/* agency button */}
          <button
            type="button"
            onClick={() => setSelected("agency")}
            className="text-left p-6 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden group hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              borderColor: agencySelected ? vars.accent : "var(--color-slate-200, #e2e8f0)",
              background: agencySelected ? "#FDF0F5" : "white",
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors"
                 style={{ background: agencySelected ? vars.accent : "#F1F5F9", color: agencySelected ? "white" : vars.g500 }}>
              <Building2 size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Agency / Partner</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              For agencies and consultants working on behalf of clients. Add client accounts, manage their projects, and view every dashboard from one place.
            </p>
            {agencySelected && (
              <div className="absolute top-6 right-6" style={{ color: vars.accent }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white shadow-sm">
                  <div className="w-3 h-3 rounded-full" style={{ background: vars.accent }} />
                </div>
              </div>
            )}
          </button>

          {/* client button */}
          <button
            type="button"
            onClick={() => setSelected("client")}
            className="text-left p-6 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden group hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              borderColor: clientSelected ? vars.teal : "var(--color-slate-200, #e2e8f0)",
              background: clientSelected ? "#EDF6F9" : "white",
            }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors"
                 style={{ background: clientSelected ? vars.teal : "#F1F5F9", color: clientSelected ? "white" : vars.g500 }}>
              <User size={24} />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Direct Client</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              For businesses managing PR and marketing for their own company or brand. One focused workspace with all your projects in one place.
            </p>
            {clientSelected && (
              <div className="absolute top-6 right-6" style={{ color: vars.teal }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white shadow-sm">
                  <div className="w-3 h-3 rounded-full" style={{ background: vars.teal }} />
                </div>
              </div>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-100 flex items-start gap-3">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
            <p>{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected || loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-10 py-4 text-white text-sm font-bold uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
          style={{ background: vars.accent }}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : "Continue"}
          {!loading && <ArrowRight size={18} />}
        </button>
      </main>
    </div>
  );
}

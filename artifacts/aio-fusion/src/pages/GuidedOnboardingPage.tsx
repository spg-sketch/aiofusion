import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, LogOut, CreditCard, Play, AlertTriangle, AlertCircle } from "lucide-react";
import AccountTypeSelectPage from "./AccountTypeSelectPage";
import { BillingDetailsCard } from "../components/BillingDetailsCard";
import { SubscriptionCard } from "../components/SubscriptionCard";
import { CreateProjectModal } from "../components/CreateProjectModal";
import { apiBase } from "../lib/apiHelpers";
import { vars } from "../marketing/vars";

type Step = "account_type" | "workspace_basics" | "access" | "billing" | "first_project";
type State = { step: Step; accessChoice?: "beta" | "paid" };
type ExistingProject = { id: string; name: string };

const STEPS = [
  ["account_type", "Account type"],
  ["workspace_basics", "Workspace"],
  ["access", "Access"],
  ["billing", "Billing"],
  ["first_project", "First project"],
] as const;

export function GuidedOnboardingPage({
  onSignOut,
  onRoleChanged,
  onCreateFirstProject,
  onResumeFirstProject,
  checkoutResult,
}: {
  onSignOut: () => void;
  onRoleChanged: (role: "agency" | "client") => void;
  onCreateFirstProject: (name: string, logo?: string) => Promise<{ ok: boolean; error?: string; saved?: boolean }>;
  onResumeFirstProject: (project: ExistingProject) => Promise<{ ok: boolean; error?: string; saved?: boolean }>;
  checkoutResult?: "success" | "cancelled" | null;
}) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProject, setShowProject] = useState(false);
  const [existingProject, setExistingProject] = useState<ExistingProject | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [setupRes, meRes] = await Promise.all([
        fetch(`${apiBase()}/api/platform/onboarding`, { credentials: "include", cache: "no-store" }),
        fetch(`${apiBase()}/api/platform/me`, { credentials: "include", cache: "no-store" }),
      ]);
      const setup = await setupRes.json().catch(() => ({})) as { state?: State; existingProject?: ExistingProject | null; error?: string };
      if (!setupRes.ok || !setup.state) throw new Error(setup.error ?? "Could not load account setup.");
      setState(setup.state);
      setExistingProject(setup.existingProject ?? null);
      if (meRes.ok) {
        const me = await meRes.json() as {
          accountProfile?: { displayName?: string | null; website?: string | null };
          sessionIdentity?: { companyName?: string | null };
        };
        setDisplayName((current) => current || me.accountProfile?.displayName || me.sessionIdentity?.companyName || "");
        setWebsite((current) => current || me.accountProfile?.website || "");
      }
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load account setup.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
      if (json.state) setState(json.state);
      return json.state ?? null;
    } catch {
      setError("Could not connect. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
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

  // Layout wrapper component
  const Layout = ({ children }: { children: React.ReactNode }) => {
    const activeIndex = state ? STEPS.findIndex(([key]) => key === state.step) : 0;
    
    return (
      <div className="min-h-screen flex flex-col md:flex-row font-sans" style={{ background: vars.cream, color: vars.navy }}>
        {/* Sidebar */}
        <aside className="w-full md:w-[320px] lg:w-[380px] shrink-0 md:h-screen md:sticky md:top-0 flex flex-col justify-between z-10" style={{ background: vars.navy }}>
          <div className="p-6 md:p-10 lg:p-12 relative">
            <div className="flex items-center justify-between mb-8 md:mb-16">
              <img src={`${import.meta.env.BASE_URL}images/logo-white-notagline.png`} alt="AIO Fusion" className="h-8 md:h-10" />
              <button onClick={onSignOut} className="md:hidden p-2 text-white/60 hover:text-white transition-colors" aria-label="Sign out">
                <LogOut size={20} />
              </button>
            </div>
            
            <nav aria-label="Progress" className="hidden md:block">
              <ol className="space-y-8">
                {STEPS.map(([key, label], index) => {
                  const isActive = index === activeIndex;
                  const isPast = index < activeIndex || (state?.step === "first_project" && key === "billing" && state?.accessChoice === "beta");
                  
                  return (
                    <li key={key} className="flex items-center gap-4 relative">
                      {index !== STEPS.length - 1 && (
                        <div className="absolute top-6 left-[11px] w-px h-8" style={{ background: isPast ? vars.accent : "rgba(255,255,255,0.1)" }} />
                      )}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold transition-colors duration-300 ${
                        isPast ? "" : isActive ? "" : "bg-white/10 text-white/40"
                      }`} style={{
                        background: isPast || isActive ? vars.accent : undefined,
                        color: isPast || isActive ? "white" : undefined,
                      }}>
                        {isPast ? <Check size={12} strokeWidth={3} /> : index + 1}
                      </div>
                      <span className={`text-sm font-medium transition-colors duration-300 ${
                        isActive ? "text-white" : isPast ? "text-white/80" : "text-white/40"
                      }`}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <nav className="md:hidden">
              <div className="flex items-center gap-2 text-white/90 text-sm font-medium">
                Step {activeIndex + 1} of {STEPS.length}: {STEPS[activeIndex][1]}
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full mt-3 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((activeIndex + 1) / STEPS.length) * 100}%`, background: vars.accent }} />
              </div>
            </nav>
          </div>

          <div className="hidden md:block p-6 md:p-10 lg:p-12">
            <button onClick={onSignOut} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-medium">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-[calc(100vh-140px)] md:min-h-screen relative z-0">
          <div className="flex-1 w-full max-w-2xl mx-auto p-6 md:p-12 lg:p-20 flex flex-col justify-center">
            {children}
          </div>
        </main>
      </div>
    );
  };

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

  return (
    <Layout>
      {state.step === "workspace_basics" && (
        <div className="animate-in fade-in duration-700">
          <h1 className="text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Set up your workspace
          </h1>
          <p className="text-base sm:text-lg mb-10 leading-relaxed text-slate-600">
            Confirm the company or workspace details used throughout your account.
          </p>

          <div className="space-y-6 mb-10">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Workspace name</label>
              <input 
                className="w-full rounded-xl border px-4 py-3.5 text-base focus:outline-none focus:ring-1 focus:ring-[#C8497A] focus:border-[#C8497A] transition-all bg-white"
                style={{ borderColor: vars.g200 }}
                value={displayName} 
                onChange={(e) => setDisplayName(e.target.value)} 
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">Company website</label>
              <input 
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
            className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-white text-sm font-bold uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110" 
            style={{ background: vars.accent }}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : "Continue"}
            {!busy && <ArrowRight size={18} />}
          </button>
        </div>
      )}

      {state.step === "access" && (
        <div className="animate-in fade-in duration-700">
          <h1 className="text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Choose how to start
          </h1>
          <p className="text-base sm:text-lg mb-10 leading-relaxed text-slate-600">
            Start the existing 60-day beta without a card, or continue with a paid plan.
          </p>

          <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <button 
              disabled={busy} 
              onClick={() => void post("/api/platform/onboarding/access", { choice: "beta" })} 
              className="text-left rounded-2xl bg-white border-2 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 group"
              style={{ borderColor: vars.g200 }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors" style={{ background: "#F1F5F9" }}>
                <Play size={18} className="text-slate-600 ml-0.5" />
              </div>
              <strong className="text-xl block mb-2 text-slate-900 font-bold">60-day beta</strong>
              <span className="text-sm text-slate-600 leading-relaxed block">
                No card or billing address required. Includes two project workspaces to explore the platform.
              </span>
            </button>

            <button 
              disabled={busy} 
              onClick={() => void post("/api/platform/onboarding/access", { choice: "paid" })} 
              className="text-left rounded-2xl bg-white border-2 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 group" 
              style={{ borderColor: vars.accent }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors" style={{ background: vars.accent }}>
                <CreditCard size={18} className="text-white" />
              </div>
              <strong className="text-xl block mb-2 text-slate-900 font-bold">Paid plan</strong>
              <span className="text-sm text-slate-600 leading-relaxed block">
                Save company billing details, then continue to secure Stripe checkout for full access.
              </span>
            </button>
          </div>
          
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
          <h1 className="text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Billing and payment
          </h1>
          <p className="text-base sm:text-lg mb-8 leading-relaxed text-slate-600">
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
            <SubscriptionCard checkoutResult={checkoutResult} onboarding onAccessActivated={load} />
          </div>
          
          {error && (
            <div className="mt-8 p-4 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-100 flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}

      {state.step === "first_project" && (
        <div className="animate-in fade-in duration-700 text-center max-w-xl mx-auto">
          <h1 className="text-3xl sm:text-4xl mb-4 font-bold" style={{ fontFamily: "'Alice', Georgia, serif", color: vars.navy }}>
            Create your first project
          </h1>
          <p className="text-base sm:text-lg mb-10 leading-relaxed text-slate-600">
            Name the brand, product or campaign you want to work on. Next, you will enter Project Set-Up.
          </p>
          
          {existingProject ? (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await onResumeFirstProject(existingProject);
                setBusy(false);
                if (!result.ok) setError(result.error ?? "Could not continue to Project Set-Up.");
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-white text-sm font-bold uppercase tracking-wider transition-all duration-300 hover:brightness-110 disabled:opacity-50"
              style={{ background: vars.accent }}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : null}
              {busy ? "Continuing..." : `Continue ${existingProject.name || "project"} setup`}
              {!busy && <ArrowRight size={18} />}
            </button>
          ) : (
            <button 
              onClick={() => setShowProject(true)} 
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-white text-sm font-bold uppercase tracking-wider transition-all duration-300 hover:brightness-110" 
              style={{ background: vars.accent }}
            >
              Create first project <ArrowRight size={18} />
            </button>
          )}
          
          {error && (
            <div className="mt-8 p-4 rounded-xl bg-red-50 text-red-700 text-sm font-medium border border-red-100 flex items-start gap-3 text-left">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-500" />
              <p>{error}</p>
            </div>
          )}
        </div>
      )}
      
      {showProject && (
        <CreateProjectModal
          onCancel={() => setShowProject(false)}
          onCreate={async (name, logo) => {
            setBusy(true);
            setError(null);
            const result = await onCreateFirstProject(name, logo);
            setBusy(false);
            if (!result.ok) {
              setError(result.error ?? "Could not create the project.");
              if (result.saved) {
                setShowProject(false);
                await load();
              }
            }
            return result;
          }}
        />
      )}
    </Layout>
  );
}

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CreditCard,
  Globe2,
  LogOut,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import "./FocusedOnboarding.css";

type Step = "account" | "company" | "access" | "billing";

const steps: { key: Step; label: string }[] = [
  { key: "account", label: "Account type" },
  { key: "company", label: "Company" },
  { key: "access", label: "Trial or plan" },
  { key: "billing", label: "Billing" },
];

export function FocusedOnboarding() {
  const [step, setStep] = useState<Step>("access");
  const [accountType, setAccountType] = useState<"agency" | "client" | null>("agency");
  const [company, setCompany] = useState("Vibe Studio");
  const [website, setWebsite] = useState("https://vibestudio.agency");
  const [choice, setChoice] = useState<"beta" | "paid" | null>(null);
  const [completed, setCompleted] = useState(false);

  const activeIndex = steps.findIndex((item) => item.key === step);
  const visibleSteps = choice === "paid" || step === "billing" ? steps : steps.slice(0, 3);
  const canContinue =
    step === "account" ? Boolean(accountType) :
    step === "company" ? Boolean(company.trim() && website.trim()) :
    step === "access" ? Boolean(choice) :
    Boolean(completed);

  const advance = () => {
    if (!canContinue) return;
    if (step === "account") setStep("company");
    else if (step === "company") setStep("access");
    else if (step === "access" && choice === "paid") setStep("billing");
    else if (step === "access") setCompleted(true);
    else setCompleted(true);
  };

  const goBack = () => {
    if (step === "company") setStep("account");
    if (step === "access") setStep("company");
    if (step === "billing") setStep("access");
  };

  return (
    <div className="focused-onboarding">
      <div className="fo-shell mx-auto flex min-h-[100dvh] max-w-[1440px]">
        <aside className="fo-rail flex w-full shrink-0 flex-col justify-between bg-[#102b36] px-7 py-7 text-white md:w-[310px] md:px-10 md:py-10">
          <div>
            <div className="flex items-center justify-between">
              <img className="fo-wordmark h-10 w-auto brightness-0 invert" src="/__mockup/images/account-settings/logo-color.png" alt="AIO Fusion" />
              <button onClick={() => window.alert("You can safely return later. Progress is saved.")} className="rounded-md p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white md:hidden" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </div>
            <div className="fo-rail-copy mt-24">
              <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#f2a8c4]">
                <Sparkles size={13} /> New customer setup
              </span>
              <h1 className="fo-serif mt-5 text-[38px] leading-[1.08] text-white">A clear start for your workspace.</h1>
              <p className="mt-5 max-w-[215px] text-[13px] leading-6 text-white/70">A few focused steps, then you are ready to explore AIO Fusion.</p>
            </div>
            <nav className="mt-12" aria-label="Onboarding progress">
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[.2em] text-white/45">Your progress</p>
              <ol className="space-y-1">
                {visibleSteps.map((item, index) => {
                  const current = item.key === step;
                  const past = index < activeIndex;
                  return (
                    <li key={item.key} className="relative flex items-center gap-3 py-3">
                      {index < visibleSteps.length - 1 && <span className={`fo-step-line absolute left-[11px] top-[35px] h-7 w-px ${past ? "bg-[#f2a8c4]" : "bg-white/15"}`} />}
                      <span className={`z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${past || current ? "bg-[#c8497a] text-white" : "bg-white/10 text-white/45"}`}>
                        {past ? <Check size={13} strokeWidth={3} /> : index + 1}
                      </span>
                      <span className={`fo-progress-label text-[12px] ${current ? "font-bold text-white" : past ? "text-white/75" : "text-white/40"}`}>{item.label}</span>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>
          <button onClick={() => window.alert("Signed out safely. You can return to finish setup later.")} className="hidden items-center gap-2 text-[11px] font-bold uppercase tracking-[.15em] text-white/60 transition-colors hover:text-white md:flex">
            <LogOut size={15} /> Sign out
          </button>
        </aside>

        <main className="fo-content flex min-w-0 flex-1 flex-col justify-center px-8 py-14 md:px-16 lg:px-24">
          <div className="mx-auto w-full max-w-[720px]">
            <div className="fo-fade mb-10 flex items-center justify-between border-b border-[#d7e5e4] pb-5">
              <div className="fo-progress flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#26313d]">
                <span className="text-[#c8497a]">Step {activeIndex + 1}</span>
                <span className="text-[#9db1b0]">of {visibleSteps.length}</span>
              </div>
              <span className="text-[11px] font-semibold text-[#26313d]">Setup takes about 2 minutes</span>
            </div>

            {completed ? (
              <section className="fo-fade rounded-2xl border border-[#d7e5e4] bg-[#fbfdfc] p-8 shadow-[0_20px_55px_-35px_rgba(16,43,54,.5)] md:p-12">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#c8497a] text-white"><Check size={27} strokeWidth={2.5} /></div>
                <p className="mt-8 text-[10px] font-bold uppercase tracking-[.2em] text-[#c8497a]">Setup complete</p>
                <h2 className="fo-serif mt-3 text-4xl leading-tight text-[#102b36]">Welcome to your workspace.</h2>
                <p className="mt-4 max-w-lg text-[15px] leading-7 text-[#17212b]">Your account is ready. Next, you can visit Account and team settings whenever you need to manage your workspace.</p>
                <button onClick={() => window.alert("Opening Account and team settings")} className="fo-primary mt-8 inline-flex items-center gap-3 rounded-md bg-[#c8497a] px-5 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-white">Go to account settings <ArrowRight size={15} /></button>
              </section>
            ) : (
              <section className="fo-fade fo-delay">
                {step === "account" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#c8497a]">01 / Workspace identity</p>
                    <h2 className="fo-serif mt-4 text-4xl leading-tight text-[#102b36] md:text-[46px]">How will you use AIO Fusion?</h2>
                    <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#17212b]">Choose the account type that best describes your work. You can update this later in settings.</p>
                    <div className="fo-options mt-9 grid grid-cols-2 gap-4">
                      <button aria-pressed={accountType === "agency"} onClick={() => setAccountType("agency")} className="fo-choice rounded-xl border-2 border-[#c8497a] bg-[#fff7fa] p-5 text-left shadow-[0_0_0_1px_#c8497a]">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#102b36] text-white"><Building2 size={18} /></span>
                        <strong className="mt-4 block text-[15px]">Agency / Partner</strong>
                        <span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Manage communications for multiple client workspaces.</span>
                      </button>
                      <button aria-pressed={accountType === "client"} onClick={() => setAccountType("client")} className="fo-choice rounded-xl border-2 border-[#d7e5e4] bg-[#fbfdfc] p-5 text-left">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#c8497a] text-white"><UserRound size={18} /></span>
                        <strong className="mt-4 block text-[15px]">Client</strong>
                        <span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Manage communications for your own brand.</span>
                      </button>
                    </div>
                  </>
                )}
                {step === "company" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#c8497a]">02 / Workspace identity</p>
                    <h2 className="fo-serif mt-4 text-4xl leading-tight text-[#102b36] md:text-[46px]">Tell us about your company.</h2>
                    <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#17212b]">These details help personalize your workspace and account settings.</p>
                    <div className="mt-9 space-y-5">
                      <label className="block"><span className="mb-2 block text-[12px] font-bold">Company name</span><span className="flex items-center gap-3 rounded-lg border border-[#bcd2d1] bg-[#fbfdfc] px-4"><Building2 size={17} className="text-[#c8497a]" /><input value={company} onChange={(event) => setCompany(event.target.value)} className="w-full bg-transparent py-3.5 text-[14px] outline-none" /></span></label>
                      <label className="block"><span className="mb-2 block text-[12px] font-bold">Company website</span><span className="flex items-center gap-3 rounded-lg border border-[#bcd2d1] bg-[#fbfdfc] px-4"><Globe2 size={17} className="text-[#102b36]" /><input value={website} onChange={(event) => setWebsite(event.target.value)} className="w-full bg-transparent py-3.5 text-[14px] outline-none" /></span></label>
                    </div>
                  </>
                )}
                {step === "access" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#c8497a]">03 / Access</p>
                    <h2 className="fo-serif mt-4 text-4xl leading-tight text-[#102b36] md:text-[46px]">Choose how to start.</h2>
                    <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#17212b]">Start with the existing 60-day beta, or choose a paid plan for full access. Your choice is required to continue.</p>
                    <div className="fo-options mt-9 grid grid-cols-2 gap-4">
                      <button aria-pressed={choice === "beta"} onClick={() => setChoice("beta")} className="fo-choice rounded-xl border-2 border-[#d7e5e4] bg-[#fbfdfc] p-6 text-left">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#c8497a] text-white"><Sparkles size={19} /></span>
                        <strong className="mt-5 block text-[17px]">60-day beta</strong>
                        <span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Explore the platform with no card or billing address required.</span>
                        <span className="mt-5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#c8497a]">No payment today</span>
                      </button>
                      <button aria-pressed={choice === "paid"} onClick={() => setChoice("paid")} className="fo-choice rounded-xl border-2 border-[#d7e5e4] bg-[#fbfdfc] p-6 text-left">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#102b36] text-white"><CreditCard size={19} /></span>
                        <strong className="mt-5 block text-[17px]">Paid plan</strong>
                        <span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Add billing details, then continue securely through Stripe.</span>
                        <span className="mt-5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#102b36]">Full access</span>
                      </button>
                    </div>
                    {!choice && <p className="mt-5 text-[12px] font-semibold text-[#8d3458]">Select one option to continue.</p>}
                  </>
                )}
                {step === "billing" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#c8497a]">04 / Billing</p>
                    <h2 className="fo-serif mt-4 text-4xl leading-tight text-[#102b36] md:text-[46px]">Add billing details.</h2>
                    <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#17212b]">Save your company details before continuing to secure Stripe checkout.</p>
                    <div className="mt-9 rounded-xl border border-[#d7e5e4] bg-[#fbfdfc] p-6"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#c8497a]">Paid plan selected</p><p className="mt-2 text-[14px] leading-6 text-[#17212b]">You will review your plan and payment schedule in Stripe next.</p></div>
                  </>
                )}
                <div className="mt-10 flex items-center justify-between border-t border-[#d7e5e4] pt-6">
                  <button onClick={goBack} disabled={step === "account"} className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#26313d] disabled:invisible"><ArrowLeft size={15} /> Back</button>
                  <button onClick={advance} disabled={!canContinue} className="fo-primary inline-flex items-center gap-3 rounded-md bg-[#c8497a] px-6 py-3.5 text-[11px] font-bold uppercase tracking-[.14em] text-white">{step === "billing" ? "Continue to Stripe" : "Continue"} <ArrowRight size={15} /></button>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default FocusedOnboarding;
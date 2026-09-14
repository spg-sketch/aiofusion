import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  FileText,
  LockKeyhole,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";
import "./EmbeddedOnboarding.css";

type Step = "account" | "company" | "access" | "billing";
type Choice = "beta" | "paid" | null;

const steps: { id: Step; label: string; icon: typeof User }[] = [
  { id: "account", label: "Account type", icon: User },
  { id: "company", label: "Company details", icon: Building2 },
  { id: "access", label: "Trial or plan", icon: CheckCircle2 },
  { id: "billing", label: "Billing", icon: CreditCard },
];

export function EmbeddedOnboarding() {
  const [step, setStep] = useState<Step>("access");
  const [choice, setChoice] = useState<Choice>(null);
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [finished, setFinished] = useState(false);

  const activeIndex = steps.findIndex((item) => item.id === step);
  const visibleSteps = choice === "paid" || step === "billing" ? steps : steps.slice(0, 3);

  function continueStep() {
    if (step === "access") {
      if (choice === "paid") setStep("billing");
      else if (choice === "beta") setFinished(true);
      return;
    }
    if (step === "billing") setFinished(true);
    if (step === "account") setStep("company");
    if (step === "company" && company.trim() && website.trim()) setStep("access");
  }

  return (
    <div className="embedded-onboarding">
      <header className="border-b border-[#dce9e9] bg-[#fbfdfc]/90 px-6 py-5 backdrop-blur md:px-14">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between">
          <div className="flex items-center gap-5">
            <img src="/__mockup/images/account-settings/logo-color.png" alt="AIO Fusion" className="h-14 w-auto md:h-[64px]" />
            <span className="hidden h-7 w-px bg-[#dce9e9] md:block" />
            <span className="hidden text-[11px] font-semibold uppercase tracking-[.2em] text-[#26313d] md:block">Workspace admin</span>
          </div>
          <button className="eo-lift flex items-center gap-2 rounded-md bg-[#102b36] px-4 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-[#f7fbfa] hover:bg-[#17677a]">
            <ArrowLeft size={15} /> Save and exit
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-6 py-9 md:px-14 md:py-14">
        <div className="eo-rise mb-10 flex flex-col justify-between gap-5 border-b border-[#dce9e9] pb-8 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C8497A40] bg-[#FBE3ED] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-[#C8497A]">
              <LockKeyhole size={12} /> Account setup
            </div>
            <h1 className="eo-serif text-4xl leading-tight text-[#102b36] md:text-[48px]">Set up your workspace</h1>
            <p className="mt-3 max-w-[650px] text-[15px] leading-7 text-[#17212b]">
              A few details before you enter account and team settings. Your progress is saved as you go.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[12px] font-semibold text-[#17212b]">
            <span className="h-2 w-2 rounded-full bg-[#3d9c74]" /> Step {Math.min(activeIndex + 1, 3)} of {visibleSteps.length}
          </div>
        </div>

        <div className="eo-layout grid grid-cols-[220px_minmax(0,1fr)] gap-10 xl:gap-16">
          <aside className="eo-aside sticky top-6 h-fit">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.22em] text-[#26313d]">Setup progress</p>
            <ul className="eo-step-list space-y-1">
              {visibleSteps.map(({ id, label, icon: Icon }, index) => {
                const active = id === step;
                const past = index < activeIndex;
                return (
                  <li key={id}>
                    <button onClick={() => !past && setStep(id)} disabled={past} className={`eo-nav-button eo-step flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[13px] ${active ? "eo-nav-button-active bg-[#FBE3ED] font-bold" : past ? "cursor-default font-semibold text-[#52606b]" : "font-semibold text-[#0a1628]"}`}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${index % 2 === 0 ? "bg-[#C8497A]" : "bg-[#0a1628]"}`}>
                        {past ? <Check size={15} strokeWidth={3} /> : <Icon size={15} />}
                      </span>
                      <span className="eo-step-label">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8 rounded-xl border border-[#dce9e9] bg-[#edf7f6] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#0a1628]">You are in setup</p>
              <p className="mt-2 text-[12px] leading-5 text-[#17212b]">Account sections stay locked until these essentials are complete.</p>
            </div>
          </aside>

          <section className="min-w-0">
            {finished ? (
              <div className="eo-rise rounded-2xl border border-[#dce9e9] bg-[#fbfdfc] p-8 shadow-[0_15px_40px_-30px_rgba(13,69,86,.4)] md:p-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e7f5ec] text-[#287d4d]"><Check size={24} /></div>
                <p className="mt-7 text-[10px] font-bold uppercase tracking-[.2em] text-[#C8497A]">Setup complete</p>
                <h2 className="eo-serif mt-3 text-3xl text-[#102b36]">Welcome to your account settings</h2>
                <p className="mt-3 max-w-xl text-[14px] leading-7 text-[#17212b]">Your workspace is ready. You can now manage your profile, team members, security, and billing from one place.</p>
                <button onClick={() => setFinished(false)} className="mt-8 inline-flex items-center gap-2 rounded-md bg-[#C8497A] px-5 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-white hover:brightness-110">Review setup <ArrowRight size={15} /></button>
              </div>
            ) : (
              <div className="eo-rise eo-delay rounded-2xl border border-[#dce9e9] bg-[#fbfdfc] p-7 shadow-[0_15px_40px_-30px_rgba(13,69,86,.4)] md:p-10">
                {step === "access" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#C8497A]">Step 3 · Access</p>
                    <h2 className="eo-serif mt-3 text-3xl text-[#102b36] md:text-[36px]">Choose how to start</h2>
                    <p className="mt-3 max-w-2xl text-[14px] leading-7 text-[#17212b]">Make an explicit choice for this workspace. The 60-day beta needs no card. A paid plan continues to billing and secure Stripe checkout.</p>
                    <div className="eo-options mt-8 grid grid-cols-2 gap-4">
                      <button onClick={() => setChoice("beta")} aria-pressed={choice === "beta"} className={`eo-option eo-lift rounded-xl border-2 p-5 text-left ${choice === "beta" ? "border-[#C8497A] bg-[#FDF0F5] shadow-[0_0_0_1px_#C8497A]" : "border-[#e2e8f0] bg-[#fbfdfc] hover:border-[#E3A2BB]"}`}>
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#0a1628] text-white"><CheckCircle2 size={18} /></div>
                        <span className="block text-[16px] font-bold text-[#0a1628]">60-day beta</span>
                        <span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Explore the platform with no card or billing address required.</span>
                        {choice === "beta" && <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#C8497A]"><Check size={12} /> Selected</span>}
                      </button>
                      <button onClick={() => setChoice("paid")} aria-pressed={choice === "paid"} className={`eo-option eo-lift rounded-xl border-2 p-5 text-left ${choice === "paid" ? "border-[#C8497A] bg-[#FDF0F5] shadow-[0_0_0_1px_#C8497A]" : "border-[#e2e8f0] bg-[#fbfdfc] hover:border-[#E3A2BB]"}`}>
                        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#C8497A] text-white"><CreditCard size={18} /></div>
                        <span className="block text-[16px] font-bold text-[#0a1628]">Paid plan</span>
                        <span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Add billing details next, then continue to secure Stripe checkout.</span>
                        {choice === "paid" && <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#C8497A]"><Check size={12} /> Selected</span>}
                      </button>
                    </div>
                    <div className="mt-8 flex flex-col justify-between gap-4 border-t border-[#e4eeed] pt-6 sm:flex-row sm:items-center">
                      <p className="text-[12px] leading-5 text-[#52606b]">{choice === "paid" ? "Continue will open billing details." : choice === "beta" ? "Continue will finish setup and open account settings." : "Select one option to continue."}</p>
                      <button onClick={continueStep} disabled={!choice} className="inline-flex items-center justify-center gap-2 rounded-md bg-[#C8497A] px-5 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">Continue <ArrowRight size={15} /></button>
                    </div>
                  </>
                )}
                {step === "company" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#C8497A]">Step 2 · Workspace</p>
                    <h2 className="eo-serif mt-3 text-3xl text-[#102b36]">Tell us about your company</h2>
                    <div className="mt-8 space-y-5">
                      <label className="block text-[12px] font-bold text-[#0a1628]">Company name<input className="eo-input mt-2 w-full rounded-lg border border-[#b7cecf] bg-white px-4 py-3 text-[14px] text-[#0a1628]" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Your company name" /></label>
                      <label className="block text-[12px] font-bold text-[#0a1628]">Company website<input className="eo-input mt-2 w-full rounded-lg border border-[#b7cecf] bg-white px-4 py-3 text-[14px] text-[#0a1628]" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" /></label>
                    </div>
                    <button onClick={continueStep} disabled={!company.trim() || !website.trim()} className="mt-8 inline-flex items-center gap-2 rounded-md bg-[#C8497A] px-5 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-white disabled:opacity-40">Continue <ArrowRight size={15} /></button>
                  </>
                )}
                {step === "billing" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#C8497A]">Step 4 · Billing</p>
                    <h2 className="eo-serif mt-3 text-3xl text-[#102b36]">Billing details</h2>
                    <p className="mt-3 max-w-xl text-[14px] leading-7 text-[#17212b]">Save your billing information, then continue to secure Stripe checkout. No project is created during onboarding.</p>
                    <div className="mt-7 rounded-xl border border-[#dce9e9] bg-[#edf7f6] p-5"><div className="flex items-center gap-3"><FileText size={18} className="text-[#17677a]" /><span className="text-[13px] font-bold">Billing information form</span></div><p className="mt-2 text-[12px] text-[#17212b]">Company address and billing contact will be collected here.</p></div>
                    <button onClick={continueStep} className="mt-8 inline-flex items-center gap-2 rounded-md bg-[#C8497A] px-5 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-white">Continue to Stripe <ArrowRight size={15} /></button>
                  </>
                )}
                {step === "account" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#C8497A]">Step 1 · Identity</p>
                    <h2 className="eo-serif mt-3 text-3xl text-[#102b36]">Choose your account type</h2>
                    <div className="mt-8 grid gap-4 sm:grid-cols-2"><button onClick={continueStep} className="eo-lift rounded-xl border-2 border-[#e2e8f0] p-5 text-left"><Users className="mb-4 text-[#C8497A]" /><strong className="block text-[14px]">Agency / Partner</strong><span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Manage multiple client workspaces.</span></button><button onClick={continueStep} className="eo-lift rounded-xl border-2 border-[#e2e8f0] p-5 text-left"><User className="mb-4 text-[#0a1628]" /><strong className="block text-[14px]">Client</strong><span className="mt-2 block text-[12px] leading-5 text-[#17212b]">Manage one focused brand workspace.</span></button></div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default EmbeddedOnboarding;
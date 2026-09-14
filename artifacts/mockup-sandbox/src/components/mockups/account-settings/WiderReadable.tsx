import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";
import "./WiderReadable.css";

const navItems = [
  { label: "Profile & workspace", icon: User },
  { label: "Sign-in & security", icon: ShieldCheck },
  { label: "Billing details", icon: FileText },
  { label: "Team members", icon: Users },
];

export function WiderReadable() {
  const [activeNav, setActiveNav] = useState("Profile & workspace");
  const [accountType, setAccountType] = useState<"client" | "agency">("client");
  const [linked, setLinked] = useState(false);

  return (
    <div className="readable-settings min-h-screen">
      <header className="border-b border-[#dce9e9] bg-[#fbfdfc]/90 px-8 py-5 backdrop-blur md:px-14">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between">
          <div className="flex items-center gap-5">
            <img src="/__mockup/images/account-settings/logo-color.png" alt="AIO Fusion" className="h-16 w-auto md:h-[72px]" />
            <span className="hidden h-7 w-px bg-[#dce9e9] md:block" />
            <span className="hidden text-[11px] font-semibold uppercase tracking-[.2em] text-[#66818a] md:block">Workspace admin</span>
          </div>
          <button className="lift flex items-center gap-2 rounded-md bg-[#102b36] px-5 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-[#f7fbfa] hover:bg-[#17677a]">
            <ArrowLeft size={15} /> Back to platform
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-6 py-10 md:px-14 md:py-16">
        <div className="fade-up mb-11 flex flex-col justify-between gap-6 border-b border-[#dce9e9] pb-9 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d4a1b7] bg-[#fff3f7] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-[#b33e6b]">
              <User size={12} /> Account and team settings
            </div>
            <h1 className="serif text-4xl leading-tight text-[#102b36] md:text-[50px]">Account and team settings</h1>
            <p className="mt-3 max-w-[560px] text-[15px] leading-7 text-[#607783]">
              Manage your account settings, team members, and security options from one clear workspace.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[12px] font-semibold text-[#607783]">
            <span className="h-2 w-2 rounded-full bg-[#3d9c74]" /> Secure account controls
          </div>
        </div>

        <div className="settings-layout grid grid-cols-[220px_minmax(0,1fr)] gap-10 xl:gap-16">
          <aside className="settings-nav sticky top-6 h-fit">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.22em] text-[#78919a]">My account</p>
            <ul className="nav-list space-y-1">
              {navItems.map(({ label, icon: Icon }) => {
                const active = activeNav === label;
                return (
                  <li key={label}>
                    <button
                      onClick={() => setActiveNav(label)}
                      className={`nav-button flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-[13px] ${active ? "bg-[#dff0ee] font-bold text-[#17677a]" : "font-medium text-[#607783]"}`}
                    >
                      <span className="flex items-center gap-3"><Icon size={16} /> {label}</span>
                      {active && <ChevronRight size={14} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-9 rounded-xl border border-[#cde2e0] bg-[#eaf5f3] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#17677a]">Need a hand?</p>
              <p className="mt-2 text-[12px] leading-5 text-[#56727b]">Our support team is here when a setting needs a second look.</p>
              <button className="mt-3 text-[11px] font-bold uppercase tracking-[.12em] text-[#17677a] hover:text-[#c8497a]">Contact support</button>
            </div>
          </aside>

          <section className="min-w-0">
            {activeNav !== "Profile & workspace" ? (
              <div className="fade-up rounded-2xl border border-[#dce9e9] bg-[#fbfdfc] p-8 shadow-[0_15px_40px_-30px_rgba(13,69,86,.4)] md:p-12">
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#17677a]">Settings area</p>
                <h2 className="serif mt-3 text-3xl">{activeNav}</h2>
                <p className="mt-3 max-w-lg text-[14px] leading-7 text-[#607783]">This section is ready for your workspace controls. Choose Profile &amp; workspace to return to the account overview.</p>
                <button onClick={() => setActiveNav("Profile & workspace")} className="mt-7 rounded-md bg-[#17677a] px-5 py-3 text-[11px] font-bold uppercase tracking-[.14em] text-white hover:bg-[#0d4556]">Return to profile</button>
              </div>
            ) : (
              <>
                <div className="fade-up lift rounded-2xl border border-[#dce9e9] bg-[#fbfdfc] p-7 shadow-[0_15px_40px_-30px_rgba(13,69,86,.4)] md:p-9">
                  <div className="mb-7 flex items-start justify-between gap-5">
                    <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#17677a]">Workspace identity</p><h2 className="serif mt-2 text-2xl">Account type</h2><p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#607783]">Controls how your dashboard is set up, whether you manage multiple clients or one brand.</p></div>
                    <Building2 className="hidden text-[#9bc4c3] sm:block" size={28} strokeWidth={1.5} />
                  </div>
                  <div className="account-options grid grid-cols-2 gap-4">
                    <button onClick={() => setAccountType("agency")} className={`lift rounded-xl border-2 p-5 text-left ${accountType === "agency" ? "border-[#17677a] bg-[#edf7f6]" : "border-[#e2eceb] bg-[#fbfdfc] hover:border-[#a8cdca]"}`}>
                      <div className="mb-3 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e8f0ef]"><Building2 size={18} className="text-[#607783]" /></div><span className="text-[14px] font-bold">Agency / Partner</span></div>
                      <p className="text-[12px] leading-5 text-[#607783]">Manage PR for multiple clients. Create Client Projects and view all dashboards from one place.</p>
                    </button>
                    <button onClick={() => setAccountType("client")} className={`lift rounded-xl border-2 p-5 text-left ${accountType === "client" ? "border-[#17677a] bg-[#edf7f6] shadow-[0_0_0_1px_#17677a]" : "border-[#e2eceb] bg-[#fbfdfc] hover:border-[#a8cdca]"}`}>
                      <div className="mb-3 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#17677a]"><User size={18} color="white" /></div><div><p className="text-[14px] font-bold">Client</p><span className="text-[10px] font-bold uppercase tracking-[.14em] text-[#17677a]">{accountType === "client" ? "Current" : "Select"}</span></div></div>
                      <p className="text-[12px] leading-5 text-[#607783]">Manage PR for your own brand. One focused workspace for all your projects.</p>
                    </button>
                  </div>
                </div>

                <div className="fade-up delay-1 lift mt-6 rounded-2xl border border-[#dce9e9] bg-[#fbfdfc] p-7 shadow-[0_15px_40px_-30px_rgba(13,69,86,.4)] md:p-9">
                  <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#17677a]">Signed-in identity</p><h2 className="serif mt-2 text-2xl">Your profile</h2><p className="mt-2 text-[14px] leading-6 text-[#607783]">This is the person currently signed in to AIO Fusion.</p>
                  <p className="mt-5 max-w-3xl text-[14px] leading-6 text-[#607783]">Linking is optional. If you would like to link your account to an existing Google or Microsoft account, please select below.</p>
                  <div className="profile-row mt-7 flex items-center gap-4 border-t border-[#e4eeed] pt-6">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fff0f5] text-[#c8497a]"><User size={19} /></div>
                    <div className="min-w-0 flex-1"><p className="text-[15px] font-bold">Spencer Gallagher</p><div className="mt-1 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f5ec] px-2 py-1 text-[9px] font-bold uppercase tracking-[.14em] text-[#287d4d]"><CheckCircle2 size={11} /> Signed in</span><span className="truncate text-[12px] font-medium text-[#607783]">spencer@vibestudio.agency</span></div></div>
                    <button onClick={() => setLinked(!linked)} className={`link-button rounded-md border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[.11em] transition-colors ${linked ? "border-[#9ccdb4] bg-[#e7f5ec] text-[#287d4d]" : "border-[#b7cecf] text-[#17677a] hover:border-[#17677a] hover:bg-[#edf7f6]"}`}>{linked ? <><Check size={13} className="mr-1 inline" /> Microsoft linked</> : "Link Microsoft account"}</button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default WiderReadable;
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import "./_group.css";

const navItems = [
  { label: "Profile & workspace", icon: User, active: true },
  { label: "Sign-in & security", icon: ShieldCheck },
  { label: "Billing details", icon: FileText },
  { label: "Team members", icon: Users },
];

export function Current() {
  return (
    <div className="account-settings-mockup min-h-screen bg-[#f8fafc]">
      <header className="flex items-center justify-between border-b border-[#e2e8f0] px-10 py-6">
        <img
          src="/__mockup/images/account-settings/logo-color.png"
          alt="AIO Fusion"
          className="h-24 w-auto"
        />
        <button className="flex items-center gap-2 bg-[#0a1628] px-7 py-3.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#f8fafc]">
          <ArrowLeft size={16} /> Back to platform
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-10 py-14">
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C8497A40] bg-[#FBE3ED] px-3 py-1.5">
            <User size={12} color="#C8497A" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#C8497A]">
              Account and team settings
            </span>
          </div>
          <h1 className="font-['Alice'] text-4xl leading-[1.1] text-[#0a1628]">
            Account and team settings
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] font-light leading-[1.7] text-[#475569]">
            Manage your account settings, team members, and security options.
          </p>
        </div>

        <div className="flex items-start gap-10">
          <aside className="sticky top-6 w-56 shrink-0">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#94a3b8]">
              My account
            </p>
            <ul className="space-y-0.5">
              {navItems.map(({ label, icon: Icon, active }) => (
                <li key={label}>
                  <button
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] ${
                      active
                        ? "bg-[#FBE3ED] font-bold text-[#C8497A]"
                        : "font-medium text-[#475569]"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="mb-6 rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-[0_8px_24px_-12px_rgba(16,43,54,0.08)]">
              <h2 className="font-['Alice'] text-[16px] font-bold">Account type</h2>
              <p className="mb-5 mt-1 text-[13px] font-light leading-[1.7] text-[#475569]">
                Controls how your dashboard is set up - whether you manage multiple clients or one brand.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button className="rounded-xl border-2 border-[#e2e8f0] p-5 text-left">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f1f5f9]">
                      <Building2 size={16} color="#64748b" />
                    </div>
                    <span className="text-[14px] font-bold">Agency / Partner</span>
                  </div>
                  <p className="text-[12px] leading-[1.6] text-[#475569]">
                    Manage PR for multiple clients. Create Client Projects and view all dashboards from one place.
                  </p>
                </button>
                <button className="rounded-xl border-2 border-[#1A647B] bg-[#EDF6F9] p-5 text-left shadow-[0_0_0_1px_#1A647B]">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1A647B]">
                      <User size={16} color="white" />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold">Client</p>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A647B]">
                        Current
                      </span>
                    </div>
                  </div>
                  <p className="text-[12px] leading-[1.6] text-[#475569]">
                    Manage PR for your own brand. One focused workspace for all your projects.
                  </p>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-[0_8px_24px_-12px_rgba(16,43,54,0.08)]">
              <h2 className="font-['Alice'] text-[16px] font-bold">Your profile</h2>
              <p className="mb-4 mt-1 text-[13px] leading-[1.6] text-[#64748b]">
                This is the person currently signed in to AIO Fusion.
              </p>
              <p className="mb-4 text-[13.5px] leading-[1.65] text-[#475569]">
                Linking is optional - if you would like to link your account to an existing Google or Microsoft account, please select below.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FBE3ED] text-[#C8497A]">
                  <User size={18} />
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-bold">Spencer Gallagher</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#1B7A3E]">
                      <CheckCircle2 size={10} /> Signed in
                    </span>
                    <span className="text-[12px] font-medium text-[#64748b]">spencer@vibestudio.agency</span>
                  </div>
                </div>
                <button className="rounded-full border border-[#cbd5e1] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#334155]">
                  Link Microsoft account
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
import { CreditCard, LogOut, Mail } from "lucide-react";
import { vars } from "../marketing/vars";

const ink = "#0a1628";
const accent = "#C8497A";
const accentSoft = "#FBE3ED";
const paper = "#f8fafc";

// Minimal view for billing-role team members: they have no access to project
// data or platform tools — only billing/invoice matters.
export function BillingOnlyPage({ workspace, onSignOut }: { workspace: string; onSignOut: () => void }) {
  return (
    <div className="min-h-screen font-['Inter',sans-serif]" style={{ background: paper, color: ink }}>
      <header className="px-4 sm:px-10 py-4 sm:py-6 flex items-center justify-between" style={{ borderBottom: `1px solid ${vars.g200}` }}>
        <img src={`${import.meta.env.BASE_URL}images/logo-color.png`} alt="AIO Fusion" className="h-16 sm:h-20" />
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-80"
          style={{ background: ink, color: paper }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4" style={{ background: accentSoft, border: `1px solid ${accent}40` }}>
          <CreditCard size={12} color={accent} />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>Billing access</span>
        </div>
        <h1 className="text-3xl leading-[1.15] mb-3" style={{ fontFamily: "'Alice', Georgia, serif" }}>
          Billing &amp; invoices — {workspace}
        </h1>
        <p className="text-[14px] font-light leading-[1.7] mb-8" style={{ color: vars.g600 }}>
          Your team role gives you access to billing and invoice matters only. Project data and platform tools are not
          included in the billing role — an account owner or admin can change your role at any time.
        </p>
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: "white", border: `1px solid ${vars.g200}`, boxShadow: "0 8px 24px -12px rgba(16,43,54,0.08)" }}>
          <h2 className="text-[16px] font-bold mb-3" style={{ fontFamily: "'Alice', Georgia, serif" }}>Invoices &amp; billing queries</h2>
          <p className="text-[13px] leading-[1.65] mb-5" style={{ color: vars.g600 }}>
            Invoices for this account are issued by email. For copies of past invoices, billing changes, or payment
            queries, contact our billing team and include your workspace name (<strong style={{ color: ink }}>{workspace}</strong>).
          </p>
          <a
            href={`mailto:info@aiofusion.ai?subject=${encodeURIComponent(`Billing query — ${workspace}`)}`}
            className="inline-flex items-center gap-2 px-6 py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] transition-all hover:opacity-90"
            style={{ background: ink, color: "#fff" }}
          >
            <Mail size={14} /> Contact billing
          </a>
        </div>
      </div>
    </div>
  );
}

export default BillingOnlyPage;

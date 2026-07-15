import { Mail, Users, BookOpen, ArrowUpRight } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { vars } from "./vars";

export default function ContactPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Get in touch" eyebrow={<><Mail size={12} /> Contact</> as any} {...props}>
      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        Get in touch to book a platform demo and enquire about pricing.
      </p>
      <div className="space-y-3">
        <a href="mailto:info@aiofusion.ai" className="flex items-center gap-4 p-5 rounded-2xl border bg-white transition-all hover:shadow-md" style={{ borderColor: vars.g200 }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(31,116,143,0.08)" }}>
            <Mail size={20} color={vars.accent} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g400 }}>Email</p>
            <p className="text-[16px] font-semibold" style={{ color: vars.navy }}>info@aiofusion.ai</p>
          </div>
          <ArrowUpRight size={18} color={vars.accent} />
        </a>
        <a href="https://www.linkedin.com/company/aio-fusion" target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-5 rounded-2xl border bg-white transition-all hover:shadow-md" style={{ borderColor: vars.g200 }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(31,116,143,0.08)" }}>
            <Users size={20} color={vars.accent} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g400 }}>LinkedIn</p>
            <p className="text-[16px] font-semibold" style={{ color: vars.navy }}>Follow AIO Fusion</p>
          </div>
          <ArrowUpRight size={18} color={vars.accent} />
        </a>
        <a href="#" className="flex items-center gap-4 p-5 rounded-2xl border bg-white transition-all hover:shadow-md" style={{ borderColor: vars.g200 }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(31,116,143,0.08)" }}>
            <BookOpen size={20} color={vars.accent} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: vars.g400 }}>Substack</p>
            <p className="text-[16px] font-semibold" style={{ color: vars.navy }}>Subscribe to insights <span className="text-[12px] font-light italic" style={{ color: vars.g400 }}>(coming soon)</span></p>
          </div>
          <ArrowUpRight size={18} color={vars.accent} />
        </a>
      </div>
    </MarketingPage>
  );
}

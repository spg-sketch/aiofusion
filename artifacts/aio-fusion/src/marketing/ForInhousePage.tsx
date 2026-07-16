import { Globe, Mail, Check, Calendar } from "lucide-react";
import MarketingPage from "./MarketingPage";

export default function ForInhousePage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Where AIO meets PR and marketing" eyebrow={<><Globe size={12} /> For In-house Teams</> as any} {...props}>
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: "rgba(16,43,54,0.75)" }}>
        When an AI looks at your industry, do they see your business? With AI now playing a key role in business visibility and purchase vetting, AIO Fusion will transform the performance of your PR and marketing and put you in control.
      </p>
      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: "rgba(16,43,54,0.75)" }}>
        Make your communications work harder, build optimised plans and content fast, and measure your AI authority as it grows over time.
      </p>
      <h2 className="text-[20px] font-semibold mb-5" style={{ color: "#102B36", fontFamily: "'Alice', Georgia, serif" }}>What it does for you</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-10">
        {[
          { title: "AIO marketing strategy", desc: "Start your unified AI Authority, PR and marketing strategy across earned and owned media channels." },
          { title: "Create a PR programme at scale", desc: "Plan, optimise, speed-up and measure all your PR output without buying full agency service." },
          { title: "One cost-effective platform", desc: "All your optimised communications content managed and measured in one place delivering consistent, measurable outcomes from PR and marketing investment." },
          { title: "Measure your AI authority over time", desc: "See how each piece of content and marketing activity moves the needle on AI citation and recommendation." },
        ].map((it) => (
          <div key={it.title} className="p-4 rounded-xl bg-white" style={{ border: "1px solid rgba(16,43,54,0.08)" }}>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#FBE3ED" }}>
                <Check size={11} color="#C8497A" />
              </div>
              <div>
                <p className="text-[14px] font-semibold mb-0.5" style={{ color: "#102B36" }}>{it.title}</p>
                <p className="text-[13px] font-light leading-relaxed" style={{ color: "rgba(16,43,54,0.6)" }}>{it.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => props.onNavigate("contact")} className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110" style={{ background: "#C8497A" }}>
        <Calendar size={16} /> Book a Demo
      </button>
    </MarketingPage>
  );
}

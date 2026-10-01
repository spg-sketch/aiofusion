import { Globe, Check, Calendar } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import { vars } from "./vars";

export default function ForInhousePage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title={<>The AI visibility and GEO software for <span className="whitespace-nowrap">in-house</span> PR and marketing teams</>} eyebrow={<><Globe size={12} /> For In-house Teams</> as any} {...props}>
      <PageHead meta={PAGE_META["for-inhouse"]} />
      <p className="text-[17px] font-medium leading-[1.7] mb-2" style={{ color: "#102B36" }}>
        When an AI looks at your industry, do they see your business?
      </p>
      <p className="text-[17px] font-medium leading-[1.7] mb-5" style={{ color: "#102B36" }}>
        With AI now playing a key role in business visibility and purchase vetting, AIO Fusion helps you measure visibility across ChatGPT and Claude and puts you in control of your AI authority.
      </p>
      <p className="text-[15px] font-normal leading-[1.8] mb-8" style={{ color: "rgba(16,43,54,0.78)" }}>
        Make your communications work harder, build optimised plans and content fast, and measure your AI visibility as it grows over time without needing a separate monitoring platform.
      </p>
      <h2 className="text-[22px] font-semibold mb-5" style={{ color: "#102B36", fontFamily: "'Alice', Georgia, serif" }}>What it does for you</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {[
          { title: "AIO marketing strategy", desc: "Start your unified AI Authority, PR and marketing strategy across earned and owned media channels." },
          { title: "Create a PR programme at scale", desc: "Plan, optimise, speed-up and measure all your PR output without buying full agency service." },
          { title: "One cost-effective platform", desc: "All your optimised communications content managed and measured in one place delivering consistent, measurable outcomes from PR and marketing investment." },
          { title: "Measure your AI authority over time", desc: "See how each piece of content and marketing activity moves the needle on AI citation and recommendation." },
        ].map((it) => (
          <div key={it.title} className="p-4 rounded-xl bg-white" style={{ border: "2px solid #102B36" }}>
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#FBE3ED" }}>
                <Check size={11} color={vars.accent} />
              </div>
              <div>
                <p className="text-[14px] font-semibold mb-1" style={{ color: "#102B36" }}>{it.title}</p>
                <p className="text-[13px] font-normal leading-relaxed" style={{ color: "rgba(16,43,54,0.78)" }}>{it.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-6 rounded-2xl mb-8" style={{ background: "#FBE3ED", border: "1px solid rgba(200,73,122,0.25)" }}>
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: vars.accent }}>An AIO platform built by comms professionals</p>
        <p className="text-[14px] font-normal leading-[1.7] mb-3" style={{ color: "rgba(16,43,54,0.88)" }}>AIO Fusion was created by experts from the PR, business marketing and tech development worlds.</p>
        <p className="text-[14px] font-normal leading-[1.7] mb-3" style={{ color: "rgba(16,43,54,0.88)" }}>We've worked in agencies and we understand the pressures in-house PR and marketing professionals face every day. Our platform is designed with you in mind, to help you maximise the potential of your expertise and deliver measurable results that answer the communications challenges of the AI age.</p>
        <p className="text-[14px] font-normal leading-[1.7] mb-3" style={{ color: "rgba(16,43,54,0.88)" }}>It is the first end-to-end platform designed to automatically optimise and score your earned and owned media visibility with leading AI models such as ChatGPT and Claude.</p>
        <p className="text-[14px] font-normal leading-[1.7]" style={{ color: "rgba(16,43,54,0.88)" }}>We believe it will transform PR and marketing for good.</p>
      </div>
      <aside className="mb-8 p-5 rounded-xl bg-white" style={{ border: "1px solid rgba(16,43,54,0.1)" }}>
        <h2 className="text-[18px] font-semibold mb-3" style={{ color: "#102B36", fontFamily: "'Alice', Georgia, serif" }}>Build your AI visibility knowledge</h2>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-semibold">
          <a href={`${import.meta.env.BASE_URL}pricing`} className="underline underline-offset-4" style={{ color: vars.accent }}>Compare in-house plans</a>
        </div>
      </aside>
      <button type="button" onClick={() => props.onNavigate("contact")} className="flex w-full max-w-sm items-center justify-center gap-3 py-4 rounded-xl text-[14px] font-bold uppercase tracking-[0.12em] text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg" style={{ background: vars.accent }}>
        <Calendar size={18} /> Book a Demo
      </button>
    </MarketingPage>
  );
}

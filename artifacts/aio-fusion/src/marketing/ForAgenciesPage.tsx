import { Users, Calendar, Mail, Check } from "lucide-react";
import MarketingPage from "./MarketingPage";

export default function ForAgenciesPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Integrate AIO and content marketing automation into your client service" eyebrow={<><Users size={12} /> For PR Agencies</> as any} {...props}>
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: "rgba(16,43,54,0.75)" }}>
        Elevate your agency capability for the AI era with tailored, measurable optimisation for each client. One platform to enhance your team and service performance helping you harness the power of answer engines.
      </p>
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: "rgba(16,43,54,0.75)" }}>
        Run every client programme on a single platform built for the AI age. Optimise every piece of content you develop from press releases to awards entries, speed up new content development, score AI authority across your programme, store all client content in one place and measure and predict the impact of your work.
      </p>
      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: "rgba(16,43,54,0.75)" }}>
        Add AI visibility and automation to your agency fast without building your own tech stack or hiring new specialists.
      </p>
      <h2 className="text-[20px] font-semibold mb-5" style={{ color: "#102B36", fontFamily: "'Alice', Georgia, serif" }}>What it does for your agency</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-10">
        {[
          { title: "Multi-client management", desc: "Separate workspaces per client with their own project data, content pipeline, and reporting." },
          { title: "AIO with human editing", desc: "Develop AI optimised pitches, press releases, articles and marketing content fast from raw briefing content and edit to deliver maximum quality." },
          { title: "Dual-engine AI analysis", desc: "Every diagnostic runs through both Claude and ChatGPT for robust, balanced scoring. Expand LLM references for maximum AI intelligence." },
          { title: "Integrated comms planner", desc: "Plan your PR and marketing activity and score its likely impact on AI authority, manage each piece of content from draft to approved." },
          { title: "Marketing Intelligence", desc: "Research media contacts and future events and awards tailored to each client project, score activity for AI and audience reach." },
          { title: "Report and Content Library", desc: "Combine AI authority scores across earned and owned media with PR reporting and access all your client content in one dedicated, searchable content library." },
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
      <div className="p-6 rounded-2xl mb-10" style={{ background: "#FBE3ED", border: "1px solid rgba(200,73,122,0.25)" }}>
        <p className="text-[13px] font-semibold uppercase tracking-[0.2em] mb-3" style={{ color: "#C8497A" }}>An AIO platform built by comms professionals</p>
        <p className="text-[14px] font-light leading-[1.7] mb-3" style={{ color: "rgba(16,43,54,0.8)" }}>AIO Fusion was created by experts from the PR, business marketing and tech development worlds.</p>
        <p className="text-[14px] font-light leading-[1.7] mb-3" style={{ color: "rgba(16,43,54,0.8)" }}>We've worked in agencies and we understand the pressures in-house PR and marketing professionals face every day. Our platform is designed with you in mind, to help you maximise the potential of your expertise and deliver measurable results that answer the communications challenges of the AI age.</p>
        <p className="text-[14px] font-light leading-[1.7] mb-3" style={{ color: "rgba(16,43,54,0.8)" }}>It is the first end-to-end platform designed to automatically optimise and score your earned and owned media visibility with leading AI models such as ChatGPT and Claude.</p>
        <p className="text-[14px] font-light leading-[1.7]" style={{ color: "rgba(16,43,54,0.8)" }}>We believe it will transform PR and marketing for good.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => props.onNavigate("contact")} className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110" style={{ background: "#C8497A" }}>
          <Calendar size={16} /> Book a Demo
        </button>
        <a href="mailto:info@aiofusion.ai" className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold transition-all hover:bg-white" style={{ color: "#102B36", border: "1.5px solid #102B36" }}>
          <Mail size={16} /> Talk to Us
        </a>
      </div>
    </MarketingPage>
  );
}

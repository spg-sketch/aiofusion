import { Users, Mail } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { vars } from "./vars";

export default function AboutPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Designed by PR consultants. Built with deep tech expertise." eyebrow={<><Users size={12} /> About AIO Fusion</> as any} {...props}>
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: vars.g500 }}>
        AIO Fusion was created by experts from the PR, business marketing and tech development worlds to help in-house teams answer the communications challenges of the AI age.
      </p>
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: vars.g500 }}>
        It is the first end-to-end platform designed to automatically optimise and score your earned and owned media visibility with leading LLM agents such as ChatGPT and Claude.
      </p>
      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        Feed your business messaging, PR content and marketing plans into AIO Fusion and receive visibility diagnostics, planning advice, optimised content creation and measurement across it all. Our platform offers in-house teams a rapid, cost-effective route to achieving business visibility for AI and human audiences.
      </p>

      <h2 className="text-[24px] mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Built on decades of experience</h2>
      <p className="text-[15px] font-light leading-[1.8] mb-4" style={{ color: vars.g500 }}>
        AIO Fusion has been designed by B2B PR agency Simpatico PR, building on decades of experience in PR and journalism.
      </p>
      <p className="text-[15px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        Our ambition is to make the fusion of human expertise and a pioneering AI communications technology available to in-house PR and marketing teams as well as PR agencies and consultants - enabling you to leverage the power of answer engines with a single automated platform.
      </p>

      <a href="mailto:info@aiofusion.ai" className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110" style={{ background: vars.accent }}>
        <Mail size={16} /> Get in Touch
      </a>
    </MarketingPage>
  );
}

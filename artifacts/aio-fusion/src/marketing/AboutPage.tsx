import { Users, Mail } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import { vars } from "./vars";

export default function AboutPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Designed by PR consultants. Built with deep tech expertise." eyebrow={<><Users size={12} /> About AIO Fusion</> as any} {...props}>
      <PageHead meta={PAGE_META.about} />
      <p className="text-[16px] font-light leading-[1.8] mb-6" style={{ color: vars.g500 }}>
        AIO Fusion is a Generative Engine Optimisation (GEO) platform which measures in real time how visible your brand is to AI search engines such as ChatGPT and Claude.
      </p>
      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        The platform's suite of tools allows you to improve that visibility systematically through earned media and website content. Supporting PR and marketing strategy, media relations, measurement and reporting, AIO Fusion AI-optimises PR and marketing at scale, through one easy-to-use platform.
      </p>

      <h2 className="text-[24px] mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Built on decades of experience</h2>
      <p className="text-[15px] font-light leading-[1.8] mb-4" style={{ color: vars.g500 }}>
        AIO Fusion has been created by Patrick Barrett and Natalie Linder, building on decades of experience in PR and journalism.
      </p>
      <p className="text-[15px] font-light leading-[1.8] mb-4" style={{ color: vars.g500 }}>
        Designed specifically for PR and marketing professionals, AIO Fusion is the only integrated AI authority and PR platform built to enhance, elevate and streamline marketing and communication activities for both in-house and agency teams.
      </p>
      <p className="text-[15px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        Blending human creativity with AI capabilities, AIO Fusion brings together AI authority, PR and marketing strategy across earned and owned channels to maximise brand visibility in the age of AI.
      </p>

      <button onClick={() => props.onNavigate("contact")} className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110" style={{ background: vars.accent }}>
        <Mail size={16} /> Get in Touch
      </button>
    </MarketingPage>
  );
}

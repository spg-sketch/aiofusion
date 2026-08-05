import { ShieldCheck, Lock, Server, Users2, FileWarning, Mail } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import { vars } from "./vars";

function Item({ icon, title, children }: { icon: any; title: string; children: any }) {
  return (
    <div className="flex gap-4 p-5 rounded-2xl border bg-white mb-4" style={{ borderColor: vars.g200 }}>
      <div className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center" style={{ background: "rgba(31,116,143,0.08)" }}>
        {icon}
      </div>
      <div>
        <p className="text-[15px] font-semibold mb-1" style={{ color: vars.navy }}>{title}</p>
        <p className="text-[14px] font-light leading-[1.7]" style={{ color: vars.g500 }}>{children}</p>
      </div>
    </div>
  );
}

export default function TrustSecurityPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Trust & Security" eyebrow={<><ShieldCheck size={12} /> How we protect your data</> as any} {...props}>
      <PageHead meta={PAGE_META["trust-security"]} />
      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        AIO Fusion handles real business and communications data on behalf of our clients, so security is built into
        the platform rather than added on afterwards. This page summarises the controls we currently have in place.
      </p>

      <h2 className="text-[22px] mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Platform security</h2>
      <Item icon={<Lock size={18} color={vars.accent} />} title="Encrypted connections">
        All traffic to and from AIO Fusion is served over HTTPS. Session cookies are marked HttpOnly and Secure, and
        use a SameSite policy, which protects your login session from common web-based attacks.
      </Item>
      <Item icon={<Server size={18} color={vars.accent} />} title="Access control">
        Access to client projects is scoped and enforced on our servers &mdash; not just hidden in the interface &mdash; so
        one client account cannot see another's data. Administrative actions are restricted to authorised roles.
      </Item>
      <Item icon={<ShieldCheck size={18} color={vars.accent} />} title="No third-party trackers">
        We do not run third-party advertising or analytics scripts (no Google Analytics, no ad pixels) inside the
        platform. A strict content security policy limits what the app is allowed to load or connect to.
      </Item>
      <Item icon={<FileWarning size={18} color={vars.accent} />} title="Backups">
        Client project data is backed up on a regular automated schedule, with integrity checks before each backup
        is retained.
      </Item>

      <h2 className="text-[22px] mt-10 mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>How your data is used</h2>
      <Item icon={<Users2 size={18} color={vars.accent} />} title="Sub-processors">
        To generate audits and content, AIO Fusion sends the relevant project content to our AI providers (currently
        ChatGPT and Claude) for processing. We do not sell client data, and we do not use it to train third-party
        models beyond what is required to return a result to you.
      </Item>
      <Item icon={<Lock size={18} color={vars.accent} />} title="Data minimisation">
        We only collect what is needed to run the platform: your account details (name, email) and the project,
        content and audit data you or your team enter. See our Privacy Policy for the full list.
      </Item>

      <h2 className="text-[22px] mt-10 mb-4" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>Certifications</h2>
      <p className="text-[15px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        AIO Fusion does not currently hold formal certifications such as SOC 2 or ISO 27001. As a growing platform,
        we've prioritised building strong technical controls first (see above) and will pursue formal certification
        as our customer base and compliance requirements grow. If your organisation requires a security questionnaire
        to be completed as part of procurement, get in touch and we're happy to work through it directly.
      </p>

      <a href="mailto:info@aiofusion.ai?subject=Security%20Question" className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110" style={{ background: vars.accent }}>
        <Mail size={16} /> Ask us a security question
      </a>
    </MarketingPage>
  );
}

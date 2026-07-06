import { Mail } from "lucide-react";
import MarketingPage from "./MarketingPage";
import { vars } from "./vars";

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="mb-8">
      <h2 className="text-[20px] mb-3" style={{ color: vars.navy, fontFamily: "'Alice', Georgia, serif" }}>{title}</h2>
      <div className="text-[14px] font-light leading-[1.8] space-y-3" style={{ color: vars.g500 }}>{children}</div>
    </div>
  );
}

export default function TermsConditionsPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Terms &amp; Conditions" {...props}>
      <p className="text-[13px] font-light mb-8" style={{ color: vars.g400 }}>Last updated: 6 July 2026</p>

      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        These terms govern your use of the AIO Fusion website and platform (together, the "Service"), provided by
        AIO Fusion Ltd. By creating an account or using the Service, you agree to these terms.
      </p>

      <Section title="1. Who we are">
        <p>
          The Service is operated by <strong style={{ color: vars.navy }}>AIO Fusion Ltd</strong> (company number
          17303930), registered in England and Wales at Amelia House, Crescent Road, Worthing, West Sussex, United
          Kingdom, BN11 1RL ("AIO Fusion", "we", "us").
        </p>
      </Section>

      <Section title="2. The Service">
        <p>
          AIO Fusion is a platform that helps PR and marketing professionals audit, plan and create content aimed at
          improving visibility in AI answer engines (such as ChatGPT and other generative AI tools). Some features
          rely on third-party AI models to generate scores, assessments and content.
        </p>
      </Section>

      <Section title="3. Accounts">
        <p>
          You must provide accurate information when creating an account and keep your login credentials secure.
          You are responsible for all activity that happens under your account. Let us know immediately at{" "}
          <a href="mailto:info@aiofusion.ai" className="hover:underline" style={{ color: vars.accent }}>info@aiofusion.ai</a> if you believe your account has been compromised.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Break any applicable law, or infringe anyone else's intellectual property or other rights;</li>
          <li>Upload unlawful, defamatory, or harmful content;</li>
          <li>Attempt to gain unauthorised access to another account, our systems, or underlying infrastructure;</li>
          <li>Reverse-engineer, resell, or use the Service to build a directly competing product without our written consent.</li>
        </ul>
      </Section>

      <Section title="5. AI-generated content and accuracy">
        <p>
          Audit scores, assessments, and content produced by the Service are generated with the assistance of
          third-party AI models. While we design our prompts and scoring methodology to be grounded and
          repeatable, AI-generated output can be incomplete or inaccurate. You are responsible for reviewing any
          content or recommendations before publishing or relying on them, and the Service should not be treated
          as a substitute for professional legal, financial or PR judgement.
        </p>
      </Section>

      <Section title="6. Your content">
        <p>
          You retain ownership of the project, campaign and content data you enter into the platform. By using the
          Service, you grant us a licence to process that content solely to provide the Service to you (including
          sending it to our AI sub-processors as described in our Privacy Policy). We do not claim ownership of
          your content and do not use it for any purpose beyond delivering the Service.
        </p>
      </Section>

      <Section title="7. Fees and payment">
        <p>
          Where a paid plan applies, fees are as set out on our{" "}
          <button onClick={() => props.onNavigate("pricing")} className="hover:underline" style={{ color: vars.accent }}>Pricing</button> page or in your order/agreement with us. Fees are
          non-refundable except where required by law or expressly agreed in writing.
        </p>
      </Section>

      <Section title="8. Availability and changes to the Service">
        <p>
          We aim to keep the Service available and reliable, but we do not guarantee uninterrupted access. We may
          update, add to, or remove features from the Service from time to time, and we'll aim to give reasonable
          notice of any change that materially reduces functionality you rely on.
        </p>
      </Section>

      <Section title="9. Termination">
        <p>
          You may stop using the Service and close your account at any time. We may suspend or terminate access if
          you materially breach these terms, or where required to protect the security or integrity of the
          Service. On request, we will delete or return your data in line with our Privacy Policy.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the fullest extent permitted by law, AIO Fusion is not liable for any indirect, incidental, or
          consequential loss arising from your use of the Service, including loss of profits, business, or data.
          Nothing in these terms limits liability that cannot legally be limited or excluded, such as liability for
          death or personal injury caused by negligence, or for fraud.
        </p>
      </Section>

      <Section title="11. Governing law">
        <p>
          These terms are governed by the laws of England and Wales, and any disputes will be subject to the
          exclusive jurisdiction of the courts of England and Wales.
        </p>
      </Section>

      <Section title="12. Changes to these terms">
        <p>
          We may update these terms from time to time. If we make material changes, we'll update the "Last
          updated" date above and, where appropriate, notify you directly.
        </p>
      </Section>

      <Section title="13. Contact us">
        <p>
          Questions about these terms can be sent to <a href="mailto:info@aiofusion.ai" className="hover:underline" style={{ color: vars.accent }}>info@aiofusion.ai</a>, or by post to
          AIO Fusion Ltd, Amelia House, Crescent Road, Worthing, West Sussex, United Kingdom, BN11 1RL.
        </p>
      </Section>

      <a href="mailto:info@aiofusion.ai?subject=Terms%20Question" className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110" style={{ background: vars.accent }}>
        <Mail size={16} /> Ask us a question about these terms
      </a>
    </MarketingPage>
  );
}

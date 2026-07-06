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

export default function PrivacyPolicyPage(props: { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean }) {
  return (
    <MarketingPage title="Privacy Policy" {...props}>
      <p className="text-[13px] font-light mb-8" style={{ color: vars.g400 }}>Last updated: 6 July 2026</p>

      <p className="text-[16px] font-light leading-[1.8] mb-10" style={{ color: vars.g500 }}>
        This policy explains what personal data AIO Fusion Ltd collects, why, and the rights you have over it. It
        applies to the AIO Fusion website and platform (together, the "Service").
      </p>

      <Section title="1. Who we are">
        <p>
          The Service is operated by <strong style={{ color: vars.navy }}>AIO Fusion Ltd</strong> (company number
          17303930), registered in England and Wales at Amelia House, Crescent Road, Worthing, West Sussex, United
          Kingdom, BN11 1RL ("AIO Fusion", "we", "us"). We are the data controller for the personal data described
          in this policy.
        </p>
      </Section>

      <Section title="2. What data we collect">
        <p>We collect the following categories of data:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong style={{ color: vars.navy }}>Account data</strong> &mdash; name, email address, and login credentials, when you or your organisation register for the platform.</li>
          <li><strong style={{ color: vars.navy }}>Project and content data</strong> &mdash; the business, campaign and content information you or your team enter into the platform (e.g. audit inputs, planner entries, generated content) so we can run audits and generate results for you.</li>
          <li><strong style={{ color: vars.navy }}>Usage data</strong> &mdash; basic technical data such as IP address and browser type, used for security and to keep the Service running reliably.</li>
          <li><strong style={{ color: vars.navy }}>Communications</strong> &mdash; anything you send us directly, e.g. via the contact form or email, so we can respond to you.</li>
        </ul>
        <p>We do not run third-party advertising or analytics trackers inside the platform.</p>
      </Section>

      <Section title="3. How we use your data and our lawful basis">
        <p>We process personal data for the following purposes, under the lawful bases shown:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To provide and operate the platform you've signed up to &mdash; <em>performance of a contract</em>.</li>
          <li>To generate audits, scores, and content on your behalf, including sending relevant project content to our AI sub-processors &mdash; <em>performance of a contract</em>.</li>
          <li>To secure the Service and prevent misuse &mdash; <em>legitimate interests</em>.</li>
          <li>To respond to enquiries you send us &mdash; <em>legitimate interests</em> / <em>consent</em>, where applicable.</li>
        </ul>
      </Section>

      <Section title="4. Sub-processors and third parties">
        <p>
          To generate audits and content, AIO Fusion sends the relevant project content to our AI providers
          (currently ChatGPT and Claude) for processing. These providers act as our sub-processors and are
          contractually restricted from using your data to train their own models beyond what is required to
          return a result to you.
        </p>
        <p>We do not sell personal data to third parties.</p>
      </Section>

      <Section title="5. International transfers">
        <p>
          As we serve clients based in the EU/UK as well as elsewhere, some of our sub-processors may process data
          outside the UK/EEA. Where this happens, we rely on appropriate safeguards (such as the UK International
          Data Transfer Agreement or the EU Standard Contractual Clauses) to ensure your data continues to receive
          an equivalent level of protection.
        </p>
      </Section>

      <Section title="6. How long we keep data">
        <p>
          We retain account and project data for as long as your account is active, plus a reasonable period
          afterwards to comply with legal, accounting or security obligations. You can request earlier deletion at
          any time &mdash; see Section 7.
        </p>
      </Section>

      <Section title="7. Your rights">
        <p>If you are located in the UK or EU, data protection law gives you the following rights over your personal data:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong style={{ color: vars.navy }}>Access</strong> &mdash; ask us what personal data we hold on you.</li>
          <li><strong style={{ color: vars.navy }}>Rectification</strong> &mdash; ask us to correct inaccurate data.</li>
          <li><strong style={{ color: vars.navy }}>Erasure</strong> &mdash; ask us to delete your personal data ("right to be forgotten").</li>
          <li><strong style={{ color: vars.navy }}>Portability</strong> &mdash; ask us for a copy of your data in a machine-readable format.</li>
          <li><strong style={{ color: vars.navy }}>Restriction and objection</strong> &mdash; ask us to limit or stop certain processing.</li>
          <li><strong style={{ color: vars.navy }}>Complaint</strong> &mdash; you can lodge a complaint with the UK Information Commissioner's Office (ICO) or your local supervisory authority.</li>
        </ul>
        <p>
          To exercise any of these rights, email <a href="mailto:info@aiofusion.ai" className="hover:underline" style={{ color: vars.accent }}>info@aiofusion.ai</a>.
          We will respond within one calendar month.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          We use encryption in transit (HTTPS), scoped access controls, and regular backups to protect the data we
          hold. See our <button onClick={() => props.onNavigate("trust-security")} className="hover:underline" style={{ color: vars.accent }}>Trust &amp; Security</button> page for full details.
        </p>
      </Section>

      <Section title="9. Cookies">
        <p>
          The platform uses only the essential cookies required to keep you logged in and to remember your session.
          We do not use advertising or third-party tracking cookies.
        </p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          We may update this policy from time to time. If we make material changes, we'll update the "Last updated"
          date above and, where appropriate, notify you directly.
        </p>
      </Section>

      <Section title="11. Contact us">
        <p>
          For any privacy questions, or to make a data request, contact us at <a href="mailto:info@aiofusion.ai" className="hover:underline" style={{ color: vars.accent }}>info@aiofusion.ai</a>, or write to
          us at AIO Fusion Ltd, Amelia House, Crescent Road, Worthing, West Sussex, United Kingdom, BN11 1RL.
        </p>
      </Section>

      <a href="mailto:info@aiofusion.ai?subject=Privacy%20Question" className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg text-[14px] font-semibold text-white transition-all hover:brightness-110" style={{ background: vars.accent }}>
        <Mail size={16} /> Ask us a privacy question
      </a>
    </MarketingPage>
  );
}

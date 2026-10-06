import MarketingPage from "./MarketingPage";
import { PageHead } from "./PageHead";
import { PAGE_META } from "./pageMeta";
import { legalDocuments, type LegalDocumentKind } from "./legalDocuments";
import { CookiePreferencesButton } from "../components/CookieConsent";

export type LegalPageProps = { onLogin: () => void; onBack: () => void; onNavigate: (v: string) => void; isAuthed?: boolean };
const related = [
  ["Website terms", "website-terms"], ["Platform terms", "terms-conditions"],
  ["Privacy policy", "privacy-policy"], ["Cookie policy", "cookie-policy"],
  ["Journalist privacy rights", "journalist-privacy"], ["Legal review pack", "legal-review"],
] as const;

export default function LegalDocumentPage({ documentKind, ...props }: LegalPageProps & { documentKind: LegalDocumentKind }) {
  const document = legalDocuments[documentKind];
  const base = import.meta.env.BASE_URL;
  return <MarketingPage title={document.title} {...props}>
    <PageHead meta={PAGE_META[documentKind]} />
    <aside aria-label="Legal review status" className="mb-7 rounded-xl border border-[#DCE5E7] bg-[#F0F6F6] p-5 text-[14px] leading-relaxed text-[#102B36]">
      <strong className="block">Awaiting legal and business review</strong>
      <p className="mt-1">{document.introduction}</p>
      <p className="mt-2">These documents are not legal advice or a guarantee of compliance. Review notes identify matters that require confirmation before final approval. Statutory rights remain unaffected.</p>
    </aside>
    <nav aria-label="Legal documents" className="mb-8 flex flex-wrap gap-x-5 gap-y-3 text-[13px] font-medium text-[#102B36]">
      {related.filter(([, kind]) => kind !== documentKind).map(([label, kind]) =>
        <a key={kind} href={`${base}${kind}`} onClick={(event) => { event.preventDefault(); props.onNavigate(kind); }}
          className="underline decoration-[#C8497A] underline-offset-4">{label}</a>)}
      <CookiePreferencesButton />
    </nav>
    <div className="space-y-9">
      {document.sections.map((section) => <section key={section.title}>
        <h2 className="mb-3 text-[20px] text-[#102B36]" style={{ fontFamily: "'Alice', Georgia, serif" }}>{section.title}</h2>
        <div className="space-y-3 text-[14px] leading-[1.85] text-[#334155]">
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </section>)}
    </div>
    {documentKind === "legal-review" && <section className="mt-9 border-t border-slate-200 pt-6 text-[13px] text-[#334155]">
      <h2 className="mb-3 font-semibold">Official references consulted</h2>
      <ul className="space-y-2">
        <li><a className="underline" href="https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/individual-rights/right-to-be-informed" target="_blank" rel="noreferrer">ICO: Right to be informed</a></li>
        <li><a className="underline" href="https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests" target="_blank" rel="noreferrer">ICO: Legitimate interests</a></li>
        <li><a className="underline" href="https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions" target="_blank" rel="noreferrer">ICO: Storage and access exceptions</a></li>
        <li><a className="underline" href="https://www.legislation.gov.uk/ukpga/1977/50/section/2" target="_blank" rel="noreferrer">Unfair Contract Terms Act 1977: section 2</a></li>
        <li><a className="underline" href="https://www.legislation.gov.uk/ukpga/1977/50/section/11" target="_blank" rel="noreferrer">Unfair Contract Terms Act 1977: section 11</a></li>
      </ul>
    </section>}
  </MarketingPage>;
}

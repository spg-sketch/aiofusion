import LegalDocumentPage, { type LegalPageProps } from "./LegalDocumentPage";
export default function PrivacyPolicyPage(props: LegalPageProps) {
  return <LegalDocumentPage {...props} documentKind="privacy-policy" />;
}

import LandingPage from "./_shared/_source/LandingPage";
import PreviewBanner from "./_shared/PreviewBanner";
import ProposalNotes from "./_shared/ProposalNotes";
import "./_group.css";

export default function Home() {
  return (
    <div className="brand-review-preview brand-review-preview--home">
      <LandingPage onLogin={() => undefined} onNavigate={() => undefined} isAuthed={false} />
      <ProposalNotes page="Home" items={[
        "Alice editorial titles capped to the shared display scale.",
        "Primary navigation action uses navy, not pink, for contrast.",
        "Raspberry is reserved for links, selection and emphasis.",
        "Amber focus is distinct from hover and selection.",
      ]} />
      <PreviewBanner />
    </div>
  );
}

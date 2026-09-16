import { GuidedOnboardingPage } from "./_shared/_source/GuidedOnboardingPage";
import PreviewBanner from "./_shared/PreviewBanner";
import ProposalNotes from "./_shared/ProposalNotes";
import "./_group.css";

export default function Onboarding() {
  return (
    <div className="brand-review-preview brand-review-preview--onboarding">
      <GuidedOnboardingPage onSignOut={() => undefined} onRoleChanged={() => undefined} onComplete={async () => ({ ok: true })} />
      <ProposalNotes page="Onboarding" items={[
        "Standalone rail and progress sequence are retained.",
        "Alice headings and Inter body text share the common voice.",
        "Raspberry continues to mean selected progress and choices.",
        "Amber keyboard focus no longer competes with selection.",
      ]} />
      <PreviewBanner />
    </div>
  );
}

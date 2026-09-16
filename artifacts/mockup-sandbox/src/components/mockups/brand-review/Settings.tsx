import { SubAccountsPage } from "./_shared/_source/SubAccountsPage";
import type { Session } from "./_shared/public-account/auth";
import PreviewBanner from "./_shared/PreviewBanner";
import ProposalNotes from "./_shared/ProposalNotes";
import "./_group.css";

const demoSession: Session = { username: "alex.morgan", role: "agency", companyName: "Northstar Communications", membershipRole: "owner", agencyManagedClient: false };

export default function Settings() {
  return (
    <div className="brand-review-preview brand-review-preview--settings">
      <SubAccountsPage session={demoSession} onBack={() => undefined} onAssignProjectOwner={async () => ({ ok: true })} onRoleChanged={() => undefined} onWorkspacesChanged={() => undefined} onInvitationAccepted={() => undefined} onSignOut={() => undefined} onSectionChange={() => undefined} onOpenProject={() => undefined} onOpenGeorge={() => undefined} />
      <ProposalNotes page="Settings" items={[
        "My Account uses the canonical navigation casing.",
        "Mint settings canvas separates account work from the platform.",
        "Forms and primary actions use a 44px control rhythm.",
        "Active navigation remains raspberry while focus becomes amber.",
      ]} />
      <PreviewBanner />
    </div>
  );
}

import ReportPage from "./_source-project/ReportPage";
import "./_group.css";
import "./project-proposed.css";

export default function Report() {
  return (
    <div className="brand-review-preview brand-review-preview--report">
      <div className="brand-review-preview__banner">
        Preview only · Illustrative project data
      </div>
      <ReportPage
        activeClient={{
          id: "northstar-demo",
          name: "Northstar Health",
          sector: "Health technology and employee wellbeing",
          initials: "NH",
          color: "#C8497A",
          contentCount: 14,
          avgScore: 76,
          scoreTrend: 8,
          activePlans: 3,
          lastActive: "Today",
          recentActivity: "Visibility audit completed",
          createdAt: "2025-01-15T10:00:00.000Z",
        }}
      />
      <aside className="brand-review-proposal" aria-label="Reports proposed guideline changes">
        <div className="brand-review-proposal__head">
          <span>Proposed guideline pass</span>
          <strong>Reports</strong>
        </div>
        <ul>
          <li>Alice hierarchy and Inter reading copy replace mixed display treatment.</li>
          <li>Print, share, export and filter controls now use one 44px action rule.</li>
          <li>Report cards use cooler borders, consistent radii and quieter depth.</li>
          <li>Pink-wash subsection bars are not carried from Project Set-Up into reports.</li>
        </ul>
      </aside>
    </div>
  );
}
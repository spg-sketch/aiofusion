import IntakePage from "./_source-project/IntakeForm";
import "./_group.css";
import "./project-proposed.css";

export default function Setup() {
  return (
    <div className="brand-review-preview brand-review-preview--setup">
      <div className="brand-review-preview__banner">
        Preview only · Illustrative project data
      </div>
      <IntakePage
        accountProfile={{
          displayName: "Northstar Health",
          website: "https://northstar.example",
        }}
        role="client"
      />
      <aside className="brand-review-proposal" aria-label="Project Set-Up proposed guideline changes">
        <div className="brand-review-proposal__head">
          <span>Proposed guideline pass</span>
          <strong>Project Set-Up</strong>
        </div>
        <ul>
          <li>Alice headings and Inter form copy now share the workspace voice.</li>
          <li>Controls use a 44px minimum height with visible amber keyboard focus.</li>
          <li>Cards follow a 16px and 12px reading rhythm with calmer borders.</li>
          <li>Pink-wash field groupers stay exclusive to Project Set-Up.</li>
        </ul>
      </aside>
    </div>
  );
}
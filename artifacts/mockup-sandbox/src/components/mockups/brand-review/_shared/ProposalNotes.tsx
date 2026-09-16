type ProposalNotesProps = {
  page: "Home" | "Settings" | "Onboarding";
  items: string[];
};

export default function ProposalNotes({ page, items }: ProposalNotesProps) {
  return (
    <aside className="brand-review-proposal" aria-label={`${page} proposed guideline changes`}>
      <div className="brand-review-proposal__head">
        <span>Proposed guideline pass</span>
        <strong>{page}</strong>
      </div>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </aside>
  );
}
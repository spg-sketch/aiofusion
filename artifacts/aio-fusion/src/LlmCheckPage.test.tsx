import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import LlmCheckPage, { loadSavedAudits, type SavedAudit } from "./LlmCheckPage";

const CLIENT = { id: "client-1", name: "Acme Ltd", sector: "Consulting" };

// A saved audit shaped exactly like one created BEFORE the authority assessment
// feature shipped: it has no `assessment` field at all.
const LEGACY_RESULT = {
  companyName: "Acme Ltd",
  sector: "Consulting",
  sectors: ["Consulting"],
  icp: "mid-market manufacturers",
  checkedAt: "2025-01-15T10:00:00.000Z",
  visibilityScore: 40,
  totalProbes: 10,
  totalMentions: 4,
  byModel: {
    chatgpt: { probes: 5, mentions: 2, rate: 40 },
    claude: { probes: 5, mentions: 2, rate: 40 },
  },
  topCompetitors: [{ name: "Globex", mentions: 6 }],
  probes: [
    {
      question: "What do you know about Acme Ltd?",
      model: "GPT-5 (ChatGPT)",
      mentioned: true,
      mentionContext: "...Acme Ltd is a consultancy...",
      responsePreview: "Acme Ltd is a consultancy.",
      competitors: ["Globex"],
    },
    {
      question: "Top consulting firms?",
      model: "Claude (Anthropic)",
      mentioned: false,
      mentionContext: null,
      responsePreview: "The leading firms are Globex and others.",
      competitors: ["Globex"],
    },
  ],
};

// A modern audit that DOES carry an assessment.
const MODERN_RESULT = {
  ...LEGACY_RESULT,
  checkedAt: "2026-06-01T10:00:00.000Z",
  assessment: {
    index: 64,
    grade: "B",
    summary: "Acme appears in some answers but trails Globex.",
    dimensions: [
      { name: "Presence", score: 60, justification: "Appeared in 4 of 10 probes.", confidence: "high" },
      { name: "Prominence", score: 50, justification: "Often a passing mention.", confidence: "medium" },
      { name: "Share of voice", score: 40, justification: "Behind Globex.", confidence: "medium" },
      { name: "Message fidelity", score: 0, justification: "No evidence in this run.", confidence: "low" },
      { name: "Factual accuracy", score: 0, justification: "No evidence in this run.", confidence: "low" },
      { name: "Source quality", score: 20, justification: "Few URLs supplied.", confidence: "low" },
      { name: "Entity clarity", score: 55, justification: "Reasonably distinct.", confidence: "medium" },
      { name: "Spokesperson authority", score: 10, justification: "No spokespeople supplied.", confidence: "low" },
    ],
    topGaps: ["Not surfaced for boutique queries"],
    priorityActions: [
      { action: "Publish category thought leadership", rationale: "Engines cite authority content.", priority: "high" },
    ],
    queryTable: [
      { query: "Top consulting firms?", appeared: false, notes: "Recommended Globex instead." },
    ],
  },
};

function seedSavedAudit(result: object): SavedAudit {
  const audit: SavedAudit = {
    id: "audit-1",
    savedAt: "2025-01-15T11:00:00.000Z",
    result: result as SavedAudit["result"],
  };
  localStorage.setItem(`aio.savedAudits.${CLIENT.id}`, JSON.stringify([audit]));
  return audit;
}

describe("LlmCheckPage saved-audit backward compatibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loadSavedAudits returns persisted audits and tolerates corrupt storage", () => {
    seedSavedAudit(LEGACY_RESULT);
    expect(loadSavedAudits(CLIENT.id)).toHaveLength(1);

    localStorage.setItem(`aio.savedAudits.${CLIENT.id}`, "not valid json{");
    expect(loadSavedAudits(CLIENT.id)).toEqual([]);
  });

  it("opens and renders a legacy audit (no assessment) without crashing", () => {
    seedSavedAudit(LEGACY_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    // The original visibility report renders.
    expect(screen.getByText("Detailed Probe Results")).toBeInTheDocument();
    expect(screen.getByText("Who owns the category instead")).toBeInTheDocument();

    // The assessment-only scorecard must be ABSENT for legacy audits.
    expect(screen.queryByText("AI Authority scorecard")).not.toBeInTheDocument();
  });

  it("always renders the Executive summary, with fallback text when there is no assessment or ICP", () => {
    const noAssessNoIcp = { ...LEGACY_RESULT, icp: "" };
    seedSavedAudit(noAssessNoIcp);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.getByText("Executive summary")).toBeInTheDocument();
    expect(screen.getByText(/non-branded category queries across ChatGPT and Claude/i)).toBeInTheDocument();
  });

  it("renders the AI Authority scorecard only when an assessment is present", () => {
    seedSavedAudit(MODERN_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.getByText("AI Authority scorecard")).toBeInTheDocument();
    // A dimension justification from the assessment is shown.
    expect(screen.getByText("Appeared in 4 of 10 probes.")).toBeInTheDocument();
  });

  it("openReport builds a printable report for a legacy audit without throwing", () => {
    seedSavedAudit(LEGACY_RESULT);

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => {
          written += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    const reportButton = screen.getByText(/Open report \/ Save as PDF/i);
    reportButton.click();

    expect(openSpy).toHaveBeenCalled();
    // The report renders the original visibility content and the brand name...
    expect(written).toContain("Acme Ltd");
    expect(written).toContain("Blind-probe evidence log");
    // ...but contains none of the assessment-only sections.
    expect(written).not.toContain("AI Authority scorecard");
    expect(written).not.toContain("Prioritised actions");
    expect(written).not.toContain("Per-query authority read");
  });

  it("openReport includes the assessment sections for a modern audit", () => {
    seedSavedAudit(MODERN_RESULT);

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => {
          written += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    screen.getByText(/Open report \/ Save as PDF/i).click();

    expect(written).toContain("AI Authority scorecard");
    expect(written).toContain("Prioritised actions");
  });
});

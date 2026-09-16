export type SavedDiagnostic = {
  id: string;
  savedAt: string;
  result: {
    overallScore: number;
    categories: Array<{
      name: string;
      score: number;
      max: number;
      status: string;
      findings: string[];
      recommendations: string[];
    }>;
    strengths: string[];
    warnings: string[];
    criticalGaps: string[];
    priorityActions: Array<{
      priority: string;
      action: string;
      timeframe: string;
      impact: string;
      category: string;
    }>;
    summary: string;
  };
};

const diagnostic: SavedDiagnostic = {
  id: "diagnostic-northstar-1",
  savedAt: "2025-03-02T10:00:00.000Z",
  result: {
    overallScore: 72,
    categories: [
      {
        name: "Technical Accessibility",
        score: 16,
        max: 20,
        status: "pass",
        findings: ["Crawlers can access the core public pages."],
        recommendations: ["Keep robots.txt rules reviewed as the site grows."],
      },
      {
        name: "Schema & Structured Data",
        score: 13,
        max: 20,
        status: "warn",
        findings: ["Organization schema is present but missing a few trust links."],
        recommendations: ["Add sameAs links for primary company profiles."],
      },
      {
        name: "Content Architecture",
        score: 15,
        max: 20,
        status: "pass",
        findings: ["Core service and audience pages use clear headings."],
        recommendations: ["Add a dedicated FAQ page for recurring questions."],
      },
      {
        name: "Source Authority",
        score: 14,
        max: 20,
        status: "warn",
        findings: ["Recent trade coverage gives the entity a useful authority base."],
        recommendations: ["Build more independent references around preventative care."],
      },
    ],
    strengths: ["Clear audience framing", "Accessible public content"],
    warnings: ["Some structured data opportunities remain"],
    criticalGaps: [],
    priorityActions: [
      {
        priority: "high",
        action: "Expand Organization sameAs references",
        timeframe: "Next 30 days",
        impact: "Improve entity confidence",
        category: "Schema",
      },
    ],
    summary:
      "Northstar Health has a clear public entity and a solid content foundation, with structured data and independent authority as the next opportunities.",
  },
};

export function loadSavedDiagnostics(_clientId: string): SavedDiagnostic[] {
  return [diagnostic];
}
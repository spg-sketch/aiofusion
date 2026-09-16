export type LlmCheckResult = {
  companyName: string;
  sector: string;
  checkedAt: string;
  visibilityScore: number;
  totalProbes: number;
  totalMentions: number;
  byModel: {
    chatgpt: { probes: number; mentions: number; rate: number };
    claude: { probes: number; mentions: number; rate: number };
  };
  topCompetitors: { name: string; mentions: number }[];
  probes: unknown[];
};

export type SavedAudit = {
  id: string;
  savedAt: string;
  result: LlmCheckResult;
};

const latest: SavedAudit = {
  id: "audit-northstar-2",
  savedAt: "2025-03-02T10:00:00.000Z",
  result: {
    companyName: "Northstar Health",
    sector: "Health technology and employee wellbeing",
    checkedAt: "2025-03-02T10:00:00.000Z",
    visibilityScore: 78,
    totalProbes: 24,
    totalMentions: 18,
    byModel: {
      chatgpt: { probes: 12, mentions: 10, rate: 83 },
      claude: { probes: 12, mentions: 8, rate: 67 },
    },
    topCompetitors: [{ name: "CarePath", mentions: 5 }],
    probes: [],
  },
};

const previous: SavedAudit = {
  id: "audit-northstar-1",
  savedAt: "2025-02-01T10:00:00.000Z",
  result: {
    ...latest.result,
    checkedAt: "2025-02-01T10:00:00.000Z",
    visibilityScore: 70,
    totalMentions: 15,
    byModel: {
      chatgpt: { probes: 12, mentions: 9, rate: 75 },
      claude: { probes: 12, mentions: 6, rate: 50 },
    },
  },
};

export function loadSavedAudits(_clientId: string): SavedAudit[] {
  return [latest, previous];
}

export function authorityIndexFor(result: LlmCheckResult): number {
  return result.visibilityScore;
}
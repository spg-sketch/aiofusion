export const MEDIA_DEV_SAMPLE_PREFIX = "[DEV SAMPLE]";
export const MEDIA_DEV_SOURCE_PREFIX = "dev-sample:v1:";

export type DevelopmentMediaSample = {
  key: string;
  outlet: {
    name: string;
    category: string;
    website: string;
    description: string;
    country: string;
    reachBand: string;
  };
  contact: {
    firstName: string;
    lastName: string;
    role: string;
    email: string;
    notes: string;
    beats: string[];
    sectors: string[];
    geography: string;
    language: string;
    seniority: string;
    editorialStatus: string;
    sourceRef: string;
    publicationReach: string;
    confidence: string;
    reviewNotes: string;
    provenance: Record<string, unknown>;
  };
};

const sample = (
  key: string,
  outlet: Omit<DevelopmentMediaSample["outlet"], "name" | "website"> & { name: string },
  contact: Omit<DevelopmentMediaSample["contact"], "sourceRef" | "provenance" | "reviewNotes">,
): DevelopmentMediaSample => ({
  key,
  outlet: {
    ...outlet,
    name: `${MEDIA_DEV_SAMPLE_PREFIX} ${outlet.name}`,
    website: `https://${key}.example.test`,
  },
  contact: {
    ...contact,
    sourceRef: `${MEDIA_DEV_SOURCE_PREFIX}${key}`,
    reviewNotes: `${MEDIA_DEV_SAMPLE_PREFIX} Synthetic contact for deterministic development checks. Safe to remove.`,
    provenance: { kind: "development-sample", version: 1, key, synthetic: true },
  },
});

export const DEVELOPMENT_MEDIA_SAMPLES: DevelopmentMediaSample[] = [
  sample("climate-grid", {
    name: "Climate Grid Journal",
    category: "Energy and climate",
    description: "Synthetic trade publication covering clean energy, power grids and climate technology.",
    country: "United Kingdom",
    reachBand: "Specialist",
  }, {
    firstName: "Maya", lastName: "Green", role: "Clean Energy Correspondent",
    email: "maya.green@climate-grid.example.test",
    notes: "Covers renewable energy, battery storage, grid resilience and decarbonisation.",
    beats: ["renewable energy", "battery storage", "power grids", "climate technology"],
    sectors: ["energy", "climate", "utilities"], geography: "United Kingdom",
    language: "English", seniority: "Correspondent", editorialStatus: "Synthetic development sample",
    publicationReach: "Specialist", confidence: "Development fixture",
  }),
  sample("net-zero-business", {
    name: "Net Zero Business Review",
    category: "Sustainability",
    description: "Synthetic business publication covering corporate sustainability and carbon reduction.",
    country: "United Kingdom",
    reachBand: "National trade",
  }, {
    firstName: "Noah", lastName: "Fields", role: "Sustainability Editor",
    email: "noah.fields@net-zero-business.example.test",
    notes: "Writes about net zero strategy, carbon accounting, green finance and ESG reporting.",
    beats: ["net zero", "carbon accounting", "green finance", "ESG"],
    sectors: ["sustainability", "finance", "climate"], geography: "United Kingdom",
    language: "English", seniority: "Editor", editorialStatus: "Synthetic development sample",
    publicationReach: "National trade", confidence: "Development fixture",
  }),
  sample("fintech-signal", {
    name: "Fintech Signal",
    category: "Financial technology",
    description: "Synthetic publication covering payments, digital banking and financial software.",
    country: "United States",
    reachBand: "International trade",
  }, {
    firstName: "Elena", lastName: "Brooks", role: "Fintech and Payments Reporter",
    email: "elena.brooks@fintech-signal.example.test",
    notes: "Reports on fintech, embedded finance, payments infrastructure and digital banking.",
    beats: ["fintech", "payments", "digital banking", "embedded finance"],
    sectors: ["financial technology", "banking", "software"], geography: "United States",
    language: "English", seniority: "Reporter", editorialStatus: "Synthetic development sample",
    publicationReach: "International trade", confidence: "Development fixture",
  }),
  sample("enterprise-ai", {
    name: "Enterprise AI Ledger",
    category: "Enterprise technology",
    description: "Synthetic technology publication covering applied AI and enterprise software.",
    country: "United States",
    reachBand: "International trade",
  }, {
    firstName: "Theo", lastName: "Park", role: "Enterprise AI Editor",
    email: "theo.park@enterprise-ai.example.test",
    notes: "Covers artificial intelligence adoption, automation, data infrastructure and enterprise software.",
    beats: ["artificial intelligence", "automation", "data infrastructure", "enterprise software"],
    sectors: ["technology", "software", "AI"], geography: "United States",
    language: "English", seniority: "Editor", editorialStatus: "Synthetic development sample",
    publicationReach: "International trade", confidence: "Development fixture",
  }),
];

export function assertDevelopmentSeedEnvironment(environment = process.env): void {
  if (
    environment.MEDIA_DEVELOPMENT_SEED !== "1"
    || environment.NODE_ENV === "production"
    || Boolean(environment.REPLIT_DEPLOYMENT)
  ) {
    throw new Error("Media development samples may only be changed by the development seed command outside a deployment.");
  }
}
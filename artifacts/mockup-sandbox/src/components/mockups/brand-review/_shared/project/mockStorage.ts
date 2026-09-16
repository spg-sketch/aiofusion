type StorageRecord = Record<string, unknown>;

// Deliberately not window.localStorage: extracted previews stay isolated in
// this module-level Map and reset when the preview bundle reloads.
const intakeFixture: StorageRecord = {
  formData: {
    "1.1":
      "Northstar Health helps people make confident decisions about preventative care. Our evidence-led platform connects employers, clinicians and employees with practical health guidance that is easy to understand and act on.",
    "1.4": "https://northstar.example/about\nhttps://northstar.example/insights",
    "1.5": "Avoid overly technical language and unsupported health claims.",
    "1.7": "Preventative care, employee wellbeing, evidence-led health communication",
    "2.1":
      "How does Northstar Health support preventative care?\nWhat results can employers expect?",
    "2.5":
      "Evidence-led preventative health guidance for employers and their people.",
    "3.5b":
      "We make it easier for teams to turn health information into practical action.",
    "4.1": "Northstar Health",
    "4.3":
      "Northstar Health helps employers make preventative care practical through clear, evidence-led guidance.",
    "4.4": "Health technology and employee wellbeing",
    "4.5": "United Kingdom and Ireland",
    "4.6": "2018",
  },
  duals: {
    "1.2": {
      short: "Practical AI authority for health",
      long: "Northstar Health turns preventative care evidence into practical guidance for employers and their people.",
    },
  },
  dualLists: {
    "1.3": [
      {
        short: "Evidence made practical",
        long: "Translate trusted health research into clear next steps people can use every day.",
      },
      {
        short: "Healthier workplaces",
        long: "Help employers build a culture where preventative care is part of everyday work.",
      },
    ],
  },
  spokespeople: [
    {
      name: "Dr Maya Patel",
      title: "Chief Medical Officer",
      expertise: ["Preventative care", "Workplace wellbeing"],
      linkedin: "https://linkedin.com/in/maya-patel",
    },
  ],
  products: [
    {
      name: "Northstar Workplace",
      description: "A practical preventative health programme for employers.",
      audience: "People and wellbeing teams",
    },
  ],
  productQueries: [],
  llmQueries: {
    v: 1,
    discovery: ["how to improve preventative care at work"],
    shortlist: ["evidence-led workplace wellbeing platform"],
    comparison: ["Northstar Health workplace wellbeing"],
  },
  stringLists: {
    "3.3": ["London", "Manchester", "Dublin"],
    "4.8": ["Wellbeing Works", "CarePath"],
  },
  businessCategories: ["Health", "Workplace wellbeing"],
  audienceCategories: ["HR", "People and culture"],
  intakeStatus: "Draft",
  acceptedAt: null,
  preOptimiseSnapshot: null,
  optimisedFields: [],
  aiWebsite: "https://northstar.example",
  confirmedEntity: null,
};

const values = new Map<string, string>([
  ["aio.activeProjectId", "northstar-demo"],
  ["aio.intake.v2::northstar-demo", JSON.stringify(intakeFixture)],
  [
    "aio.earnedTracker.v2::northstar-demo",
    JSON.stringify([
      {
        id: "coverage-1",
        date: "2025-02-12",
        title: "Northstar Health launches practical prevention guide",
        type: "Article (Trade Publication)",
        publication: "HealthTech Review",
        category: "Health",
        spokesperson: "Dr Maya Patel",
        link: "https://healthtech.example/northstar",
        reach: 18400,
        score: 8,
      },
      {
        id: "coverage-2",
        date: "2025-02-26",
        title: "Making preventative care part of the working week",
        type: "Press Release",
        publication: "Northstar Health",
        category: "Workplace wellbeing",
        spokesperson: "Dr Maya Patel",
        link: "https://northstar.example/insights/prevention",
        reach: 9200,
        score: 7,
      },
    ]),
  ],
]);

export const mockStorage = {
  getItem(key: string): string | null {
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    values.set(key, value);
  },
  removeItem(key: string): void {
    values.delete(key);
  },
  key(index: number): string | null {
    return Array.from(values.keys())[index] ?? null;
  },
  get length(): number {
    return values.size;
  },
};
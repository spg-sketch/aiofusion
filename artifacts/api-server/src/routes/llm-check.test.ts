import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Anthropic SDK so the stage-two scoring call never hits the network.
// `messagesCreate` is hoisted so the mock factory can reference it.
const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate };
    constructor(_opts: unknown) {}
  },
}));

import {
  extractJson,
  parseAssessment,
  scoreAuthority,
  isMentioned,
  brandAliases,
  extractCompetitors,
  generateProbeQuestions,
  aggregateTopCompetitors,
  groupProbesByQuery,
  computeVisibilityMetrics,
  type ProbeResult,
} from "./llm-check";

// Build a probe result with sensible defaults so tests only specify what matters.
function probe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    question: "q",
    model: "GPT-5 (ChatGPT)",
    response: "",
    mentioned: false,
    mentionContext: null,
    competitors: [],
    ...overrides,
  };
}

// A well-formed assessment payload the model is supposed to return.
const VALID_ASSESSMENT = {
  index: 72,
  grade: "B",
  summary: "The brand appears in some answers but is inconsistent.",
  dimensions: [
    { name: "Presence", score: 70, justification: "Appeared in 6 of 10 probes.", confidence: "high" },
    { name: "Prominence", score: 55, justification: "Usually a passing mention.", confidence: "medium" },
    { name: "Share of voice", score: 40, justification: "Behind two rivals.", confidence: "medium" },
    { name: "Message fidelity", score: 0, justification: "No evidence in this run.", confidence: "low" },
    { name: "Factual accuracy", score: 0, justification: "No evidence in this run.", confidence: "low" },
    { name: "Source quality", score: 30, justification: "Few URLs supplied.", confidence: "low" },
    { name: "Entity clarity", score: 60, justification: "Reasonably distinct.", confidence: "medium" },
    { name: "Spokesperson authority", score: 20, justification: "One spokesperson.", confidence: "low" },
  ],
  topGaps: ["Not surfaced for boutique queries", "Rivals dominate comparisons"],
  priorityActions: [
    { action: "Publish category thought leadership", rationale: "Engines cite authority content.", priority: "high" },
  ],
  queryTable: [
    { query: "What do you know about Acme?", appeared: true, notes: "Described accurately." },
    { query: "Top boutique firms?", appeared: false, notes: "Recommended rivals instead." },
  ],
};

function modelReply(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("extractJson", () => {
  it("returns null for empty input", () => {
    expect(extractJson("")).toBeNull();
  });

  it("returns null when there is no JSON object", () => {
    expect(extractJson("just some prose with no braces")).toBeNull();
  });

  it("extracts a bare JSON object", () => {
    expect(extractJson('{"index": 50}')).toBe('{"index": 50}');
  });

  it("extracts JSON wrapped in a markdown code fence", () => {
    const fenced = '```json\n{"index": 50, "grade": "C"}\n```';
    expect(extractJson(fenced)).toBe('{"index": 50, "grade": "C"}');
  });

  it("extracts JSON surrounded by stray prose", () => {
    const text = 'Here is the result:\n{"index": 42}\nHope that helps!';
    expect(extractJson(text)).toBe('{"index": 42}');
  });

  it("handles braces inside string values without stopping early", () => {
    const json = '{"summary": "uses { and } in text", "index": 10}';
    expect(extractJson(`prefix ${json} suffix`)).toBe(json);
  });

  it("returns null for a truncated / unbalanced object", () => {
    expect(extractJson('{"index": 50, "dimensions": [')).toBeNull();
  });
});

describe("parseAssessment fallback behaviour", () => {
  it("returns null for empty string", () => {
    expect(parseAssessment("")).toBeNull();
  });

  it("returns null for non-JSON prose", () => {
    expect(parseAssessment("I could not produce an assessment for this brand.")).toBeNull();
  });

  it("returns null for truncated / partial JSON", () => {
    expect(parseAssessment('{"index": 70, "grade": "B", "dimensions": [{"name": "Presence"')).toBeNull();
  });

  it("returns null for invalid JSON syntax (trailing comma)", () => {
    expect(parseAssessment('{"index": 70, "grade": "B",}')).toBeNull();
  });

  it("returns null when JSON is valid but not an object", () => {
    expect(parseAssessment("[1, 2, 3]")).toBeNull();
    expect(parseAssessment("42")).toBeNull();
    expect(parseAssessment('"a string"')).toBeNull();
    expect(parseAssessment("null")).toBeNull();
  });

  it("parses a complete, well-formed assessment", () => {
    const result = parseAssessment(JSON.stringify(VALID_ASSESSMENT));
    expect(result).not.toBeNull();
    expect(result!.index).toBe(72);
    expect(result!.grade).toBe("B");
    expect(result!.dimensions).toHaveLength(8);
    expect(result!.priorityActions).toHaveLength(1);
    expect(result!.queryTable).toHaveLength(2);
  });

  it("parses assessment wrapped in a code fence and surrounding prose", () => {
    const text = "Sure, here is the JSON:\n```json\n" + JSON.stringify(VALID_ASSESSMENT) + "\n```\nLet me know if you need more.";
    const result = parseAssessment(text);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(72);
  });

  it("fills defaults for a partial object instead of crashing or returning null", () => {
    // Model returned an object but omitted most fields.
    const result = parseAssessment('{"index": 33}');
    expect(result).not.toBeNull();
    // Always normalises to the canonical 8 dimensions.
    expect(result!.dimensions).toHaveLength(8);
    // Missing dimensions default to a zero score, a safe justification and low confidence.
    for (const d of result!.dimensions) {
      expect(d.score).toBe(0);
      expect(d.justification).toBe("No evidence in this run.");
      expect(d.confidence).toBe("low");
    }
    expect(result!.topGaps).toEqual([]);
    expect(result!.priorityActions).toEqual([]);
    expect(result!.queryTable).toEqual([]);
    expect(result!.summary).toBe("");
  });

  it("clamps out-of-range and non-numeric scores", () => {
    const payload = {
      index: 5000,
      dimensions: [
        { name: "Presence", score: 250, justification: "x", confidence: "high" },
        { name: "Prominence", score: -40, justification: "y", confidence: "medium" },
        { name: "Share of voice", score: "not a number", justification: "z", confidence: "low" },
      ],
    };
    const result = parseAssessment(JSON.stringify(payload));
    expect(result).not.toBeNull();
    expect(result!.index).toBe(100);
    const byName = Object.fromEntries(result!.dimensions.map((d) => [d.name, d.score]));
    expect(byName["Presence"]).toBe(100);
    expect(byName["Prominence"]).toBe(0);
    expect(byName["Share of voice"]).toBe(0);
  });

  it("normalises dimensions to the canonical set, ignoring unexpected ones", () => {
    const payload = {
      index: 50,
      dimensions: [
        { name: "Presence", score: 80, justification: "ok", confidence: "high" },
        { name: "Made Up Dimension", score: 99, justification: "should be dropped", confidence: "high" },
      ],
    };
    const result = parseAssessment(JSON.stringify(payload));
    expect(result).not.toBeNull();
    const names = result!.dimensions.map((d) => d.name);
    expect(names).not.toContain("Made Up Dimension");
    expect(names).toHaveLength(8);
    expect(result!.dimensions.find((d) => d.name === "Presence")!.score).toBe(80);
  });

  it("derives a grade from the index when grade is missing or invalid", () => {
    expect(parseAssessment('{"index": 85}')!.grade).toBe("A");
    expect(parseAssessment('{"index": 10}')!.grade).toBe("F");
    expect(parseAssessment('{"index": 50, "grade": "Z"}')!.grade).toBe("C");
  });
});

describe("scoreAuthority end-to-end fallback", () => {
  const baseEvidence = [{ question: "q", appeared: false, competitors: [], chatgpt: "", claude: "" }];
  const baseMetrics = { presence: 0, shareOfVoice: 0, visibilityScore: 0, topCompetitors: [] };
  const savedEnv = { ...process.env };

  beforeEach(() => {
    messagesCreate.mockReset();
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://example.test";
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("returns null (graceful fallback) when Anthropic credentials are absent", async () => {
    delete process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const result = await scoreAuthority("Acme", {}, baseEvidence, baseMetrics);
    expect(result).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns null when the model emits non-JSON prose", async () => {
    messagesCreate.mockResolvedValue(modelReply("Sorry, I cannot score this brand."));
    const result = await scoreAuthority("Acme", {}, baseEvidence, baseMetrics);
    expect(result).toBeNull();
  });

  it("returns null when the model emits truncated JSON", async () => {
    messagesCreate.mockResolvedValue(modelReply('{"index": 70, "dimensions": [{"name": "Presence"'));
    const result = await scoreAuthority("Acme", {}, baseEvidence, baseMetrics);
    expect(result).toBeNull();
  });

  it("returns null when the model returns an empty response", async () => {
    messagesCreate.mockResolvedValue({ content: [] });
    const result = await scoreAuthority("Acme", {}, baseEvidence, baseMetrics);
    expect(result).toBeNull();
  });

  it("returns null when the scoring call throws", async () => {
    messagesCreate.mockRejectedValue(new Error("upstream 500"));
    const result = await scoreAuthority("Acme", {}, baseEvidence, baseMetrics);
    expect(result).toBeNull();
  });

  it("returns a normalised assessment when the model returns valid JSON", async () => {
    messagesCreate.mockResolvedValue(modelReply(JSON.stringify(VALID_ASSESSMENT)));
    const result = await scoreAuthority("Acme", {}, baseEvidence, baseMetrics);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(72);
    expect(result!.dimensions).toHaveLength(8);
  });

  it("recovers an assessment even when valid JSON is wrapped in prose and fences", async () => {
    messagesCreate.mockResolvedValue(
      modelReply("Here you go:\n```json\n" + JSON.stringify(VALID_ASSESSMENT) + "\n```"),
    );
    const result = await scoreAuthority("Acme", {}, baseEvidence, baseMetrics);
    expect(result).not.toBeNull();
    expect(result!.grade).toBe("B");
  });
});

describe("brandAliases", () => {
  it("returns an empty list for empty / punctuation-only names", () => {
    expect(brandAliases("")).toEqual([]);
    expect(brandAliases("   ")).toEqual([]);
    expect(brandAliases("!!!")).toEqual([]);
  });

  it("strips legal suffixes to derive a core alias", () => {
    const aliases = brandAliases("Acme Widgets Ltd");
    expect(aliases).toContain("acme widgets ltd");
    expect(aliases).toContain("acme widgets");
    // First core token (>= 4 chars) is added as a standalone alias.
    expect(aliases).toContain("acme");
  });

  it("does not add a short first token (< 4 chars) as a standalone alias", () => {
    const aliases = brandAliases("BT Telecom");
    // Neither token is a legal suffix, so core == full and there is no
    // single-token alias because "bt" (2 chars) is below the 4-char threshold.
    expect(aliases).toEqual(["bt telecom"]);
    expect(aliases).not.toContain("bt");
  });

  it("deduplicates aliases when there is nothing to strip", () => {
    // No legal suffix, single token: full == core == first token.
    expect(brandAliases("Stripe")).toEqual(["stripe"]);
  });

  it("normalises punctuation and casing", () => {
    const aliases = brandAliases("O'Reilly, Inc.");
    expect(aliases).toContain("o reilly inc");
    expect(aliases).toContain("o reilly");
  });
});

describe("isMentioned", () => {
  it("returns false for empty text", () => {
    expect(isMentioned("", "Acme")).toBe(false);
  });

  it("matches the brand name case-insensitively", () => {
    expect(isMentioned("We love ACME products.", "Acme")).toBe(true);
    expect(isMentioned("acme is great", "Acme")).toBe(true);
  });

  it("matches across punctuation and spacing variations", () => {
    expect(isMentioned("Have you tried Acme-Widgets?", "Acme Widgets")).toBe(true);
    expect(isMentioned("Acme   Widgets rocks", "Acme Widgets")).toBe(true);
  });

  it("ignores the legal suffix when matching", () => {
    expect(isMentioned("I recommend Acme Widgets.", "Acme Widgets Ltd")).toBe(true);
  });

  it("respects word boundaries and does not match substrings", () => {
    // "acme" should not match inside "acmend" or "supracme".
    expect(isMentioned("The acmend tool is unrelated.", "Acme")).toBe(false);
    expect(isMentioned("supracme is a different word", "Acme")).toBe(false);
  });

  it("matches a multi-word brand only when the full phrase appears", () => {
    expect(isMentioned("Acme makes widgets", "Acme Widgets")).toBe(true);
    expect(isMentioned("Widgets are useful", "Acme Widgets")).toBe(false);
  });

  it("does not match a short-token-only brand as a loose substring", () => {
    // "bt" is too short to become a standalone alias, so a stray "bt" must not match.
    expect(isMentioned("the debt was large", "BT Group")).toBe(false);
    expect(isMentioned("BT Group leads the market", "BT Group")).toBe(true);
  });
});

describe("extractCompetitors", () => {
  it("extracts names from a 'companies like X, Y and Z' phrase", () => {
    const text = "There are firms such as Globex, Initech and Umbrella.";
    const result = extractCompetitors(text, "Acme");
    expect(result).toContain("Globex, Initech and Umbrella");
  });

  it("extracts names from a numbered list", () => {
    const text = "1. Globex - a leader\n2. Initech - fast growing\n3. Umbrella - global";
    const result = extractCompetitors(text, "Acme");
    expect(result).toEqual(expect.arrayContaining(["Globex", "Initech", "Umbrella"]));
  });

  it("extracts names from bold markdown", () => {
    const text = "Top picks include **Globex** and **Initech** for this need.";
    const result = extractCompetitors(text, "Acme");
    expect(result).toEqual(expect.arrayContaining(["Globex", "Initech"]));
  });

  it("excludes the company itself", () => {
    const text = "1. Acme - the brand\n2. Globex - a rival";
    const result = extractCompetitors(text, "Acme");
    expect(result).not.toContain("Acme");
    expect(result).toContain("Globex");
  });

  it("deduplicates and caps the result at 10 names", () => {
    const lines = Array.from({ length: 15 }, (_, i) => `${i + 1}. Company${i} - desc`).join("\n");
    const result = extractCompetitors(lines, "Acme");
    expect(result.length).toBeLessThanOrEqual(10);
    // Set-backed, so no duplicates.
    expect(new Set(result).size).toBe(result.length);
  });

  it("returns an empty array when nothing matches", () => {
    expect(extractCompetitors("Just a plain sentence with no list.", "Acme")).toEqual([]);
  });
});

describe("generateProbeQuestions", () => {
  it("always opens with a direct question about the company", () => {
    const qs = generateProbeQuestions("Acme", ["widgets"], [], "", "", "");
    expect(qs[0]).toBe("What do you know about Acme?");
  });

  it("falls back to 'the industry' when no sectors are supplied", () => {
    const qs = generateProbeQuestions("Acme", [], [], "", "", "");
    expect(qs.some((q) => q.includes("the industry"))).toBe(true);
  });

  it("uses the generic (non-ICP) phrasing when no ICP is given", () => {
    const qs = generateProbeQuestions("Acme", ["widgets"], [], "", "", "");
    expect(qs.some((q) => q.includes("leading companies in the widgets space"))).toBe(true);
    expect(qs.some((q) => q.includes("serving"))).toBe(false);
  });

  it("uses ICP-aware phrasing when an ICP is supplied", () => {
    const qs = generateProbeQuestions("Acme", ["widgets"], [], "SaaS startups", "", "");
    expect(qs.some((q) => q.includes("for SaaS startups"))).toBe(true);
    expect(qs.some((q) => q.includes("specialist or boutique firms"))).toBe(true);
  });

  it("folds location into the qualifiers and falls back to 'the UK'", () => {
    const withLoc = generateProbeQuestions("Acme", ["widgets"], [], "", "Germany", "");
    expect(withLoc.some((q) => q.includes("in Germany"))).toBe(true);
    // Single-sector branch produces a "top ... in <place>" question.
    expect(withLoc.some((q) => q.includes("top widgets companies in Germany"))).toBe(true);

    const noLoc = generateProbeQuestions("Acme", ["widgets"], [], "", "", "");
    expect(noLoc.some((q) => q.includes("in the UK"))).toBe(true);
  });

  it("adds the single-sector deep-dive questions only for one sector", () => {
    const single = generateProbeQuestions("Acme", ["widgets"], [], "", "", "");
    expect(single.some((q) => q.startsWith("Who are the top"))).toBe(true);

    const multi = generateProbeQuestions("Acme", ["widgets", "gadgets"], [], "", "", "");
    expect(multi.some((q) => q.startsWith("Who are the top"))).toBe(false);
  });

  it("caps sectors at three unique entries", () => {
    const qs = generateProbeQuestions(
      "Acme",
      ["a", "b", "c", "d", "e"],
      [],
      "",
      "",
      "",
    );
    expect(qs.some((q) => q.includes("the a space"))).toBe(true);
    expect(qs.some((q) => q.includes("the c space"))).toBe(true);
    // Fourth and fifth sectors are dropped.
    expect(qs.some((q) => q.includes("the d space"))).toBe(false);
    expect(qs.some((q) => q.includes("the e space"))).toBe(false);
  });

  it("adds a persona-specific probe when a persona is supplied", () => {
    const qs = generateProbeQuestions("Acme", ["widgets"], [], "", "", "a CMO");
    expect(qs.some((q) => q.includes("recommend to a CMO"))).toBe(true);
  });

  it("adds a keyword probe (capped at three keywords) when keywords are supplied", () => {
    const qs = generateProbeQuestions("Acme", ["widgets"], ["fast", "cheap", "green", "loud"], "", "", "");
    const kwQuestion = qs.find((q) => q.includes("known for"));
    expect(kwQuestion).toBeDefined();
    expect(kwQuestion).toContain("fast, cheap, green");
    expect(kwQuestion).not.toContain("loud");
  });
});

describe("aggregateTopCompetitors", () => {
  it("returns an empty list when no competitor appears at least twice", () => {
    const results = [
      probe({ competitors: ["Globex"] }),
      probe({ competitors: ["Initech"] }),
    ];
    expect(aggregateTopCompetitors(results)).toEqual([]);
  });

  it("counts a competitor at most once per probe run", () => {
    const results = [
      probe({ competitors: ["Globex", "Globex Ltd"] }), // both normalise to "globex"
      probe({ competitors: ["Globex"] }),
    ];
    const top = aggregateTopCompetitors(results);
    expect(top).toEqual([{ name: "Globex", mentions: 2 }]);
  });

  it("merges competitors that differ only by legal suffix or casing", () => {
    const results = [
      probe({ competitors: ["Globex"] }),
      probe({ competitors: ["globex inc"] }),
      probe({ competitors: ["GLOBEX"] }),
    ];
    const top = aggregateTopCompetitors(results);
    expect(top).toHaveLength(1);
    expect(top[0].mentions).toBe(3);
  });

  it("sorts by mention count descending and caps at eight", () => {
    const results: ProbeResult[] = [];
    // Create 10 competitors, each appearing (i + 2) times so all clear the >= 2 gate.
    for (let i = 0; i < 10; i++) {
      for (let n = 0; n < i + 2; n++) {
        results.push(probe({ competitors: [`Rival${i}`] }));
      }
    }
    const top = aggregateTopCompetitors(results);
    expect(top).toHaveLength(8);
    // Highest count first.
    expect(top[0].name).toBe("Rival9");
    expect(top[0].mentions).toBe(11);
    // Descending order maintained.
    const counts = top.map((t) => t.mentions);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("ignores blank / punctuation-only competitor names", () => {
    const results = [
      probe({ competitors: ["   ", "!!!"] }),
      probe({ competitors: ["   "] }),
    ];
    expect(aggregateTopCompetitors(results)).toEqual([]);
  });
});

describe("groupProbesByQuery", () => {
  it("groups runs by model and question", () => {
    const results = [
      probe({ model: "GPT-5 (ChatGPT)", question: "q1" }),
      probe({ model: "GPT-5 (ChatGPT)", question: "q1" }),
      probe({ model: "Claude (Anthropic)", question: "q1" }),
    ];
    const grouped = groupProbesByQuery(results);
    expect(grouped).toHaveLength(2);
  });

  it("treats a question as mentioned only with a majority of runs", () => {
    // 2 of 3 runs mention -> majority -> mentioned true.
    const majority = groupProbesByQuery([
      probe({ question: "q", mentioned: true }),
      probe({ question: "q", mentioned: true }),
      probe({ question: "q", mentioned: false }),
    ]);
    expect(majority[0].mentioned).toBe(true);
    expect(majority[0].mentionRuns).toBe(2);
    expect(majority[0].runCount).toBe(3);

    // 1 of 3 runs mention -> minority -> mentioned false.
    const minority = groupProbesByQuery([
      probe({ question: "q", mentioned: true }),
      probe({ question: "q", mentioned: false }),
      probe({ question: "q", mentioned: false }),
    ]);
    expect(minority[0].mentioned).toBe(false);
  });

  it("treats an exact half as mentioned (tie goes to mentioned)", () => {
    const tie = groupProbesByQuery([
      probe({ question: "q", mentioned: true }),
      probe({ question: "q", mentioned: false }),
    ]);
    expect(tie[0].mentioned).toBe(true);
  });

  it("picks a mentioning run as the representative when one exists", () => {
    const grouped = groupProbesByQuery([
      probe({ question: "q", mentioned: false, response: "no mention here", mentionContext: null }),
      probe({ question: "q", mentioned: true, response: "Acme is great", mentionContext: "Acme is great" }),
    ]);
    expect(grouped[0].mentionContext).toBe("Acme is great");
  });

  it("truncates the response preview to 300 chars with an ellipsis", () => {
    const long = "x".repeat(400);
    const grouped = groupProbesByQuery([probe({ question: "q", response: long })]);
    expect(grouped[0].responsePreview).toBe("x".repeat(300) + "...");

    const short = groupProbesByQuery([probe({ question: "q", response: "short" })]);
    expect(short[0].responsePreview).toBe("short");
  });

  it("dedupes competitors case-insensitively and caps at 12", () => {
    const many = Array.from({ length: 15 }, (_, i) => `Rival${i}`);
    const grouped = groupProbesByQuery([
      probe({ question: "q", competitors: ["Globex", "globex", ...many] }),
    ]);
    expect(grouped[0].competitors.length).toBe(12);
    // First-seen casing preserved, no duplicate of Globex.
    const lower = grouped[0].competitors.map((c) => c.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe("computeVisibilityMetrics", () => {
  it("returns all zeros for no probes", () => {
    expect(computeVisibilityMetrics([])).toEqual({
      chatgptProbes: 0,
      claudeProbes: 0,
      chatgptMentions: 0,
      claudeMentions: 0,
      totalProbes: 0,
      totalMentions: 0,
      visibilityScore: 0,
      presence: 0,
      shareOfVoice: 0,
    });
  });

  it("splits probe and mention counts by engine", () => {
    const results = [
      probe({ model: "GPT-5 (ChatGPT)", mentioned: true }),
      probe({ model: "GPT-5 (ChatGPT)", mentioned: false }),
      probe({ model: "Claude (Anthropic)", mentioned: true }),
      probe({ model: "Claude (Anthropic)", mentioned: true }),
    ];
    const m = computeVisibilityMetrics(results);
    expect(m.chatgptProbes).toBe(2);
    expect(m.claudeProbes).toBe(2);
    expect(m.chatgptMentions).toBe(1);
    expect(m.claudeMentions).toBe(2);
    expect(m.totalProbes).toBe(4);
    expect(m.totalMentions).toBe(3);
  });

  it("computes visibility score and presence as mentions / probes (rounded %)", () => {
    // 1 of 3 mentioned -> 33%.
    const m = computeVisibilityMetrics([
      probe({ mentioned: true }),
      probe({ mentioned: false }),
      probe({ mentioned: false }),
    ]);
    expect(m.visibilityScore).toBe(33);
    expect(m.presence).toBe(33);
  });

  it("computes share of voice against total competitor mentions", () => {
    // 2 brand mentions, 2 competitor mentions -> 2 / (2 + 2) = 50%.
    const m = computeVisibilityMetrics([
      probe({ mentioned: true, competitors: ["Globex"] }),
      probe({ mentioned: true, competitors: ["Initech"] }),
    ]);
    expect(m.shareOfVoice).toBe(50);
  });

  it("yields 100% share of voice when no competitors are named", () => {
    const m = computeVisibilityMetrics([probe({ mentioned: true })]);
    expect(m.shareOfVoice).toBe(100);
  });

  it("yields 0% share of voice when the brand is never mentioned", () => {
    const m = computeVisibilityMetrics([
      probe({ mentioned: false, competitors: ["Globex"] }),
    ]);
    expect(m.shareOfVoice).toBe(0);
  });
});

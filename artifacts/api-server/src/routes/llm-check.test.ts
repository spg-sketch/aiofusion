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

import { extractJson, parseAssessment, scoreAuthority } from "./llm-check";

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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

// Mock the Anthropic SDK so the stage-two scoring call never hits the network.
// `messagesCreate` is hoisted so the mock factory can reference it.
const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate };
    constructor(_opts: unknown) {}
  },
}));

// Mock the OpenAI SDK so probe calls never hit the network.
const { chatCompletionsCreate } = vi.hoisted(() => ({ chatCompletionsCreate: vi.fn() }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: chatCompletionsCreate } };
    constructor(_opts: unknown) {}
  },
}));

// In-memory audit-lock store used by the @workspace/db mock below.
const { auditLocks } = vi.hoisted(() => ({
  auditLocks: [] as Array<{ projectId: string; auditType: string; owner: string; lastRunAt: Date }>,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: unknown) => ({ kind: "eq", col, val }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
}));

vi.mock("@workspace/db", () => {
  const auditLocksTable = {
    projectId: { __col: "projectId" },
    auditType: { __col: "auditType" },
    owner:     { __col: "owner" },
    lastRunAt: { __col: "lastRunAt" },
  };
  function matches(row: any, pred: any): boolean {
    if (!pred) return true;
    if (pred.kind === "eq") return row[pred.col.__col] === pred.val;
    if (pred.kind === "and") return pred.parts.every((p: any) => matches(row, p));
    return true;
  }
  const db = {
    select: () => ({
      from: () => ({
        where: (pred: any) => ({
          limit: (n: number) =>
            Promise.resolve(auditLocks.filter((r) => matches(r, pred)).slice(0, n)),
        }),
      }),
    }),
    insert: () => ({
      values: (vals: any) => ({
        onConflictDoUpdate: () => ({
          catch: () => {
            const idx = auditLocks.findIndex(
              (r) => r.projectId === vals.projectId && r.auditType === vals.auditType,
            );
            if (idx >= 0) Object.assign(auditLocks[idx], vals);
            else auditLocks.push({ ...vals });
            return Promise.resolve();
          },
        }),
      }),
    }),
  };
  return { db, auditLocksTable, tokenUsageTable: {}, adminEventsTable: {} };
});

// Pass-through middleware mocks so the route tests exercise handler logic
// without per-IP rate budgets or concurrency slots interfering.
vi.mock("../middleware/rate-limit", () => ({
  llmCheckLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../middleware/concurrency-guard", () => ({
  llmCheckConcurrencyGuard: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import llmCheckRouter, {
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
  domainLabel,
  parseEntityList,
  deriveEntityClarity,
  assessEntityClarity,
  buildIdentityProbe,
  type ProbeResult,
  type BrandIdentity,
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

  it("extracts multi-word names from a numbered list", () => {
    // Pattern 2 (numbered list) requires >= 2 words to filter single-word noise fragments.
    // Use multi-word brand names to test the numbered-list pattern.
    const text = "1. Globex Corp - a leader\n2. Initech Group - fast growing\n3. Umbrella Labs - global";
    const result = extractCompetitors(text, "Acme");
    expect(result).toEqual(expect.arrayContaining(["Globex Corp", "Initech Group", "Umbrella Labs"]));
  });

  it("extracts names from bold markdown", () => {
    const text = "Top picks include **Globex** and **Initech** for this need.";
    const result = extractCompetitors(text, "Acme");
    expect(result).toEqual(expect.arrayContaining(["Globex", "Initech"]));
  });

  it("excludes the company itself", () => {
    // Exclusion is exact-match on the identity name, so use the same full name
    const text = "1. Acme Corp - the brand\n2. Globex Systems - a rival";
    const result = extractCompetitors(text, "Acme Corp");
    expect(result).not.toContain("Acme Corp");
    expect(result).toContain("Globex Systems");
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

  it("rejects single-word fragments from numbered-list pattern", () => {
    // These are AI formatting artefacts, not brand names
    const text = "1. Non - closed network\n2. Off - display model\n3. Closed - restricted access\n4. Build - construction approach";
    const result = extractCompetitors(text, "Acme");
    expect(result).not.toContain("Non");
    expect(result).not.toContain("Off");
    expect(result).not.toContain("Closed");
    expect(result).not.toContain("Build");
  });

  it("rejects multi-word topic headings via the generic-concept endings blocklist", () => {
    const text = [
      "1. Display Advertising - a key channel",
      "2. Omnichannel Integration - connects everything",
      "3. Revenue Models - various tiers",
      "4. Omnichannel Commerce - full funnel",
      "5. Data Platform - analytics layer",
    ].join("\n");
    const result = extractCompetitors(text, "Acme");
    expect(result).not.toContain("Display Advertising");
    expect(result).not.toContain("Omnichannel Integration");
    expect(result).not.toContain("Revenue Models");
    expect(result).not.toContain("Omnichannel Commerce");
    expect(result).not.toContain("Data Platform");
  });

  it("still passes genuine multi-word brand names from numbered lists through the filters", () => {
    // Multi-word brand names (>= 2 words) must survive the minWords guard on pattern 2.
    // Names ending with a generic concept word (e.g. "Data", "Media") are correctly excluded.
    const text = [
      "1. Citrus Ad - sponsored listings",
      "2. Pacvue Inc - retail media",
      "3. Epsilon Data - loyalty and analytics",
    ].join("\n");
    const result = extractCompetitors(text, "Acme");
    expect(result).toContain("Citrus Ad");
    expect(result).toContain("Pacvue Inc");
    expect(result).not.toContain("Epsilon Data"); // "Data" is in GENERIC_CONCEPT_ENDINGS
  });

  it("still passes genuine single-word brand names when they appear in bold markdown", () => {
    // Single-word brands are captured by the bold pattern (not the numbered-list pattern)
    const text = "Top retail media platforms include **Criteo** and **Pacvue** for sponsored listings.";
    const result = extractCompetitors(text, "Acme");
    expect(result).toContain("Criteo");
    expect(result).toContain("Pacvue");
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
    expect(qs.some((q) => q.includes("specialist or boutique agencies or providers"))).toBe(true);
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

  it("truncates a long ICP to at most 80 chars and caps location to 3 entries", () => {
    const longIcp =
      "Mid-market SaaS companies with 50-500 employees operating in regulated industries including financial services, healthcare, and legal. They require enterprise-grade security.";
    const manyLocations = "London, Manchester, Birmingham, Edinburgh, Bristol, Leeds, Liverpool";
    const qs = generateProbeQuestions("Acme", ["widgets"], [], longIcp, manyLocations, "");

    for (const q of qs) {
      // The raw, untruncated ICP second sentence should never appear verbatim
      expect(q).not.toContain("They require enterprise-grade security");
      // The full ICP first sentence (131 chars) should not appear — only the
      // 80-char truncation is allowed
      expect(q).not.toContain(
        "including financial services, healthcare, and legal",
      );
      // 4th+ locations must be stripped
      expect(q).not.toContain("Edinburgh");
      expect(q).not.toContain("Bristol");
      expect(q).not.toContain("Leeds");
      expect(q).not.toContain("Liverpool");
    }
  });

  it("truncates a multi-sentence persona to at most 80 chars", () => {
    const longPersona =
      "A Chief Marketing Officer at a FTSE 250 company. They oversee a team of 30 and manage an annual budget exceeding £5 million.";
    const qs = generateProbeQuestions("Acme", ["widgets"], [], "", "", longPersona);
    const personaQ = qs.find((q) => q.includes("recommend to"));
    expect(personaQ).toBeDefined();
    // Should be truncated to first sentence only
    expect(personaQ).toContain("A Chief Marketing Officer at a FTSE 250 company");
    expect(personaQ).not.toContain("They oversee");
  });

  it("adds a keyword probe (capped at three keywords) when keywords are supplied", () => {
    const qs = generateProbeQuestions("Acme", ["widgets"], ["fast", "cheap", "green", "loud"], "", "", "");
    const kwQuestion = qs.find((q) => q.includes("known for"));
    expect(kwQuestion).toBeDefined();
    expect(kwQuestion).toContain("fast, cheap, green");
    expect(kwQuestion).not.toContain("loud");
  });

  it("keeps the plain direct probe when no identity is supplied", () => {
    const qs = generateProbeQuestions("SMG", ["sports media"], [], "", "", "");
    expect(qs[0]).toBe("What do you know about SMG?");
  });

  it("anchors the direct probe to the website and sector for an ambiguous identity", () => {
    const identity: BrandIdentity = {
      name: "SMG",
      legalName: "Sports Media Group Ltd",
      website: "https://sportsmediagroup.co.uk",
      descriptor: "A sports marketing agency",
      sectors: ["sports media"],
    };
    const qs = generateProbeQuestions("SMG", ["sports media"], [], "", "", "", identity);
    expect(qs[0]).not.toBe("What do you know about SMG?");
    expect(qs[0]).toContain("sportsmediagroup.co.uk");
    // Anchoring should reference the legal name so the engine resolves the right entity.
    expect(qs[0]).toContain("Sports Media Group Ltd");
  });
});

describe("domainLabel", () => {
  it("returns an empty string for missing input", () => {
    expect(domainLabel(undefined)).toBe("");
    expect(domainLabel("")).toBe("");
  });

  it("extracts the distinctive label, dropping scheme, www and TLD", () => {
    expect(domainLabel("https://www.sportsmediagroup.co.uk/about")).toBe("sportsmediagroup");
    expect(domainLabel("acme-widgets.com")).toBe("acme-widgets");
  });
});

describe("isMentioned with a BrandIdentity (namesake hardening)", () => {
  const identity: BrandIdentity = {
    name: "SMG",
    legalName: "Sports Media Group",
    website: "https://sportsmediagroup.co.uk",
    descriptor: "sports marketing agency",
    sectors: ["sports media"],
  };

  it("does not credit a bare acronym surfaced in an unrelated context", () => {
    // An answer about a different SMG (e.g. a holding company) must not count.
    expect(isMentioned("SMG is a large investment holding company in Asia.", identity)).toBe(false);
  });

  it("credits the acronym when corroborated by the domain label", () => {
    expect(isMentioned("SMG (sportsmediagroup.co.uk) runs sponsorship campaigns.", identity)).toBe(true);
  });

  it("credits the acronym when corroborated by the full legal name", () => {
    expect(isMentioned("Sports Media Group, known as SMG, is a strong pick.", identity)).toBe(true);
  });

  it("does not treat the sector alone as corroboration", () => {
    // Generic sector answers always mention the sector, so it must not credit a bare SMG.
    expect(isMentioned("The sports media space is competitive; SMG operates there too.", identity)).toBe(false);
  });

  it("still credits an unambiguous multi-word brand without corroboration", () => {
    const acme: BrandIdentity = { name: "Acme Widgets", legalName: "Acme Widgets Ltd" };
    expect(isMentioned("I recommend Acme Widgets for this.", acme)).toBe(true);
  });
});

describe("isMentioned — anchored-probe path", () => {
  const identity: BrandIdentity = {
    name: "SMG",
    legalName: "Sports Media Group",
    website: "https://sportsmediagroup.co.uk",
    descriptor: "sports marketing agency",
    sectors: ["sports media"],
  };

  it("credits a bare acronym when probeWasAnchored=true, even without domain in response", () => {
    // The question said "Is SMG (sportsmediagroup.co.uk) trustworthy?" so the AI
    // knows which SMG is meant. A bare alias match should suffice.
    expect(
      isMentioned("SMG is a well-regarded sports marketing agency.", identity, true),
    ).toBe(true);
  });

  it("still rejects a bare acronym for a clearly unrelated context when probeWasAnchored=false", () => {
    expect(
      isMentioned("SMG is a large investment holding company in Asia.", identity, false),
    ).toBe(false);
  });

  it("does not require corroboration for an anchored probe even when corroboration would normally be needed", () => {
    // Generic sector mention that would otherwise fail the corroboration check.
    expect(
      isMentioned("The sports media space is competitive; SMG operates there too.", identity, true),
    ).toBe(true);
  });

  it("probeWasAnchored=true does not affect strong multi-word aliases (still matched normally)", () => {
    expect(
      isMentioned("Sports Media Group is a top agency.", identity, true),
    ).toBe(true);
    expect(
      isMentioned("Sports Media Group is a top agency.", identity, false),
    ).toBe(true);
  });

  it("probeWasAnchored=true does not affect an unambiguous brand — corroboration was never required", () => {
    const acme: BrandIdentity = { name: "Acme Widgets", legalName: "Acme Widgets Ltd" };
    expect(isMentioned("I recommend Acme Widgets.", acme, true)).toBe(true);
    expect(isMentioned("I recommend Acme Widgets.", acme, false)).toBe(true);
  });

  it("empty response returns false regardless of anchored flag", () => {
    expect(isMentioned("", identity, true)).toBe(false);
  });
});

describe("parseEntityList", () => {
  it("parses 'Name - description' lines, tolerating bullets and numbering", () => {
    const text = "1. Sinclair Media Group - a US broadcaster\n- Scott Media Group - a UK PR firm\n* **SMG Holdings** - an Asian conglomerate";
    const list = parseEntityList(text);
    expect(list).toEqual([
      { name: "Sinclair Media Group", description: "a US broadcaster" },
      { name: "Scott Media Group", description: "a UK PR firm" },
      { name: "SMG Holdings", description: "an Asian conglomerate" },
    ]);
  });

  it("keeps a name with no description and skips blank lines", () => {
    const list = parseEntityList("\nGlobex\n\n");
    expect(list).toEqual([{ name: "Globex", description: "" }]);
  });

  it("caps the list at eight entries", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Org${i} - desc`).join("\n");
    expect(parseEntityList(text).length).toBe(8);
  });
});

describe("deriveEntityClarity", () => {
  const identity: BrandIdentity = {
    name: "SMG",
    legalName: "Sports Media Group",
    website: "https://sportsmediagroup.co.uk",
    sectors: ["sports media"],
  };

  it("reports unambiguous when only the brand is listed", () => {
    const ec = deriveEntityClarity("SMG", identity, [
      { name: "Sports Media Group", description: "sportsmediagroup.co.uk sponsorship agency" },
    ]);
    expect(ec.isAmbiguous).toBe(false);
    expect(ec.brandRecognised).toBe(true);
    expect(ec.competingEntities).toEqual([]);
  });

  it("flags 'present but confused' when the brand is recognised but not dominant", () => {
    const ec = deriveEntityClarity("SMG", identity, [
      { name: "Sinclair Media Group", description: "a US broadcaster" },
      { name: "Sports Media Group", description: "the sportsmediagroup.co.uk agency" },
    ]);
    expect(ec.isAmbiguous).toBe(true);
    expect(ec.brandRecognised).toBe(true);
    expect(ec.brandIsDominant).toBe(false);
    expect(ec.competingEntities.map((e) => e.name)).toEqual(["Sinclair Media Group"]);
    expect(ec.note.toLowerCase()).toContain("identity confusion");
  });

  it("flags 'not present' when the brand never matches a listed entity", () => {
    const ec = deriveEntityClarity("SMG", identity, [
      { name: "Sinclair Media Group", description: "a US broadcaster" },
      { name: "Smith Manufacturing Group", description: "an industrial supplier" },
    ]);
    expect(ec.isAmbiguous).toBe(true);
    expect(ec.brandRecognised).toBe(false);
    expect(ec.brandIsDominant).toBe(false);
    expect(ec.competingEntities.length).toBe(2);
    expect(ec.note.toLowerCase()).toContain("did not surface");
  });

  it("treats the user-confirmed entity as the brand, overriding the heuristic", () => {
    // The heuristic would not recognise the brand here (no website/legal/sector
    // match), but the user has confirmed which listed entity is theirs.
    const confirmed: BrandIdentity = {
      name: "SMG",
      confirmedEntity: { name: "Smith Manufacturing Group", description: "an industrial supplier" },
    };
    const ec = deriveEntityClarity("SMG", confirmed, [
      { name: "Sinclair Media Group", description: "a US broadcaster" },
      { name: "Smith Manufacturing Group", description: "an industrial supplier" },
    ]);
    expect(ec.brandRecognised).toBe(true);
    expect(ec.competingEntities.map((e) => e.name)).toEqual(["Sinclair Media Group"]);
  });

  it("makes the confirmed entity dominant when it is listed first", () => {
    const confirmed: BrandIdentity = {
      name: "SMG",
      confirmedEntity: { name: "Sinclair Media Group" },
    };
    const ec = deriveEntityClarity("SMG", confirmed, [
      { name: "Sinclair Media Group", description: "a US broadcaster" },
      { name: "Sports Media Group", description: "the sportsmediagroup.co.uk agency" },
    ]);
    expect(ec.brandRecognised).toBe(true);
    expect(ec.brandIsDominant).toBe(true);
    expect(ec.competingEntities.map((e) => e.name)).toEqual(["Sports Media Group"]);
  });
});

describe("buildIdentityProbe with a confirmed entity", () => {
  it("anchors the probe to the user-confirmed company even for a plain name", () => {
    const q = buildIdentityProbe({
      name: "Apex",
      confirmedEntity: { name: "Apex Logistics Ltd", description: "a freight forwarder in Leeds" },
    });
    expect(q).toContain("Apex Logistics Ltd");
    expect(q).toContain("freight forwarder");
    expect(q).toContain("not other organisations with a similar name");
  });

  it("leaves a plain name unanchored when there is no confirmed entity", () => {
    expect(buildIdentityProbe({ name: "Apex" })).toBe("What do you know about Apex?");
  });
});

describe("assessEntityClarity", () => {
  const identity: BrandIdentity = {
    name: "SMG",
    legalName: "Sports Media Group",
    website: "https://sportsmediagroup.co.uk",
    sectors: ["sports media"],
  };

  beforeEach(() => {
    messagesCreate.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a structured verdict from the model's namesake list", async () => {
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Sinclair Media Group - a US broadcaster\nSports Media Group - the sportsmediagroup.co.uk agency" }],
    });
    const ec = await assessEntityClarity(identity);
    expect(ec).not.toBeNull();
    expect(ec!.isAmbiguous).toBe(true);
    expect(ec!.brandRecognised).toBe(true);
    expect(ec!.competingEntities.map((e) => e.name)).toContain("Sinclair Media Group");
  });

  it("fails soft (returns null) when the model yields nothing usable", async () => {
    messagesCreate.mockResolvedValue({ content: [{ type: "text", text: "" }] });
    expect(await assessEntityClarity(identity)).toBeNull();
  });

  it("fails soft (returns null) when the model call throws", async () => {
    messagesCreate.mockRejectedValue(new Error("network"));
    expect(await assessEntityClarity(identity)).toBeNull();
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

  it("treats an exact half (1/2) as NOT mentioned (strict majority required)", () => {
    // With RUNS_PER_QUESTION=2 a 1/2 split is ambiguous; conservative threshold
    // requires strict majority so the tie resolves to not-mentioned.
    const tie = groupProbesByQuery([
      probe({ question: "q", mentioned: true }),
      probe({ question: "q", mentioned: false }),
    ]);
    expect(tie[0].mentioned).toBe(false);
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

// ---------------------------------------------------------------------------
// HTTP route tests — audit-lock gate (POST /api/llm-check) and status endpoint
// (GET /api/audit-lock). These tests exercise the full Express handler so the
// lock-check branching (429 / SSE-200 / admin bypass) is verified end-to-end.
// ---------------------------------------------------------------------------

describe("llm-check HTTP routes — audit-lock", () => {
  let server: Server;
  let baseUrl: string;
  let account: { username: string; role: string } | undefined;
  const savedEnv = { ...process.env };

  beforeEach(async () => {
    auditLocks.length = 0;
    account = { username: "testuser", role: "client" };
    messagesCreate.mockReset();
    chatCompletionsCreate.mockReset();

    // Pin the AI integration env vars to test values so createAnthropicClient()
    // returns the mocked client (not null) and createOpenAIClient() stays null.
    // This makes the SSE probe-run fully hermetic: Claude probes hit the mock,
    // OpenAI probes short-circuit to null, and the route completes quickly.
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://example.test";
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "test-key";
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

    // Empty-but-valid model reply: no mention, no competitors.
    // Used for all probe calls AND the secondary scoreAuthority call so
    // the SSE response completes without hanging.
    messagesCreate.mockResolvedValue({ content: [{ type: "text", text: "" }] });

    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.account = account;
      next();
    });
    app.use("/api", llmCheckRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    process.env = { ...savedEnv };
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function postCheck(body: unknown) {
    const res = await fetch(`${baseUrl}/api/llm-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/event-stream")) {
      await res.text();
      return { status: res.status, json: null as any };
    }
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  }

  async function getAuditLock(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${baseUrl}/api/audit-lock${qs ? `?${qs}` : ""}`);
    return { status: res.status, json: (await res.json()) as any };
  }

  describe("POST /api/llm-check — audit-lock gate", () => {
    it("skips the lock gate and proceeds when no projectId is supplied", async () => {
      const { status } = await postCheck({ companyName: "Acme", sectors: ["widgets"] });
      expect(status).toBe(200);
    });

    it("returns 429 with locked=true when the project ran within 21 days", async () => {
      auditLocks.push({ projectId: "proj-1", auditType: "visibility", owner: "", lastRunAt: new Date() });
      const { status, json } = await postCheck({ companyName: "Acme", sectors: ["widgets"], projectId: "proj-1" });
      expect(status).toBe(429);
      expect(json.locked).toBe(true);
      expect(json.lastRunAt).toBeDefined();
      expect(json.nextAvailableAt).toBeDefined();
    });

    it("bypasses the lock when force=true and the session role is admin", async () => {
      auditLocks.push({ projectId: "proj-1", auditType: "visibility", owner: "", lastRunAt: new Date() });
      account = { username: "admin", role: "admin" };
      const { status } = await postCheck({
        companyName: "Acme",
        sectors: ["widgets"],
        projectId: "proj-1",
        force: true,
      });
      expect(status).toBe(200);
    });

    it("still returns 429 when force=true but the session is not admin", async () => {
      auditLocks.push({ projectId: "proj-1", auditType: "visibility", owner: "", lastRunAt: new Date() });
      account = { username: "user1", role: "client" };
      const { status, json } = await postCheck({
        companyName: "Acme",
        sectors: ["widgets"],
        projectId: "proj-1",
        force: true,
      });
      expect(status).toBe(429);
      expect(json.locked).toBe(true);
    });
  });

  describe("GET /api/audit-lock", () => {
    it("returns locked=false when no projectId is given", async () => {
      const { json } = await getAuditLock({});
      expect(json.locked).toBe(false);
    });

    it("returns locked=false for an unknown project", async () => {
      const { json } = await getAuditLock({ projectId: "no-such-project" });
      expect(json.locked).toBe(false);
    });

    it("returns locked=true with correct daysRemaining when within 21 days", async () => {
      const lastRunAt = new Date(Date.now() - 5 * 86_400_000);
      auditLocks.push({ projectId: "proj-locked", auditType: "visibility", owner: "", lastRunAt });
      const { json } = await getAuditLock({ projectId: "proj-locked", auditType: "visibility" });
      expect(json.locked).toBe(true);
      expect(json.daysRemaining).toBe(16);
      expect(json.lastRunAt).toBeDefined();
      expect(json.nextAvailableAt).toBeDefined();
    });

    it("returns locked=false and daysRemaining=0 when the 21-day window has expired", async () => {
      const lastRunAt = new Date(Date.now() - 22 * 86_400_000);
      auditLocks.push({ projectId: "proj-old", auditType: "visibility", owner: "", lastRunAt });
      const { json } = await getAuditLock({ projectId: "proj-old", auditType: "visibility" });
      expect(json.locked).toBe(false);
      expect(json.daysRemaining).toBe(0);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Server } from "node:http";

// Mock the Anthropic SDK so the analysis call never hits the network.
// `messagesCreate` is hoisted so the mock factory can reference it.
const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate };
    constructor(_opts: unknown) {}
  },
}));

// Mock the OpenAI SDK so the fallback path is observable without the network.
const { chatCompletionsCreate } = vi.hoisted(() => ({ chatCompletionsCreate: vi.fn() }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: chatCompletionsCreate } };
    constructor(_opts: unknown) {}
  },
}));

// Mock the rate-limit and concurrency middleware to pass-through so the route
// tests exercise the handler logic without per-IP request budgets bleeding
// across cases.
vi.mock("../middleware/rate-limit", () => ({
  diagnosticLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../middleware/concurrency-guard", () => ({
  diagnosticConcurrencyGuard: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import diagnosticRouter, { normaliseResult, extractJSON } from "./diagnostic";

const CATEGORY_NAMES = [
  "Schema & Structured Data",
  "Content Architecture",
  "Source Authority",
  "Earned Media Signals",
  "LLM Visibility",
  "Technical Accessibility",
];

const CATEGORY_MAXES: Record<string, number> = {
  "Schema & Structured Data": 15,
  "Content Architecture": 15,
  "Source Authority": 15,
  "Earned Media Signals": 20,
  "LLM Visibility": 20,
  "Technical Accessibility": 15,
};

// A well-formed result the model is supposed to return.
function validRaw() {
  return {
    overallScore: 64,
    categories: CATEGORY_NAMES.map((name) => ({
      name,
      score: 10,
      max: CATEGORY_MAXES[name],
      status: "warn",
      findings: ["a finding"],
      recommendations: ["a recommendation"],
    })),
    strengths: ["s1", "s2"],
    warnings: ["w1"],
    criticalGaps: ["g1"],
    priorityActions: [
      { priority: "High", action: "Do the thing", timeframe: "This week", impact: "High", category: "Technical" },
    ],
    summary: "An executive summary.",
  };
}

describe("extractJSON", () => {
  it("parses a bare JSON object", () => {
    expect(extractJSON('{"overallScore": 50}')).toEqual({ overallScore: 50 });
  });

  it("strips a ```json code fence", () => {
    const fenced = '```json\n{"overallScore": 42}\n```';
    expect(extractJSON(fenced)).toEqual({ overallScore: 42 });
  });

  it("strips a bare ``` code fence", () => {
    const fenced = '```\n{"overallScore": 7}\n```';
    expect(extractJSON(fenced)).toEqual({ overallScore: 7 });
  });

  it("trims surrounding whitespace before parsing", () => {
    expect(extractJSON('   {"overallScore": 1}   ')).toEqual({ overallScore: 1 });
  });

  it("throws on garbage (non-JSON) text", () => {
    expect(() => extractJSON("not json at all")).toThrow();
  });

  it("throws on truncated / unbalanced JSON", () => {
    expect(() => extractJSON('{"overallScore": 5, "categories": [')).toThrow();
  });
});

describe("normaliseResult", () => {
  it("always returns the canonical six categories in order", () => {
    const result = normaliseResult({});
    expect(result.categories.map((c: any) => c.name)).toEqual(CATEGORY_NAMES);
    for (const c of result.categories) {
      expect(c.max).toBe(CATEGORY_MAXES[c.name]);
    }
  });

  it("defaults missing categories to a zero, failing score", () => {
    const result = normaliseResult({});
    for (const c of result.categories) {
      expect(c.score).toBe(0);
      expect(c.status).toBe("fail");
      expect(c.findings).toEqual([]);
      expect(c.recommendations).toEqual([]);
    }
  });

  it("clamps category scores to the [0, max] range", () => {
    const result = normaliseResult({
      categories: [
        { name: "Schema & Structured Data", score: 999 },
        { name: "Content Architecture", score: -50 },
        { name: "Earned Media Signals", score: 18 },
      ],
    });
    const byName = Object.fromEntries(result.categories.map((c: any) => [c.name, c.score]));
    expect(byName["Schema & Structured Data"]).toBe(15);
    expect(byName["Content Architecture"]).toBe(0);
    expect(byName["Earned Media Signals"]).toBe(18);
  });

  it("rounds fractional scores to the nearest integer", () => {
    const result = normaliseResult({
      categories: [{ name: "Source Authority", score: 9.6 }],
    });
    const cat = result.categories.find((c: any) => c.name === "Source Authority");
    expect(cat.score).toBe(10);
  });

  it("ignores non-numeric scores (defaults to 0)", () => {
    const result = normaliseResult({
      categories: [{ name: "LLM Visibility", score: "high" }],
    });
    const cat = result.categories.find((c: any) => c.name === "LLM Visibility");
    expect(cat.score).toBe(0);
  });

  it("applies pass/warn/fail thresholds at 0.7 and 0.4 of max", () => {
    const result = normaliseResult({
      categories: [
        // max 15: 11/15 = 0.733 -> pass; 10/15 = 0.667 -> warn (>= 0.4)
        { name: "Schema & Structured Data", score: 11 },
        { name: "Content Architecture", score: 10 },
        // 5/15 = 0.333 -> fail (< 0.4)
        { name: "Source Authority", score: 5 },
        // boundary exactly 0.7 -> pass (max 20, 14/20 = 0.7)
        { name: "Earned Media Signals", score: 14 },
        // boundary exactly 0.4 -> warn (max 20, 8/20 = 0.4)
        { name: "LLM Visibility", score: 8 },
      ],
    });
    const status = Object.fromEntries(result.categories.map((c: any) => [c.name, c.status]));
    expect(status["Schema & Structured Data"]).toBe("pass");
    expect(status["Content Architecture"]).toBe("warn");
    expect(status["Source Authority"]).toBe("fail");
    expect(status["Earned Media Signals"]).toBe("pass");
    expect(status["LLM Visibility"]).toBe("warn");
  });

  it("clamps overallScore to [0, 100] and rounds it", () => {
    expect(normaliseResult({ overallScore: 250 }).overallScore).toBe(100);
    expect(normaliseResult({ overallScore: -10 }).overallScore).toBe(0);
    expect(normaliseResult({ overallScore: 63.4 }).overallScore).toBe(63);
  });

  it("derives overallScore from category scores when absent or non-numeric", () => {
    const result = normaliseResult({
      categories: [
        { name: "Schema & Structured Data", score: 10 },
        { name: "Content Architecture", score: 5 },
      ],
    });
    // 10 + 5 + four missing (0) = 15
    expect(result.overallScore).toBe(15);

    const garbage = normaliseResult({ overallScore: "lots", categories: [{ name: "Source Authority", score: 7 }] });
    expect(garbage.overallScore).toBe(7);
  });

  it("filters non-string entries out of findings and recommendations and caps at 5", () => {
    const result = normaliseResult({
      categories: [
        {
          name: "Schema & Structured Data",
          score: 5,
          findings: ["ok", 123, null, "ok2", "f3", "f4", "f5", "f6", "f7"],
          recommendations: [{}, "r1", false],
        },
      ],
    });
    const cat = result.categories.find((c: any) => c.name === "Schema & Structured Data");
    expect(cat.findings).toEqual(["ok", "ok2", "f3", "f4", "f5"]);
    expect(cat.recommendations).toEqual(["r1"]);
  });

  it("filters top-level string arrays and caps them at 5", () => {
    const result = normaliseResult({
      strengths: ["a", 1, "b", "c", "d", "e", "f"],
      warnings: [null, "w"],
      criticalGaps: ["g", {}],
    });
    expect(result.strengths).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.warnings).toEqual(["w"]);
    expect(result.criticalGaps).toEqual(["g"]);
  });

  it("keeps only priorityActions with a string action and caps them at 12", () => {
    const actions = Array.from({ length: 15 }, (_, i) => ({ action: `act ${i}`, priority: "Low" }));
    actions.splice(1, 0, { action: 123 } as any, null as any, {} as any);
    const result = normaliseResult({ priorityActions: actions });
    expect(result.priorityActions).toHaveLength(12);
    for (const a of result.priorityActions) {
      expect(typeof a.action).toBe("string");
    }
  });

  it("defaults non-array / non-string fields to safe empty values", () => {
    const result = normaliseResult({
      categories: "nope",
      strengths: "nope",
      warnings: 5,
      criticalGaps: null,
      priorityActions: {},
      summary: 42,
    });
    expect(result.categories).toHaveLength(6);
    expect(result.strengths).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.criticalGaps).toEqual([]);
    expect(result.priorityActions).toEqual([]);
    expect(result.summary).toBe("");
  });

  it("normalises a full, well-formed payload faithfully", () => {
    const result = normaliseResult(validRaw());
    expect(result.overallScore).toBe(64);
    expect(result.summary).toBe("An executive summary.");
    expect(result.categories).toHaveLength(6);
    expect(result.strengths).toEqual(["s1", "s2"]);
    expect(result.priorityActions).toHaveLength(1);
  });
});

describe("POST /api/diagnostic", () => {
  let server: Server;
  let baseUrl: string;
  const savedEnv = { ...process.env };

  function modelReply(text: string) {
    return { content: [{ type: "text", text }] };
  }

  async function post(body: unknown) {
    const res = await fetch(`${baseUrl}/api/diagnostic`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, json };
  }

  beforeEach(async () => {
    messagesCreate.mockReset();
    chatCompletionsCreate.mockReset();
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL = "https://example.test";
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = "test-key";
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

    const app = express();
    app.use(express.json());
    app.use("/api", diagnosticRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    process.env = { ...savedEnv };
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns 400 when neither content nor url is supplied", async () => {
    const { status, json } = await post({});
    expect(status).toBe(400);
    expect(json.error).toMatch(/content or url/i);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when content exceeds the maximum length", async () => {
    const { status, json } = await post({ content: "x".repeat(50001) });
    expect(status).toBe(400);
    expect(json.error).toMatch(/maximum length/i);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the supplied content is only whitespace", async () => {
    const { status } = await post({ content: "    \n\t  " });
    expect(status).toBe(400);
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("returns a normalised result with claude provenance for valid model output", async () => {
    messagesCreate.mockResolvedValue(modelReply(JSON.stringify(validRaw())));
    const { status, json } = await post({ content: "Some page content to analyse." });
    expect(status).toBe(200);
    expect(json.provider).toBe("claude");
    expect(json.overallScore).toBe(64);
    expect(json.categories).toHaveLength(6);
    expect(json.sources.claude.score).toBe(64);
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("normalises a model response that wraps JSON in a code fence", async () => {
    messagesCreate.mockResolvedValue(modelReply("```json\n" + JSON.stringify(validRaw()) + "\n```"));
    const { status, json } = await post({ content: "Page content." });
    expect(status).toBe(200);
    expect(json.overallScore).toBe(64);
  });

  it("clamps garbage scores from the model before returning them", async () => {
    const raw = validRaw();
    raw.overallScore = 999;
    raw.categories[0].score = 999;
    messagesCreate.mockResolvedValue(modelReply(JSON.stringify(raw)));
    const { status, json } = await post({ content: "Page content." });
    expect(status).toBe(200);
    expect(json.overallScore).toBe(100);
    expect(json.categories[0].score).toBe(15);
  });

  it("falls back to OpenAI when Claude fails", async () => {
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://openai.test";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "oa-key";
    messagesCreate.mockRejectedValue(new Error("claude down"));
    chatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validRaw()) } }],
    });
    const { status, json } = await post({ content: "Page content." });
    expect(status).toBe(200);
    expect(json.provider).toBe("openai");
    expect(json.sources.openai.score).toBe(64);
  });

  it("returns 500 when both providers are unavailable", async () => {
    messagesCreate.mockRejectedValue(new Error("claude down"));
    // OpenAI env not configured, so createOpenAIClient returns null and throws.
    const { status, json } = await post({ content: "Page content." });
    expect(status).toBe(500);
    expect(json.error).toMatch(/unavailable/i);
  });

  it("returns 500 when the model emits unparseable output", async () => {
    messagesCreate.mockResolvedValue(modelReply("I cannot analyse this page."));
    const { status, json } = await post({ content: "Page content." });
    expect(status).toBe(500);
    expect(json.error).toMatch(/unavailable/i);
  });
});

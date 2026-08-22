import { describe, expect, it } from "vitest";
import {
  completeAssessmentOutcome,
  fallbackAssessmentOutcome,
  classifySavedAssessmentResult,
  normaliseSavedAssessmentResult,
  readAssessmentOutcome,
} from "./assessment-outcome";

const COMPLETE_ASSESSMENT = {
  index: 64,
  grade: "B",
  summary: "The brand is visible but inconsistent.",
  dimensions: [
    "Presence",
    "Prominence",
    "Share of voice",
    "Message fidelity",
    "Factual accuracy",
    "Source quality",
    "Entity clarity",
    "Spokesperson authority",
  ].map((name) => ({
    name,
    score: 50,
    justification: `${name} has measured evidence.`,
    confidence: "medium",
  })),
  priorityActions: [
    {
      action: "Publish stronger category proof",
      rationale: "The blind probes favour evidenced expertise.",
      priority: "high",
    },
  ],
  queryTable: [
    { query: "Which firms lead this category?", appeared: true, notes: "The brand appeared." },
  ],
  categoryFraming: [
    { query: "Which firms lead this category?", themes: "Evidence and expertise." },
  ],
  narrativeSignals: { gpt: [], claude: [], divergence: null },
};

describe("assessment outcome metadata", () => {
  it("reads a complete outcome", () => {
    expect(readAssessmentOutcome(completeAssessmentOutcome())).toEqual({
      status: "complete",
      reasonCategory: null,
    });
  });

  it("reads a bounded fallback outcome", () => {
    expect(
      readAssessmentOutcome(fallbackAssessmentOutcome("incomplete_response")),
    ).toEqual({
      status: "fallback",
      reasonCategory: "incomplete_response",
    });
  });

  it("returns unknown for legacy results with no metadata", () => {
    expect(readAssessmentOutcome(undefined)).toEqual({
      status: "unknown",
      reasonCategory: null,
    });
  });

  it("rejects malformed or unbounded fallback reasons", () => {
    expect(
      readAssessmentOutcome({
        status: "fallback",
        reasonCategory: "raw provider error: secret details",
      }),
    ).toEqual({
      status: "unknown",
      reasonCategory: null,
    });
    expect(
      readAssessmentOutcome({ status: "complete", reasonCategory: "none" }),
    ).toEqual({
      status: "unknown",
      reasonCategory: null,
    });
  });

  it("downgrades explicit-complete metadata when the saved assessment is malformed", () => {
    const malformed = {
      visibilityScore: 41,
      assessment: { index: 75, grade: "A*" },
      assessmentStatus: { status: "complete", reason: null },
      assessmentOutcome: { status: "complete", reasonCategory: null },
    };

    expect(classifySavedAssessmentResult(malformed)).toEqual({
      status: "fallback",
      reasonCategory: "incomplete_response",
    });
    expect(normaliseSavedAssessmentResult(malformed)).toMatchObject({
      visibilityScore: 41,
      assessment: null,
      assessmentStatus: { status: "fallback" },
      assessmentOutcome: {
        status: "fallback",
        reasonCategory: "incomplete_response",
      },
    });
  });

  it("preserves a bounded fallback reason while removing stray assessment content", () => {
    const normalised = normaliseSavedAssessmentResult({
      visibilityScore: 22,
      assessment: { index: 20, grade: "D" },
      assessmentOutcome: {
        status: "fallback",
        reasonCategory: "scoring_error",
      },
    });

    expect(normalised).toMatchObject({
      visibilityScore: 22,
      assessment: null,
      assessmentOutcome: {
        status: "fallback",
        reasonCategory: "scoring_error",
      },
    });
  });

  it("derives complete metadata when a structurally complete legacy result is saved", () => {
    const legacyResult = {
      visibilityScore: 64,
      assessment: COMPLETE_ASSESSMENT,
    };
    expect(classifySavedAssessmentResult(legacyResult)).toEqual({
      status: "unknown",
      reasonCategory: null,
    });

    const normalised = normaliseSavedAssessmentResult(legacyResult);
    expect(normalised).toMatchObject({
      assessment: COMPLETE_ASSESSMENT,
      assessmentStatus: { status: "complete", reason: null },
      assessmentOutcome: { status: "complete", reasonCategory: null },
    });
    expect(classifySavedAssessmentResult(normalised)).toEqual({
      status: "complete",
      reasonCategory: null,
    });
  });
});
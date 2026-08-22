import { isCompleteAuthorityAssessmentPayload } from "./authority-assessment-validation";

export const ASSESSMENT_FALLBACK_REASON =
  "The AI Authority assessment could not be completed. This report contains the visibility evidence only. Run the audit again to retry.";

export const ASSESSMENT_REASON_CATEGORIES = [
  "scoring_unavailable",
  "invalid_response",
  "incomplete_response",
  "scoring_error",
] as const;

export type AssessmentReasonCategory = (typeof ASSESSMENT_REASON_CATEGORIES)[number];

export type AssessmentOutcome =
  | { status: "complete"; reasonCategory: null }
  | { status: "fallback"; reasonCategory: AssessmentReasonCategory };

export type ReadAssessmentOutcome =
  | AssessmentOutcome
  | { status: "unknown"; reasonCategory: null };

export type AssessmentStatus =
  | { status: "complete"; reason: null }
  | { status: "fallback"; reason: string };

export function completeAssessmentOutcome(): AssessmentOutcome {
  return { status: "complete", reasonCategory: null };
}

export function fallbackAssessmentOutcome(
  reasonCategory: AssessmentReasonCategory,
): AssessmentOutcome {
  return { status: "fallback", reasonCategory };
}

export function completeAssessmentStatus(): AssessmentStatus {
  return { status: "complete", reason: null };
}

export function fallbackAssessmentStatus(): AssessmentStatus {
  return { status: "fallback", reason: ASSESSMENT_FALLBACK_REASON };
}

export function readAssessmentOutcome(value: unknown): ReadAssessmentOutcome {
  if (!value || typeof value !== "object") {
    return { status: "unknown", reasonCategory: null };
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.status === "complete" && candidate.reasonCategory === null) {
    return completeAssessmentOutcome();
  }

  if (
    candidate.status === "fallback" &&
    typeof candidate.reasonCategory === "string" &&
    ASSESSMENT_REASON_CATEGORIES.includes(
      candidate.reasonCategory as AssessmentReasonCategory,
    )
  ) {
    return fallbackAssessmentOutcome(
      candidate.reasonCategory as AssessmentReasonCategory,
    );
  }

  return { status: "unknown", reasonCategory: null };
}

function resultRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function classifySavedAssessmentResult(
  value: unknown,
): ReadAssessmentOutcome {
  const result = resultRecord(value);
  const declared = readAssessmentOutcome(result.assessmentOutcome);

  if (declared.status === "fallback") return declared;
  if (declared.status === "complete") {
    return isCompleteAuthorityAssessmentPayload(result.assessment)
      ? declared
      : fallbackAssessmentOutcome("incomplete_response");
  }
  return declared;
}

export function normaliseSavedAssessmentResult(
  value: unknown,
): Record<string, unknown> {
  const result = resultRecord(value);
  const declared = readAssessmentOutcome(result.assessmentOutcome);

  if (declared.status === "fallback") {
    return {
      ...result,
      assessment: null,
      assessmentStatus: fallbackAssessmentStatus(),
      assessmentOutcome: declared,
    };
  }

  if (isCompleteAuthorityAssessmentPayload(result.assessment)) {
    return {
      ...result,
      assessmentStatus: completeAssessmentStatus(),
      assessmentOutcome: completeAssessmentOutcome(),
    };
  }

  return {
    ...result,
    assessment: null,
    assessmentStatus: fallbackAssessmentStatus(),
    assessmentOutcome: fallbackAssessmentOutcome("incomplete_response"),
  };
}
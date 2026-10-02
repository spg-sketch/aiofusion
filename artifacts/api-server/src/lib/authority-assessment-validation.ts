export const AUTHORITY_DIMENSION_NAMES = [
  "Presence",
  "Prominence",
  "Share of voice",
  "Message fidelity",
  "Factual accuracy",
  "Source quality",
  "Entity clarity",
  "Spokesperson authority",
] as const;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// The scoring prompt and validator share these inclusive grade boundaries.
export const AUTHORITY_GRADE_BANDS = [
  { grade: "A*", min: 75, max: 100 },
  { grade: "A", min: 65, max: 74 },
  { grade: "B", min: 50, max: 64 },
  { grade: "C", min: 30, max: 49 },
  { grade: "D", min: 10, max: 29 },
  { grade: "E", min: 0, max: 9 },
] as const;

export function authorityGradeFor(index: number): string {
  return AUTHORITY_GRADE_BANDS.find((band) => index >= band.min)?.grade ?? "E";
}

export type AuthorityAssessmentValidationIssue = {
  field: string;
  code: "invalid_type" | "invalid_score" | "grade_mismatch" | "required" |
    "invalid_count" | "missing_dimension" | "invalid_value";
};

/**
 * Return the first failed field, never its value or any model-authored text.
 * Paths contain only fixed schema names and numeric array positions.
 */
export function getAuthorityAssessmentValidationIssue(
  value: unknown,
): AuthorityAssessmentValidationIssue | null {
  if (!isRecord(value)) return { field: "assessment", code: "invalid_type" };
  if (
    typeof value.index !== "number" ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index > 100
  ) return { field: "index", code: "invalid_score" };
  if (
    typeof value.grade !== "string" ||
    value.grade.trim().toUpperCase() !== authorityGradeFor(value.index)
  ) return { field: "grade", code: "grade_mismatch" };
  if (!isNonEmptyString(value.summary)) return { field: "summary", code: "required" };

  if (
    !Array.isArray(value.dimensions) ||
    value.dimensions.length !== AUTHORITY_DIMENSION_NAMES.length
  ) return { field: "dimensions", code: "invalid_count" };
  const dimensions = value.dimensions.filter(isRecord);
  if (dimensions.length !== AUTHORITY_DIMENSION_NAMES.length) {
    return { field: "dimensions", code: "invalid_type" };
  }
  for (const name of AUTHORITY_DIMENSION_NAMES) {
    const dimension = dimensions.find((item) => item.name === name);
    if (!dimension) return { field: "dimensions", code: "missing_dimension" };
    const field = `dimensions.${dimensions.indexOf(dimension)}`;
    if (
      typeof dimension.score !== "number" ||
      !Number.isInteger(dimension.score) ||
      dimension.score < 0 ||
      dimension.score > 100
    ) return { field: `${field}.score`, code: "invalid_score" };
    if (!isNonEmptyString(dimension.justification)) {
      return { field: `${field}.justification`, code: "required" };
    }
    if (
      dimension.confidence !== "high" &&
      dimension.confidence !== "medium" &&
      dimension.confidence !== "low"
    ) return { field: `${field}.confidence`, code: "invalid_value" };
  }

  if (!Array.isArray(value.priorityActions) || value.priorityActions.length === 0) {
    return { field: "priorityActions", code: "invalid_count" };
  }
  for (const [index, item] of value.priorityActions.entries()) {
    const field = `priorityActions.${index}`;
    if (!isRecord(item)) return { field, code: "invalid_type" };
    if (!isNonEmptyString(item.action)) return { field: `${field}.action`, code: "required" };
    if (!isNonEmptyString(item.rationale)) return { field: `${field}.rationale`, code: "required" };
    if (item.priority !== "high" && item.priority !== "medium" && item.priority !== "low") {
      return { field: `${field}.priority`, code: "invalid_value" };
    }
  }

  if (!Array.isArray(value.queryTable) || value.queryTable.length === 0) {
    return { field: "queryTable", code: "invalid_count" };
  }
  for (const [index, item] of value.queryTable.entries()) {
    const field = `queryTable.${index}`;
    if (!isRecord(item)) return { field, code: "invalid_type" };
    if (!isNonEmptyString(item.query)) return { field: `${field}.query`, code: "required" };
    if (typeof item.appeared !== "boolean") return { field: `${field}.appeared`, code: "invalid_type" };
    if (!isNonEmptyString(item.notes)) return { field: `${field}.notes`, code: "required" };
  }

  if (!Array.isArray(value.categoryFraming) || value.categoryFraming.length === 0) {
    return { field: "categoryFraming", code: "invalid_count" };
  }
  for (const [index, item] of value.categoryFraming.entries()) {
    const field = `categoryFraming.${index}`;
    if (!isRecord(item)) return { field, code: "invalid_type" };
    if (!isNonEmptyString(item.query)) return { field: `${field}.query`, code: "required" };
    if (!isNonEmptyString(item.themes)) return { field: `${field}.themes`, code: "required" };
  }

  if (!isRecord(value.narrativeSignals)) return { field: "narrativeSignals", code: "invalid_type" };
  const signals = value.narrativeSignals;
  for (const engine of ["gpt", "claude"] as const) {
    const items = signals[engine];
    const field = `narrativeSignals.${engine}`;
    if (!Array.isArray(items)) return { field, code: "invalid_type" };
    const index = items.findIndex((item) => !isNonEmptyString(item));
    if (index !== -1) return { field: `${field}.${index}`, code: "required" };
  }
  return null;
}

export function isCompleteAuthorityAssessmentPayload(value: unknown): boolean {
  return getAuthorityAssessmentValidationIssue(value) === null;
}
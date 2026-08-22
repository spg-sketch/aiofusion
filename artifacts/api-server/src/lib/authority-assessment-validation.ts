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

export function authorityGradeFor(index: number): string {
  return index >= 75
    ? "A*"
    : index >= 65
      ? "A"
      : index >= 50
        ? "B"
        : index >= 30
          ? "C"
          : index >= 10
            ? "D"
            : "E";
}

export function isCompleteAuthorityAssessmentPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    typeof value.index !== "number" ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index > 100
  ) return false;
  if (
    typeof value.grade !== "string" ||
    value.grade.trim().toUpperCase() !== authorityGradeFor(value.index)
  ) return false;
  if (!isNonEmptyString(value.summary)) return false;

  if (
    !Array.isArray(value.dimensions) ||
    value.dimensions.length !== AUTHORITY_DIMENSION_NAMES.length
  ) return false;
  const dimensions = value.dimensions.filter(isRecord);
  if (dimensions.length !== AUTHORITY_DIMENSION_NAMES.length) return false;
  for (const name of AUTHORITY_DIMENSION_NAMES) {
    const dimension = dimensions.find((item) => item.name === name);
    if (!dimension) return false;
    if (
      typeof dimension.score !== "number" ||
      !Number.isInteger(dimension.score) ||
      dimension.score < 0 ||
      dimension.score > 100
    ) return false;
    if (!isNonEmptyString(dimension.justification)) return false;
    if (
      dimension.confidence !== "high" &&
      dimension.confidence !== "medium" &&
      dimension.confidence !== "low"
    ) return false;
  }

  if (!Array.isArray(value.priorityActions) || value.priorityActions.length === 0) {
    return false;
  }
  if (
    value.priorityActions.some(
      (item) =>
        !isRecord(item) ||
        !isNonEmptyString(item.action) ||
        !isNonEmptyString(item.rationale) ||
        (item.priority !== "high" &&
          item.priority !== "medium" &&
          item.priority !== "low"),
    )
  ) return false;

  if (!Array.isArray(value.queryTable) || value.queryTable.length === 0) return false;
  if (
    value.queryTable.some(
      (item) =>
        !isRecord(item) ||
        !isNonEmptyString(item.query) ||
        typeof item.appeared !== "boolean" ||
        !isNonEmptyString(item.notes),
    )
  ) return false;

  if (!Array.isArray(value.categoryFraming) || value.categoryFraming.length === 0) {
    return false;
  }
  if (
    value.categoryFraming.some(
      (item) =>
        !isRecord(item) ||
        !isNonEmptyString(item.query) ||
        !isNonEmptyString(item.themes),
    )
  ) return false;

  if (!isRecord(value.narrativeSignals)) return false;
  const signals = value.narrativeSignals;
  if (!Array.isArray(signals.gpt) || !Array.isArray(signals.claude)) return false;
  if (
    signals.gpt.some((item) => !isNonEmptyString(item)) ||
    signals.claude.some((item) => !isNonEmptyString(item))
  ) return false;
  return true;
}
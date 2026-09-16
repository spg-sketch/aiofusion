/**
 * Canonical phrase identity shared by Intake, Content Creator and Media Research.
 *
 * The text shown to a user remains the original trimmed phrase. Identity is
 * based on a stable normalisation so harmless changes to case or whitespace do
 * not create a second target.
 */
export type ExactPhraseIntentGroup = "discovery" | "shortlist" | "comparison";

export type ExactTargetPhrase = {
  id: string;
  text: string;
  intentGroup: ExactPhraseIntentGroup;
};

export type LlmQueriesV1 = {
  v: 1;
  discovery: string[];
  shortlist: string[];
  comparison: string[];
};

export const MAX_EXACT_TARGET_PHRASE_CHARS = 500;

export function normaliseExactPhraseText(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, MAX_EXACT_TARGET_PHRASE_CHARS).normalize("NFKC").toLowerCase()
    : "";
}

export function exactTargetPhraseId(intentGroup: ExactPhraseIntentGroup, text: string): string {
  const input = `${intentGroup}:${normaliseExactPhraseText(text)}`;
  // FNV-1a is small, deterministic in browsers and does not depend on crypto
  // availability, which is important when loading an old intake offline.
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `phrase-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const getExactTargetPhraseId = exactTargetPhraseId;
export const normaliseExactTargetPhraseText = normaliseExactPhraseText;

export function createExactTargetPhrase(intentGroup: ExactPhraseIntentGroup, text: unknown): ExactTargetPhrase | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const displayText = text.trim().replace(/\s+/g, " ").slice(0, MAX_EXACT_TARGET_PHRASE_CHARS);
  return {
    id: exactTargetPhraseId(intentGroup, displayText),
    text: displayText,
    intentGroup,
  };
}

export function getExactTargetPhrases(queries: Partial<LlmQueriesV1> | null | undefined): ExactTargetPhrase[] {
  const groups: ExactPhraseIntentGroup[] = ["discovery", "shortlist", "comparison"];
  const seen = new Set<string>();
  const result: ExactTargetPhrase[] = [];
  for (const intentGroup of groups) {
    const values = queries?.[intentGroup];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const phrase = createExactTargetPhrase(intentGroup, value);
      if (!phrase || seen.has(phrase.id)) continue;
      seen.add(phrase.id);
      result.push(phrase);
    }
  }
  return result;
}

export function normaliseExactTargetPhrases(value: unknown): ExactTargetPhrase[] {
  if (!Array.isArray(value)) return [];
  const result: ExactTargetPhrase[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const group = item.intentGroup;
    if (group !== "discovery" && group !== "shortlist" && group !== "comparison") continue;
    const phrase = createExactTargetPhrase(group, item.text);
    if (!phrase || seen.has(phrase.id)) continue;
    seen.add(phrase.id);
    result.push({ ...phrase, id: typeof item.id === "string" && item.id === phrase.id ? item.id : phrase.id });
  }
  return result;
}

export function buildExactTargetRequest(targetPhrases: ExactTargetPhrase[]): {
  targetPhrases: ExactTargetPhrase[];
  targetQuery?: { text: string; category: ExactPhraseIntentGroup };
} {
  const snapshot = targetPhrases.map((phrase) => ({ ...phrase }));
  const first = snapshot[0];
  return {
    targetPhrases: snapshot,
    ...(first ? { targetQuery: { text: first.text, category: first.intentGroup } } : {}),
  };
}
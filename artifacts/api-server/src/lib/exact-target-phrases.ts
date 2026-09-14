export type ExactPhraseIntentGroup = "discovery" | "shortlist" | "comparison";

export type ExactTargetPhrase = {
  id: string;
  text: string;
  intentGroup: ExactPhraseIntentGroup;
};

export const MAX_EXACT_TARGET_PHRASE_CHARS = 500;

export function normaliseExactPhraseText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_EXACT_TARGET_PHRASE_CHARS)
    .normalize("NFKC")
    .toLowerCase();
}

export function stableExactTargetPhraseId(
  intentGroup: ExactPhraseIntentGroup,
  text: unknown,
): string {
  const input = `${intentGroup}:${normaliseExactPhraseText(text)}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `phrase-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normaliseSubmittedExactTargetPhrases(value: unknown): ExactTargetPhrase[] {
  if (!Array.isArray(value)) return [];
  const result: ExactTargetPhrase[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const intentGroup = item.intentGroup;
    if (intentGroup !== "discovery" && intentGroup !== "shortlist" && intentGroup !== "comparison") continue;
    const text = typeof item.text === "string"
      ? item.text.trim().replace(/\s+/g, " ").slice(0, MAX_EXACT_TARGET_PHRASE_CHARS)
      : "";
    if (!text) continue;
    const id = stableExactTargetPhraseId(intentGroup, text);
    if (item.id !== id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, text, intentGroup });
  }
  return result;
}
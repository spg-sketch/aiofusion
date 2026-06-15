// Pure helpers for the append-only project backup history. Kept free of any DB
// access so the dedupe decision can be unit tested in isolation.

// The fields of a project that make up its restorable content. owner and
// timestamps are deliberately excluded: a snapshot exists to recover a client's
// work (name, hub data, Set-Up answers, logo), not to track ownership changes.
export interface ProjectContent {
  name?: string | null;
  data?: unknown;
  intake?: unknown;
  logo?: string | null;
}

// Stable stringify so two records with the same content but different key order
// compare equal.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

// True when two project records hold the same restorable content. Used to dedupe
// the backup history: an identical re-save must not add a new snapshot.
export function projectContentEqual(a: ProjectContent, b: ProjectContent): boolean {
  return (
    (a.name ?? "") === (b.name ?? "") &&
    (a.logo ?? null) === (b.logo ?? null) &&
    stableStringify(a.data ?? {}) === stableStringify(b.data ?? {}) &&
    stableStringify(a.intake ?? null) === stableStringify(b.intake ?? null)
  );
}

// Whether a fresh snapshot should be written. Skips when the latest existing
// snapshot already holds identical content (nothing new to back up).
export function shouldSnapshot(
  latest: ProjectContent | null | undefined,
  current: ProjectContent,
): boolean {
  if (!latest) return true;
  return !projectContentEqual(latest, current);
}

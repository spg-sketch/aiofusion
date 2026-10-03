/**
 * A completed response with an explicit items array is the only successful
 * provider outcome. Never turn missing or unusable output into empty success.
 * Citation and public-page validation remain separate, subsequent checks.
 */
export class MediaDiscoveryResponseError extends Error {
  constructor(public readonly reason: string, message = "Live media research received an unusable search response. No completed result was available. Please try again.") {
    super(message);
    this.name = "MediaDiscoveryResponseError";
  }
}

export function parseMediaDiscoveryResponse(response: unknown): Record<string, unknown>[] {
  const fail = (reason: string): never => { throw new MediaDiscoveryResponseError(reason); };
  if (!response || typeof response !== "object") return fail("missing_response");
  const raw = response as Record<string, unknown>;
  if (raw.status !== "completed") return fail("not_completed");
  if (raw.error || raw.incomplete_details) return fail("provider_error");
  if (Array.isArray(raw.output) && raw.output.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const message = entry as Record<string, unknown>;
    return message.type === "message" && (
      (message.status !== undefined && message.status !== "completed")
      || (Array.isArray(message.content) && message.content.some((part) =>
        part && typeof part === "object" && (part as Record<string, unknown>).type === "refusal"))
    );
  })) return fail("refused_or_incomplete_message");
  if (typeof raw.output_text !== "string" || !raw.output_text.trim()) return fail("missing_output_text");
  let parsed: unknown;
  try { parsed = JSON.parse(raw.output_text); } catch { return fail("invalid_json"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || !Array.isArray((parsed as Record<string, unknown>).items)) return fail("invalid_items");
  const items = (parsed as { items: unknown[] }).items;
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail("invalid_candidate");
    const candidate = item as Record<string, unknown>;
    for (const field of ["firstName", "lastName", "outletName", "sourceUrl", "role", "email", "outletWebsite", "evidence", "geography", "mediaOpportunity", "confidence"]) {
      if (typeof candidate[field] !== "string") return fail("invalid_candidate");
    }
    if (!["High", "Medium", "Low"].includes(candidate.confidence as string)) return fail("invalid_candidate");
    for (const field of ["beats", "sectors", "journalistInterests"]) {
      if (!Array.isArray(candidate[field])
          || !(candidate[field] as unknown[]).every((value) => typeof value === "string")) return fail("invalid_candidate");
    }
    for (const [field, requiredFields] of [
      ["recentBylines", ["title", "url", "date", "summary"]],
      ["mediaOpportunities", ["title", "angle", "rationale"]],
      ["phraseAttributions", ["phraseId", "phraseText", "exactPhraseMatch", "articleFit", "publicationAuthorityContext", "suggestedPlacementAngle"]],
    ] as const) {
      if (!Array.isArray(candidate[field])) return fail("invalid_candidate");
      for (const entry of candidate[field] as unknown[]) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail("invalid_candidate");
        const value = entry as Record<string, unknown>;
        if (requiredFields.some((key) => typeof value[key] !== "string")) return fail("invalid_candidate");
      }
    }
  }
  return items as Record<string, unknown>[];
}
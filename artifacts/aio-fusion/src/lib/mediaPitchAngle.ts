import type { Recommendation } from "../pages/JournalistComponents";

/** Match the historical phrase-overlap template, including saved older results. */
export function isGenericPitchTemplate(angle: string): boolean {
  return /^frame the article around\s+[\s\S]+?\s+for the contact['’]s\s+[\s\S]+?\s+coverage\.?$/i.test(angle.trim());
}

/** Prefer contact-specific suggestions; profile overlap alone is not a pitch. */
export function selectMediaPitchAngle(item: Recommendation): string | undefined {
  const contact = item.contact;
  const candidates = [
    item.pitchSuggestion?.angle,
    item.assessment?.suggestedAngle,
    ...(contact.mediaOpportunities ?? []).map((opportunity) => opportunity.angle),
    ...(contact.provenance?.latestPublicDiscovery?.mediaOpportunities ?? []).map((opportunity) => opportunity.angle),
    ...(item.phraseAttributions ?? []).map((attribution) => attribution.suggestedPlacementAngle),
  ];
  return candidates
    .map((angle) => angle?.trim())
    .find((angle): angle is string => typeof angle === "string" && angle.length > 0 && !isGenericPitchTemplate(angle));
}
export const MEDIA_RECOMMENDATION_STOP_WORDS = new Set([
  "a", "an", "and", "at", "cover", "covering", "for", "in", "of", "on", "or",
  "the", "who", "with", "journalist", "journalists", "reporter", "reporters",
  "editor", "editors", "writing", "writes",
]);

export type MediaRecommendationCandidate = {
  id: number;
  role: string;
  beats: string[];
  sectors: string[];
  notes: string;
  email: string;
  lastVerifiedAt: Date | null;
};

export function scoreMediaRecommendation(
  contact: MediaRecommendationCandidate,
  terms: string[],
): { score: number; reasons: string[] } {
  const corpus = [
    contact.role,
    contact.beats.join(" "),
    contact.sectors.join(" "),
    contact.notes,
  ].join(" ").toLowerCase();
  const matches = terms.filter(
    (term) => !MEDIA_RECOMMENDATION_STOP_WORDS.has(term) && term.length > 3 && corpus.includes(term),
  );
  const reasons = matches.map((term) => `Coverage profile matches “${term}”`);
  if (contact.email) reasons.push("Public contact email is available");
  if (contact.lastVerifiedAt) reasons.push("Contact record has a verification date");
  return {
    score: Math.min(100, matches.length * 20 + (contact.email ? 10 : 0) + (contact.lastVerifiedAt ? 5 : 0)),
    reasons,
  };
}
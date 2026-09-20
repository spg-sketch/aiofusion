/**
 * The editorial scorer is deliberately boring.  It is a small, deterministic
 * check over the information in the media database, rather than an authority
 * or reach model.  In particular, a contact's email address is not evidence
 * of editorial fit.
 */

export type TargetingBrief = {
  topic: string;
  angle: string;
  audience: string;
  regions: string[];
  publicationTypes: string[];
  whyNow: string;
};

export type CoverageEvidence = {
  title: string;
  url: string;
  publishedAt: string | null;
  checkedAt: string;
  excerpt: string;
  attribution: "page_checked" | "search_suggested";
  authorMatched: boolean;
};

export type EditorialAssessment = {
  version: "editorial-v1";
  fitScore: number | null;
  confidence: "high" | "medium" | "low";
  evidenceCoverage: number;
  factors: Array<{
    key: string;
    label: string;
    weight: number;
    score: number | null;
    reason: string;
  }>;
  readiness: {
    status: "ready" | "needs_check" | "blocked";
    reasons: string[];
  };
  evidence: CoverageEvidence[];
  warnings: string[];
  suggestedAngle: string | null;
};

export type EditorialRankingInput = {
  contact?: Record<string, unknown> | null;
  outlet?: Record<string, unknown> | null;
  brief: TargetingBrief | Record<string, unknown>;
  terms?: unknown;
  targetPhrases?: unknown;
  evidence?: unknown;
  now?: string | Date;
  departed?: boolean;
  doNotContact?: boolean;
};

type AnyRecord = Record<string, unknown>;
type Factor = EditorialAssessment["factors"][number];

export const UNNAMED_CONTACT_SCORE_REDUCTION = 15;
export const UNNAMED_CONTACT_REASON = "Contact name is not recorded; reduced by 15 points for identity review before outreach.";

const UNUSABLE_NAME_VALUES = new Set([
  "unknown",
  "unnamed",
  "not known",
  "not recorded",
  "not available",
  "n a",
  "na",
  "none",
  "contact",
  "journalist",
  "reporter",
  "editor",
  "publication",
]);

const FACTOR_WEIGHTS = {
  topic: 30,
  recent: 25,
  audience: 20,
  geography: 15,
  angle: 10,
} as const;

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "of", "on", "or", "the", "to",
  "with", "who", "why", "now", "about", "cover", "covering", "journalist",
  "journalists", "reporter", "reporters", "editor", "editors",
]);

const aliases: Record<string, string> = {
  gb: "gb",
  uk: "gb",
  "united kingdom": "gb",
  "great britain": "gb",
  britain: "gb",
  england: "gb",
  scotland: "gb",
  wales: "gb",
  "northern ireland": "gb",
  us: "us",
  usa: "us",
  "united states": "us",
  america: "us",
  eu: "eu",
  europe: "eu",
  global: "global",
  worldwide: "global",
  international: "global",
  "no restriction": "global",
};

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function values(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => values(item));
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function first(record: AnyRecord | null | undefined, keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function fieldText(record: AnyRecord | null | undefined, keys: string[]): string {
  return text(first(record, keys));
}

function fieldValues(record: AnyRecord | null | undefined, keys: string[]): string[] {
  return values(first(record, keys));
}

function meaningfulPersonalName(value: unknown): boolean {
  const normalised = key(text(value));
  return normalised.length > 0
    && /[\p{L}]/u.test(normalised)
    && !UNUSABLE_NAME_VALUES.has(normalised);
}

export function hasUsableContactName(contact: Record<string, unknown> | null | undefined): boolean {
  if (!contact) return false;
  return [
    contact.firstName,
    contact.first_name,
    contact.givenName,
    contact.given_name,
    contact.lastName,
    contact.last_name,
    contact.familyName,
    contact.family_name,
    contact.fullName,
    contact.full_name,
    contact.contactName,
    contact.contact_name,
  ].some(meaningfulPersonalName);
}

export function reduceScoreForMissingContactName(
  score: number,
  contact: Record<string, unknown> | null | undefined,
): { score: number; reason: string | null } {
  const boundedScore = Math.max(0, Math.min(100, score));
  if (hasUsableContactName(contact)) return { score: boundedScore, reason: null };
  return {
    score: Math.max(0, boundedScore - UNNAMED_CONTACT_SCORE_REDUCTION),
    reason: UNNAMED_CONTACT_REASON,
  };
}

/**
 * Tokenisation is intentionally shared by every factor.  Matching a token
 * sequence means "AI" does not match "email", and "energy" does not match
 * "energywise".  Target phrases are deduplicated separately, while keeping
 * corpus order intact so a phrase split across adjacent words remains usable.
 */
function tokens(input: string): string[] {
  const matches = input.toLocaleLowerCase().normalize("NFKC")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  return matches;
}

function key(value: string): string {
  return tokens(value).join(" ");
}

function uniquePhrases(items: unknown): string[] {
  return [...new Set(values(items)
    .map((item) => key(item))
    .filter((item) => item.length > 0 && !STOP_WORDS.has(item)))];
}

function phraseTokens(phrase: string): string[] {
  return phrase.split(" ").filter((token) => token.length > 0);
}

function includesPhrase(corpus: string, phrase: string): boolean {
  const haystack = tokens(corpus);
  const needle = phraseTokens(phrase);
  if (!needle.length || needle.length > haystack.length) return false;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, offset) => haystack[index + offset] === token)) return true;
  }
  return false;
}

function matchingScore(corpus: string, phrases: string[]): { score: number; matched: string[] } {
  if (!phrases.length) return { score: 0, matched: [] };
  const matched = phrases.filter((phrase) => includesPhrase(corpus, phrase));
  return {
    score: Math.round((matched.length / phrases.length) * 100),
    matched,
  };
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

function nowDate(value: unknown): Date {
  return asDate(value) ?? new Date();
}

function daysBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 86_400_000;
}

function normaliseRegion(value: string): string {
  const normal = key(value);
  return aliases[normal] ?? normal;
}

function regionMatches(candidate: string, requested: string): boolean {
  const target = normaliseRegion(requested);
  if (target === "global") return true;
  const candidateKey = normaliseRegion(candidate);
  if (candidateKey === target) return true;
  // This covers "London, United Kingdom" and similar DB geography labels
  // without turning arbitrary substring matching back on.
  return includesPhrase(candidate, requested.toLocaleLowerCase().normalize("NFKC"));
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || (typeof value === "string" && /^(true|yes|1)$/i.test(value.trim()));
}

function evidenceWasManual(raw: AnyRecord): boolean {
  const source = [
    fieldText(raw, ["source", "sourceType", "source_type", "kind", "provenance", "sourceRef", "source_ref"]),
    fieldText(raw, ["imported", "manual"]),
    isRecord(raw.provenance) ? fieldText(raw.provenance, ["kind", "source", "sourceType", "source_type"]) : "",
  ].join(" ").toLocaleLowerCase();
  return bool(raw.manual) || bool(raw.imported)
    || /manual|import|csv|spreadsheet/.test(source);
}

function normaliseEvidence(item: unknown): CoverageEvidence | null {
  if (!isRecord(item)) return null;
  const attribution = item.attribution === "page_checked" && !evidenceWasManual(item)
    ? "page_checked"
    : "search_suggested";
  const published = item.publishedAt ?? item.published_at;
  const checked = item.checkedAt ?? item.checked_at;
  const publishedAt = published === null || published === undefined
    ? null
    : typeof published === "string"
      ? published.trim()
      : (asDate(published)?.toISOString() ?? null);
  const checkedAt = typeof checked === "string"
    ? checked.trim()
    : (asDate(checked)?.toISOString() ?? "");
  return {
    title: fieldText(item, ["title", "headline"]),
    url: fieldText(item, ["url", "sourceUrl", "source_url"]),
    publishedAt,
    checkedAt,
    excerpt: fieldText(item, ["excerpt", "summary", "snippet"]),
    attribution,
    authorMatched: bool(item.authorMatched ?? item.author_matched),
  };
}

function hasExplicitSuppression(contact: AnyRecord, outlet: AnyRecord, value: unknown): boolean {
  if (bool(value)) return true;
  const fields = [
    first(contact, ["doNotContact", "do_not_contact", "suppressed", "suppression"]),
    first(outlet, ["doNotContact", "do_not_contact", "suppressed", "suppression"]),
  ];
  if (fields.some(bool)) return true;
  const status = [
    fieldText(contact, ["contactStatus", "contact_status", "suppressionStatus", "suppression_status", "status"]),
    fieldText(outlet, ["contactStatus", "contact_status", "suppressionStatus", "suppression_status", "status"]),
  ].join(" ").toLocaleLowerCase();
  return /do not contact|suppressed|unsubscribed|blacklist/.test(status);
}

function hasDeparted(contact: AnyRecord, value: unknown): boolean {
  if (bool(value) || bool(first(contact, ["departed", "hasDeparted", "has_departed"]))) return true;
  const status = fieldText(contact, ["editorialStatus", "editorial_status", "contactStatus", "contact_status", "status"])
    .toLocaleLowerCase();
  return /departed|left the|no longer/.test(status);
}

function validContactRoute(contact: AnyRecord): boolean {
  const email = fieldText(contact, ["email", "emailAddress", "email_address"]);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return true;
  const phone = fieldText(contact, ["phone", "mobile", "telephone"]);
  if (phone.replace(/\D/g, "").length >= 7) return true;
  const linkedIn = fieldText(contact, ["linkedinUrl", "linkedin_url"]);
  return /^https?:\/\/\S+/i.test(linkedIn);
}

function sourceCheck(contact: AnyRecord): { outcome: string; checkedAt: Date | null } {
  const nested = first(contact, ["lastSourceCheck", "last_source_check", "sourceCheck", "source_check"]);
  const record = isRecord(nested) ? nested : contact;
  const outcome = fieldText(record, [
    "outcome",
    "sourceCheckOutcome",
    "source_check_outcome",
    "lastSourceCheckOutcome",
    "last_source_check_outcome",
  ]).toLowerCase();
  const checked = first(record, [
    "checkedAt",
    "checked_at",
    "sourceCheckCheckedAt",
    "source_check_checked_at",
    "lastSourceCheckCheckedAt",
    "last_source_check_checked_at",
  ]);
  return { outcome, checkedAt: asDate(checked) };
}

function topicCorpus(contact: AnyRecord): string {
  // Notes/review notes are intentionally not included: operational notes are
  // not an editorial beat and are too easy to stuff with ranking keywords.
  return [
    fieldText(contact, ["role", "jobTitle", "job_title"]),
    ...fieldValues(contact, ["beats", "beat"]),
    ...fieldValues(contact, ["sectors", "sector"]),
  ].join(" ");
}

function audienceCorpus(outlet: AnyRecord): string {
  return [
    fieldText(outlet, ["category", "publicationCategory", "publication_category"]),
    ...fieldValues(outlet, ["sector", "sectors", "publicationSector", "publication_sector"]),
  ].join(" ");
}

function outletPublicationTypes(outlet: AnyRecord): string[] {
  return fieldValues(outlet, ["publicationType", "publication_type", "publicationTypes", "publication_types", "type"]);
}

function factor(
  keyName: string,
  label: string,
  weight: number,
  score: number | null,
  reason: string,
): Factor {
  return { key: keyName, label, weight, score, reason };
}

export function assessEditorialFit(input: EditorialRankingInput): EditorialAssessment {
  const contact = isRecord(input.contact) ? input.contact : {};
  const outlet = isRecord(input.outlet) ? input.outlet : {};
  const brief = isRecord(input.brief) ? input.brief : {};
  const now = nowDate(input.now);
  const rawEvidence = Array.isArray(input.evidence) ? input.evidence : [];
  const evidence = rawEvidence.flatMap((item) => {
    const normalised = normaliseEvidence(item);
    return normalised ? [normalised] : [];
  });
  const warnings: string[] = [];
  const namedContact = hasUsableContactName(contact);
  if (!namedContact) {
    warnings.push("Contact name is not recorded; verify the person's identity before outreach.");
  }

  const topicTargets = uniquePhrases([
    brief.topic,
    ...values(input.terms),
  ]);
  const contactTopicCorpus = topicCorpus(contact);
  const topic = matchingScore(contactTopicCorpus, topicTargets);
  const topicFactor = topicTargets.length && contactTopicCorpus.trim()
    ? factor(
      "topic",
      "Topic fit",
      FACTOR_WEIGHTS.topic,
      topic.score,
      topic.matched.length
        ? `Matched ${topic.matched.join(", ")} in beats, sectors or role.`
        : "No topic target matched the contact's beats, sectors or role.",
    )
    : factor(
      "topic",
      "Topic fit",
      FACTOR_WEIGHTS.topic,
      null,
      topicTargets.length
        ? "Unknown: the contact has no beats, sectors or role to compare."
        : "Unknown: no topic terms were supplied.",
    );

  const validRecent = evidence
    .filter((item) => item.attribution === "page_checked" && item.authorMatched)
    .map((item) => ({ item, date: asDate(item.publishedAt) }))
    .filter((item): item is { item: CoverageEvidence; date: Date } => !!item.date)
    .filter((item) => item.date.getTime() <= now.getTime() && /^https?:\/\//i.test(item.item.url))
    .filter(({ item }) => topicTargets.length > 0
      && matchingScore(`${item.title} ${item.excerpt}`, topicTargets).matched.length > 0);
  const newest = validRecent.sort((left, right) => right.date.getTime() - left.date.getTime())[0];
  let recentScore: number | null = null;
  if (newest) {
    const age = Math.max(0, daysBetween(now, newest.date));
    // Deliberately stepped decay.  These are editorial review windows, not a
    // claim that a story's value decreases at a mathematically precise rate.
    recentScore = age <= 180 ? 100 : age <= 365 ? 70 : age <= 730 ? 35 : 0;
  }
  const recentFactor = factor(
    "recent",
    "Recent verified coverage",
    FACTOR_WEIGHTS.recent,
    recentScore,
    newest
      ? `Newest matching article was published ${Math.round(Math.max(0, daysBetween(now, newest.date)))} days ago (publication age; 180/365/730-day decay).`
      : "Unknown: no page-checked, author-matched coverage with a valid, non-future public date and topic overlap.",
  );

  const audienceTargets = uniquePhrases([
    brief.audience,
    ...values(brief.publicationTypes),
  ]);
  const outletTypes = outletPublicationTypes(outlet);
  const outletAudienceCorpus = audienceCorpus(outlet);
  const audience = matchingScore(outletAudienceCorpus, audienceTargets);
  const typeMatch = audienceTargets.length && outletTypes.length
    ? matchingScore(outletTypes.join(" "), audienceTargets)
    : null;
  const audienceScore = audienceTargets.length && (outletAudienceCorpus.trim() || outletTypes.length)
    ? Math.max(audience.score, typeMatch?.score ?? 0)
    : null;
  const audienceFactor = factor(
    "audience",
    "Audience/publication fit",
    FACTOR_WEIGHTS.audience,
    audienceScore,
    audienceScore === null
      ? audienceTargets.length
        ? "Unknown: the outlet has no category, sector or publication type to compare."
        : "Unknown: no audience or publication-type target was supplied."
      : audienceScore
        ? `Matched ${[...audience.matched, ...(typeMatch?.matched ?? [])].join(", ")} in outlet category/sector or publication type.`
        : "No audience target matched the outlet category, sector or publication type; reach and authority are not used.",
  );

  const requestedRegions = values(brief.regions);
  const candidateRegions = [
    ...fieldValues(contact, ["geography", "region", "regions", "country"]),
    ...fieldValues(outlet, ["country", "geography", "region", "regions"]),
  ];
  let geographyScore: number | null = null;
  if (requestedRegions.some((region) => normaliseRegion(region) === "global")) {
    geographyScore = 100;
  } else if (requestedRegions.length && candidateRegions.length) {
    geographyScore = requestedRegions.some((target) =>
      candidateRegions.some((candidate) => regionMatches(candidate, target))) ? 100 : 0;
  }
  const geographyFactor = factor(
    "geography",
    "Geography fit",
    FACTOR_WEIGHTS.geography,
    geographyScore,
    geographyScore === null
      ? "Unknown: no target region and candidate geography were both available."
      : geographyScore
        ? "Candidate geography matches the requested region."
        : "Candidate geography does not match the requested region.",
  );

  const angleTargets = uniquePhrases([
    brief.angle,
    ...values(input.targetPhrases),
    brief.whyNow,
  ]);
  const trustedEvidence = evidence.filter((item) => item.attribution === "page_checked" && item.authorMatched);
  const evidenceCorpus = trustedEvidence.map((item) => `${item.title} ${item.excerpt}`).join(" ");
  const angle = matchingScore(evidenceCorpus, angleTargets);
  const angleScore = trustedEvidence.length && angleTargets.length && evidenceCorpus.trim() ? angle.score : null;
  const angleFactor = factor(
    "angle",
    "Angle fit",
    FACTOR_WEIGHTS.angle,
    angleScore,
    angleScore === null
      ? "Unknown: author-matched page-checked coverage is required before an angle can be inferred."
      : angle.matched.length
        ? `Deterministically matched ${angle.matched.join(", ")} in coverage evidence; this is not an AI inference.`
        : "No supplied angle or target phrase matched the coverage title or excerpt.",
  );

  const factors = [topicFactor, recentFactor, audienceFactor, geographyFactor, angleFactor];
  const known = factors.filter((item) => item.score !== null);
  const knownWeight = known.reduce((sum, item) => sum + item.weight, 0);
  const fitScore = knownWeight
    ? Math.round(known.reduce((sum, item) => sum + item.weight * (item.score ?? 0), 0) / knownWeight)
    : null;
  // This is coverage of the weighted model, not a claim that a sparse record
  // has been verified.  Keeping it separate prevents a perfect topic-only
  // result from looking like a well-supported recommendation.
  const evidenceCoverage = Math.round(knownWeight);
  if (fitScore !== null && fitScore === 100 && knownWeight < 100) {
    warnings.push("Sparse evidence prevents a confident perfect score; unknown factors were excluded from the normalized fit.");
  }
  if (!evidence.length) warnings.push("No coverage evidence was supplied; recent and angle factors are unknown.");
  if (evidence.some((item) => item.attribution !== "page_checked")) {
    warnings.push("Search-suggested, imported, or manual evidence is not page verification.");
  }
  if (evidence.some((item) => item.attribution === "page_checked" && item.authorMatched
    && (!asDate(item.publishedAt) || (asDate(item.publishedAt) as Date).getTime() > now.getTime()))) {
    warnings.push("Future or invalid public dates are excluded from recent coverage.");
  }

  const pageChecks = evidence
    .filter((item) => item.attribution === "page_checked")
    .map((item) => asDate(item.checkedAt))
    .filter((date): date is Date => !!date && date.getTime() <= now.getTime());
  const newestCheck = pageChecks.sort((left, right) => right.getTime() - left.getTime())[0];
  const routeAvailable = validContactRoute(contact);
  const source = sourceCheck(contact);
  const currentSourceCheck = source.outcome === "current"
    && !!source.checkedAt
    && source.checkedAt.getTime() <= now.getTime()
    && daysBetween(now, source.checkedAt) <= 180;
  const currentRoleEvidence = validRecent.some(({ item, date }) => {
    const checkedAt = asDate(item.checkedAt);
    return date.getTime() <= now.getTime()
      && daysBetween(now, date) <= 730
      && !!checkedAt
      && checkedAt.getTime() <= now.getTime()
      && daysBetween(now, checkedAt) <= 180;
  });
  const trustedCurrentEvidence = currentRoleEvidence || currentSourceCheck;
  const readinessReasons: string[] = [];
  let readiness: EditorialAssessment["readiness"]["status"] = "ready";
  if (hasDeparted(contact, input.departed)) {
    readiness = "blocked";
    readinessReasons.push("Contact is marked as departed.");
  }
  if (hasExplicitSuppression(contact, outlet, input.doNotContact)) {
    readiness = "blocked";
    readinessReasons.push("Contact or outlet is suppressed / do-not-contact.");
  }
  if (readiness !== "blocked") {
    if (!namedContact) {
      readiness = "needs_check";
      readinessReasons.push("Contact name is not recorded; identity must be reviewed before outreach.");
    }
    if (!routeAvailable) {
      readiness = "needs_check";
      readinessReasons.push("No valid contact route is available; an email address, phone number, or direct profile route is required.");
    } else if (!newestCheck && !currentSourceCheck) {
      readiness = "needs_check";
      readinessReasons.push("No successful current role/source verification is established; a contact route alone is not readiness.");
    } else if (newestCheck && daysBetween(now, newestCheck) > 180 && !currentSourceCheck) {
      readiness = "needs_check";
      readinessReasons.push("The latest page/source verification check is more than 180 days old.");
    } else if (!currentRoleEvidence && !currentSourceCheck) {
      readiness = "needs_check";
      readinessReasons.push("The available byline is historical or otherwise does not establish the journalist's current role.");
    } else {
      readinessReasons.push("A valid contact route and current role/source verification are available.");
    }
  }

  let confidence: EditorialAssessment["confidence"];
  if (knownWeight >= 90 && trustedCurrentEvidence && readiness === "ready") confidence = "high";
  else if (knownWeight >= 60 && trustedEvidence.length > 0) confidence = "medium";
  else confidence = "low";
  if (confidence === "low" && fitScore !== null) {
    warnings.push("Confidence is low because the available evidence is sparse or unverified.");
  }

  let suggestedAngle: string | null = null;
  const suggestionEvidence = validRecent.length > 0;
  if (suggestionEvidence && angle.matched.length) {
    const requestedAngle = text(brief.angle);
    suggestedAngle = requestedAngle && includesPhrase(evidenceCorpus, key(requestedAngle))
      ? requestedAngle
      : angle.matched[0];
  }

  return {
    version: "editorial-v1",
    fitScore,
    confidence,
    evidenceCoverage,
    factors,
    readiness: { status: readiness, reasons: readinessReasons },
    evidence,
    warnings,
    suggestedAngle,
  };
}

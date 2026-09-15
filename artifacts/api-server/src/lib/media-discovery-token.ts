import { createHmac, timingSafeEqual } from "node:crypto";

export type TrustedMediaDiscovery = {
  candidateKey: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  outletName: string;
  outletWebsite: string;
  sourceUrl: string;
  evidence: string;
  beats: string[];
  sectors?: string[];
  geography?: string;
  mediaOpportunity?: string;
  recentBylines?: Array<{ title: string; url: string; date?: string; summary?: string }>;
  journalistInterests?: string[];
  mediaOpportunities?: Array<{ title: string; angle: string; rationale?: string }>;
  confidence: "High" | "Medium" | "Low";
  verifiedAt: string;
  phraseAttributions?: Array<{
    phraseId: string;
    phraseText: string;
    exactPhraseMatch: string;
    articleFit: string;
    publicationAuthorityContext: string;
    suggestedPlacementAngle: string;
  }>;
};

export function mediaDiscoveryNotes(candidate: Pick<TrustedMediaDiscovery, "mediaOpportunity" | "mediaOpportunities" | "journalistInterests" | "recentBylines" | "evidence">): string {
  return [
    candidate.mediaOpportunities?.length
      ? `Media opportunities:\n${candidate.mediaOpportunities.map((opportunity) => `- ${opportunity.title}: ${opportunity.angle}${opportunity.rationale ? ` (${opportunity.rationale})` : ""}`).join("\n")}`
      : candidate.mediaOpportunity ? `Media opportunities:\n- ${candidate.mediaOpportunity}` : "",
    candidate.journalistInterests?.length ? `Journalist interests/topics: ${candidate.journalistInterests.join(", ")}` : "",
    candidate.recentBylines?.length
      ? `Recent bylines:\n${candidate.recentBylines.map((byline) => `- ${byline.title}${byline.date ? ` (${byline.date})` : ""} - ${byline.url}${byline.summary ? `: ${byline.summary}` : ""}`).join("\n")}`
      : "",
    candidate.evidence ? `Cited source evidence: ${candidate.evidence}` : "",
  ].filter(Boolean).join("\n\n");
}

type DiscoveryTokenPayload = {
  accountId: string;
  projectId: string;
  expiresAt: number;
  items: TrustedMediaDiscovery[];
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required for media discovery tokens");
  return value;
}

export function signMediaDiscoveries(payload: DiscoveryTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyMediaDiscoveries(token: string): DiscoveryTokenPayload | null {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) return null;
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  let suppliedBuffer: Buffer;
  try {
    suppliedBuffer = Buffer.from(supplied, "base64url");
  } catch {
    return null;
  }
  if (suppliedBuffer.length !== expected.length || !timingSafeEqual(suppliedBuffer, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DiscoveryTokenPayload;
    if (!parsed || typeof parsed.accountId !== "string" || typeof parsed.projectId !== "string" || !Array.isArray(parsed.items)) return null;
    if (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
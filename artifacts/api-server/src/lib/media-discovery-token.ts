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
  confidence: "High" | "Medium" | "Low";
  verifiedAt: string;
};

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
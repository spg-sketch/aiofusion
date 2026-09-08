import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signMediaDiscoveries, verifyMediaDiscoveries, type TrustedMediaDiscovery } from "./media-discovery-token";

const item: TrustedMediaDiscovery = {
  candidateKey: "candidate-1",
  firstName: "Jane",
  lastName: "Reporter",
  role: "Energy correspondent",
  email: "",
  outletName: "Energy Today",
  outletWebsite: "https://energy.example",
  sourceUrl: "https://energy.example/authors/jane-reporter",
  evidence: "Official author profile.",
  beats: ["energy"],
  confidence: "High",
  verifiedAt: "2026-09-08T12:00:00.000Z",
};

describe("signed media discovery tokens", () => {
  const previousSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  });

  it("round-trips server-trusted candidates", () => {
    const token = signMediaDiscoveries({
      accountId: "agency-a",
      projectId: "project-1",
      expiresAt: Date.now() + 60_000,
      items: [item],
    });

    expect(verifyMediaDiscoveries(token)).toMatchObject({
      accountId: "agency-a",
      projectId: "project-1",
      items: [item],
    });
  });

  it("rejects tampering and expired search results", () => {
    const valid = signMediaDiscoveries({
      accountId: "agency-a",
      projectId: "project-1",
      expiresAt: Date.now() + 60_000,
      items: [item],
    });
    const [payload, signature] = valid.split(".");
    const changedPayload = `${payload[0] === "A" ? "B" : "A"}${payload.slice(1)}`;
    expect(verifyMediaDiscoveries(`${changedPayload}.${signature}`)).toBeNull();

    const expired = signMediaDiscoveries({
      accountId: "agency-a",
      projectId: "project-1",
      expiresAt: Date.now() - 1,
      items: [item],
    });
    expect(verifyMediaDiscoveries(expired)).toBeNull();
  });
});
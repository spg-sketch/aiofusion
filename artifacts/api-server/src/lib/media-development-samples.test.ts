import { describe, expect, it } from "vitest";
import {
  assertDevelopmentSeedEnvironment,
  DEVELOPMENT_MEDIA_SAMPLES,
  MEDIA_DEV_SAMPLE_PREFIX,
  MEDIA_DEV_SOURCE_PREFIX,
} from "./media-development-samples";
import { scoreMediaRecommendation } from "./media-recommendation-ranking";

const rankedFor = (terms: string[]) => DEVELOPMENT_MEDIA_SAMPLES
  .map((entry, index) => ({
    entry,
    ...scoreMediaRecommendation({
      id: index + 1,
      ...entry.contact,
      lastVerifiedAt: null,
    }, terms),
  }))
  .filter((entry) => entry.score > 0)
  .sort((left, right) => right.score - left.score);

describe("development media samples", () => {
  it("uses conspicuous synthetic markers and non-deliverable contact details", () => {
    expect(DEVELOPMENT_MEDIA_SAMPLES.length).toBeGreaterThanOrEqual(4);
    for (const entry of DEVELOPMENT_MEDIA_SAMPLES) {
      expect(entry.outlet.name.startsWith(MEDIA_DEV_SAMPLE_PREFIX)).toBe(true);
      expect(entry.outlet.website.endsWith(".example.test")).toBe(true);
      expect(entry.contact.email.endsWith(".example.test")).toBe(true);
      expect(entry.contact.sourceRef.startsWith(MEDIA_DEV_SOURCE_PREFIX)).toBe(true);
      expect(entry.contact.provenance).toMatchObject({ kind: "development-sample", synthetic: true });
      expect(entry.contact.beats.length).toBeGreaterThan(1);
      expect(entry.contact.sectors.length).toBeGreaterThan(1);
      expect(entry.contact.role).not.toBe("");
      expect(entry.contact.notes).not.toBe("");
    }
    expect(new Set(DEVELOPMENT_MEDIA_SAMPLES.map((entry) => entry.contact.sourceRef)).size)
      .toBe(DEVELOPMENT_MEDIA_SAMPLES.length);
  });

  it("refuses test, production and deployed environments", () => {
    expect(() => assertDevelopmentSeedEnvironment({})).toThrow(/only/i);
    expect(() => assertDevelopmentSeedEnvironment({ MEDIA_DEVELOPMENT_SEED: "1", NODE_ENV: "production" })).toThrow(/only/i);
    expect(() => assertDevelopmentSeedEnvironment({ MEDIA_DEVELOPMENT_SEED: "1", REPLIT_DEPLOYMENT: "deployment-id" })).toThrow(/only/i);
    expect(() => assertDevelopmentSeedEnvironment({ MEDIA_DEVELOPMENT_SEED: "1" })).not.toThrow();
  });

  it("returns distinct useful matches for climate and fintech stories", () => {
    const climate = rankedFor(["renewable energy", "battery storage", "climate"]);
    const fintech = rankedFor(["fintech", "payments", "digital banking"]);
    expect(climate[0].entry.key).toBe("climate-grid");
    expect(climate[0].score).toBeGreaterThanOrEqual(50);
    expect(fintech[0].entry.key).toBe("fintech-signal");
    expect(fintech[0].score).toBeGreaterThanOrEqual(50);
    expect(climate[0].entry.key).not.toBe(fintech[0].entry.key);
  });
});
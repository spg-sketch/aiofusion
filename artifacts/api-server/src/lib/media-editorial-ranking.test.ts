import { describe, expect, it } from "vitest";
import {
  assessEditorialFit,
  hasUsableContactName,
  reduceScoreForMissingContactName,
  UNNAMED_CONTACT_REASON,
  type CoverageEvidence,
  type TargetingBrief,
} from "./media-editorial-ranking";

const brief: TargetingBrief = {
  topic: "renewable energy",
  angle: "grid resilience",
  audience: "energy",
  regions: ["United Kingdom"],
  publicationTypes: ["trade"],
  whyNow: "winter demand",
};

const checked = (overrides: Partial<CoverageEvidence> = {}): CoverageEvidence => ({
  title: "Grid resilience and renewable energy",
  url: "https://example.com/story",
  publishedAt: "2025-02-01T00:00:00.000Z",
  checkedAt: "2025-02-02T00:00:00.000Z",
  excerpt: "Grid resilience is now a priority for renewable energy operators.",
  attribution: "page_checked",
  authorMatched: true,
  ...overrides,
});

const contact = {
  firstName: "Jane",
  role: "Energy correspondent",
  beats: ["renewable energy", "grid resilience"],
  sectors: ["energy"],
  geography: "GB",
  email: "writer@example.com",
};

const outlet = {
  category: "Energy trade",
  country: "United Kingdom",
  publicationType: "trade",
};

describe("assessEditorialFit", () => {
  it("recognises meaningful personal-name fields but not publication or placeholder labels", () => {
    expect(hasUsableContactName({ firstName: "Jane" })).toBe(true);
    expect(hasUsableContactName({ last_name: "Smith" })).toBe(true);
    expect(hasUsableContactName({ name: "Energy Daily" })).toBe(false);
    expect(hasUsableContactName({ firstName: "Unknown", lastName: "Reporter" })).toBe(false);
    expect(hasUsableContactName({ outletName: "Energy Daily" })).toBe(false);
  });

  it("applies one bounded and explainable missing-name reduction", () => {
    expect(reduceScoreForMissingContactName(80, { firstName: "Jane" })).toEqual({ score: 80, reason: null });
    expect(reduceScoreForMissingContactName(80, { firstName: "", lastName: "" })).toEqual({
      score: 65,
      reason: UNNAMED_CONTACT_REASON,
    });
    expect(reduceScoreForMissingContactName(8, {})).toEqual({ score: 0, reason: UNNAMED_CONTACT_REASON });
    expect(reduceScoreForMissingContactName(120, {})).toEqual({ score: 85, reason: UNNAMED_CONTACT_REASON });
  });

  it("requires identity review for an unnamed contact without changing editorial fit", () => {
    const named = assessEditorialFit({ contact: { ...contact, firstName: "Jane" }, outlet, brief, evidence: [checked()] });
    const unnamed = assessEditorialFit({ contact: { ...contact, firstName: "" }, outlet, brief, evidence: [checked()] });
    expect(unnamed.fitScore).toBe(named.fitScore);
    expect(unnamed.readiness.status).toBe("needs_check");
    expect(unnamed.readiness.reasons.join(" ")).toMatch(/name is not recorded/i);
    expect(unnamed.warnings.join(" ")).toMatch(/verify.*identity/i);
  });

  it("uses word boundaries and deduplicates stuffing", () => {
    const result = assessEditorialFit({
      contact: { ...contact, notes: "renewable renewable renewableenergy" },
      outlet,
      brief,
      terms: ["energy", "energy", "energywise"],
      targetPhrases: ["grid resilience", "grid resilience"],
      evidence: [checked()],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(result.factors.find((factor) => factor.key === "topic")?.score).toBe(67);
    expect(result.factors.find((factor) => factor.key === "topic")?.reason).not.toMatch(/notes/i);
    expect(result.factors.find((factor) => factor.key === "topic")?.reason).not.toMatch(/energywise/i);
  });

  it("does not award an email bonus", () => {
    const withEmail = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked()],
      now: "2025-03-01T00:00:00.000Z",
    });
    const withoutEmail = assessEditorialFit({
      contact: { ...contact, email: "" },
      outlet,
      brief,
      evidence: [checked()],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(withEmail.fitScore).toBe(withoutEmail.fitScore);
    expect(withEmail.factors).toEqual(withoutEmail.factors);
  });

  it("applies recency decay and rejects future public dates", () => {
    const recent = assessEditorialFit({
      contact, outlet, brief, evidence: [checked()], now: "2025-03-01T00:00:00.000Z",
    });
    const old = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked({ publishedAt: "2024-01-01T00:00:00.000Z" })],
      now: "2025-03-01T00:00:00.000Z",
    });
    const future = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked({ publishedAt: "2025-04-01T00:00:00.000Z" })],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(recent.factors.find((factor) => factor.key === "recent")?.score).toBe(100);
    expect(old.factors.find((factor) => factor.key === "recent")?.score).toBe(35);
    expect(future.factors.find((factor) => factor.key === "recent")?.score).toBeNull();
  });

  it("requires recent coverage to overlap the requested topic", () => {
    const unrelated = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked({
        title: "Premier league transfer news",
        excerpt: "A football correspondent reports on a summer transfer.",
      })],
      now: "2025-03-01T00:00:00.000Z",
    });
    const authorMismatch = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked({ authorMatched: false })],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(unrelated.factors.find((factor) => factor.key === "recent")?.score).toBeNull();
    expect(authorMismatch.factors.find((factor) => factor.key === "recent")?.score).toBeNull();
  });

  it("does not infer an angle or high confidence from search suggestions alone", () => {
    const result = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked({ attribution: "search_suggested" })],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(result.factors.find((factor) => factor.key === "angle")?.score).toBeNull();
    expect(result.suggestedAngle).toBeNull();
    expect(result.confidence).toBe("low");
  });

  it("does not treat a freshly fetched old byline as current role verification", () => {
    const result = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked({
        publishedAt: "2015-01-01T00:00:00.000Z",
        checkedAt: "2025-02-28T00:00:00.000Z",
      })],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(result.readiness.status).toBe("needs_check");
    expect(result.readiness.reasons.join(" ")).toMatch(/historical|current role/i);
  });

  it("does not become ready without a valid contact route", () => {
    const result = assessEditorialFit({
      contact: { ...contact, email: "" },
      outlet,
      brief,
      evidence: [checked()],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(result.readiness.status).toBe("needs_check");
    expect(result.readiness.reasons.join(" ")).toMatch(/contact route/i);
  });

  it("does not match a wrong region", () => {
    const result = assessEditorialFit({
      contact: { ...contact, geography: "United States" },
      outlet: { ...outlet, country: "United States" },
      brief,
      evidence: [checked()],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(result.factors.find((factor) => factor.key === "geography")?.score).toBe(0);
  });

  it("keeps missing evidence explicit and does not call an email ready", () => {
    const result = assessEditorialFit({ contact, outlet, brief, evidence: [], now: "2025-03-01" });
    expect(result.factors.find((factor) => factor.key === "recent")?.score).toBeNull();
    expect(result.factors.find((factor) => factor.key === "angle")?.score).toBeNull();
    expect(result.evidenceCoverage).toBe(65);
    expect(result.readiness.status).toBe("needs_check");
    expect(result.warnings.join(" ")).toMatch(/No coverage evidence/i);
  });

  it("blocks departed and suppressed contacts", () => {
    expect(assessEditorialFit({
      contact, outlet, brief, evidence: [checked()], departed: true,
    }).readiness.status).toBe("blocked");
    expect(assessEditorialFit({
      contact: { ...contact, doNotContact: true }, outlet, brief, evidence: [checked()],
    }).readiness.status).toBe("blocked");
  });

  it("requires a fresh page check for a stale role", () => {
    const result = assessEditorialFit({
      contact,
      outlet,
      brief,
      evidence: [checked({ checkedAt: "2024-01-01T00:00:00.000Z" })],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(result.readiness.status).toBe("needs_check");
    expect(result.readiness.reasons.join(" ")).toMatch(/180 days/i);
  });

  it("does not award authority or reach to a famous outlet", () => {
    const specialist = assessEditorialFit({
      contact,
      outlet: { ...outlet, category: "Energy trade", reachBand: "Specialist" },
      brief,
      evidence: [checked()],
      now: "2025-03-01T00:00:00.000Z",
    });
    const famous = assessEditorialFit({
      contact,
      outlet: { ...outlet, category: "Energy trade", reachBand: "Global famous", publicationAuthority: 100 },
      brief,
      evidence: [checked()],
      now: "2025-03-01T00:00:00.000Z",
    });
    expect(famous.fitScore).toBe(specialist.fitScore);
  });
});

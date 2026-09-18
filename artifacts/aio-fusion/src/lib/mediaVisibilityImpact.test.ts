import { describe, expect, it } from "vitest";
import { buildMediaVisibilityImpact, mediaVisibilityImpactHtml, type PhraseMeasurement } from "./mediaVisibilityImpact";
import { createExactTargetPhrase } from "./exactTargetPhrases";

const phrase = { id: "phrase-one", text: "best specialist agency", intentGroup: "shortlist" as const };

function measurement(overrides: Partial<PhraseMeasurement> = {}): PhraseMeasurement {
  return {
    phrase,
    provider: "chatgpt",
    model: "gpt-5",
    methodologyVersion: 1,
    effectiveQuery: phrase.text,
    status: "complete",
    expectedRuns: 2,
    completedRuns: 2,
    mentionRuns: 0,
    mentioned: false,
    answerPosition: null,
    citations: [],
    citedDomains: [],
    shareOfVoice: 0,
    competitors: [{ name: "Rival", mentions: 2 }],
    failureLabel: null,
    ...overrides,
  };
}

function audit(id: string, checkedAt: string, sample: PhraseMeasurement) {
  return { id, savedAt: checkedAt, result: { checkedAt, phraseMeasurements: [sample] } };
}

describe("media visibility impact", () => {
  it("keeps edited per-run phrases separate from the saved setup phrase and historical baseline", () => {
    const original = createExactTargetPhrase("shortlist", "Which SMG agency?")!;
    const edited = createExactTargetPhrase("shortlist", "Which specialist SMG agency?")!;
    const before = audit("before", "2026-01-01", measurement({ phrase: original, effectiveQuery: "Which SMG (example.invalid) agency?" }));
    const after = audit("after", "2026-02-01", measurement({ phrase: edited, effectiveQuery: "Which specialist SMG (example.invalid) agency?" }));
    const snapshot = JSON.stringify([before, after]);
    const comparisons = buildMediaVisibilityImpact([before, after], [], []);
    expect(comparisons).toHaveLength(2);
    expect(comparisons.every((item) => item.status === "baseline-only" && !item.deltas)).toBe(true);
    expect(JSON.stringify([before, after])).toBe(snapshot);
    expect(mediaVisibilityImpactHtml("SMG", comparisons)).toContain("Which specialist SMG (example.invalid) agency?");
  });
  it("calculates transparent deltas and includes only linked evidence between comparable checks", () => {
    const baseline = audit("a", "2026-01-01T00:00:00.000Z", measurement());
    const followUp = audit("b", "2026-02-01T00:00:00.000Z", measurement({
      mentionRuns: 2, mentioned: true, answerPosition: 1,
      citations: ["https://news.example/story"], citedDomains: ["news.example"],
      shareOfVoice: 50, competitors: [{ name: "Rival", mentions: 1 }],
    }));
    const outreach = [{
      id: 1, storyKey: "story", status: "placed", articleSnapshot: { title: "Story" },
      contactSnapshot: { name: "Reporter" }, outletSnapshot: { name: "News" }, targetPhrases: [phrase],
      createdAt: "2026-01-05T00:00:00.000Z",
      activities: [{ id: 2, toStatus: "pitched", note: "", occurredAt: "2026-01-10T00:00:00.000Z" }],
      placements: [{ id: 3, headline: "Coverage", canonicalUrl: "https://news.example/story", publicationDate: "2026-01-20T00:00:00.000Z", verification: "page_verified" as const, supportingEvidence: "Byline", verifiedFacts: {} }],
    }];
    const result = buildMediaVisibilityImpact([followUp, baseline], outreach, [{
      id: "story", title: "Story", createdAt: "2025-12-20T00:00:00.000Z", releasedAt: "2026-01-08T00:00:00.000Z", targetPhrases: [phrase],
    }]);
    expect(result[0].status).toBe("comparable");
    expect(result[0].deltas).toEqual({
      mentionRuns: 2, answerPosition: null, citations: 1, citedDomains: 1,
      shareOfVoice: 50, competitorMentions: -1,
    });
    expect(result[0].timeline.map((event) => event.kind)).toEqual(["content", "outreach", "placement"]);
  });

  it("does not convert failed or changed-provider settings into a positive comparison", () => {
    const baseline = audit("a", "2026-01-01T00:00:00.000Z", measurement());
    const failed = audit("b", "2026-02-01T00:00:00.000Z", measurement({ status: "failed", completedRuns: 0, expectedRuns: 2, mentionRuns: 0 }));
    expect(buildMediaVisibilityImpact([baseline, failed], [], [])[0].status).toBe("baseline-only");
    const changed = audit("c", "2026-03-01T00:00:00.000Z", measurement({ model: "gpt-next" }));
    expect(buildMediaVisibilityImpact([baseline, changed], [], [])[0].status).toBe("not-comparable");
    const changedPrompt = audit("d", "2026-04-01T00:00:00.000Z", measurement({ effectiveQuery: `${phrase.text} (new.example)` }));
    expect(buildMediaVisibilityImpact([baseline, changedPrompt], [], [])[0].status).toBe("not-comparable");
    const changedMethod = audit("e", "2026-05-01T00:00:00.000Z", measurement({ methodologyVersion: 2 }));
    expect(buildMediaVisibilityImpact([baseline, changedMethod], [], [])[0].status).toBe("not-comparable");
  });

  it("keeps exported measured values and correlation language aligned", () => {
    const comparisons = buildMediaVisibilityImpact([
      audit("a", "2026-01-01T00:00:00.000Z", measurement()),
      audit("b", "2026-02-01T00:00:00.000Z", measurement({ mentionRuns: 2, mentioned: true, shareOfVoice: 50 })),
    ], [], []);
    const html = mediaVisibilityImpactHtml("Acme", comparisons);
    expect(html).toContain("mentions +2");
    expect(html).toContain("share of voice +50 points");
    expect(html).toContain("do not prove");
    expect(html).not.toContain("caused an improvement");
  });

  it("leaves legacy audits unavailable instead of inventing scores", () => {
    expect(buildMediaVisibilityImpact([{ id: "old", savedAt: "2025-01-01", result: { checkedAt: "2025-01-01" } }], [], [])).toEqual([]);
  });
});
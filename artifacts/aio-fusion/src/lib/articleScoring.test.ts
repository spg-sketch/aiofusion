import { describe, expect, it } from "vitest";
import {
  ARTICLE_SCORING_VERSION,
  assessArticleOptimisation,
  scoreArticle,
} from "./articleScoring";

const context = {
  selectedMessages: ["Built for measurable clean energy savings"],
  targetPhrases: ["clean energy platform"],
  projectDetails: ["AIO Fusion", "United Kingdom"],
};

describe("article scoring", () => {
  it("is deterministic and keeps every published factor within its 25-point allocation", () => {
    const content = {
      headline: "AIO Fusion launches clean energy platform",
      standfirst: "New research-backed tools help United Kingdom teams measure savings.",
      bodyCopy: "AIO Fusion has launched its clean energy platform.\n\nAccording to project data, the service improves measurement because each result links to evidence.\n\nBuilt for measurable clean energy savings.",
    };
    const first = scoreArticle(content, context);
    const second = scoreArticle(content, context);
    expect(second).toEqual(first);
    expect(first.total).toBeGreaterThanOrEqual(0);
    expect(first.total).toBeLessThanOrEqual(100);
    expect(first.factors).toHaveLength(4);
    expect(first.factors.every((factor) => factor.score >= 0 && factor.score <= 25)).toBe(true);
  });

  it("uses the same rubric before and after and reports percentage-point change", () => {
    const before = { headline: "", standfirst: "", bodyCopy: "A short draft." };
    const after = {
      headline: "AIO Fusion launches clean energy platform",
      standfirst: "A structured summary of measurable clean energy savings.",
      bodyCopy: "AIO Fusion has launched its clean energy platform.\n\nBuilt for measurable clean energy savings.\n\nThe service supports United Kingdom teams because every claim can link to project evidence and research data.",
    };
    const assessment = assessArticleOptimisation(before, after, context, []);
    expect(assessment.version).toBe(ARTICLE_SCORING_VERSION);
    expect(assessment.improvement).toBe(assessment.after.total - assessment.before.total);
    expect(assessment.after.total).toBeGreaterThan(assessment.before.total);
  });
});
import { describe, expect, it } from "vitest";
import { estimatedGenerationProgress } from "./contentAi";

describe("estimatedGenerationProgress", () => {
  it("tracks elapsed time against the measured estimate", () => {
    expect(estimatedGenerationProgress(0, 90)).toBe(0);
    expect(estimatedGenerationProgress(45, 90)).toBe(50);
    expect(estimatedGenerationProgress(81, 90)).toBe(90);
  });

  it("stops at 95 percent until a real result arrives", () => {
    expect(estimatedGenerationProgress(90, 90)).toBe(95);
    expect(estimatedGenerationProgress(180, 90)).toBe(95);
  });
});
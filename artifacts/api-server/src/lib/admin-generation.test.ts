import { describe, expect, it } from "vitest";
import { buildAdminGenerationClassification } from "./admin-generation";

describe("buildAdminGenerationClassification", () => {
  it("keeps ordinary URL-generated projects out of the demo audience", () => {
    expect(buildAdminGenerationClassification(false)).toEqual({
      generatedFromUrl: true,
      recentActivity: "Generated from URL",
    });
  });

  it("marks only explicit demo generations as demos", () => {
    expect(buildAdminGenerationClassification(true)).toEqual({
      generatedFromUrl: true,
      demo: true,
      recentActivity: "Demo generated from URL",
    });
  });
});
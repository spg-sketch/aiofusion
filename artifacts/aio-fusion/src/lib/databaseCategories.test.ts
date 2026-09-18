// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const intake = vi.hoisted(() => ({
  value: {
    formData: { "1.9": "  Energy   Media, Technology " },
    businessCategories: ["Legacy business"],
    audienceCategories: ["Customer only"],
  } as Record<string, unknown>,
}));

vi.mock("../IntakeForm", () => ({
  loadIntakeData: () => intake.value,
  getActiveProjectId: () => "project-1",
}));

import { getFreshCategoryDefaults, normaliseCategory, validDatabaseCategories } from "./databaseCategories";

describe("database category validation", () => {
  afterEach(() => {
    intake.value = {
      formData: { "1.9": "  Energy   Media, Technology " },
      businessCategories: ["Legacy business"],
      audienceCategories: ["Customer only"],
    };
  });

  it("matches case and whitespace but retains server display labels", () => {
    expect(normaliseCategory("  ENERGY   media ")).toBe("energy media");
    expect(validDatabaseCategories([" energy   media ", "TECHNOLOGY", "Not in DB"], ["Energy Media", "Technology"]))
      .toEqual(["Energy Media", "Technology"]);
  });

  it("uses explicit section 1.9 and never audience categories", () => {
    expect(getFreshCategoryDefaults()).toEqual(["  Energy   Media", " Technology "]);
    intake.value = { formData: {}, businessCategories: ["Legacy business"], audienceCategories: ["Customer only"] };
    expect(getFreshCategoryDefaults()).toEqual(["Legacy business"]);
    intake.value = { formData: { "1.9": [] }, businessCategories: ["Legacy business"], audienceCategories: ["Customer only"] };
    expect(getFreshCategoryDefaults()).toEqual([]);
  });
});
import { describe, it, expect } from "vitest";
import { intakeIsEmpty, dataIsEmpty } from "./intake-guards";

describe("intakeIsEmpty", () => {
  it("treats null/undefined/non-objects as empty", () => {
    expect(intakeIsEmpty(null)).toBe(true);
    expect(intakeIsEmpty(undefined)).toBe(true);
    expect(intakeIsEmpty("")).toBe(true);
    expect(intakeIsEmpty(42)).toBe(true);
  });

  it("treats a blank Draft (no real answers) as empty", () => {
    expect(intakeIsEmpty({ intakeStatus: "Draft", formData: {} })).toBe(true);
    expect(
      intakeIsEmpty({
        intakeStatus: "Draft",
        formData: { "1.1": "", "4.1": "   " },
        businessCategories: [],
        audienceCategories: [],
        duals: {},
      }),
    ).toBe(true);
  });

  it("treats any real Set-Up answer as populated", () => {
    expect(intakeIsEmpty({ formData: { "4.1": "Bluhalo" } })).toBe(false);
    expect(intakeIsEmpty({ formData: { "6.2": "https://bluhalo.com" } })).toBe(false);
  });

  it("treats populated category lists or duals as populated", () => {
    expect(intakeIsEmpty({ formData: {}, businessCategories: ["Marketing"] })).toBe(false);
    expect(intakeIsEmpty({ formData: {}, audienceCategories: ["CMOs"] })).toBe(false);
    expect(intakeIsEmpty({ formData: {}, duals: { a: 1 } })).toBe(false);
  });
});

describe("dataIsEmpty", () => {
  it("treats null/undefined/non-objects and {} as empty", () => {
    expect(dataIsEmpty(null)).toBe(true);
    expect(dataIsEmpty(undefined)).toBe(true);
    expect(dataIsEmpty({})).toBe(true);
    expect(dataIsEmpty("x")).toBe(true);
  });

  it("treats a record with any keys as populated", () => {
    expect(dataIsEmpty({ id: "default", name: "Bluhalo" })).toBe(false);
  });
});

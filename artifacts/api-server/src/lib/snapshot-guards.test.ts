import { describe, it, expect } from "vitest";
import { projectContentEqual, shouldSnapshot } from "./snapshot-guards";

const A = {
  name: "Bluhalo",
  data: { sector: "PR", colour: "#102B36" },
  intake: { intakeStatus: "Accepted", formData: { "4.1": "Bluhalo" } },
  logo: "data:image/png;base64,AAA",
};

describe("projectContentEqual", () => {
  it("treats identical content as equal regardless of key order", () => {
    const reordered = {
      logo: A.logo,
      intake: { formData: { "4.1": "Bluhalo" }, intakeStatus: "Accepted" },
      data: { colour: "#102B36", sector: "PR" },
      name: "Bluhalo",
    };
    expect(projectContentEqual(A, reordered)).toBe(true);
  });

  it("treats a different name/data/intake/logo as not equal", () => {
    expect(projectContentEqual(A, { ...A, name: "Bluhalo Group" })).toBe(false);
    expect(projectContentEqual(A, { ...A, data: { sector: "Legal" } })).toBe(false);
    expect(projectContentEqual(A, { ...A, intake: { formData: {} } })).toBe(false);
    expect(projectContentEqual(A, { ...A, logo: null })).toBe(false);
  });

  it("normalises empty/missing equivalents", () => {
    expect(projectContentEqual({ name: "", data: {}, intake: null, logo: null }, {})).toBe(true);
    expect(projectContentEqual({ name: undefined }, { name: "" })).toBe(true);
    expect(projectContentEqual({ logo: undefined }, { logo: null })).toBe(true);
  });
});

describe("shouldSnapshot", () => {
  it("always snapshots when there is no prior backup", () => {
    expect(shouldSnapshot(null, A)).toBe(true);
    expect(shouldSnapshot(undefined, A)).toBe(true);
  });

  it("skips when the latest backup is identical (dedupe)", () => {
    expect(shouldSnapshot(A, { ...A })).toBe(false);
  });

  it("snapshots when content has genuinely changed", () => {
    expect(shouldSnapshot(A, { ...A, intake: { formData: { "4.1": "Bluhalo Ltd" } } })).toBe(true);
  });
});

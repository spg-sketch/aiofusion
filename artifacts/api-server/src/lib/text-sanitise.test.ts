import { describe, it, expect } from "vitest";
import { stripEmDashes, deepStripEmDashes } from "./text-sanitise";

describe("stripEmDashes", () => {
  it("replaces a spaced em dash with a spaced hyphen", () => {
    expect(stripEmDashes("the results \u2014 strong growth \u2014 were clear")).toBe(
      "the results - strong growth - were clear",
    );
  });

  it("replaces an em dash with no surrounding spaces", () => {
    expect(stripEmDashes("word\u2014word")).toBe("word - word");
  });

  it("collapses a run of em dashes (the 'double em dash')", () => {
    expect(stripEmDashes("a \u2014\u2014 b")).toBe("a - b");
    expect(stripEmDashes("a\u2014\u2014b")).toBe("a - b");
  });

  it("replaces horizontal bars (U+2015) too", () => {
    expect(stripEmDashes("a \u2015 b")).toBe("a - b");
  });

  it("leaves en dashes and hyphens untouched", () => {
    expect(stripEmDashes("10\u201320")).toBe("10\u201320");
    expect(stripEmDashes("world-class")).toBe("world-class");
  });

  it("preserves newlines, only consuming spaces and tabs around the dash", () => {
    expect(stripEmDashes("line one\n\u2014 line two")).toBe("line one\n - line two");
    expect(stripEmDashes("a \u2014\nb")).toBe("a - \nb");
  });

  it("returns empty / falsy input unchanged", () => {
    expect(stripEmDashes("")).toBe("");
  });
});

describe("deepStripEmDashes", () => {
  it("sanitises strings nested in objects and arrays, leaving non-strings alone", () => {
    const input = {
      headline: "Big news \u2014 today",
      changeLog: [{ kind: "embed", text: "placed message \u2014 in intro" }],
      authority: 90,
      reachVerified: false,
      url: "https://example.com",
    };
    expect(deepStripEmDashes(input)).toEqual({
      headline: "Big news - today",
      changeLog: [{ kind: "embed", text: "placed message - in intro" }],
      authority: 90,
      reachVerified: false,
      url: "https://example.com",
    });
  });

  it("leaves url and email identifier fields byte-for-byte", () => {
    const input = {
      pitchAngle: "great angle \u2014 here",
      url: "https://example.com/a\u2014b",
      journalists: [{ name: "Jo", email: "jo\u2014x@example.com" }],
    };
    expect(deepStripEmDashes(input)).toEqual({
      pitchAngle: "great angle - here",
      url: "https://example.com/a\u2014b",
      journalists: [{ name: "Jo", email: "jo\u2014x@example.com" }],
    });
  });
});

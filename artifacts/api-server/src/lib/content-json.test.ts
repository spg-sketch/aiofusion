import { describe, expect, it } from "vitest";
import { extractContentJson } from "./content-json";

describe("content AI JSON extraction", () => {
  it("reads a fenced pitch with raw newlines and braces inside body copy", () => {
    const draft = '```json\n{"headline":"Angle","bodyCopy":"First line\nSecond {line}","changeLog":[]}\n```';
    expect(extractContentJson(draft)).toMatchObject({
      headline: "Angle",
      bodyCopy: "First line\nSecond {line}",
    });
  });

  it("ignores extra text and subsequent objects around a complete draft", () => {
    expect(extractContentJson('Draft:\n{"bodyCopy":"A complete pitch"}\n{"extra":true}'))
      .toMatchObject({ bodyCopy: "A complete pitch" });
  });

  it("rejects incomplete responses rather than accepting a nested object as the draft", () => {
    expect(extractContentJson('{"bodyCopy":"unfinished","changeLog":[{"kind":"flag"}]')).toBeNull();
    expect(extractContentJson('{"bodyCopy":"unfinished"')).toBeNull();
  });
});
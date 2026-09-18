import { describe, expect, it } from "vitest";
import {
  exactTargetPhraseId,
  buildExactTargetRequest,
  getExactTargetPhrases,
  normaliseExactPhraseText,
  createExactTargetPhrase,
} from "./exactTargetPhrases";

describe("exact target phrase identity", () => {
  it("derives the same ID from harmless case and whitespace changes", () => {
    expect(normaliseExactPhraseText("  Clean   Energy  Teams ")).toBe("clean energy teams");
    expect(exactTargetPhraseId("discovery", "Clean Energy Teams"))
      .toBe(exactTargetPhraseId("discovery", " clean   energy teams "));
    expect(exactTargetPhraseId("discovery", "Clean Energy Teams"))
      .not.toBe(exactTargetPhraseId("shortlist", "Clean Energy Teams"));
  });

  it("uses locale-independent Turkish casing and caps text before hashing", () => {
    const phrase = createExactTargetPhrase("discovery", "İ".repeat(600));
    expect(phrase?.text).toHaveLength(500);
    expect(phrase?.id).toBe(exactTargetPhraseId("discovery", "İ".repeat(500)));
    expect(normaliseExactPhraseText("I")).toBe("i");
    expect(normaliseExactPhraseText("İ")).toBe("i\u0307");
  });

  it("keeps legacy v1 query storage as strings while exposing structured phrases", () => {
    const queries = {
      v: 1 as const,
      discovery: ["How can clean energy teams work faster?"],
      shortlist: ["  How can clean energy teams work faster?  "],
      comparison: ["Which clean energy platform is best?"],
    };
    const phrases = getExactTargetPhrases(queries);
    expect(queries).toEqual({
      v: 1,
      discovery: ["How can clean energy teams work faster?"],
      shortlist: ["  How can clean energy teams work faster?  "],
      comparison: ["Which clean energy platform is best?"],
    });
    expect(phrases).toHaveLength(3);
    expect(phrases[0]).toMatchObject({ text: "How can clean energy teams work faster?", intentGroup: "discovery" });
    expect(phrases.every((phrase) => phrase.id.startsWith("phrase-"))).toBe(true);
    expect(buildExactTargetRequest(phrases.slice(0, 2))).toMatchObject({
      targetPhrases: phrases.slice(0, 2),
      targetQuery: { text: phrases[0].text, category: "discovery" },
    });
  });

  it.each([
    [0, { discovery: [" ", "\n"], shortlist: [], comparison: [] }],
    [8, { discovery: Array.from({ length: 8 }, (_, i) => `Query ${i}`), shortlist: [], comparison: [] }],
    [9, { discovery: Array.from({ length: 9 }, (_, i) => `Query ${i}`), shortlist: [], comparison: [] }],
    [12, { discovery: Array.from({ length: 12 }, (_, i) => `Query ${i}`), shortlist: [], comparison: [] }],
    [13, { discovery: Array.from({ length: 13 }, (_, i) => `Query ${i}`), shortlist: [], comparison: [] }],
  ])("returns the canonical audit count %i without slicing", (count, groups) => {
    expect(getExactTargetPhrases({ v: 1, ...groups })).toHaveLength(count);
  });

  it("ignores blanks, de-duplicates within a group, and keeps cross-group identity", () => {
    const phrases = getExactTargetPhrases({
      v: 1,
      discovery: [" Same query ", "same   QUERY", ""],
      shortlist: ["same query", "  "],
      comparison: [],
    });
    expect(phrases).toHaveLength(2);
    expect(phrases.map(({ text, intentGroup }) => ({ text, intentGroup }))).toEqual([
      { text: "Same query", intentGroup: "discovery" },
      { text: "same query", intentGroup: "shortlist" },
    ]);
    expect(phrases[0].id).not.toBe(phrases[1].id);
  });
});
import { describe, expect, it } from "vitest";
import {
  addOrRemoveHomepagePin,
  HomepagePinLimitError,
  MAX_HOMEPAGE_PINNED_INSIGHTS,
  parseHomepagePinnedIds,
} from "./insights-homepage-pins";

describe("homepage Insights pin storage", () => {
  it("defensively parses a unique list and caps legacy metadata at three", () => {
    expect(parseHomepagePinnedIds(JSON.stringify(["one", "one", "", 42, "two", "three", "four"]))).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(parseHomepagePinnedIds("not-json")).toEqual([]);
  });

  it("adds and removes pins without allowing a fourth", () => {
    const pinned = ["one", "two", "three"];
    expect(() => addOrRemoveHomepagePin(pinned, "four", true)).toThrow(HomepagePinLimitError);
    expect(pinned).toHaveLength(MAX_HOMEPAGE_PINNED_INSIGHTS);
    expect(addOrRemoveHomepagePin(pinned, "two", false)).toEqual(["one", "three"]);
    expect(addOrRemoveHomepagePin(pinned, "two", true)).toEqual(pinned);
  });
});
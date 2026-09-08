import { describe, expect, it } from "vitest";
import { countWebSearchCalls } from "./media-discovery-usage";

describe("media discovery search usage", () => {
  it("counts every chargeable web search in one response", () => {
    expect(countWebSearchCalls([
      { type: "reasoning" },
      { type: "web_search_call" },
      { type: "message" },
      { type: "web_search_call" },
      { type: "web_search_call" },
    ])).toBe(3);
  });
});
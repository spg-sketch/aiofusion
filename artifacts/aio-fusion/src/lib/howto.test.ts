import { describe, expect, it } from "vitest";
import { buildPayload, emptyDraft, validateDraft, errorMessage, isHttps } from "./howto";
import { domToRuns, runsToHtml } from "../components/howto/RichRunsEditor";

describe("howto helpers", () => {
  it("round trips seeded bold, italic and link runs", () => {
    const runs = [{ text: "Click " }, { text: "Create Project", bold: true }, { text: " and ", italic: true }, { text: "read", href: "https://example.com/a?b=1&c=2" }];
    const host = document.createElement("div");
    host.innerHTML = runsToHtml(runs);
    expect(domToRuns(host)).toEqual(runs);
  });
  it("only accepts https links", () => {
    expect(isHttps("https://a.com")).toBe(true);
    expect(isHttps("http://a.com")).toBe(false);
    expect(isHttps("javascript:alert(1)")).toBe(false);
  });
  it("preserves line breaks and browser paragraph boundaries instead of joining words", () => {
    const host = document.createElement("div");
    host.innerHTML = "First<br>second<div>Third paragraph</div><div>Fourth paragraph</div>";
    const text = domToRuns(host).map((run) => run.text).join("");
    expect(text).toBe("First\nsecond\nThird paragraph\nFourth paragraph");
  });
  it("builds a payload without server fields, renumbering steps and dropping image urls", () => {
    const d = { ...emptyDraft(), id: " my-id ", title: "T", description: "D", displayOrder: "4", body: [
      { type: "step" as const, number: 9, title: "a", runs: [{ text: "x" }, { text: "" }] },
      { type: "step" as const, number: 9, title: "b", runs: [] },
      { type: "image" as const, mediaId: "m1", altText: "alt", url: "https://x/y.png", caption: " " },
    ] };
    const p = buildPayload(d, "published");
    expect(p).toMatchObject({ id: "my-id", displayOrder: 4, status: "published" });
    expect(p.body).toEqual([
      { type: "step", number: 1, title: "a", runs: [{ text: "x" }] },
      { type: "step", number: 2, title: "b", runs: [] },
      { type: "image", mediaId: "m1", altText: "alt" },
    ]);
  });
  it("validates ids, links and images", () => {
    const d = { ...emptyDraft(), id: "Bad Id", body: [{ type: "video" as const, url: "http://x" }, { type: "image" as const, mediaId: "m", altText: "" }] };
    const errs = validateDraft(d, true).join(" ");
    expect(errs).toContain("hyphens");
    expect(errs).toContain("https://");
    expect(errs).toContain("alt text");
  });
  it("surfaces backend validation messages", () => {
    expect(errorMessage({ data: { error: "body.0.url must use HTTPS" } })).toBe("body.0.url must use HTTPS");
  });
});

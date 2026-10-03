import { describe, expect, it } from "vitest";
import { mediaDiscoverySourceUrls } from "./media-discovery-sources";

const page = "https://marketing.example/authors/jane";
const search = (sources: unknown[], status = "completed") => ({
  type: "web_search_call", status, action: { type: "search", sources },
});

describe("provider-owned media source evidence", () => {
  it("accepts actual search sources even when structured answers have no inline citations", () => {
    expect(mediaDiscoverySourceUrls([
      search([{ type: "url", url: page }]),
      { type: "message", content: [{ type: "output_text", annotations: [] }] },
    ])).toEqual([page]);
  });

  it("keeps inline citations and de-duplicates references from both metadata paths", () => {
    expect(mediaDiscoverySourceUrls([
      search([{ type: "url", url: page }]),
      { type: "message", content: [{ annotations: [{ type: "url_citation", url: page }] }] },
    ])).toEqual([page]);
  });

  it("recognises completed page-open and find actions, not model-written links", () => {
    expect(mediaDiscoverySourceUrls([
      { type: "web_search_call", status: "completed", action: { type: "open_page", url: page } },
      { type: "web_search_call", status: "completed", action: { type: "find_in_page", url: page } },
      { type: "message", content: [{ text: JSON.stringify({ sourceUrl: "https://invented.example" }) }] },
    ])).toEqual([page]);
  });

  it("ignores failed tools, malformed records and unsupported URL/source types", () => {
    expect(mediaDiscoverySourceUrls([
      search([{ type: "url", url: page }], "failed"),
      search([{ type: "url", url: page }], "in_progress"),
      search([null, { type: "file", url: page }, { type: "url", url: "javascript:alert(1)" },
        { type: "url", url: "https://" }, { type: "url", url: "https://user:password@example.test" }]),
      { type: "web_search_call", status: "completed", action: { type: "unknown", url: page } },
      { type: "message", content: [{ annotations: [{ type: "unknown", url: page }] }] },
      null,
    ])).toEqual([]);
    expect(mediaDiscoverySourceUrls({ sources: [page] })).toEqual([]);
  });

  it("unwraps known proxy citations but does not trust arbitrary redirect parameters", () => {
    const wrapper = `https://please.untaint.us/?url=${encodeURIComponent(page)}`;
    const other = `https://redirect.example/?url=${encodeURIComponent(page)}`;
    expect(mediaDiscoverySourceUrls([search([{ type: "url", url: wrapper }, { type: "url", url: other }])]))
      .toEqual([wrapper, page, other]);
  });
});
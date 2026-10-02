import { beforeEach, describe, expect, it, vi } from "vitest";

const { responsesCreate, fetchMediaSourceEvidence, clientOptions } = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
  fetchMediaSourceEvidence: vi.fn(),
  clientOptions: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor(options: unknown) { clientOptions(options); }
    responses = { create: responsesCreate };
  },
}));

vi.mock("./safe-fetch", async () => {
  const actual = await vi.importActual<typeof import("./safe-fetch")>("./safe-fetch");
  return { ...actual, fetchMediaSourceEvidence };
});

import { collectJournalistCoverage } from "./journalist-coverage-evidence";
import { extractMediaSourceEvidence } from "./safe-fetch";

const NOW = new Date("2026-04-10T12:00:00.000Z");
const URL = "https://example.com/article";

function requestResponse(candidates: unknown[], citations: string[] = [URL]) {
  return {
    output_text: JSON.stringify({ candidates }),
    output: [{
      type: "message",
      content: [{ type: "output_text", annotations: citations.map((url) => ({ type: "url_citation", url })) }],
    }],
  };
}

function input() {
  return {
    contact: { name: "Jane Doe", outletName: "Example Daily" },
    brief: {
      topic: "energy transition",
      angle: "new grid technology",
      audience: "business leaders",
      regions: ["UK"],
      publicationTypes: ["trade"],
      whyNow: "new policy",
    },
    now: NOW,
  };
}

describe("collectJournalistCoverage", () => {
  beforeEach(() => {
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://ai.example.test";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
    responsesCreate.mockReset();
    clientOptions.mockReset();
    fetchMediaSourceEvidence.mockReset();
  });

  it("requires provider citations and verifies visible author, outlet and page date", async () => {
    responsesCreate.mockResolvedValue(requestResponse([
      { title: "Grid changes", url: URL, excerpt: "Search suggestion" },
      { title: "Uncited article", url: "https://example.com/uncited", excerpt: "Do not trust" },
    ]));
    const page = extractMediaSourceEvidence(`
      <html><head>
        <title>Grid changes</title>
        <meta property="og:title" content="Grid changes">
        <meta property="og:site_name" content="Example Daily">
        <script type="application/ld+json">{"@type":"NewsArticle","headline":"Grid changes","datePublished":"2026-04-03","author":{"@type":"Person","name":"Jane Doe"}}</script>
      </head><body><h1>Grid changes</h1><p class="byline">By Jane Doe</p><p>Example Daily explains grid changes for businesses.</p></body></html>
    `, URL);
    fetchMediaSourceEvidence.mockResolvedValue(page);

    const result = await collectJournalistCoverage(input());
    expect(clientOptions).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));

    expect(fetchMediaSourceEvidence).toHaveBeenCalledTimes(1);
    expect(result.evidence).toEqual([{
      title: "Grid changes",
      url: URL,
      publishedAt: "2026-04-03",
      checkedAt: NOW.toISOString(),
      excerpt: expect.stringContaining("Jane Doe"),
      attribution: "page_checked",
      authorMatched: true,
    }]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("discarded"),
    ]));
  });

  it("keeps failed author attribution as a clearly labelled suggestion", async () => {
    responsesCreate.mockResolvedValue(requestResponse([
      { title: "Grid changes", url: URL, excerpt: "Search snippet" },
    ]));
    fetchMediaSourceEvidence.mockResolvedValue(extractMediaSourceEvidence(`
      <html><head><title>Grid changes</title><meta property="og:site_name" content="Example Daily"></head>
      <body><h1>Grid changes</h1><p>Example Daily - a story about energy transition.</p></body></html>
    `, URL));

    const result = await collectJournalistCoverage(input());

    expect(result.evidence[0]).toMatchObject({
      title: "Grid changes",
      url: URL,
      publishedAt: null,
      attribution: "search_suggested",
      authorMatched: false,
    });
    expect(result.warnings.join(" ")).toContain("not verified");
  });

  it("does not accept a modified timestamp or a near-match author name", async () => {
    responsesCreate.mockResolvedValue(requestResponse([
      { title: "Grid changes", url: URL, excerpt: "Search snippet" },
    ]));
    fetchMediaSourceEvidence.mockResolvedValue(extractMediaSourceEvidence(`
      <html><head><title>Grid changes</title><meta property="og:site_name" content="Example Daily">
      <script type="application/ld+json">{"@type":"WebPage","author":{"name":"Jane Doe"},"dateModified":"2026-04-09"}</script>
      </head><body><h1>Grid changes</h1><p class="byline">By Jane Does</p>
      <time class="updated" datetime="2026-04-09">Updated 9 April 2026</time></body></html>
    `, URL));

    const result = await collectJournalistCoverage(input());

    expect(result.evidence[0]).toMatchObject({
      publishedAt: null,
      attribution: "search_suggested",
      authorMatched: false,
    });
  });

  it("does not turn an SSRF-safe fetch failure into a success", async () => {
    responsesCreate.mockResolvedValue(requestResponse([
      { title: "Internal article", url: "http://127.0.0.1/article", excerpt: "Search snippet" },
    ], ["http://127.0.0.1/article"]));
    fetchMediaSourceEvidence.mockRejectedValue(new Error("Private IP addresses are not allowed"));

    const result = await collectJournalistCoverage(input());

    expect(result.evidence[0]).toMatchObject({
      url: "http://127.0.0.1/article",
      publishedAt: null,
      attribution: "search_suggested",
      authorMatched: false,
    });
    expect(result.warnings.join(" ")).toContain("Private IP");
  });

  it("throws a sanitised provider failure instead of returning an empty success", async () => {
    responsesCreate.mockRejectedValue(new Error("upstream secret request detail"));

    await expect(collectJournalistCoverage(input())).rejects.toThrow("provider failed");
    await expect(collectJournalistCoverage(input())).rejects.not.toThrow("secret request detail");
  });

  it("settles a pre-call reservation with actual token and web-search usage", async () => {
    const order: string[] = [];
    responsesCreate.mockImplementation(async () => {
      order.push("provider");
      const response = requestResponse([{ title: "Grid changes", url: URL, excerpt: "Search snippet" }]);
      return {
        ...response,
        output: [...response.output, { type: "web_search_call" }],
        usage: { input_tokens: 100, output_tokens: 10 },
      };
    });
    const reserve = vi.fn(async () => {
      order.push("reserve");
      return 17;
    });
    const settle = vi.fn(async () => { order.push("settle"); });

    await collectJournalistCoverage({
      ...input(),
      usage: { reserve, settle },
    });

    expect(order).toEqual(["reserve", "provider", "settle"]);
    expect(settle).toHaveBeenCalledWith(17, {
      inputTokens: 100,
      outputTokens: 10,
      webSearchCalls: 1,
    });
  });

  it("leaves the pre-call reservation in place when the provider attempt fails", async () => {
    responsesCreate.mockRejectedValue(new Error("provider offline"));
    const reserve = vi.fn(async () => 23);
    const settle = vi.fn(async () => undefined);

    await expect(collectJournalistCoverage({
      ...input(),
      usage: { reserve, settle },
    })).rejects.toThrow("provider failed");

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(settle).not.toHaveBeenCalled();
  });

  it("surfaces search timeouts and aborts the provider request", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    responsesCreate.mockImplementation((_request: unknown, options: { signal?: AbortSignal }) => {
      providerSignal = options.signal;
      return new Promise(() => {});
    });
    try {
      const pending = collectJournalistCoverage(input());
      const rejection = expect(pending).rejects.toThrow("Journalist coverage search timed out");
      await vi.advanceTimersByTimeAsync(20_000);
      await rejection;
      expect(providerSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a source timeout explicit as a search suggestion warning", async () => {
    vi.useFakeTimers();
    responsesCreate.mockResolvedValue(requestResponse([
      { title: "Grid changes", url: URL, excerpt: "Search snippet" },
    ]));
    fetchMediaSourceEvidence.mockImplementation(() => new Promise(() => {}));
    try {
      const pending = collectJournalistCoverage(input());
      await vi.advanceTimersByTimeAsync(17_000);
      const result = await pending;
      expect(result.evidence[0]).toMatchObject({
        url: URL,
        attribution: "search_suggested",
        authorMatched: false,
      });
      expect(result.warnings.join(" ")).toContain(`Source check timed out for ${URL}`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not use the original candidate domain after a safe redirect", async () => {
    responsesCreate.mockResolvedValue(requestResponse([
      { title: "Grid changes", url: URL, excerpt: "Search snippet" },
    ]));
    fetchMediaSourceEvidence.mockResolvedValue({
      url: "https://redirected.news/article",
      title: "Grid changes",
      text: "By Jane Doe. Grid changes.",
      emails: [],
      roleCandidates: [],
      authorNames: ["Jane Doe"],
      publishedAt: "2026-04-03",
    });

    const result = await collectJournalistCoverage(input());

    expect(result.evidence[0]).toMatchObject({
      url: URL,
      attribution: "search_suggested",
      authorMatched: false,
      publishedAt: null,
    });
  });

  it("fails explicitly when the configured provider is missing", async () => {
    delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    await expect(collectJournalistCoverage(input())).rejects.toThrow(/not configured/i);
    expect(responsesCreate).not.toHaveBeenCalled();
  });
});
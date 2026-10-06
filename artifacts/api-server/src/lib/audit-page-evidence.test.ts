import { beforeEach, describe, expect, it, vi } from "vitest";
const { network } = vi.hoisted(() => ({ network: vi.fn() }));
vi.mock("dns/promises", () => ({
  resolve4: async () => ["93.184.216.34"], resolve6: async () => [],
}));
vi.mock("undici", () => ({
  buildConnector: () => () => {},
  Agent: class { close = async () => {}; },
  fetch: network,
}));
import { assertAuditPageUsable, collectJsonLdTypes } from "./audit-page-evidence";
import { fetchGeoAuditContext } from "./safe-fetch";

const homepage = `<html><head><title>Public consultancy</title>
<script type="application/ld+json">{"@graph":[{"@type":"Organization","contactPoint":{"@type":"ContactPoint"}},{"@type":["WebSite","CreativeWork"]}]}</script>
<script type="application/ld+json">{"@type":"WebPage"}</script></head>
<body><h1>Expert advice for communications teams</h1><footer>Expert credentials and contact information</footer></body></html>`;
const htmlResponse = (html: string) => new Response(html, { headers: { "content-type": "text/html" } });
beforeEach(() => network.mockReset());

describe("Website Audit evidence validity", () => {
  it.each([
    '<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2F"></head></html>',
    '<html><title>Just a moment...</title><body>Checking your browser</body></html>',
    '<html><body>Please verify you are human to continue.</body></html>',
    '<html><body><script>renderWebsite()</script></body></html>',
    "",
  ])("rejects empty and challenge HTML instead of treating it as a low-quality website", (html) => {
    expect(() => assertAuditPageUsable(html, "https://public.example")).toThrow("No website score");
  });
  it("does not reject a real page merely because it discusses CAPTCHA", () => {
    expect(() => assertAuditPageUsable("<body><h1>How CAPTCHA works on real websites</h1><p>A useful explanation for developers.</p></body>", "https://public.example")).not.toThrow();
  });
  it("rejects non-HTML responses and final challenge destinations", () => {
    expect(() => assertAuditPageUsable(homepage, "https://public.example", "application/json")).toThrow("HTML webpage");
    expect(() => assertAuditPageUsable(homepage, "https://public.example/.well-known/sgcaptcha/")).toThrow("No website score");
  });
  it("recurses through graphs, arrays and nested types, deduplicating types separately from block counts", () => {
    expect(collectJsonLdTypes(homepage)).toEqual({
      blockCount: 2, types: ["ContactPoint", "CreativeWork", "Organization", "WebPage", "WebSite"],
    });
  });
  it("retains malformed block counts without inventing schema types", () => {
    expect(collectJsonLdTypes('<script type="application/ld+json">{broken}</script>'))
      .toEqual({ blockCount: 1, types: [] });
  });
  it("stops before auxiliary fetches when the homepage is a challenge", async () => {
    network.mockResolvedValueOnce(htmlResponse('<meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/">'));
    await expect(fetchGeoAuditContext("https://public.example")).rejects.toThrow("No website score");
    expect(network).toHaveBeenCalledOnce();
  });
  it("follows the final origin, recognises index files, and retains footer trust evidence", async () => {
    network.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://www.public.example/" } }))
      .mockResolvedValueOnce(htmlResponse(homepage))
      .mockResolvedValueOnce(new Response("User-agent: *\nSitemap: https://www.public.example/sitemap.xml"))
      .mockResolvedValueOnce(new Response('<sitemapindex><sitemap><loc>https://www.public.example/pages.xml</loc></sitemap></sitemapindex>'));
    const result = await fetchGeoAuditContext("https://public.example");
    expect(result.url).toBe("https://www.public.example/");
    expect(network.mock.calls[2]![0]).toBe("https://www.public.example/robots.txt");
    expect(result.facts).toMatchObject({ jsonLdBlockCount: 2, sitemapIndexCount: 1, sitemapUrlCount: null });
    expect(result.text).toContain("Expert credentials and contact information");
    expect(result.text).toContain("not 1 website pages");
    expect(result.warnings).toEqual([]);
  });
  it("does not count HTML challenge responses as verified robots or sitemap files", async () => {
    network.mockResolvedValueOnce(htmlResponse(homepage))
      .mockResolvedValueOnce(htmlResponse('<html><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/"></html>'))
      .mockResolvedValueOnce(htmlResponse("<html><body>Verify you are human</body></html>"));
    const result = await fetchGeoAuditContext("https://public.example");
    expect(result.facts).toMatchObject({ hasRobotsTxt: false, sitemapUrlCount: null });
    expect(result.pagesFetched).toEqual(["https://public.example"]);
    expect(result.warnings).toHaveLength(2);
    expect(result.text).not.toContain("sgcaptcha");
  });
  it("counts actual urlset entries as page URLs", async () => {
    network.mockResolvedValueOnce(htmlResponse(homepage))
      .mockResolvedValueOnce(new Response("User-agent: *\nAllow: /"))
      .mockResolvedValueOnce(new Response('<urlset><url><loc>https://public.example/about</loc></url></urlset>'));
    const result = await fetchGeoAuditContext("https://public.example");
    expect(result.facts.sitemapUrlCount).toBe(1);
    expect(result.facts.sitemapIndexCount).toBeUndefined();
  });
  it("bounds auxiliary responses rather than reading an unlimited body", async () => {
    network.mockResolvedValueOnce(htmlResponse(homepage))
      .mockResolvedValueOnce(new Response("User-agent: *\n" + "x".repeat(400001)))
      .mockResolvedValueOnce(new Response("<urlset></urlset>"));
    const result = await fetchGeoAuditContext("https://public.example");
    expect(result.facts.hasRobotsTxt).toBe(false);
    expect(result.warnings?.[0]).toContain("could not be verified");
  });
});

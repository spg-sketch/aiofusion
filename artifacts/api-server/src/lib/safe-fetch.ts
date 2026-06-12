import * as cheerio from "cheerio";
import { URL } from "url";
import * as dns from "dns/promises";
import * as net from "net";
import { Agent, buildConnector, fetch as undiciFetch, type Response as UndiciResponse } from "undici";

const FETCH_TIMEOUT = 15000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:x.x.x.x) and IPv4-compatible IPv6 addresses can be
    // used to smuggle a private IPv4 target past IPv6 checks. Re-run the IPv4
    // private checks on the embedded address.
    const mapped = lower.match(/^(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped && net.isIPv4(mapped[1])) return isPrivateIP(mapped[1]);
    if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd") || lower === "::") return true;
  }
  return false;
}

async function validateUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".local") || parsed.hostname.endsWith(".internal")) {
    throw new Error("Internal hostnames are not allowed");
  }
  if (net.isIP(parsed.hostname)) {
    if (isPrivateIP(parsed.hostname)) throw new Error("Private IP addresses are not allowed");
    return parsed.hostname;
  }
  const addresses = await dns.resolve4(parsed.hostname).catch(() => [] as string[]);
  const addresses6 = await dns.resolve6(parsed.hostname).catch(() => [] as string[]);
  const allAddresses = [...addresses, ...addresses6];
  if (allAddresses.length === 0) throw new Error("Could not resolve hostname");
  for (const addr of allAddresses) {
    if (isPrivateIP(addr)) throw new Error("URL resolves to a private IP address");
  }
  return allAddresses[0];
}

function createPinnedAgent(pinnedIp: string, servername: string): Agent {
  const connector = buildConnector({ rejectUnauthorized: true });
  return new Agent({
    connect(options: Parameters<typeof connector>[0], callback: Parameters<typeof connector>[1]) {
      connector({ ...options, hostname: pinnedIp, servername: options.servername ?? servername }, callback);
    },
  });
}

async function fetchWithSsrfSafeRedirects(
  url: string,
  reqHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<{ res: UndiciResponse; agent: Agent }> {
  let currentUrl = url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const pinnedIp = await validateUrl(currentUrl);
      const parsed = new URL(currentUrl);
      const agent = createPinnedAgent(pinnedIp, parsed.hostname);

      let res: UndiciResponse;
      try {
        res = await undiciFetch(currentUrl, {
          signal: controller.signal,
          headers: reqHeaders,
          redirect: "manual",
          dispatcher: agent,
        });
      } catch (err) {
        // Close the per-hop agent if the request itself failed, otherwise the
        // socket/agent leaks on timeouts and network errors.
        await agent.close().catch(() => {});
        throw err;
      }

      const isRedirect = res.status >= 300 && res.status < 400;
      if (!isRedirect) {
        return { res, agent };
      }

      await res.body?.cancel().catch(() => {});
      await agent.close().catch(() => {});

      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect with no Location header");
      currentUrl = new URL(location, currentUrl).href;
      if (hop === MAX_REDIRECTS) throw new Error("Too many redirects");
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new Error("Unexpected end of redirect loop");
}

async function fetchHtml(url: string): Promise<string> {
  const { res, agent } = await fetchWithSsrfSafeRedirects(
    url,
    { "User-Agent": "AIOFusion-Assist/1.0 (compatible; bot)", Accept: "text/html,application/xhtml+xml" },
    FETCH_TIMEOUT,
  );
  try {
    if (!res.ok) throw new Error(`Site returned HTTP ${res.status}`);
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) throw new Error("Response too large");
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_SIZE) throw new Error("Response too large");
    return new TextDecoder().decode(buffer);
  } finally {
    await agent.close().catch(() => {});
  }
}

function htmlToText(html: string): { title: string; description: string; text: string } {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, form").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const description = ($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "").trim();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { title, description, text };
}

export interface SiteContent {
  url: string;
  title: string;
  description: string;
  text: string;
}

export async function fetchSiteContent(url: string, maxChars = 8000): Promise<SiteContent> {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const html = await fetchHtml(normalized);
  const { title, description, text } = htmlToText(html);
  return { url: normalized, title, description, text: text.slice(0, maxChars) };
}

async function fetchTextResource(url: string, timeoutMs = 8000, maxChars = 100000): Promise<string | null> {
  try {
    const { res, agent } = await fetchWithSsrfSafeRedirects(
      url,
      { "User-Agent": "AIOFusion-Audit/1.0 (compatible; bot)" },
      timeoutMs,
    );
    try {
      if (!res.ok) return null;
      const text = await res.text();
      return text.slice(0, maxChars);
    } finally {
      await agent.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

export interface GeoAuditFacts {
  metaTitle: string;
  hasMetaDescription: boolean;
  hasCanonical: boolean;
  openGraphTagCount: number;
  jsonLdBlockCount: number;
  jsonLdTypes: string[];
  microdataCount: number;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  imagesTotal: number;
  imagesWithAlt: number;
  imagesWithoutAlt: number;
  listCount: number;
  tableCount: number;
  hasRobotsTxt: boolean;
  sitemapUrlCount: number | null;
}

export interface GeoAuditContext {
  url: string;
  text: string;
  pagesFetched: string[];
  facts: GeoAuditFacts;
}

// Fetches a site's homepage plus its robots.txt and sitemap, then assembles a
// single text block of real, observed signals for the GEO diagnostic to analyse.
export async function fetchGeoAuditContext(rawUrl: string, maxChars = 45000): Promise<GeoAuditContext> {
  const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const html = await fetchHtml(normalized);
  const origin = new URL(normalized).origin;

  const $ = cheerio.load(html);

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      const arr = Array.isArray(data) ? data : [data];
      for (const d of arr) {
        if (d && d["@type"]) {
          jsonLdTypes.push(Array.isArray(d["@type"]) ? d["@type"].join("/") : String(d["@type"]));
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  });

  const jsonLdBlockCount = $('script[type="application/ld+json"]').length;
  const microdata = $("[itemscope]").length;
  const canonical = $('link[rel="canonical"]').attr("href") || "";
  const ogTags = ["og:title", "og:description", "og:image", "og:type"].filter(
    (p) => $(`meta[property="${p}"]`).attr("content"),
  );
  const metaDesc = ($('meta[name="description"]').attr("content") || "").trim();
  const metaTitle = $("title").first().text().trim();
  const h1 = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2 = $("h2").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h3 = $("h3").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const imgTotal = $("img").length;
  const imgWithAlt = $("img[alt]").filter((_, el) => ($(el).attr("alt") || "").trim() !== "").length;
  const lists = $("ul, ol").length;
  const tables = $("table").length;

  const { text: bodyText } = htmlToText(html);

  const pagesFetched = [normalized];

  const robots = await fetchTextResource(`${origin}/robots.txt`);
  if (robots) pagesFetched.push(`${origin}/robots.txt`);

  let sitemapUrl = `${origin}/sitemap.xml`;
  if (robots) {
    const m = robots.match(/^\s*sitemap:\s*(\S+)/im);
    if (m) {
      try {
        sitemapUrl = new URL(m[1].trim(), origin).href;
      } catch {
        // keep default sitemap URL
      }
    }
  }
  let sitemapSummary = "Not found or not accessible.";
  let sitemapUrlCount: number | null = null;
  const sitemapXml = await fetchTextResource(sitemapUrl, 8000, 300000);
  if (sitemapXml) {
    pagesFetched.push(sitemapUrl);
    const locs = [...sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((mm) => mm[1]);
    sitemapUrlCount = locs.length;
    sitemapSummary = `${locs.length} URL(s) listed. Sample: ${locs.slice(0, 15).join(", ") || "none"}`;
  }

  const parts: string[] = [
    `HOMEPAGE: ${normalized}`,
    `Page title: ${metaTitle || "(none)"}`,
    `Meta description: ${metaDesc || "(none)"}`,
    `Canonical URL: ${canonical || "(none)"}`,
    `Open Graph tags present: ${ogTags.length ? ogTags.join(", ") : "none"}`,
    `JSON-LD structured data: ${jsonLdTypes.length ? `${jsonLdTypes.length} block(s), types: ${jsonLdTypes.join(", ")}` : "none detected"}`,
    `Microdata (itemscope) elements: ${microdata}`,
    `Headings: ${h1.length} H1, ${h2.length} H2, ${h3.length} H3`,
  ];
  if (h1.length) parts.push(`H1: ${h1.slice(0, 3).join(" | ")}`);
  if (h2.length) parts.push(`H2 sample: ${h2.slice(0, 8).join(" | ")}`);
  parts.push(`Images: ${imgTotal} total, ${imgWithAlt} with non-empty alt text`);
  parts.push(`Structured lists: ${lists}, data tables: ${tables}`);
  parts.push("");
  parts.push(`ROBOTS.TXT:\n${robots ? robots.slice(0, 4000) : "Not found or not accessible."}`);
  parts.push("");
  parts.push(`SITEMAP (${sitemapUrl}):\n${sitemapSummary}`);
  parts.push("");
  parts.push(`HOMEPAGE VISIBLE TEXT:\n${bodyText}`);

  let assembled = parts.join("\n");
  if (assembled.length > maxChars) assembled = assembled.slice(0, maxChars);

  const facts: GeoAuditFacts = {
    metaTitle,
    hasMetaDescription: metaDesc.length > 0,
    hasCanonical: canonical.length > 0,
    openGraphTagCount: ogTags.length,
    jsonLdBlockCount,
    jsonLdTypes,
    microdataCount: microdata,
    h1Count: h1.length,
    h2Count: h2.length,
    h3Count: h3.length,
    imagesTotal: imgTotal,
    imagesWithAlt: imgWithAlt,
    imagesWithoutAlt: Math.max(0, imgTotal - imgWithAlt),
    listCount: lists,
    tableCount: tables,
    hasRobotsTxt: Boolean(robots),
    sitemapUrlCount,
  };

  return { url: normalized, text: assembled, pagesFetched, facts };
}

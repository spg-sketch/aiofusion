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

import { Router, type Request, type Response } from "express";
import * as cheerio from "cheerio";
import { logger } from "../lib/logger";
import { URL } from "url";
import * as dns from "dns/promises";
import * as net from "net";
import { Agent, buildConnector } from "undici";
import { seoAuditLimiter } from "../middleware/rate-limit";
import { requireAuth } from "../middleware/require-auth";
import { seoAuditConcurrencyGuard } from "../middleware/concurrency-guard";

const seoAuditRouter = Router();

const FETCH_TIMEOUT = 15000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

interface SeoFinding {
  label: string;
  value: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

interface LinkInfo {
  href: string;
  text: string;
  type: "internal" | "external";
}

interface SeoAuditResult {
  url: string;
  fetchedAt: string;
  scores: {
    overall: number;
    meta: number;
    headings: number;
    schema: number;
    links: number;
    images: number;
    aiReadiness: number;
    performance: number;
  };
  meta: SeoFinding[];
  headings: SeoFinding[];
  schema: SeoFinding[];
  links: {
    findings: SeoFinding[];
    internal: LinkInfo[];
    external: LinkInfo[];
    inboundIndicators: SeoFinding[];
  };
  images: SeoFinding[];
  aiReadiness: SeoFinding[];
  performance: SeoFinding[];
  recommendations: { priority: "Critical" | "High" | "Medium" | "Low"; text: string; category: string }[];
}

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

const MAX_REDIRECTS = 5;

async function fetchWithSsrfSafeRedirects(
  url: string,
  reqHeaders: Record<string, string>,
  timeoutMs: number,
): Promise<{ res: Awaited<ReturnType<typeof fetch>>; agent: Agent }> {
  let currentUrl = url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const pinnedIp = await validateUrl(currentUrl);
      const parsed = new URL(currentUrl);
      const agent = createPinnedAgent(pinnedIp, parsed.hostname);

      const res = await fetch(currentUrl, {
        signal: controller.signal,
        headers: reqHeaders,
        redirect: "manual",
        // @ts-expect-error - dispatcher is the undici-specific option accepted by Node's built-in fetch
        dispatcher: agent,
      });

      const isRedirect = res.status >= 300 && res.status < 400;
      if (!isRedirect) {
        // Return the response and its agent so the caller can close the agent
        // after the response body has been fully consumed.
        return { res, agent };
      }

      // For redirect hops we do not read the body, so cancel it explicitly
      // and close the per-hop agent before moving to the next hop.
      await res.body?.cancel().catch(() => {});
      await agent.close().catch(() => {});

      const location = res.headers.get("location");
      if (!location) {
        throw new Error("Redirect with no Location header");
      }

      currentUrl = new URL(location, currentUrl).href;

      if (hop === MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  throw new Error("Unexpected end of redirect loop");
}

async function fetchPage(url: string): Promise<{ html: string; statusCode: number; headers: Record<string, string>; responseTime: number }> {
  const start = Date.now();

  const { res, agent } = await fetchWithSsrfSafeRedirects(
    url,
    {
      "User-Agent": "AIOFusion-SEOAudit/1.0 (compatible; bot)",
      Accept: "text/html,application/xhtml+xml",
    },
    FETCH_TIMEOUT,
  );

  try {
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      throw new Error("Response too large");
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_SIZE) {
      throw new Error("Response too large");
    }
    const html = new TextDecoder().decode(buffer);
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { html, statusCode: res.status, headers, responseTime: Date.now() - start };
  } finally {
    await agent.close().catch(() => {});
  }
}

async function fetchPageSpeed(url: string): Promise<any | null> {
  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchRobotsTxt(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
    const { res, agent } = await fetchWithSsrfSafeRedirects(robotsUrl, { "User-Agent": "AIOFusion-SEOAudit/1.0" }, 8000);
    try {
      if (!res.ok) return null;
      const text = await res.text();
      return text.substring(0, 100000);
    } finally {
      await agent.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

function analyseMeta($: cheerio.CheerioAPI, url: string): { findings: SeoFinding[]; score: number } {
  const findings: SeoFinding[] = [];
  let score = 0;

  const title = $("title").first().text().trim();
  if (title) {
    const len = title.length;
    const status = len >= 30 && len <= 60 ? "pass" : len >= 20 && len <= 70 ? "warn" : "fail";
    findings.push({ label: "Title tag", value: title, status, detail: `${len} characters (ideal: 30-60)` });
    score += status === "pass" ? 20 : status === "warn" ? 12 : 5;
  } else {
    findings.push({ label: "Title tag", value: "Missing", status: "fail", detail: "No title tag found" });
  }

  const metaDesc = $('meta[name="description"]').attr("content")?.trim() || "";
  if (metaDesc) {
    const len = metaDesc.length;
    const status = len >= 120 && len <= 160 ? "pass" : len >= 80 && len <= 200 ? "warn" : "fail";
    findings.push({ label: "Meta description", value: metaDesc.substring(0, 100) + (metaDesc.length > 100 ? "..." : ""), status, detail: `${len} characters (ideal: 120-160)` });
    score += status === "pass" ? 20 : status === "warn" ? 12 : 5;
  } else {
    findings.push({ label: "Meta description", value: "Missing", status: "fail", detail: "No meta description found" });
  }

  const canonical = $('link[rel="canonical"]').attr("href") || "";
  findings.push({ label: "Canonical URL", value: canonical || "Not set", status: canonical ? "pass" : "warn", detail: canonical ? "Canonical tag present" : "No canonical URL specified" });
  score += canonical ? 15 : 0;

  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const ogDesc = $('meta[property="og:description"]').attr("content") || "";
  const ogImage = $('meta[property="og:image"]').attr("content") || "";
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  findings.push({ label: "Open Graph tags", value: `${ogCount}/3 present`, status: ogCount === 3 ? "pass" : ogCount >= 1 ? "warn" : "fail", detail: `Title: ${ogTitle ? "Yes" : "No"}, Description: ${ogDesc ? "Yes" : "No"}, Image: ${ogImage ? "Yes" : "No"}` });
  score += ogCount >= 3 ? 15 : ogCount >= 1 ? 8 : 0;

  const viewport = $('meta[name="viewport"]').attr("content") || "";
  findings.push({ label: "Viewport meta", value: viewport ? "Present" : "Missing", status: viewport ? "pass" : "fail", detail: viewport || "No viewport meta tag — may not be mobile-friendly" });
  score += viewport ? 10 : 0;

  const robotsMeta = $('meta[name="robots"]').attr("content") || "";
  if (robotsMeta) {
    const isBlocking = robotsMeta.includes("noindex") || robotsMeta.includes("nofollow");
    findings.push({ label: "Robots meta", value: robotsMeta, status: isBlocking ? "fail" : "pass", detail: isBlocking ? "Page may be blocked from indexing" : "Page is indexable" });
    score += isBlocking ? 0 : 10;
  } else {
    findings.push({ label: "Robots meta", value: "Not set (default: index, follow)", status: "pass" });
    score += 10;
  }

  const lang = $("html").attr("lang") || "";
  findings.push({ label: "Language attribute", value: lang || "Not set", status: lang ? "pass" : "warn", detail: lang ? `Document language: ${lang}` : "No lang attribute on <html> tag" });
  score += lang ? 10 : 0;

  return { findings, score };
}

function analyseHeadings($: cheerio.CheerioAPI): { findings: SeoFinding[]; score: number } {
  const findings: SeoFinding[] = [];
  let score = 0;

  const h1s = $("h1").map((_, el) => $(el).text().trim()).get();
  if (h1s.length === 1) {
    findings.push({ label: "H1 tag", value: h1s[0], status: "pass", detail: "Single H1 tag found — correct" });
    score += 30;
  } else if (h1s.length === 0) {
    findings.push({ label: "H1 tag", value: "Missing", status: "fail", detail: "No H1 tag found" });
  } else {
    findings.push({ label: "H1 tag", value: `${h1s.length} found`, status: "warn", detail: `Multiple H1 tags: ${h1s.slice(0, 3).join(", ")}` });
    score += 15;
  }

  const h2s = $("h2").map((_, el) => $(el).text().trim()).get();
  findings.push({ label: "H2 tags", value: `${h2s.length} found`, status: h2s.length >= 2 ? "pass" : h2s.length >= 1 ? "warn" : "fail", detail: h2s.length > 0 ? h2s.slice(0, 5).join(" | ") : "No H2 tags found — poor content structure" });
  score += h2s.length >= 2 ? 25 : h2s.length >= 1 ? 12 : 0;

  const h3s = $("h3").map((_, el) => $(el).text().trim()).get();
  findings.push({ label: "H3 tags", value: `${h3s.length} found`, status: h3s.length >= 1 ? "pass" : "warn", detail: h3s.length > 0 ? h3s.slice(0, 5).join(" | ") : "No H3 tags — consider adding sub-sections" });
  score += h3s.length >= 1 ? 20 : 0;

  const headingOrder: number[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = parseInt(el.tagName?.replace("h", "") || "0");
    if (level) headingOrder.push(level);
  });
  let hierarchyCorrect = true;
  for (let i = 1; i < headingOrder.length; i++) {
    if (headingOrder[i] > headingOrder[i - 1] + 1) { hierarchyCorrect = false; break; }
  }
  findings.push({ label: "Heading hierarchy", value: hierarchyCorrect ? "Correct" : "Issues found", status: hierarchyCorrect ? "pass" : "warn", detail: hierarchyCorrect ? "Headings follow a logical order" : "Heading levels are skipped (e.g. H1 → H3)" });
  score += hierarchyCorrect ? 25 : 10;

  return { findings, score };
}

function analyseSchema($: cheerio.CheerioAPI): { findings: SeoFinding[]; score: number } {
  const findings: SeoFinding[] = [];
  let score = 0;

  const jsonLdScripts = $('script[type="application/ld+json"]');
  const schemas: any[] = [];
  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      if (Array.isArray(data)) schemas.push(...data);
      else schemas.push(data);
    } catch {}
  });

  const schemaTypes = schemas.map((s) => s["@type"]).filter(Boolean);

  if (schemas.length > 0) {
    findings.push({ label: "JSON-LD structured data", value: `${schemas.length} block(s) found`, status: "pass", detail: `Types: ${schemaTypes.join(", ") || "Unknown"}` });
    score += 25;
  } else {
    findings.push({ label: "JSON-LD structured data", value: "Not found", status: "fail", detail: "No JSON-LD schema markup detected" });
  }

  const hasOrg = schemaTypes.some((t) => t === "Organization" || t === "LocalBusiness");
  findings.push({ label: "Organization schema", value: hasOrg ? "Present" : "Not found", status: hasOrg ? "pass" : "fail", detail: hasOrg ? "Organization or LocalBusiness schema found" : "Add Organization schema for entity recognition" });
  score += hasOrg ? 20 : 0;

  const hasFaq = schemaTypes.some((t) => t === "FAQPage");
  findings.push({ label: "FAQ schema", value: hasFaq ? "Present" : "Not found", status: hasFaq ? "pass" : "warn", detail: hasFaq ? "FAQPage schema found — good for AI Overviews" : "Consider adding FAQ schema for answer engine visibility" });
  score += hasFaq ? 20 : 0;

  const hasArticle = schemaTypes.some((t) => ["Article", "NewsArticle", "BlogPosting"].includes(t));
  findings.push({ label: "Article schema", value: hasArticle ? "Present" : "Not found", status: hasArticle ? "pass" : "warn", detail: hasArticle ? "Article schema found" : "Article schema helps AI understand content type and authorship" });
  score += hasArticle ? 15 : 0;

  const hasBreadcrumb = schemaTypes.some((t) => t === "BreadcrumbList");
  findings.push({ label: "Breadcrumb schema", value: hasBreadcrumb ? "Present" : "Not found", status: hasBreadcrumb ? "pass" : "warn" });
  score += hasBreadcrumb ? 10 : 0;

  const microdata = $("[itemscope]").length;
  if (microdata > 0) {
    findings.push({ label: "Microdata", value: `${microdata} element(s)`, status: "pass", detail: "HTML microdata attributes found" });
    score += 10;
  }

  return { findings, score };
}

function analyseLinks($: cheerio.CheerioAPI, baseUrl: string): { findings: SeoFinding[]; internal: LinkInfo[]; external: LinkInfo[]; inboundIndicators: SeoFinding[]; score: number } {
  const parsed = new URL(baseUrl);
  const internal: LinkInfo[] = [];
  const external: LinkInfo[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim().substring(0, 80);
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

    try {
      const linkUrl = new URL(href, baseUrl);
      if (linkUrl.hostname === parsed.hostname) {
        internal.push({ href: linkUrl.pathname, text, type: "internal" });
      } else {
        external.push({ href: linkUrl.href, text, type: "external" });
      }
    } catch {}
  });

  const findings: SeoFinding[] = [];
  let score = 0;

  findings.push({ label: "Internal links", value: `${internal.length} found`, status: internal.length >= 5 ? "pass" : internal.length >= 2 ? "warn" : "fail", detail: `Links to ${new Set(internal.map((l) => l.href)).size} unique internal pages` });
  score += internal.length >= 5 ? 30 : internal.length >= 2 ? 15 : 0;

  findings.push({ label: "External links", value: `${external.length} found`, status: external.length >= 1 ? "pass" : "warn", detail: external.length > 0 ? `Links to ${new Set(external.map((l) => new URL(l.href).hostname)).size} external domains` : "No outbound links — citing external sources improves trust signals" });
  score += external.length >= 1 ? 20 : 0;

  const nofollow = $("a[rel*='nofollow']").length;
  if (nofollow > 0) {
    findings.push({ label: "Nofollow links", value: `${nofollow} found`, status: "warn", detail: "Some links have rel='nofollow' — check if this is intentional" });
  }

  const brokenAnchors = $("a[href='#'], a[href='']").length;
  if (brokenAnchors > 0) {
    findings.push({ label: "Empty/placeholder links", value: `${brokenAnchors} found`, status: "warn", detail: "Links with href='#' or empty href — fix or remove" });
    score -= 5;
  }

  const uniqueExternalDomains = [...new Set(external.map((l) => { try { return new URL(l.href).hostname; } catch { return ""; } }).filter(Boolean))];

  const inboundIndicators: SeoFinding[] = [];

  const hasRelMe = $("a[rel*='me']").length > 0;
  if (hasRelMe) {
    inboundIndicators.push({ label: "rel='me' links", value: "Found", status: "pass", detail: "Social profile links with rel='me' help establish entity identity" });
  }

  const authorLinks = $("a[rel*='author']").length;
  if (authorLinks > 0) {
    inboundIndicators.push({ label: "Author attribution links", value: `${authorLinks} found`, status: "pass", detail: "Author links help establish content authority" });
  }

  const citationLinks = external.filter((l) => /wikipedia|crunchbase|linkedin|wikidata|trustpilot|g2\.com|capterra/i.test(l.href));
  if (citationLinks.length > 0) {
    inboundIndicators.push({ label: "Authority source links", value: `${citationLinks.length} found`, status: "pass", detail: `Links to: ${citationLinks.map((l) => { try { return new URL(l.href).hostname; } catch { return ""; } }).filter(Boolean).join(", ")}` });
    score += 15;
  } else {
    inboundIndicators.push({ label: "Authority source links", value: "None found", status: "warn", detail: "No links to Wikipedia, Crunchbase, LinkedIn, Wikidata, or review platforms. These strengthen entity recognition." });
  }

  inboundIndicators.push({ label: "External domains linked", value: `${uniqueExternalDomains.length}`, status: uniqueExternalDomains.length >= 3 ? "pass" : "warn", detail: uniqueExternalDomains.length > 0 ? uniqueExternalDomains.slice(0, 10).join(", ") : "Page links to no external domains" });

  const socialLinks = external.filter((l) => /twitter\.com|x\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com/i.test(l.href));
  inboundIndicators.push({ label: "Social profile links", value: `${socialLinks.length} found`, status: socialLinks.length >= 2 ? "pass" : socialLinks.length >= 1 ? "warn" : "fail", detail: socialLinks.length > 0 ? "Social profiles linked — supports entity verification" : "No social profile links found — add these to strengthen entity signals" });
  score += socialLinks.length >= 2 ? 15 : socialLinks.length >= 1 ? 8 : 0;

  score += 20;

  return { findings, internal: internal.slice(0, 20), external: external.slice(0, 20), inboundIndicators, score: Math.max(0, Math.min(100, score)) };
}

function analyseImages($: cheerio.CheerioAPI): { findings: SeoFinding[]; score: number } {
  const findings: SeoFinding[] = [];
  let score = 0;

  const imgs = $("img");
  const total = imgs.length;
  let withAlt = 0;
  let withoutAlt = 0;
  let emptyAlt = 0;

  imgs.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined) withoutAlt++;
    else if (alt.trim() === "") emptyAlt++;
    else withAlt++;
  });

  findings.push({ label: "Total images", value: `${total}`, status: total > 0 ? "pass" : "warn" });

  if (total > 0) {
    const altPercent = Math.round((withAlt / total) * 100);
    findings.push({ label: "Images with alt text", value: `${withAlt}/${total} (${altPercent}%)`, status: altPercent >= 90 ? "pass" : altPercent >= 50 ? "warn" : "fail", detail: `${withoutAlt} missing alt attribute, ${emptyAlt} empty alt text` });
    score += altPercent >= 90 ? 50 : altPercent >= 50 ? 30 : 10;
  }

  const lazyCnt = $("img[loading='lazy']").length;
  if (total > 0) {
    findings.push({ label: "Lazy loading", value: `${lazyCnt}/${total} images`, status: lazyCnt > 0 ? "pass" : "warn", detail: lazyCnt > 0 ? "Some images use lazy loading" : "No images use loading='lazy' — consider adding for performance" });
    score += lazyCnt > 0 ? 25 : 0;
  }

  const svgs = $("svg").length;
  if (svgs > 0) {
    findings.push({ label: "SVG elements", value: `${svgs} found`, status: "pass", detail: "Inline SVGs are lightweight and scalable" });
    score += 25;
  }

  return { findings, score: Math.min(100, score) };
}

function analyseAiReadiness($: cheerio.CheerioAPI, robotsTxt: string | null): { findings: SeoFinding[]; score: number } {
  const findings: SeoFinding[] = [];
  let score = 0;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).length;
  findings.push({ label: "Content length", value: `${wordCount} words`, status: wordCount >= 300 ? "pass" : wordCount >= 100 ? "warn" : "fail", detail: wordCount >= 300 ? "Sufficient content for AI analysis" : "Thin content — AI models prefer substantive pages" });
  score += wordCount >= 300 ? 15 : wordCount >= 100 ? 8 : 0;

  const hasFaq = $("h2, h3").filter((_, el) => /faq|frequently|questions/i.test($(el).text())).length > 0;
  findings.push({ label: "FAQ content", value: hasFaq ? "Found" : "Not found", status: hasFaq ? "pass" : "warn", detail: hasFaq ? "FAQ section detected — good for answer engine visibility" : "Consider adding a FAQ section for better AI Overviews coverage" });
  score += hasFaq ? 15 : 0;

  const quotableStatements = $("blockquote, [class*='quote'], [class*='callout'], strong, b").length;
  findings.push({ label: "Quotable statements", value: `${quotableStatements} potential elements`, status: quotableStatements >= 3 ? "pass" : quotableStatements >= 1 ? "warn" : "fail", detail: "Blockquotes, callouts, and bold text help AI identify key claims" });
  score += quotableStatements >= 3 ? 10 : quotableStatements >= 1 ? 5 : 0;

  const lists = $("ul, ol").length;
  findings.push({ label: "Structured lists", value: `${lists} found`, status: lists >= 2 ? "pass" : lists >= 1 ? "warn" : "fail", detail: "Lists help AI extract structured information" });
  score += lists >= 2 ? 10 : lists >= 1 ? 5 : 0;

  const tables = $("table").length;
  if (tables > 0) {
    findings.push({ label: "Data tables", value: `${tables} found`, status: "pass", detail: "Tables provide structured data AI can extract" });
    score += 10;
  }

  if (robotsTxt) {
    const crawlers = [
      { name: "GPTBot (OpenAI)", pattern: /user-agent:\s*gptbot/i },
      { name: "ClaudeBot (Anthropic)", pattern: /user-agent:\s*claudebot/i },
      { name: "Google-Extended", pattern: /user-agent:\s*google-extended/i },
      { name: "PerplexityBot", pattern: /user-agent:\s*perplexitybot/i },
      { name: "CCBot", pattern: /user-agent:\s*ccbot/i },
    ];

    const robotsSections = robotsTxt.split(/(?=user-agent:)/i);
    for (const crawler of crawlers) {
      const section = robotsSections.find((s) => crawler.pattern.test(s));
      if (section) {
        const lines = section.split("\n").slice(1);
        const isBlocked = lines.some((line) => /^\s*disallow:\s*\/\s*$/i.test(line.trim()));
        findings.push({ label: crawler.name, value: isBlocked ? "Blocked" : "Allowed", status: isBlocked ? "fail" : "pass", detail: isBlocked ? `${crawler.name} is blocked in robots.txt` : `${crawler.name} can access the site` });
        score += isBlocked ? -5 : 8;
      }
    }

    const anyMentioned = crawlers.some((c) => c.pattern.test(robotsTxt));
    if (!anyMentioned) {
      findings.push({ label: "AI crawler directives", value: "None specified", status: "warn", detail: "No AI-specific crawler rules in robots.txt — all AI crawlers can access by default" });
      score += 5;
    }
  } else {
    findings.push({ label: "robots.txt", value: "Not found or inaccessible", status: "warn", detail: "Could not fetch robots.txt — AI crawlers will use default access" });
    score += 10;
  }

  return { findings, score: Math.max(0, Math.min(100, score)) };
}

function generateRecommendations(result: Omit<SeoAuditResult, "recommendations">): SeoAuditResult["recommendations"] {
  const recs: SeoAuditResult["recommendations"] = [];

  const allFindings = [...result.meta, ...result.headings, ...result.schema, ...result.links.findings, ...result.links.inboundIndicators, ...result.images, ...result.aiReadiness];

  for (const f of allFindings) {
    if (f.status === "fail") {
      if (f.label === "Title tag") recs.push({ priority: "Critical", text: "Add or fix the page title tag — this is the most basic SEO signal and affects all search visibility.", category: "Meta" });
      if (f.label === "Meta description") recs.push({ priority: "High", text: "Add a meta description (120-160 characters) that clearly describes what this page offers.", category: "Meta" });
      if (f.label === "H1 tag") recs.push({ priority: "Critical", text: "Add a single, clear H1 tag that describes the page's primary topic.", category: "Structure" });
      if (f.label === "JSON-LD structured data") recs.push({ priority: "High", text: "Add JSON-LD structured data (at minimum, Organization schema) to help search engines and AI understand your content.", category: "Schema" });
      if (f.label === "Organization schema") recs.push({ priority: "High", text: "Add Organization schema with your business name, logo, contact details, and social profiles.", category: "Schema" });
      if (f.label.includes("Images with alt")) recs.push({ priority: "Medium", text: "Add descriptive alt text to all images — this improves accessibility and gives AI more context.", category: "Content" });
      if (f.label === "Social profile links") recs.push({ priority: "Medium", text: "Add links to your social media profiles to strengthen entity verification signals.", category: "Links" });
    }
    if (f.status === "warn") {
      if (f.label === "FAQ schema") recs.push({ priority: "Medium", text: "Add FAQ schema markup to help your answers appear in AI Overviews and featured snippets.", category: "Schema" });
      if (f.label === "FAQ content") recs.push({ priority: "Medium", text: "Add a FAQ section with common questions and direct answers — this significantly improves answer engine visibility.", category: "Content" });
      if (f.label === "Authority source links") recs.push({ priority: "Medium", text: "Link to authority sources (Wikipedia, Crunchbase, LinkedIn) to strengthen entity recognition.", category: "Links" });
      if (f.label === "Language attribute") recs.push({ priority: "Low", text: "Add a lang attribute to the <html> tag (e.g. lang='en') for better content classification.", category: "Technical" });
    }
  }

  if (result.scores.links < 50) {
    recs.push({ priority: "High", text: "Improve internal linking — link between related pages to help search engines understand your site structure.", category: "Links" });
  }

  if (result.scores.aiReadiness < 50) {
    recs.push({ priority: "High", text: "Make content more AI-readable: add structured lists, clear headings, and quotable statements that AI can easily extract and cite.", category: "Content" });
  }

  const seen = new Set<string>();
  return recs.filter((r) => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  }).sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return order[a.priority] - order[b.priority];
  });
}

seoAuditRouter.post("/seo-audit", seoAuditLimiter, requireAuth, seoAuditConcurrencyGuard, async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "URL is required" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const fullUrl = parsedUrl.href;
  logger.info({ url: fullUrl }, "Starting SEO audit");

  try {
    const [pageData, robotsTxt, pageSpeed] = await Promise.all([
      fetchPage(fullUrl),
      fetchRobotsTxt(fullUrl),
      fetchPageSpeed(fullUrl),
    ]);

    const $ = cheerio.load(pageData.html);

    const meta = analyseMeta($, fullUrl);
    const headings = analyseHeadings($);
    const schema = analyseSchema($);
    const links = analyseLinks($, fullUrl);
    const images = analyseImages($);
    const aiReadiness = analyseAiReadiness($, robotsTxt);

    const performanceFindings: SeoFinding[] = [];
    let perfScore = 50;

    performanceFindings.push({ label: "Server response time", value: `${pageData.responseTime}ms`, status: pageData.responseTime < 1000 ? "pass" : pageData.responseTime < 3000 ? "warn" : "fail", detail: `Page took ${pageData.responseTime}ms to respond` });

    performanceFindings.push({ label: "HTTP status", value: `${pageData.statusCode}`, status: pageData.statusCode === 200 ? "pass" : "fail" });

    if (pageSpeed?.lighthouseResult) {
      const lh = pageSpeed.lighthouseResult;
      const perfCategory = lh.categories?.performance;
      const accessCategory = lh.categories?.accessibility;

      if (perfCategory?.score != null) {
        const pScore = Math.round(perfCategory.score * 100);
        performanceFindings.push({ label: "PageSpeed score (mobile)", value: `${pScore}/100`, status: pScore >= 90 ? "pass" : pScore >= 50 ? "warn" : "fail", detail: `Google PageSpeed Insights performance score` });
        perfScore = pScore;
      }

      if (accessCategory?.score != null) {
        const aScore = Math.round(accessCategory.score * 100);
        performanceFindings.push({ label: "Accessibility score", value: `${aScore}/100`, status: aScore >= 90 ? "pass" : aScore >= 70 ? "warn" : "fail" });
      }

      const audits = lh.audits || {};
      if (audits["first-contentful-paint"]?.displayValue) {
        performanceFindings.push({ label: "First Contentful Paint", value: audits["first-contentful-paint"].displayValue, status: audits["first-contentful-paint"].score >= 0.9 ? "pass" : audits["first-contentful-paint"].score >= 0.5 ? "warn" : "fail" });
      }
      if (audits["largest-contentful-paint"]?.displayValue) {
        performanceFindings.push({ label: "Largest Contentful Paint", value: audits["largest-contentful-paint"].displayValue, status: audits["largest-contentful-paint"].score >= 0.9 ? "pass" : audits["largest-contentful-paint"].score >= 0.5 ? "warn" : "fail" });
      }
      if (audits["cumulative-layout-shift"]?.displayValue) {
        performanceFindings.push({ label: "Cumulative Layout Shift", value: audits["cumulative-layout-shift"].displayValue, status: audits["cumulative-layout-shift"].score >= 0.9 ? "pass" : audits["cumulative-layout-shift"].score >= 0.5 ? "warn" : "fail" });
      }
    } else {
      performanceFindings.push({ label: "Google PageSpeed", value: "Could not fetch", status: "warn", detail: "PageSpeed Insights API did not return data for this URL" });
    }

    const scores = {
      overall: 0,
      meta: Math.min(100, meta.score),
      headings: Math.min(100, headings.score),
      schema: Math.min(100, schema.score),
      links: Math.min(100, links.score),
      images: Math.min(100, images.score),
      aiReadiness: Math.min(100, aiReadiness.score),
      performance: Math.min(100, perfScore),
    };
    scores.overall = Math.round(
      scores.meta * 0.15 + scores.headings * 0.12 + scores.schema * 0.18 + scores.links * 0.15 + scores.images * 0.08 + scores.aiReadiness * 0.2 + scores.performance * 0.12
    );

    const partialResult = {
      url: fullUrl,
      fetchedAt: new Date().toISOString(),
      scores,
      meta: meta.findings,
      headings: headings.findings,
      schema: schema.findings,
      links: { findings: links.findings, internal: links.internal, external: links.external, inboundIndicators: links.inboundIndicators },
      images: images.findings,
      aiReadiness: aiReadiness.findings,
      performance: performanceFindings,
    };

    const recommendations = generateRecommendations(partialResult);

    res.json({ ...partialResult, recommendations });
  } catch (err: any) {
    logger.error({ err, url: fullUrl }, "SEO audit failed");
    const safeMessages = ["Only http and https URLs are allowed", "Internal hostnames are not allowed", "Private IP addresses are not allowed", "URL resolves to a private IP address", "Could not resolve hostname", "Response too large"];
    const clientMsg = safeMessages.includes(err.message) ? err.message : "Could not complete audit for this URL. Please check the URL and try again.";
    res.status(500).json({ error: clientMsg });
  }
});

export default seoAuditRouter;

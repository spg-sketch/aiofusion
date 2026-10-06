import * as cheerio from "cheerio";

export class AuditPageUnavailableError extends Error {
  constructor(message = "The site returned a security challenge or no readable page content. No website score was created. Try again later, or paste the genuine page content.") {
    super(message);
    this.name = "AuditPageUnavailableError";
  }
}

export function auditVisibleText(html: string): string {
  const $ = cheerio.load(html);
  // Unlike article extraction, retain public header/footer trust and contact information.
  $("script, style, noscript, svg, nav, form").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export function assertAuditPageUsable(html: string, finalUrl: string, contentType?: string | null): void {
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new AuditPageUnavailableError("The URL did not return an HTML webpage. No website score was created.");
  }
  const $ = cheerio.load(html);
  const refresh = $('meta[http-equiv]').toArray()
    .filter((el) => /refresh/i.test($(el).attr("http-equiv") ?? ""))
    .map((el) => $(el).attr("content") ?? "").join(" ");
  const text = auditVisibleText(html);
  const title = $("title").text().trim();
  const challengePath = /(?:\.well-known\/sgcaptcha|cdn-cgi\/challenge|\/(?:captcha|challenge-platform)(?:\/|[?#]|$))/i;
  const challengeTitle = /^(?:just a moment|access denied|attention required|verify you are human|checking your browser|security check)[.!…\s]*$/i;
  const challengeCopy = /verify (?:that )?you(?:'re| are) (?:a )?human|checking your browser|enable javascript and cookies to continue|complete the security check/i;
  if (challengePath.test(finalUrl) || challengePath.test(refresh)
      || challengeTitle.test(title) || (text.length < 1200 && challengeCopy.test(text))
      || text.length < 20) {
    throw new AuditPageUnavailableError();
  }
}

export function collectJsonLdTypes(html: string): { blockCount: number; types: string[] } {
  const $ = cheerio.load(html);
  const blocks = $('script[type="application/ld+json"]');
  const types = new Set<string>();
  function visit(value: unknown, depth = 0): void {
    if (depth > 40 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const node = value as Record<string, unknown>;
    const declared = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    for (const type of declared) if (typeof type === "string" && type.trim()) types.add(type.trim());
    for (const child of Object.values(node)) visit(child, depth + 1);
  }
  blocks.each((_, el) => {
    try { visit(JSON.parse($(el).html() || "")); } catch { /* Report the block, not invented types. */ }
  });
  return { blockCount: blocks.length, types: [...types].sort() };
}

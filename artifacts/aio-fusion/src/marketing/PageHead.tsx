/**
 * PageHead - imperatively updates <head> meta tags for public marketing pages.
 *
 * During client-side navigation the component fires a useEffect to sync the
 * document title, description, canonical, OG, Twitter, and JSON-LD.  During
 * the build-time prerender the script injects these tags directly into the
 * HTML template (this component never runs server-side).
 */
import { useEffect } from "react";
import type { PageMeta } from "./pageMeta";

const OG_IMAGE = "https://aiofusion.ai/opengraph.jpg";

function upsertMeta(
  selector: string,
  attrKey: string,
  attrValue: string,
  contentValue: string,
): void {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrKey, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute("content", contentValue);
}

function upsertLink(rel: string, href: string): void {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

const LD_JSON_ATTR = "data-pagehead-managed";

function upsertJsonLd(data: unknown): void {
  let el = document.querySelector<HTMLScriptElement>(
    `script[type="application/ld+json"][${LD_JSON_ATTR}]`,
  );
  if (!el) {
    el = document.createElement("script");
    el.setAttribute("type", "application/ld+json");
    el.setAttribute(LD_JSON_ATTR, "");
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeJsonLd(): void {
  const el = document.querySelector<HTMLScriptElement>(
    `script[type="application/ld+json"][${LD_JSON_ATTR}]`,
  );
  el?.remove();
}

export function PageHead({ meta }: { meta: PageMeta }) {
  useEffect(() => {
    const title = meta.title;
    const desc = meta.description;
    const ogTitle = meta.ogTitle ?? title;
    const ogDesc = meta.ogDescription ?? desc;
    const ogType = meta.ogType ?? "website";

    document.title = title;

    upsertMeta('meta[name="description"]', "name", "description", desc);
    upsertLink("canonical", meta.canonical);

    // Open Graph
    upsertMeta('meta[property="og:title"]', "property", "og:title", ogTitle);
    upsertMeta('meta[property="og:description"]', "property", "og:description", ogDesc);
    upsertMeta('meta[property="og:type"]', "property", "og:type", ogType);
    upsertMeta('meta[property="og:url"]', "property", "og:url", meta.canonical);
    upsertMeta('meta[property="og:image"]', "property", "og:image", OG_IMAGE);
    upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", "AIO Fusion");

    // Twitter Card
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", ogTitle);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", ogDesc);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", OG_IMAGE);

    // JSON-LD: upsert when present, remove when absent so stale schema doesn't
    // linger after navigating from a page with schema to one without.
    if (meta.jsonLd) {
      upsertJsonLd(meta.jsonLd);
    } else {
      removeJsonLd();
    }
  }, [meta]);

  return null;
}

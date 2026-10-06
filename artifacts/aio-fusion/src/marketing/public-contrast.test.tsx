import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ContactPage, { BookDemoForm } from "./ContactPage";
import { vars } from "./vars";

// WCAG relative luminance, using unrounded sRGB values.
function rgb(hex: string): number[] {
  return hex.replace("#", "").match(/../g)!.map((channel) => parseInt(channel, 16));
}
function contrast(a: number[], b: number[]): number {
  const luminance = (channels: number[]) => channels
    .map((value) => value / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const white = rgb("#FFFFFF");
const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("public WCAG AA contrast", () => {
  it.each(["#FFFFFF", "#FBE3ED", "#F5F8F8", "#FBF6EC"])(
    "keeps pink text readable against %s",
    (surface) => expect(contrast(rgb(vars.accent), rgb(surface))).toBeGreaterThanOrEqual(4.5),
  );

  it("keeps white CTA text readable in default, brightened and faded hover states", () => {
    const pink = rgb(vars.accent);
    expect(contrast(white, pink)).toBeGreaterThanOrEqual(4.5);
    // The strongest brightness effect used by the public CTAs.
    expect(contrast(white, pink.map((c) => Math.min(255, c * 1.1)))).toBeGreaterThanOrEqual(4.5);
    for (const background of [white, rgb("#FBE3ED"), rgb("#F5F8F8"), rgb("#102B36")]) {
      const composite = (color: number[]) => color.map((c, i) => c * 0.9 + background[i] * 0.1);
      expect(contrast(composite(white), composite(pink))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([BookDemoForm, () => <ContactPage onLogin={() => {}} onBack={() => {}} onNavigate={() => {}} />])(
    "gives every contact input a visible boundary and retains its explicit label",
    (Form) => {
      const doc = new DOMParser().parseFromString(renderToStaticMarkup(<Form />), "text/html");
      const controls = [...doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]), textarea")];
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const border = control.style.borderColor.match(/\d+/g)!.map(Number);
        expect(contrast(border, white)).toBeGreaterThanOrEqual(3);
        expect(control.classList.contains("bg-white")).toBe(true);
        expect(doc.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
        expect(control.className).toContain("focus:ring-[#A52F60]");
      }
    },
  );

  it("keeps navigation default, hover, keyboard focus and the login CTA readable on teal", () => {
    const css = source("../index.css");
    const nav = source("./MarketingNav.tsx");
    expect(nav).toContain('background: "#1A647B"');
    expect(contrast(white, rgb("#1A647B"))).toBeGreaterThanOrEqual(4.5);
    const hover = css.match(/\.marketing-nav-link:hover,\s*\.marketing-nav-link:focus-visible\s*\{([^}]+)\}/)![1];
    const color = hover.match(/color:\s*(#[a-f\d]{6})/i)![1];
    expect(contrast(rgb(color), rgb("#1A647B"))).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.marketing-nav-link:focus-visible\s*\{[^}]*outline: 2px solid #FBE3ED/);
    const cta = css.match(/nav\[aria-label="Main navigation"\] \.aio-button--primary\s*\{[^}]*background:\s*(#[a-f\d]{6})/i)![1];
    expect(contrast(white, rgb(cta).map((c) => Math.min(255, c * 1.08)))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    "MarketingPage", "LandingPage", "ContactPage", "AboutPage", "ForAgenciesPage",
    "ForAgentsPage", "ForInhousePage", "JournalistPrivacyPage", "PricingPage",
    "PrivacyPolicyPage", "LegalDocumentPage", "TermsConditionsPage", "TrustSecurityPage",
  ])("uses the accessible shared pink in %s instead of the old text/control color", (page) => {
    const code = source(`./${page}.tsx`)
      + (page === "PrivacyPolicyPage" ? source("./LegalDocumentPage.tsx") : "");
    expect(code).toContain("vars.accent");
    expect(code).not.toMatch(/#C8497A/i);
  });
});
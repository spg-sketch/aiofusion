// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import JournalistPrivacyPage from "./JournalistPrivacyPage";
import { PAGE_META, PUBLIC_PAGE_DEFINITIONS } from "./pageMeta";

describe("journalist privacy public route", () => {
  it("has a prerendered route, unique metadata, and neutral request language", () => {
    const definition = PUBLIC_PAGE_DEFINITIONS.find((item) => item.view === "journalist-privacy");
    expect(definition?.slug).toBe("journalist-privacy");
    expect(PAGE_META["journalist-privacy"].canonical).toBe("https://aiofusion.ai/journalist-privacy");
    const html = renderToStaticMarkup(
      <JournalistPrivacyPage onLogin={() => {}} onBack={() => {}} onNavigate={() => {}} />,
    );
    expect(html).toContain("Journalist privacy rights");
    expect(html).toContain("We do not publish a public lookup");
    expect(html).toContain("info@aiofusion.ai");
    expect(html).toContain("journalist-right-type");
  });
});
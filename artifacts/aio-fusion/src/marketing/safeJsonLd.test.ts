import { describe, expect, it } from "vitest";
import { serializeJsonLdForHtml } from "./safeJsonLd";

describe("serializeJsonLdForHtml", () => {
  it("cannot terminate the JSON-LD script when CMS text contains markup", () => {
    const serialized = serializeJsonLdForHtml({
      headline: '</script><script>alert("stored-xss")</script>',
      description: "A & B > C",
    });

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(serialized).not.toContain("&");
    expect(serialized).toContain("\\u003c/script\\u003e");
    expect(serialized).toContain("\\u0026");
    expect(serialized).toContain("\\u003e");
  });
});
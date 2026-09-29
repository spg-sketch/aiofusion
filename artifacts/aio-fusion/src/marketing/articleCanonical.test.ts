import { describe, expect, it } from "vitest";
import { articleCanonicalUrl } from "./articleCanonical";

describe("articleCanonicalUrl", () => {
  it("moves a staging-owned article to the live apex without losing its path", () => {
    expect(
      articleCanonicalUrl(
        "https://staging.aiofusion.ai/insights/visibility?source=site",
        "visibility",
        "https://aiofusion.ai",
      ),
    ).toBe("https://aiofusion.ai/insights/visibility?source=site");
  });

  it("keeps owned articles on staging during a staging build", () => {
    expect(
      articleCanonicalUrl(
        "https://aiofusion.ai/insights/visibility",
        "visibility",
        "https://staging.aiofusion.ai",
      ),
    ).toBe("https://staging.aiofusion.ai/insights/visibility");
  });

  it("normalizes the former www origin to the apex", () => {
    expect(
      articleCanonicalUrl(
        "https://www.aiofusion.ai/insights/visibility",
        "visibility",
        "https://aiofusion.ai",
      ),
    ).toBe("https://aiofusion.ai/insights/visibility");
  });

  it("preserves an external article's canonical URL", () => {
    expect(
      articleCanonicalUrl(
        "https://aiofusionb2bauthority.carrd.co/",
        "external-guide",
        "https://aiofusion.ai",
      ),
    ).toBe("https://aiofusionb2bauthority.carrd.co/");
  });

  it("uses this deployment's origin when the stored URL is missing or invalid", () => {
    expect(articleCanonicalUrl(null, "visibility", "https://aiofusion.ai/")).toBe(
      "https://aiofusion.ai/insights/visibility",
    );
    expect(articleCanonicalUrl("not a URL", "visibility", "https://aiofusion.ai")).toBe(
      "https://aiofusion.ai/insights/visibility",
    );
  });
});
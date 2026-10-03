import { describe, expect, it } from "vitest";
import { ContactHeardAboutSource } from "@workspace/api-zod";
import { parseContactAttribution } from "./contact-attribution";

describe("contact attribution validation", () => {
  it.each(Object.values(ContactHeardAboutSource))("accepts the approved option %s", (heardAbout) => {
    expect(parseContactAttribution({ heardAbout }).heardAbout).toBe(heardAbout);
  });
  it.each([{}, { heardAbout: "" }, { heardAbout: null }])("allows omitted attribution", (body) => {
    expect(parseContactAttribution(body)).toEqual({ heardAbout: null, heardAboutDetail: null });
  });
  it.each(["Unknown channel", 12, {}, ["Other"]])("rejects unsupported choices", (heardAbout) => {
    expect(() => parseContactAttribution({ heardAbout })).toThrow("valid answer");
  });
  it.each(["Other", "AI assistant - other"])("retains bounded detail only for %s", (heardAbout) => {
    expect(parseContactAttribution({ heardAbout, heardAboutDetail: " Example " }))
      .toEqual({ heardAbout, heardAboutDetail: "Example" });
    expect(() => parseContactAttribution({ heardAbout, heardAboutDetail: "x".repeat(301) })).toThrow("300");
  });
  it("does not retain stale detail for a standard choice or an omitted choice", () => {
    expect(parseContactAttribution({ heardAbout: "LinkedIn", heardAboutDetail: "Old" }).heardAboutDetail).toBeNull();
    expect(parseContactAttribution({ heardAboutDetail: "Old" }).heardAboutDetail).toBeNull();
  });
});
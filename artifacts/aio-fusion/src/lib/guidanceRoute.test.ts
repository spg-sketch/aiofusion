import { describe, expect, it } from "vitest";
import { guidanceRouteFromLocation, guidanceUrl } from "./guidanceRoute";

describe("dedicated How-to reader URLs", () => {
  it("round-trips stable IDs and filters at root and under an artifact base", () => {
    for (const base of ["/", "/aio-fusion/", "/aio-fusion"]) {
      for (const id of [null, "immutable-id", "id with / and %"]) {
        const route = { id, filter: "Guide" as const };
        const url = new URL(guidanceUrl(route, base), "https://example.test");
        expect(guidanceRouteFromLocation(url, base)).toEqual(route);
        expect(url.pathname.startsWith(base.replace(/\/+$/, "") + "/guidance")).toBe(true);
      }
    }
  });

  it("defaults absent or invalid filters without losing the reader", () => {
    expect(guidanceRouteFromLocation({ pathname: "/guidance/guide-id", search: "?type=unknown" }, "/"))
      .toEqual({ id: "guide-id", filter: "All" });
    expect(guidanceUrl({ id: null, filter: "All" }, "/")).toBe("/guidance");
    expect(guidanceRouteFromLocation({ pathname: "/guidance/%broken", search: "" }, "/").id).toBe("%broken");
  });
});
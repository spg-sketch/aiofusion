import { describe, expect, it } from "vitest";
import { isInsightsAdminPath } from "./adminRoute";

describe("Insights admin route", () => {
  it("recognises the direct /admin URL", () => {
    expect(isInsightsAdminPath("/admin")).toBe(true);
    expect(isInsightsAdminPath("/admin/")).toBe(true);
  });

  it("respects an artifact base path", () => {
    expect(isInsightsAdminPath("/aio-fusion/admin", "/aio-fusion/")).toBe(true);
    expect(isInsightsAdminPath("/aio-fusion/insights", "/aio-fusion/")).toBe(false);
  });
});
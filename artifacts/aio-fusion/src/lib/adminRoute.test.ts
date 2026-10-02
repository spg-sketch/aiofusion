import { describe, expect, it } from "vitest";
import { isHowtoAdminPath, isInsightsAdminPath } from "./adminRoute";

describe("Insights admin route", () => {
  it("recognises the direct /admin URL", () => {
    expect(isInsightsAdminPath("/admin")).toBe(true);
    expect(isInsightsAdminPath("/admin/")).toBe(true);
  });

  it("respects an artifact base path", () => {
    expect(isInsightsAdminPath("/aio-fusion/admin", "/aio-fusion/")).toBe(true);
    expect(isInsightsAdminPath("/aio-fusion/insights", "/aio-fusion/")).toBe(false);
  });

  it("keeps How-to management separate from public Insights and the Insights editor", () => {
    expect(isHowtoAdminPath("/admin/howto/")).toBe(true);
    expect(isHowtoAdminPath("/aio-fusion/admin/howto", "/aio-fusion/")).toBe(true);
    expect(isInsightsAdminPath("/admin/howto")).toBe(false);
    expect(isHowtoAdminPath("/admin")).toBe(false);
    expect(isHowtoAdminPath("/insights/howto")).toBe(false);
  });
});
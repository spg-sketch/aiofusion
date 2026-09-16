import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  insightArticlesTable: {},
}));

import { parseOptions } from "./migrate-insights-task-290";

describe("Task 290 migration CLI options", () => {
  it("accepts the pnpm/npm argument separator", () => {
    expect(parseOptions(["--", "--dry-run"])).toEqual({
      mode: "dry-run",
      allowProduction: false,
    });
    expect(parseOptions(["--", "--apply", "--allow-production"])).toEqual({
      mode: "apply",
      allowProduction: true,
    });
  });

  it("still requires exactly one explicit mode", () => {
    expect(() => parseOptions(["--"])).toThrow("--dry-run or --apply");
    expect(() => parseOptions(["--", "--dry-run", "--apply"])).toThrow(
      "exactly one",
    );
  });
});

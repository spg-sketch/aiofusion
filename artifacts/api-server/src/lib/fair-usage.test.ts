import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  callCount: 0,
  multiplier: null as string | null,
  baseLimit: 50,
}));

const sendQuotaBreachAlert = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@workspace/db", () => {
  const tokenUsageTable = {
    accountId: "account_id",
    projectId: "project_id",
    operation: "operation",
    createdAt: "created_at",
    costGbpEstimate: "cost_gbp_estimate",
  };
  const platformMetaTable = { key: "key", value: "value" };
  return {
    tokenUsageTable,
    platformMetaTable,
    db: {
      select: (selection: Record<string, unknown>) => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === platformMetaTable) {
              return {
                limit: async () => state.multiplier === null ? [] : [{ value: state.multiplier }],
              };
            }
            if ("count" in selection) return Promise.resolve([{ count: state.callCount }]);
            return Promise.resolve([]);
          },
          groupBy: () => [],
        }),
      }),
    },
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  gte: (...args: unknown[]) => args,
  lt: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  sql: Object.assign(
    () => "sql",
    { raw: () => "sql" },
  ),
}));

vi.mock("./billing", () => ({
  getProjectActionLimit: vi.fn(async () => state.baseLimit),
}));

vi.mock("./notify-email", () => ({
  sendSpikeAlert: vi.fn(async () => undefined),
  sendQuotaBreachAlert,
}));

describe("fair usage enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    state.callCount = 0;
    state.multiplier = null;
    state.baseLimit = 50;
  });

  afterEach(() => {
    delete process.env.FAIR_USAGE_ENFORCEMENT_ENABLED;
  });

  it("continues reporting usage but allows calls while enforcement is disabled", async () => {
    process.env.FAIR_USAGE_ENFORCEMENT_ENABLED = "false";
    state.callCount = 50;

    const { checkFairUsage } = await import("./fair-usage");
    await expect(checkFairUsage("staging-account", "project-1")).resolves.toEqual({
      allowed: true,
      callCount: 50,
      limit: 50,
    });
    expect(sendQuotaBreachAlert).not.toHaveBeenCalled();
  });

  it("allows the final action and blocks the next action when enforcement is enabled", async () => {
    process.env.FAIR_USAGE_ENFORCEMENT_ENABLED = "true";
    const { checkFairUsage } = await import("./fair-usage");

    state.callCount = 49;
    await expect(checkFairUsage("staging-account", "project-1")).resolves.toEqual({
      allowed: true,
      callCount: 49,
      limit: 50,
    });

    state.callCount = 50;
    await expect(checkFairUsage("staging-account", "project-1")).resolves.toEqual({
      allowed: false,
      callCount: 50,
      limit: 50,
    });
    expect(sendQuotaBreachAlert).toHaveBeenCalledWith({
      slug: "staging-account",
      callCount: 50,
      limit: 50,
    });
  });

  it("applies the account multiplier to the published project-tier allowance", async () => {
    process.env.FAIR_USAGE_ENFORCEMENT_ENABLED = "true";
    state.baseLimit = 75;
    state.multiplier = "2";
    state.callCount = 149;

    const { checkFairUsage } = await import("./fair-usage");
    await expect(checkFairUsage("staging-account", "project-1")).resolves.toEqual({
      allowed: true,
      callCount: 149,
      limit: 150,
    });
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ rows: [] })),
}));

vi.mock("@workspace/db", () => ({ db: { execute } }));

import { expireStaleAuditRuns, updateAuditRunProgress } from "./audit-run-claims";

describe("audit run claims", () => {
  beforeEach(() => execute.mockClear());

  it("expires overdue running work through one atomic database update", async () => {
    await expireStaleAuditRuns({
      runId: "run-1",
      projectId: "project-1",
      auditType: "visibility",
      owner: "workspace",
    });

    expect(execute).toHaveBeenCalledOnce();
  });

  it("persists progress and renews the worker lease", async () => {
    await updateAuditRunProgress("run-1", 3, 8);
    expect(execute).toHaveBeenCalledOnce();
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(async (): Promise<{ rows: any[] }> => ({ rows: [] })),
}));

vi.mock("@workspace/db", () => ({ db: { execute } }));

import {
  expireStaleAuditRuns,
  reclaimRecoverableAuditRuns,
  retryAuditRunAfterFailure,
  updateAuditRunProgress,
} from "./audit-run-claims";

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

  it("atomically reclaims expired resumable work with its original run identifier", async () => {
    execute.mockResolvedValueOnce({
      rows: [{
        run_id: "run-1",
        project_id: "project-1",
        audit_type: "visibility",
        owner: "workspace",
        payload: { companyName: "Acme", projectId: "project-1" },
        attempt_count: 2,
      }],
    });

    await expect(reclaimRecoverableAuditRuns()).resolves.toEqual([{
      runId: "run-1",
      projectId: "project-1",
      auditType: "visibility",
      owner: "workspace",
      payload: { companyName: "Acme", projectId: "project-1" },
      attemptCount: 2,
    }]);
  });

  it("records a failed attempt for bounded automatic retry", async () => {
    await retryAuditRunAfterFailure("run-1", "retrying");
    expect(execute).toHaveBeenCalledOnce();
  });
});
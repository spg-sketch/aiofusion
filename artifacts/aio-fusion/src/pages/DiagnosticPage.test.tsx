// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAiRuns } from "../lib/aiRunLifecycle";
import { savedDiagnosticsKey } from "../lib/diagnosticStore";
import { DiagnosticPage } from "./DiagnosticPage";

vi.mock("../IntakeForm", () => ({
  getConfirmedEntity: () => null,
}));

const client = {
  id: "diagnostic-timer-project",
  name: "Timer project",
  sector: "Technology",
  initials: "TP",
  color: "#165265",
  contentCount: 0,
  avgScore: 0,
  scoreTrend: 0,
  activePlans: 0,
  lastActive: "Never",
  recentActivity: "None",
};

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
}) as Response;

describe("DiagnosticPage run lifecycle", () => {
  let now = 1_800_000_000_000;

  beforeEach(() => {
    localStorage.clear();
    clearAiRuns();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/diagnostic")) return new Promise<Response>(() => {});
      if (url.includes("/api/audit-lock")) return Promise.resolve(response({ locked: false }));
      return Promise.resolve(response({ diagnostics: [] }));
    }));
  });

  afterEach(() => {
    cleanup();
    clearAiRuns();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the wall-clock countdown when the user leaves and returns", async () => {
    const first = render(<DiagnosticPage activeClient={client} sessionId="person-a" workspaceId="workspace-a" />);
    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "https://example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Diagnostic" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect((await screen.findAllByText("5:00")).length).toBeGreaterThan(0);
    first.unmount();
    now += 12_000;

    const current = render(<DiagnosticPage activeClient={client} sessionId="person-a" workspaceId="workspace-a" />);
    expect((await screen.findAllByText("4:48")).length).toBeGreaterThan(0);
    expect(screen.getByText(/keep this browser tab open/i)).toBeInTheDocument();
  });

  it("saves and restores a run that finishes while the page is unmounted", async () => {
    let resolveAudit!: (response: Response) => void;
    let auditCompleted = false;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/diagnostic")) {
        return new Promise<Response>((resolve) => { resolveAudit = resolve; });
      }
      if (url.includes("/api/audit-lock")) {
        return Promise.resolve(response(auditCompleted
          ? { locked: true, lastRunAt: "2026-09-19T12:00:00.000Z", daysRemaining: 21 }
          : { locked: false }));
      }
      return Promise.resolve(response({ diagnostics: [] }));
    }));
    const completed = {
      overallScore: 72,
      categories: [],
      strengths: [],
      warnings: [],
      criticalGaps: [],
      priorityActions: [],
      summary: "Completed while away",
    };

    const first = render(<DiagnosticPage activeClient={client} sessionId="person-a" workspaceId="workspace-a" />);
    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "https://example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Diagnostic" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findAllByText("5:00");
    first.unmount();

    const current = render(<DiagnosticPage activeClient={client} sessionId="person-a" workspaceId="workspace-a" />);
    expect((await screen.findAllByText("5:00")).length).toBeGreaterThan(0);
    auditCompleted = true;
    await act(async () => {
      resolveAudit(response(completed));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("Completed while away")).toBeInTheDocument();
    await waitFor(() => {
      const lockCalls = vi.mocked(fetch).mock.calls.filter(([input]) =>
        String(input).includes("/api/audit-lock"),
      );
      expect(lockCalls.length).toBeGreaterThanOrEqual(3);
    });
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(savedDiagnosticsKey(client.id)) || "[]");
      expect(saved).toHaveLength(1);
      expect(saved[0].result.overallScore).toBe(72);
    });
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/diagnostic"))).toHaveLength(1);

    auditCompleted = false;
    current.rerender(<DiagnosticPage activeClient={client} sessionId="person-b" workspaceId="workspace-b" />);
    expect(screen.queryByText("Completed while away")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Run Diagnostic" })).toBeInTheDocument();
  });
});
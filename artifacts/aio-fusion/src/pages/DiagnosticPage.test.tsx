// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAiRuns } from "../lib/aiRunLifecycle";
import { savedDiagnosticsKey } from "../lib/diagnosticStore";
import { recordAuditDuration } from "../lib/auditTiming";
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
    now = 1_800_000_000_000;
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

  it("sets countdown-based expectations before starting the audit", () => {
    render(<DiagnosticPage activeClient={client} sessionId="person-a" workspaceId="workspace-a" />);
    fireEvent.click(screen.getByRole("button", { name: "Run Diagnostic" }));

    const explanation = screen.getByText(
      "This will fetch and analyse your website. This can take several minutes. An estimated countdown will appear when the audit starts.",
    );
    expect(explanation).toBeInTheDocument();
    expect(explanation.textContent).not.toContain("\u2014");
    expect(screen.queryByText(/15[–-]30 seconds/i)).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/diagnostic"))).toHaveLength(0);
  });

  it("pairs the running explanation with the measured estimate and still-working overtime state", async () => {
    recordAuditDuration("visibility", 150_000);
    recordAuditDuration("visibility", 168_000);
    const first = render(<DiagnosticPage activeClient={client} sessionId="person-a" workspaceId="workspace-a" />);
    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "https://example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Diagnostic" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const runningCopy = "Your website is being analysed alongside the figures measured directly from your page, to produce a comprehensive GEO authority score. This can take several minutes. Follow the countdown below for the estimated time remaining. Some audits may take longer.";
    expect(await screen.findByText(runningCopy)).toBeInTheDocument();
    expect(screen.getByText(runningCopy).textContent).not.toContain("\u2014");
    expect(screen.queryByText(/15[–-]30 seconds/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("2:39")).toHaveLength(2);
    expect(screen.getByText(/Based on your last 2 audits/)).toBeInTheDocument();

    first.unmount();
    now += 171_000;
    render(<DiagnosticPage activeClient={client} sessionId="person-a" workspaceId="workspace-a" />);

    expect(await screen.findByText("Still working - the estimate has passed")).toBeInTheDocument();
    expect(screen.getByText("+0:12")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("is taking longer than expected and is still in progress");
    expect(screen.getByText(runningCopy)).toBeInTheDocument();
    expect(screen.queryByText(/15[–-]30 seconds/i)).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/diagnostic"))).toHaveLength(1);
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
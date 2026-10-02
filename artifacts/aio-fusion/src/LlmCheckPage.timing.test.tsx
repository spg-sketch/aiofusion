import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LlmCheckPage from "./LlmCheckPage";
import { clearAiRuns } from "./lib/aiRunLifecycle";
import { recordAuditDuration } from "./lib/auditTiming";

const client = { id: "timing-test-project", name: "Timing Example", sector: "Consulting" };
const identity = { sessionId: "timing-test-person", workspaceId: "timing-test-workspace" };
const isAuditStart = (input: unknown, init?: RequestInit) =>
  String(input).includes("/api/llm-check") && init?.method === "POST";

describe("Earned Media/LLM audit timing copy", () => {
  let now: number;

  beforeEach(() => {
    cleanup();
    clearAiRuns();
    localStorage.clear();
    now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    localStorage.setItem("aio.activeProjectId", client.id);
    localStorage.setItem(`aio.intake.v2::${client.id}`, JSON.stringify({
      llmQueries: { v: 1, discovery: ["Discover consulting providers"], shortlist: [], comparison: [] },
    }));
    // Keep a synthetic audit running, without any real provider or server calls.
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      if (isAuditStart(input, init)) return {
        ok: true, status: 200,
        body: { getReader: () => ({ read: () => new Promise(() => {}) }) },
      };
      return {
        ok: true, status: 200,
        json: async () => ({ locked: false, intake: null, updatedAt: null, audits: [], run: null }),
      };
    }));
  });

  afterEach(() => {
    cleanup();
    clearAiRuns();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("explains that the countdown provides the estimate before a run starts", () => {
    render(<LlmCheckPage activeClient={client} {...identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Visibility Audit" }));
    expect(screen.getByText(/This can take several minutes\. An estimated countdown will appear when the audit starts\./))
      .toBeInTheDocument();
    expect(screen.queryByText(/1[–-]3 minutes/i)).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([input, init]) => isAuditStart(input, init))).toHaveLength(0);
  });

  it.each([
    { label: "default", samples: [], estimate: "5:00", seconds: 300 },
    { label: "learned", samples: [150_000, 168_000], estimate: "2:39", seconds: 159 },
  ])("keeps the $label countdown and overtime state as the single timing estimate", async ({ samples, estimate, seconds }) => {
    for (const duration of samples) recordAuditDuration("visibility", duration);
    const first = render(<LlmCheckPage activeClient={client} {...identity} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Visibility Audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const runningCopy = /Follow the countdown above for the estimated time remaining\. Some audits may take longer\./;
    expect(await screen.findByText(runningCopy)).toBeInTheDocument();
    expect(screen.getAllByText(estimate).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1[–-]3 minutes/i)).not.toBeInTheDocument();

    first.unmount();
    now += (seconds + 12) * 1000;
    render(<LlmCheckPage activeClient={client} {...identity} />);
    expect(await screen.findByText("Still working - the estimate has passed")).toBeInTheDocument();
    expect(screen.getByText("+0:12")).toBeInTheDocument();
    expect(screen.getByText(runningCopy)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("is taking longer than expected and is still in progress");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([input, init]) => isAuditStart(input, init))).toHaveLength(1));
  });
});
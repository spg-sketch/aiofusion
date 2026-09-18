import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import LlmCheckPage, { loadSavedAudits, type SavedAudit } from "../LlmCheckPage";
import { getExactTargetPhrases } from "../lib/exactTargetPhrases";
import type { PhraseMeasurement } from "../lib/mediaVisibilityImpact";
import { auditQueryCoverageHtml, auditQueryCoverageSummary } from "./AuditQueryCoverage";

const phrases = getExactTargetPhrases({
  discovery: Array.from({ length: 8 }, (_, i) => `Discover SMG ${i}`),
  shortlist: Array.from({ length: 8 }, (_, i) => `Shortlist SMG ${i}`),
  comparison: Array.from({ length: 8 }, (_, i) => `Compare SMG ${i}`),
});
const measurements: PhraseMeasurement[] = phrases.flatMap((phrase) =>
  (["chatgpt", "claude"] as const).map((provider) => ({
    phrase, provider, model: provider === "chatgpt" ? "gpt-5" : "claude-sonnet-4-5",
    methodologyVersion: 1, effectiveQuery: phrase.text.replace("SMG", "SMG (example.invalid)"),
    status: "complete", expectedRuns: 2, completedRuns: 2, mentionRuns: 0,
    mentioned: false, answerPosition: null, citations: [], citedDomains: [],
    shareOfVoice: 0, competitors: [], failureLabel: null,
  })),
);
measurements[23] = { ...measurements[23], status: "failed", completedRuns: 0, mentioned: null, failureLabel: "Provider check failed" };

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps all 24 immutable phrases and effective queries on reopen and in the exported report", () => {
  const audit: SavedAudit = {
    id: "coverage-fixture", savedAt: "2026-01-01T00:00:00.000Z",
    result: {
      companyName: "SMG", sector: "Consulting", checkedAt: "2026-01-01T00:00:00.000Z",
      visibilityScore: 0, totalProbes: 50, totalMentions: 0,
      byModel: { chatgpt: { probes: 26, mentions: 0, rate: 0 }, claude: { probes: 24, mentions: 0, rate: 0 } },
      topCompetitors: [], probes: [], phraseMeasurements: measurements,
    },
  };
  const stored = JSON.stringify([audit]);
  localStorage.setItem("aio.savedAudits.coverage-client", stored);
  localStorage.setItem("aio.intake.v2::coverage-client", JSON.stringify({
    llmQueries: { v: 1, discovery: ["New setup must not relabel history"], shortlist: [], comparison: [] },
  }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
  let html = "";
  vi.spyOn(window, "open").mockReturnValue({
    document: { write: (value: string) => { html = value; }, close: () => {} },
    focus: () => {}, print: () => {},
  } as unknown as Window);
  render(<LlmCheckPage
    activeClient={{ id: "coverage-client", name: "SMG", sector: "Consulting" }}
    pendingAuditId={audit.id}
  />);
  const coverage = screen.getByRole("region", { name: "Queries run" });
  expect(within(coverage).getByText(auditQueryCoverageSummary(measurements))).toBeInTheDocument();
  expect(within(coverage).getAllByRole("row")).toHaveLength(49);
  expect(within(coverage).getByText(/0\/2 · failed · Provider check failed/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Open report \/ Save as PDF/i));
  for (const item of measurements) {
    expect(coverage.textContent).toContain(item.phrase.text);
    expect(coverage.textContent).toContain(item.effectiveQuery);
    expect(html).toContain(item.phrase.text);
    expect(html).toContain(item.effectiveQuery);
  }
  expect(html).toContain("plus a separate identity probe");
  expect(html).not.toContain("New setup must not relabel history");
  expect(loadSavedAudits("coverage-client")[0].result.phraseMeasurements).toEqual(measurements);
  expect(localStorage.getItem("aio.savedAudits.coverage-client")).toBe(stored);
});

it("escapes exact query text in exports and leaves legacy reports without invented coverage", () => {
  expect(auditQueryCoverageHtml([])).toBe("");
  const html = auditQueryCoverageHtml([{
    ...measurements[0], phrase: { ...phrases[0], text: "<script>literal phrase</script>" },
    effectiveQuery: "<script>literal effective query</script>",
  }]);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;literal phrase");
});
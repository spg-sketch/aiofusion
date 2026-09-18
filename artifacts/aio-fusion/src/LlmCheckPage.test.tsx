import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import LlmCheckPage, { loadSavedAudits, type SavedAudit } from "./LlmCheckPage";
import { clearAiRuns } from "./lib/aiRunLifecycle";

const CLIENT = { id: "client-1", name: "Acme Ltd", sector: "Consulting" };

// A saved audit shaped exactly like one created BEFORE the authority assessment
// feature shipped: it has no `assessment` field at all.
const LEGACY_RESULT = {
  companyName: "Acme Ltd",
  sector: "Consulting",
  sectors: ["Consulting"],
  icp: "mid-market manufacturers",
  checkedAt: "2025-01-15T10:00:00.000Z",
  visibilityScore: 40,
  totalProbes: 10,
  totalMentions: 4,
  byModel: {
    chatgpt: { probes: 5, mentions: 2, rate: 40 },
    claude: { probes: 5, mentions: 2, rate: 40 },
  },
  topCompetitors: [{ name: "Globex", mentions: 6 }],
  probes: [
    {
      question: "What do you know about Acme Ltd?",
      model: "GPT-5 (ChatGPT)",
      mentioned: true,
      mentionContext: "...Acme Ltd is a consultancy...",
      responsePreview: "Acme Ltd is a consultancy.",
      competitors: ["Globex"],
    },
    {
      question: "Top consulting firms?",
      model: "Claude (Anthropic)",
      mentioned: false,
      mentionContext: null,
      responsePreview: "The leading firms are Globex and others.",
      competitors: ["Globex"],
    },
  ],
};

// A modern audit that DOES carry an assessment.
const MODERN_RESULT = {
  ...LEGACY_RESULT,
  checkedAt: "2026-06-01T10:00:00.000Z",
  assessmentStatus: { status: "complete" as const, reason: null },
  assessmentOutcome: { status: "complete" as const, reasonCategory: null },
  assessment: {
    index: 64,
    grade: "B",
    summary: "Acme appears in some answers but trails Globex.",
    dimensions: [
      { name: "Presence", score: 60, justification: "Appeared in 4 of 10 probes.", confidence: "high" },
      { name: "Prominence", score: 50, justification: "Often a passing mention.", confidence: "medium" },
      { name: "Share of voice", score: 40, justification: "Behind Globex.", confidence: "medium" },
      { name: "Message fidelity", score: 30, justification: "Core sector positioning appears occasionally.", confidence: "low" },
      { name: "Factual accuracy", score: 45, justification: "The available descriptions are broadly accurate.", confidence: "low" },
      { name: "Source quality", score: 20, justification: "Few URLs supplied.", confidence: "low" },
      { name: "Entity clarity", score: 55, justification: "Reasonably distinct.", confidence: "medium" },
      { name: "Spokesperson authority", score: 10, justification: "No spokespeople supplied.", confidence: "low" },
    ],
    topGaps: ["Not surfaced for boutique queries"],
    priorityActions: [
      { action: "Publish category thought leadership", rationale: "Engines cite authority content.", priority: "high" },
    ],
    queryTable: [
      { query: "Top consulting firms?", appeared: false, notes: "Recommended Globex instead." },
    ],
    categoryFraming: [
      { query: "Top consulting firms?", themes: "Sector depth and independent proof dominate the category." },
    ],
    narrativeSignals: {
      gpt: ["Independent consultancy"],
      claude: ["Specialist adviser"],
      divergence: null,
    },
  },
};

const FALLBACK_RESULT = {
  ...LEGACY_RESULT,
  checkedAt: "2026-08-20T12:39:00.000Z",
  assessment: null,
  assessmentStatus: {
    status: "fallback" as const,
    reason: "The AI Authority assessment could not be completed. This report contains the visibility evidence only. Run the audit again to retry.",
  },
  assessmentOutcome: {
    status: "fallback" as const,
    reasonCategory: "incomplete_response" as const,
  },
};

const MALFORMED_LEGACY_RESULT = {
  ...LEGACY_RESULT,
  checkedAt: "2026-05-01T10:00:00.000Z",
  assessment: {
    ...MODERN_RESULT.assessment,
    dimensions: MODERN_RESULT.assessment.dimensions.slice(0, 1),
  },
};

const A_STAR_RESULT = {
  ...MODERN_RESULT,
  assessment: { ...MODERN_RESULT.assessment, index: 75, grade: "A*" },
};

const OUT_OF_RANGE_RESULT = {
  ...MODERN_RESULT,
  assessment: { ...MODERN_RESULT.assessment, index: 999, grade: "A*" },
};

const STATUS_ONLY_RESULT = {
  ...MODERN_RESULT,
  assessmentOutcome: undefined,
};

const OUTCOME_ONLY_RESULT = {
  ...MODERN_RESULT,
  assessmentStatus: undefined,
};

const CONTRADICTORY_METADATA_RESULT = {
  ...MODERN_RESULT,
  assessmentOutcome: {
    status: "fallback" as const,
    reasonCategory: "scoring_error" as const,
  },
};

const INVERSE_CONTRADICTORY_METADATA_RESULT = {
  ...MODERN_RESULT,
  assessmentStatus: {
    status: "fallback" as const,
    reason: "The assessment could not be completed.",
  },
  assessmentOutcome: {
    status: "complete" as const,
    reasonCategory: null,
  },
};

// An audit for an acronym brand whose name is shared with other organisations,
// carrying the entity-clarity verdict the server now returns.
const AMBIGUOUS_RESULT = {
  ...MODERN_RESULT,
  companyName: "SMG",
  entityClarity: {
    brandName: "SMG",
    isAmbiguous: true,
    brandRecognised: true,
    brandIsDominant: false,
    competingEntities: [
      { name: "Sinclair Media Group", description: "a US broadcaster" },
      { name: "Scott Management Group", description: "a property firm" },
    ],
    note: "The name \"SMG\" is shared with other well-known organisations, so the brand competes for its own name and a depressed score partly reflects this identity confusion.",
  },
};

function seedSavedAudit(result: object): SavedAudit {
  const audit: SavedAudit = {
    id: "audit-1",
    savedAt: "2025-01-15T11:00:00.000Z",
    result: result as SavedAudit["result"],
  };
  localStorage.setItem(`aio.savedAudits.${CLIENT.id}`, JSON.stringify([audit]));
  return audit;
}

describe("LlmCheckPage saved-audit backward compatibility", () => {
  beforeEach(() => {
    clearAiRuns();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearAiRuns();
  });

  it("loadSavedAudits returns persisted audits and tolerates corrupt storage", () => {
    seedSavedAudit(LEGACY_RESULT);
    expect(loadSavedAudits(CLIENT.id)).toHaveLength(1);

    localStorage.setItem(`aio.savedAudits.${CLIENT.id}`, "not valid json{");
    expect(loadSavedAudits(CLIENT.id)).toEqual([]);
  });

  it("opens and renders a legacy audit (no assessment) without crashing", () => {
    seedSavedAudit(LEGACY_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    // The original visibility report renders.
    expect(screen.getByText("Detailed probe results")).toBeInTheDocument();
    expect(screen.getByText("Who owns the category instead")).toBeInTheDocument();

    // The assessment-only scorecard must be ABSENT for legacy audits.
    expect(screen.queryByText("AI Authority scorecard")).not.toBeInTheDocument();
    expect(screen.getByText(/Authority assessment incomplete - showing visibility fallback/i)).toBeInTheDocument();
  });

  it("always renders the Executive summary, with fallback text when there is no assessment or ICP", () => {
    const noAssessNoIcp = { ...LEGACY_RESULT, icp: "" };
    seedSavedAudit(noAssessNoIcp);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    // The executive summary section starts expanded by default.
    expect(screen.getByText(/non-branded category queries across ChatGPT and Claude/i)).toBeInTheDocument();
  });

  it("renders the assessed summary text in the Executive summary section when an assessment is present", () => {
    seedSavedAudit(MODERN_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    // The executive summary section starts expanded by default.

    // The AI-generated summary from assessment.summary must be visible.
    expect(
      screen.getByText("Acme appears in some answers but trails Globex."),
    ).toBeInTheDocument();
  });

  it("renders the AI Authority scorecard only when an assessment is present", () => {
    seedSavedAudit(MODERN_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.getByText("AI Authority scorecard")).toBeInTheDocument();
    fireEvent.click(screen.getByText("AI Authority scorecard"));
    // A dimension justification from the assessment is shown.
    expect(screen.getByText("Appeared in 4 of 10 probes.")).toBeInTheDocument();
  });

  it("shows a visible warning and retry action for a fallback assessment", () => {
    seedSavedAudit(FALLBACK_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.getByText(/Authority assessment incomplete - showing visibility fallback/i)).toBeInTheDocument();
    expect(screen.getByText(/This is not the complete AI Authority Scorecard/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry audit/i })).toBeInTheDocument();
    expect(screen.queryByText("AI Authority scorecard")).not.toBeInTheDocument();
    expect(screen.queryByText("Prioritised actions")).not.toBeInTheDocument();
  });

  it("does not show fallback messaging for a complete assessment", () => {
    seedSavedAudit(MODERN_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.queryByText(/Authority assessment incomplete/i)).not.toBeInTheDocument();
    expect(screen.getByText("AI Authority scorecard")).toBeInTheDocument();
  });

  it("treats a structurally incomplete legacy assessment as a visibility fallback", () => {
    seedSavedAudit(MALFORMED_LEGACY_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.getByText(/Authority assessment incomplete - showing visibility fallback/i)).toBeInTheDocument();
    expect(screen.queryByText("AI Authority scorecard")).not.toBeInTheDocument();
    expect(screen.queryByText("Prioritised actions")).not.toBeInTheDocument();
  });

  it("renders a valid A-star assessment and rejects an out-of-range complete payload", () => {
    seedSavedAudit(A_STAR_RESULT);
    const valid = render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );
    expect(screen.getByText("AI Authority scorecard")).toBeInTheDocument();
    valid.unmount();

    seedSavedAudit(OUT_OF_RANGE_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );
    expect(screen.getByText(/Authority assessment incomplete - showing visibility fallback/i)).toBeInTheDocument();
    expect(screen.queryByText("AI Authority scorecard")).not.toBeInTheDocument();
  });

  it("labels malformed explicit-complete entries as fallback in the saved list", () => {
    seedSavedAudit(OUT_OF_RANGE_RESULT);
    render(<LlmCheckPage activeClient={CLIENT} />);

    expect(
      screen.getByText("Assessment fallback: incomplete scoring response"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Assessment complete")).not.toBeInTheDocument();
  });

  it.each([
    ["status-only", STATUS_ONLY_RESULT],
    ["outcome-only", OUTCOME_ONLY_RESULT],
    ["contradictory", CONTRADICTORY_METADATA_RESULT],
    ["inverse-contradictory", INVERSE_CONTRADICTORY_METADATA_RESULT],
  ])("keeps %s assessment metadata on the visibility fallback path", (_name, auditResult) => {
    seedSavedAudit(auditResult);

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => {
          written += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.getByText(/Authority assessment incomplete - showing visibility fallback/i)).toBeInTheDocument();
    expect(screen.queryByText("AI Authority scorecard")).not.toBeInTheDocument();
    screen.getByText(/Open report \/ Save as PDF/i).click();
    expect(written).toContain("Assessment incomplete - visibility fallback");
    expect(written).not.toContain("<h2>AI Authority scorecard</h2>");
    expect(written).not.toContain("<h2>Prioritised actions</h2>");
  });

  it.each([
    ["outcome-only", OUTCOME_ONLY_RESULT, "Assessment outcome: legacy / unknown"],
    ["status-fallback/outcome-complete", INVERSE_CONTRADICTORY_METADATA_RESULT, "Assessment fallback: incomplete scoring response"],
  ])("does not label %s metadata complete in the saved list", (_name, auditResult, expectedLabel) => {
    seedSavedAudit(auditResult);
    render(<LlmCheckPage activeClient={CLIENT} />);

    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    expect(screen.queryByText("Assessment complete")).not.toBeInTheDocument();
  });

  it("openReport builds a printable report for a legacy audit without throwing", () => {
    seedSavedAudit(LEGACY_RESULT);

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => {
          written += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    const reportButton = screen.getByText(/Open report \/ Save as PDF/i);
    reportButton.click();

    expect(openSpy).toHaveBeenCalled();
    // The report renders the original visibility content and the brand name...
    expect(written).toContain("Acme Ltd");
    expect(written).toContain("Blind-probe evidence log");
    // ...but contains none of the assessment-only sections.
    expect(written).not.toContain("AI Authority scorecard");
    expect(written).not.toContain("Prioritised actions");
    expect(written).not.toContain("Per-query authority read");
    expect(written).toContain("Assessment incomplete - visibility fallback");
    expect(written).toContain("This is not the complete AI Authority Scorecard");
  });

  it("openReport includes the printable warning for a fallback assessment", () => {
    seedSavedAudit(FALLBACK_RESULT);

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => {
          written += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );
    screen.getByText(/Open report \/ Save as PDF/i).click();

    expect(written).toContain("Assessment incomplete - visibility fallback");
    expect(written).toContain("visibility evidence only");
    expect(written).not.toContain("<h2>AI Authority scorecard</h2>");
    expect(written).not.toContain("<h2>Prioritised actions</h2>");
  });

  it("openReport includes the assessment sections for a modern audit", () => {
    seedSavedAudit(MODERN_RESULT);

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => {
          written += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    screen.getByText(/Open report \/ Save as PDF/i).click();

    expect(written).toContain("AI Authority scorecard");
    expect(written).toContain("Prioritised actions");
    expect(written).toContain("Acme appears in some answers but trails Globex.");
  });

  it("renders the entity-clarity section in-page when the name is ambiguous", () => {
    seedSavedAudit(AMBIGUOUS_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.getByText(/Entity clarity:/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Entity clarity:/i));
    // It names the competing namesakes...
    expect(screen.getByText("Sinclair Media Group")).toBeInTheDocument();
    expect(screen.getByText("Scott Management Group")).toBeInTheDocument();
    // ...and explains the score impact (present but confused).
    expect(screen.getByText(/present but confused/i)).toBeInTheDocument();
  });

  it("omits the entity-clarity section when there is no entity-clarity data", () => {
    seedSavedAudit(MODERN_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    expect(screen.queryByText(/Entity clarity:/i)).not.toBeInTheDocument();
  });

  it("lets the user confirm their own company and persists it for the next audit", () => {
    seedSavedAudit(AMBIGUOUS_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    // Expand the entity-clarity section to reveal the confirmation prompt.
    fireEvent.click(screen.getByText(/Entity clarity:/i));

    // The confirmation prompt is shown for an ambiguous brand.
    expect(screen.getByText(/Which company is/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /our company, not the others listed/i }));

    // It is persisted into the active project's intake blob (namespaced key).
    const intake = JSON.parse(localStorage.getItem(`aio.intake.v2::${CLIENT.id}`) || "{}");
    expect(intake.confirmedEntity).toEqual({ name: "SMG", description: "" });

    // The UI now reflects the confirmed identity.
    expect(screen.getByText(/Confirmed:/i)).toBeInTheDocument();
  });

  it("lets the user override to one of the listed namesakes", () => {
    seedSavedAudit(AMBIGUOUS_RESULT);
    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    fireEvent.click(screen.getByText(/Entity clarity:/i));
    fireEvent.click(screen.getByRole("button", { name: /No, we are Sinclair Media Group/i }));

    const intake = JSON.parse(localStorage.getItem(`aio.intake.v2::${CLIENT.id}`) || "{}");
    expect(intake.confirmedEntity).toEqual({ name: "Sinclair Media Group", description: "a US broadcaster" });
  });

  it("openReport includes the entity-clarity section for an ambiguous audit", () => {
    seedSavedAudit(AMBIGUOUS_RESULT);

    let written = "";
    const fakeWindow = {
      document: {
        write: (html: string) => {
          written += html;
        },
        close: () => {},
      },
      focus: () => {},
      print: () => {},
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(fakeWindow);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    screen.getByText(/Open report \/ Save as PDF/i).click();

    expect(written).toContain("Entity clarity");
    expect(written).toContain("Sinclair Media Group");
    expect(written).toContain("Scott Management Group");
  });

  it("pushes the confirmed company to the shared store so it follows the user across devices", async () => {
    seedSavedAudit(AMBIGUOUS_RESULT);

    // Spy on every network call. The sync-on-open effect issues a GET for the
    // shared intake (nothing on the server yet); confirming must issue a POST
    // that mirrors the updated intake blob to the shared store.
    const fetchMock = vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "GET" && /\/api\/store\/projects\/[^/]+\/intake$/.test(url)) {
        return { ok: true, json: async () => ({ intake: null, updatedAt: null }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    fireEvent.click(screen.getByText(/Entity clarity:/i));
    fireEvent.click(screen.getByRole("button", { name: /our company, not the others listed/i }));

    // The choice is mirrored to the shared store, not just to localStorage, so it
    // follows the user to other devices and teammates on the same account.
    await waitFor(() => {
      const push = fetchMock.mock.calls.find(([url, init]) => {
        const u = String(url);
        const method = ((init as { method?: string } | undefined)?.method || "GET").toUpperCase();
        return method === "POST" && u.endsWith("/api/store/projects/intake");
      });
      expect(push).toBeTruthy();
      const body = JSON.parse((push![1] as { body: string }).body);
      expect(body.intake.confirmedEntity).toEqual({ name: "SMG", description: "" });
    });
  });

  it("clears the stale-score warning card when a newer saved audit exists for the same company", () => {
    const oldAffected: SavedAudit = {
      id: "audit-old",
      savedAt: "2025-01-15T11:00:00.000Z",
      result: {
        ...AMBIGUOUS_RESULT,
        checkedAt: "2025-01-15T10:00:00.000Z",
        visibilityScore: 5,
      } as SavedAudit["result"],
    };
    const freshRerun: SavedAudit = {
      id: "audit-new",
      savedAt: "2026-06-01T12:00:00.000Z",
      result: {
        ...AMBIGUOUS_RESULT,
        checkedAt: "2026-06-01T11:00:00.000Z",
        visibilityScore: 5,
        detectionVersion: 2,
      } as SavedAudit["result"],
    };
    localStorage.setItem(
      `aio.savedAudits.${CLIENT.id}`,
      JSON.stringify([freshRerun, oldAffected]),
    );

    render(<LlmCheckPage activeClient={CLIENT} />);

    const cards = document.querySelectorAll('[style*="border-color"]');
    expect(cards.length).toBeGreaterThan(0);

    expect(screen.queryByText(/Superseded by a newer run/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Score may understate real visibility/i),
    ).not.toBeInTheDocument();
  });

  it("does not show the stale-score warning banner for an audit that carries detectionVersion", () => {
    const freshAffected: SavedAudit = {
      id: "audit-fresh",
      savedAt: "2026-06-01T12:00:00.000Z",
      result: {
        ...AMBIGUOUS_RESULT,
        checkedAt: "2026-06-01T11:00:00.000Z",
        visibilityScore: 5,
        detectionVersion: 2,
      } as SavedAudit["result"],
    };
    localStorage.setItem(
      `aio.savedAudits.${CLIENT.id}`,
      JSON.stringify([freshAffected]),
    );

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-fresh" onConsumePending={() => {}} />,
    );

    expect(
      screen.queryByText(/This score may understate real visibility/i),
    ).not.toBeInTheDocument();
  });

  it("reflects a server-confirmed company on open even when this browser never stored it", async () => {
    seedSavedAudit(AMBIGUOUS_RESULT);
    // Make the open client the active project so the synced intake lands on the
    // key the page reads the confirmed identity back from.
    localStorage.setItem("aio.activeProjectId", CLIENT.id);

    // This browser has never confirmed an identity locally...
    expect(localStorage.getItem(`aio.intake.v2::${CLIENT.id}`)).toBeNull();

    // ...but the shared store holds one confirmed on another device / by a
    // teammate. The sync-on-open effect must pull it down and surface it here.
    const fetchMock = vi.fn(async (input: unknown, init?: { method?: string }) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (method === "GET" && /\/api\/store\/projects\/[^/]+\/intake$/.test(url)) {
        return {
          ok: true,
          json: async () => ({
            intake: { confirmedEntity: { name: "SMG", description: "" } },
            updatedAt: "2026-06-10T00:00:00.000Z",
          }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LlmCheckPage activeClient={CLIENT} pendingAuditId="audit-1" onConsumePending={() => {}} />,
    );

    // It ran the project sync (GET) for the open client...
    await waitFor(() => {
      const pulled = fetchMock.mock.calls.some(([url, init]) => {
        const u = String(url);
        const method = ((init as { method?: string } | undefined)?.method || "GET").toUpperCase();
        return method === "GET" && u.endsWith(`/api/store/projects/${CLIENT.id}/intake`);
      });
      expect(pulled).toBe(true);
    });

    // ...and now reflects the server-side confirmed identity even though it was
    // never in this browser's localStorage to begin with.
    const entityHeading = await screen.findByText(/Entity clarity:/i);
    fireEvent.click(entityHeading);
    const confirmedLine = await screen.findByText(/Confirmed:/i);
    expect(confirmedLine.textContent).toMatch(/is SMG/);

    // The pulled identity was cached locally for subsequent synchronous reads.
    await waitFor(() => {
      const cached = JSON.parse(localStorage.getItem(`aio.intake.v2::${CLIENT.id}`) || "{}");
      expect(cached.confirmedEntity).toEqual({ name: "SMG", description: "" });
    });
  });
});

function seedQueries(clientId: string, discovery: string[], shortlist: string[] = [], comparison: string[] = []) {
  localStorage.setItem("aio.activeProjectId", clientId);
  localStorage.setItem(`aio.intake.v2::${clientId}`, JSON.stringify({
    llmQueries: { v: 1, discovery, shortlist, comparison },
  }));
}

function sseAuditResponse(result = LEGACY_RESULT): Response {
  const chunks = [
    new TextEncoder().encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`),
  ];
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: chunks[0] })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      }),
    },
  } as unknown as Response;
}

function supportingResponse(url: string): Response {
  if (url.includes("/audit-lock")) {
    return { ok: true, json: async () => ({ locked: false }) } as unknown as Response;
  }
  if (url.includes("/intake")) {
    return { ok: true, json: async () => ({ intake: null, updatedAt: null }) } as unknown as Response;
  }
  if (url.includes("/audits")) {
    return { ok: true, json: async () => ({ audits: [] }) } as unknown as Response;
  }
  return { ok: true, json: async () => ({}) } as unknown as Response;
}

describe("LlmCheckPage canonical per-run query input", () => {
  beforeEach(() => {
    clearAiRuns();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearAiRuns();
  });

  it("runs the current grouped edits, not stale saved setup, in both request fields", async () => {
    seedQueries(CLIENT.id, ["Stale saved setup"]);
    let auditBody: Record<string, any> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: { body?: string }) => {
      const url = String(input);
      if (url.includes("/api/llm-check")) {
        auditBody = JSON.parse(init?.body || "{}");
        return sseAuditResponse();
      }
      return supportingResponse(url);
    }));

    render(<LlmCheckPage activeClient={CLIENT} />);
    fireEvent.click(screen.getByRole("button", { name: /Refine what we probe/i }));
    fireEvent.change(screen.getByDisplayValue("Stale saved setup"), {
      target: { value: "Current edited query" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Visibility Audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(auditBody).not.toBeNull());
    expect(auditBody!.targetPhrases).toEqual([
      expect.objectContaining({ text: "Current edited query", intentGroup: "discovery" }),
    ]);
    expect(auditBody!.projectData.buyerQuestions).toEqual(["Current edited query"]);
    expect(JSON.stringify(auditBody)).not.toContain("Stale saved setup");
  });

  it("preserves all oversized saved entries and blocks confirmation until reduced to 24", async () => {
    seedQueries(CLIENT.id, Array.from({ length: 25 }, (_, i) => `Saved query ${i + 1}`));
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => supportingResponse(String(input))));

    render(<LlmCheckPage activeClient={CLIENT} />);
    fireEvent.click(screen.getByRole("button", { name: /Refine what we probe/i }));

    expect(screen.getAllByPlaceholderText("Type a query...")).toHaveLength(25);
    expect(screen.getByText(/You have 25 queries\. Remove 1/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Visibility Audit" })).toBeDisabled();

    fireEvent.click(screen.getAllByTitle("Remove query")[0]);
    await waitFor(() => expect(screen.getAllByPlaceholderText("Type a query...")).toHaveLength(24));
    expect(screen.getByRole("button", { name: "Run Visibility Audit" })).toBeEnabled();
    expect(JSON.parse(localStorage.getItem(`aio.intake.v2::${CLIENT.id}`) || "{}").llmQueries.discovery)
      .toHaveLength(25);
  });

  it("keeps add/remove/regeneration per-run and sends regenerated canonical phrases without persisting them", async () => {
    seedQueries(CLIENT.id, ["Saved one"]);
    let auditBody: Record<string, any> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: { body?: string }) => {
      const url = String(input);
      if (url.includes("/api/content/llm-queries")) {
        return {
          ok: true,
          json: async () => ({
            discovery: ["Generated", " generated  ", ""],
            shortlist: ["Generated"],
            comparison: [],
          }),
        } as unknown as Response;
      }
      if (url.includes("/api/llm-check")) {
        auditBody = JSON.parse(init?.body || "{}");
        return sseAuditResponse();
      }
      return supportingResponse(url);
    }));

    render(<LlmCheckPage activeClient={CLIENT} />);
    fireEvent.click(screen.getByRole("button", { name: /Refine what we probe/i }));
    fireEvent.click(screen.getAllByText("Add query")[0]);
    expect(screen.getAllByPlaceholderText("Type a query...")).toHaveLength(2);
    fireEvent.click(screen.getAllByTitle("Remove query")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Regenerate queries" }));

    await screen.findAllByDisplayValue("Generated");
    expect(screen.getAllByPlaceholderText("Type a query...")).toHaveLength(4);
    expect(JSON.parse(localStorage.getItem(`aio.intake.v2::${CLIENT.id}`) || "{}").llmQueries.discovery)
      .toEqual(["Saved one"]);

    fireEvent.click(screen.getByRole("button", { name: "Run Visibility Audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(auditBody).not.toBeNull());
    expect(auditBody!.targetPhrases).toHaveLength(2);
    expect(auditBody!.projectData.buyerQuestions).toEqual(["Generated", "Generated"]);
  });

  it("ignores a generation response that resolves after switching projects", async () => {
    const second = { id: "client-2", name: "Beta Ltd", sector: "Technology" };
    seedQueries(CLIENT.id, ["Client one query"]);
    seedQueries(second.id, ["Client two query"]);
    localStorage.setItem("aio.activeProjectId", CLIENT.id);
    let resolveGeneration!: (value: Response) => void;
    const pendingGeneration = new Promise<Response>((resolve) => { resolveGeneration = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/api/content/llm-queries")) return pendingGeneration;
      return supportingResponse(url);
    }));

    const view = render(<LlmCheckPage activeClient={CLIENT} sessionId="person" workspaceId="workspace" />);
    fireEvent.click(screen.getByRole("button", { name: /Refine what we probe/i }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate queries" }));
    view.rerender(<LlmCheckPage activeClient={second} sessionId="person" workspaceId="workspace" />);
    await screen.findByDisplayValue("Client two query");

    resolveGeneration({
      ok: true,
      json: async () => ({ discovery: ["Late client one result"], shortlist: [], comparison: [] }),
    } as unknown as Response);
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByDisplayValue("Client two query")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Late client one result")).not.toBeInTheDocument();
  });

  it("ignores an audit stream that finishes after switching projects", async () => {
    const second = { id: "client-2", name: "Beta Ltd", sector: "Technology" };
    seedQueries(CLIENT.id, ["Client one query"]);
    seedQueries(second.id, ["Client two query"]);
    localStorage.setItem("aio.activeProjectId", CLIENT.id);
    let resolveRead!: (value: { done: boolean; value?: Uint8Array }) => void;
    const pendingRead = new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => { resolveRead = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/api/llm-check")) {
        let reads = 0;
        return {
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: () => reads++ === 0 ? pendingRead : Promise.resolve({ done: true }),
            }),
          },
        } as unknown as Response;
      }
      return supportingResponse(url);
    }));

    const view = render(<LlmCheckPage activeClient={CLIENT} sessionId="person" workspaceId="workspace" />);
    fireEvent.click(screen.getByRole("button", { name: "Run Visibility Audit" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    view.rerender(<LlmCheckPage activeClient={second} sessionId="person" workspaceId="workspace" />);
    await screen.findByDisplayValue("Beta Ltd");

    resolveRead({
      done: false,
      value: new TextEncoder().encode(`event: result\ndata: ${JSON.stringify(LEGACY_RESULT)}\n\n`),
    });
    await waitFor(() => {
      expect(screen.queryByText("Detailed probe results")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Run Visibility Audit" })).toBeEnabled();
    });
    expect(JSON.parse(localStorage.getItem(`aio.savedAudits.${second.id}`) || "[]")).toEqual([]);
    expect(JSON.parse(localStorage.getItem(`aio.savedAudits.${CLIENT.id}`) || "[]")).toHaveLength(1);
  });
});

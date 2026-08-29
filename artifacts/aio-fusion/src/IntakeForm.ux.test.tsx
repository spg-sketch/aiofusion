import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import IntakePage from "./IntakeForm";

vi.mock("./lib/projectSync", () => ({
  markIntakeSaved: vi.fn(),
  ensureDefaultIntakeMigrated: vi.fn(),
  assertActiveProjectConsistencyFromCache: vi.fn(),
}));

vi.mock("./lib/auditTiming", () => ({
  recordAuditDuration: vi.fn(),
  getAuditDurationSeconds: vi.fn(() => 60),
  getAuditSampleCount: vi.fn(() => 0),
  getTypicalDurationHint: vi.fn(() => ""),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function openAioTrack() {
  fireEvent.click(screen.getByRole("button", { name: /AIO Set-Up Business Profile/i }));
}

describe("Project Set-Up completion guidance", () => {
  it("names missing answers and jumps directly to the selected field", async () => {
    render(<IntakePage />);

    openAioTrack();
    const remainingSummaries = screen.getAllByText(/required answers remaining/i);
    fireEvent.click(remainingSummaries[remainingSummaries.length - 1]);

    fireEvent.click(screen.getByRole("button", {
      name: /Section 6.*AI crawler access via robots\.txt/i,
    }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Schema Markup & Technical Signals" })).toBeInTheDocument();
    });
    expect(screen.getByText("AI crawler access via robots.txt")).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute("id", "intake-field-6.5");
  });

  it("prevents an eleventh priority customer question and explains the limit", async () => {
    render(<IntakePage />);

    openAioTrack();
    fireEvent.click(screen.getByRole("button", { name: /^Next/i }));

    const questionBox = await screen.findByLabelText("Top 10 priority customer questions before buying");
    const tenQuestions = Array.from({ length: 10 }, (_, index) => `Question ${index + 1}?`).join("\n");
    fireEvent.change(questionBox, { target: { value: tenQuestions } });
    expect(screen.getByText("10 of 10")).toBeInTheDocument();

    fireEvent.keyDown(questionBox, { key: "Enter" });
    fireEvent.change(questionBox, { target: { value: `${tenQuestions}Question 11?` } });
    expect(questionBox).toHaveValue(tenQuestions);
    expect(screen.getByText(/You can add up to 10 questions.*Remove or edit an existing question/i)).toBeInTheDocument();
    expect(questionBox).toHaveAttribute("aria-invalid", "true");
  });

  it("explains what sign-off saved and that incomplete answers can still be edited", () => {
    render(<IntakePage />);

    fireEvent.click(screen.getByRole("button", { name: /Accept & Sign Off/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/Project Set-Up signed off on/i);
    expect(screen.getByRole("status")).toHaveTextContent(/saved to the Project Data archive/i);
    expect(screen.getByRole("status")).toHaveTextContent(/continue editing this Set-Up/i);
    expect(screen.getByRole("status")).toHaveTextContent(/required answers are still incomplete/i);
    expect(screen.getByRole("button", { name: /Go to first missing answer/i })).toBeInTheDocument();
  });

  it("marks Section 6 copy as guidance and explains editable pre-filled headings", async () => {
    render(<IntakePage />);

    openAioTrack();
    fireEvent.click(screen.getByRole("button", { name: /^Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Next/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Schema Markup & Technical Signals" })).toBeInTheDocument();
    });
    expect(screen.getByText("About this section")).toBeInTheDocument();
    expect(screen.getByText("Page Heading Review")).toBeInTheDocument();
    expect(screen.getByText(/Review and edit any pre-filled content/i)).toBeInTheDocument();
    expect(screen.getByText(/equivalent registry in your country/i)).toBeInTheDocument();
  });
});
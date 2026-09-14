// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SeoAuditPage from "./SeoAuditPage";

vi.mock("./lib/apiHelpers", () => ({
  downloadWordDocument: vi.fn(),
}));

const client = { id: "seo-a11y-test", name: "Accessibility test" };

const result = {
  url: "https://example.test",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  scores: {
    overall: 76,
    meta: 80,
    headings: 70,
    schema: 65,
    links: 75,
    images: 80,
    aiReadiness: 72,
    performance: 68,
  },
  meta: [{ label: "Title", value: "Present", status: "pass" as const }],
  headings: [],
  schema: [],
  links: { findings: [], internal: [], external: [], inboundIndicators: [] },
  images: [],
  aiReadiness: [],
  performance: [],
  recommendations: [],
};

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

function installFetchStub(response: Response | null = jsonResponse(result)) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/seo-audit")) {
        if (!response) return new Promise<Response>(() => {});
        return response;
      }
      if (url.includes("/api/store/projects/") && url.endsWith("/tech-geo")) {
        return jsonResponse({ "tech-geo": [] });
      }
      return jsonResponse({});
    }),
  );
}

function renderPage() {
  return render(<SeoAuditPage activeClient={client} />);
}

describe("SeoAuditPage accessibility", () => {
  beforeEach(() => {
    localStorage.clear();
    installFetchStub();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("associates the URL label and description with the input", () => {
    renderPage();

    const input = screen.getByLabelText("Website URL to audit");
    expect(input).toHaveAttribute("id", "seo-audit-url");
    expect(input).toHaveAttribute("aria-describedby", "seo-audit-url-description");
    expect(screen.getByText("Enter the full website URL you want to audit.")).toHaveAttribute(
      "id",
      "seo-audit-url-description",
    );
  });

  it("exposes stable disclosure state and supports keyboard-triggered audits", async () => {
    renderPage();
    const input = screen.getByLabelText("Website URL to audit");
    fireEvent.change(input, { target: { value: "https://example.test" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    const completion = await screen.findByRole("status");
    expect(completion).toHaveTextContent("Website audit complete");
    const headingToggle = await screen.findByRole("button", { name: /Heading Structure/ });
    expect(headingToggle).toHaveAttribute("aria-expanded", "false");
    expect(headingToggle).toHaveAttribute("aria-controls", "seo-audit-headings-content");
    expect(document.getElementById("seo-audit-headings-content")).toBeNull();

    fireEvent.click(headingToggle);
    expect(headingToggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("seo-audit-headings-content")).toHaveAttribute(
      "aria-labelledby",
      "seo-audit-headings-toggle",
    );
  });

  it("announces audit progress once and exposes API errors assertively", async () => {
    let resolveAudit!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes("/api/seo-audit")) {
          return new Promise<Response>((resolve) => {
            resolveAudit = resolve;
          });
        }
        if (String(input).includes("/api/store/projects/") && String(input).endsWith("/tech-geo")) {
          return Promise.resolve(jsonResponse({ "tech-geo": [] }));
        }
        return Promise.resolve(jsonResponse({}));
      }),
    );

    renderPage();
    const input = screen.getByLabelText("Website URL to audit");
    fireEvent.change(input, { target: { value: "https://bad.example" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    const progress = await screen.findByRole("status");
    expect(progress).toHaveTextContent("Website audit started");
    expect(progress).toHaveTextContent("in progress");

    resolveAudit(jsonResponse({ error: "The site could not be reached." }, 502));
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("The site could not be reached.");
    expect(error).toHaveAttribute("aria-live", "assertive");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "seo-audit-url-description seo-audit-url-error",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecommendationCard, type Recommendation } from "./JournalistComponents";

afterEach(cleanup);

function recommendation(): Recommendation {
  return {
    rank: 1,
    score: 59,
    reasons: ["Hidden ranking explanation"],
    contact: {
      id: 1, outletId: 2, accountId: null,
      firstName: "Alex", lastName: "Example", role: "Editor",
      email: "alex@example.test", phone: "+44 0000",
      linkedinUrl: "https://www.linkedin.com/in/alex-example",
      notes: "Hidden imported notes",
      outletName: "Example Publication", outletCategory: "Technology",
      outletCountry: "UK", geography: "Europe",
      outletWebsite: "https://publication.example.test",
      publicationReach: "91", publicationAuthority: 42,
      sourceRef: "Hidden imported provenance",
      beats: ["Hidden beat"], sectors: ["Hidden contact sector"],
    },
    assessment: {
      version: "editorial-v1", fitScore: 60, confidence: "low",
      evidenceCoverage: 20, factors: [],
      readiness: { status: "needs_check", reasons: ["Hidden readiness reason"] },
      evidence: [{ title: "Hidden source title", url: "https://source.example.test", publishedAt: null, checkedAt: "2026-10-01", excerpt: "Hidden source excerpt", attribution: "page_checked", authorMatched: true }],
      warnings: ["Hidden evidence warning"],
      suggestedAngle: "How practical technology changes everyday work.",
    },
  };
}

describe("Media Research-only result summary", () => {
  it.each([false, true])("shows only the requested result information (shortlist: %s)", (isShortlist) => {
    render(<RecommendationCard item={recommendation()} researchSummary isShortlist={isShortlist} />);
    const result = screen.getByTestId("research-result-summary-1");
    const scoped = within(result);
    expect(scoped.getByRole("heading", { name: "Alex Example" })).toBeTruthy();
    expect(scoped.getByRole("link", { name: "LinkedIn profile for Alex Example" }).getAttribute("href")).toContain("linkedin.com/in/alex-example");
    for (const label of ["Job role", "Publication", "Publication sector", "Region", "Email address", "Publication website", "Source reach (imported)", "Editorial fit", "Suggested pitch angle:"]) {
      expect(scoped.getByText(label)).toBeTruthy();
    }
    for (const value of ["Editor", "Example Publication", "Technology", "Europe", "91", "60%"]) {
      expect(scoped.getByText(value)).toBeTruthy();
    }
    expect(scoped.getByRole("link", { name: "alex@example.test" }).getAttribute("href")).toBe("mailto:alex@example.test");
    expect(scoped.getByRole("link", { name: "https://publication.example.test" }).getAttribute("href")).toBe("https://publication.example.test/");
    expect(scoped.getByText(/How practical technology/)).toBeTruthy();
    expect(result.querySelector("svg circle")).toBeTruthy();
    expect(scoped.getByText("Source reach (imported)").getAttribute("title")).toContain("not a measured AI Authority score");
    for (const hidden of ["Why this matches", "Evidence confidence:", "Contact readiness:", "Evidence and contact checks", "Notes", "Hidden ranking explanation", "Hidden imported notes", "Hidden source title", "Hidden source excerpt", "Hidden imported provenance", "Hidden beat", "Hidden contact sector", "Publication authority:", "Match Score"]) {
      expect(screen.queryByText(hidden, { exact: false })).toBeNull();
    }
  });

  it("does not change the detailed Media Database presentation", () => {
    render(<RecommendationCard item={recommendation()} compact />);
    expect(screen.queryByTestId("research-result-summary-1")).toBeNull();
    expect(screen.getByText("Why this matches")).toBeTruthy();
    expect(screen.getByText("Evidence and contact checks")).toBeTruthy();
    expect(screen.getByText("Hidden imported notes")).toBeTruthy();
  });

  it("retains the database save, story planning, and restriction actions", () => {
    const save = vi.fn(), plan = vi.fn(), restrict = vi.fn();
    render(<RecommendationCard item={recommendation()} researchSummary compact onSaveToDatabase={save} onAccept={plan} onToggleRestriction={restrict} />);
    fireEvent.click(screen.getByRole("button", { name: "Save to My Media Database" }));
    fireEvent.click(screen.getByRole("button", { name: "Plan outreach for this story" }));
    fireEvent.click(screen.getByRole("button", { name: "Do not contact" }));
    expect(save).toHaveBeenCalledOnce();
    expect(plan).toHaveBeenCalledOnce();
    expect(restrict).toHaveBeenCalledWith(1, true);
  });

  it("keeps do-not-contact protection visible and outreach disabled", () => {
    render(<RecommendationCard item={{ ...recommendation(), restricted: true }} researchSummary compact onAccept={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("Do not contact");
    expect(screen.getByRole("button", { name: "Outreach blocked - do not contact" })).toBeDisabled();
  });

  it("does not turn the legacy match or imported reach value into an authority or editorial score", () => {
    const item = recommendation();
    delete item.assessment;
    render(<RecommendationCard item={item} researchSummary />);
    expect(screen.getByText("Not assessed")).toBeTruthy();
    expect(screen.getByText("91")).toBeTruthy();
    expect(screen.queryByText("59%")).toBeNull();
    expect(screen.queryByText("91%")).toBeNull();
    expect(screen.queryByText(/AI authority score:/i)).toBeNull();
  });

  it("preserves a genuine zero editorial fit and zero reach value", () => {
    const item = recommendation();
    item.assessment!.fitScore = 0;
    item.contact.publicationReach = "0";
    render(<RecommendationCard item={item} researchSummary />);
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.queryByText("Not assessed")).toBeNull();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("handles missing data and rejects unsafe links without inventing replacements", () => {
    const item = recommendation();
    item.contact.firstName = "";
    item.contact.lastName = "";
    item.contact.email = "not an email";
    item.contact.linkedinUrl = "javascript:alert(1)";
    item.contact.outletWebsite = "javascript:alert(1)";
    delete item.contact.geography;
    item.assessment!.fitScore = null;
    render(<RecommendationCard item={item} researchSummary />);
    expect(screen.getByRole("heading", { name: "Contact name not recorded" })).toBeTruthy();
    expect(screen.getByText("UK")).toBeTruthy();
    expect(screen.getByText("not an email")).toBeTruthy();
    expect(screen.getByText("Not assessed")).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("restores a recorded pitch suggestion when an older assessment has no angle", () => {
    const item = recommendation();
    item.assessment!.suggestedAngle = null;
    item.contact.mediaOpportunities = [{ title: "Recorded opportunity", angle: "A specialist angle for this story." }];
    render(<RecommendationCard item={item} researchSummary />);
    expect(screen.getByText(/A specialist angle for this story/)).toBeTruthy();
  });
});
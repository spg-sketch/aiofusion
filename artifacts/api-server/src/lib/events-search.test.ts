import { describe, expect, it } from "vitest";
import { canonicalEventUrl, dateAppearsOnPage, deadlineAppearsOnPage, eventNameAppearsOnPage, normaliseEventResults, regionAppearsOnPage } from "./events-search";

const NOW = new Date("2026-09-08T12:00:00.000Z");

function event(overrides: Record<string, unknown> = {}) {
  return {
    name: "Future of Energy Summit",
    url: "https://events.example.com/energy?utm_source=test",
    category: "Energy",
    startDate: "2026-11-12",
    endDate: "2026-11-13",
    audience: "Energy leaders",
    titleDescription: "An annual industry summit",
    location: "London, United Kingdom",
    authority: 82,
    relevanceReason: "Matches the selected energy category.",
    opportunities: [{ type: "Speaker", cost: "Not published", deadline: "2026-10-01" }],
    ...overrides,
  };
}

describe("event result validation", () => {
  it("keeps cited, in-range events and normalises actionable deadlines", () => {
    const results = normaliseEventResults([event()], {
      marketingTypes: ["Trade Speaker"],
      categories: ["Energy"],
      period: "6m",
      region: "UK",
      citations: ["https://events.example.com/energy"],
      now: NOW,
    });
    expect(results).toHaveLength(1);
    expect(results[0].opportunities[0].actionable).toBe(true);
    expect(results[0].confirmStatus).toBe("C");
  });

  it("drops stale, wrong-region, uncited, duplicate and category-mismatched results", () => {
    const results = normaliseEventResults([
      event({ startDate: "2026-01-01", endDate: "2026-01-02" }),
      event({ url: "https://events.example.com/us", location: "New York, United States" }),
      event({ url: "https://events.example.com/uncited" }),
      event({ category: "Finance" }),
      event(),
      event({ url: "https://events.example.com/energy-copy" }),
    ], {
      marketingTypes: ["Trade Speaker"],
      categories: ["Energy"],
      period: "6m",
      region: "UK",
      citations: ["https://events.example.com/energy"],
      now: NOW,
    });
    expect(results.map((item) => item.name)).toEqual(["Future of Energy Summit"]);
  });

  it("requires meaningful event-name evidence on the fetched page", () => {
    expect(eventNameAppearsOnPage("Future of Energy Summit", "Welcome to the Future of Energy programme")).toBe(true);
    expect(eventNameAppearsOnPage("Future of Energy Summit", "A generic events directory")).toBe(false);
  });

  it("canonicalises tracking parameters", () => {
    expect(canonicalEventUrl("https://Events.Example.com/energy/?utm_campaign=x")).toBe("https://events.example.com/energy");
  });

  it("recognises common published-date formats", () => {
    expect(dateAppearsOnPage("2026-11-12", "Join us on 12 November 2026 in London")).toBe(true);
    expect(dateAppearsOnPage("2026-11-12", "Dates will be announced soon")).toBe(false);
  });

  it("requires deadline context before treating a date as a submission deadline", () => {
    expect(deadlineAppearsOnPage("2026-10-01", "Speaker proposals must submit by 1 October 2026.")).toBe(true);
    expect(deadlineAppearsOnPage("2026-10-01", "The conference opens on 1 October 2026.")).toBe(false);
    expect(deadlineAppearsOnPage("2026-10-01", "Submissions open 1 October 2026.")).toBe(false);
    expect(deadlineAppearsOnPage("2026-10-01", "Submissions open 1 October 2026. The deadline is 15 December 2026.")).toBe(false);
    expect(deadlineAppearsOnPage("2026-12-15", "Submissions open 1 October 2026. The deadline is 15 December 2026.")).toBe(true);
  });

  it("requires the selected region to appear on the fetched page", () => {
    expect(regionAppearsOnPage("UK", "Join us at ExCeL London in 2026.")).toBe(true);
    expect(regionAppearsOnPage("NA", "The event takes place in Toronto, Canada.")).toBe(true);
    expect(regionAppearsOnPage("UK", "The event takes place in Berlin, Germany.")).toBe(false);
    expect(regionAppearsOnPage("NA", "Join us for an online event hosted from Berlin.")).toBe(false);
  });
});
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/contentAi", () => ({ apiBase: () => "" }));

import { MediaOutreachPanel } from "./MediaOutreachPanel";

const contact = {
  id: 41,
  firstName: "Jane",
  lastName: "Reporter",
  role: "Energy editor",
  email: "jane@example.com",
  phone: "",
  notes: "",
  outletName: "Energy Daily",
  outletWebsite: "https://energy.example",
} as never;

const plannedRow = {
  id: 7,
  contactId: 41,
  status: "planned",
  pitchDate: null,
  responseDate: null,
  notes: "",
  responsibleTeamMember: "",
  contactSnapshot: { name: "Jane Reporter", role: "Energy editor", email: "jane@example.com" },
  outletSnapshot: { name: "Energy Daily", website: "https://energy.example" },
  targetPhrases: [],
  placements: [],
};

let rows: Record<string, unknown>[] = [];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("MediaOutreachPanel", () => {
  beforeEach(() => {
    rows = [{ ...plannedRow }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/store/media-db/outreach?")) return response({ outreach: rows });
      if (url.includes("/store/media-db/outreach/7") && init?.method === "PUT") {
        const patch = JSON.parse(String(init.body)) as Record<string, string>;
        rows = [{ ...rows[0], ...patch }];
        return response({ ok: true, outreach: rows[0] });
      }
      if (url.includes("/store/media-db/outreach/7/placements") && init?.method === "POST") {
        const placement = JSON.parse(String(init.body));
        rows = [{ ...rows[0], status: "placed", placements: [{ id: 22, ...placement, verification: "user_claimed" }] }];
        return response({ ok: true, placement }, 201);
      }
      return response({ error: "not found" }, 404);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("includes the latest date input when moving to pitched", async () => {
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    const status = await screen.findByRole("combobox", { name: "Outreach status" });
    fireEvent.change(screen.getByLabelText("Pitch date"), { target: { value: "2026-09-01" } });
    fireEvent.change(status, { target: { value: "pitched" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/store/media-db/outreach/7"),
      expect.objectContaining({ method: "PUT", body: expect.stringContaining('"status":"pitched"') }),
    ));
    const call = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input).includes("/outreach/7") && init?.method === "PUT");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ status: "pitched", pitchDate: "2026-09-01" });
  });

  it("requires all placement evidence before allowing a placement save", async () => {
    rows = [{ ...plannedRow, status: "accepted" }];
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: /record placement/i }));
    const save = screen.getByRole("button", { name: "Save placement" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Canonical URL"), { target: { value: "https://energy.example/story" } });
    fireEvent.change(screen.getByLabelText("Publication date"), { target: { value: "2026-09-03" } });
    fireEvent.change(screen.getByLabelText("Placement headline"), { target: { value: "Energy transition story" } });
    fireEvent.change(screen.getByLabelText("Supporting evidence"), { target: { value: "The article names the company." } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/outreach/7/placements"),
      expect.objectContaining({ method: "POST" }),
    ));
    const call = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input).includes("/outreach/7/placements") && init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      canonicalUrl: "https://energy.example/story",
      publicationDate: "2026-09-03",
      supportingEvidence: "The article names the company.",
    });
  });
});
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
let mutationFailure = "";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("MediaOutreachPanel", () => {
  beforeEach(() => {
    rows = [{ ...plannedRow }];
    mutationFailure = "";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/store/media-db/outreach?")) return response({ outreach: rows });
      if (url.endsWith("/store/media-db/outreach/7") && init?.method === "DELETE") {
        if (mutationFailure) return response({ error: mutationFailure }, 500);
        rows = rows.filter((row) => row.id !== 7);
        return response({ ok: true });
      }
      if (url.endsWith("/store/media-db/outreach") && init?.method === "POST") {
        if (mutationFailure) return response({ error: mutationFailure }, 500);
        rows = [{ ...plannedRow }];
        return response({ ok: true, outreach: rows[0] }, 201);
      }
      if (url.includes("/store/media-db/outreach/7") && init?.method === "PUT") {
        if (mutationFailure) return response({ error: mutationFailure }, 500);
        const patch = JSON.parse(String(init.body)) as Record<string, string>;
        rows = [{ ...rows[0], ...patch }];
        return response({ ok: true, outreach: rows[0] });
      }
      if (url.includes("/store/media-db/outreach/7/placements") && init?.method === "POST") {
        if (mutationFailure) return response({ error: mutationFailure }, 500);
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
    expect(await screen.findByRole("status")).toHaveTextContent("Outreach status saved as pitched.");
  });

  it("confirms removal of only the selected journalist and persists it after reopening", async () => {
    rows.push({ ...plannedRow, id: 8, contactId: 42, contactSnapshot: { ...plannedRow.contactSnapshot, name: "Other Reporter" } });
    const view = render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Jane Reporter from outreach and placements" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("saved notes and placement evidence will be retained");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Jane Reporter from outreach and placements" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove Jane Reporter from outreach and placements" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remove Other Reporter from outreach and placements" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/store/media-db/outreach/7", expect.objectContaining({
      method: "DELETE", credentials: "include", body: JSON.stringify({ projectId: "project-1", storyKey: "story-1" }),
    }));
    expect(screen.getByRole("button", { name: "Plan outreach to Jane Reporter" })).toBeEnabled();
    view.unmount();
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    await screen.findByRole("button", { name: "Remove Other Reporter from outreach and placements" });
    expect(screen.queryByRole("button", { name: "Remove Jane Reporter from outreach and placements" })).not.toBeInTheDocument();
  });

  it("keeps the journalist and permits retry when removal fails", async () => {
    mutationFailure = "Could not remove this journalist.";
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Jane Reporter from outreach and placements" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(mutationFailure);
    expect(screen.getByRole("button", { name: "Remove Jane Reporter from outreach and placements" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Confirm removal" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    mutationFailure = "";
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Jane Reporter removed");
  });

  it("explains that planning is optional, does not send a pitch, and saves the plan only on success", async () => {
    rows = [];
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    expect(await screen.findByText(/Planning is optional and does not send a pitch/)).toBeInTheDocument();
    expect(screen.getByText(/No outreach has been planned.*This is optional/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Plan outreach to Jane Reporter/i }));
    expect(await screen.findByRole("status")).toHaveTextContent("Outreach planned for Jane Reporter.");
    expect(screen.getByRole("status")).toHaveTextContent("Saved for this project and article.");
  });

  it("shows a date and notes save confirmation after successful updates", async () => {
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    const pitchDate = await screen.findByLabelText("Pitch date");
    fireEvent.change(pitchDate, { target: { value: "2026-09-01" } });
    fireEvent.blur(pitchDate);
    expect(await screen.findByRole("status")).toHaveTextContent("Pitch date saved.");

    const notes = await screen.findByLabelText("Notes");
    fireEvent.change(notes, { target: { value: "Follow up next week" } });
    fireEvent.blur(notes);
    expect(await screen.findByRole("status")).toHaveTextContent("Notes saved.");
    await waitFor(() => expect(rows[0]).toMatchObject({ pitchDate: "2026-09-01", notes: "Follow up next week" }));
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
    expect(await screen.findByRole("status")).toHaveTextContent("Placement saved for this project and article.");
  });

  it("keeps mutation errors visible without announcing a save", async () => {
    mutationFailure = "Server could not save this update.";
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    const notes = await screen.findByLabelText("Notes");
    fireEvent.change(notes, { target: { value: "Unconfirmed note" } });
    fireEvent.blur(notes);

    expect(await screen.findByRole("alert")).toHaveTextContent("Server could not save this update.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not announce that outreach was planned when planning fails", async () => {
    mutationFailure = "Planning was rejected.";
    rows = [];
    render(<MediaOutreachPanel projectId="project-1" storyKey="story-1" articleTitle="Story" contacts={[contact]} targetPhrases={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: /Plan outreach to Jane Reporter/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Planning was rejected.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
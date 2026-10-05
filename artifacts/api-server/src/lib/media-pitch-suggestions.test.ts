import { describe, expect, it } from "vitest";
import { currentMediaPitch, mediaPitchContextHash, mediaPitchReference, type MediaPitchContext } from "./media-pitch-suggestions";

const context: MediaPitchContext = {
  article: { title: "Energy storage launch", bodyCopy: "The new service schedules battery dispatch in commercial buildings." },
  brief: { topic: "Commercial energy", angle: "Lower peak demand" },
  contact: { firstName: "Synthetic", lastName: "Editor", role: "Energy editor", beats: ["energy"], sectors: ["Energy"], email: "not-for-provider@example.test", phone: "private-route", notes: "Private imported note" },
  outlet: { name: "Synthetic Energy Daily", category: "Energy", country: "UK" },
};

describe("pitch suggestion provenance and stale-context protection", () => {
  it("sends editorial reference data without private contact routes or imported notes", () => {
    const reference = JSON.stringify(mediaPitchReference(context));
    expect(reference).toContain("battery dispatch");
    expect(reference).not.toContain("not-for-provider");
    expect(reference).not.toContain("private-route");
    expect(reference).not.toContain("Private imported note");
  });
  it("only accepts a server-owned saved suggestion for exactly the same context", () => {
    const pitch = { angle: "Propose a practical briefing on battery scheduling for building managers.", contextHash: mediaPitchContextHash(context), generatedAt: "2026-10-05T00:00:00Z", kind: "ai-suggestion" };
    expect(currentMediaPitch(pitch, context)).toEqual(pitch);
    expect(currentMediaPitch({ ...pitch, kind: "page-checked" }, context)).toBeUndefined();
    expect(currentMediaPitch(pitch, { ...context, brief: { topic: "Grid finance" } })).toBeUndefined();
    expect(currentMediaPitch(pitch, { ...context, contact: { ...context.contact, beats: ["finance"] } })).toBeUndefined();
    expect(currentMediaPitch(pitch, { ...context, outlet: { ...context.outlet, name: "A different publication" } })).toBeUndefined();
  });
  it("invalidates edits beyond the provider's bounded article excerpt", () => {
    const original = { ...context, article: { bodyCopy: `${"x".repeat(11000)}original` } };
    const edited = { ...context, article: { bodyCopy: `${"x".repeat(11000)}changed` } };
    expect(mediaPitchReference(original).article.text).toEqual(mediaPitchReference(edited).article.text);
    expect(mediaPitchContextHash(original)).not.toEqual(mediaPitchContextHash(edited));
  });
});

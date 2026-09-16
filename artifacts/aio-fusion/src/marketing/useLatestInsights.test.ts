import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicInsight } from "./InsightsPage";
import { latestPublishedInsights, useLatestInsights } from "./useLatestInsights";

const article = (id: string, datePublished: string, status = "published") =>
  ({ id, datePublished, status, title: id, slug: id, pinned: false } as PublicInsight);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  globalThis.__AIO_PRERENDER_INSIGHTS__ = undefined;
});

describe("homepage latest articles", () => {
  it("selects only the latest three published articles without mutating input", () => {
    const rows = [
      article("old", "2026-01-01"), article("new", "2026-09-16"),
      article("draft", "2026-09-17", "draft"), article("second", "2026-09-15"),
      article("third", "2026-09-14"),
    ];
    expect(latestPublishedInsights(rows).map((row) => row.id)).toEqual(["new", "second", "third"]);
    expect(rows[0].id).toBe("old");
  });

  it("puts pinned published stories first, newest pinned story first, then fills with latest unpinned stories", () => {
    const rows = [
      article("latest-unpinned", "2026-09-18"),
      { ...article("older-pinned", "2026-09-01"), pinned: true },
      { ...article("newer-pinned", "2026-09-10"), pinned: true },
      article("middle-unpinned", "2026-09-17"),
      { ...article("draft-pinned", "2026-09-19", "draft"), pinned: true },
    ];

    expect(latestPublishedInsights(rows).map((row) => row.id)).toEqual([
      "newer-pinned",
      "older-pinned",
      "latest-unpinned",
    ]);
  });

  it("replaces a build snapshot with CMS data and clears cards after unpublishing all", async () => {
    globalThis.__AIO_PRERENDER_INSIGHTS__ = [article("snapshot", "2026-01-01")];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [article("cms", "2026-09-16")] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLatestInsights());
    await waitFor(() => expect(result.current.articles[0]?.id).toBe("cms"));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.articles).toEqual([]));
    expect(result.current.error).toBe(false);
  });

  it("shows an explicit failure rather than inventing fallback articles", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { result } = renderHook(() => useLatestInsights());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.articles).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
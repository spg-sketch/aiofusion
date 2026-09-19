// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const intake = vi.hoisted(() => ({
  value: {
    formData: { "1.9": "  Energy   Media, Technology " },
    businessCategories: ["Legacy business"],
    audienceCategories: ["Customer only"],
  } as Record<string, unknown>,
}));
const context = vi.hoisted(() => ({ projectId: "project-1", workspaceId: "workspace-1" }));

vi.mock("../IntakeForm", () => ({
  loadIntakeData: () => intake.value,
  getActiveProjectId: () => context.projectId,
}));
vi.mock("./auth", () => ({ getSession: () => ({ username: context.workspaceId }) }));

import {
  DATABASE_CATEGORY_TIMEOUT_MS,
  getFreshCategoryDefaults,
  normaliseCategory,
  useDatabaseCategories,
  validDatabaseCategories,
} from "./databaseCategories";

describe("database category validation", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    context.projectId = "project-1";
    context.workspaceId = "workspace-1";
    intake.value = {
      formData: { "1.9": "  Energy   Media, Technology " },
      businessCategories: ["Legacy business"],
      audienceCategories: ["Customer only"],
    };
  });

  it("matches case and whitespace but retains server display labels", () => {
    expect(normaliseCategory("  ENERGY   media ")).toBe("energy media");
    expect(validDatabaseCategories([" energy   media ", "TECHNOLOGY", "Not in DB"], ["Energy Media", "Technology"]))
      .toEqual(["Energy Media", "Technology"]);
  });

  it("uses explicit section 1.9 and never audience categories", () => {
    expect(getFreshCategoryDefaults()).toEqual(["  Energy   Media", " Technology "]);
    intake.value = { formData: {}, businessCategories: ["Legacy business"], audienceCategories: ["Customer only"] };
    expect(getFreshCategoryDefaults()).toEqual(["Legacy business"]);
    intake.value = { formData: { "1.9": [] }, businessCategories: ["Legacy business"], audienceCategories: ["Customer only"] };
    expect(getFreshCategoryDefaults()).toEqual([]);
  });

  it("times out a stalled request and succeeds when retried", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(new Response(JSON.stringify({ categories: ["Technology"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useDatabaseCategories());

    await act(async () => { vi.advanceTimersByTime(DATABASE_CATEGORY_TIMEOUT_MS); });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/too long/i);

    act(() => result.current.retry());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current).toMatchObject({ status: "ready", categories: ["Technology"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a late response after the active project changes", async () => {
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(new Response(JSON.stringify({ categories: ["Current"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(() => useDatabaseCategories());

    context.projectId = "project-2";
    rerender();
    await waitFor(() => expect(result.current.categories).toEqual(["Current"]));
    resolveFirst(new Response(JSON.stringify({ categories: ["Stale"] }), { status: 200 }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.categories).toEqual(["Current"]);
  });
});
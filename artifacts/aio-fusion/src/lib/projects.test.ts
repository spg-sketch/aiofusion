import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./auth", () => ({
  getSession: vi.fn(() => null),
  getUsers: vi.fn(() => []),
}));

vi.mock("./projectSync", () => ({
  pushProjectMeta: vi.fn(async () => ({ ok: true })),
}));

import {
  CREATED_PROJECTS_KEY,
  CLIENT_LOGOS_KEY,
  loadStoredProjects,
  saveStoredProjects,
  loadClientLogos,
  saveClientLogos,
  deriveInitials,
  migrateStoredIntakeKeys,
  migrateLegacyIntakeToProject,
  createStoredProject,
} from "./projects";
import type { Client } from "../types";

const baseProject = (): Client => ({
  id: "p1",
  name: "Acme Corp",
  sector: "Tech",
  initials: "AC",
  color: "#C8497A",
  contentCount: 0,
  avgScore: 0,
  scoreTrend: 0,
  activePlans: 0,
  lastActive: "Today",
  recentActivity: "",
});

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// loadStoredProjects / saveStoredProjects
// ---------------------------------------------------------------------------
describe("loadStoredProjects / saveStoredProjects", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(loadStoredProjects()).toEqual([]);
  });

  it("round-trips a list of projects", () => {
    const list: Client[] = [baseProject(), { ...baseProject(), id: "p2", name: "Beta Ltd" }];
    saveStoredProjects(list);
    expect(loadStoredProjects()).toEqual(list);
  });

  it("uses the correct storage key", () => {
    saveStoredProjects([baseProject()]);
    expect(localStorage.getItem(CREATED_PROJECTS_KEY)).not.toBeNull();
  });

  it("returns an empty array when the stored value is malformed JSON", () => {
    localStorage.setItem(CREATED_PROJECTS_KEY, "{bad json{{");
    expect(loadStoredProjects()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadClientLogos / saveClientLogos
// ---------------------------------------------------------------------------
describe("loadClientLogos / saveClientLogos", () => {
  it("returns an empty object when nothing is stored", () => {
    expect(loadClientLogos()).toEqual({});
  });

  it("round-trips a logo map", () => {
    const map = { p1: "data:image/png;base64,abc", p2: "data:image/jpeg;base64,xyz" };
    saveClientLogos(map);
    expect(loadClientLogos()).toEqual(map);
  });

  it("uses the correct storage key", () => {
    saveClientLogos({ p1: "img" });
    expect(localStorage.getItem(CLIENT_LOGOS_KEY)).not.toBeNull();
  });

  it("calls window.alert when localStorage throws a QuotaExceededError", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        const err = new DOMException("QuotaExceededError", "QuotaExceededError");
        throw err;
      });

    saveClientLogos({ p1: "data:image/png;base64,verylarge" });

    expect(alertSpy).toHaveBeenCalledOnce();
    expect(alertSpy.mock.calls[0][0]).toMatch(/too large/i);

    alertSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("does not call window.alert on a successful save", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    saveClientLogos({ p1: "data:image/png;base64,small" });

    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// deriveInitials
// ---------------------------------------------------------------------------
describe("deriveInitials", () => {
  it("returns P for an empty string", () => {
    expect(deriveInitials("")).toBe("P");
  });

  it("returns P for a whitespace-only string", () => {
    expect(deriveInitials("   ")).toBe("P");
  });

  it("returns first two chars (uppercased) for a single-word name", () => {
    expect(deriveInitials("Acme")).toBe("AC");
  });

  it("returns single char uppercased for a single-letter word", () => {
    expect(deriveInitials("A")).toBe("A");
  });

  it("returns initials of first two words for a multi-word name", () => {
    expect(deriveInitials("Acme Corp")).toBe("AC");
    expect(deriveInitials("Red Bull Racing")).toBe("RB");
  });

  it("handles extra internal whitespace", () => {
    expect(deriveInitials("  Beta   Ltd  ")).toBe("BL");
  });
});

// ---------------------------------------------------------------------------
// migrateStoredIntakeKeys
// ---------------------------------------------------------------------------
describe("migrateStoredIntakeKeys", () => {
  function makeIntakeBlob(formData: Record<string, unknown>) {
    return JSON.stringify({ formData, duals: {}, dualLists: {}, optimisedFields: [] });
  }

  it("does nothing when there are no intake keys in storage", () => {
    localStorage.setItem("some.other.key", "data");
    expect(() => migrateStoredIntakeKeys()).not.toThrow();
    expect(localStorage.getItem("some.other.key")).toBe("data");
  });

  it("remaps field 1.11 → 3.2 and shifts 3.2→3.3, 3.3→3.4, 3.4→3.5", () => {
    const blob = makeIntakeBlob({ "1.11": "icp-value", "3.2": "old-3.2", "3.3": "old-3.3" });
    localStorage.setItem("aio.intake.v2", blob);

    migrateStoredIntakeKeys();

    const parsed = JSON.parse(localStorage.getItem("aio.intake.v2")!) as { formData: Record<string, unknown> };
    expect(parsed.formData["1.11"]).toBeUndefined();
    expect(parsed.formData["3.2"]).toBe("icp-value");
    expect(parsed.formData["3.3"]).toBe("old-3.2");
    expect(parsed.formData["3.4"]).toBe("old-3.3");
  });

  it("remaps field 1.12 → 3.3 and shifts subsequent section-3 fields", () => {
    const blob = makeIntakeBlob({ "1.12": "loc-value", "3.3": "old-3.3", "3.4": "old-3.4" });
    localStorage.setItem("aio.intake.v2::proj-abc", blob);

    migrateStoredIntakeKeys();

    const parsed = JSON.parse(localStorage.getItem("aio.intake.v2::proj-abc")!) as { formData: Record<string, unknown> };
    expect(parsed.formData["1.12"]).toBeUndefined();
    expect(parsed.formData["3.3"]).toBe("loc-value");
    expect(parsed.formData["3.4"]).toBe("old-3.3");
    expect(parsed.formData["3.5"]).toBe("old-3.4");
  });

  it("does not modify blobs that have neither trigger field", () => {
    const blob = makeIntakeBlob({ "4.1": "company-name", "2.1": "some value" });
    localStorage.setItem("aio.intake.v2", blob);
    const before = localStorage.getItem("aio.intake.v2");

    migrateStoredIntakeKeys();

    expect(localStorage.getItem("aio.intake.v2")).toBe(before);
  });

  it("remaps optimisedFields entries", () => {
    const blob = JSON.stringify({
      formData: { "1.11": "x" },
      duals: {},
      dualLists: {},
      optimisedFields: ["1.11", "2.1"],
    });
    localStorage.setItem("aio.intake.v2", blob);

    migrateStoredIntakeKeys();

    const parsed = JSON.parse(localStorage.getItem("aio.intake.v2")!) as { optimisedFields: string[] };
    expect(parsed.optimisedFields).toContain("3.2");
    expect(parsed.optimisedFields).not.toContain("1.11");
    expect(parsed.optimisedFields).toContain("2.1");
  });
});

// ---------------------------------------------------------------------------
// migrateLegacyIntakeToProject
// ---------------------------------------------------------------------------
describe("migrateLegacyIntakeToProject", () => {
  it("does nothing when a default project already exists", () => {
    saveStoredProjects([{ ...baseProject(), id: "default" }]);
    localStorage.setItem("aio.intake.v2", JSON.stringify({ formData: { "4.1": "Legacy Co" } }));

    migrateLegacyIntakeToProject();

    const projects = loadStoredProjects();
    expect(projects.filter((p) => p.id === "default")).toHaveLength(1);
  });

  it("does nothing when there is no legacy intake blob", () => {
    migrateLegacyIntakeToProject();
    expect(loadStoredProjects()).toEqual([]);
  });

  it("creates a default project from the legacy intake blob", () => {
    localStorage.setItem(
      "aio.intake.v2",
      JSON.stringify({ formData: { "4.1": "Acme Corp" } }),
    );

    migrateLegacyIntakeToProject();

    const projects = loadStoredProjects();
    expect(projects).toHaveLength(1);
    const p = projects[0];
    expect(p.id).toBe("default");
    expect(p.name).toBe("Acme Corp");
    expect(p.initials).toBe("AC");
  });

  it("falls back to 'New Project' when field 4.1 is missing from the blob", () => {
    localStorage.setItem("aio.intake.v2", JSON.stringify({ formData: {} }));

    migrateLegacyIntakeToProject();

    const projects = loadStoredProjects();
    expect(projects[0].name).toBe("New Project");
  });

  it("is idempotent — running twice still leaves exactly one default project", () => {
    localStorage.setItem(
      "aio.intake.v2",
      JSON.stringify({ formData: { "4.1": "Beta Ltd" } }),
    );

    migrateLegacyIntakeToProject();
    migrateLegacyIntakeToProject();

    expect(loadStoredProjects().filter((p) => p.id === "default")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createStoredProject
// ---------------------------------------------------------------------------
describe("createStoredProject", () => {
  it("prepends the new project to the stored list", () => {
    saveStoredProjects([baseProject()]);
    const created = createStoredProject("New Client");
    const stored = loadStoredProjects();
    expect(stored[0].id).toBe(created.id);
    expect(stored[1].id).toBe("p1");
  });

  it("falls back to 'New Project' for a blank name", () => {
    const p = createStoredProject("   ");
    expect(p.name).toBe("New Project");
  });

  it("derives initials from the provided name", () => {
    const p = createStoredProject("Delta Echo");
    expect(p.initials).toBe("DE");
  });
});

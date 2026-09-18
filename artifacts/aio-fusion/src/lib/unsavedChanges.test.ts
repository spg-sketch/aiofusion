// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clearEditorRecovery, loadEditorRecovery, saveEditorRecovery } from "./unsavedChanges";

describe("editor recovery storage", () => {
  afterEach(() => localStorage.clear());

  it("isolates snapshots by workspace, project and editor", () => {
    saveEditorRecovery("creator", "workspace-a", "project-a", null, "snapshot-a", { title: "A" });
    saveEditorRecovery("creator", "workspace-b", "project-a", null, "snapshot-b", { title: "B" });
    saveEditorRecovery("optimiser", "workspace-a", "project-a", null, "snapshot-c", { title: "C" });

    expect(loadEditorRecovery<{ title: string }>("creator", "workspace-a", "project-a")?.data.title).toBe("A");
    expect(loadEditorRecovery<{ title: string }>("creator", "workspace-b", "project-a")?.data.title).toBe("B");
    expect(loadEditorRecovery<{ title: string }>("optimiser", "workspace-a", "project-a")?.data.title).toBe("C");
    expect(loadEditorRecovery("creator", "workspace-a", "project-b")).toBeNull();
  });

  it("only clears the snapshot that a confirmed save persisted", () => {
    saveEditorRecovery("creator", "workspace-a", "project-a", "article-a", "older", { title: "Old" });
    saveEditorRecovery("creator", "workspace-a", "project-a", "article-a", "newer", { title: "New" });

    clearEditorRecovery("creator", "workspace-a", "project-a", "older");
    expect(loadEditorRecovery("creator", "workspace-a", "project-a")?.snapshot).toBe("newer");

    clearEditorRecovery("creator", "workspace-a", "project-a", "newer");
    expect(loadEditorRecovery("creator", "workspace-a", "project-a")).toBeNull();
  });
});
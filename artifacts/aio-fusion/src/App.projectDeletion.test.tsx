// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

type Project = {
  id: string;
  name: string;
  owner: string;
  initials: string;
  color: string;
};

type DeleteResult = { ok: boolean; error?: string };

type WorkspaceFixture = {
  username: string;
  projects: Project[];
};

const mocks = vi.hoisted(() => ({
  deleteRemoteProject: vi.fn<(id: string) => Promise<DeleteResult>>(),
  syncProjectsOnLoad: vi.fn<() => Promise<{ projects: Project[]; logos: Record<string, string> } | null | "unauthorized">>(),
  syncIntakeForProject: vi.fn(async () => false),
  pushProjectMeta: vi.fn(async () => ({ ok: true })),
  setKnownProjectIds: vi.fn<(ids: string[]) => void>(),
  assertActiveProjectConsistency: vi.fn<(ids: string[]) => void>(),
  workspace: {
    username: "admin-old",
    projects: [] as Project[],
  } as WorkspaceFixture,
}));

vi.mock("./lib/contentAi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/contentAi")>();
  return { ...actual, apiBase: () => "" };
});

vi.mock("./lib/projectSync", () => ({
  deleteRemoteProject: (id: string) => mocks.deleteRemoteProject(id),
  syncProjectsOnLoad: () => mocks.syncProjectsOnLoad(),
  syncIntakeForProject: () => mocks.syncIntakeForProject(),
  pushProjectMeta: () => mocks.pushProjectMeta(),
  setKnownProjectIds: (ids: string[]) => mocks.setKnownProjectIds(ids),
  assertActiveProjectConsistency: (ids: string[]) => mocks.assertActiveProjectConsistency(ids),
  markIntakeSaved: () => {},
  ensureDefaultIntakeMigrated: () => {},
  assertActiveProjectConsistencyFromCache: () => {},
}));

vi.mock("./pages/UsersAdminPage", () => ({
  UsersAdminPage: ({
    onBack,
    onDeleteProject,
  }: {
    onBack: () => void;
    onDeleteProject?: (id: string) => Promise<DeleteResult>;
  }) => {
    const [status, setStatus] = useState("");

    const deleteProject = async (id: string) => {
      const result = await onDeleteProject?.(id);
      setStatus(result?.ok ? `deleted ${id}` : result?.error ?? "delete failed");
    };

    return (
      <main data-testid="users-admin-page">
        <h1>Users admin test boundary</h1>
        <button type="button" onClick={onBack}>Leave users admin</button>
        <button type="button" onClick={() => void deleteProject("exact-target")}>
          Delete project exact-target
        </button>
        <button type="button" onClick={() => void deleteProject("exact-target-extra")}>
          Delete project exact-target-extra
        </button>
        <button type="button" onClick={() => void deleteProject("last-project")}>
          Delete project last-project
        </button>
        <button type="button" onClick={() => void deleteProject("old-project")}>
          Delete project old-project
        </button>
        {status && <output data-testid="delete-status">{status}</output>}
      </main>
    );
  },
}));

vi.mock("./pages/PlatformHomePage", () => ({
  PlatformHomePage: ({
    onLoginSuccess,
  }: {
    onLoginSuccess: (session: { username: string; role: "admin" }) => void;
  }) => (
    <main data-testid="platform-home-page">
      <h1>Platform home test boundary</h1>
      <button
        type="button"
        onClick={() => onLoginSuccess({ username: "admin-new", role: "admin" })}
      >
        Switch to new workspace
      </button>
    </main>
  ),
}));

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function project(id: string, owner = "admin-old"): Project {
  return { id, name: id, owner, initials: "P", color: "#123456" };
}

function storeProjects(projects: Project[]): void {
  localStorage.setItem("aio.projects.v1", JSON.stringify(projects));
}

function setSession(username: string): void {
  localStorage.setItem(
    "aio.auth.session.v3",
    JSON.stringify({ username, role: "admin" }),
  );
  localStorage.setItem(
    "aio.auth.users.v3",
    JSON.stringify([{ username, password: "", role: "admin", createdAt: 1 }]),
  );
}

function projectsForCurrentWorkspace(): Project[] {
  return mocks.workspace.projects;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  });
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = "";
    thresholds = [];
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
  document.elementFromPoint = () => null;
  Element.prototype.scrollTo = () => {};

  mocks.workspace.username = "admin-old";
  mocks.workspace.projects = [];
  mocks.deleteRemoteProject.mockReset();
  mocks.syncProjectsOnLoad.mockReset();
  mocks.syncIntakeForProject.mockClear();
  mocks.pushProjectMeta.mockClear();
  mocks.setKnownProjectIds.mockClear();
  mocks.assertActiveProjectConsistency.mockClear();
  mocks.assertActiveProjectConsistency.mockImplementation((ids) => {
    const active = localStorage.getItem("aio.activeProjectId");
    if (active && ids.length > 0 && !ids.includes(active)) {
      localStorage.removeItem("aio.activeProjectId");
    }
  });

  // Keep syncProjectsOnLoad a disposable local-cache-only server boundary.
  // It writes the fixture just as the real sync writes its merged snapshot,
  // while no test makes a real API request.
  mocks.syncProjectsOnLoad.mockImplementation(async () => {
    const projects = projectsForCurrentWorkspace();
    storeProjects(projects);
    return { projects, logos: {} };
  });

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform/me")) {
      return response({
        account: { username: mocks.workspace.username, role: "admin" },
        impersonating: null,
        setupComplete: true,
        hasPassword: true,
        emailVerified: true,
        masterOwner: false,
      });
    }
    if (url.includes("/api/platform/accounts")) {
      return response({
        accounts: [{ username: mocks.workspace.username, role: "admin" }],
      });
    }
    if (url.includes("/api/platform/status")) return response({ migrated: true });
    if (url.includes("/api/platform/my-invites")) return response({ invites: [] });
    // Content-store bootstrap is deliberately offline for this test. The App
    // still resolves its auth/session path, but no content API is contacted.
    return response({ error: "not used by this regression" }, 401);
  }));

  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/?account_section=agencies");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

async function renderAdminApp(projects: Project[]) {
  mocks.workspace.username = "admin-old";
  mocks.workspace.projects = projects;
  setSession("admin-old");
  storeProjects(projects);
  const { default: App } = await import("./App");
  render(<App />);
  await screen.findByTestId("users-admin-page");
}

describe("App project deletion wiring", () => {
  it("awaits a failed server delete and leaves the stored list and active navigation unchanged", async () => {
    const projects = [project("exact-target"), project("exact-target-extra")];
    await renderAdminApp(projects);
    localStorage.setItem("aio.activeProjectId", "exact-target");
    mocks.deleteRemoteProject.mockResolvedValue({
      ok: false,
      error: "The server refused this deletion.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete project exact-target" }));

    await waitFor(() => {
      expect(mocks.deleteRemoteProject).toHaveBeenCalledWith("exact-target");
      expect(screen.getByTestId("delete-status")).toHaveTextContent(
        "The server refused this deletion.",
      );
    });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual(projects);
    expect(localStorage.getItem("aio.activeProjectId")).toBe("exact-target");
    expect(screen.getByTestId("users-admin-page")).toBeInTheDocument();
    expect(mocks.setKnownProjectIds).toHaveBeenLastCalledWith(
      ["exact-target", "exact-target-extra"],
    );
  });

  it("removes only the exact ID, refreshes cached IDs, and clears active navigation when the last project is deleted", async () => {
    const projects = [
      project("exact-target"),
      project("exact-target-extra"),
      project("last-project"),
    ];
    await renderAdminApp(projects);
    localStorage.setItem("aio.activeProjectId", "exact-target");
    mocks.deleteRemoteProject.mockResolvedValue({ ok: true });

    fireEvent.click(screen.getByRole("button", { name: "Delete project exact-target" }));

    await waitFor(() => {
      expect(screen.getByTestId("delete-status")).toHaveTextContent("deleted exact-target");
    });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([
      projects[1],
      projects[2],
    ]);
    expect(localStorage.getItem("aio.activeProjectId")).toBe("");
    expect(mocks.setKnownProjectIds).toHaveBeenLastCalledWith([
      "exact-target-extra",
      "last-project",
    ]);

    localStorage.setItem("aio.activeProjectId", "last-project");
    fireEvent.click(screen.getByRole("button", { name: "Delete project last-project" }));

    await waitFor(() => {
      expect(screen.getByTestId("delete-status")).toHaveTextContent("deleted last-project");
    });
    expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual([
      projects[1],
    ]);
    expect(localStorage.getItem("aio.activeProjectId")).toBe("");

    // Delete the final remaining project to cover the empty-list navigation
    // guard as well as the exact-ID filter.
    fireEvent.click(screen.getByRole("button", { name: "Delete project exact-target-extra" }));
    await waitFor(() => {
      expect(screen.getByTestId("delete-status")).toHaveTextContent(
        "deleted exact-target-extra",
      );
    });
    expect(localStorage.getItem("aio.projects.v1")).toBe("[]");
    expect(localStorage.getItem("aio.activeProjectId")).toBe("");
    expect(mocks.setKnownProjectIds).toHaveBeenLastCalledWith([]);
  });

  it("does not let an old response mutate the new workspace after a session change", async () => {
    const oldProjects = [project("old-project", "admin-old")];
    const newProjects = [project("new-project", "admin-new")];
    await renderAdminApp(oldProjects);
    localStorage.setItem("aio.activeProjectId", "old-project");

    let resolveDelete!: (result: DeleteResult) => void;
    mocks.deleteRemoteProject.mockImplementation(
      () => new Promise<DeleteResult>((resolve) => { resolveDelete = resolve; }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete project old-project" }));
    await waitFor(() => {
      expect(mocks.deleteRemoteProject).toHaveBeenCalledWith("old-project");
    });

    fireEvent.click(screen.getByRole("button", { name: "Leave users admin" }));
    await screen.findByRole("button", { name: "Switch to new workspace" });
    mocks.workspace.username = "admin-new";
    mocks.workspace.projects = newProjects;
    fireEvent.click(screen.getByRole("button", { name: "Switch to new workspace" }));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual(newProjects);
      expect(mocks.setKnownProjectIds).toHaveBeenLastCalledWith(["new-project"]);
    });
    // The new workspace has its own active project after the authoritative
    // resync. The stale delete must not clear or replace it when it resolves.
    localStorage.setItem("aio.activeProjectId", "new-project");

    await act(async () => {
      resolveDelete({ ok: true });
    });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("aio.projects.v1")!)).toEqual(newProjects);
    });
    expect(localStorage.getItem("aio.activeProjectId")).toBe("new-project");
    expect(screen.queryByTestId("delete-status")).toBeNull();
  });
});
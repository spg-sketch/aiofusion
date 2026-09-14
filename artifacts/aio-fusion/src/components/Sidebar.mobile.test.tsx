// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Client } from "../types";

vi.mock("../LlmCheckPage", () => ({
  loadSavedAudits: () => [],
  authorityIndexFor: () => 0,
}));

vi.mock("../lib/diagnosticStore", () => ({
  loadSavedDiagnostics: () => [],
  loadSavedScored: () => [],
  persistSavedDiagnostics: vi.fn(),
  persistSavedScored: vi.fn(),
  contentGeoKey: (id: string) => `content-${id}`,
  techGeoKey: (id: string) => `tech-${id}`,
}));

vi.mock("../lib/auditSync", () => ({
  syncAuditsForProject: vi.fn(() => new Promise<never>(() => {})),
  syncDiagnosticsForProject: vi.fn(() => new Promise<never>(() => {})),
  syncContentGeoForProject: vi.fn(() => new Promise<never>(() => {})),
  syncTechGeoForProject: vi.fn(() => new Promise<never>(() => {})),
  deleteServerDiagnostic: vi.fn(async () => true),
  deleteServerContentGeo: vi.fn(async () => true),
  deleteServerTechGeo: vi.fn(async () => true),
}));

vi.mock("../lib/auth", () => ({
  getSession: () => null,
}));

const client: Client = {
  id: "mobile-sidebar-test",
  name: "Mobile Sidebar Test",
  sector: "Technology",
  initials: "MS",
  color: "#736EAE",
  contentCount: 0,
  avgScore: 0,
  scoreTrend: 0,
  activePlans: 0,
  lastActive: "",
  recentActivity: "",
};

function renderSidebar() {
  return render(
    <Sidebar
      currentPage="dashboard"
      onNavigate={vi.fn()}
      activeClient={client}
      onBackToClients={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("mobile authenticated sidebar drawer", () => {
  it("gives the opened drawer an accessible modal name and initial focus", () => {
    renderSidebar();

    const trigger = screen.getByRole("button", { name: "Open project navigation" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Project navigation" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "mobile-project-navigation-title");
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Project Hub" }),
    );
  });

  it("contains Tab and Shift+Tab within the drawer", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Open project navigation" }));

    const dialog = screen.getByRole("dialog", { name: "Project navigation" });
    const first = within(dialog).getByRole("button", { name: "Project Hub" });
    const last = within(dialog).getByRole("button", { name: /My account/i });

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape and returns focus to the exact opening trigger", () => {
    renderSidebar();
    const trigger = screen.getByRole("button", { name: "Open project navigation" });
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Project navigation" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the trigger when the backdrop closes the drawer", () => {
    renderSidebar();
    const trigger = screen.getByRole("button", { name: "Open project navigation" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Project navigation" });
    const drawerLayer = dialog.parentElement;
    expect(drawerLayer).not.toBeNull();
    fireEvent.click(drawerLayer!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});
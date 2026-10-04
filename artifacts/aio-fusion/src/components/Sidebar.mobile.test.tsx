// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar, navSections } from "./Sidebar";
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

describe("Content Management navigation", () => {
  it("explains unavailable features without a release-version reference", () => {
    const item = navSections[0].items[0];
    const originalLocked = item.locked;
    item.locked = true;
    try {
      const view = renderSidebar();
      expect(screen.getByTitle(`${item.label} is not available yet`)).toBeDisabled();
      expect(screen.getByText("Unavailable")).toBeTruthy();
      expect(view.container.textContent).not.toMatch(/\bv2\b/i);
    } finally {
      item.locked = originalLocked;
    }
  });
  it.each(["desktop", "mobile"])("keeps the requested order and planner destination selected on %s", (layout) => {
    const onNavigate = vi.fn();
    function NavigationHarness() {
      const [currentPage, setCurrentPage] = useState("dashboard");
      return (
        <Sidebar
          currentPage={currentPage}
          onNavigate={(page) => { onNavigate(page); setCurrentPage(page); }}
          activeClient={client}
          onBackToClients={vi.fn()}
        />
      );
    }
    render(<NavigationHarness />);

    function getNavigation() {
      if (layout === "mobile") {
        fireEvent.click(screen.getByRole("button", { name: "Open project navigation" }));
        return within(screen.getByRole("dialog", { name: "Project navigation" }))
          .getByRole("navigation", { name: "Project navigation" });
      }
      return screen.getByRole("navigation", { name: "Project navigation" });
    }

    const navigation = getNavigation();
    const section = within(navigation).getByText("Content Management").parentElement!.parentElement!;
    const buttons = within(section).getAllByRole("button");
    const expectedNames = [
      "Content Creator Generate pitches and articles",
      "Content Optimiser & Editor Optimise and edit drafts",
      "Comms Planner Plan and score the PR / marketing schedule",
      "Content Library Saved draft and final content",
    ];
    expect(buttons).toHaveLength(expectedNames.length);
    expectedNames.forEach((name, index) => expect(buttons[index]).toHaveAccessibleName(name));

    expect(buttons[2]).not.toHaveAttribute("aria-current");
    fireEvent.click(buttons[2]);
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("planner");
    if (layout === "mobile") {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
    const selectedNavigation = getNavigation();
    expect(within(selectedNavigation).getByRole("button", { current: "page" }))
      .toHaveAccessibleName(expectedNames[2]);
  });
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
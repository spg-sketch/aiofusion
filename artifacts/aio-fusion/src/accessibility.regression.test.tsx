// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivePage } from "./pages/ArchivePage";
import { PlannerPage } from "./pages/PlannerPage";
import AccountTypeSelectPage from "./pages/AccountTypeSelectPage";
import IntakePage from "./IntakeForm";
import { TeamSection } from "./pages/TeamSection";
import SeoAuditPage from "./SeoAuditPage";
import CountdownBanner from "./components/CountdownBanner";
import { GenerateFromUrlModal } from "./components/GenerateFromUrlModal";

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

function installRouteFetchStub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/platform/team")) {
        return jsonResponse({
          teamMode: "standard",
          members: [{
            userId: "accessibility-owner",
            email: "owner@example.test",
            name: "Accessibility owner",
            role: "owner",
            projectAccess: null,
            position: null,
            createdAt: "2026-01-01",
            isSelf: true,
          }],
          invites: [],
          seatLimit: 3,
          seatsUsed: 1,
        });
      }
      if (url.includes("/api/platform/my-invites")) return jsonResponse({ invites: [] });
      return jsonResponse({
        state: { step: "workspace_basics" },
        accountProfile: {},
        items: [],
        config: null,
        "tech-geo": [],
      });
    }),
  );
}

function expectNamedInteractiveControls(container: HTMLElement, routeName: string) {
  const interactive = container.querySelectorAll("button, a[href], [role='button']");
  for (const element of interactive) {
    expect(
      accessibleName(element),
      `${routeName} interactive controls need an accessible name: ${element.outerHTML}`,
    ).not.toBe("");
  }

  for (const element of container.querySelectorAll("input, select, textarea")) {
    if (element instanceof HTMLInputElement && element.type === "hidden") continue;
    expect(
      accessibleName(element),
      `${routeName} form controls need an accessible name: ${element.outerHTML}`,
    ).not.toBe("");
  }

  for (const status of container.querySelectorAll("[role='status'], [role='alert'], [aria-live]")) {
    expect(
      status.textContent?.trim(),
      `${routeName} live status regions should contain readable text`,
    ).not.toBe("");
  }

  for (const dialog of container.querySelectorAll("[role='dialog']")) {
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(accessibleName(dialog), `${routeName} dialogs need an accessible name`).not.toBe("");
  }
}

function expectNoPositiveTabStops(container: HTMLElement, routeName: string) {
  const positiveTabStops = [...container.querySelectorAll("[tabindex]")].filter(
    (element) => Number(element.getAttribute("tabindex")) > 0,
  );
  expect(positiveTabStops, `${routeName} must not reorder keyboard focus`).toHaveLength(0);
}

function expectAlternativeText(container: HTMLElement, routeName: string) {
  for (const image of container.querySelectorAll("img")) {
    expect(image, `${routeName} images need alternative text`).toHaveAttribute("alt");
  }
}

function expectAccessibleRouteShell(container: HTMLElement, routeName: string) {
  expect(container.querySelector("h1"), `${routeName} should expose a page heading`).not.toBeNull();
  expectNoPositiveTabStops(container, routeName);
  expectAlternativeText(container, routeName);
  expectNamedInteractiveControls(container, routeName);
}

const routeCases: Array<[string, () => ReactElement]> = [
  ["Set-Up", () => <IntakePage />],
  ["Archive", () => <ArchivePage onNavigate={vi.fn()} />],
  ["Planner", () => <PlannerPage onNavigate={vi.fn()} />],
  ["audit", () => <SeoAuditPage activeClient={{ id: "accessibility-test", name: "Accessibility test" }} />],
  ["account", () => <AccountTypeSelectPage onComplete={vi.fn()} onSignOut={vi.fn()} />],
];

function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  const referencedText = labelledBy
    ? labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
    : "";
  const id = element.getAttribute("id");
  const associatedLabel = id
    ? [...document.querySelectorAll("label")].find((label) => label.htmlFor === id)?.textContent ?? ""
    : "";
  const wrappingLabel = element.closest("label")?.textContent ?? "";

  return (
    element.getAttribute("aria-label") ||
    referencedText ||
    associatedLabel ||
    wrappingLabel ||
    element.getAttribute("title") ||
    element.textContent ||
    ""
  ).replace(/\s+/g, " ").trim();
}

/**
 * A deliberately small, dependency-free structural smoke check. This is not
 * an axe replacement: it catches regressions in route shells that are cheap
 * to detect in jsdom while visual and assistive-technology checks remain in
 * test/accessibility-manual-checklist.md.
 */
describe("authenticated route accessibility structure", () => {
  beforeEach(() => {
    installRouteFetchStub();
    if (!globalThis.ResizeObserver) {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }
    if (!globalThis.requestAnimationFrame) {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      );
      vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(routeCases)("keeps the %s route shell keyboard-addressable", async (_routeName, renderRoute) => {
    const { container } = render(renderRoute());
    await waitFor(() => expect(container.querySelector("h1")).not.toBeNull());
    expectAccessibleRouteShell(container, _routeName);
  });

  it("keeps the Team settings section's controls named and keyboard-addressable", async () => {
    const { container } = render(<TeamSection />);
    await waitFor(() => expect(container.querySelector("h2")).not.toBeNull());
    expectNoPositiveTabStops(container, "Team");
    expectAlternativeText(container, "Team");
    expectNamedInteractiveControls(container, "Team");
  });

  it("keeps rendered intake labels associated with existing controls", async () => {
    const { container } = render(<IntakePage />);
    await waitFor(() => expect(container.querySelector("h1")).not.toBeNull());

    for (const label of container.querySelectorAll("label[for]")) {
      const targetId = label.getAttribute("for");
      expect(targetId).not.toBeNull();
      expect(
        document.getElementById(targetId!),
        `Intake label target should exist: ${label.outerHTML}`,
      ).not.toBeNull();
    }

    const shortSummaryLabel = [...container.querySelectorAll("label[for]")].find(
      (label) => label.textContent?.match(/6-word summary/i),
    );
    expect(shortSummaryLabel).toHaveAttribute("for", "intake-control-1.2");
  });

  it("keeps generation and countdown announcements meaningful", async () => {
    let resolveFetch!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => pendingResponse));
    const { container } = render(
      <GenerateFromUrlModal onCancel={vi.fn()} onComplete={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/Website URL/), {
      target: { value: "https://example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => {
      const generationStatus = screen.getAllByRole("status").find(
        (status) => status.textContent?.includes("Generation started"),
      );
      expect(generationStatus).toBeDefined();
    });
    expect(container.querySelector('[role="status"]')).not.toHaveTextContent(/elapsed \d+ seconds/i);

    resolveFetch({
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ error: "Test request ended" }),
    } as unknown as Response);
    await waitFor(() => {
      const errorStatus = screen.getAllByRole("status").find(
        (status) => status.textContent?.includes("Generation error"),
      );
      expect(errorStatus).toBeDefined();
    });
    cleanup();
    const countdown = render(
      <CountdownBanner active durationSeconds={90} label="Preparing your report" />,
    );
    const liveRegion = countdown.container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveClass("sr-only");
    expect(liveRegion).toHaveTextContent(/Preparing your report started/i);
    expect(countdown.container.firstElementChild).not.toHaveAttribute("aria-live");
  });
});

describe("global accessibility CSS safeguards", () => {
  it("keeps strong keyboard focus and reduced-motion rules present", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/outline:\s*3px solid/);
    expect(css).toMatch(/outline-offset:\s*3px/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/animation-duration:\s*1ms/);
    expect(css).toMatch(/transition-duration:\s*1ms/);
    expect(css).toMatch(/scroll-behavior:\s*auto/);
  });
});
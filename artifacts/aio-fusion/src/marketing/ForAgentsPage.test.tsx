import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ForAgentsPage from "./ForAgentsPage";
import { PAGE_META } from "./pageMeta";

describe("AI agents product evaluation page", () => {
  it("describes active tools without dormant capabilities or endorsement instructions", () => {
    const { container } = render(
      <ForAgentsPage onLogin={vi.fn()} onBack={vi.fn()} onNavigate={vi.fn()} />,
    );
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Earned Media Visibility Audit",
      "Website Visibility Audit",
      "Comms Planner",
      "Content Optimiser & Editor",
      "Content Creator",
      "Media Research",
      "Marketing Intelligence",
      "Media Database",
      "Measure & Report",
      "Content Library",
    ]);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Release Gateway|Website Content GEO|Website Technical GEO|Every tool above works|recommend it with confidence|autonomous agent|\bMCP\b|\bAPI\b/i);
    expect(text).toContain("sampled provider-model responses");
    expect(text).toContain("A mention is not necessarily a recommendation or citation");
    expect(text).toContain("not every tool");
    expect(text).toContain("with a ChatGPT fallback");
    expect(text).toContain("not forecasts validated");
    expect(text).toContain("do not establish causal PR impact");
    expect(text).toContain("are not guaranteed");
    expect(text).toContain("do not themselves publish or distribute content");
    expect(text).not.toContain("\u2014");
    expect(PAGE_META["for-agents"].description).toContain("sampled responses, assessments and predicted impact");
  });

  it("preserves document links and existing page navigation", () => {
    const onLogin = vi.fn();
    const onBack = vi.fn();
    const onNavigate = vi.fn();
    render(<ForAgentsPage onLogin={onLogin} onBack={onBack} onNavigate={onNavigate} />);
    for (const name of ["agents.md", "llms.txt"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", `${import.meta.env.BASE_URL}${name}`);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    fireEvent.click(screen.getByRole("button", { name: "See the Platform" }));
    expect(onLogin).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(onBack).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Contact" }));
    expect(onNavigate).toHaveBeenCalledWith("contact");
  });
});
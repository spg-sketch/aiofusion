import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { GenerationProgress } from "../lib/contentAi";

describe("platform readability", () => {
  it("shows the active workspace and alternatives in a legible selector on a dark header", () => {
    render(
      <WorkspaceSwitcher
        workspaces={[
          { companyId: "one", companySlug: "natalie", companyName: "Natalie's team", companyRole: "client", membershipRole: "owner", isActive: true },
          { companyId: "two", companySlug: "admin", companyName: "Admin", companyRole: "admin", membershipRole: "owner", isActive: false },
        ]}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Switch workspace" }) as HTMLSelectElement;
    expect(select.value).toBe("one");
    expect(within(select).getAllByRole("option")).toHaveLength(2);
    expect(select.closest("div")?.className).toContain("bg-white");
    expect(select.style.color).toBe("rgb(10, 22, 40)");
  });

  it("keeps progress guidance and the current stage dark enough to read", () => {
    render(
      <GenerationProgress
        stages={["Drafting the article"]}
        chars={0}
        accent="#C8497A"
        textColor="#0a1628"
        durationSeconds={90}
      />,
    );

    expect(screen.getByText("Drafting the article…").style.color).toBe("rgb(10, 22, 40)");
    const guidance = screen.getByText(/keep this browser tab open/i);
    expect(guidance.className).toContain("text-[12px]");
    expect(guidance.style.color).toBe("rgb(51, 65, 85)");
  });
});